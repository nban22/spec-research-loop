import { z } from 'zod';

/**
 * Khối kế hoạch thí nghiệm lưu ở `ExperimentPlan.plan` (jsonb).
 * Gói cả bốn phần văn xuôi đi kèm vào một bản ghi 1–1 với version, vì chúng sinh ra cùng một lượt
 * và luôn đọc cùng nhau — tách bảng chỉ để chia nhỏ là phi chuẩn hoá ngược.
 */
export const experimentPlanBlobSchema = z.object({
  experiments: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      bullets: z.array(z.string()),
      linked_claim_title: z.string().default(''),
    }),
  ),
  baselines_and_metrics: z.string().default(''),
  ablation_plan: z.string().default(''),
  risks_and_limitations: z.string().default(''),
});
export type ExperimentPlanBlob = z.infer<typeof experimentPlanBlobSchema>;

/**
 * `Card.payload.role` phân biệt "proposed approach" (mục 5 của spec) với các contribution
 * thường (mục 6). Cả hai đều là `CardType.CONTRIBUTION` vì enum 8 loại thẻ là schema trung tâm
 * và không được nới ra chỉ để chứa một mục trình bày.
 */
export const CARD_ROLE_PROPOSED_APPROACH = 'proposed_approach';

export function cardRole(payload: unknown): string | null {
  if (payload && typeof payload === 'object') {
    const r = (payload as Record<string, unknown>).role;
    if (typeof r === 'string') return r;
  }
  return null;
}
