import { z } from 'zod';
import { cardStatusSchema, cardTypeSchema } from '../enums';

/** Output của `prompts/generator_revise.md` — bản nháp thay đổi cho version kế tiếp. */
export const reviseOutputSchema = z.object({
  summary: z.string(),
  changes: z
    .array(
      z.object({
        target_card_title: z.string(),
        operation: z.enum([
          'UPDATE',
          'ADD',
          'DEMOTE_TO_OPEN_QUESTION',
          'DELETE',
        ]),
        new_type: cardTypeSchema.optional(),
        new_status: cardStatusSchema.optional(),
        new_title: z.string().default(''),
        new_body: z.string().default(''),
        new_payload: z.record(z.string(), z.unknown()).nullable().optional(),
        rationale: z.string().default(''),
      }),
    )
    .max(12),
});
export type ReviseOutput = z.infer<typeof reviseOutputSchema>;
