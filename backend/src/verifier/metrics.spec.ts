import {
  auditorBlockingIssues,
  citationMetrics,
  claimedCitationMetrics,
  conflictDetected,
  evidencePrecisionHuman,
  fullTextHitRate,
  jsonValidityByGroup,
  lowCredibilityClaimRate,
  meanStd,
  type CitationPair,
} from './metrics';

const pair = (
  support_label: CitationPair['support_label'],
  flags: string[] = [],
): CitationPair => ({ support_label, flags });

describe('citationMetrics', () => {
  it('tách bịa nguồn khỏi nguồn-thật-không-chống-lưng', () => {
    const m = citationMetrics([
      pair('UNSUPPORTED', ['SOURCE_NOT_FOUND']),
      pair('UNSUPPORTED'),
      pair('WEAK'),
      pair('SUPPORTED'),
    ]);

    expect(m.total).toBe(4);
    expect(m.not_found).toBe(1);
    expect(m.fabrication_rate).toBeCloseTo(0.25);
    expect(m.citation_validity).toBeCloseTo(0.75);
    // Mẫu số là 3 cặp nguồn-thật, không phải 4: cặp bịa đã được đếm ở fabrication_rate.
    expect(m.unsupported_rate).toBeCloseTo(1 / 3);
  });

  it('không đếm hai lần: cặp bịa nguồn bị loại khỏi mẫu số của unsupported_rate', () => {
    const m = citationMetrics([
      pair('UNSUPPORTED', ['SOURCE_NOT_FOUND']),
      pair('UNSUPPORTED', ['SOURCE_NOT_FOUND']),
    ]);
    expect(m.fabrication_rate).toBe(1);
    // Không còn cặp nguồn-thật nào ⇒ câu hỏi "abstract có nói điều đó không" không có nghĩa.
    expect(m.unsupported_rate).toBeNull();
  });

  it('version không có cặp nào thì mọi metric là null, không phải 0', () => {
    const m = citationMetrics([]);
    expect(m.fabrication_rate).toBeNull();
    expect(m.citation_validity).toBeNull();
    expect(m.unsupported_rate).toBeNull();
  });
});

describe('claimedCitationMetrics — arm B1', () => {
  it('đo tỉ lệ tra ra được, và để unsupported_rate là null', () => {
    const m = claimedCitationMetrics({ claimed: 5, resolved: 2 });
    expect(m.citation_validity).toBeCloseTo(0.4);
    expect(m.fabrication_rate).toBeCloseTo(0.6);
    // Điểm chính của T6: B1 **không** được báo 1.0 rồi đặt cạnh 0.917 của B2 như thể
    // hai con số trả lời cùng một câu hỏi.
    expect(m.unsupported_rate).toBeNull();
  });

  it('không có trích dẫn nào thì không suy ra gì', () => {
    expect(claimedCitationMetrics({ claimed: 0, resolved: 0 })).toMatchObject({
      fabrication_rate: null,
      citation_validity: null,
      unsupported_rate: null,
    });
  });
});

describe('jsonValidityByGroup', () => {
  it('retry của verifier không dìm điểm của generator', () => {
    const v = jsonValidityByGroup([
      { purpose: 'DECOMPOSE', attempts: 1 },
      { purpose: 'GAP', attempts: 1 },
      { purpose: 'ENTAILMENT', attempts: 2 },
      { purpose: 'ENTAILMENT', attempts: 3 },
      { purpose: 'JUDGE', attempts: 1 },
    ]);

    expect(v.generator).toBe(1);
    expect(v.entailment).toBe(0);
    expect(v.judge).toBe(1);
    expect(v.all).toBeCloseTo(0.6);
  });

  it('nhóm không có lời gọi nào thì là null', () => {
    const v = jsonValidityByGroup([{ purpose: 'JUDGE', attempts: 1 }]);
    expect(v.generator).toBeNull();
    expect(v.entailment).toBeNull();
  });
});

describe('auditorBlockingIssues', () => {
  it('trung bình CRITICAL + MAJOR trên các bản auditor đã chấm', () => {
    expect(
      auditorBlockingIssues([
        { severity_counts: { CRITICAL: 1, MAJOR: 2, MINOR: 9 } },
        { severity_counts: { CRITICAL: 0, MAJOR: 1, MINOR: 0 } },
      ]),
    ).toBe(2);
  });

  it('chưa chạy auditor thì là null, không phải 0', () => {
    expect(auditorBlockingIssues([])).toBeNull();
  });

  it('không đổ khi severity_counts méo', () => {
    expect(auditorBlockingIssues([{ severity_counts: null }])).toBe(0);
  });
});

describe('meanStd', () => {
  it('bỏ qua ô null và báo n thật', () => {
    const s = meanStd([1, null, 3]);
    expect(s.mean).toBe(2);
    expect(s.n).toBe(2);
    // std mẫu của {1, 3} = sqrt(((1-2)² + (3-2)²)/1) = sqrt(2)
    expect(s.std).toBeCloseTo(Math.SQRT2);
  });

  it('n = 1 thì std = 0 — và n cho người đọc biết đó không phải phương sai thấp', () => {
    expect(meanStd([0.4])).toEqual({ mean: 0.4, std: 0, n: 1 });
  });

  it('toàn null thì n = 0', () => {
    expect(meanStd([null, null])).toEqual({ mean: 0, std: 0, n: 0 });
  });
});

describe('khoá metric mới của làn A (#6)', () => {
  it('tỉ lệ lấy được toàn văn đếm đúng trên tổng số nguồn, không phải trên số lần thử', () => {
    expect(fullTextHitRate(['OK', 'NOT_ARXIV', 'NOT_FOUND'], 6)).toBeCloseTo(
      1 / 6,
    );
    expect(fullTextHitRate([], 0)).toBeNull();
  });

  it('phân biệt "không có thẻ nào để đo" với "đo được và bằng không"', () => {
    expect(lowCredibilityClaimRate([])).toBeNull();
    expect(lowCredibilityClaimRate([{ tiers: [] }])).toBeNull();
    expect(lowCredibilityClaimRate([{ tiers: ['HIGH'] }])).toBe(0);
  });

  it('chỉ tính thẻ mà **mọi** nguồn đều ở mức thấp', () => {
    const rate = lowCredibilityClaimRate([
      { tiers: ['REVIEW', 'REVIEW'] },
      { tiers: ['REVIEW', 'HIGH'] },
    ]);
    expect(rate).toBe(0.5);
  });

  it('chưa gán nhãn người thì trả null chứ không trả 0', () => {
    expect(evidencePrecisionHuman([])).toBeNull();
    expect(evidencePrecisionHuman([{ match: true }, { match: false }])).toBe(
      0.5,
    );
  });

  it('số xung đột bắt được không bao giờ null — 0 là một phép đo thật', () => {
    expect(conflictDetected(0)).toBe(0);
  });
});
