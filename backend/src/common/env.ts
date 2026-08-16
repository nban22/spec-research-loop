import { z } from 'zod';

/**
 * Thiếu biến môi trường thì fail lúc boot, không fail giữa request (backend/CLAUDE.md §8).
 *
 * `SEMANTIC_SCHOLAR_API_KEY` là **optional** có chủ ý: chủ dự án đã request key nhưng chưa được
 * cấp. Thiếu key không được làm app không boot được — `SourceClient` tự chọn chế độ lúc runtime.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL bắt buộc'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY bắt buộc'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),

  SEMANTIC_SCHOLAR_API_KEY: z
    .string()
    .transform((v) => (v.trim() === '' ? undefined : v.trim()))
    .optional(),
  OPENALEX_MAILTO: z
    .string()
    .min(1, 'OPENALEX_MAILTO bắt buộc — để vào polite pool'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải ≥ 32 ký tự'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET phải ≥ 32 ký tự'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau (STACK §6).',
    );
  }
  return parsed.data;
}
