export type LlmModel = 'deepseek-v4-pro' | 'deepseek-v4-flash';
export type ReasoningEffort = 'low' | 'high' | 'max';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmRequest = {
  model: LlmModel;
  messages: LlmMessage[];
  maxTokens: number;
  reasoningEffort: ReasoningEffort;
  /** Truyền `project_id` để tách KVCache giữa các project (STACK §2.3). */
  cacheScope?: string;
};

export type LlmUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  latency_ms: number;
};

export type LlmResponse = { content: string; usage: LlmUsage };

/**
 * Chừa sẵn interface để sau này cắm thêm provider chỉ tốn một file (STACK §2.1).
 * MVP có đúng một hiện thực.
 */
export interface LlmProvider {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
