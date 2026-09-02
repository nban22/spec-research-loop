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
import { isTransientLlmError, LlmTransportError } from './llm-transient';

/**
 * Tổng số lần gọi provider cho MỘT lượt, tính cả lần đầu. 3 lần × ~110 giây của `generator`
 * cộng backoff là dưới 6 phút — chấp nhận được với job chạy nền, và vẫn rẻ hơn nhiều so với
 * việc người dùng phải bấm lại cả chuỗi 10 bước.
 */
const TRANSPORT_TRIES = 3;
/** Backoff giữa các lần: đứt kết nối thường tự khỏi ngay, không cần chờ lâu. */
const TRANSPORT_BACKOFF_MS = [2000, 6000];

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
      let finishReason: string | null = null;
      try {
        const res = await this.completeWithTransportRetry(opts.promptId, {
          model: opts.model,
          messages: conversation,
          maxTokens,
          reasoningEffort,
          cacheScope: opts.link?.projectId ?? undefined,
        });
        content = res.content;
        finishReason = res.finish_reason;
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

      /**
       * Bị **cắt ngang** thì dừng ngay, không thử lại.
       *
       * Thử lại chỉ cứu được câu trả lời *sai schema*: đính lỗi zod vào rồi model sửa. Còn câu
       * trả lời *đụng trần* thì lượt sau cũng dài đúng ngần ấy và cũng bị cắt đúng chỗ đó —
       * ba lượt để hỏng y hệt, tốn gấp ba tiền.
       *
       * Đo thật: J4 `judge_evidence` hỏng 3/19 lượt, mỗi lần ghi `completion_tokens = 24 000`
       * = 3 × trần 8 000. Toàn bộ số đó là tiền đốt để nhận cùng một lỗi.
       *
       * Mã lỗi cũng phải khác: `LLM_INVALID_JSON` đọc ra là "model trả rác", trong khi model
       * trả JSON đúng và **ta** mới là bên đặt trần quá thấp. Sai chỗ đổ lỗi thì người sửa đi
       * dò nhầm hướng.
       */
      if (finishReason === 'length') {
        this.logger.warn(
          `[${opts.promptId}] output hit the ${maxTokens}-token ceiling and was truncated ` +
            `at attempt ${attempts}; not retrying — a retry would be cut at the same place.`,
        );
        await this.recordCall(
          opts,
          promptHash,
          total,
          attempts,
          false,
          'LLM_OUTPUT_TRUNCATED',
        );
        throw AppError.unavailable(
          'LLM_OUTPUT_TRUNCATED',
          'The model ran out of output budget before it finished. Try again with fewer sources, or raise the ceiling for this step.',
          { promptId: opts.promptId, maxTokens },
        );
      }

      this.logger.warn(
        `[${opts.promptId}] attempt ${attempts}/${maxRetries + 1} did not match the schema: ${lastError.slice(0, 200)}`,
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
      `The model returned JSON that did not match the schema after ${attempts} attempts (${opts.promptId}).`,
      lastError.slice(0, 1000),
    );
  }

  /**
   * Thử lại **lỗi đường truyền**, tách hẳn khỏi ngân sách `maxRetries` của schema.
   *
   * Hai loại hỏng ngược nhau về xác suất thành công khi thử lại, nên không được dùng chung
   * một bộ đếm: JSON sai schema thì phải gửi kèm lỗi zod cho model tự sửa, còn socket đứt thì
   * chỉ cần gọi lại y nguyên. Trước đây vòng lặp chỉ lo loại đầu, còn loại sau ném thẳng ra
   * ngoài và giết cả job — trên prod `generator` chạy 77–119 giây mỗi lượt và hỏng 1/7 lượt
   * vì `terminated`, đủ để chuỗi 10 bước sinh spec chết ngay ở bước đầu.
   *
   * `attempts` **cố ý không** cộng số lần thử lại ở đây: nó là số lần *model* phải sửa JSON,
   * và `eval/score.ts` cùng báo cáo đánh giá đọc nó theo nghĩa đó. Lần gọi hỏng vì mạng cũng
   * không trả về token nào nên phần đếm token không bị ảnh hưởng.
   */
  private async completeWithTransportRetry(
    promptId: string,
    req: Parameters<LlmProvider['complete']>[0],
  ): Promise<Awaited<ReturnType<LlmProvider['complete']>>> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.provider.complete(req);
      } catch (err) {
        // Nhận diện ở **cả hai** chỗ là cố ý. `DeepseekProvider` phân loại chính xác nhất vì
        // nó còn giữ lỗi gốc của SDK, nhưng không được phép để việc thử lại phụ thuộc vào
        // chuyện mọi provider đều nhớ bọc đúng — provider khác ném lỗi mạng trần thì vẫn phải
        // được gọi lại.
        const transient =
          err instanceof LlmTransportError || isTransientLlmError(err);
        if (attempt >= TRANSPORT_TRIES || !transient) throw err;
        const waitMs = TRANSPORT_BACKOFF_MS[attempt - 1] ?? 6000;
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[${promptId}] transport error, attempt ${attempt}/${TRANSPORT_TRIES}: ` +
            `${reason} — retrying in ${waitMs}ms`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
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
        `Could not write LlmCall (${opts.promptId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
