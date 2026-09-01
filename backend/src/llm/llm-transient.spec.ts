import { isTransientLlmError, LlmTransportError } from './llm-transient';

/**
 * Ranh giới phải đúng cả hai chiều, và chiều "không thử lại" mới là chiều tốn kém khi sai:
 * thử lại một cái sai key hay quá context là chờ thêm hai lượt ~110 giây rồi vẫn hỏng.
 */
describe('isTransientLlmError', () => {
  it('bắt được đúng lỗi đã giết job trên prod: undici "terminated"', () => {
    // Hình dạng thật của cái `openai` ném ra khi kết nối bị cắt giữa lúc đọc body.
    expect(
      isTransientLlmError({
        name: 'APIConnectionError',
        message: 'Connection error.',
        cause: new Error('terminated'),
      }),
    ).toBe(true);
  });

  it.each([
    ['ECONNRESET', { cause: { code: 'ECONNRESET' } }],
    ['ETIMEDOUT', { cause: { code: 'ETIMEDOUT' } }],
    ['UND_ERR_HEADERS_TIMEOUT', { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }],
    ['socket hang up', { message: 'socket hang up' }],
    [
      'timeout của SDK',
      { name: 'APIConnectionTimeoutError', message: 'Request timed out.' },
    ],
    ['429', { status: 429, message: 'Rate limit' }],
    ['500', { status: 500, message: 'Internal server error' }],
    ['503', { status: 503, message: 'Service unavailable' }],
  ])('coi %s là lỗi đường truyền', (_label, err) => {
    expect(isTransientLlmError(err)).toBe(true);
  });

  it.each([
    ['401 sai key', { status: 401, message: 'Invalid API key' }],
    [
      '400 sai tham số',
      { status: 400, message: 'Invalid parameter: max_tokens' },
    ],
    ['404 sai model', { status: 404, message: 'Model not found' }],
    [
      '422 quá context',
      { status: 422, message: 'Input exceeds context length' },
    ],
  ])('KHÔNG thử lại %s', (_label, err) => {
    expect(isTransientLlmError(err)).toBe(false);
  });

  it('mã HTTP thắng lời văn — 400 kèm chữ "timeout" vẫn không đáng thử lại', () => {
    // Lỗi có `status` là lỗi của chính yêu cầu; nếu để regex lời văn thắng thì một thông báo
    // 4xx vô tình chứa chữ "timeout" sẽ kéo theo hai lượt chờ vô ích.
    expect(
      isTransientLlmError({
        status: 400,
        message: 'invalid timeout parameter',
      }),
    ).toBe(false);
  });

  it('không vỡ với thứ không phải object', () => {
    expect(isTransientLlmError(null)).toBe(false);
    expect(isTransientLlmError('terminated')).toBe(false);
    expect(isTransientLlmError(undefined)).toBe(false);
  });
});

describe('LlmTransportError', () => {
  it('giữ mã LLM_UNAVAILABLE để FE không phải học thêm mã mới', () => {
    const err = new LlmTransportError('Không gọi được DeepSeek: terminated');
    expect(err.code).toBe('LLM_UNAVAILABLE');
    expect(err.getStatus()).toBe(503);
  });
});
