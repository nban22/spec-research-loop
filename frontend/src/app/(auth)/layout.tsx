'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';

/**
 * Chiều **ra** của bảo vệ route (#25) — đối xứng với `(app)/layout.tsx`.
 *
 * Trước layout này việc canh route chỉ có một chiều: `(app)/layout.tsx` đá người **chưa** đăng
 * nhập về `/login`, nhưng không gì đá người **đã** đăng nhập ra khỏi `/login`. Vào lại bằng
 * bookmark hay lịch sử trình duyệt là thấy form đăng nhập dù phiên vẫn hợp lệ; tệ hơn, ở
 * `/register` thì tạo được tài khoản thứ hai ngay trong phiên đang đăng nhập.
 *
 * ## Vì sao hỏi `/auth/me` chứ không đọc cookie trong middleware
 *
 * Cookie phiên là `httpOnly` nên client không đọc được, còn middleware thì chỉ thấy cookie
 * **có mặt hay không**, không biết nó còn hạn hay không. Chuyển hướng theo "có cookie" sẽ tạo
 * vòng lặp với token đã hết hạn:
 *
 *   `/login` → middleware thấy cookie → đẩy sang `/` → `(app)` gọi `/auth/me` nhận 401
 *   → đẩy về `/login` → lặp vô tận.
 *
 * Hỏi `/auth/me` là **kiểm chứng** thay vì đoán, nên không bao giờ rơi vào vòng đó — tiêu chí
 * "không vòng lặp chuyển hướng" của #25.
 *
 * Giá phải trả: người **chưa** đăng nhập tốn một request 401 trước khi thấy form. Chấp nhận
 * được, vì `qk.me` dùng chung khoá với `(app)/layout.tsx` — đi từ trong app ra thì đã có cache,
 * không thêm round-trip nào.
 *
 * ⚠️ Chính vì dùng chung khoá `qk.me`, layout này **phụ thuộc** vào việc `top-nav.tsx` gọi
 * `queryClient.clear()` **trước** khi đẩy về `/login` lúc đăng xuất. Bỏ dòng clear đó thì cache
 * còn giữ phiên cũ, layout này thấy `data` và đá ngược về `/` — vừa đăng xuất đã bị kéo lại vào
 * app. Sửa `logout` thì phải xem lại chỗ này.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ user: { id: string } }>('/auth/me'),
    retry: false,
  });

  useEffect(() => {
    // `/` là nơi `auth-form.tsx` đưa người dùng tới sau khi đăng nhập thành công —
    // giữ đúng một đích đến cho mọi đường vào app.
    if (data) router.replace('/');
  }, [data, router]);

  // Đang hỏi, **hoặc** đã biết là có phiên và đang chờ chuyển hướng ⇒ không render form.
  // Chớp form một khung hình rồi mới nhảy còn khó chịu hơn chính cái lỗi này.
  if (isLoading || data) {
    return (
      <main className="bg-canvas flex min-h-svh items-center justify-center px-4 py-10">
        <div className="bg-surface shadow-card border-hairline w-full max-w-sm space-y-5 rounded-xl border p-6">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
