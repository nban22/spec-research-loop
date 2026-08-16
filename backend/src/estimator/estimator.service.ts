import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Bước 7 của đề: ước lượng tài nguyên và **đề xuất giảm quy mô nếu vượt RTX 3090**.
 *
 * Hàm thuần, **0 LLM, 0 I/O** — nên đây là chỗ rẻ nhất trong toàn dự án để có unit test,
 * và tài liệu yêu cầu tường minh phải có (SYSTEM_DESIGN_ANALYSIS S4).
 *
 * "RTX 3090" là **nội dung website sinh ra cho user**, không phải ràng buộc hạ tầng của website
 * (kim-chỉ-nam §5) — module này là một calculator, không cần GPU nào cả.
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

export type DownscaleSuggestion = {
  field: keyof EstimatorInput;
  from: number | string;
  to: number | string;
  reason: string;
};

export type EstimateResult = {
  inputs: EstimatorInput;
  vram_gb: number;
  hours_min: number;
  hours_max: number;
  tokens_est: number;
  cost_usd: number;
  fits_rtx3090: boolean;
  warn_near_limit: boolean;
  downscale_suggestion: DownscaleSuggestion[] | null;
  breakdown: { label: string; value: string }[];
};

const BYTES_PER_PARAM = { fp16: 2, int8: 1, int4: 0.5 } as const;
/** Weight + KV cache + activation + phân mảnh của runtime. */
const OVERHEAD_FACTOR = 1.25;
const RTX3090_VRAM_GB = 24;
const WARN_VRAM_GB = 20;

/** Đơn giá DeepSeek — ước tính, ghi rõ là ước tính (SYSTEM_DESIGN_ANALYSIS §4.4 #10). */
const USD_PER_1M_PROMPT_TOKENS = 0.28;
const USD_PER_1M_OUTPUT_TOKENS = 0.42;

const SECONDS_PER_CALL_MIN = 8;
const SECONDS_PER_CALL_MAX = 25;

@Injectable()
export class EstimatorService {
  estimate(input: EstimatorInput): EstimateResult {
    const vramRaw =
      input.model_params_b *
      1e9 *
      BYTES_PER_PARAM[input.quantization] *
      OVERHEAD_FACTOR;
    const vram_gb = round(vramRaw / 1024 ** 3, 2);

    const calls = input.candidates * input.rounds * input.eval_samples;
    const tokens_est =
      calls * (input.avg_prompt_tokens + input.avg_output_tokens);

    const hours_min = round((calls * SECONDS_PER_CALL_MIN) / 3600, 2);
    const hours_max = round((calls * SECONDS_PER_CALL_MAX) / 3600, 2);

    const cost_usd = round(
      (calls * input.avg_prompt_tokens * USD_PER_1M_PROMPT_TOKENS) / 1e6 +
        (calls * input.avg_output_tokens * USD_PER_1M_OUTPUT_TOKENS) / 1e6,
      2,
    );

    const fits_rtx3090 = vram_gb <= RTX3090_VRAM_GB;
    const warn_near_limit = !fits_rtx3090 || vram_gb >= WARN_VRAM_GB;

    return {
      inputs: input,
      vram_gb,
      hours_min,
      hours_max,
      tokens_est,
      cost_usd,
      fits_rtx3090,
      warn_near_limit,
      downscale_suggestion: this.downscale(input, vram_gb, hours_max),
      breakdown: [
        {
          label: 'VRAM',
          value: `${input.model_params_b}B × ${BYTES_PER_PARAM[input.quantization]} byte/param × ${OVERHEAD_FACTOR} overhead`,
        },
        {
          label: 'Số lời gọi',
          value: `${input.candidates} candidate × ${input.rounds} vòng × ${input.eval_samples} mẫu = ${calls.toLocaleString('vi-VN')}`,
        },
        {
          label: 'Token',
          value: `${calls.toLocaleString('vi-VN')} × (${input.avg_prompt_tokens} + ${input.avg_output_tokens})`,
        },
        {
          label: 'Thời gian',
          value: `${SECONDS_PER_CALL_MIN}–${SECONDS_PER_CALL_MAX}s mỗi lời gọi`,
        },
      ],
    };
  }

  /**
   * Đề bài đòi tường minh: *"hệ thống có thể đề xuất giảm quy mô nếu vượt tài nguyên"*.
   * Đề xuất theo thứ tự ít thiệt hại nhất trước: lượng tử hoá → số candidate → số mẫu → số vòng.
   */
  private downscale(
    input: EstimatorInput,
    vram_gb: number,
    hours_max: number,
  ): DownscaleSuggestion[] | null {
    const out: DownscaleSuggestion[] = [];

    if (vram_gb > RTX3090_VRAM_GB) {
      if (input.quantization === 'fp16') {
        out.push({
          field: 'quantization',
          from: 'fp16',
          to: 'int8',
          reason: `VRAM ước tính ${vram_gb} GB vượt 24 GB của RTX 3090; lượng tử hoá int8 giảm còn khoảng ${round(vram_gb / 2, 2)} GB.`,
        });
      } else if (input.quantization === 'int8') {
        out.push({
          field: 'quantization',
          from: 'int8',
          to: 'int4',
          reason: `VRAM ước tính ${vram_gb} GB vẫn vượt 24 GB; int4 giảm còn khoảng ${round(vram_gb / 2, 2)} GB.`,
        });
      } else {
        const maxParams = round(
          (RTX3090_VRAM_GB * 1024 ** 3) /
            (1e9 * BYTES_PER_PARAM.int4 * OVERHEAD_FACTOR),
          1,
        );
        out.push({
          field: 'model_params_b',
          from: input.model_params_b,
          to: maxParams,
          reason: `Đã ở int4 mà vẫn vượt 24 GB; model tối đa vừa RTX 3090 là khoảng ${maxParams}B tham số.`,
        });
      }
    }

    // Quá 48 giờ thì lịch chạy không còn thực tế cho một đồ án.
    if (hours_max > 48) {
      if (input.candidates > 4) {
        const to = Math.max(4, Math.floor(input.candidates / 2));
        out.push({
          field: 'candidates',
          from: input.candidates,
          to,
          reason: `Thời gian tối đa ${hours_max} giờ; giảm candidate ${input.candidates}→${to} cắt gần một nửa khối lượng.`,
        });
      } else if (input.eval_samples > 100) {
        const to = Math.max(100, Math.floor(input.eval_samples / 2));
        out.push({
          field: 'eval_samples',
          from: input.eval_samples,
          to,
          reason: `Thời gian tối đa ${hours_max} giờ; giảm số mẫu đánh giá ${input.eval_samples}→${to} và báo cáo khoảng tin cậy rộng hơn.`,
        });
      } else if (input.rounds > 1) {
        out.push({
          field: 'rounds',
          from: input.rounds,
          to: Math.max(1, input.rounds - 1),
          reason: `Thời gian tối đa ${hours_max} giờ; bớt một vòng lặp.`,
        });
      }
    }

    return out.length > 0 ? out : null;
  }
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
