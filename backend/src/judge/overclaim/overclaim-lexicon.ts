/**
 * Từ điển của tầng luật B1 — **0 token**, không gọi LLM lần nào.
 *
 * Đề bài (#7) liệt kê ví dụ bằng tiếng bản địa. Nhưng `prompts/generator.md` §"Language rule"
 * bắt **mọi `title` / `body` / `payload` của card phải là tiếng Anh**, và giao diện cũng đã
 * chuyển hẳn sang tiếng Anh — nên từ điển chỉ còn **tiếng Anh**, kể cả cho card `origin = USER`.
 */

/** Một mục từ điển: regex bắt cụm, và cụm thay thế dùng khi dựng câu thu hẹp đề xuất. */
export type LexEntry = {
  /** Có `g` + `i`: dùng cho cả `match` lẫn `replace`. */
  pattern: RegExp;
  /** Tên gọi ngắn của cụm, đi vào `matched_terms` để người đọc biết vì sao bị cờ. */
  label: string;
};

/**
 * Từ chỉ **phạm vi**: khẳng định áp cho toàn bộ một tập, không giới hạn.
 * Đây là nhóm nguy hiểm nhất — nó biến một kết quả đo trên một domain thành lời hứa phổ quát.
 */
export const SCOPE_TERMS: LexEntry[] = [
  { pattern: /\ball\s+(?:the\s+)?domains?\b/gi, label: 'all domains' },
  { pattern: /\ball\s+(?:the\s+)?languages?\b/gi, label: 'all languages' },
  { pattern: /\ball\s+(?:the\s+)?datasets?\b/gi, label: 'all datasets' },
  { pattern: /\ball\s+(?:the\s+)?tasks?\b/gi, label: 'all tasks' },
  { pattern: /\ball\s+(?:the\s+)?models?\b/gi, label: 'all models' },
  // `every` phải gắn danh từ chỉ phạm vi. Để `every \w+` trần thì "for every configuration we
  // train" — một câu mô tả thí nghiệm hoàn toàn bình thường — cũng bị cờ.
  {
    pattern:
      /\bevery\s+(?:\w+\s+)?(?:domains?|languages?|datasets?|corpora|corpus|tasks?|models?|inputs?|settings?|cases?|benchmarks?)\b/gi,
    label: 'every …',
  },
  {
    pattern: /\bany\s+(?:domain|language|dataset|task|model|input)\b/gi,
    label: 'any …',
  },
  { pattern: /\barbitrary\s+\w+/gi, label: 'arbitrary …' },
  { pattern: /\buniversal(?:ly)?\b/gi, label: 'universal' },
  { pattern: /\bacross\s+domains\b/gi, label: 'across domains' },
  { pattern: /\bacross\s+(?:all|every)\s+\w+/gi, label: 'across all …' },
  {
    pattern: /\bin\s+all\s+(?:settings?|cases?|scenarios?)\b/gi,
    label: 'in all settings',
  },
  {
    pattern: /\bgeneral(?:ly)?\s+applicable\b/gi,
    label: 'generally applicable',
  },
  { pattern: /\bdomain[- ]agnostic\b/gi, label: 'domain-agnostic' },
  { pattern: /\blanguage[- ]agnostic\b/gi, label: 'language-agnostic' },
  { pattern: /\bmodel[- ]agnostic\b/gi, label: 'model-agnostic' },
  {
    pattern: /\bgeneraliz(?:es?|ing|ation)\s+(?:to|across|beyond)\b/gi,
    label: 'generalizes to/across',
  },
  {
    pattern: /\bbroadly\s+(?:applicable|useful)\b/gi,
    label: 'broadly applicable',
  },
  { pattern: /\balways\b/gi, label: 'always' },
  { pattern: /\bnever\s+fails?\b/gi, label: 'never fails' },
  { pattern: /\bregardless\s+of\b/gi, label: 'regardless of' },
  { pattern: /\bfor\s+any\b/gi, label: 'for any' },
];

/**
 * Từ chỉ **mức**: khẳng định về độ lớn của cải thiện. Không tự nó là phóng đại — chỉ thành
 * phóng đại khi thí nghiệm không có baseline hoặc metric để đo cái mức đó.
 */
export const MAGNITUDE_TERMS: LexEntry[] = [
  { pattern: /\bsignificantly\b/gi, label: 'significantly' },
  { pattern: /\bsubstantially\b/gi, label: 'substantially' },
  { pattern: /\bdramatically\b/gi, label: 'dramatically' },
  { pattern: /\bvastly\b/gi, label: 'vastly' },
  {
    pattern: /\bfar\s+(?:exceeds?|better|outperforms?|surpasses?)\b/gi,
    label: 'far exceeds',
  },
  {
    pattern: /\boutperforms?\s+(?:all|every|any)\b/gi,
    label: 'outperforms all',
  },
  { pattern: /\bstate[- ]of[- ]the[- ]art\b/gi, label: 'state-of-the-art' },
  { pattern: /\bbest[- ]in[- ]class\b/gi, label: 'best-in-class' },
  {
    pattern: /\bconsistently\s+(?:outperforms?|beats?|improves?|better)\b/gi,
    label: 'consistently outperforms',
  },
  { pattern: /\bsuperior\s+to\b/gi, label: 'superior to' },
  { pattern: /\borders?\s+of\s+magnitude\b/gi, label: 'orders of magnitude' },
];

/** Bằng chứng trong `ExperimentPlan` cho thấy có so sánh thật — dùng để bác cờ "mức". */
export const BASELINE_MARKERS =
  /\b(?:baseline|compared?\s+(?:to|with|against)|ablation|control\s+group|vs\.?|versus)\b/i;

/** Bằng chứng có metric đo được — cũng dùng để bác cờ "mức". */
export const METRIC_MARKERS =
  /\b(?:accuracy|f1|bleu|rouge|precision|recall|auc|em\b|exact\s+match|latency|throughput|perplexity|win\s+rate|score)\b/i;

/** Số viết bằng chữ — claim hay viết "three domains" chứ không viết "3 domains". */
export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  a: 1,
  an: 1,
  single: 1,
};

/**
 * Ba chiều phạm vi mà #7 yêu cầu đối chiếu. `entity` là các từ khoá dùng để nhặt tên riêng
 * trong `ExperimentPlan` — ví dụ "on the SQuAD dataset" cho ra một dataset tên `SQuAD`.
 */
export const SCOPE_DIMENSIONS = [
  {
    key: 'domains' as const,
    label: 'domain',
    noun: /\b(?:domains?|languages?|verticals?|settings?)\b/gi,
  },
  {
    key: 'datasets' as const,
    label: 'dataset',
    noun: /\b(?:datasets?|corpora|corpus|benchmarks?|test\s+sets?)\b/gi,
  },
  {
    key: 'models' as const,
    label: 'model',
    noun: /\b(?:models?|llms?|backbones?|encoders?|architectures?)\b/gi,
  },
];

export type ScopeDimension = (typeof SCOPE_DIMENSIONS)[number]['key'];
