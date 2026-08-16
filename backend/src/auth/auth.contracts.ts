import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  display_name: z.string().min(1, 'Tên hiển thị không được để trống').max(80),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('Email không hợp lệ'),
  password: z.string().min(1, 'Chưa nhập mật khẩu'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const ACCESS_COOKIE = 'sr_access';
export const REFRESH_COOKIE = 'sr_refresh';
