/**
 * Tính metric và xuất bảng — deliverable #8.
 *
 *   npm run eval:score -- --batch=<uuid>
 *
 * Chạy **sau** `eval:audit`: metric "số issue chặn" đọc từ `AuditorScore` (auditor độc lập),
 * không từ bảng `Issue` của 5 judge trong app — xem `src/verifier/metrics.ts`.
 *
 * Mọi phép tính nằm ở `src/verifier/metrics.ts` để có test (jest chỉ quét `rootDir: src`);
 * file này chỉ truy vấn rồi gọi.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleSimilarity } from '../src/common/text';
import { SourceClient, type NormalizedSource } from '../src/sources/source.client';
import { EVAL_DIR, boot, log } from './harness';
import { DEFAULT_THRESHOLDS } from '../src/verifier/thresholds';
import {
  auditorBlockingIssues,
  citationMetrics,
  claimedCitationMetrics,
  jsonValidityByGroup,
  meanStd,
  type CitationPair,
} from '../src/verifier/metrics';
import type { Arm } from '../src/generated/prisma/enums';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** `null` = **không đo được**, khác hẳn `0` = đo được và bằng không. */
type Row = {
  /** Ghi metric theo id của chính lượt chạy — **không** theo chỉ số mảng: lượt bị bỏ qua
   *  (project chưa có version nào) sẽ làm hai mảng lệch nhau và metric ghi sang lượt khác. */
  eval_run_id: string;
  arm: Arm;
  idea_id: string;
  citation_validity: number | null;
  fabrication_rate: number | null;
  unsupported_rate: number | null;
  unsupported_rate_v1: number | null;
  completeness_14: number;
  auditor_blocking_issues: number | null;
  own_judge_issues_open: number;
  json_validity: number | null;
  json_validity_generator: number | null;
  json_validity_judge: number | null;
  json_validity_entailment: number | null;
  l4_llm_ratio: number | null;
  rounds_run: number | null;
  decisions_applied: number | null;
  total_tokens: number;
  wall_ms: number;
};

const METRICS = [
  'citation_validity',
  'fabrication_rate',
  'unsupported_rate',
  'unsupported_rate_v1',
  'completeness_14',
  'auditor_blocking_issues',
  'own_judge_issues_open',
  'json_validity',
  'json_validity_generator',
  'json_validity_judge',
  'json_validity_entailment',
  'l4_llm_ratio',
  'rounds_run',
  'decisions_applied',
  'total_tokens',
  'wall_ms',
] as const;
type MetricKey = (typeof METRICS)[number];
type ArmSummary = Record<MetricKey, ReturnType<typeof meanStd>>;

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
  let auditedRuns = 0;

  for (const run of runs) {
    const versions = await s.prisma.specVersion.findMany({
      where: { project_id: run.project_id },
      orderBy: { version_no: 'asc' },
      select: { id: true, version_no: true },
    });
    if (versions.length === 0) continue;
    const firstVersion = versions[0];
    const lastVersion = versions[versions.length - 1];

    const sections = await s.spec.buildSections(lastVersion.id);
    const completeness = sections.filter((x) => x.present).length;

    // ── citation ─────────────────────────────────────────────────────────
    // Hai arm dùng hai đường đo vì **dữ liệu khác bản chất**, nhưng cả hai đều ra
    // `fabrication_rate` — con số so trực tiếp được. `unsupported_rate` chỉ có nghĩa khi
    // tồn tại cặp (khẳng định, abstract thật), nên B1 để `null`.
    const citation =
      run.arm === 'B1'
        ? claimedCitationMetrics(await resolveB1Citations(s, lastVersion.id))
        : citationMetrics(await pairsOf(s, lastVersion.id));

    // Δ theo vòng (ARCHITECTURE §6.7 metric #5): vòng sửa có làm spec sạch hơn không.
    const unsupportedV1 =
      run.arm === 'B1'
        ? null
        : citationMetrics(await pairsOf(s, firstVersion.id)).unsupported_rate;

    const auditorScores = await s.prisma.auditorScore.findMany({
      where: { eval_run_id: run.id },
      select: { severity_counts: true },
    });
    if (auditorScores.length > 0) auditedRuns += 1;

    /**
     * Metric phụ, tên nói rõ nó là gì: issue **của 5 judge trong app** còn để mở.
     *
     * Đếm trên **version cuối cùng đã từng được judge**, không phải version cuối cùng: với arm
     * có vòng sửa, version cuối do lần `apply` sau cùng sinh ra và chưa judge lần nào, nên
     * đếm ở đó luôn ra 0 — đúng ở những lượt tiêu hết vòng mà issue vẫn còn.
     */
    const lastJudged = await s.prisma.judgeRun.findFirst({
      where: { spec_version: { project_id: run.project_id } },
      orderBy: [{ spec_version: { version_no: 'desc' } }, { round: 'desc' }],
      select: { spec_version_id: true },
    });
    const ownIssues = lastJudged
      ? await s.prisma.issue.count({
          where: {
            judge_run: { spec_version_id: lastJudged.spec_version_id },
            severity: { in: ['CRITICAL', 'MAJOR'] },
            // Issue đã được xử (nhóm `RESOLVED`) không còn là "còn để mở".
            OR: [
              { issue_group_id: null },
              { issue_group: { status: 'OPEN' } },
            ],
          },
        })
      : 0;

    const calls = await s.prisma.llmCall.findMany({
      where: { project_id: run.project_id },
      select: { attempts: true, purpose: true },
    });
    const jsonValidity = jsonValidityByGroup(calls);

    /**
     * Cộng **mọi** lần chạy verifier của cả dự án, không chỉ lần cuối của version cuối.
     * Với arm có vòng sửa, những lần chạy lại là lần chỉ kiểm vài thẻ — lấy đúng lần cuối thì
     * mẫu số bé xíu và tỉ lệ thành vô nghĩa. Metric này là proxy **chi phí**, nên phải cộng dồn.
     */
    const vAgg = await s.prisma.verifierRun.aggregate({
      where: { spec_version: { project_id: run.project_id } },
      _sum: { units_total: true, units_l4: true },
    });
    const unitsTotal = vAgg._sum.units_total ?? 0;
    const l4Ratio =
      unitsTotal > 0 ? (vAgg._sum.units_l4 ?? 0) / unitsTotal : null;

    const repair = (run.config as { repair?: RepairConfig | null }).repair ?? null;

    rows.push({
      eval_run_id: run.id,
      arm: run.arm,
      idea_id: run.idea_id,
      citation_validity: citation.citation_validity,
      fabrication_rate: citation.fabrication_rate,
      unsupported_rate: citation.unsupported_rate,
      unsupported_rate_v1: unsupportedV1,
      completeness_14: completeness,
      auditor_blocking_issues: auditorBlockingIssues(auditorScores),
      own_judge_issues_open: ownIssues,
      json_validity: jsonValidity.all,
      json_validity_generator: jsonValidity.generator,
      json_validity_judge: jsonValidity.judge,
      json_validity_entailment: jsonValidity.entailment,
      l4_llm_ratio: l4Ratio,
      rounds_run: repair?.rounds_run ?? null,
      decisions_applied: repair?.decisions_applied ?? null,
      total_tokens: run.total_tokens,
      wall_ms: run.wall_ms,
    });
  }

  // `EvalMetric.value` là `Float` NOT NULL ⇒ metric không đo được thì **không ghi dòng**.
  // Ghi 0 vào đó là biến "không biết" thành "bằng không", và bảng sẽ nói sai.
  for (const row of rows) {
    /**
     * **Xoá trước khi ghi.** Chỉ `upsert` thôi thì dòng cũ sống sót: một metric bị đổi tên
     * (`issues_major_critical` → `auditor_blocking_issues`) hay chuyển thành `null`
     * (`unsupported_rate` của B1) vẫn nằm nguyên trong bảng với giá trị của bản scorer trước.
     * Đúng là cái lỗi "không biết bị đọc thành bằng không" mà việc bỏ qua `null` nhằm chặn.
     */
    await s.prisma.evalMetric.deleteMany({
      where: { eval_run_id: row.eval_run_id },
    });
    const rowsToWrite = METRICS.flatMap((key) => {
      const value = row[key];
      return value === null
        ? []
        : [{ eval_run_id: row.eval_run_id, key, value }];
    });
    if (rowsToWrite.length > 0) {
      await s.prisma.evalMetric.createMany({ data: rowsToWrite });
    }
  }

  if (auditedRuns === 0) {
    log(
      'CẢNH BÁO: chưa có AuditorScore nào cho batch này ⇒ `auditor_blocking_issues` rỗng.\n' +
        '          Chạy `npm run eval:audit -- --batch=<id>` rồi tính điểm lại.',
    );
  }

  const arms = [...new Set(rows.map((r) => r.arm))];
  const summary: Record<string, ArmSummary> = {};
  for (const arm of arms) {
    const subset = rows.filter((r) => r.arm === arm);
    summary[arm] = {} as ArmSummary;
    for (const m of METRICS) {
      summary[arm][m] = meanStd(subset.map((r) => r[m]));
    }
  }

  const outDir = join(EVAL_DIR, 'results');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, `${batchId}.json`),
    JSON.stringify(
      {
        batch_id: batchId,
        generated_at: new Date().toISOString(),
        thresholds: DEFAULT_THRESHOLDS,
        audited_runs: auditedRuns,
        rows,
        summary,
      },
      null,
      2,
    ),
  );

  // `n` vào thẳng CSV: `±0.000` không kèm `n` bị đọc thành "phương sai thấp" trong khi
  // sự thật là "chỉ có một mẫu".
  const csv = [
    [
      'metric',
      ...arms.map((a) => `${a}_mean`),
      ...arms.map((a) => `${a}_std`),
      ...arms.map((a) => `${a}_n`),
    ].join(','),
    ...METRICS.map((m) =>
      [
        m,
        ...arms.map((a) => fmt(summary[a][m].mean, summary[a][m].n)),
        ...arms.map((a) => fmt(summary[a][m].std, summary[a][m].n)),
        ...arms.map((a) => String(summary[a][m].n)),
      ].join(','),
    ),
  ].join('\n');
  writeFileSync(join(outDir, `${batchId}-summary.csv`), csv);

  log(`\nBảng tổng hợp (mean ± std, n theo arm):`);
  for (const m of METRICS) {
    const cells = arms
      .map((a) => {
        const cell = summary[a][m];
        return cell.n === 0
          ? `${a}=n/a`
          : `${a}=${cell.mean.toFixed(3)}±${cell.std.toFixed(3)}(n=${cell.n})`;
      })
      .join('  ');
    log(`  ${m.padEnd(24)} ${cells}`);
  }
  log(`\nĐã ghi: eval/results/${batchId}.json và ${batchId}-summary.csv`);

  await s.app.close();
}

type RepairConfig = { rounds_run?: number; decisions_applied?: number };

function fmt(value: number, n: number): string {
  return n === 0 ? '' : value.toFixed(4);
}

async function pairsOf(
  s: Awaited<ReturnType<typeof boot>>,
  specVersionId: string,
): Promise<CitationPair[]> {
  const pairs = await s.prisma.cardSource.findMany({
    where: { card: { spec_version_id: specVersionId } },
    select: { support_label: true, flags: true },
  });
  return pairs.map((p) => ({
    support_label: p.support_label,
    flags: ((p.flags as string[] | null) ?? []),
  }));
}

/**
 * Trích dẫn của B1 nằm ở thẻ `EVIDENCE` mang `payload.from_model_memory`. Đi tra từng tiêu đề
 * ở provider thật; tỉ lệ tra ra được **chính là** `citation_validity` của arm này.
 */
async function resolveB1Citations(
  s: Awaited<ReturnType<typeof boot>>,
  specVersionId: string,
): Promise<{ claimed: number; resolved: number }> {
  const claimed = await s.prisma.card.findMany({
    where: { spec_version_id: specVersionId, type: 'EVIDENCE' },
    select: { title: true, payload: true },
  });
  const memoryCites = claimed.filter(
    (c) => (c.payload as { from_model_memory?: boolean } | null)?.from_model_memory,
  );

  let resolved = 0;
  for (const c of memoryCites) {
    if (await resolveClaimedTitle(s, c.title)) resolved += 1;
  }
  return { claimed: memoryCites.length, resolved };
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

void main();
