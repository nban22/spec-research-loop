/**
 * Dựng sẵn một dự án để **xem thử panel cờ phóng đại** (#7) mà không cần key LLM.
 *
 * Luồng thật đi qua generator, tức là phải có `DEEPSEEK_API_KEY`. Script này ghi thẳng vào DB
 * bốn thẻ `CLAIM` và một `ExperimentPlan` một-domain, rồi bật `overclaim_detector` — đủ để tầng
 * luật 0 token có việc làm. Chỉ dùng để demo/dev, không phải dữ liệu eval.
 *
 *   npm run eval:build && node dist-eval/eval/seed-overclaim-demo.js
 */
import { boot } from './harness';

/** Bốn khẳng định trải đủ ba nhánh của tầng luật, cộng một câu sạch làm đối chứng. */
const CLAIMS = [
  {
    title: 'Cross-domain retrieval quality',
    body: 'Our retrieval pipeline improves answer accuracy across all domains.',
    note: 'phổ quát + kế hoạch chỉ có 1 domain ⇒ CRITICAL bằng luật',
  },
  {
    title: 'Multi-dataset transfer',
    body: 'The technique transfers to five datasets without any modification.',
    note: 'khai 5 dataset, kế hoạch đếm được ít hơn ⇒ MAJOR bằng luật',
  },
  {
    title: 'Reranker improvement magnitude',
    body: 'Our method significantly improves nDCG@10 over the BM25 baseline.',
    note: 'có từ chỉ mức nhưng kế hoạch có baseline + metric ⇒ vùng xám, cần LLM',
  },
  {
    title: 'Chunk size effect',
    body: 'A chunk size of 512 tokens gives higher recall@50 than 256 tokens on the ZaloLegal corpus.',
    note: 'đã tự giới hạn phạm vi ⇒ không cờ',
  },
];

const PLAN = {
  experiments: [
    {
      code: 'E1',
      title: 'Retrieval quality on Vietnamese legal QA',
      bullets: [
        'Evaluate on the ZaloLegal corpus of 3000 statute passages',
        'Compare against a BM25 baseline',
        'Report nDCG@10 and recall@50',
      ],
      linked_claim_title: '',
    },
  ],
  baselines_and_metrics: 'BM25 baseline; nDCG@10 and recall@50 as metrics.',
  ablation_plan: 'Remove the reranker stage and re-measure nDCG@10.',
  risks_and_limitations: 'Only one corpus has gold relevance labels.',
  estimator_inputs: {
    model_params_b: 7,
    quantization: 'int4',
    candidates: 3,
    rounds: 2,
    eval_samples: 500,
    avg_prompt_tokens: 1200,
    avg_output_tokens: 400,
  },
};

async function main(): Promise<void> {
  const email = process.argv[2] ?? 'demo@local.test';
  // `boot()` dựng Nest context thật ⇒ `ConfigModule` nạp và **kiểm** env, rồi trả `PrismaService`
  // đã cấu hình. Không tự đọc `.env` và không `new PrismaClient()` (backend/CLAUDE.md §2).
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
        title: 'Demo · cờ claim phóng đại',
        raw_idea:
          'Hybrid retrieval for Vietnamese legal question answering over statute passages.',
        domain: 'Vietnamese legal QA',
        step: 'S4',
        status: 'IN_PROGRESS',
        overclaim_detector: true,
      },
    });

    const version = await s.prisma.specVersion.create({
      data: {
        project_id: project.id,
        version_no: 1,
        status: 'UNDER_REVIEW',
        label: 'demo overclaim',
      },
    });

    await s.prisma.card.createMany({
      data: CLAIMS.map((c, i) => ({
        spec_version_id: version.id,
        type: 'CLAIM' as const,
        status: 'PROPOSED' as const,
        title: c.title,
        body: c.body,
        order_index: i,
      })),
    });

    await s.prisma.experimentPlan.create({
      data: { spec_version_id: version.id, plan: PLAN },
    });

    await s.prisma.project.update({
      where: { id: project.id },
      data: { current_spec_version_id: version.id },
    });

    console.log(`project  : ${project.id}`);
    console.log(`version  : ${version.id}`);
    console.log(
      `mở       : http://localhost:3000/projects/${project.id}/step/4`,
    );
    for (const c of CLAIMS) console.log(`  · ${c.title} — ${c.note}`);
  } finally {
    await s.app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
