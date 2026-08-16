import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ZodType } from 'zod';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import { PromptLoaderService } from '../prompts/prompt-loader.service';
import type { LlmPurpose } from '../generated/prisma/enums';
import {
  LLM_PROVIDER,
  type LlmMessage,
  type LlmModel,
  type LlmProvider,
  type LlmUsage,
  type ReasoningEffort,
} from './llm-provider.interface';

export type CompleteJsonOptions<T> = {
  promptId: string;
  schema: ZodType<T>;
  model: LlmModel;
  purpose: LlmPurpose;
  variables: Record<string, unknown>;
  maxRetries?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  /** Ít nhất một trong bốn khoá liên kết phải có, để `LlmCall` gắn được vào đâu đó. */
  link?: {
    projectId?: string | null;
    specVersionId?: string | null;
    judgeRunId?: string | null;
    evalRunId?: string | null;
  };
};

export type CompleteJsonResult<T> = {
  data: T;
  usage: LlmUsage;
  attempts: number;
  promptHash: string;
  model: LlmModel;
  raw: string;
  /** Băm của đầu vào đã gửi — bằng chứng 5 judge nhận đúng cùng một input (NFR-JDG-1). */
  inputDigest: string;
};

/**
 * **Cửa duy nhất** ra DeepSeek. Đây là điều kiện để `usage` và `prompt_hash` luôn được ghi —
 * không có nó thì deliverable #8 không có dữ liệu (SYSTEM_DESIGN_ANALYSIS §1.4).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly prompts: PromptLoaderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Dựng cặp message cho một prompt mà **không** gọi API. Judge dùng hàm này để băm đầu vào
   * đúng một lần rồi đưa cùng một chuỗi cho cả 5 lời gọi (C3 · F.6).
   */
  buildMessages(
    promptId: string,
    variables: Record<string, unknown>,
  ): { messages: LlmMessage[]; promptHash: string; model: string } {
    const prompt = this.prompts.load(promptId);
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: PromptLoaderService.render(prompt.system, variables),
      },
    ];
    const user = PromptLoaderService.render(prompt.user, variables);
    if (user.length > 0) messages.push({ role: 'user', content: user });
    return { messages, promptHash: prompt.hash, model: prompt.model };
  }

  static digest(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  async completeJson<T>(
    opts: CompleteJsonOptions<T>,
  ): Promise<CompleteJsonResult<T>> {
    const maxRetries = opts.maxRetries ?? 2;
    const maxTokens = opts.maxTokens ?? 8000;
    const reasoningEffort = opts.reasoningEffort ?? 'low';

    const { messages, promptHash } = this.buildMessages(
      opts.promptId,
      opts.variables,
    );
    const inputDigest = LlmService.digest(
      messages.map((m) => `${m.role}:${m.content}`).join('\n---\n'),
    );

    const conversation: LlmMessage[] = [...messages];
    let attempts = 0;
    let lastError = '';
    const total: LlmUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
      latency_ms: 0,
    };

    while (attempts <= maxRetries) {
      attempts += 1;
      let content = '';
      try {
        const res = await this.provider.complete({
          model: opts.model,
          messages: conversation,
          maxTokens,
          reasoningEffort,
          cacheScope: opts.link?.projectId ?? undefined,
        });
        content = res.content;
        total.prompt_tokens += res.usage.prompt_tokens;
        total.completion_tokens += res.usage.completion_tokens;
        total.cache_hit_tokens += res.usage.cache_hit_tokens;
        total.cache_miss_tokens += res.usage.cache_miss_tokens;
        total.latency_ms += res.usage.latency_ms;
      } catch (err) {
        await this.recordCall(
          opts,
          promptHash,
          total,
          attempts,
          false,
          'LLM_UNAVAILABLE',
        );
        throw err;
      }

      const parsed = this.parseAndValidate(content, opts.schema);
      if (parsed.ok) {
        await this.recordCall(opts, promptHash, total, attempts, true, null);
        return {
          data: parsed.data,
          usage: total,
          attempts,
          promptHash,
          model: opts.model,
          raw: content,
          inputDigest,
        };
      }

      lastError = parsed.error;
      this.logger.warn(
        `[${opts.promptId}] lần ${attempts}/${maxRetries + 1} không khớp schema: ${lastError.slice(0, 200)}`,
      );
      // Đính kèm lỗi zod vào lượt sau để model tự sửa (STACK §2.4).
      conversation.push({ role: 'assistant', content });
      conversation.push({
        role: 'user',
        content:
          `The previous reply did not match the required json schema.\n` +
          `Validation errors:\n${lastError}\n` +
          `Reply again with one corrected json object and nothing else.`,
      });
    }

    await this.recordCall(
      opts,
      promptHash,
      total,
      attempts,
      false,
      'LLM_INVALID_JSON',
    );
    throw AppError.unavailable(
      'LLM_INVALID_JSON',
      `Model trả về JSON không khớp schema sau ${attempts} lần thử (${opts.promptId}).`,
      lastError.slice(0, 1000),
    );
  }

  private parseAndValidate<T>(
    content: string,
    schema: ZodType<T>,
  ): { ok: true; data: T } | { ok: false; error: string } {
    let json: unknown;
    try {
      json = JSON.parse(LlmService.stripFences(content));
    } catch (err) {
      return {
        ok: false,
        error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      return {
        ok: false,
        error: result.error.issues
          .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('\n'),
      };
    }
    return { ok: true, data: result.data };
  }

  /** JSON mode đôi khi vẫn bọc trong ```json — gỡ trước khi parse. */
  static stripFences(content: string): string {
    const trimmed = content.trim();
    const fence = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
    return fence ? fence[1] : trimmed;
  }

  /**
   * Ghi `LlmCall` **ngoài** transaction nghiệp vụ: đây là dữ liệu đo, không phải dữ liệu nghiệp vụ.
   * Ghi log thất bại thì báo rõ chứ không nuốt, nhưng **không** rollback một lời gọi đã tốn tiền
   * (SYSTEM_DESIGN_ANALYSIS §3.2).
   */
  private async recordCall<T>(
    opts: CompleteJsonOptions<T>,
    promptHash: string,
    usage: LlmUsage,
    attempts: number,
    ok: boolean,
    errorCode: string | null,
  ): Promise<void> {
    try {
      await this.prisma.llmCall.create({
        data: {
          purpose: opts.purpose,
          model: opts.model,
          prompt_id: opts.promptId,
          prompt_hash: promptHash,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          cache_hit_tokens: usage.cache_hit_tokens,
          cache_miss_tokens: usage.cache_miss_tokens,
          latency_ms: usage.latency_ms,
          attempts,
          ok,
          error_code: errorCode,
          project_id: opts.link?.projectId ?? null,
          spec_version_id: opts.link?.specVersionId ?? null,
          judge_run_id: opts.link?.judgeRunId ?? null,
          eval_run_id: opts.link?.evalRunId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Không ghi được LlmCall (${opts.promptId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
