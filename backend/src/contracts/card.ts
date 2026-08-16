import { z } from 'zod';
import { cardStatusSchema, cardTypeSchema, cardOriginSchema } from './enums';

/**
 * 8 loại thẻ dùng chung một bảng; phần riêng của từng loại nằm ở `Card.payload`
 * (ARCHITECTURE §2.5). An toàn kiểu bù lại bằng schema theo `type` ở file này.
 */

/** Gap phải trả lời đủ 4 câu hỏi của đề (kim-chỉ-nam §3 bước 4). */
export const gapPayloadSchema = z.object({
  prior_work: z.string(),
  limitation: z.string(),
  why_it_matters: z.string(),
  testable_experiment: z.string(),
});
export type GapPayload = z.infer<typeof gapPayloadSchema>;

/** Claim–Evidence Card có 5 trường; `refutation_condition` là trường hay bị quên. */
export const claimPayloadSchema = z.object({
  baseline: z.string(),
  metric: z.string(),
  evidence: z.string(),
  refutation_condition: z.string(),
});
export type ClaimPayload = z.infer<typeof claimPayloadSchema>;

export const cardPayloadSchema = z
  .union([
    gapPayloadSchema,
    claimPayloadSchema,
    z.record(z.string(), z.unknown()),
  ])
  .nullable();

export const cardSchema = z.object({
  id: z.string(),
  spec_version_id: z.string(),
  type: cardTypeSchema,
  status: cardStatusSchema,
  title: z.string(),
  body: z.string(),
  payload: z.unknown().nullable(),
  order_index: z.number().int(),
  parent_card_id: z.string().nullable(),
  origin: cardOriginSchema,
  conflict_with_card_id: z.string().nullable(),
});
export type Card = z.infer<typeof cardSchema>;

/** Bốn ô của gap — thiếu ô nào thì ô đó hiển thị trạng thái MISSING (S3 · F.5). */
export const GAP_FIELDS = [
  'prior_work',
  'limitation',
  'why_it_matters',
  'testable_experiment',
] as const;

export const CLAIM_FIELDS = [
  'baseline',
  'metric',
  'evidence',
  'refutation_condition',
] as const;

/** Thẻ nào bị verifier gate chặn khi còn nguồn UNSUPPORTED (ARCHITECTURE §6.6). */
export const GATED_CARD_TYPES = ['CLAIM', 'GAP', 'CONTRIBUTION'] as const;

/** Thẻ nào là đầu vào của verifier (ARCHITECTURE §6.2). */
export const VERIFIABLE_CARD_TYPES = [
  'CLAIM',
  'GAP',
  'CONTRIBUTION',
  'EVIDENCE',
] as const;
