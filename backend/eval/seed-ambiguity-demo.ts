/**
 * Dựng sẵn một dự án để **xem thử bộ bắt thẻ mơ hồ** (#12) mà không cần key LLM.
 *
 * Bảy thẻ, trải đủ bốn loại cờ cộng ba thẻ sạch làm đối chứng — trong đó có một thẻ đang
 * `MISSING` để kiểm chứng rằng B6 **không** ghi đè lên nó.
 *
 *   npm run eval:build && node dist-eval/eval/seed-ambiguity-demo.js
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raw = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8');
  const m = /^\s*DATABASE_URL\s*=\s*(.*)$/m.exec(raw);
  if (!m) throw new Error('Không tìm thấy DATABASE_URL trong backend/.env');
  return m[1].trim().replace(/^["'](.*)["']$/, '$1');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl() }),
});

type SeedCard = {
  type: 'CLAIM' | 'GAP' | 'PROBLEM';
  status: 'PROPOSED' | 'MISSING';
  title: string;
  body: string;
  payload?: Record<string, string>;
  note: string;
};

const CARDS: SeedCard[] = [
  {
    type: 'CLAIM',
    status: 'PROPOSED',
    title: 'Hybrid retrieval beats the baseline',
    body: 'Hybrid retrieval outperforms the baseline on legal text.',
    payload: {
      baseline: 'existing methods',
      metric: 'nDCG@10',
      evidence: 'preliminary runs',
      refutation_condition: 'no gain over BM25',
    },
    note: 'CLAIM_FIELD_VAGUE · baseline "existing methods" không nêu tên gì',
  },
  {
    type: 'CLAIM',
    status: 'PROPOSED',
    title: 'Reranking raises answer quality',
    body: 'The reranking stage raises answer quality.',
    payload: {
      baseline: 'BM25',
      metric: 'performance',
      evidence: 'pilot study',
      refutation_condition: 'no measurable gain',
    },
    note: 'CLAIM_FIELD_VAGUE · metric "performance" không đo được',
  },
  {
    type: 'GAP',
    status: 'PROPOSED',
    title: 'No Vietnamese legal retrieval benchmark',
    body: 'Existing benchmarks cover English only.',
    payload: {
      prior_work: 'BM25 and SBERT on English corpora',
      limitation: 'recall@50 stays below 0.4 on Vietnamese statutes',
      why_it_matters: 'lawyers miss the governing statute',
      testable_experiment: 'We will evaluate the approach.',
    },
    note: 'GAP_FIELD_VAGUE · testable_experiment chỉ hứa "sẽ đánh giá"',
  },
  {
    type: 'PROBLEM',
    status: 'PROPOSED',
    title: 'Long document degradation',
    body: 'It degrades on long documents.',
    note: 'DANGLING_PRONOUN · "It" không có tiền ngữ',
  },
  {
    type: 'PROBLEM',
    status: 'PROPOSED',
    title: 'Chunking quality',
    body: 'The current chunking strategy is not effective for statutes.',
    note: 'VAGUE_TERM · "effective" không neo vào số nào',
  },
  {
    type: 'CLAIM',
    status: 'MISSING',
    title: 'Incomplete claim',
    body: 'It is significantly better.',
    payload: { baseline: '', metric: '', evidence: '', refutation_condition: '' },
    note: 'ĐỐI CHỨNG · đang MISSING ⇒ B6 phải BỎ QUA, không ghi đè',
  },
  {
    type: 'PROBLEM',
    status: 'PROPOSED',
    title: 'Measured latency regression',
    body: 'Retrieval latency rises to 850 ms per query on long statutes.',
    note: 'ĐỐI CHỨNG SẠCH · có số ⇒ không cờ',
  },
];

async function main(): Promise<void> {
  const email = process.argv[2] ?? 'demo@local.test';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `Chưa có tài khoản ${email}. Đăng ký trước ở http://localhost:3000/register`,
    );
  }

  const project = await prisma.project.create({
    data: {
      user_id: user.id,
      title: 'Demo · thẻ mơ hồ',
      raw_idea: 'Hybrid retrieval for Vietnamese legal question answering.',
      domain: 'Vietnamese legal QA',
      step: 'S2',
      status: 'IN_PROGRESS',
      ambiguity_detector: true,
    },
  });

  const version = await prisma.specVersion.create({
    data: {
      project_id: project.id,
      version_no: 1,
      status: 'DRAFT',
      label: 'demo ambiguity',
    },
  });

  await prisma.card.createMany({
    data: CARDS.map((c, i) => ({
      spec_version_id: version.id,
      type: c.type,
      status: c.status,
      title: c.title,
      body: c.body,
      payload: c.payload ?? undefined,
      order_index: i,
    })),
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { current_spec_version_id: version.id },
  });

  console.log(`project : ${project.id}`);
  console.log(`version : ${version.id}`);
  console.log(`mở      : http://localhost:3000/projects/${project.id}/step/2`);
  for (const c of CARDS) console.log(`  · ${c.title} — ${c.note}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
