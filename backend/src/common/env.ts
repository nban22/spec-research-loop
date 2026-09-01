import { z } from 'zod';

/**
 * Thiếu biến môi trường thì fail lúc boot, không fail giữa request (backend/CLAUDE.md §8).
 *
 * `SEMANTIC_SCHOLAR_API_KEY` giữ **optional** kể cả sau khi key đã được cấp (2026-08-16): người
 * chấm clone repo về sẽ không có key trong `.env`, và thiếu key không được làm app không boot
 * được — `SourceClient` tự chọn chế độ lúc runtime.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),

  SEMANTIC_SCHOLAR_API_KEY: z
    .string()
    .transform((v) => (v.trim() === '' ? undefined : v.trim()))
    .optional(),
  OPENALEX_MAILTO: z
    .string()
    .min(
      1,
      'OPENALEX_MAILTO is required — it is what gets us into the polite pool',
    ),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  /**
   * Cấu hình cookie **thích ứng theo môi trường** — code không cần biết đang chạy ở đâu.
   *
   * - **Local** (FE proxy `/api/*` sang BE): để trống hết. Cookie host-only, `SameSite=Lax`,
   *   `Secure=false` — đúng như trước.
   * - **Deploy hai subdomain** (`app.example.com` + `api.example.com`): đặt
   *   `COOKIE_DOMAIN=.example.com`. Hai host **cùng registrable domain** nên trình duyệt coi là
   *   *same-site* ⇒ vẫn giữ được `SameSite=Lax`, **không phải hạ xuống `None`**. Lax chặn được
   *   CSRF từ site khác, `None` thì không — nên đây là mặc định đúng.
   * - **Hai domain khác hẳn nhau**: mới cần `COOKIE_SAMESITE=none` (và bắt buộc `Secure`).
   */
  COOKIE_DOMAIN: z
    .string()
    .transform((v) => (v.trim() === '' ? undefined : v.trim()))
    .optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Mặc định bật khi `NODE_ENV=production`; ép được để test HTTPS ở local. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  /**
   * Origin được phép gọi API, phân cách bằng dấu phẩy.
   * Để trống = phản chiếu origin của request (tiện lúc dev). Khi deploy **phải** ghi rõ:
   * CORS có `credentials` mà để mở là ai cũng gọi được API kèm cookie của người dùng.
   */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  /** Nơi cache model embedding. Trong container phải là đường dẫn **tuyệt đối**. */
  TRANSFORMERS_CACHE: z.string().default('.cache/transformers'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ (STACK §6).',
    );
  }
  return parsed.data;
}
