import { detectAmbiguity, topFinding, type AmbiguityInput } from './ambiguity';
import { analyzeOutputSchema } from '../contracts/llm-io/generator';
import {
  MAX_OPEN_QUESTIONS,
  buildQuestion,
  severityRanker,
} from './clarify-questions';

/**
 * Toàn bộ tầng phát hiện của B6 chạy **không cần DB, không cần LLM** — file này không mock gì.
 * Đúng tiêu chí "hàm phát hiện là hàm thuần, có unit test, 0 token" của #12.
 */

function claim(
  payload: Record<string, string>,
  body = 'A claim.',
): AmbiguityInput {
  return {
    type: 'CLAIM',
    status: 'PROPOSED',
    title: 'Some claim',
    body,
    payload,
  };
}

function gap(
  payload: Record<string, string>,
  body = 'A limitation.',
): AmbiguityInput {
  return { type: 'GAP', status: 'PROPOSED', title: 'Some gap', body, payload };
}

describe('AMBIGUOUS khác MISSING', () => {
  it('không đụng vào thẻ đang MISSING — nó đã có cờ nặng hơn', () => {
    const card: AmbiguityInput = {
      type: 'CLAIM',
      status: 'MISSING',
      title: 'x',
      body: 'It is significantly better.',
      payload: { baseline: '', metric: '' },
    };
    expect(detectAmbiguity(card)).toEqual([]);
  });

  it('trường rỗng là việc của MISSING, không phải của AMBIGUOUS', () => {
    // Thẻ này lẽ ra generator đã gán MISSING; nếu vì lý do gì nó là PROPOSED thì B6 vẫn
    // không cờ trường rỗng — tránh hai cơ chế nói về cùng một chuyện.
    const f = detectAmbiguity(claim({ baseline: '', metric: '' }));
    expect(f.filter((x) => x.kind === 'CLAIM_FIELD_VAGUE')).toEqual([]);
  });
});

describe('CLAIM — baseline / metric có chữ nhưng không đo được', () => {
  it('cờ baseline chung chung', () => {
    const f = detectAmbiguity(
      claim({ baseline: 'existing methods', metric: 'nDCG@10' }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('CLAIM_FIELD_VAGUE');
    expect(f[0].field).toBe('baseline');
  });

  it('cờ metric không phải đại lượng', () => {
    const f = detectAmbiguity(
      claim({ baseline: 'BM25', metric: 'performance' }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe('metric');
  });

  it('không cờ khi baseline có tên riêng và metric có tên metric', () => {
    expect(
      detectAmbiguity(claim({ baseline: 'BM25', metric: 'nDCG@10' })),
    ).toEqual([]);
  });

  it('không cờ khi trường có con số neo lại', () => {
    expect(
      detectAmbiguity(
        claim({ baseline: 'the 2024 SOTA system', metric: 'recall at 50' }),
      ),
    ).toEqual([]);
  });
});

describe('GAP — bốn trường Bước 4', () => {
  it('cờ testable_experiment chỉ hứa "sẽ đánh giá"', () => {
    const f = detectAmbiguity(
      gap({
        prior_work: 'BM25 retrieval',
        limitation: 'recall@50 stays below 0.4',
        why_it_matters: 'lawyers miss the governing statute',
        testable_experiment: 'We will evaluate the approach.',
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe('testable_experiment');
  });

  it('không cờ testable_experiment có mô tả so sánh', () => {
    expect(
      detectAmbiguity(
        gap({
          prior_work: 'BM25 retrieval',
          limitation: 'recall@50 stays below 0.4',
          why_it_matters: 'lawyers miss the governing statute',
          testable_experiment:
            'Compare hybrid retrieval against BM25 on ZaloLegal.',
        }),
      ),
    ).toEqual([]);
  });

  it('COMPARISON_MARKERS thật sự được dùng — so sánh mà không có chữ số nào', () => {
    // Test cũ dùng fixture chứa `BM25`, có chữ số nên thoát qua `hasMeasurable` trước khi
    // chạm `COMPARISON_MARKERS`. Nhánh đang muốn kiểm chưa bao giờ được chạy.
    const f = detectAmbiguity(
      gap({
        prior_work: 'earlier retrieval systems',
        limitation: 'recall stays low on statutes',
        why_it_matters: 'lawyers miss the governing statute',
        testable_experiment: 'Compare our method against prior work.',
      }),
    );
    expect(f.some((x) => x.field === 'testable_experiment')).toBe(false);
  });

  it('cờ trường chỉ toàn từ định tính', () => {
    const f = detectAmbiguity(
      gap({
        prior_work: 'previous work is not very effective',
        limitation: 'recall@50 stays below 0.4',
        why_it_matters: 'lawyers miss the governing statute',
        testable_experiment: 'Compare against BM25 on ZaloLegal.',
      }),
    );
    expect(f.some((x) => x.field === 'prior_work')).toBe(true);
  });
});

describe('luật áp cho mọi thẻ', () => {
  it('cờ đại từ mở đầu không rõ tham chiếu', () => {
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'It degrades on long documents.',
    });
    expect(f.some((x) => x.kind === 'DANGLING_PRONOUN')).toBe(true);
  });

  it('KHÔNG cờ khi đại từ bổ nghĩa cho một danh từ — nó có tiền ngữ', () => {
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'This approach degrades on long documents.',
    });
    expect(f.some((x) => x.kind === 'DANGLING_PRONOUN')).toBe(false);
  });

  it('KHÔNG cờ danh từ bắt đầu bằng chuỗi trùng trợ động từ', () => {
    // Bug thật: `AUX` không có `\b` đóng nhánh nên khớp như **tiền tố** —
    // `do` ⊂ `document`, `can` ⊂ `candidate`, `is` ⊂ `issue`.
    for (const body of [
      'This document describes the retrieval pipeline.',
      'This domain has no benchmark.',
      'This candidate model was trained on ZaloLegal.',
    ]) {
      const f = detectAmbiguity({
        type: 'PROBLEM',
        status: 'PROPOSED',
        title: 'x',
        body,
      });
      expect(f.some((x) => x.kind === 'DANGLING_PRONOUN')).toBe(false);
    }
  });

  it('KHÔNG cờ danh từ số ít kết thúc bằng -s', () => {
    // `corpus`, `analysis`, `bias` không phải động từ chia số ít.
    for (const body of [
      'This corpus has 10k statute passages.',
      'This analysis covers three datasets.',
    ]) {
      const f = detectAmbiguity({
        type: 'PROBLEM',
        status: 'PROPOSED',
        title: 'x',
        body,
      });
      expect(f.some((x) => x.kind === 'DANGLING_PRONOUN')).toBe(false);
    }
  });

  it('CÓ cờ đại từ số nhiều đi với trợ động từ', () => {
    // Chiều dương của nhánh số nhiều — trước đây chỉ có chiều âm nên nhánh này là code chết.
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'They are effective on legal text.',
    });
    expect(f.some((x) => x.kind === 'DANGLING_PRONOUN')).toBe(true);
  });

  it('KHÔNG cờ đại từ số nhiều đi với danh từ số nhiều', () => {
    // Bất đối xứng cố ý: "These datasets" thì `datasets` là danh từ, có tiền ngữ.
    // Nhánh số nhiều vì thế chỉ nhận trợ động từ liệt kê tường minh.
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'These datasets contain statute passages.',
    });
    expect(f.some((x) => x.kind === 'DANGLING_PRONOUN')).toBe(false);
  });

  it('cờ từ định tính khi câu không có đại lượng nào', () => {
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'The retriever is not effective on legal text.',
    });
    expect(f.some((x) => x.kind === 'VAGUE_TERM')).toBe(true);
  });

  it('KHÔNG cờ khi từ định tính đã được neo bằng số trong cùng câu', () => {
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'The retriever improves recall@50 by 12 points on legal text.',
    });
    expect(f.some((x) => x.kind === 'VAGUE_TERM')).toBe(false);
  });

  it('mỗi thẻ nhiều nhất một cờ VAGUE_TERM', () => {
    const f = detectAmbiguity({
      type: 'PROBLEM',
      status: 'PROPOSED',
      title: 'x',
      body: 'It is effective. It is robust. It is scalable.',
    });
    expect(f.filter((x) => x.kind === 'VAGUE_TERM')).toHaveLength(1);
  });
});

describe('hạn mức câu hỏi — tiêu chí hoàn thành của #12', () => {
  const mk = (id: string, kind: 'CLAIM_FIELD_VAGUE' | 'VAGUE_TERM') =>
    buildQuestion(id, `card ${id}`, {
      kind,
      field: kind === 'CLAIM_FIELD_VAGUE' ? 'baseline' : null,
      excerpt: 'x',
      terms: ['effective'],
      reason: 'r',
    });

  it('không bao giờ trả nhiều hơn hạn mức', () => {
    const candidates = ['1', '2', '3', '4', '5', '6'].map((i) =>
      mk(i, 'VAGUE_TERM'),
    );
    expect(severityRanker(candidates, 2)).toHaveLength(2);
  });

  it('hết chỗ thì không hỏi câu nào', () => {
    expect(severityRanker([mk('1', 'VAGUE_TERM')], 0)).toEqual([]);
  });

  it('cờ nặng hơn được ưu tiên khi phải cắt', () => {
    const picked = severityRanker(
      [mk('nhẹ', 'VAGUE_TERM'), mk('nặng', 'CLAIM_FIELD_VAGUE')],
      1,
    );
    expect(picked[0].cardId).toBe('nặng');
  });

  it('hoà mức thì giữ nguyên thứ tự thẻ', () => {
    const picked = severityRanker(
      [mk('a', 'VAGUE_TERM'), mk('b', 'VAGUE_TERM')],
      1,
    );
    expect(picked[0].cardId).toBe('a');
  });

  it('hạn mức bám ĐÚNG trần của analyzeOutputSchema, không phải một số cứng', () => {
    // Bản đầu là `expect(MAX_OPEN_QUESTIONS).toBe(4)` — hằng số so với chính nó. Đổi schema
    // thành `.max(6)` thì bất biến mà comment tuyên bố vỡ **im lặng**. Đọc thẳng từ schema.
    const shape = analyzeOutputSchema.shape.clarifying_questions;
    const probe = Array.from({ length: MAX_OPEN_QUESTIONS }, () => ({
      question: 'q',
      options: [
        { key: 'A' as const, label: 'a', explain: '', example: '' },
        { key: 'B' as const, label: 'b', explain: '', example: '' },
      ],
    }));
    // Đúng bằng trần ⇒ hợp lệ; thêm một câu nữa ⇒ vượt trần.
    expect(shape.safeParse(probe).success).toBe(true);
    expect(shape.safeParse([...probe, probe[0]]).success).toBe(false);
  });
});

describe('câu hỏi sinh ra', () => {
  it('mỗi cờ ra câu hỏi tiếng Việt kèm hai phương án', () => {
    const q = buildQuestion('c1', 'Cross-domain retrieval', {
      kind: 'CLAIM_FIELD_VAGUE',
      field: 'baseline',
      excerpt: 'existing methods',
      terms: [],
      reason: 'r',
    });
    expect(q.question).toMatch(/so với cái gì/i);
    expect(q.options).toHaveLength(2);
    expect(q.options.some((o) => o.recommended)).toBe(true);
  });

  it('câu hỏi mang NGUYÊN reason của cờ — đường duy nhất lý do tới được người dùng', () => {
    // `Decision` chỉ có `question` và `options`, không có chỗ cho `reason`. Không ghép vào
    // `question` thì `AmbiguityFlag.reason` nằm im trong DB và người dùng chỉ thấy nhãn
    // `AMBIGUOUS` trống ngữ cảnh.
    const reason =
      'Trường `baseline` ghi "existing methods" — không nêu tên phương pháp nào.';
    const q = buildQuestion('c1', 'Cross-domain retrieval', {
      kind: 'CLAIM_FIELD_VAGUE',
      field: 'baseline',
      excerpt: 'existing methods',
      terms: [],
      reason,
    });
    expect(q.question).toContain(reason);
    // Và vẫn còn phần hỏi, không phải chỉ có lý do.
    expect(q.question).toMatch(/so với cái gì/i);
  });

  it('mọi loại cờ đều mang reason, không riêng CLAIM', () => {
    const kinds = [
      { kind: 'GAP_FIELD_VAGUE' as const, field: 'testable_experiment' },
      { kind: 'GAP_FIELD_VAGUE' as const, field: 'limitation' },
      { kind: 'DANGLING_PRONOUN' as const, field: null },
      { kind: 'VAGUE_TERM' as const, field: null },
      { kind: 'CLAIM_FIELD_VAGUE' as const, field: 'metric' },
    ];
    for (const k of kinds) {
      const q = buildQuestion('c1', 'thẻ X', {
        ...k,
        excerpt: 'x',
        terms: ['effective'],
        reason: `LÝ DO ${k.kind}/${k.field ?? 'body'}`,
      });
      expect(q.question).toContain(`LÝ DO ${k.kind}/${k.field ?? 'body'}`);
      expect(q.options).toHaveLength(2);
    }
  });

  it('topFinding chọn cờ nặng nhất', () => {
    const top = topFinding([
      { kind: 'VAGUE_TERM', field: null, excerpt: 'x', terms: [], reason: 'r' },
      {
        kind: 'CLAIM_FIELD_VAGUE',
        field: 'metric',
        excerpt: 'y',
        terms: [],
        reason: 'r',
      },
    ]);
    expect(top?.kind).toBe('CLAIM_FIELD_VAGUE');
  });
});
