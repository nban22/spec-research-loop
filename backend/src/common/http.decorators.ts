import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';

/** Guard bật global; mở ra bằng decorator này (STACK §11.1). Quên đánh dấu ⇒ khoá, không hở. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export type AuthUser = { id: string; email: string };

/**
 * `userId` **chỉ** lấy từ token đã verify. Không bao giờ đọc `user_id`/`owner_id`
 * từ body/query/param (STACK §11.3 luật 1).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user)
      throw new Error('CurrentUser dùng ngoài phạm vi JwtAuthGuard');
    return req.user;
  },
);

export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) throw new Error('UserId dùng ngoài phạm vi JwtAuthGuard');
    return req.user.id;
  },
);
