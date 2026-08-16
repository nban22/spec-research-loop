/**
 * Hàm so title dùng chung cho **hai** chỗ: khử trùng nguồn (C1 · F.7) và gộp `IssueGroup`
 * (C3 · F.7) và tầng L0 của verifier. Một hàm, ba chỗ gọi, một hành vi —
 * đây là yêu cầu tường minh của SYSTEM_DESIGN_ANALYSIS §4.4 #3.
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'and',
  'or',
  'to',
  'in',
  'on',
  'with',
  'via',
  'using',
  'towards',
  'toward',
  'from',
  'by',
  'at',
  'is',
  'are',
  'be',
]);

export function normalizeText(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      // NFKD tách dấu tiếng Việt thành combining mark (không phải ASCII) — bỏ hẳn để
      // "phát" thành "phat" chứ không thành "pha t".
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function tokenSet(input: string): Set<string> {
  return new Set(
    normalizeText(input)
      .split(' ')
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Token-set ratio: |giao| / |nhỏ hơn|. Ngưỡng 0.85 = cùng một paper (ARCHITECTURE §6.4). */
export function titleSimilarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

export function jaccard(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const cleaned = doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:/, '');
  return cleaned.length > 0 ? cleaned : null;
}

/** Tách abstract thành câu. Dùng ở L3 — so **theo câu** chứ không so cả abstract. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
