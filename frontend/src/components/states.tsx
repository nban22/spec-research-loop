'use client';

import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Trạng thái rỗng và lỗi dùng chung (DESIGN_SYSTEM §5.5).
 * **Luật 6: `ErrorState` luôn có một hành động** — chạy lại, sửa đầu vào, hoặc quay về bước trước.
 * Thông báo lấy từ `lib/error-code.ts`, không in mã lỗi thô ra màn hình.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-hairline flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <Inbox className="text-ink-4 size-7" aria-hidden />
      <p className="text-ink-1 text-sm font-medium">{title}</p>
      <p className="text-ink-3 max-w-sm text-xs leading-relaxed">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Thử lại',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="border-danger-line bg-danger-soft flex flex-col items-start gap-2 rounded-lg border px-3 py-3">
      <p className="text-danger-strong flex items-start gap-2 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** Skeleton phải đúng hình khối của nội dung thật — sai hình thì trang nhảy khi dữ liệu về. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-hairline space-y-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
