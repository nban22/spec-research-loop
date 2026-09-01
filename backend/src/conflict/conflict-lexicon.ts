/**
 * Từ điển của bộ phát hiện nguồn mâu thuẫn (#3) — **0 token**.
 *
 * Cùng bài học ngôn ngữ với #7 và #12: `prompts/generator.md` §"Language rule" bắt mọi
 * `title`/`body`/`payload` của card phải là **tiếng Anh**, và `Source.abstract` cũng tiếng Anh.
 * Từ điển chính vì thế là tiếng Anh; phần tiếng Việt giữ cho card `origin = USER` người dùng tự gõ.
 *
 * Khác `ambiguity-lexicon.ts` ở một điểm cốt lõi: ở đây mục từ là **cặp có cực**, không phải danh
 * sách từ phẳng. Một túi từ trái nghĩa quét trên hai câu bất kỳ sẽ nổ liên tục — "improves" ở câu
 * A và "degrades" ở câu B không mâu thuẫn nếu chúng nói về hai thứ khác nhau.
 */

export type PolarPair = {
  pos: RegExp;
  neg: RegExp;
  label: string;
};

export const DIRECTION_PAIRS: PolarPair[] = [
  {
    pos: /\b(?:increase[sd]?|higher|greater|rise[sd]?|gain[sd]?)\b/i,
    neg: /\b(?:decrease[sd]?|lower|reduce[sd]?|declin(?:e|es|ed)|drop(?:s|ped)?)\b/i,
    label: 'increase↔decrease',
  },
  {
    pos: /\b(?:outperform(?:s|ed)?|surpass(?:es|ed)?|exceed(?:s|ed)?)\b/i,
    neg: /\b(?:underperform(?:s|ed)?|falls? short|lags? behind)\b/i,
    label: 'outperform↔underperform',
  },
  {
    pos: /\bimprove(?:s|d|ment)?\b/i,
    neg: /\b(?:degrade[sd]?|hurts?|harm(?:s|ed)?|worsen(?:s|ed)?)\b/i,
    label: 'improve↔degrade',
  },
  {
    pos: /\bsignificant(?:ly)?\b/i,
    neg: /\b(?:insignificant|negligible)\b/i,
    label: 'significant↔not significant',
  },
  {
    pos: /\beffective\b/i,
    neg: /\bineffective\b/i,
    label: 'effective↔ineffective',
  },
  {
    pos: /\b(?:consistent(?:ly)?|robust(?:ly)?)\b/i,
    neg: /\b(?:inconsistent(?:ly)?|brittle|unstable)\b/i,
    label: 'consistent↔inconsistent',
  },
  { pos: /\btăng\b/i, neg: /\bgiảm\b/i, label: 'tăng↔giảm' },
  {
    pos: /\bcải thiện\b/i,
    neg: /\b(?:xấu|kém)\s+đi\b/i,
    label: 'cải thiện↔kém đi',
  },
];

/**
 * Phủ định đứng ngay trước một cực thì **lật cực đó**: "does not improve" phải rơi về cực âm,
 * nếu không thì hai câu cùng nói "không cải thiện" lại bị đọc thành mâu thuẫn với nhau.
 *
 * Cửa sổ 2 từ đệm để bắt "does not significantly improve" mà không với quá xa sang mệnh đề khác.
 * Regex có `$` vì nó luôn được thử trên phần văn bản **đứng trước** vị trí khớp.
 */
export const NEGATION_BEFORE =
  /\b(?:not|no|never|fails? to|without|cannot|hardly|khong|không)\s+(?:\w+\s+){0,2}$/i;

/**
 * Hai con số chỉ đem ra so được khi **cùng tên metric**.
 *
 * Không có cổng này thì "A đạt 83% accuracy" và "B giảm 40% latency" thành một mâu thuẫn —
 * đây là nguồn dương tính giả lớn nhất của cả làn A, và là lý do tín hiệu NUMERIC không bao giờ
 * được đánh `decisive`.
 */
export const METRIC_NAMES: { pattern: RegExp; label: string }[] = [
  { pattern: /\baccuracy\b/i, label: 'accuracy' },
  { pattern: /\bf1(?:[- ]score)?\b/i, label: 'f1' },
  { pattern: /\bbleu\b/i, label: 'bleu' },
  { pattern: /\brouge\b/i, label: 'rouge' },
  { pattern: /\bprecision\b/i, label: 'precision' },
  { pattern: /\brecall(?:@\d+)?\b/i, label: 'recall' },
  { pattern: /\bauc\b/i, label: 'auc' },
  { pattern: /\bexact match\b|\bem\b/i, label: 'exact match' },
  { pattern: /\bperplexity\b/i, label: 'perplexity' },
  { pattern: /\blatency\b/i, label: 'latency' },
  { pattern: /\bthroughput\b/i, label: 'throughput' },
  { pattern: /\bwin rate\b/i, label: 'win rate' },
  { pattern: /\bndcg(?:@\d+)?\b/i, label: 'ndcg' },
  { pattern: /\bmrr\b/i, label: 'mrr' },
  { pattern: /\berror rate\b/i, label: 'error rate' },
  { pattern: /\bmap\b/i, label: 'map' },
];

/** Chênh lệch tương đối vượt mức này mới coi là hai con số khác nhau, không phải nhiễu làm tròn. */
export const NUMERIC_REL_TOLERANCE = 0.1;

/**
 * Hai câu phải nói về cùng một thứ mới đem ra so cực. Dùng `jaccard` token của `common/text`
 * chứ không dùng embedding: giữ hàm thuần, đồng bộ, và test không cần mock model.
 */
export const MIN_TOPIC_OVERLAP = 0.25;

/** Trần số cặp gửi lên tầng LLM trong **một** lần chạy verifier. 0 tín hiệu luật ⇒ 0 lời gọi. */
export const MAX_LLM_PAIRS_PER_RUN = 10;

/** Trần số cặp nguồn đem đối chiếu trong **một** thẻ — chặn thẻ có 20 nguồn thành 190 cặp. */
export const MAX_PAIRS_PER_CARD = 10;
