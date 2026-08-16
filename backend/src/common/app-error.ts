import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '../contracts/error-code';

/**
 * Mọi lỗi nghiệp vụ ném ra dạng này. Payload luôn là `{ code, message, details? }` với
 * `code` thuộc enum `ErrorCode` (backend/CLAUDE.md §4). Cấm ném chuỗi tự do.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  /** Tài nguyên của user khác cũng trả 404 — 403 xác nhận nó tồn tại (STACK §11.3 luật 2). */
  static notFound(message = 'Không tìm thấy tài nguyên.'): AppError {
    return new AppError('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }

  static conflict(
    code: ErrorCode,
    message: string,
    details?: unknown,
  ): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }

  static unprocessable(
    code: ErrorCode,
    message: string,
    details?: unknown,
  ): AppError {
    return new AppError(
      code,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }

  static badRequest(
    code: ErrorCode,
    message: string,
    details?: unknown,
  ): AppError {
    return new AppError(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static unavailable(
    code: ErrorCode,
    message: string,
    details?: unknown,
  ): AppError {
    return new AppError(code, message, HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}
