import { HttpStatus, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { AppError } from './app-error';

/**
 * Zod là hệ validation duy nhất (backend/CLAUDE.md §3). Mọi input từ ngoài `safeParse`
 * trước khi dùng; dữ liệu chưa parse thì kiểu là `unknown`.
 */
export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_FAILED',
        'The submitted data is not valid.',
        HttpStatus.BAD_REQUEST,
        parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      );
    }
    return parsed.data;
  }
}
