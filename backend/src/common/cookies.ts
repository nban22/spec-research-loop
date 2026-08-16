import type { Request } from 'express';

/**
 * `@types/cookie-parser` khai `Request.cookies` là `any`, nên đọc thẳng sẽ kéo `any` lan ra khắp
 * tầng auth. Thu hẹp về `string | undefined` ở đúng một chỗ (backend/CLAUDE.md §3:
 * dữ liệu chưa parse thì kiểu là `unknown`).
 */
export function readCookie(req: Request, name: string): string | undefined {
  const bag: unknown = (req as { cookies?: unknown }).cookies;
  if (bag === null || typeof bag !== 'object') return undefined;
  const value: unknown = (bag as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}
