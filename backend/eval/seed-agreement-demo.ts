/**
 * Dựng sẵn một vòng judge để **xem thử số đo bất đồng** (#9) mà không cần key LLM.
 *
 * DB thật hiện có `JudgeRun` nhưng **0 `Issue`** (vòng judge hỏng vì key placeholder), nên không
 * có cách nào khác để kiểm B3 end-to-end.
 *
 * Kịch bản cài sẵn **mẫu hình biết trước** để đối chiếu với đầu ra:
 *   · J1+J2 gần như luôn trùng nhau  → Jaccard(J1,J2) cao ⇒ "một trong hai là thừa"
 *   · J5 hay đứng một mình            → tỉ lệ solo cao
 *   · J4 chấm nặng tay hơn hẳn        → severityBias(J4) dương
 *   · một nhóm cả 5 judge cùng nêu    → unanimousGroups = 1
 *
 *   npm run eval:build && node dist-eval/eval/seed-agreement-demo.js
 */
import { boot } from './harness';

type Sev = 'CRITICAL' | 'MAJOR' | 'MINOR';

/** Mỗi phần tử = một nhóm issue: thẻ nào, và judge nào chấm mức nào. */
const GROUPS: { card: number; votes: Partial<Record<string, Sev>> }[] = [
  // J1+J2 trùng nhau trên 4 nhóm liền — cặp "thừa".
  { card: 0, votes: { J1: 'MAJOR', J2: 'MAJOR' } },
  { card: 1, votes: { J1: 'MAJOR', J2: 'CRITICAL' } },
  { card: 2, votes: { J1: 'MINOR', J2: 'MINOR' } },
  { card: 3, votes: { J1: 'CRITICAL', J2: 'MAJOR' } },
  // Cả 5 cùng nêu — ưu tiên sửa trước. J4 nặng tay hơn số đông.
  {
    card: 4,
    votes: { J1: 'MAJOR', J2: 'MAJOR', J3: 'MAJOR', J4: 'CRITICAL', J5: 'MAJOR' },
  },
  // J3 + J4, J4 lại nặng hơn.
  { card: 5, votes: { J3: 'MINOR', J4: 'CRITICAL' } },
  // J5 đứng một mình ba lần liền.
  { card: 6, votes: { J5: 'MAJOR' } },
  { card: 7, votes: { J5: 'MINOR' } },
  { card: 8, votes: { J5: 'MAJOR' } },
];

const CARD_TITLES = [
  'Retrieval quality on legal text',
  'Cross-domain generalisation claim',
  'Chunking strategy',
  'Reranker contribution',
  'Missing baseline comparison',
  'Ablation plan completeness',
  'Citation for the 20% figure',
  'Resource estimate realism',
  'Readiness of the export step',
  // Thẻ không ai nêu — chứng minh im lặng được tính là NONE chứ không bị bỏ khỏi tập mục.
  'Threat model section',
  'Reproducibility checklist',
];

const JUDGES = ['J1', 'J2', 'J3', 'J4', 'J5'] as const;

async function main(): Promise<void> {
  const email = process.argv[2] ?? 'demo@local.test';
  const s = await boot();
  try {
    const user = await s.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(
        `Chưa có tài khoản ${email}. Đăng ký trước ở http://localhost:3000/register`,
      );
    }

    const project = await s.prisma.project.create({
      data: {
        user_id: user.id,
        title: 'Demo · bất đồng giữa judge',
        raw_idea: 'Hybrid retrieval for Vietnamese legal question answering.',
        domain: 'Vietnamese legal QA',
        step: 'S4',
        status: 'IN_PROGRESS',
        judge_agreement: true,
        judge_round: 1,
        judge_rounds_total: 1,
      },
    });

    const version = await s.prisma.specVersion.create({
      data: {
        project_id: project.id,
        version_no: 1,
        status: 'UNDER_REVIEW',
        label: 'demo agreement',
      },
    });

    const cards = [];
    for (const [i, title] of CARD_TITLES.entries()) {
      cards.push(
        await s.prisma.card.create({
          data: {
            spec_version_id: version.id,
            type: 'CLAIM',
            status: 'PROPOSED',
            title,
            body: title,
            order_index: i,
          },
          select: { id: true },
        }),
      );
    }

    // Năm `JudgeRun` cùng `input_digest` — bằng chứng "5 judge độc lập" của hệ thống.
    const runs = new Map<string, string>();
    for (const key of JUDGES) {
      const run = await s.prisma.judgeRun.create({
        data: {
          spec_version_id: version.id,
          judge_key: key,
          round: 1,
          model: key === 'J2' || key === 'J4' ? 'deepseek-v4-flash' : 'deepseek-v4-pro',
          prompt_id: `judge_${key}`,
          prompt_hash: 'seed',
          input_digest: 'seed-shared-digest',
          raw_output: { seeded: true },
          status: 'OK',
          finished_at: new Date(),
        },
        select: { id: true },
      });
      runs.set(key, run.id);
    }

    for (const [gi, g] of GROUPS.entries()) {
      const group = await s.prisma.issueGroup.create({
        data: {
          spec_version_id: version.id,
          round: 1,
          canonical_title: CARD_TITLES[g.card],
          max_severity: 'MAJOR',
          judge_keys: Object.keys(g.votes),
          agreement_count: Object.keys(g.votes).length,
          judges_completed: JUDGES.length,
          disagreement_score: 1 - Object.keys(g.votes).length / JUDGES.length,
          status: 'OPEN',
        },
        select: { id: true },
      });

      for (const [judgeKey, severity] of Object.entries(g.votes)) {
        if (!severity) continue;
        await s.prisma.issue.create({
          data: {
            judge_run_id: runs.get(judgeKey) as string,
            issue_group_id: group.id,
            severity,
            title: `[${judgeKey}] ${CARD_TITLES[g.card]}`,
            reason: `Nhóm ${gi + 1}, gieo tay.`,
            suggestion: 'Sửa theo đúng phạm vi đã đo được.',
            target_card_id: cards[g.card].id,
          },
        });
      }
    }

    await s.prisma.project.update({
      where: { id: project.id },
      data: { current_spec_version_id: version.id },
    });

    console.log(`project : ${project.id}`);
    console.log(`version : ${version.id}`);
    console.log(`mở      : http://localhost:3000/projects/${project.id}/step/4`);
    console.log(`thẻ     : ${CARD_TITLES.length} (2 thẻ không ai nêu)`);
    console.log(`nhóm    : ${GROUPS.length}`);
    console.log('mẫu hình cài sẵn: J1+J2 trùng nhau · J5 hay một mình · J4 nặng tay · 1 nhóm cả 5 nêu');
  } finally {
    await s.app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
