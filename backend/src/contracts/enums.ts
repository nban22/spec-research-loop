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
]);
export type VerifierFlag = z.infer<typeof verifierFlagSchema>;

// 5 judge có tên cụ thể theo đề (kim-chỉ-nam §3 bước 9).
export const JUDGE_DEFS = [
  { key: 'J1', promptId: 'judge_gap', model: 'deepseek-v4-pro' },
  { key: 'J2', promptId: 'judge_contribution', model: 'deepseek-v4-flash' },
  { key: 'J3', promptId: 'judge_experiment', model: 'deepseek-v4-pro' },
  { key: 'J4', promptId: 'judge_evidence', model: 'deepseek-v4-flash' },
  { key: 'J5', promptId: 'judge_readiness', model: 'deepseek-v4-pro' },
] as const satisfies ReadonlyArray<{
  key: JudgeKey;
  promptId: string;
  model: string;
}>;

export const MAX_JUDGE_ROUNDS = 3;
/** Dưới ngưỡng này thì khái niệm "đồng thuận" mất nghĩa (SYSTEM_DESIGN_ANALYSIS C3 · F.7). */
export const MIN_JUDGES_FOR_DONE = 3;
