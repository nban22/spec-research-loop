/**
 * Từ điển của bộ bắt thẻ mơ hồ (#12) — **0 token**.
 *
 * Cùng bài học ngôn ngữ với #7: đề bài liệt ví dụ bằng tiếng bản địa, nhưng
 * `prompts/generator.md` §"Language rule" bắt mọi `title`/`body`/`payload` của card phải là
 * **tiếng Anh**, và toàn bộ giao diện cũng đã chuyển sang tiếng Anh — nên từ điển chỉ còn
 * tiếng Anh, kể cả cho card `origin = USER`.
 */

export type LexEntry = { pattern: RegExp; label: string };

/**
 * Từ **định tính không đo được**. Chúng chỉ mơ hồ khi **không có đại lượng đo được đi kèm** —
 * "improves accuracy by 12 points" hoàn toàn hợp lệ dù có chữ "improves".
 */
export const VAGUE_TERMS: LexEntry[] = [
  { pattern: /\beffective(?:ly|ness)?\b/gi, label: 'effective' },
  { pattern: /\befficient(?:ly|cy)?\b/gi, label: 'efficient' },
  { pattern: /\bbetter\b/gi, label: 'better' },
  { pattern: /\bworse\b/gi, label: 'worse' },
  { pattern: /\bimprove(?:s|d|ment|ments)?\b/gi, label: 'improve' },
  { pattern: /\bgood\b/gi, label: 'good' },
  { pattern: /\bhigh[- ]quality\b/gi, label: 'high-quality' },
  { pattern: /\brobust(?:ness)?\b/gi, label: 'robust' },
  { pattern: /\bscalable\b/gi, label: 'scalable' },
  { pattern: /\bsignificant(?:ly)?\b/gi, label: 'significant' },
  { pattern: /\bsubstantial(?:ly)?\b/gi, label: 'substantial' },
  { pattern: /\bstrong(?:er)?\b/gi, label: 'strong' },
  { pattern: /\bpowerful\b/gi, label: 'powerful' },
  { pattern: /\breasonable\b/gi, label: 'reasonable' },
  { pattern: /\bappropriate\b/gi, label: 'appropriate' },
  { pattern: /\bsuitable\b/gi, label: 'suitable' },
  { pattern: /\badequate\b/gi, label: 'adequate' },
  { pattern: /\bsufficient(?:ly)?\b/gi, label: 'sufficient' },
  { pattern: /\bcompetitive\b/gi, label: 'competitive' },
  { pattern: /\bcomparable\b/gi, label: 'comparable' },
  { pattern: /\bstate[- ]of[- ]the[- ]art\b/gi, label: 'state-of-the-art' },
  // Lượng từ không xác định.
  { pattern: /\bmany\b/gi, label: 'many' },
  { pattern: /\bseveral\b/gi, label: 'several' },
  { pattern: /\bvarious\b/gi, label: 'various' },
  { pattern: /\bnumerous\b/gi, label: 'numerous' },
  { pattern: /\bmultiple\b/gi, label: 'multiple' },
  { pattern: /\ba\s+lot\s+of\b/gi, label: 'a lot of' },
  { pattern: /\bsome\s+(?:of\s+)?(?:the\s+)?\w+/gi, label: 'some …' },
];

/**
 * Dấu hiệu **đo được**: có số, phần trăm, đơn vị, hoặc tên metric. Một trong số này xuất hiện
 * cùng câu thì từ định tính đã được neo lại — không cờ nữa.
 *
 * Khác với `METRIC_MARKERS` của #7: bên đó hỏi "cả kế hoạch có metric nào không", bên này hỏi
 * "câu này có neo được vào con số nào không". Hai câu hỏi khác nhau nên không dùng chung —
 * và `judge/**` với `critique/**` cũng không được import chéo (backend/CLAUDE.md §2).
 */
export const MEASURABLE_MARKERS: RegExp[] = [
  /\d/,
  /\b(?:percent|percentage|points?)\b/i,
  /\b(?:accuracy|f1|bleu|rouge|precision|recall|auc|exact\s+match|em)\b/i,
  /\b(?:latency|throughput|perplexity|win\s+rate|ndcg|map@|mrr)\b/i,
  /\b(?:ms|seconds?|minutes?|hours?|gb|mb|tokens?\/s)\b/i,
];

/**
 * Đại từ mở đầu câu mà không có tiền ngữ. `"It improves retrieval."` — "it" là cái gì?
 *
 * Phân biệt cần làm: `"This approach improves…"` thì "this" **bổ nghĩa cho một danh từ**, có
 * tham chiếu, không cờ. `"This improves…"` thì "this" đứng một mình — mới là mơ hồ. Tức là
 * phải biết từ ngay sau đại từ là **động từ** hay **danh từ**, mà không có POS tagger.
 *
 * Liệt kê tay từng động từ là trò đuổi bắt không hồi kết (bản đầu trượt `"It degrades…"`).
 * Thay bằng một bất đối xứng ngữ pháp có thật:
 *
 * - **Đại từ số ít** (`it` · `this` · `that`) + từ kết thúc `-s` ⇒ hợp với chủ ngữ số ít nên
 *   gần như chắc chắn là **động từ**: "It degrades", "This improves".
 * - **Đại từ số nhiều** (`they` · `these` · `those`) + từ kết thúc `-s` thì thường là **danh từ
 *   số nhiều**: "These datasets contain…" — có tham chiếu, không được cờ. Nên nhánh số nhiều
 *   chỉ nhận trợ động từ liệt kê tường minh.
 *
 * Chỉ xét **câu đầu** của body: giữa đoạn thì tiền ngữ thường nằm ở câu trước, regex không theo nổi.
 */
const AUX =
  'is|are|was|were|can|could|will|would|has|have|does|do|should|may|might|must';

/**
 * Danh từ số ít **kết thúc bằng `-s`** — nhóm gốc Latin/Hy Lạp. Nhánh `-s` bên dưới coi
 * `-s` là dấu hiệu chia động từ hợp với chủ ngữ số ít, nhưng với nhóm này thì sai:
 * `"This corpus has 10k docs."` có tiền ngữ đàng hoàng, không được cờ.
 */
const SINGULAR_S_NOUNS =
  'corpus|analysis|basis|bias|hypothesis|thesis|synthesis|status|focus|process|access|dataset|class|loss';

/**
 * `\b` phải đóng **cả hai** nhánh, không riêng nhánh `-s`.
 *
 * Bản đầu để `(?:\w+(?:s|ed|ing)\b|${AUX})` — `\b` chỉ thuộc nhánh trái, nên nhánh `AUX` khớp
 * như **tiền tố**: `do` ⊂ `document`, `can` ⊂ `candidate`, `is` ⊂ `issue`. Hệ quả là
 * `"This document describes…"` bị cờ, trái hẳn ví dụ trong chính doc ở trên. Nhánh số nhiều
 * vốn đã có `\b` đúng chỗ — chênh lệch đó là dấu hiệu của sót, không phải chủ ý.
 */
export const DANGLING_PRONOUN_SINGULAR = new RegExp(
  `^\\s*(?:it|this|that)\\s+(?:\\w+ly\\s+)?(?!(?:${SINGULAR_S_NOUNS})\\b)(?:\\w+(?:s|ed|ing)|${AUX})\\b`,
  'i',
);

export const DANGLING_PRONOUN_PLURAL = new RegExp(
  `^\\s*(?:they|these|those)\\s+(?:\\w+ly\\s+)?(?:${AUX})\\b`,
  'i',
);

export function hasDanglingPronoun(text: string): boolean {
  return (
    DANGLING_PRONOUN_SINGULAR.test(text) || DANGLING_PRONOUN_PLURAL.test(text)
  );
}

/** Bốn trường bắt buộc của thẻ GAP — Bước 4 của đề. */
export const GAP_FIELDS = [
  'prior_work',
  'limitation',
  'why_it_matters',
  'testable_experiment',
] as const;

/** Hai trường của thẻ CLAIM mà #12 gọi đích danh. */
export const CLAIM_FIELDS = ['baseline', 'metric'] as const;
