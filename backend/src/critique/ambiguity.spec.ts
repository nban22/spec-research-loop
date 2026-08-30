import { detectAmbiguity, topFinding, type AmbiguityInput } from './ambiguity';
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

  it('hạn mức bằng đúng số câu hỏi tối đa của bước analyze', () => {
    // `analyzeOutputSchema.clarifying_questions` là `.min(1).max(4)`. B6 **giành chỗ** trong
    // cùng ngần ấy slot chứ không được cấp thêm — đó là điều #12 đòi.
    expect(MAX_OPEN_QUESTIONS).toBe(4);
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
