import { z } from 'zod';
import { estimatorInputSchema } from '../estimator';
import {
  cardStatusSchema,
  cardTypeSchema,
  confidenceLevelSchema,
} from '../enums';

/**
 * Schema output của `prompts/generator.md`, mục đích PARAPHRASE + DECOMPOSE.
 * Ngôn ngữ: nội dung thẻ tiếng Anh, câu hỏi làm rõ tiếng Việt (STACK §10).
 */

export const generatedCardSchema = z.object({
  type: cardTypeSchema,
  status: cardStatusSchema,
  title: z.string().min(1),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const clarifyOptionSchema = z.object({
  key: z.enum(['A', 'B', 'C']),
  label: z.string().min(1),
  explain: z.string(),
  example: z.string(),
  recommended: z.boolean().optional(),
});

export const clarifyQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(clarifyOptionSchema).min(2).max(3),
});

export const analyzeOutputSchema = z.object({
  title: z.string().min(1),
  domain: z.string(),
  paraphrase_en: z.string().min(1),
  paraphrase_vi: z.string().min(1),
  confidence: confidenceLevelSchema,
  key_problems: z.array(z.string()).min(1),
  topics: z.array(z.string()),
  search_keywords: z.array(z.string()).min(1),
  cards: z.array(generatedCardSchema).min(1),
  clarifying_questions: z.array(clarifyQuestionSchema).min(1).max(4),
});
export type AnalyzeOutput = z.infer<typeof analyzeOutputSchema>;

export const relatedWorkOutputSchema = z.object({
  rows: z.array(
    z.object({
      source_id: z.string().min(1),
      what_done: z.string(),
      feedback_type: z.string(),
      what_missing: z.string(),
    }),
  ),
});
export type RelatedWorkOutput = z.infer<typeof relatedWorkOutputSchema>;

export const gapOutputSchema = z.object({
  gaps: z
    .array(
      z.object({
        title: z.string().min(1),
        prior_work: z.string().min(1),
        limitation: z.string().min(1),
        why_it_matters: z.string().min(1),
        testable_experiment: z.string().min(1),
        source_ids: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  direction_options: z.array(clarifyOptionSchema).min(2).max(3),
});
export type GapOutput = z.infer<typeof gapOutputSchema>;

export const contributionOutputSchema = z.object({
  proposed_approach: z.string().min(1),
  contributions: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        source_ids: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  claims: z
    .array(
      z.object({
        claim: z.string().min(1),
        baseline: z.string().min(1),
        metric: z.string().min(1),
        evidence: z.string().min(1),
        refutation_condition: z.string().min(1),
        source_ids: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});
export type ContributionOutput = z.infer<typeof contributionOutputSchema>;

export const experimentOutputSchema = z.object({
  experiments: z
    .array(
      z.object({
        code: z.string().min(1),
        title: z.string().min(1),
        bullets: z.array(z.string()).min(1),
        linked_claim_title: z.string().optional().default(''),
      }),
    )
    .min(1),
  baselines_and_metrics: z.string().min(1),
  ablation_plan: z.string().min(1),
  risks_and_limitations: z.string().min(1),
  /**
   * `nullable` là **một giá trị hợp lệ**, không phải sự khoan dung.
   *
   * Trường này hỏi số tham số model và mức lượng tử hoá. Một thử nghiệm lâm sàng hay một khảo
   * sát người dùng **không có model nào**, nên bắt buộc trường này là buộc mô hình phải bịa —
   * và vòng thử lại của `LlmService` còn nhét lỗi zod ngược lại cho nó, tức là ép nó bịa cho
   * bằng được. Số bịa mà lọt schema thì bước 3 hiện một con số VRAM hư cấu như thể đã tính:
   * hỏng **nguy hiểm hơn** hẳn so với không có số.
   *
   * Cho phép `null` là mở một đường ra trung thực. `prompts/generator_experiment.md` rule 8
   * bắt kèm `estimator_note` giải thích nút thắt tài nguyên thật là gì.
   *
   * Dùng **chung** `estimatorInputSchema` chứ không chép lại: bản chép tay trước đây khai
   * `z.number()` ở chỗ bản gốc khai `.positive()`, nên giá trị `0` lọt qua đây rồi chết ở
   * tầng trong — sau khi kế hoạch đã lưu.
   */
  estimator_inputs: estimatorInputSchema.nullable(),
  /** Một câu nói nút thắt tài nguyên thật là gì khi `estimator_inputs` là `null`. */
  estimator_note: z.string().optional().default(''),
});
export type ExperimentOutput = z.infer<typeof experimentOutputSchema>;

export const optionsOutputSchema = z.object({
  question: z.string().min(1),
  options: z.array(clarifyOptionSchema).min(2).max(3),
});
export type OptionsOutput = z.infer<typeof optionsOutputSchema>;
