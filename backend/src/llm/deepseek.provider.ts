import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AppError } from '../common/app-error';
import type { Env } from '../common/env';
import { isTransientLlmError, LlmTransportError } from './llm-transient';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from './llm-provider.interface';

/**
 * DeepSeek thêm hai trường cache ngoài chuẩn OpenAI. Chúng là dữ liệu bắt buộc của báo cáo đánh giá
 * (tỉ lệ ăn cache prefix — SYSTEM_DESIGN_ANALYSIS §3.3), nên khai tường minh ở đây thay vì
 * đọc mò qua `any`.
 */
type DeepseekUsage = {
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

/**
 * Hiện thực duy nhất của `LlmProvider`. Đây là **file duy nhất** được phép gọi
 * `client.chat.completions.create` (backend/CLAUDE.md §6).
 */
@Injectable()
export class DeepseekProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor(config: ConfigService<Env, true>) {
    this.client = new OpenAI({
      apiKey: config.get('DEEPSEEK_API_KEY', { infer: true }),
      baseURL: config.get('DEEPSEEK_BASE_URL', { infer: true }),
      timeout: 180_000,
      maxRetries: 0, // retry do LlmService quản lý, để đếm được `attempts`
    });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    try {
      const res = await this.client.chat.completions.create({
        model: req.model,
        messages: req.messages,
        // temperature 0 cho MỌI lời gọi — NFR reproducibility (STACK §2.3).
        temperature: 0,
        // max_tokens set tường minh: JSON bị cắt giữa chừng là lỗi phổ biến nhất của JSON mode.
        max_tokens: req.maxTokens,
        response_format: { type: 'json_object' },
        reasoning_effort: req.reasoningEffort,
        user: req.cacheScope,
      });

      const content = res.choices[0]?.message?.content ?? '';
      const usage = res.usage;
      const cache = (usage ?? {}) as DeepseekUsage;

      return {
        content,
        usage: {
          prompt_tokens: usage?.prompt_tokens ?? 0,
          completion_tokens: usage?.completion_tokens ?? 0,
          cache_hit_tokens: cache.prompt_cache_hit_tokens ?? 0,
          cache_miss_tokens: cache.prompt_cache_miss_tokens ?? 0,
          latency_ms: Date.now() - startedAt,
        },
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Phân loại ngay tại đây vì đây là chỗ duy nhất còn giữ lỗi gốc của SDK; bọc thành
      // `AppError` là mất `status`, `name` và `cause`.
      if (isTransientLlmError(err)) {
        throw new LlmTransportError(`Could not reach DeepSeek: ${detail}`);
      }
      throw AppError.unavailable(
        'LLM_UNAVAILABLE',
        `Could not reach DeepSeek: ${detail}`,
      );
    }
  }
}
