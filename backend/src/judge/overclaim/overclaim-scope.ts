import {
  BASELINE_MARKERS,
  MAGNITUDE_TERMS,
  METRIC_MARKERS,
  NUMBER_WORDS,
  SCOPE_DIMENSIONS,
  SCOPE_TERMS,
  type LexEntry,
  type ScopeDimension,
} from './overclaim-lexicon';

/**
 * Tầng luật của B1 — **logic thuần, 0 token, 0 I/O**. Toàn bộ file này chạy được trong unit test
 * không cần DB lẫn LLM, đúng tiêu chí "tầng luật bắt được claim phóng đại rõ ràng mà không gọi
 * LLM lần nào" của #7.
 */

export type DeclaredScope = {
  /** Cụm chỉ phạm vi bắt được, ví dụ `all domains`. */
  scopeTerms: string[];
  /** Cụm chỉ mức bắt được, ví dụ `significantly`. */
  magnitudeTerms: string[];
  /** Số lượng claim tự khai theo từng chiều — `across three domains` ⇒ `{ domains: 3 }`. */
  counts: Partial<Record<ScopeDimension, number>>;
};

export type ActualScope = {
  /** Số thực thể phân biệt đếm được trong `ExperimentPlan` theo từng chiều. */
  counts: Record<ScopeDimension, number>;
  /** Tên đã nhặt được — đi vào `actual_scope` để người đọc kiểm lại được. */
  names: Record<ScopeDimension, string[]>;
  hasBaseline: boolean;
  hasMetric: boolean;
};

export type OverclaimLevel = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export type RuleVerdict = {
  level: OverclaimLevel;
  /** `true` ⇒ luật không kết luận được, đẩy sang tầng LLM (vùng xám). */
  needsLlm: boolean;
  matchedTerms: string[];
  /** Vì sao ra mức đó — viết cho người đọc, không phải log máy. */
  rationale: string;
  /** Câu thu hẹp đề xuất dựng bằng luật. Rỗng khi luật không dựng nổi câu dùng được. */
  suggestedNarrowing: string;
};

/** Gom mọi chữ của một card lại: title + body + các giá trị chuỗi trong payload. */
export function cardText(card: {
  title: string;
  body: string;
  payload?: unknown;
}): string {
  const parts = [card.title, card.body];
  if (card.payload && typeof card.payload === 'object') {
    collectStrings(card.payload, parts);
  }
  return parts.join('\n');
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

function matchAll(text: string, entries: LexEntry[]): string[] {
  const hits: string[] = [];
  for (const e of entries) {
    // Regex có cờ `g` giữ `lastIndex` giữa các lần gọi — reset để dùng lại an toàn.
    e.pattern.lastIndex = 0;
    if (e.pattern.test(text)) hits.push(e.label);
    e.pattern.lastIndex = 0;
  }
  return hits;
}

/**
 * Bắt số lượng claim tự khai: `across three domains`, `on 5 datasets`, `two models`.
 * Chỉ nhận số đứng ngay trước danh từ chiều — `three` ở "three times faster" không tính.
 */
function declaredCounts(text: string): Partial<Record<ScopeDimension, number>> {
  const counts: Partial<Record<ScopeDimension, number>> = {};
  for (const dim of SCOPE_DIMENSIONS) {
    const nounSource = dim.noun.source;
    const re = new RegExp(`\\b(\\d+|[a-z]+)\\s+${nounSource}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[1].toLowerCase();
      const n = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
      if (!n) continue;
      counts[dim.key] = Math.max(counts[dim.key] ?? 0, n);
    }
  }
  return counts;
}

export function extractDeclaredScope(text: string): DeclaredScope {
  return {
    scopeTerms: matchAll(text, SCOPE_TERMS),
    magnitudeTerms: matchAll(text, MAGNITUDE_TERMS),
    counts: declaredCounts(text),
  };
}

/**
 * Nhặt tên riêng đứng cạnh danh từ chiều. `ExperimentPlan.plan` không có field đếm sẵn
 * (xem `experimentOutputSchema`: chỉ có `experiments[].bullets` và `baselines_and_metrics`
 * dạng văn xuôi), nên phải rút từ chữ.
 *
 * Quy ước nhận diện tên riêng: token phải **có chữ hoa hoặc chữ số ở trong ruột**, không chỉ ở
 * đầu — `ZaloLegal`, `ViMedQA`, `BM25`, `SQuAD`, `MS MARCO`. Chữ hoa đầu câu là chuyện chính tả,
 * không phải tên: bullet "Evaluate on the ZaloLegal corpus" chỉ có **một** tên riêng, không phải
 * hai. Trước khi có luật này, `Evaluate` và `Compare` bị đếm thành dataset, mẫu số phồng lên và
 * claim "transfers to five datasets" thoát cờ.
 *
 * Cố tình **bỏ sót còn hơn đếm khống**: đếm thiếu chỉ làm cờ nhạy hơn, đếm khống làm cờ biến mất.
 */
function namedEntitiesNear(text: string, noun: RegExp): string[] {
  const found = new Set<string>();
  const nounRe = new RegExp(noun.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = nounRe.exec(text)) !== null) {
    // Cửa sổ 60 ký tự hai bên danh từ — đủ ôm "on the SQuAD and NQ datasets".
    const from = Math.max(0, m.index - 60);
    const window = text.slice(from, m.index + m[0].length + 60);
    const names =
      window.match(/\b[A-Z][A-Za-z0-9-]{1,}(?:\s+[A-Z][A-Za-z0-9-]+)?\b/g) ??
      [];
    for (const n of names) {
      const clean = n.trim();
      if (STOP_NAMES.has(clean.toLowerCase())) continue;
      if (!looksLikeProperName(clean)) continue;
      found.add(clean);
    }
  }
  return [...found];
}

/**
 * Tên riêng thật gần như luôn có chữ hoa hoặc chữ số **không nằm ở đầu**: `ZaloLegal`, `BM25`,
 * `SQuAD`, `ViMedQA`. Từ thường viết hoa vì đứng đầu câu — `Evaluate`, `Compare`, `Report` —
 * không có dấu hiệu đó. Cụm nhiều từ (`MS MARCO`) luôn được nhận.
 */
function looksLikeProperName(token: string): boolean {
  if (token.includes(' ')) return true;
  return /[A-Z0-9]/.test(token.slice(1));
}

const STOP_NAMES = new Set([
  'the',
  'we',
  'our',
  'this',
  'that',
  'these',
  'those',
  'it',
  'they',
  'all',
  'each',
  'every',
  'both',
  'one',
  'two',
  'three',
  'experiment',
  'experiments',
  'baseline',
  'baselines',
  'metric',
  'metrics',
  'dataset',
  'datasets',
  'domain',
  'domains',
  'model',
  'models',
  'task',
  'tasks',
  'train',
  'test',
  'eval',
  'evaluation',
  'ablation',
  'results',
  'table',
]);

/** Gom mọi chữ trong `ExperimentPlan.plan` — hình dạng theo `experimentOutputSchema`. */
export function planText(plan: unknown): string {
  const parts: string[] = [];
  collectStrings(plan, parts);
  return parts.join('\n');
}

export function extractActualScope(
  plan: unknown,
  projectDomain?: string | null,
): ActualScope {
  const text = planText(plan);
  const names = {} as Record<ScopeDimension, string[]>;
  const counts = {} as Record<ScopeDimension, number>;

  for (const dim of SCOPE_DIMENSIONS) {
    const entities = namedEntitiesNear(text, dim.noun);
    names[dim.key] = entities;
    const explicit = declaredCounts(text)[dim.key] ?? 0;
    counts[dim.key] = Math.max(entities.length, explicit);
  }

  // `Project.domain` là **một** domain. Nó chỉ nâng sàn lên 1, không bao giờ chứng minh được
  // nhiều domain — chính vì vậy nó là bằng chứng chống lại claim phổ quát, không phải ủng hộ.
  if (projectDomain && projectDomain.trim().length > 0) {
    counts.domains = Math.max(counts.domains, 1);
    if (names.domains.length === 0) names.domains = [projectDomain.trim()];
  }

  return {
    counts,
    names,
    hasBaseline: BASELINE_MARKERS.test(text),
    hasMetric: METRIC_MARKERS.test(text),
  };
}

/**
 * Dựng câu thu hẹp bằng luật: thay cụm phạm vi bằng phạm vi thật đo được.
 * Trả chuỗi rỗng khi không có bằng chứng phạm vi nào để thay vào — lúc đó đề xuất một câu
 * bịa ra còn tệ hơn không đề xuất gì.
 */
export function buildNarrowing(claim: string, actual: ActualScope): string {
  const evidence = pickEvidencePhrase(actual);
  if (!evidence) return '';

  let out = claim;
  let replaced = false;
  for (const entry of SCOPE_TERMS) {
    entry.pattern.lastIndex = 0;
    if (!entry.pattern.test(out)) continue;
    entry.pattern.lastIndex = 0;
    out = out.replace(entry.pattern, evidence);
    replaced = true;
    entry.pattern.lastIndex = 0;
  }
  if (!replaced) return '';
  // Dọn khoảng trắng thừa do thay cụm dài bằng cụm ngắn.
  return out.replace(/\s{2,}/g, ' ').trim();
}

function pickEvidencePhrase(actual: ActualScope): string {
  const domains = actual.names.domains;
  if (domains.length === 1) return `the ${domains[0]} domain`;
  if (domains.length > 1)
    return `the ${domains.slice(0, 3).join(', ')} domains`;
  const datasets = actual.names.datasets;
  if (datasets.length === 1) return `the ${datasets[0]} dataset`;
  if (datasets.length > 1)
    return `the ${datasets.slice(0, 3).join(', ')} datasets`;
  return '';
}

/**
 * Luật quyết định. Thứ tự các nhánh là thứ tự **độ chắc chắn giảm dần** — nhánh trên kết luận
 * dứt khoát, nhánh dưới đẩy sang LLM.
 */
export function assessOverclaim(
  claim: string,
  declared: DeclaredScope,
  actual: ActualScope,
): RuleVerdict {
  const matched = [...declared.scopeTerms, ...declared.magnitudeTerms];
  const narrowing = buildNarrowing(claim, actual);

  // 1. Phổ quát nhưng thí nghiệm chỉ có ≤ 1 domain — đúng ví dụ Bước 10 của đề bài.
  if (declared.scopeTerms.length > 0 && actual.counts.domains <= 1) {
    return {
      level: 'CRITICAL',
      needsLlm: false,
      matchedTerms: matched,
      rationale: `Claim khai phạm vi phổ quát (${declared.scopeTerms.join(', ')}) nhưng kế hoạch thí nghiệm chỉ chứng minh được ${actual.counts.domains} domain.`,
      suggestedNarrowing: narrowing,
    };
  }

  // 2. Claim tự khai một con số lớn hơn số đếm được trong kế hoạch.
  for (const dim of SCOPE_DIMENSIONS) {
    const want = declared.counts[dim.key];
    const have = actual.counts[dim.key];
    if (want !== undefined && want > have) {
      return {
        level: 'MAJOR',
        needsLlm: false,
        matchedTerms: matched,
        rationale: `Claim nói ${want} ${dim.label}, kế hoạch thí nghiệm chỉ có ${have}.`,
        suggestedNarrowing: narrowing,
      };
    }
  }

  // 3. Khai mức cải thiện nhưng không có baseline lẫn metric để đo mức đó.
  if (
    declared.magnitudeTerms.length > 0 &&
    !actual.hasBaseline &&
    !actual.hasMetric
  ) {
    return {
      level: 'MAJOR',
      needsLlm: false,
      matchedTerms: matched,
      rationale: `Claim khai mức cải thiện (${declared.magnitudeTerms.join(', ')}) nhưng kế hoạch thí nghiệm không có baseline lẫn metric nào để đo.`,
      suggestedNarrowing: '',
    };
  }

  // 4. Vùng xám: có dấu hiệu nhưng bằng chứng không đủ để luật kết luận. Đây — và chỉ đây —
  //    mới đáng tốn một lời gọi LLM.
  if (matched.length > 0) {
    return {
      level: 'NONE',
      needsLlm: true,
      matchedTerms: matched,
      rationale:
        'Có từ chỉ phạm vi hoặc chỉ mức, nhưng kế hoạch thí nghiệm cũng có bằng chứng tương ứng — cần đọc kỹ nội dung mới kết luận được.',
      suggestedNarrowing: '',
    };
  }

  // 5. Không có dấu hiệu nào. Không cờ, không tốn token.
  return {
    level: 'NONE',
    needsLlm: false,
    matchedTerms: [],
    rationale: 'Không tìm thấy từ chỉ phạm vi hay chỉ mức nào trong claim.',
    suggestedNarrowing: '',
  };
}
