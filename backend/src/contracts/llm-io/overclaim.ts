import { z } from 'zod';

/**
 * Ba đường ra của Bước 10 khi một claim bị cờ phóng đại. Cố ý **không** khai thành enum Prisma:
 * enum là thứ ba tầng (Prisma · zod · `frontend/src/lib/types.ts`) phải sửa cùng lúc, mà làn B
 * không được sửa file dùng chung ngoài việc thêm dòng cuối. Lưu dạng `String`, chốt kiểu ở đây.
 */
export const overclaimExitSchema = z.enum([
  /** Thu hẹp claim về đúng phạm vi thí nghiệm chứng minh được. */
  'NARROW_CLAIM',
  /** Giữ claim, mở rộng thí nghiệm cho đủ phạm vi đã khai. */
  'EXPAND_EXPERIMENT',
  /** Hạ claim xuống câu hỏi nghiên cứu — giữ ý tưởng, bỏ lời khẳng định. */
  'TO_RESEARCH_QUESTION',
]);
export type OverclaimExit = z.infer<typeof overclaimExitSchema>;

export const overclaimLevelSchema = z.enum([
  'NONE',
  'MINOR',
  'MAJOR',
  'CRITICAL',
]);
export type OverclaimLevel = z.infer<typeof overclaimLevelSchema>;

/**
 * Output của `prompts/judge_overclaim.md` — tầng LLM của B1, **chỉ chạy cho vùng xám**
 * mà tầng luật không kết luận được.
 *
 * `suggested_narrowing` là bắt buộc và phải là **một câu dùng được ngay**: tiêu chí hoàn thành
 * của #7 nói rõ mỗi cờ phải kèm câu thu hẹp, không phải chỉ là lời cảnh báo.
 */
export const overclaimOutputSchema = z.object({
  level: overclaimLevelSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  suggested_narrowing: z.string().default(''),
  recommended_exit: overclaimExitSchema,
  /** Cụm chữ trong claim khiến nó bị coi là phóng đại. Rỗng khi `level = NONE`. */
  offending_phrases: z.array(z.string()).default([]),
});
export type OverclaimOutput = z.infer<typeof overclaimOutputSchema>;
