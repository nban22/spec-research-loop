/**
 * Hàm thuần cho similarity map của issue #16: TF-IDF → cosine → chiếu xuống 2 chiều bằng MDS cổ
 * điển. Không I/O, không DI, không LLM — nhờ vậy test được thẳng, không cần mock gì.
 *
 * **Vì sao không dùng `EmbedderService` của làn A:** ràng buộc độc lập của #16. Làn A còn đang sửa
 * file đó; buộc bản đồ nguồn phụ thuộc vào nó là hai nhánh chặn nhau vì một tính năng chỉ-đọc.
 * TF-IDF thua embedding về chất lượng ngữ nghĩa, nhưng thứ bản đồ này cần là **khoảng cách tương
 * đối giữa các paper trong cùng một dự án** — n cỡ vài chục, cùng một lĩnh vực, và tiêu đề +
 * abstract đều là tiếng Anh. Trong bối cảnh đó trùng từ khoá đã đủ tách cụm chủ đề.
 */

/** Từ nối tiếng Anh: xuất hiện ở mọi abstract nên chỉ làm nhiễu, không tách được cụm nào. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'on',
  'for',
  'to',
  'with',
  'by',
  'as',
  'at',
  'from',
  'that',
  'this',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'we',
  'our',
  'they',
  'their',
  'can',
  'may',
  'not',
  'but',
  'than',
  'then',
  'which',
  'while',
  'also',
  'such',
  'both',
  'each',
  'other',
  'more',
  'most',
  'into',
  'over',
  'via',
  'using',
  'used',
  'use',
  'based',
  'show',
  'shows',
  'shown',
  'propose',
  'proposed',
  'paper',
  'papers',
  'approach',
  'method',
  'methods',
  'results',
  'result',
  'however',
]);

/** Cắt từ: hạ chữ thường, bỏ mọi thứ không phải chữ/số, bỏ từ ngắn và stopword. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export type Vector = Map<string, number>;

/**
 * TF-IDF **đã chuẩn hoá L2**, nên cosine chỉ còn là tích vô hướng.
 *
 * IDF dùng dạng làm mượt `ln(1 + n/df)`: với n nhỏ, dạng `ln(n/df)` cho **0** với từ xuất hiện ở
 * mọi tài liệu, mà khi chỉ có 3–4 nguồn thì điều đó xoá sạch phần lớn từ vựng.
 */
export function tfidf(docs: string[]): Vector[] {
  const tokenized = docs.map(tokenize);
  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const n = docs.length;
  return tokenized.map((toks) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);

    const vec: Vector = new Map();
    let norm = 0;
    for (const [t, count] of tf) {
      const w = (1 + Math.log(count)) * Math.log(1 + n / (df.get(t) ?? 1));
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  });
}

/** Cosine của hai vector đã chuẩn hoá L2. Duyệt vector ngắn hơn — thưa thì rẻ hơn hẳn. */
export function cosine(a: Vector, b: Vector): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const other = big.get(t);
    if (other !== undefined) dot += w * other;
  }
  return dot;
}

export type Point = { x: number; y: number };

/**
 * MDS cổ điển: ma trận khoảng cách → toạ độ 2 chiều giữ khoảng cách tốt nhất có thể.
 *
 * Chọn MDS chứ không t-SNE/UMAP vì ba lý do: **tất định** (cùng dữ liệu ra cùng bản đồ, không có
 * seed ngẫu nhiên), không thêm dependency, và **giữ khoảng cách toàn cục** — cái người dùng cần
 * đọc ở đây là *vùng thưa*, mà t-SNE cố tình bóp méo đúng phần đó.
 *
 * `n` ở đây là số nguồn của một dự án (vài chục), nên O(n³) của phép lặp luỹ thừa không đáng lo.
 */
export function mds2d(dist: number[][]): Point[] {
  const n = dist.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  // Nhân đôi tâm: B = -½ · J · D² · J. Đây là bước biến khoảng cách thành tích vô hướng.
  const sq = dist.map((row) => row.map((d) => d * d));
  const rowMean = sq.map((row) => row.reduce((s, v) => s + v, 0) / n);
  const grand = rowMean.reduce((s, v) => s + v, 0) / n;
  const b = sq.map((row, i) =>
    row.map((v, j) => -0.5 * (v - rowMean[i] - rowMean[j] + grand)),
  );

  const axes: { vec: number[]; value: number }[] = [];
  for (let k = 0; k < 2; k++) {
    const { vec, value } = topEigen(b, k);
    axes.push({ vec, value });
    // Khử thành phần vừa lấy để lần lặp sau tìm trục vuông góc với nó.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) b[i][j] -= value * vec[i] * vec[j];
    }
  }

  const scale = axes.map((a) => Math.sqrt(Math.max(0, a.value)));
  const pts = Array.from({ length: n }, (_, i) => ({
    x: axes[0].vec[i] * scale[0],
    y: axes[1].vec[i] * scale[1],
  }));
  return normalize(pts);
}

/**
 * Phép lặp luỹ thừa tìm trị riêng lớn nhất. Vector khởi tạo là **hằng số theo `seed`**, không
 * ngẫu nhiên: bản đồ phải giống hệt nhau giữa hai lần mở, nếu không người dùng tưởng dữ liệu đổi.
 */
function topEigen(
  m: number[][],
  seed: number,
): { vec: number[]; value: number } {
  const n = m.length;
  let v = Array.from(
    { length: n },
    (_, i) => Math.cos((i + 1) * (seed + 1) * 0.7) + 0.5,
  );
  let value = 0;

  for (let iter = 0; iter < 200; iter++) {
    const next = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += m[i][j] * v[j];
      next[i] = s;
    }
    const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-12) return { vec: new Array<number>(n).fill(0), value: 0 };
    for (let i = 0; i < n; i++) next[i] /= norm;

    const delta = next.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
    v = next;
    value = norm;
    if (delta < 1e-10) break;
  }
  return { vec: v, value };
}

/** Ép về hộp [-1, 1] giữ đúng tỉ lệ hai trục — co riêng từng trục là bóp méo hình dạng cụm. */
function normalize(pts: Point[]): Point[] {
  const span = Math.max(
    ...pts.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]),
    1e-9,
  );
  return pts.map((p) => ({ x: p.x / span, y: p.y / span }));
}

/**
 * Độ **thưa** quanh mỗi điểm: khoảng cách trung bình tới `k` nguồn gần nhất, ép về [0, 1].
 *
 * Đây là phần trả lời trực tiếp cho §8 của đề ("cách phát hiện research gap"): điểm thưa = chủ đề
 * ít paper vây quanh = chỗ đáng ngờ có gap. Trả số thô cho frontend tô màu, **không** tự phán
 * "đây là gap" — kết luận đó là việc của người đọc bản đồ, và của làn B.
 */
export function sparsity(dist: number[][], k = 3): number[] {
  const n = dist.length;
  if (n <= 1) return new Array<number>(n).fill(0);

  const raw = dist.map((row, i) => {
    const others = row.filter((_, j) => j !== i).sort((a, b) => a - b);
    const take = others.slice(0, Math.min(k, others.length));
    return take.reduce((s, d) => s + d, 0) / take.length;
  });

  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  if (hi - lo < 1e-9) return new Array<number>(n).fill(0);
  return raw.map((v) => (v - lo) / (hi - lo));
}
