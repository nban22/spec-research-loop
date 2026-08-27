'use client';

import { CircleAlert, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Trạng thái rỗng và lỗi dùng chung (DESIGN_SYSTEM §5.5).
 * **Luật 6: `ErrorState` luôn có một hành động** — chạy lại, sửa đầu vào, hoặc quay về bước trước.
 * Thông báo lấy từ `lib/error-code.ts`, không in mã lỗi thô ra màn hình.
 */

export type EmptyTone = 'neutral' | 'brand' | 'ok' | 'decide';

/** Ô icon đổi màu theo vai của khối đang rỗng — cùng bảng accent với `Panel`. */
const TONE: Record<EmptyTone, string> = {
  neutral: 'bg-sunken text-ink-4',
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok-ink',
  decide: 'bg-decide-soft text-decide-ink',
};

/**
 * Ô rỗng **dạy đúng một hành động tiếp theo**, không mô tả sự vắng mặt.
 *
 * `icon` và `tone` là tham số chứ không cố định: mỗi chỗ rỗng trong app là một tình huống khác
 * nhau (chưa có dự án · chưa tìm nguồn · chưa rút gap · judge chưa chạy), và dùng chung một
 * icon `Inbox` cho cả bốn làm người dùng không phân biệt được mình đang thiếu gì.
 */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: EmptyTone;
}) {
  return (
    <div className="border-hairline animate-fade-in flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <span className={cn('mb-0.5 rounded-xl p-2.5', TONE[tone])}>
        <Icon className="size-6" aria-hidden />
      </span>
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
    <div className="border-danger-line bg-danger-soft animate-rise flex flex-col items-start gap-2 rounded-lg border px-3 py-3">
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

/**
 * Skeleton phải đúng hình khối của nội dung thật — sai hình thì trang nhảy khi dữ liệu về.
 * Đó là lý do có **bốn** hình chứ không phải một: bảng, lưới ô số và hàng judge có khung hoàn
 * toàn khác card.
 */
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

/** Khớp `IssueTable` và `RelatedWorkTable`: một hàng tiêu đề rồi N hàng nhiều cột. */
export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="border-hairline divide-hairline divide-y overflow-hidden rounded-lg border">
      <div className="bg-sunken flex gap-3 px-3 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-3 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 1 ? 'flex-2' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Khớp `StatTileGrid`: hai cột ở hẹp, bốn cột ở rộng. */
export function StatTileSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="border-hairline bg-sunken space-y-1.5 rounded-md border px-2.5 py-2">
            <Skeleton className="h-2.5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Khớp `JudgePanel`: năm thẻ ngang, cuộn ở mobile, lưới ở desktop. */
export function JudgePanelSkeleton() {
  return (
    <ul className="flex gap-2 overflow-hidden md:grid md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="border-hairline w-56 shrink-0 space-y-2 rounded-lg border p-3 md:w-auto"
        >
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-1">
            {[0, 1, 2].map((d) => (
              <Skeleton key={d} className="h-1 flex-1" />
            ))}
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}
