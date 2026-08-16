'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { ErrorState } from './states';

type Mode = 'login' | 'register';

type FormValues = { email: string; password: string; display_name: string };

/** Một khuôn duy nhất cho cả hai chế độ — luật chặt hơn chỉ bật khi đăng ký. */
function schemaFor(mode: Mode) {
  const isRegister = mode === 'register';
  return z.object({
    email: z.string().email('Email không hợp lệ'),
    password: isRegister
      ? z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự')
      : z.string().min(1, 'Chưa nhập mật khẩu'),
    display_name: isRegister
      ? z.string().min(1, 'Chưa nhập tên hiển thị')
      : z.string(),
  });
}

/**
 * `AuthCard` + `LoginForm`/`RegisterForm` — khung hẹp giữa canvas ở **mọi** bề rộng (§5.4).
 * Lỗi hiển thị bằng cách map `ErrorCode` sang tiếng Việt, không parse `message`.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isRegister = mode === 'register';

  const form = useForm<FormValues>({
    resolver: zodResolver(schemaFor(mode)),
    defaultValues: { email: '', password: '', display_name: '' },
  });

  const submit = useMutation({
    mutationFn: (values: FormValues) =>
      api.post(
        `/auth/${mode}`,
        isRegister ? values : { email: values.email, password: values.password },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.push('/');
    },
  });

  return (
    <main className="bg-canvas flex min-h-svh items-center justify-center px-4 py-10">
      <div className="bg-surface shadow-card border-hairline w-full max-w-sm space-y-5 rounded-xl border p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="bg-brand-ink rounded-lg p-2 text-white">
            <Workflow className="size-5" aria-hidden />
          </span>
          <h1 className="text-ink-1 text-lg font-semibold">
            {isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
          </h1>
          <p className="text-ink-3 text-xs">
            SpecResearch Loop — biến ý tưởng mơ hồ thành đặc tả nghiên cứu có nguồn.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((v) => submit.mutate(v))}
          noValidate
        >
          {isRegister && (
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Tên hiển thị</Label>
              <Input id="display_name" autoComplete="name" {...form.register('display_name')} />
              {form.formState.errors.display_name && (
                <p className="text-danger-strong text-xs">
                  {form.formState.errors.display_name.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="text-danger-strong text-xs">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              {...form.register('password')}
            />
            {form.formState.errors.password && (
              <p className="text-danger-strong text-xs">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {submit.isError && (
            <ErrorState
              message={
                submit.error instanceof ApiError
                  ? submit.error.message
                  : 'Không kết nối được máy chủ.'
              }
            />
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submit.isPending}>
            {submit.isPending
              ? 'Đang xử lý…'
              : isRegister
                ? 'Đăng ký'
                : 'Đăng nhập'}
          </Button>
        </form>

        <p className="text-ink-3 text-center text-xs">
          {isRegister ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
          <Link
            href={isRegister ? '/login' : '/register'}
            className="text-brand-strong underline underline-offset-2"
          >
            {isRegister ? 'Đăng nhập' : 'Đăng ký'}
          </Link>
        </p>
      </div>
    </main>
  );
}
