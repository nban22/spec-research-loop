import { CredibilityInput, scoreSource } from './credibility';
import { rankVenue, UNRANKED_SCORE } from './venue-rank';

const NOW = new Date('2026-08-31T00:00:00Z');

function source(over: Partial<CredibilityInput> = {}): CredibilityInput {
  return {
    citation_count: 10,
    year: 2022,
    doi_verified: true,
    abstract: 'x'.repeat(600),
    venue: 'Some Regional Symposium',
    retrieved_from: 'SEMANTIC_SCHOLAR',
    ...over,
  };
}

describe('chấm độ tin cậy của nguồn', () => {
  it('xếp mức cao cho bài hội nghị lớn, mới, nhiều trích dẫn', () => {
    const r = scoreSource(
      source({
        citation_count: 200,
        year: 2024,
        venue: 'NeurIPS 2024',
        abstract: 'x'.repeat(900),
      }),
      NOW,
    );
    expect(r.tier).toBe('HIGH');
    expect(r.total).toBeGreaterThan(0.62);
  });

  it('xếp mức cần cân nhắc cho bài cũ, không DOI, không tóm tắt', () => {
    const r = scoreSource(
      source({
        citation_count: 0,
        year: 2009,
        doi_verified: false,
        abstract: null,
        venue: null,
        retrieved_from: 'OPENALEX',
      }),
      NOW,
    );
    expect(r.tier).toBe('REVIEW');
  });

  it('không phạt "registry không tra được" nặng như "DOI sai"', () => {
    const unknown = scoreSource(source({ doi_verified: null }), NOW);
    const wrong = scoreSource(source({ doi_verified: false }), NOW);
    const ok = scoreSource(source({ doi_verified: true }), NOW);
    expect(unknown.total).toBeGreaterThan(wrong.total);
    expect(unknown.total).toBeLessThan(ok.total);
  });

  it('luôn kèm một câu giải thích đọc được, không phải số thô', () => {
    const r = scoreSource(source(), NOW);
    expect(r.reason.length).toBeGreaterThan(10);
    expect(r.reason).not.toMatch(/\d\.\d{2}/);
  });

  it('nói rõ khi nguồn là bản tiền ấn', () => {
    const r = scoreSource(source({ venue: 'arXiv preprint' }), NOW);
    expect(r.reason).toContain('bản tiền ấn');
  });

  it('không đọc năm xuất bản thì không sập, chỉ mất điểm độ mới', () => {
    const withYear = scoreSource(source({ year: 2024 }), NOW);
    const noYear = scoreSource(source({ year: null }), NOW);
    expect(Number.isFinite(noYear.total)).toBe(true);
    expect(noYear.total).toBeLessThan(withYear.total);
  });
});

describe('bảng tra hạng nơi công bố', () => {
  it('venue không tra được nhận điểm nền chứ không phải 0', () => {
    expect(rankVenue('Kỷ yếu hội thảo nội bộ')).toEqual({
      score: UNRANKED_SCORE,
      label: null,
    });
    expect(rankVenue(null).score).toBe(UNRANKED_SCORE);
  });

  it('bài hội nghị lớn có bản arXiv vẫn tính theo hội nghị', () => {
    // Luật `arxiv` cố tình đứng cuối bảng — hit đầu tiên thắng.
    expect(rankVenue('NeurIPS 2024 (arXiv mirror)').label).toBe('NeurIPS');
  });

  it('workshop thấp hơn hội nghị chính nhưng cao hơn bản tiền ấn', () => {
    const ws = rankVenue('ACL 2024 Workshop on Something').score;
    const pre = rankVenue('arXiv').score;
    expect(rankVenue('ACL 2024').score).toBeGreaterThan(ws);
    expect(ws).toBeGreaterThan(pre);
  });
});
