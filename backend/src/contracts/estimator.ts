import { z } from 'zod';

/**
 * Tham số đầu vào của bộ ước lượng tài nguyên (Bước 7 của đề).
 *
 * Sống ở `contracts/` chứ không ở `estimator/` vì **ba nơi cùng dùng nó**: bộ ước lượng,
 * schema output của LLM ở `contracts/llm-io/generator.ts`, và endpoint người dùng tự nhập
 * (backend/CLAUDE.md §2 — type dùng chung sống ở `src/contracts/`).
 *
 * ## Vì sao chuyển ra đây, không phải dọn dẹp cho gọn
 *
 * Trước đây có **hai** schema cho cùng một thứ: bản này, và một bản chép tay lỏng hơn nằm trong
 * `experimentOutputSchema` — bản đó khai `z.number()` ở chỗ bản này khai `.positive().max()`.
 * Hệ quả là một lớp lỗi im lặng: giá trị **lọt** schema ngoài rồi **chết** ở schema trong, sau
 * khi kế hoạch thí nghiệm đã được lưu. Đã xảy ra thật với 5 job.
 *
 * Một schema, một sự thật. Sửa ràng buộc ở đây là cả ba nơi đổi theo.
 */
export const estimatorInputSchema = z.object({
  model_params_b: z.number().positive().max(2000),
  quantization: z.enum(['fp16', 'int8', 'int4']),
  candidates: z.number().int().positive().max(10_000),
  rounds: z.number().int().positive().max(1_000),
  eval_samples: z.number().int().positive().max(1_000_000),
  avg_prompt_tokens: z.number().int().positive().max(200_000),
  avg_output_tokens: z.number().int().positive().max(200_000),
});
export type EstimatorInput = z.infer<typeof estimatorInputSchema>;

/**
 * Vì sao một kế hoạch thí nghiệm **không** có ước lượng tài nguyên.
 *
 * Trạng thái này phải được **ghi xuống**, không được suy ra từ sự vắng mặt của `ResourceEstimate`.
 * Ba lý do dưới đây dẫn tới ba câu nói khác nhau với người dùng, và ba hành động khác nhau —
 * gộp chúng lại thành "không có estimate" là buộc giao diện phải đoán, và đoán sai.
 */
export const ESTIMATE_STATUS = {
  /** Có ước lượng, bình thường. */
  OK: 'OK',
  /**
   * Kế hoạch **không chạy trên mô hình nào** — thử nghiệm lâm sàng, khảo sát người dùng, nghiên
   * cứu định tính. Không có gì để ước lượng, và đó không phải lỗi.
   */
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  /**
   * Kế hoạch **có** phần tính toán nhưng tham số mô hình trả về không hợp lệ. Khác hẳn ca trên:
   * ở đây người dùng **nên** được mời tự nhập, vì con số đó tồn tại, chỉ là chưa lấy được.
   */
  INVALID_PARAMS: 'INVALID_PARAMS',
} as const;
export type EstimateStatus =
  (typeof ESTIMATE_STATUS)[keyof typeof ESTIMATE_STATUS];
