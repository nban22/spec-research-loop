/**
 * Báo cáo **chi phí** của một batch ablation — phần làn C đóng góp vào deliverable #8.
 *
 *   npx tsx eval/cost-report.ts --batch=<uuid> [--pricing=eval/pricing.json]
 *
 * **Chạy SAU `eval/score.ts`.** Cùng mô típ với `score.ts` phải chạy sau `audit.ts`, và ở đây có
 * một lý do cụ thể hơn: script này đọc `eval/results/<batch>.json` do `score.ts` sinh ra để lấy
 * **đúng tập lượt mà score.ts đã tính**. `score.ts` bỏ qua lượt không có `SpecVersion` nào; nếu
 * file này tự lọc kiểu khác thì hai báo cáo sẽ nói hai `n` khác nhau cho cùng một batch, và người
 * đọc sẽ thấy trước tác giả.
 *
 * ## Hai cái bẫy đã tránh, ghi ra để đừng ai "sửa lại cho gọn"
 *
 * 1. **`LlmCall` phải join theo `project_id`, KHÔNG theo `eval_run_id`.** Nghe thì `eval_run_id`
 *    tự nhiên hơn, nhưng `harness.runArm` không truyền nó xuống — `EvalRun` được tạo *sau* khi
 *    `runArm` trả về. Chỉ auditor (`audit.ts`) mới gắn `eval_run_id`. Join nhầm là ra một bảng
 *    chỉ chứa chi phí auditor, trông hoàn toàn hợp lý, và sai hoàn toàn.
 * 2. **Kiểm chéo với `EvalRun.total_tokens`.** Con số đó đã được `run-eval.ts` cộng sẵn theo
 *    `project_id`. Tổng token của script này lệch nó nghĩa là join sai — in cảnh báo ngay thay vì
 *    để cái sai đi vào báo cáo.
 *
 * ## Vì sao hai kịch bản giá
 *
 * Đơn giá DeepSeek trong repo chưa có nguồn (xem `eval/pricing.json`), và không có bằng chứng nào
 * cho biết token ăn cache rẻ hơn bao nhiêu. Nên báo **cả hai**: kịch bản "một giá phẳng" (cận
 * trên) và "cache hit bằng 1/10" (cận dưới). Nếu kết luận **không đổi dấu** giữa hai kịch bản thì
 * nó vững bất kể đơn giá thật là gì; nếu đổi, đó chính là giới hạn của báo cáo và phải nói ra.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  costByArm,
  costShare,
  pairedDiff,
  type CallRow,
  type PriceTable,
} from '../src/analytics/eval-cost';
import type { LlmPurpose } from '../src/generated/prisma/enums';
import { EVAL_DIR, boot, log } from './harness';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/**
 * `LlmPurpose` → bước người dùng nhìn thấy. **Chép** từ `analytics.service.ts:21-34` chứ không
 * import: hàm ở đó là `private` của một service có DI, kéo cả service vào script eval để lấy một
 * bảng tra là đắt hơn nhiều so với 12 dòng này. Sửa bên kia thì sửa cả bên này.
 */
const PURPOSE_STEP: Record<LlmPurpose, string> = {
  PARAPHRASE: 'B1 · Diễn giải & phân rã',
  DECOMPOSE: 'B1 · Diễn giải & phân rã',
  RELATED_WORK: 'B2 · Nghiên cứu liên quan & gap',
  GAP: 'B2 · Nghiên cứu liên quan & gap',
  CLAIM: 'B3 · Contribution & thí nghiệm',
  EXPERIMENT: 'B3 · Contribution & thí nghiệm',
  JUDGE: 'B4 · Judge & sửa spec',
  OPTIONS: 'B4 · Judge & sửa spec',
  ENTAILMENT: 'B5 · Kiểm chứng cứ',
  AUDITOR: 'Ngoài quy trình · eval',
  B1_SINGLE_SHOT: 'Ngoài quy trình · eval',
};

/** Ba bậc của ablation. Đặt tên **mô tả đúng cái đã đổi**, không rút gọn thành "giá của X". */
const LADDER: { from: string; to: string; what: string }[] = [
  {
    from: 'B1',
    to: 'B2',
    what: 'single-shot flash → pipeline pro có retrieval (đổi CẢ model tier, reasoning effort, số lời gọi)',
  },
  { from: 'B2', to: 'SYS', what: 'thêm vòng judge và vòng sửa' },
  { from: 'SYS_NO_VERIFY', to: 'SYS', what: 'bật verifier gate' },
];

function withCachedDiscount(prices: PriceTable, factor: number): PriceTable {
  const out = {} as PriceTable;
  for (const [model, p] of Object.entries(prices)) {
    if (model.startsWith('_')) continue;
    out[model] = { ...p, cached_input: p.input * factor };
  }
  return out;
}

async function main() {
  const batchId = arg('batch');
  if (!batchId) throw new Error('cần --batch=<uuid>');

  const scored = join(EVAL_DIR, 'results', `${batchId}.json`);
  if (!existsSync(scored)) {
    throw new Error(
      `Chưa có ${batchId}.json. Chạy \`npx tsx eval/score.ts --batch=${batchId}\` trước — ` +
        'file này lấy đúng tập lượt mà score.ts đã tính, để hai báo cáo không nói hai n khác nhau.',
    );
  }
  const scoredRows = (
    JSON.parse(readFileSync(scored, 'utf8')) as {
      rows: { eval_run_id: string; arm: string; idea_id: string }[];
    }
  ).rows;
  const keep = new Set(scoredRows.map((r) => r.eval_run_id));

  const pricingPath = arg('pricing', join(EVAL_DIR, 'pricing.json'));
  const pricing = JSON.parse(readFileSync(pricingPath, 'utf8')) as PriceTable;

  const s = await boot();
  const evalRuns = await s.prisma.evalRun.findMany({
    where: { batch_id: batchId },
    select: { id: true, arm: true, idea_id: true, project_id: true, total_tokens: true },
    orderBy: [{ idea_id: 'asc' }, { arm: 'asc' }],
  });
  const runs = evalRuns.filter((r) => keep.has(r.id));
  if (runs.length === 0) throw new Error(`batch ${batchId} không có lượt nào đã được score.ts tính`);

  log(`batch=${batchId} · ${runs.length}/${evalRuns.length} lượt (theo tập của score.ts)`);

  const withCalls: { arm: string; idea_id: string; calls: CallRow[] }[] = [];
  let drift = 0;

  for (const run of runs) {
    // Join theo `project_id` — xem bẫy #1 ở đầu file.
    const rows = await s.prisma.llmCall.findMany({
      where: { project_id: run.project_id },
      select: {
        model: true,
        purpose: true,
        prompt_id: true,
        prompt_tokens: true,
        completion_tokens: true,
        cache_hit_tokens: true,
        cache_miss_tokens: true,
        latency_ms: true,
        attempts: true,
        ok: true,
      },
    });

    const calls: CallRow[] = rows.map((r) => ({
      ...r,
      step: PURPOSE_STEP[r.purpose] ?? String(r.purpose),
      purpose: String(r.purpose),
    }));

    const tokens = calls.reduce((n, c) => n + c.prompt_tokens + c.completion_tokens, 0);
    if (run.total_tokens > 0 && Math.abs(tokens - run.total_tokens) / run.total_tokens > 0.001) {
      drift += 1;
      log(
        `   ⚠ ${run.idea_id}/${run.arm}: token lệch — script đếm ${tokens}, EvalRun ghi ${run.total_tokens}`,
      );
    }

    withCalls.push({ arm: run.arm, idea_id: run.idea_id, calls });
  }

  if (drift > 0) {
    log(`⚠ ${drift} lượt lệch token. Nghi join sai — KHÔNG dùng số này cho báo cáo khi chưa tra ra.`);
  }

  const scenarios = {
    flat: pricing,
    cached_tenth: withCachedDiscount(pricing, 0.1),
  };

  const report = {
    batch_id: batchId,
    generated_at: new Date().toISOString(),
    n_runs: runs.length,
    token_drift_runs: drift,
    pricing_source: pricingPath,
    pricing_used: pricing,
    scenarios: Object.fromEntries(
      Object.entries(scenarios).map(([name, prices]) => [
        name,
        {
          by_arm: costByArm(withCalls, prices),
          cost_share_by_step: costShare(
            withCalls.flatMap((r) => r.calls),
            'step',
            prices,
          ),
          cost_share_by_prompt: costShare(
            withCalls.flatMap((r) => r.calls),
            'prompt_id',
            prices,
          ).slice(0, 8),
          ladder: LADDER.map((step) => ({
            ...step,
            ...pairedDiff(withCalls, step.from, step.to, prices),
          })),
        },
      ]),
    ),
  };

  const outDir = join(EVAL_DIR, 'results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${batchId}-cost.json`), JSON.stringify(report, null, 2));

  const flat = report.scenarios.flat;
  const csv = [
    'arm,n,usd_total_median,usd_total_p25,usd_total_p75,usd_system_median,tokens_median,calls_median,cache_hit_ratio,retry_ratio,failed_call_ratio',
    ...flat.by_arm.map((a) =>
      [
        a.arm,
        a.n,
        a.usd_total.median.toFixed(4),
        a.usd_total.p25.toFixed(4),
        a.usd_total.p75.toFixed(4),
        a.usd_system.median.toFixed(4),
        a.tokens.median.toFixed(0),
        a.calls.median.toFixed(0),
        a.cache_hit_ratio?.toFixed(4) ?? '',
        a.retry_ratio?.toFixed(4) ?? '',
        a.failed_call_ratio?.toFixed(4) ?? '',
      ].join(','),
    ),
  ].join('\n');
  writeFileSync(join(outDir, `${batchId}-cost-summary.csv`), csv);

  log('\nTỉ trọng chi phí theo bước (kịch bản giá phẳng):');
  for (const row of flat.cost_share_by_step) {
    log(`  ${(row.share * 100).toFixed(1).padStart(5)}%  ${row.key}  ($${row.usd.toFixed(4)})`);
  }

  log('\nChi phí biên theo cặp ý tưởng:');
  for (const step of flat.ladder) {
    const ci = step.ci95 ? `[${step.ci95[0].toFixed(4)}, ${step.ci95[1].toFixed(4)}]` : 'không đủ cặp';
    log(`  ${step.from}→${step.to}  n=${step.n}  median $${step.median_diff_usd.toFixed(4)}  CI95 ${ci}  cùng dấu ${step.same_sign}/${step.n}`);
    log(`     đã đổi: ${step.what}`);
  }

  log(`\nĐã ghi: eval/results/${batchId}-cost.json và ${batchId}-cost-summary.csv`);
  await s.app.close();
}

void main();
