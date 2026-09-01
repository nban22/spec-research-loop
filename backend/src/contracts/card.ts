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

/**
 * Thẻ nào được **hỏi bằng phép kéo theo** (L3–L4). Tập con thật sự của
 * `VERIFIABLE_CARD_TYPES`: mọi loại thẻ vẫn qua L0–L2 (nguồn có thật · DOI tra được · con số
 * có trong nguồn), nhưng chỉ hai loại này mới có nghĩa khi hỏi *"nguồn có kéo theo câu này
 * không"*.
 *
 * Hai loại bị loại ra, và lý do là ngữ nghĩa chứ không phải hiệu năng:
 *
 * - **GAP khẳng định một sự vắng mặt** — *"No retrieved work evaluates a cross-encoder reranker
 *   on Vietnamese legal statute passages"*. Không tóm tắt đơn lẻ nào kéo theo được một phủ định
 *   phổ quát; câu hỏi đúng cho trích dẫn của một gap là *"nguồn này có thuộc mảng mà gap nói
 *   tới không"*, tức độ liên quan, không phải kéo theo.
 * - **CONTRIBUTION khẳng định việc tác giả sắp làm** — *"We define a paired evaluation that…"*.
 *   Một bài báo cũ mà kéo theo được nó thì nghĩa là đóng góp **không mới**, tức `ENTAILS` đáng
 *   ra là tín hiệu xấu — ngược hẳn cách bảng quyết định L5 đang dùng.
 *
 * Đo trên toàn bộ dữ liệu đã kiểm chứng của dự án: **0/315 cặp GAP** và **0/130 cặp
 * CONTRIBUTION** từng đạt `SUPPORTED`, trong khi `CLAIM` — đúng loại thẻ phép thử này sinh ra
 * để phục vụ — vẫn có 4/67. Không phải ngẫu nhiên, và nó là nguyên nhân của
 * `unsupported_rate ≈ 1` trong bảng ablation ở `docs/evaluation_report.md` phụ lục A.
 */
export const ENTAILMENT_CARD_TYPES = ['CLAIM', 'EVIDENCE'] as const;
