import { HttpStatus } from '@nestjs/common';
import { AppError } from '../common/app-error';

/**
 * Phân loại lỗi của lời gọi LLM: **hỏng vì đường truyền** hay **hỏng vì bản thân yêu cầu**.
 *
 * Vì sao cần: `LlmService` thử lại tới 3 lần khi model trả JSON sai schema, nhưng khi socket
 * đứt giữa chừng thì nó ném thẳng và cả job chết. Hai loại lỗi đó ngược nhau về xác suất thành
 * công khi thử lại — sai key hay sai tham số thì thử bao nhiêu lần cũng hỏng, còn socket đứt
 * thì lần sau gần như chắc chắn qua.
 *
 * Đo trên prod: `generator` (phân tích ý tưởng, `reasoning_effort: high`, 12k token) chạy
 * **77–119 giây** mỗi lượt và hỏng 1/7 lượt với `terminated` — undici báo kết nối bị cắt giữa
 * chừng. Một lần đứt như vậy giết luôn cả chuỗi 10 bước sinh spec ngay từ bước đầu.
 *
 * Hàm thuần, không phụ thuộc SDK: nhận đúng những gì `openai` ném ra nhưng chỉ đọc theo hình
 * dạng (`status`, `name`, `message`, `cause.code`), nên test được bằng object trần.
 */

/** Mã lỗi socket của Node/undici — đều là hỏng đường truyền, không phải hỏng yêu cầu. */
const TRANSIENT_CAUSE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/**
 * `terminated` là thông báo của undici khi phía kia đóng kết nối giữa lúc đang đọc body —
 * đúng cái đã xảy ra với `generator`. Nó không mang `code`, nên phải bắt bằng lời văn.
 */
const TRANSIENT_MESSAGE =
  /terminated|socket hang up|other side closed|network|timeout|aborted/i;

type ErrorShape = {
  status?: unknown;
  name?: unknown;
  message?: unknown;
  /** Mã lỗi socket của Node — nằm ở `err.cause.code`, không phải ở lỗi ngoài cùng. */
  code?: unknown;
  cause?: unknown;
};

function asShape(err: unknown): ErrorShape {
  return typeof err === 'object' && err !== null ? err : {};
}

export function isTransientLlmError(err: unknown): boolean {
  const e = asShape(err);

  // Lỗi có mã HTTP: chỉ 429 và 5xx mới đáng thử lại. 4xx còn lại là lỗi của chính yêu cầu
  // (sai key, sai tham số, quá context) — thử lại chỉ tốn thêm 2 lần chờ rồi vẫn hỏng.
  if (typeof e.status === 'number') {
    return e.status === 429 || e.status >= 500;
  }

  const name = typeof e.name === 'string' ? e.name : '';
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') {
    return true;
  }

  const cause = asShape(e.cause);
  if (typeof cause.code === 'string' && TRANSIENT_CAUSE_CODES.has(cause.code)) {
    return true;
  }

  const messages = [e.message, cause.message].filter(
    (m): m is string => typeof m === 'string',
  );
  return messages.some((m) => TRANSIENT_MESSAGE.test(m));
}

/**
 * Lỗi đường truyền — `LlmService` được phép thử lại.
 *
 * Giữ nguyên `code: 'LLM_UNAVAILABLE'` để FE không phải học thêm một mã mới: với người dùng
 * thì "gọi LLM hỏng" vẫn là một chuyện. Khác biệt chỉ có nghĩa ở trong `LlmService`.
 */
export class LlmTransportError extends AppError {
  constructor(message: string) {
    super('LLM_UNAVAILABLE', message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
