import { z } from 'zod';

// Mọi enum ở đây phải khớp 1-1 với `prisma/schema.prisma` và với
// `frontend/src/lib/types.ts` (STACK §3.1 luật 1 & 2). Sửa một chỗ là sửa cả ba, cùng commit.

export const cardTypeSchema = z.enum([
  'PROBLEM',
  'RESEARCH_QUESTION',
  'GAP',
  'CONTRIBUTION',
  'CLAIM',
  'EVIDENCE',
  'CONSTRAINT',
  'OPEN_QUESTION',
]);
export type CardType = z.infer<typeof cardTypeSchema>;

export const cardStatusSchema = z.enum([
  'CONFIRMED',
  'PROPOSED',
  'MISSING',
  'AMBIGUOUS',
  'UNSUPPORTED',
  'CONFLICT',
]);
export type CardStatus = z.infer<typeof cardStatusSchema>;

export const cardOriginSchema = z.enum(['GENERATOR', 'USER', 'JUDGE_FIX']);
export type CardOrigin = z.infer<typeof cardOriginSchema>;

export const severitySchema = z.enum(['CRITICAL', 'MAJOR', 'MINOR']);
export type Severity = z.infer<typeof severitySchema>;

export const supportLabelSchema = z.enum(['SUPPORTED', 'WEAK', 'UNSUPPORTED']);
export type SupportLabel = z.infer<typeof supportLabelSchema>;

export const entailmentSchema = z.enum([
  'ENTAILS',
  'PARTIAL',
  'NOT_ENTAILED',
  'CONTRADICTS',
]);
export type Entailment = z.infer<typeof entailmentSchema>;

export const confidenceLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const judgeKeySchema = z.enum(['J1', 'J2', 'J3', 'J4', 'J5']);
export type JudgeKey = z.infer<typeof judgeKeySchema>;

export const projectStepSchema = z.enum(['S1', 'S2', 'S3', 'S4', 'S5']);
export type ProjectStep = z.infer<typeof projectStepSchema>;

export const armSchema = z.enum(['B1', 'B2', 'SYS', 'SYS_NO_VERIFY']);
export type Arm = z.infer<typeof armSchema>;

export const sourceProviderSchema = z.enum([
  'SEMANTIC_SCHOLAR',
  'OPENALEX',
  'ARXIV',
  'CROSSREF',
]);
export type SourceProvider = z.infer<typeof sourceProviderSchema>;

export const jobKindSchema = z.enum([
  'ANALYZE',
  'SEARCH',
  'RELATED_WORK',
  'GENERATE',
  'JUDGE',
  'VERIFY',
  'EXPORT',
]);
export type JobKind = z.infer<typeof jobKindSchema>;

export const exportFormatSchema = z.enum(['MD', 'PDF']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

// Cờ chẩn đoán của verifier — lưu ở `CardSource.flags`.
export const verifierFlagSchema = z.enum([
  'SOURCE_NOT_FOUND',
  'EMPTY_ABSTRACT',
  'STALE_SOURCE',
  'NUMBER_NOT_IN_SOURCE',
  'FABRICATED_QUOTE',
  'DOI_UNVERIFIED',
  'LLM_UNAVAILABLE',
  // Làn A · #2. Ngoại lệ có ý thức với luật chung 2 ("không thêm giá trị vào enum đang có"):
  // đây là zod enum lưu xuống cột `Json?`, **không** phải enum Prisma — không migration, không
  // rủi ro chéo làn. Ba tầng (enums.ts · frontend/types.ts · status-style.ts) sửa cùng một commit
  // đúng như backend/CLAUDE.md §7 đòi.
  'FULLTEXT_USED',
  'FULLTEXT_UNAVAILABLE',
  // Cặp dừng sau L2 vì loại thẻ không hỏi bằng phép kéo theo — xem `ENTAILMENT_CARD_TYPES`.
  // Không có cờ này thì nhãn WEAK của một thẻ GAP trông y hệt "đã hỏi mô hình và bằng chứng
  // yếu", trong khi thật ra mô hình chưa từng được hỏi.
  'CITATION_ONLY',
]);
export type VerifierFlag = z.infer<typeof verifierFlagSchema>;

// 5 judge có tên cụ thể theo đề (kim-chỉ-nam §3 bước 9).
/**
 * Trần token đầu ra của một judge nói **về bản spec** (J1 gap, J2 contribution, J5 readiness).
 *
 * 12 000 chứ không phải 8 000. Số đo trên 43 lượt chạy thật cho thấy 8 000 **không** đủ như tao
 * tưởng lúc đầu: ba con này lần lượt đụng trần 1 lần mỗi con, và lượt tốn nhiều nhất trong số
 * *sống sót* đã là 7 771 — tức mẫu đó bị thiên lệch, những lượt to hơn đã chết trước khi được ghi
 * là thành công. Đặt trần sát ngay trên số quan sát được là đặt trần theo mẫu còn sống.
 *
 * Nâng trần **không tốn thêm tiền**: `max_tokens` là mức chặn, không phải mức mua. Chỉ trả cho
 * token thật sự sinh ra. Cái giữ đầu ra ngắn là prompt, không phải trần.
 */
const JUDGE_MAX_TOKENS = 12_000;

/**
 * Trần cho `judge_experiment` (J3).
 *
 * J3 là judge **phụ thuộc vòng thử lại nặng nhất**: 12/21 lượt có lượt đầu bị cắt ở 8 000 rồi
 * lượt sau mới lọt. Đầu ra của nó tỉ lệ với **số claim × số thí nghiệm**, nên nó phình theo bản
 * spec chứ không theo số nguồn như J4.
 *
 * Trước đây chuyện đó không lộ ra vì câu bị cắt trông y hệt câu sai schema nên được thử lại một
 * cách tình cờ. Khi `LlmService` bắt đầu phân biệt hai ca đó, J3 là con chết đầu tiên.
 */
const JUDGE_EXPERIMENT_MAX_TOKENS = 16_000;

/**
 * Trần riêng cho `judge_evidence` (J4).
 *
 * J4 là judge duy nhất có **đầu ra tỉ lệ với số cặp claim–nguồn**, chứ không tỉ lệ với độ dài
 * bản spec. Đo thật: J4 nhận tới 94 452 token đầu vào — gần gấp ba J2 — và **3/19 lượt đụng
 * đúng trần 8 000**, cả ba lượt thử đều bị cắt ngang nên JSON đứt và judge bị bỏ.
 *
 * Loại lỗi này tệ ở chỗ **nó xuất hiện khi dự án làm nghiêm túc**: càng nhiều nguồn thì càng
 * nhiều cặp phải kiểm, và J4 lại chính là judge kiểm chứng cứ — mất nó là mất phiếu quan trọng
 * nhất của bảng đồng thuận.
 *
 * 24 000 chứ không phải 16 000: sau khi nâng lên 16 000 nó **vẫn đụng trần thêm 2 lần**, và
 * một lượt thành công đã tiêu 14 732 token chỉ trong một lượt thử.
 *
 * Nâng trần **chỉ cầm máu**, không chữa gốc: dự án đủ lớn vẫn tràn. Phần chữa gốc nằm ở
 * `prompts/judge_evidence.md` — nó bị buộc phải báo **tối đa 12 phát hiện nặng nhất**, để đầu ra
 * bị chặn theo *thiết kế* thay vì theo may mắn.
 */
const JUDGE_EVIDENCE_MAX_TOKENS = 24_000;

export const JUDGE_DEFS = [
  {
    key: 'J1',
    promptId: 'judge_gap',
    model: 'deepseek-v4-pro',
    maxTokens: JUDGE_MAX_TOKENS,
  },
  {
    key: 'J2',
    promptId: 'judge_contribution',
    model: 'deepseek-v4-flash',
    maxTokens: JUDGE_MAX_TOKENS,
  },
  {
    key: 'J3',
    promptId: 'judge_experiment',
    model: 'deepseek-v4-pro',
    maxTokens: JUDGE_EXPERIMENT_MAX_TOKENS,
  },
  {
    key: 'J4',
    promptId: 'judge_evidence',
    model: 'deepseek-v4-flash',
    maxTokens: JUDGE_EVIDENCE_MAX_TOKENS,
  },
  {
    key: 'J5',
    promptId: 'judge_readiness',
    model: 'deepseek-v4-pro',
    maxTokens: JUDGE_MAX_TOKENS,
  },
] as const satisfies ReadonlyArray<{
  key: JudgeKey;
  promptId: string;
  model: string;
  maxTokens: number;
}>;

export const MAX_JUDGE_ROUNDS = 3;
/** Dưới ngưỡng này thì khái niệm "đồng thuận" mất nghĩa (SYSTEM_DESIGN_ANALYSIS C3 · F.7). */
export const MIN_JUDGES_FOR_DONE = 3;
