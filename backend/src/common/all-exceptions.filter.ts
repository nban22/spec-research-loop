import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ErrorCode } from '../contracts/error-code';

type ErrorBody = { code: ErrorCode; message: string; details?: unknown };

function isErrorBody(v: unknown): v is ErrorBody {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { code?: unknown }).code === 'string' &&
    typeof (v as { message?: unknown }).message === 'string'
  );
}

/**
 * Một filter duy nhất chuẩn hoá response lỗi (backend/CLAUDE.md §4).
 * Không try/catch rải rác trong service chỉ để đổi format.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on the server.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload: unknown = exception.getResponse();
      if (isErrorBody(payload)) {
        body = payload;
      } else if (status === HttpStatus.UNAUTHORIZED) {
        body = { code: 'UNAUTHENTICATED', message: 'You need to sign in.' };
      } else if (status === HttpStatus.NOT_FOUND) {
        body = { code: 'NOT_FOUND', message: 'Resource not found.' };
      } else {
        body = { code: 'VALIDATION_FAILED', message: exception.message };
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }
}
