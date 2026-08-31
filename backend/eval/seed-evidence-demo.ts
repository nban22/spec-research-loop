/**
 * Dựng sẵn một dự án để **xem thử cả làn A** (#1 chấm tin cậy nguồn · #3 phát hiện nguồn mâu
 * thuẫn) mà không cần key LLM và không cần mạng.
 *
 * Sáu nguồn viết tay, chọn sao cho mọi cơ chế lộ ra ngay:
 *   · hai nguồn ngược chiều **số học** cùng một metric  ⇒ tín hiệu NUMERIC
 *   · hai nguồn ngược **cực** (một SUPPORTED, một CONTRADICTS) ⇒ tín hiệu POLARITY, 0 token
 *   · một bài báo được **hai thẻ** dùng theo hai chiều  ⇒ CROSS_CARD, ghi `conflict_with_card_id`
 *   · một thẻ chỉ dựa vào toàn nguồn mức thấp          ⇒ cảnh báo của #1
 *   · một bài arXiv thật                                ⇒ để bấm thử đường toàn văn khi có mạng
 *
 *   npm run eval:build && node dist-eval/eval/seed-evidence-demo.js
 */
import { ConflictService } from '../src/conflict/conflict.service';
import { CredibilityService } from '../src/sources/credibility.service';
import { boot } from './harness';

type SeedSource = {
  key: string;
  external_id: string;
  title: string;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citation_count: number | null;
  doi_verified: boolean | null;
  note: string;
};

const SOURCES: SeedSource[] = [
  {
    key: 'S1',
    external_id: 'demo-s1',
    title: 'Hybrid retrieval for Vietnamese legal question answering',
    year: 2024,
    venue: 'SIGIR 2024',
    doi: '10.1145/demo.0001',
    url: 'https://example.org/s1',
    abstract:
      'We study hybrid sparse-dense retrieval for Vietnamese statutes. Hybrid retrieval improves recall@50 by 12% over a BM25 baseline on our legal corpus. The gain holds across three statute families and two query styles. We release the index and the evaluation harness so the numbers can be reproduced end to end.',
    citation_count: 180,
    doi_verified: true,
    note: 'HIGH · hội nghị lớn, mới, nhiều trích dẫn, DOI tra ra được',
  },
  {
    key: 'S2',
    external_id: 'demo-s2',
    title: 'On the limits of dense retrieval for statutory text',
    year: 2024,
    venue: 'arXiv preprint',
    doi: '10.48550/arXiv.2401.00002',
    url: 'https://arxiv.org/abs/2401.00002',
    abstract:
      'We revisit hybrid retrieval on Vietnamese statutes under a matched evaluation protocol. Hybrid retrieval reduces recall@50 by 4% relative to a tuned BM25 baseline. We attribute the earlier reported gains to an unnormalised candidate pool rather than to the dense component itself.',
    citation_count: 6,
    doi_verified: true,
    note: 'MEDIUM · bản tiền ấn — và là nguồn **chỏi** với S1',
  },
  {
    key: 'S3',
    external_id: 'demo-s3',
    title: 'A note on legal text search',
    year: 2009,
    venue: null,
    doi: null,
    url: null,
    abstract: null,
    citation_count: 0,
    doi_verified: false,
    note: 'REVIEW · cũ, không DOI, không tóm tắt, không nơi công bố',
  },
  {
    key: 'S4',
    external_id: 'demo-s4',
    title: 'Preliminary observations on statute indexing',
    year: 2011,
    venue: 'Local workshop',
    doi: null,
    url: null,
    abstract: 'Short note.',
    citation_count: 1,
    doi_verified: null,
    note: 'REVIEW · workshop, gần như không ai trích',
  },
  {
    key: 'S5',
    external_id: 'demo-s5',
    title: 'Reranking trade-offs in low-resource retrieval',
    year: 2023,
    venue: 'EMNLP 2023',
    doi: '10.18653/demo.0005',
    url: 'https://example.org/s5',
    abstract:
      'We measure cross-encoder reranking on low-resource legal corpora. Reranking raises answer quality when the candidate pool is already precise, and degrades it when the pool is noisy. The direction of the effect therefore depends entirely on the first-stage retriever.',
    citation_count: 42,
    doi_verified: true,
    note: 'HIGH · bài **dùng chung** bởi hai thẻ theo hai chiều ⇒ CROSS_CARD',
  },
  {
    key: 'S6',
    external_id: 'demo-s6',
    title: 'Attention Is All You Need',
    year: 2017,
    venue: 'NeurIPS 2017',
    doi: '10.48550/arXiv.1706.03762',
    url: 'https://arxiv.org/abs/1706.03762',
    abstract:
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
    citation_count: 100000,
    doi_verified: true,
    note: 'arXiv thật — bật cờ evidence_fulltext rồi chạy VERIFY để thử đường toàn văn',
  },
];

type SeedCard = {
  key: string;
  type: 'CLAIM' | 'GAP' | 'CONTRIBUTION';
  title: string;
  body: string;
  /** `[nguồn, nhãn verifier, entailment, câu chứng cứ]` — giả lập một lần chạy verifier đã xong. */
  links: [
    string,
    'SUPPORTED' | 'WEAK' | 'UNSUPPORTED',
    string | null,
    string | null,
  ][];
  note: string;
};

const CARDS: SeedCard[] = [
  {
    key: 'C1',
    type: 'CLAIM',
    title: 'Hybrid retrieval improves recall@50 on Vietnamese statutes',
    body: 'Combining BM25 with a dense retriever improves recall@50 on Vietnamese statutes.',
    links: [
      [
        'S1',
        'SUPPORTED',
        null,
        'Hybrid retrieval improves recall@50 by 12% over a BM25 baseline on our legal corpus.',
      ],
      [
        'S2',
        'UNSUPPORTED',
        'CONTRADICTS',
        'Hybrid retrieval reduces recall@50 by 4% relative to a tuned BM25 baseline.',
      ],
    ],
    note: 'INTRA_CARD · một nguồn ủng hộ, một nguồn phản bác ⇒ POLARITY (0 token)',
  },
  {
    key: 'C2',
    type: 'GAP',
    title: 'No public benchmark for Vietnamese statutory retrieval',
    body: 'Existing benchmarks cover English case law only.',
    links: [
      ['S3', 'WEAK', null, null],
      ['S4', 'WEAK', null, null],
    ],
    note: 'CẢNH BÁO #1 · chỉ được chống lưng bởi toàn nguồn mức REVIEW',
  },
  {
    key: 'C3',
    type: 'CONTRIBUTION',
    title: 'A reranking stage that raises answer quality',
    body: 'We contribute a cross-encoder reranking stage that raises answer quality.',
    links: [
      [
        'S5',
        'SUPPORTED',
        null,
        'Reranking raises answer quality when the candidate pool is already precise, and degrades it when the pool is noisy.',
      ],
    ],
    note: 'CROSS_CARD (nửa dương) · dùng S5 làm chứng cứ ủng hộ',
  },
  {
    key: 'C4',
    type: 'CLAIM',
    title: 'Reranking degrades answer quality on noisy pools',
    body: 'Cross-encoder reranking degrades answer quality when the candidate pool is noisy.',
    links: [
      [
        'S5',
        'UNSUPPORTED',
        'CONTRADICTS',
        'Reranking raises answer quality when the candidate pool is already precise, and degrades it when the pool is noisy.',
      ],
    ],
    note: 'CROSS_CARD (nửa âm) · cùng S5 nhưng ngược cực ⇒ ghi conflict_with_card_id',
  },
  {
    key: 'C5',
    type: 'CLAIM',
    title: 'Attention alone suffices for sequence transduction',
    body: 'A model built only on attention matches recurrent architectures on translation.',
    links: [['S6', 'WEAK', null, null]],
    note: 'Nguồn arXiv thật — để thử đường toàn văn của #2',
  },
];

async function main(): Promise<void> {
  const email = process.argv[2] ?? 'demo@local.test';
  const s = await boot();
  const credibility = s.app.get(CredibilityService);
  const conflict = s.app.get(ConflictService);

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
        title: 'Demo · bằng chứng & nguồn',
        raw_idea:
          'Hybrid retrieval for Vietnamese legal question answering, with a reranking stage.',
        domain: 'Vietnamese legal QA',
        step: 'S3',
        status: 'IN_PROGRESS',
        // Cả ba cờ của làn A. Mặc định chúng **tắt**; bật ở đây để demo thấy ngay.
        source_credibility: true,
        conflict_detector: true,
        evidence_fulltext: true,
      },
    });

    const version = await s.prisma.specVersion.create({
      data: {
        project_id: project.id,
        version_no: 1,
        status: 'DRAFT',
        label: 'demo evidence',
      },
    });
    await s.prisma.project.update({
      where: { id: project.id },
      data: { current_spec_version_id: version.id },
    });

    const sourceId = new Map<string, string>();
    for (const src of SOURCES) {
      const row = await s.prisma.source.create({
        data: {
          project_id: project.id,
          retrieved_from: 'SEMANTIC_SCHOLAR',
          external_id: src.external_id,
          title: src.title,
          authors: ['Demo Author'],
          year: src.year,
          venue: src.venue,
          doi: src.doi,
          url: src.url,
          abstract: src.abstract,
          citation_count: src.citation_count,
          doi_verified: src.doi_verified,
          raw: {},
        },
      });
      sourceId.set(src.key, row.id);
    }

    const cardId = new Map<string, string>();
    for (const [i, c] of CARDS.entries()) {
      const row = await s.prisma.card.create({
        data: {
          spec_version_id: version.id,
          type: c.type,
          status: 'PROPOSED',
          title: c.title,
          body: c.body,
          order_index: i,
        },
      });
      cardId.set(c.key, row.id);

      for (const [srcKey, label, entailment, evidence] of c.links) {
        await s.prisma.cardSource.create({
          data: {
            card_id: row.id,
            source_id: sourceId.get(srcKey)!,
            support_label: label,
            // Giả lập kết quả của một lần chạy verifier đã xong, để tầng luật của #3 có dữ liệu
            // mà không cần gọi LLM hay chạy embedding.
            entailment: entailment as never,
            confidence: entailment ? 0.88 : null,
            similarity: label === 'SUPPORTED' ? 0.81 : 0.55,
            evidence_sentence: evidence,
          },
        });
      }
    }

    const scored = await credibility.rescoreProject(project.id);
    const scan = await conflict.scanVersion(version.id, project.id);
    const overview = await credibility.overview(project.id);

    console.log(`project : ${project.id}`);
    console.log(`version : ${version.id}`);
    console.log(
      `bằng chứng : http://localhost:3000/projects/${project.id}/evidence`,
    );
    console.log(
      `bước 2     : http://localhost:3000/projects/${project.id}/step/2`,
    );
    console.log(
      `gán nhãn   : http://localhost:3000/projects/${project.id}/label`,
    );
    console.log('');
    console.log(`đã chấm ${scored} nguồn:`);
    for (const src of SOURCES) {
      const sc = overview.sources.find(
        (x) => x.source_id === sourceId.get(src.key),
      );
      console.log(`  · ${src.key} ${sc?.tier ?? '—'} — ${src.note}`);
    }
    console.log('');
    console.log(
      `xung đột: ${scan.intraCard} trong-thẻ · ${scan.crossCard} giữa-thẻ · ${scan.llmCalls} lời gọi LLM ` +
        `(đối chiếu ${scan.pairsCompared} cặp)`,
    );
    for (const c of await conflict.listForVersion(version.id)) {
      console.log(`  · [${c.scope}/${c.signal}] ${c.card_title} — ${c.reason}`);
    }
    console.log('');
    console.log(
      `thẻ chỉ dựa vào nguồn mức thấp: ${
        overview.low_credibility_cards.map((c) => c.title).join(', ') ||
        '(không có)'
      }`,
    );
  } finally {
    await s.app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
