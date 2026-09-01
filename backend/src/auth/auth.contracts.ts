import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('That email address is not valid'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  display_name: z.string().min(1, 'Display name must not be empty').max(80),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('That email address is not valid'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const ACCESS_COOKIE = 'sr_access';
export const REFRESH_COOKIE = 'sr_refresh';
