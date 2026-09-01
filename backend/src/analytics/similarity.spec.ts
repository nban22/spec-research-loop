import { cosine, mds2d, sparsity, tfidf, tokenize } from './similarity';

/**
 * Hàm thuần nên test thẳng, không mock gì. Trọng tâm là ba tính chất mà bản đồ dựa vào:
 * **tất định**, **giữ được thứ tự khoảng cách**, và **không vỡ ở n nhỏ**.
 */

/** Khoảng cách Euclid giữa hai điểm trên bản đồ 2 chiều. */
function d2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ma trận khoảng cách `1 - cosine` từ một danh sách văn bản. */
function distOf(docs: string[]): number[][] {
  const v = tfidf(docs);
  return v.map((a) => v.map((b) => 1 - cosine(a, b)));
}

describe('tokenize', () => {
  it('bỏ stopword, bỏ từ dưới 3 ký tự và hạ chữ thường', () => {
    expect(tokenize('The Transformer is a Neural Network of AI')).toEqual([
      'transformer',
      'neural',
      'network',
    ]);
  });

  it('cắt ở mọi ký tự không phải chữ số', () => {
    // `based` là stopword, `re` dưới 3 ký tự — cả hai rụng sau khi đã cắt đúng.
    expect(tokenize('graph-based re_ranking (BM25)')).toEqual([
      'graph',
      'ranking',
      'bm25',
    ]);
  });
});

describe('tfidf + cosine', () => {
  it('văn bản giống hệt nhau có cosine bằng 1', () => {
    const [a, b] = tfidf([
      'neural machine translation',
      'neural machine translation',
    ]);
    expect(cosine(a, b)).toBeCloseTo(1, 6);
  });

  it('văn bản không chung từ nào có cosine bằng 0', () => {
    const [a, b] = tfidf([
      'neural machine translation',
      'concrete bridge inspection',
    ]);
    expect(cosine(a, b)).toBeCloseTo(0, 6);
  });

  it('cùng chủ đề gần nhau hơn khác chủ đề', () => {
    const [nmt, transformer, bridge] = tfidf([
      'neural machine translation with attention',
      'attention based neural translation model',
      'concrete bridge crack inspection with drones',
    ]);
    expect(cosine(nmt, transformer)).toBeGreaterThan(cosine(nmt, bridge));
  });

  it('văn bản rỗng cho vector rỗng chứ không chia cho 0', () => {
    const [empty] = tfidf(['', 'neural machine translation']);
    expect(empty.size).toBe(0);
    expect(Number.isNaN(cosine(empty, empty))).toBe(false);
  });
});

describe('mds2d', () => {
  it('cùng đầu vào cho cùng bản đồ — không có seed ngẫu nhiên', () => {
    const dist = distOf([
      'neural machine translation attention',
      'attention transformer translation',
      'concrete bridge crack inspection',
      'drone based bridge survey',
    ]);
    expect(mds2d(dist)).toEqual(mds2d(dist));
  });

  it('giữ thứ tự khoảng cách: hai paper cùng chủ đề vẽ gần nhau hơn paper khác ngành', () => {
    const pts = mds2d(
      distOf([
        'neural machine translation with attention mechanism',
        'attention based neural translation transformer model',
        'concrete bridge crack detection using drones and vision',
      ]),
    );
    expect(d2(pts[0], pts[1])).toBeLessThan(d2(pts[0], pts[2]));
  });

  it('mọi toạ độ nằm trong hộp [-1, 1]', () => {
    const pts = mds2d(
      distOf(['alpha beta gamma', 'beta gamma delta', 'zulu yankee xray']),
    );
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('không vỡ ở n = 0, 1, 2', () => {
    expect(mds2d([])).toEqual([]);
    expect(mds2d([[0]])).toEqual([{ x: 0, y: 0 }]);
    expect(mds2d(distOf(['alpha beta', 'gamma delta'])).length).toBe(2);
  });

  it('mọi nguồn giống hệt nhau thì không sinh NaN', () => {
    const pts = mds2d(
      distOf(['same text here', 'same text here', 'same text here']),
    );
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('sparsity', () => {
  it('nguồn lạc lõng thưa hơn nguồn nằm giữa cụm', () => {
    const spread = sparsity(
      distOf([
        'neural machine translation attention',
        'attention neural translation transformer',
        'neural translation attention model',
        'concrete bridge crack drone inspection',
      ]),
    );
    expect(spread[3]).toBeGreaterThan(spread[0]);
    expect(spread[3]).toBeCloseTo(1, 6);
  });

  it('mọi nguồn cách đều nhau thì trả 0 hết, không chia cho 0', () => {
    const spread = sparsity(distOf(['alpha one', 'beta two', 'gamma three']));
    expect(spread).toEqual([0, 0, 0]);
  });

  it('không vỡ ở n <= 1', () => {
    expect(sparsity([])).toEqual([]);
    expect(sparsity([[0]])).toEqual([0]);
  });
});
