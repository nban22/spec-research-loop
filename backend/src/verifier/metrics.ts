/**
 * Hàm tính metric của báo cáo đánh giá (deliverable #8) — **hàm thuần, 0 I/O**.
 *
 * Vì sao chúng ở `src/` chứ không ở `eval/`: jest chỉ quét `rootDir: src`
 * (`backend/CLAUDE.md` §0), nên logic đặt trong `eval/` là logic không có test. Mà đây đúng
 * là chỗ **không được sai**: một metric tính lệch không làm app đổ, nó chỉ làm cả báo cáo
 * nói sai — và không có gì báo.
 */
import type { SupportLabel } from '../generated/prisma/enums';

export type CitationPair = {
  support_label: SupportLabel;
  flags: string[];
};

export type CitationMetrics = {
  /** Số cặp (khẳng định, nguồn) được xét. */
  total: number;
  /** Số trích dẫn **không tra ra được ở provider thật**. */
  not_found: number;
  /**
   * *"Bịa nguồn ở tỉ lệ nào."* Áp cho **mọi** arm và deterministic — đây là con số duy nhất
   * so trực tiếp được giữa B1 (trích từ trí nhớ model) và các arm đi qua API thật.
   */
  fabrication_rate: number | null;
  /** `1 − fabrication_rate`. Giữ tên cũ để bảng của các batch trước vẫn đọc được. */
  citation_validity: number | null;
  /**
   * *"Trong những nguồn **có thật**, bao nhiêu phần không chống lưng được khẳng định."*
   *
   * `null` khi không có cặp nguồn-thật nào — trường hợp của arm B1. Trả `1.0` cho B1 như bản
   * trước là **sai về ngữ nghĩa**: hai arm khi đó trả lời hai câu hỏi khác nhau ("có tra ra
   * không" vs "abstract có nói điều đó không") mà vẫn bị xếp cùng một dòng bảng.
   */
  unsupported_rate: number | null;
};

const SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND';

/** Metric cho arm có nguồn thật trong DB (B2 · SYS · SYS_NO_VERIFY). */
export function citationMetrics(pairs: CitationPair[]): CitationMetrics {
  const total = pairs.length;
  if (total === 0) {
    return {
      total: 0,
      not_found: 0,
      fabrication_rate: null,
      citation_validity: null,
      unsupported_rate: null,
    };
  }

  const notFound = pairs.filter((p) => p.flags.includes(SOURCE_NOT_FOUND));
  const real = pairs.filter((p) => !p.flags.includes(SOURCE_NOT_FOUND));
  const unsupportedReal = real.filter((p) => p.support_label === 'UNSUPPORTED');

  return {
    total,
    not_found: notFound.length,
    fabrication_rate: notFound.length / total,
    citation_validity: (total - notFound.length) / total,
    unsupported_rate:
      real.length === 0 ? null : unsupportedReal.length / real.length,
  };
}

/**
 * Metric cho arm B1: trích dẫn đến từ **trí nhớ của model**, không có bản ghi `Source` nào
 * (enum `retrieved_from` không có giá trị `LLM` — đó là chỗ kiểu dữ liệu chặn việc bịa nguồn).
 * Cách đo duy nhất là đi tra từng tiêu đề ở provider thật.
 */
export function claimedCitationMetrics(input: {
  claimed: number;
  resolved: number;
}): CitationMetrics {
  const { claimed, resolved } = input;
  if (claimed === 0) {
    return {
      total: 0,
      not_found: 0,
      fabrication_rate: null,
      citation_validity: null,
      unsupported_rate: null,
    };
  }
  return {
    total: claimed,
    not_found: claimed - resolved,
    fabrication_rate: (claimed - resolved) / claimed,
    citation_validity: resolved / claimed,
    // Không có cặp (khẳng định, abstract) nào để hỏi câu "abstract có nói điều đó không".
    unsupported_rate: null,
  };
}

/**
 * Nhóm `LlmPurpose` để tính JSON validity **theo vai**.
 *
 * Tính chung một con số cho cả project là so lệch: arm nào gọi verifier nhiều thì bị dìm bởi
 * retry của `verifier_entailment`, dù chất lượng output của generator không đổi.
 */
export const JSON_VALIDITY_GROUPS = {
  generator: [
    'PARAPHRASE',
    'DECOMPOSE',
    'RELATED_WORK',
    'GAP',
    'CLAIM',
    'EXPERIMENT',
    'OPTIONS',
    'B1_SINGLE_SHOT',
  ],
  judge: ['JUDGE'],
  entailment: ['ENTAILMENT'],
} as const;

export type JsonValidityGroup = keyof typeof JSON_VALIDITY_GROUPS;

export function jsonValidityByGroup(
  calls: { purpose: string; attempts: number }[],
): Record<JsonValidityGroup | 'all', number | null> {
  const rate = (subset: { attempts: number }[]) =>
    subset.length === 0
      ? null
      : subset.filter((c) => c.attempts === 1).length / subset.length;

  return {
    generator: rate(
      calls.filter((c) =>
        (JSON_VALIDITY_GROUPS.generator as readonly string[]).includes(
          c.purpose,
        ),
      ),
    ),
    judge: rate(
      calls.filter((c) =>
        (JSON_VALIDITY_GROUPS.judge as readonly string[]).includes(c.purpose),
      ),
    ),
    entailment: rate(
      calls.filter((c) =>
        (JSON_VALIDITY_GROUPS.entailment as readonly string[]).includes(
          c.purpose,
        ),
      ),
    ),
    all: rate(calls),
  };
}

/**
 * Số issue CRITICAL + MAJOR do **auditor độc lập** chấm.
 *
 * Không lấy từ bảng `Issue`: đó là output của 5 judge **trong** app. B1/B2 không chạy judge
 * nên luôn được 0 — trông như spec hoàn hảo — còn arm chạy judge thì càng tìm ra nhiều vấn đề
 * càng bị chấm xấu. Metric bị đảo ngược. Kim-chỉ-nam §7.2 nói rõ phải là *"một auditor riêng
 * chạy trên cả 3 output"*.
 *
 * `null` = chưa chạy `eval:audit`. Đừng thay bằng 0: 0 nghĩa là "auditor không tìm ra gì".
 */
export function auditorBlockingIssues(
  scores: { severity_counts: unknown }[],
): number | null {
  if (scores.length === 0) return null;
  let sum = 0;
  for (const s of scores) {
    const counts = (s.severity_counts ?? {}) as Record<string, unknown>;
    sum += num(counts.CRITICAL) + num(counts.MAJOR);
  }
  return sum / scores.length;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export type Summary = { mean: number; std: number; n: number };

/**
 * `mean ± std` bỏ qua ô `null`, và **báo `n` thật**.
 *
 * `n` không phải trang trí: bảng trong báo cáo hiện có `±0.000` ở mọi dòng, mà đó là hệ quả
 * của n = 1 chứ không phải phương sai thấp. Không in `n` ra thì người đọc không phân biệt được.
 */
export function meanStd(values: (number | null)[]): Summary {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return { mean: 0, std: 0, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (xs.length < 2) return { mean, std: 0, n: 1 };
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return { mean, std: Math.sqrt(variance), n: xs.length };
}

/* ───────────────────────── làn A · khoá metric mới của #6 ─────────────────────────
   Bốn hàm thuần, gọi từ **cả** `eval/score.ts` lẫn `eval/ablation-evidence.ts` — cùng một phép
   tính cho hai bảng, nên hai bảng không bao giờ nói lệch nhau. Thêm vào cuối file theo luật
   chung 4; không sửa khoá metric nào đang có. */

/**
 * `fulltext_hit_rate` — bao nhiêu phần nguồn của dự án thật sự lấy được bản toàn văn.
 *
 * Đây là con số **phải báo dù nó xấu**: chỉ arXiv mới có bản HTML mở, nên tỉ lệ này thấp là
 * chuyện đã biết trước. #2 nói thẳng rằng "toàn văn phủ được x%, trong nhóm đó sai số giảm y%"
 * vẫn là một kết quả có nghĩa — nhưng chỉ khi x được nói ra.
 */
export function fullTextHitRate(
  statuses: string[],
  totalSources: number,
): number | null {
  if (totalSources === 0) return null;
  return statuses.filter((s) => s === 'OK').length / totalSources;
}

/**
 * `low_credibility_claim_rate` — tỉ lệ thẻ bị chặn cổng mà **mọi** nguồn chống lưng đều ở mức
 * thấp nhất. `null` khi không có thẻ nào để đo, khác hẳn `0` nghĩa là "đo được và bằng không".
 */
export function lowCredibilityClaimRate(
  cards: { tiers: string[] }[],
): number | null {
  const withSources = cards.filter((c) => c.tiers.length > 0);
  if (withSources.length === 0) return null;
  const low = withSources.filter((c) => c.tiers.every((t) => t === 'REVIEW'));
  return low.length / withSources.length;
}

/**
 * `evidence_precision_human` — tỉ lệ nhãn máy trùng nhãn người, trên những cặp đã được chấm mù.
 * `null` khi chưa gán nhãn cặp nào; báo `0` ở đó là nói dối bằng số.
 */
export function evidencePrecisionHuman(
  checks: { match: boolean }[],
): number | null {
  if (checks.length === 0) return null;
  return checks.filter((c) => c.match).length / checks.length;
}

/**
 * `conflict_detected` — số cặp nguồn mâu thuẫn bắt được.
 *
 * Baseline của khoá này là **0** theo đúng nghĩa đen: trước #3 không cơ chế nào gán `CONFLICT`.
 * Vì vậy nó không bao giờ `null` — 0 ở đây là một phép đo, không phải thiếu dữ liệu.
 */
export function conflictDetected(count: number): number {
  return count;
}
