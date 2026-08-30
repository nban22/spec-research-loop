import {
  CLAIM_FIELDS,
  GAP_FIELDS,
  MEASURABLE_MARKERS,
  VAGUE_TERMS,
  hasDanglingPronoun,
} from './ambiguity-lexicon';

/**
 * Bộ bắt thẻ mơ hồ (#12) — **logic thuần, 0 token, 0 I/O**. Chạy được trong unit test không cần
 * DB lẫn LLM, đúng tiêu chí "hàm phát hiện là hàm thuần, có unit test, 0 token".
 *
 * ## `AMBIGUOUS` khác `MISSING` ở đâu
 *
 * `GeneratorService` **đã** gán `MISSING` khi một trường bắt buộc **rỗng** — cả `CLAIM`
 * (`baseline`/`metric`/`evidence`/`refutation_condition`) lẫn `GAP` (4 trường Bước 4). Nên đọc
 * #12 theo nghĩa đen ("thiếu baseline ⇒ mơ hồ") là làm lại việc đã có, tệ hơn nữa là **ghi đè
 * một `MISSING` đúng bằng `AMBIGUOUS`**, mất thông tin.
 *
 * Chỗ thật sự chưa ai lo: trường **có chữ nhưng chữ đó không dùng được** —
 * `baseline: "existing methods"`, `metric: "performance"`, `limitation: "it doesn't work well"`.
 * Generator thấy khác rỗng nên gán `PROPOSED`, và không gì bắt chúng lại.
 *
 * Vì vậy: thẻ đang `MISSING` thì **bỏ qua**, nó đã có cờ nặng hơn rồi.
 */

export type AmbiguityKind =
  /** Trường `baseline` / `metric` của `CLAIM` có chữ nhưng không neo vào gì đo được. */
  | 'CLAIM_FIELD_VAGUE'
  /** Một trong 4 trường Bước 4 của `GAP` có chữ nhưng rỗng nghĩa. */
  | 'GAP_FIELD_VAGUE'
  /** Câu mở đầu bằng đại từ không rõ tham chiếu. */
  | 'DANGLING_PRONOUN'
  /** Từ định tính trong body mà cả câu không có đại lượng nào neo lại. */
  | 'VAGUE_TERM';

export type AmbiguityFinding = {
  kind: AmbiguityKind;
  /** Tên trường trong `payload`, hoặc `null` khi vấn đề nằm ở `body`. */
  field: string | null;
  /** Đoạn chữ gây ra cờ — để người đọc kiểm lại được. */
  excerpt: string;
  /** Cụm từ mơ hồ bắt được. */
  terms: string[];
  /** Viết cho người đọc, tiếng Việt — nó đi thẳng vào câu hỏi làm rõ. */
  reason: string;
};

/**
 * Thứ tự ưu tiên khi phải cắt bớt câu hỏi cho vừa hạn mức. Trường cấu trúc của `CLAIM` đứng
 * đầu vì thiếu nó thì **không thí nghiệm nào chạy được**; từ định tính trong body đứng cuối vì
 * nó nhiều và ít khi chặn việc.
 */
export const KIND_PRIORITY: Record<AmbiguityKind, number> = {
  CLAIM_FIELD_VAGUE: 4,
  GAP_FIELD_VAGUE: 3,
  DANGLING_PRONOUN: 2,
  VAGUE_TERM: 1,
};

export function hasMeasurable(text: string): boolean {
  return MEASURABLE_MARKERS.some((re) => re.test(text));
}

/**
 * Tên riêng neo được một trường: `BM25`, `ZaloLegal`, `SQuAD`. Cùng quy ước với #7 — chữ hoa
 * hoặc số phải nằm **trong ruột** token, vì chữ hoa đầu câu chỉ là chính tả.
 */
export function hasProperName(text: string): boolean {
  const tokens = text.match(/\b[A-Za-z][A-Za-z0-9-]{1,}\b/g) ?? [];
  return tokens.some((t) => /[A-Z0-9]/.test(t.slice(1)));
}

function vagueTermsIn(text: string): string[] {
  const hits: string[] = [];
  for (const e of VAGUE_TERMS) {
    e.pattern.lastIndex = 0;
    if (e.pattern.test(text)) hits.push(e.label);
    e.pattern.lastIndex = 0;
  }
  return hits;
}

/** Tách câu thô — đủ dùng, vì ta chỉ cần biết đại lượng đo có **cùng câu** với từ mơ hồ không. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function readField(payload: unknown, key: string): string {
  if (!payload || typeof payload !== 'object') return '';
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Kế hoạch thí nghiệm phải mô tả một **phép so sánh**, không phải lời hứa "sẽ đánh giá". */
const COMPARISON_MARKERS =
  /\b(?:compare[ds]?|comparison|versus|vs\.?|against|baseline|ablation|outperform|relative\s+to)\b/i;

export type AmbiguityInput = {
  type: string;
  status: string;
  title: string;
  body: string;
  payload?: unknown;
};

export function detectAmbiguity(card: AmbiguityInput): AmbiguityFinding[] {
  // Thẻ đã `MISSING` thì trường bắt buộc đang **rỗng** — vấn đề nặng hơn và đã được gắn cờ.
  // Ghi đè bằng `AMBIGUOUS` là hạ mức nghiêm trọng, không phải bổ sung thông tin.
  if (card.status === 'MISSING') return [];

  const out: AmbiguityFinding[] = [];

  if (card.type === 'CLAIM') {
    for (const field of CLAIM_FIELDS) {
      const value = readField(card.payload, field);
      if (value.length === 0) continue; // rỗng ⇒ việc của `MISSING`
      if (hasMeasurable(value) || hasProperName(value)) continue;
      out.push({
        kind: 'CLAIM_FIELD_VAGUE',
        field,
        excerpt: value,
        terms: vagueTermsIn(value),
        reason:
          field === 'baseline'
            ? `Trường \`baseline\` ghi "${value}" — không nêu tên phương pháp cụ thể nào để so sánh, nên không thí nghiệm nào kiểm được khẳng định này.`
            : `Trường \`metric\` ghi "${value}" — không phải một đại lượng đo được, nên không có cách nào nói khẳng định đúng hay sai.`,
      });
    }
  }

  if (card.type === 'GAP') {
    for (const field of GAP_FIELDS) {
      const value = readField(card.payload, field);
      if (value.length === 0) continue; // rỗng ⇒ việc của `MISSING`

      if (field === 'testable_experiment') {
        if (COMPARISON_MARKERS.test(value) || hasMeasurable(value)) continue;
        out.push({
          kind: 'GAP_FIELD_VAGUE',
          field,
          excerpt: value,
          terms: vagueTermsIn(value),
          reason: `Trường \`testable_experiment\` ghi "${value}" — chưa mô tả một phép so sánh chạy được. "Sẽ đánh giá" không phải là thí nghiệm.`,
        });
        continue;
      }

      const terms = vagueTermsIn(value);
      if (terms.length === 0 || hasMeasurable(value)) continue;
      out.push({
        kind: 'GAP_FIELD_VAGUE',
        field,
        excerpt: value,
        terms,
        reason: `Trường \`${field}\` chỉ có từ định tính (${terms.join(', ')}) mà không kèm đại lượng nào đo được.`,
      });
    }
  }

  // ── phần áp cho mọi loại thẻ ────────────────────────────────────────────
  const body = card.body.trim();

  if (hasDanglingPronoun(body)) {
    out.push({
      kind: 'DANGLING_PRONOUN',
      field: null,
      excerpt: body.slice(0, 120),
      terms: [],
      reason:
        'Câu mở đầu bằng đại từ nhưng không có tiền ngữ — đọc riêng thẻ này thì không biết "nó" là cái gì.',
    });
  }

  for (const s of sentences(body)) {
    if (hasMeasurable(s)) continue;
    const terms = vagueTermsIn(s);
    if (terms.length === 0) continue;
    out.push({
      kind: 'VAGUE_TERM',
      field: null,
      excerpt: s,
      terms,
      reason: `Câu này dùng từ định tính (${terms.join(', ')}) mà không kèm con số hay metric nào để neo lại.`,
    });
    break; // một cờ `VAGUE_TERM` mỗi thẻ là đủ — cờ thứ hai không thêm việc gì cho người dùng
  }

  return out;
}

/** Cờ nặng nhất của thẻ — dùng để xếp hạng câu hỏi khi phải cắt cho vừa hạn mức. */
export function topFinding(
  findings: AmbiguityFinding[],
): AmbiguityFinding | null {
  if (findings.length === 0) return null;
  return [...findings].sort(
    (a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind],
  )[0];
}
