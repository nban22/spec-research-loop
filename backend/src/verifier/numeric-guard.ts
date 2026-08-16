import { normalizeText } from '../common/text';

/**
 * Tầng L2 — luật quan trọng nhất của phần rule (ARCHITECTURE §6.4).
 *
 * Dạng hallucination hay gặp nhất **không phải** bịa cả paper, mà là trích đúng paper rồi gán cho
 * nó một con số không có. Embedding không bắt được kiểu này: hai câu chỉ khác con số có cosine rất
 * cao. Nên con số phải được kiểm bằng rule, trước khi tới embedding.
 */

const NUMBER_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(%|×|x\b|percent|points?|pts?|gb|mb|tb|k\b|m\b|b\b|billion|million)?/gi;

export type NumericFinding = {
  raw: string;
  value: number;
  unit: string | null;
};

export function extractNumbers(text: string): NumericFinding[] {
  const found: NumericFinding[] = [];
  for (const m of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    // Số năm (1900–2099) không phải là kết quả đo — bỏ qua để khỏi báo động giả.
    if (!m[2] && value >= 1900 && value <= 2099 && Number.isInteger(value))
      continue;
    // Số đếm rất nhỏ không mang thông tin định lượng ("3 experiments").
    if (!m[2] && Number.isInteger(value) && value <= 10) continue;
    found.push({ raw: m[0].trim(), value, unit: m[2]?.toLowerCase() ?? null });
  }
  return found;
}

function appearsIn(value: number, haystack: NumericFinding[]): boolean {
  return haystack.some((h) => {
    if (h.value === value) return true;
    // Cho phép sai số làm tròn một chữ số: 20.4 ↔ 20.
    return (
      Math.abs(h.value - value) < 0.05 ||
      Math.round(h.value) === Math.round(value)
    );
  });
}

/**
 * Trả về danh sách con số trong claim mà abstract không hề nhắc tới.
 * Không rỗng ⇒ cờ `NUMBER_NOT_IN_SOURCE`, và **trần nhãn hạ xuống `WEAK` bất kể L3 và L4 nói gì**.
 */
export function numbersMissingFromSource(
  claim: string,
  abstract: string,
): string[] {
  const inClaim = extractNumbers(claim);
  if (inClaim.length === 0) return [];
  const inAbstract = extractNumbers(abstract);
  return inClaim
    .filter((c) => !appearsIn(c.value, inAbstract))
    .map((c) => c.raw);
}

/** Claim có nói về "hiện đại nhất" không — quyết định có gắn cờ STALE_SOURCE hay không. */
export function claimsRecency(claim: string): boolean {
  const t = normalizeText(claim);
  return /\b(state of the art|sota|recent|latest|current|modern|newest)\b/.test(
    t,
  );
}
