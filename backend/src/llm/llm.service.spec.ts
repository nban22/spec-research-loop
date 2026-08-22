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
});
