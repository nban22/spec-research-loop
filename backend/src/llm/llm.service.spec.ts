import { z } from 'zod';
import { LlmService } from './llm.service';

describe('LlmService', () => {
  const provider = { complete: jest.fn() };
  const prompts = {
    load: jest.fn().mockReturnValue({
      id: 'test_prompt',
      hash: 'hash123',
      model: 'deepseek-v4-pro',
      system: 'System {{sys_var}}',
      user: 'User {{user_var}}',
    }),
  };
  const prisma = { llmCall: { create: jest.fn() } };

  const service = new LlmService(provider, prompts as never, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildMessages renders system and user templates and returns promptHash', () => {
    const res = service.buildMessages('test_prompt', {
      sys_var: 'A',
      user_var: 'B',
    });
    expect(res.promptHash).toBe('hash123');
    expect(res.messages).toEqual([
      { role: 'system', content: 'System A' },
      { role: 'user', content: 'User B' },
    ]);
  });

  it('digest calculates SHA256 hex digest', () => {
    const hash = LlmService.digest('test');
    expect(hash).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );
  });

  it('stripFences strips markdown code fence wrappers', () => {
    expect(LlmService.stripFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
    expect(LlmService.stripFences('{"a": 1}')).toBe('{"a": 1}');
  });

  it('completeJson parses JSON response and logs llmCall', async () => {
    prompts.load.mockReturnValue({
      id: 'test_prompt',
      hash: 'hash123',
      model: 'deepseek-v4-pro',
      system: 'System',
      user: 'User',
    });

    provider.complete.mockResolvedValue({
      content: '```json\n{"foo": "bar"}\n```',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const schema = z.object({ foo: z.string() });
    const result = await service.completeJson({
      promptId: 'test_prompt',
      schema,
      model: 'deepseek-v4-pro',
      purpose: 'ANALYSIS',
      variables: {},
      link: { projectId: 'p-1' },
    });

    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.attempts).toBe(1);
    expect(prisma.llmCall.create).toHaveBeenCalled();
  });

  it('retries when JSON fails schema validation and succeeds on retry', async () => {
    prompts.load.mockReturnValue({
      id: 'test_prompt',
      hash: 'hash123',
      model: 'deepseek-v4-pro',
      system: 'System',
      user: 'User',
    });

    provider.complete
      .mockResolvedValueOnce({
        content: '{"foo": 123}', // invalid type
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      })
      .mockResolvedValueOnce({
        content: '{"foo": "valid_string"}',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });

    const schema = z.object({ foo: z.string() });
    const result = await service.completeJson({
      promptId: 'test_prompt',
      schema,
      model: 'deepseek-v4-pro',
      purpose: 'ANALYSIS',
      maxRetries: 2,
    });

    expect(result.data).toEqual({ foo: 'valid_string' });
    expect(result.attempts).toBe(2);
  });

  it('throws LLM_INVALID_JSON when max retries exceeded', async () => {
    prompts.load.mockReturnValue({
      id: 'test_prompt',
      hash: 'hash123',
      model: 'deepseek-v4-pro',
      system: 'System',
      user: 'User',
    });

    provider.complete.mockResolvedValue({
      content: 'not valid json',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    const schema = z.object({ foo: z.string() });
    await expect(
      service.completeJson({
        promptId: 'test_prompt',
        schema,
        model: 'deepseek-v4-pro',
        purpose: 'ANALYSIS',
        maxRetries: 1,
      }),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_JSON' });
  });

  /**
   * Trên prod, một lần `terminated` giữa chừng của `generator` (77–119 giây mỗi lượt) giết
   * luôn cả chuỗi 10 bước sinh spec ngay ở bước đầu, vì vòng lặp cũ chỉ thử lại lỗi schema.
   * Ba tính chất phải đúng cùng lúc.
   */
  describe('thử lại lỗi đường truyền', () => {
    const okBody = {
      content: '{"foo":"bar"}',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        cache_hit_tokens: 0,
        cache_miss_tokens: 0,
        latency_ms: 100,
      },
    };
    const schema = z.object({ foo: z.string() });
    const call = () =>
      service.completeJson({
        promptId: 'test_prompt',
        schema,
        model: 'deepseek-v4-pro',
        purpose: 'ANALYSIS',
      });

    beforeEach(() => {
      prompts.load.mockReturnValue({
        id: 'test_prompt',
        hash: 'hash123',
        model: 'deepseek-v4-pro',
        system: 'System',
        user: 'User',
      });
      // Backoff thật là 2s rồi 6s — cho chạy ngay để test không mất 8 giây.
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('gọi lại sau khi socket đứt, và lượt sau thành công', async () => {
      provider.complete
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection error.'), {
            name: 'APIConnectionError',
            cause: new Error('terminated'),
          }),
        )
        .mockResolvedValueOnce(okBody);

      const res = await call();

      expect(provider.complete).toHaveBeenCalledTimes(2);
      expect(res.data).toEqual({ foo: 'bar' });
      // Lần hỏng vì mạng KHÔNG được tính vào `attempts` — đó là số lần model phải sửa JSON,
      // và `eval/score.ts` cùng báo cáo đánh giá đọc nó theo đúng nghĩa đó.
      expect(res.attempts).toBe(1);
    });

    it('bỏ cuộc sau đúng 3 lượt nếu lần nào cũng đứt', async () => {
      provider.complete.mockRejectedValue(
        Object.assign(new Error('Connection error.'), {
          name: 'APIConnectionError',
          cause: new Error('terminated'),
        }),
      );

      // Ném lại **nguyên lỗi cuối cùng**, không bọc thêm: provider thật đã bọc sẵn thành
      // `LlmTransportError` mang mã `LLM_UNAVAILABLE`, còn double ở đây ném lỗi trần.
      await expect(call()).rejects.toThrow('Connection error.');
      expect(provider.complete).toHaveBeenCalledTimes(3);
    });

    it('KHÔNG gọi lại khi lỗi là của chính yêu cầu (401 sai key)', async () => {
      provider.complete.mockRejectedValue(
        Object.assign(new Error('Invalid API key'), { status: 401 }),
      );

      await expect(call()).rejects.toThrow('Invalid API key');
      expect(provider.complete).toHaveBeenCalledTimes(1);
    });
  });
});
