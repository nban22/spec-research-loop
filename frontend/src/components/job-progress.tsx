'use client';

import { Loader2, PlugZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { JOB_LABEL, LONG_WAIT_HINT, SSE_LOST_HINT, messageOf } from '@/lib/error-code';
import type { JobView } from '@/lib/use-job';

/**
 * Bốn kiểu chờ ở DESIGN_SYSTEM §5.5. Component này phủ hai kiểu job nền:
 *
 * - **có tiến độ** (biết tổng số việc: 5 judge, N unit verify) → thanh tiến độ + "3/5 …"
 * - **không tiến độ** (một lời gọi không chia nhỏ được) → thanh chạy vô định, **không** phần trăm giả
 *
 * Và sáu luật: chờ nằm tại chỗ của nội dung (không overlay toàn trang) · luôn nói đang làm gì
 * bằng chữ tiếng Việt · quá 10s hiện thời gian đã trôi, quá 60s thêm dòng trấn an ·
 * mất SSE không được trông giống job chết · lỗi bộ phận hiện ra · lỗi luôn có một hành động.
 */
export function JobProgress({
  view,
  onReload,
  className,
}: {
  view: JobView;
  onReload?: () => void;
  className?: string;
}) {
  const { job, elapsedMs, connectionLost, isRunning } = view;
  if (!job) return null;

  const total = job.progress?.total ?? 1;
  const done = job.progress?.done ?? 0;
  const determinate = total > 1;
  const seconds = Math.floor(elapsedMs / 1000);

  if (job.status === 'FAILED') {
    return (
      <div className="border-danger-line bg-danger-soft animate-rise space-y-2 rounded-lg border px-3 py-3">
        <p className="text-danger-strong text-sm">{messageOf(job.error_code ?? undefined)}</p>
        {onReload && (
          <Button size="sm" variant="outline" onClick={onReload}>
            <RefreshCw className="size-3.5" aria-hidden />
            Chạy lại
          </Button>
        )}
      </div>
    );
  }

  if (!isRunning) return null;

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-label={job.message ?? JOB_LABEL[job.kind] ?? 'Đang xử lý'}
    >
      <div className="border-brand-line bg-brand-soft animate-rise space-y-2 rounded-lg border px-3 py-3">
        <p className="text-brand-strong flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="min-w-0 flex-1">
            {job.message ?? JOB_LABEL[job.kind] ?? 'Đang xử lý…'}
          </span>
          {determinate && (
            <span className="shrink-0 text-xs tabular-nums">
              {done}/{total}
            </span>
          )}
        </p>

        {determinate ? (
          <Progress value={(done / Math.max(1, total)) * 100} className="h-1.5" />
        ) : (
          <div className="bg-brand-line h-1.5 overflow-hidden rounded-full">
            <div className="bg-brand-ink h-full w-1/3 animate-pulse rounded-full" />
          </div>
        )}

        {/* Quá ~10 giây thì hiện thời gian đã trôi (§5.5 luật 3). */}
        {seconds >= 10 && (
          <p className="text-brand-strong/80 text-xs tabular-nums">Đã chạy {seconds} giây</p>
        )}
        {seconds >= 60 && <p className="text-ink-3 text-xs">{LONG_WAIT_HINT}</p>}

        {/* Mất SSE **không được** trông giống job chết (§5.5 luật 4). */}
        {connectionLost && (
          <p className="text-warn-strong flex items-center gap-1.5 text-xs">
            <PlugZap className="size-3.5" aria-hidden />
            {SSE_LOST_HINT}
            {onReload && (
              <button
                type="button"
                onClick={onReload}
                className="cursor-pointer underline underline-offset-2"
              >
                Tải lại trạng thái
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
