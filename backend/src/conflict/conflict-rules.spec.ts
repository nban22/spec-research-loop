import {
  ConflictSide,
  detectCrossCardConflict,
  detectSourceConflict,
  polarityOf,
  topConflict,
} from './conflict-rules';

function side(over: Partial<ConflictSide> = {}): ConflictSide {
  return {
    cardId: 'card-1',
    cardSourceId: `cs-${Math.random()}`,
    sourceId: 'src-1',
    supportLabel: 'WEAK',
    entailment: null,
    evidenceSentence: null,
    fallbackText: '',
    ...over,
  };
}

describe('suy cực của một cặp claim–nguồn', () => {
  it('coi đường tắt L3 là ủng hộ dù entailment còn null', () => {
    // Cặp vượt tau_high không bao giờ gọi L4 ⇒ entailment null nhưng nhãn là SUPPORTED.
    // Không có luật này thì ca mâu thuẫn kinh điển không bao giờ bị bắt.
    expect(
      polarityOf(side({ supportLabel: 'SUPPORTED', entailment: null })),
    ).toBe('PRO');
  });

  it('không coi "thiếu bằng chứng" là phản bác', () => {
    expect(polarityOf(side({ entailment: 'NOT_ENTAILED' }))).toBe('NEUTRAL');
    expect(polarityOf(side({ entailment: 'PARTIAL' }))).toBe('NEUTRAL');
  });
});

describe('tầng luật — tín hiệu cực', () => {
  it('bắt được nguồn ủng hộ chỏi nguồn phản bác, và đánh dấu là chắc chắn', () => {
    const a = side({
      cardSourceId: 'cs-a',
      supportLabel: 'SUPPORTED',
      entailment: null,
      fallbackText: 'Hybrid retrieval outperforms BM25 on legal text.',
    });
    const b = side({
      cardSourceId: 'cs-b',
      sourceId: 'src-2',
      entailment: 'CONTRADICTS',
      fallbackText: 'Hybrid retrieval does not outperform BM25 on legal text.',
    });
    const top = topConflict(detectSourceConflict(a, b));
    expect(top?.kind).toBe('POLARITY');
    expect(top?.decisive).toBe(true);
  });

  it('mọi nguồn cùng phản bác thì không phải mâu thuẫn — chúng đồng ý với nhau', () => {
    const a = side({ cardSourceId: 'cs-a', entailment: 'CONTRADICTS' });
    const b = side({
      cardSourceId: 'cs-b',
      sourceId: 'src-2',
      entailment: 'CONTRADICTS',
    });
    expect(detectSourceConflict(a, b)).toEqual([]);
  });
});

describe('tầng luật — tín hiệu số học', () => {
  const withText = (id: string, text: string) =>
    side({ cardSourceId: id, sourceId: id, fallbackText: text });

  it('bắt hai con số khác nhau của cùng một metric', () => {
    const findings = detectSourceConflict(
      withText('a', 'The method improves recall@50 by 12% on legal statutes.'),
      withText('b', 'The method reduces recall@50 by 4% on legal statutes.'),
    );
    const numeric = findings.find((f) => f.kind === 'NUMERIC');
    expect(numeric).toBeDefined();
    expect(numeric?.terms).toContain('recall');
    // Không bao giờ decisive: hai con số khác nhau có thể là hai hệ thống khác nhau.
    expect(numeric?.decisive).toBe(false);
  });

  it('không so số khi hai câu nói về hai metric khác nhau', () => {
    // Đây là nguồn dương tính giả lớn nhất nếu thiếu cổng tên metric.
    const findings = detectSourceConflict(
      withText('a', 'Our system reaches 83% accuracy on the benchmark.'),
      withText('b', 'Our system reduces latency by 40% on the benchmark.'),
    );
    expect(findings.find((f) => f.kind === 'NUMERIC')).toBeUndefined();
  });

  it('bỏ qua chênh lệch trong ngưỡng nhiễu làm tròn', () => {
    const findings = detectSourceConflict(
      withText('a', 'It reaches 90% accuracy overall.'),
      withText('b', 'It reaches 88% accuracy overall.'),
    );
    expect(findings.find((f) => f.kind === 'NUMERIC')).toBeUndefined();
  });
});

describe('tầng luật — tín hiệu chiều', () => {
  const withText = (id: string, text: string) =>
    side({ cardSourceId: id, sourceId: id, fallbackText: text });

  it('lật cực khi gặp phủ định: "does not improve" là chiều âm', () => {
    const findings = detectSourceConflict(
      withText(
        'a',
        'Reranking improves answer quality for Vietnamese statutes.',
      ),
      withText(
        'b',
        'Reranking does not improve answer quality for Vietnamese statutes.',
      ),
    );
    const dir = findings.find((f) => f.kind === 'DIRECTION');
    expect(dir).toBeDefined();
    expect(dir?.decisive).toBe(false);
  });

  it('không báo mâu thuẫn khi hai câu nói về hai chuyện khác nhau', () => {
    // Cổng cùng chủ đề: thiếu nó thì một túi từ trái nghĩa nổ liên tục.
    const findings = detectSourceConflict(
      withText(
        'a',
        'Compression increases the throughput of the storage layer.',
      ),
      withText(
        'b',
        'The annotation guideline reduces disagreement among judges.',
      ),
    );
    expect(findings.find((f) => f.kind === 'DIRECTION')).toBeUndefined();
  });

  it('hai câu cùng phủ định thì không mâu thuẫn', () => {
    const findings = detectSourceConflict(
      withText('a', 'Reranking does not improve answer quality on legal text.'),
      withText('b', 'Reranking fails to improve answer quality on legal text.'),
    );
    expect(findings.find((f) => f.kind === 'DIRECTION')).toBeUndefined();
  });
});

describe('mâu thuẫn giữa hai thẻ qua cùng một nguồn', () => {
  it('chỉ báo khi đúng cùng một nguồn và khác thẻ', () => {
    const a = side({
      cardId: 'card-1',
      cardSourceId: 'cs-a',
      sourceId: 'shared',
      supportLabel: 'SUPPORTED',
    });
    const b = side({
      cardId: 'card-2',
      cardSourceId: 'cs-b',
      sourceId: 'shared',
      entailment: 'CONTRADICTS',
    });
    expect(detectCrossCardConflict(a, b)?.kind).toBe('POLARITY');
    expect(detectCrossCardConflict(a, { ...b, cardId: 'card-1' })).toBeNull();
    expect(detectCrossCardConflict(a, { ...b, sourceId: 'other' })).toBeNull();
  });
});

describe('chọn tín hiệu mạnh nhất', () => {
  it('ưu tiên tín hiệu chắc chắn hơn tín hiệu chỉ để đề cử', () => {
    const a = side({
      cardSourceId: 'cs-a',
      supportLabel: 'SUPPORTED',
      fallbackText: 'The method improves recall@50 by 12% on legal statutes.',
    });
    const b = side({
      cardSourceId: 'cs-b',
      sourceId: 'src-2',
      entailment: 'CONTRADICTS',
      fallbackText: 'The method reduces recall@50 by 4% on legal statutes.',
    });
    const findings = detectSourceConflict(a, b);
    expect(findings.length).toBeGreaterThan(1);
    expect(topConflict(findings)?.kind).toBe('POLARITY');
  });

  it('không có tín hiệu nào thì trả null', () => {
    expect(topConflict([])).toBeNull();
  });
});
