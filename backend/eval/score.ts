/**
 * Tính metric và xuất bảng — deliverable #8.
 *
 *   npx tsx eval/score.ts --batch=<uuid>
 *
 * Bốn metric chính (kim-chỉ-nam §7.2) + metric phụ. Kết quả ghi vào `EvalMetric` và
 * `eval/results/`, và `results/` được **commit vào git** để không phải chạy lại batch
 * chỉ để lấy số.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleSimilarity } from '../src/common/text';
import { SourceClient, type NormalizedSource } from '../src/sources/source.client';
import { EVAL_DIR, boot, log } from './harness';
import { DEFAULT_THRESHOLDS } from '../src/verifier/thresholds';
import type { Arm } from '../src/generated/prisma/enums';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

type Row = {
  arm: Arm;
  idea_id: string;
  citation_validity: number;
  unsupported_rate: number;
  completeness_14: number;
  issues_major_critical: number;
  json_validity: number;
  l4_llm_ratio: number;
  total_tokens: number;
  wall_ms: number;
};

async function main() {
  const batchId = arg('batch');
  if (!batchId) throw new Error('cần --batch=<uuid>');

  const s = await boot();

  const runs = await s.prisma.evalRun.findMany({
    where: { batch_id: batchId },
    orderBy: [{ idea_id: 'asc' }, { arm: 'asc' }],
  });
  if (runs.length === 0) throw new Error(`batch ${batchId} không có lượt nào`);

  /**
   * **Kiểm tra rẻ nhất và đắt giá nhất của cả phần eval**: từ chối tổng hợp nếu trong cùng batch
   * có hai `prompt_hash` khác nhau cho cùng một `prompt_id`. Prompt bị sửa giữa lúc batch đang
   * chạy là loại lỗi **không có gì báo** — nửa đầu và nửa sau dùng hai bản prompt khác nhau,
   * và con số vẫn được báo cáo như thể đồng nhất (C5 · F.7 #2).
   */
  const seen = new Map<string, Set<string>>();
  for (const r of runs) {
    const hashes = (r.config as { prompt_hashes?: Record<string, string> }).prompt_hashes ?? {};
    for (const [id, h] of Object.entries(hashes)) {
      if (!seen.has(id)) seen.set(id, new Set());
      seen.get(id)!.add(h);
    }
  }
  const drifted = [...seen.entries()].filter(([, hs]) => hs.size > 1);
  if (drifted.length > 0) {
    log('TỪ CHỐI TỔNG HỢP — prompt đã bị sửa giữa batch:');
    for (const [id, hs] of drifted) log(`  ${id}: ${hs.size} bản khác nhau`);
    log('Chạy lại batch với prompt cố định rồi hãy tổng hợp.');
    await s.app.close();
    process.exit(1);
  }

  const rows: Row[] = [];

  for (const run of runs) {
    const version = await s.prisma.specVersion.findFirst({
      where: { project_id: run.project_id },
      orderBy: { version_no: 'desc' },
    });
    if (!version) continue;

    const sections = await s.spec.buildSections(version.id);
    const completeness = sections.filter((x) => x.present).length;

    // ── citation validity ────────────────────────────────────────────────
    // Cùng một định nghĩa cho mọi arm: *tỉ lệ trích dẫn tra ra được ở một provider thật*.
    // B2/SYS: nguồn vốn đã từ API nên phép đo là nhãn L0 (`SOURCE_NOT_FOUND`).
    // B1: trích dẫn đến từ trí nhớ của model ⇒ phải đi tra thật, và đó chính là chỗ chênh lệch.
    let citationValidity: number;
    let unsupportedRate: number;

    const pairs = await s.prisma.cardSource.findMany({
      where: { card: { spec_version_id: version.id } },
      select: { support_label: true, flags: true },
    });

    if (run.arm === 'B1') {
      const claimed = await s.prisma.card.findMany({
        where: { spec_version_id: version.id, type: 'EVIDENCE' },
        select: { title: true, payload: true },
      });
      const memoryCites = claimed.filter(
        (c) => (c.payload as { from_model_memory?: boolean } | null)?.from_model_memory,
      );
      let resolved = 0;
      for (const c of memoryCites) {
        const found = await resolveClaimedTitle(s, c.title);
        if (found) resolved++;
      }
      citationValidity = memoryCites.length === 0 ? 0 : resolved / memoryCites.length;
      // B1 không gắn nguồn thật vào claim ⇒ mọi trích dẫn không tra ra được là không có bằng chứng.
      unsupportedRate = memoryCites.length === 0 ? 1 : 1 - resolved / memoryCites.length;
    } else {
      const total = pairs.length;
      const l0fail = pairs.filter((p) =>
        ((p.flags as string[] | null) ?? []).includes('SOURCE_NOT_FOUND'),
      ).length;
      citationValidity = total === 0 ? 0 : (total - l0fail) / total;
      unsupportedRate =
        total === 0
          ? 1
          : pairs.filter((p) => p.support_label === 'UNSUPPORTED').length / total;
    }

    const issues = await s.prisma.issue.count({
      where: {
        judge_run: { spec_version_id: version.id },
        severity: { in: ['CRITICAL', 'MAJOR'] },
      },
    });

    const calls = await s.prisma.llmCall.findMany({
      where: { project_id: run.project_id },
      select: { attempts: true, purpose: true },
    });
    const jsonValidity =
      calls.length === 0 ? 1 : calls.filter((c) => c.attempts === 1).length / calls.length;

    const vrun = await s.prisma.verifierRun.findFirst({
      where: { spec_version_id: version.id },
      orderBy: { created_at: 'desc' },
    });
    const l4Ratio = vrun && vrun.units_total > 0 ? vrun.units_l4 / vrun.units_total : 0;

    const row: Row = {
      arm: run.arm,
      idea_id: run.idea_id,
      citation_validity: citationValidity,
      unsupported_rate: unsupportedRate,
      completeness_14: completeness,
      issues_major_critical: issues,
      json_validity: jsonValidity,
      l4_llm_ratio: l4Ratio,
      total_tokens: run.total_tokens,
      wall_ms: run.wall_ms,
    };
    rows.push(row);

    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== 'number') continue;
      await s.prisma.evalMetric.upsert({
        where: { eval_run_id_key: { eval_run_id: run.id, key } },
        create: { eval_run_id: run.id, key, value },
        update: { value },
      });
    }
  }

  // ── tổng hợp mean ± std theo arm ──────────────────────────────────────
  const METRICS = [
    'citation_validity',
    'unsupported_rate',
    'completeness_14',
    'issues_major_critical',
    'json_validity',
    'l4_llm_ratio',
    'total_tokens',
    'wall_ms',
  ] as const;

  const arms = [...new Set(rows.map((r) => r.arm))];
  const summary: Record<string, Record<string, { mean: number; std: number; n: number }>> = {};
  for (const arm of arms) {
    const subset = rows.filter((r) => r.arm === arm);
    summary[arm] = {};
    for (const m of METRICS) {
      const values = subset.map((r) => r[m]);
      summary[arm][m] = { mean: mean(values), std: std(values), n: values.length };
    }
  }

  const outDir = join(EVAL_DIR, 'results');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, `${batchId}.json`),
    JSON.stringify(
      { batch_id: batchId, generated_at: new Date().toISOString(), thresholds: DEFAULT_THRESHOLDS, rows, summary },
      null,
      2,
    ),
  );

  const csv = [
    ['metric', ...arms.map((a) => `${a}_mean`), ...arms.map((a) => `${a}_std`)].join(','),
    ...METRICS.map((m) =>
      [
        m,
        ...arms.map((a) => summary[a][m].mean.toFixed(4)),
        ...arms.map((a) => summary[a][m].std.toFixed(4)),
      ].join(','),
    ),
  ].join('\n');
  writeFileSync(join(outDir, `${batchId}-summary.csv`), csv);

  log(`\nBảng tổng hợp (mean ± std, n theo arm):`);
  for (const m of METRICS) {
    const cells = arms
      .map((a) => `${a}=${summary[a][m].mean.toFixed(3)}±${summary[a][m].std.toFixed(3)}`)
      .join('  ');
    log(`  ${m.padEnd(22)} ${cells}`);
  }
  log(`\nĐã ghi: eval/results/${batchId}.json và ${batchId}-summary.csv`);

  await s.app.close();
}

/**
 * Tra một trích dẫn do model nhớ ra xem có paper thật nào khớp không.
 * Dùng **cùng ngưỡng title** với tầng L0 của verifier (`title_match`) và cùng hàm so title —
 * một hàm, nhiều chỗ gọi, một hành vi.
 */
async function resolveClaimedTitle(
  s: Awaited<ReturnType<typeof boot>>,
  title: string,
): Promise<boolean> {
  const client = s.app.get(SourceClient);
  const s2 = await client.searchSemanticScholar(title, 3);
  let candidates: NormalizedSource[] = s2.ok ? s2.sources : [];
  if (candidates.length === 0) {
    const oa = await client.searchOpenAlex(title, 3);
    candidates = oa.ok ? oa.sources : [];
  }
  return candidates.some(
    (c) => titleSimilarity(c.title, title) >= DEFAULT_THRESHOLDS.title_match,
  );
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

void main();
