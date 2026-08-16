import { z } from 'zod';
import { severitySchema } from '../enums';

/**
 * Khuôn output chung của 5 judge. Dùng chung **schema**, không dùng chung **context**:
 * mỗi judge là một lời gọi riêng với prompt riêng, không judge nào thấy output của judge khác
 * (STACK §1 ràng buộc 3). Format issue theo đề: Vấn đề / Lý do / Mức độ / Đề xuất.
 */
export const judgeOutputSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      title: z.string().min(1),
      reason: z.string().min(1),
      severity: severitySchema,
      suggestion: z.string().min(1),
      target_card_title: z.string().optional().default(''),
    }),
  ),
});
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

/** Output của `prompts/verifier_entailment.md` — tầng L4 (ARCHITECTURE §6.4). */
export const entailmentOutputSchema = z.object({
  verdict: z.enum(['ENTAILS', 'PARTIAL', 'NOT_ENTAILED', 'CONTRADICTS']),
  confidence: z.number().min(0).max(1),
  evidence_sentence: z.string().nullable().default(null),
  // `reason` chỉ để người đọc hiểu vì sao máy kết luận vậy — thiếu nó không đổi nhãn cuối,
  // nên cho mặc định thay vì tốn một lượt retry (thấy khi chạy batch thật).
  reason: z.string().default(''),
});
export type EntailmentOutput = z.infer<typeof entailmentOutputSchema>;

/** Output của `prompts/auditor.md` — chấm blind trong eval (ARCHITECTURE §7.5). */
export const auditorOutputSchema = z.object({
  issues: z.array(
    z.object({
      title: z.string().min(1),
      severity: severitySchema,
      reason: z.string(),
    }),
  ),
  overall_comment: z.string(),
});
export type AuditorOutput = z.infer<typeof auditorOutputSchema>;

/** Output của arm B1 — một prompt duy nhất ra spec 14 mục (ARCHITECTURE §7.1). */
export const singleShotOutputSchema = z.object({
  title: z.string().min(1),
  sections: z.array(
    z.object({
      no: z.number().int().min(1).max(14),
      title: z.string(),
      body: z.string(),
    }),
  ),
  citations: z
    .array(
      z.object({
        title: z.string(),
        year: z.number().int().nullable().optional(),
        doi: z.string().nullable().optional(),
        supports_claim: z.string().optional().default(''),
      }),
    )
    .default([]),
});
export type SingleShotOutput = z.infer<typeof singleShotOutputSchema>;
