/**
 * Ablation của làn A (#6) — ba cấu hình trên cùng một tập ý tưởng.
 *
 * §8 ràng buộc: *"Cải tiến này giải quyết vấn đề gì, được kiểm nghiệm như thế nào và kết quả có
 * tốt hơn baseline hay không?"*. Không có bảng số thì mọi thứ làn A làm chỉ là lời kể.
 *
 *   npm run eval:build && node dist-eval/eval/ablation-evidence.js --batch=<uuid> [--limit=3] [--resume]
 *
 * **Lệch issue có chủ ý.** #6 nói dùng `--batch=<uuid>` và để `UNIQUE(batch_id, arm, idea_id)` lo
 * phần chống trùng. Không làm được: `enum Arm` chỉ có `B1 B2 SYS SYS_NO_VERIFY`, và luật chung 2
 * cấm thêm giá trị vào enum đang có — nên ba cấu hình của làn A **không có tên arm hợp lệ** để ghi
 * vào `EvalRun`. Script vì thế giữ kết quả trong `eval/results/<batch>-evidence.json` và tự chống
 * trùng bằng cách đọc lại chính file đó khi `--resume`.
 *
 * Ba cấu hình chạy **xen kẽ theo ý tưởng**, không tuần tự theo cấu hình. Luật này copy từ
 * `run-eval.ts` và có lý do: chạy tuần tự thì cấu hình sau hưởng lợi vì `Source` của ý tưởng đó
 * đã nằm sẵn trong DB từ lượt trước.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConflictService } from '../src/conflict/conflict.service';
import { CredibilityService } from '../src/sources/credibility.service';
import { HumanCheckService } from '../src/verifier/human-check.service';
import {
  conflictDetected,
  evidencePrecisionHuman,
  fullTextHitRate,
} from '../src/verifier/metrics';
import { answerPending, boot, ensureEvalUser, type Services } from './harness';

const RESULTS_DIR = resolve(process.cwd(), 'eval', 'results');

type ArmKey = 'abstract' | 'credibility' | 'fulltext';

type ArmFlags = {
  source_credibility: boolean;
  evidence_fulltext: boolean;
  conflict_detector: boolean;
};

const ARMS: { key: ArmKey; label: string; flags: ArmFlags }[] = [
  {
    key: 'abstract',
    label: 'abstract (như MVP)',
    flags: {
      source_credibility: false,
      evidence_fulltext: false,
      conflict_detector: false,
    },
  },
  {
    key: 'credibility',
    label: 'abstract + chấm tin cậy',
    flags: {
      source_credibility: true,
      evidence_fulltext: false,
      conflict_detector: false,
    },
  },
  {
    key: 'fulltext',
    label: 'toàn văn đầy đủ',
    flags: {
      source_credibility: true,
      evidence_fulltext: true,
      conflict_detector: true,
    },
  },
];

type Row = {
  arm: ArmKey;
  idea_id: string;
  project_id: string;
  /** Khoá cũ, tính lại ở đây để ba dòng so được với nhau. */
  unsupported_rate: number | null;
  fabrication_rate: number | null;
  l4_llm_ratio: number | null;
  /** Bốn khoá mới của #6. */
  fulltext_hit_rate: number | null;
  conflict_detected: number;
  low_credibility_claim_rate: number | null;
  evidence_precision_human: number | null;
  wall_ms: number;
};

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Xoay vòng thứ tự arm theo chỉ số ý tưởng — không arm nào luôn chạy cuối. */
function orderFor(index: number): typeof ARMS {
  return ARMS.map((_, k) => ARMS[(k + index) % ARMS.length]);
}

async function measure(
  s: Services,
  projectId: string,
): Promise<Omit<Row, 'arm' | 'idea_id' | 'project_id' | 'wall_ms'>> {
  const credibility = s.app.get(CredibilityService);
  const conflict = s.app.get(ConflictService);
  const humanCheck = s.app.get(HumanCheckService);

  const project = await s.prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { current_spec_version_id: true },
  });
  const versionId = project.current_spec_version_id;
  if (!versionId) {
    throw new Error(`Dự án ${projectId} chưa có phiên bản spec nào.`);
  }

  const pairs = await s.prisma.cardSource.findMany({
    where: { card: { spec_version_id: versionId } },
    select: { support_label: true, flags: true },
  });
  const real = pairs.filter(
    (p) =>
      !(Array.isArray(p.flags) ? (p.flags as string[]) : []).includes(
        'SOURCE_NOT_FOUND',
      ),
  );
  const notFound = pairs.length - real.length;

  const runs = await s.prisma.verifierRun.aggregate({
    where: { spec_version_id: versionId },
    _sum: { units_total: true, units_l4: true },
  });
  const unitsTotal = runs._sum.units_total ?? 0;

  const sources = await s.prisma.source.findMany({
    where: { project_id: projectId },
    select: { id: true },
  });
  const ft = await s.prisma.sourceFullText.findMany({
    where: { source_id: { in: sources.map((x) => x.id) } },
    select: { status: true },
  });

  const checks = await s.prisma.humanCheck.findMany({
    where: {
      card_source_id: {
        in: (
          await s.prisma.cardSource.findMany({
            where: { card: { spec_version_id: versionId } },
            select: { id: true },
          })
        ).map((x) => x.id),
      },
    },
    select: { match: true },
  });

  return {
    unsupported_rate:
      real.length === 0
        ? null
        : real.filter((p) => p.support_label === 'UNSUPPORTED').length /
          real.length,
    fabrication_rate: pairs.length === 0 ? null : notFound / pairs.length,
    l4_llm_ratio:
      unitsTotal === 0 ? null : (runs._sum.units_l4 ?? 0) / unitsTotal,
    fulltext_hit_rate: fullTextHitRate(
      ft.map((x) => x.status),
      sources.length,
    ),
    conflict_detected: conflictDetected(
      await conflict.countForVersion(versionId),
    ),
    low_credibility_claim_rate: await credibility.lowCredibilityRate(projectId),
    evidence_precision_human:
      evidencePrecisionHuman(checks) ??
      (await humanCheck.precisionForVersion(versionId)),
  };
}

function mean(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmt(x: number | null, digits = 3): string {
  return x === null ? '—' : x.toFixed(digits);
}

async function main(): Promise<void> {
  const batchId = arg('batch') ?? randomUUID();
  const limit = Number(arg('limit', '10'));
  const resume = hasFlag('resume');
  const outPath = resolve(RESULTS_DIR, `${batchId}-evidence.json`);

  const ideas = (
    JSON.parse(
      readFileSync(resolve(process.cwd(), 'eval', 'ideas.json'), 'utf8'),
    ) as { id: string; domain: string; text: string }[]
  ).slice(0, limit);

  const done: Row[] =
    resume && existsSync(outPath)
      ? ((JSON.parse(readFileSync(outPath, 'utf8')) as { rows: Row[] }).rows ??
        [])
      : [];
  const seen = new Set(done.map((r) => `${r.arm}:${r.idea_id}`));

  const s = await boot();
  const userId = await ensureEvalUser(s.prisma);
  const rows: Row[] = [...done];

  try {
    for (const [i, idea] of ideas.entries()) {
      for (const armDef of orderFor(i)) {
        const key = `${armDef.key}:${idea.id}`;
        if (seen.has(key)) {
          console.log(`bỏ qua (đã có): ${key}`);
          continue;
        }
        console.log(`\n▶ ${idea.id} · ${armDef.label}`);
        const t0 = Date.now();

        const project = await s.prisma.project.create({
          data: {
            user_id: userId,
            title: `[ablation-A/${armDef.key}] ${idea.id}`,
            raw_idea: idea.text,
            domain: idea.domain,
            status: 'IN_PROGRESS',
            // `verifier_gate` giữ mặc định để ba dòng khác nhau **chỉ** ở ba cờ của làn A.
            ...armDef.flags,
          },
        });
        const version = await s.prisma.specVersion.create({
          data: {
            project_id: project.id,
            version_no: 1,
            status: 'DRAFT',
            label: `ablation-A/${armDef.key} ${idea.id}`,
          },
        });
        await s.prisma.project.update({
          where: { id: project.id },
          data: { current_spec_version_id: version.id },
        });

        try {
          await runPipeline(s, project.id, version.id);
          const metrics = await measure(s, project.id);
          rows.push({
            arm: armDef.key,
            idea_id: idea.id,
            project_id: project.id,
            wall_ms: Date.now() - t0,
            ...metrics,
          });
          console.log(
            `  ✓ ${Math.round((Date.now() - t0) / 1000)}s · xung đột ${metrics.conflict_detected} · toàn văn ${fmt(metrics.fulltext_hit_rate, 2)}`,
          );
        } catch (err) {
          console.error(
            `  ✗ ${idea.id}/${armDef.key}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        mkdirSync(RESULTS_DIR, { recursive: true });
        writeFileSync(
          outPath,
          JSON.stringify({ batch_id: batchId, rows }, null, 2),
        );
      }
    }

    printTable(rows, batchId, outPath);
  } finally {
    await s.app.close();
  }
}

/**
 * Đường ống tối thiểu để có cặp khẳng định–nguồn mà đo: phân tích ý tưởng → tìm nguồn thật →
 * sinh thẻ → kiểm chứng cứ. Không chạy vòng judge: #6 đo **bằng chứng**, không đo phản biện, và
 * vòng judge làm thời gian chạy tăng gấp mấy lần mà không đổi bốn khoá metric ở đây.
 */
async function runPipeline(
  s: Services,
  projectId: string,
  versionId: string,
): Promise<void> {
  await s.generator.analyze(projectId);
  await answerPending(s, projectId, 'S1');

  const meta = await s.prisma.specVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { meta: true },
  });
  const keywords =
    (meta.meta as { search_keywords?: string[] } | null)?.search_keywords ?? [];
  await s.sources.searchAndStore(projectId, keywords.slice(0, 3));

  await s.generator.relatedWork(projectId);
  await s.generator.gap(projectId);
  await answerPending(s, projectId, 'S2');

  const current = await s.spec.currentVersionOf(projectId);
  await s.verifier.verifySpecVersion(current.id, { projectId });
}

function printTable(rows: Row[], batchId: string, outPath: string): void {
  const header = [
    'cấu hình',
    'n',
    'unsupported_rate',
    'fabrication_rate',
    'l4_llm_ratio',
    'fulltext_hit_rate',
    'conflict_detected',
    'low_credibility_claim_rate',
    'evidence_precision_human',
  ];
  const lines: string[] = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
  ];

  for (const armDef of ARMS) {
    const mine = rows.filter((r) => r.arm === armDef.key);
    lines.push(
      `| ${armDef.label} | ${mine.length} | ` +
        `${fmt(mean(mine.map((r) => r.unsupported_rate)))} | ` +
        `${fmt(mean(mine.map((r) => r.fabrication_rate)))} | ` +
        `${fmt(mean(mine.map((r) => r.l4_llm_ratio)))} | ` +
        `${fmt(mean(mine.map((r) => r.fulltext_hit_rate)))} | ` +
        `${fmt(mean(mine.map((r) => r.conflict_detected)), 1)} | ` +
        `${fmt(mean(mine.map((r) => r.low_credibility_claim_rate)))} | ` +
        `${fmt(mean(mine.map((r) => r.evidence_precision_human)))} |`,
    );
  }

  const table = lines.join('\n');
  console.log(`\n${table}\n`);
  console.log(`batch  : ${batchId}`);
  console.log(`kết quả: ${outPath}`);
  console.log(
    'Dán bảng trên vào mục "Làn A" của `docs/evaluation_report.md`. **Báo cả chỉ số không cải ' +
      'thiện** kèm giải thích — tiêu chí hoàn thành của #6.',
  );
  writeFileSync(outPath.replace(/\.json$/, '.md'), `${table}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
