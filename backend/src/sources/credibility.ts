import { PREPRINT_SCORE, rankVenue } from './venue-rank';

/**
 * Chấm độ tin cậy của một nguồn (#1) — **hàm thuần, 0 token, 0 lời gọi mạng**.
 *
 * Đề bài gọi đích danh "cơ chế chấm độ tin cậy của nguồn" ở phần Khuyến khích sáng tạo của Bước 3.
 * Trước file này, danh sách nguồn ở bước 2 chỉ sắp theo `citation_count` rồi `year`, nên một claim
 * có thể đang được chống lưng hoàn toàn bằng nguồn yếu mà không ai nhận ra.
 *
 * Hai luật thiết kế, cả hai đều là tiêu chí hoàn thành của #1:
 *
 * 1. **Thuần và rẻ.** Không LLM, không mạng ⇒ chấm lại được sau mỗi lần upsert `Source` mà không
 *    tốn gì, và test không cần mock.
 * 2. **Người dùng không bao giờ thấy con số.** `total` chỉ để sắp xếp và để đo tương quan với nhãn
 *    verifier; thứ hiện ra là `tier` + `reason` — một câu tiếng Việt đọc được.
 */

export type CredibilityInput = {
  citation_count: number | null;
  year: number | null;
  doi_verified: boolean | null;
  abstract: string | null;
  venue: string | null;
  retrieved_from: string;
};

export type CredibilityTier = 'HIGH' | 'MEDIUM' | 'REVIEW';

export type CredibilityResult = {
  /** 0..1. Dùng để sắp xếp và đo, **không** hiển thị. */
  total: number;
  tier: CredibilityTier;
  /** Một câu tiếng Việt giải thích vì sao ra mức này. */
  reason: string;
  components: Record<ComponentKey, number>;
};

type ComponentKey =
  | 'citations_per_year'
  | 'doi_verified'
  | 'venue_rank'
  | 'abstract_len'
  | 'recency'
  | 'provider';

const WEIGHTS: Record<ComponentKey, number> = {
  citations_per_year: 0.3,
  doi_verified: 0.2,
  venue_rank: 0.2,
  abstract_len: 0.15,
  recency: 0.1,
  provider: 0.05,
};

export const TIER_HIGH = 0.62;
export const TIER_MEDIUM = 0.38;

/** Trích dẫn/năm đạt mức này coi như kịch trần — trên nữa không nói thêm được gì. */
const CITATIONS_PER_YEAR_CEILING = 40;
/** Abstract dài hơn ngần này thì đủ để verifier làm việc; dài thêm không cộng điểm. */
const ABSTRACT_FULL_CHARS = 800;
const RECENCY_FRESH_YEARS = 3;
const RECENCY_DEAD_YEARS = 15;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function ageOf(year: number | null, now: Date): number | null {
  if (year === null || !Number.isFinite(year)) return null;
  return Math.max(0, now.getUTCFullYear() - year);
}

/**
 * `log1p` chứ không tuyến tính: khoảng cách giữa 0 và 5 trích dẫn/năm nói nhiều hơn hẳn khoảng
 * cách giữa 200 và 205, và tuyến tính thì mọi paper không phải kinh điển đều dồn về 0.
 */
function citationsPerYearScore(
  citationCount: number | null,
  age: number | null,
): number {
  if (citationCount === null || citationCount < 0) return 0;
  const perYear = citationCount / Math.max(1, age ?? 1);
  return clamp01(Math.log1p(perYear) / Math.log1p(CITATIONS_PER_YEAR_CEILING));
}

/**
 * `null` = registry không tra được, **không phải** "DOI sai" — cho 0.5 chứ không phạt như `false`.
 * Đây đúng tinh thần fail-open mà tầng L0 của verifier đã chọn: Crossref chết thì gắn cờ
 * `DOI_UNVERIFIED`, không hạ nhãn.
 */
function doiScore(doiVerified: boolean | null): number {
  if (doiVerified === true) return 1;
  if (doiVerified === false) return 0;
  return 0.5;
}

function abstractScore(abstract: string | null): number {
  const len = abstract?.trim().length ?? 0;
  return clamp01(len / ABSTRACT_FULL_CHARS);
}

function recencyScore(age: number | null): number {
  if (age === null) return 0.4; // không biết năm — không thưởng, không phạt nặng
  if (age <= RECENCY_FRESH_YEARS) return 1;
  if (age >= RECENCY_DEAD_YEARS) return 0;
  return clamp01(
    (RECENCY_DEAD_YEARS - age) / (RECENCY_DEAD_YEARS - RECENCY_FRESH_YEARS),
  );
}

/**
 * Provider gần như không phân biệt được gì (cả hai đều là chỉ mục học thuật) nên trọng số chỉ 0.05.
 * Giữ lại vì #1 liệt kê nó, và vì nếu sau này có nguồn người dùng tự thêm thì chỗ này là nơi phạt.
 */
function providerScore(retrievedFrom: string): number {
  return retrievedFrom === 'SEMANTIC_SCHOLAR' || retrievedFrom === 'OPENALEX'
    ? 1
    : 0.6;
}

/** Câu giải thích cho **thành phần mạnh nhất** và **yếu nhất**, không phải cho cả sáu. */
const PHRASE_STRONG: Record<ComponentKey, string> = {
  citations_per_year: 'được trích dẫn đều đặn so với tuổi của nó',
  doi_verified: 'DOI tra ra được ở registry',
  venue_rank: 'công bố ở nơi có tên tuổi',
  abstract_len: 'có tóm tắt đầy đủ để đối chiếu',
  recency: 'còn mới',
  provider: 'lấy từ chỉ mục học thuật',
};

const PHRASE_WEAK: Record<ComponentKey, string> = {
  citations_per_year: 'gần như chưa được ai trích dẫn',
  doi_verified: 'DOI không tra ra ở registry nào',
  venue_rank: 'nơi công bố không nằm trong danh sách hội nghị và tạp chí lớn',
  abstract_len: 'tóm tắt quá ngắn để đối chiếu bằng chứng',
  recency: 'đã cũ',
  provider: 'không lấy từ chỉ mục học thuật quen thuộc',
};

const TIER_OPENING: Record<CredibilityTier, string> = {
  HIGH: 'Đáng tin',
  MEDIUM: 'Trung bình',
  REVIEW: 'Cần cân nhắc',
};

function pickExtremes(components: Record<ComponentKey, number>): {
  strongest: ComponentKey;
  weakest: ComponentKey;
} {
  const keys = Object.keys(components) as ComponentKey[];
  // Xếp theo **đóng góp có trọng số**, không theo điểm thô: một thành phần 1.0 nặng 0.05
  // không phải là lý do nguồn này đáng tin.
  const sorted = [...keys].sort(
    (a, b) => components[b] * WEIGHTS[b] - components[a] * WEIGHTS[a],
  );
  return { strongest: sorted[0], weakest: sorted[sorted.length - 1] };
}

export function scoreSource(
  input: CredibilityInput,
  now: Date,
): CredibilityResult {
  const age = ageOf(input.year, now);
  const venue = rankVenue(input.venue);

  const components: Record<ComponentKey, number> = {
    citations_per_year: citationsPerYearScore(input.citation_count, age),
    doi_verified: doiScore(input.doi_verified),
    venue_rank: venue.score,
    abstract_len: abstractScore(input.abstract),
    recency: recencyScore(age),
    provider: providerScore(input.retrieved_from),
  };

  const total = (Object.keys(components) as ComponentKey[]).reduce(
    (sum, k) => sum + components[k] * WEIGHTS[k],
    0,
  );

  const tier: CredibilityTier =
    total >= TIER_HIGH ? 'HIGH' : total >= TIER_MEDIUM ? 'MEDIUM' : 'REVIEW';

  const { strongest, weakest } = pickExtremes(components);
  // Venue có ba ca chứ không hai — "không tra được" khác hẳn "là bản tiền ấn", và người đọc
  // cần phân biệt để biết có nên tự đi tra hay không.
  const venueNote =
    venue.score === PREPRINT_SCORE
      ? ' Đây là bản tiền ấn, chưa qua phản biện.'
      : venue.label === null && input.venue
        ? ' Nơi công bố không tra được trong bảng hạng.'
        : '';

  const reason =
    strongest === weakest
      ? `${TIER_OPENING[tier]} — ${PHRASE_WEAK[weakest]}.${venueNote}`
      : `${TIER_OPENING[tier]} — ${PHRASE_STRONG[strongest]}, nhưng ${PHRASE_WEAK[weakest]}.${venueNote}`;

  return { total, tier, reason, components };
}
