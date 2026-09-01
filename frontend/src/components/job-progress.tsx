'use client';

import { Loader2, PlugZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { JOB_LABEL, LONG_WAIT_HINT, SSE_LOST_HINT, messageOf } from '@/lib/error-code';
import type { JobView } from '@/lib/use-job';

/**
 * The four waiting patterns of DESIGN_SYSTEM §5.5. This component covers the two background-job
 * ones:
 *
 * - **determinate** (the total is known: 5 judges, N verify units) → a progress bar + "3/5 …"
 * - **indeterminate** (one call that cannot be split) → an infinite bar, **never** a fake percentage
 *
 * And six rules: the wait happens where the content is (no full-page overlay) · always say what is
 * happening in words · past 10s show the elapsed time, past 60s add a reassurance line · a lost SSE
 * must never look like a dead job · partial failures are surfaced · an error always offers an action.
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
            Run again
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
      aria-label={job.message ?? JOB_LABEL[job.kind] ?? 'Working'}
    >
      <div className="border-brand-line bg-brand-soft animate-rise space-y-2 rounded-lg border px-3 py-3">
        <p className="text-brand-strong flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="min-w-0 flex-1">
            {job.message ?? JOB_LABEL[job.kind] ?? 'Working…'}
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

        {/* Past roughly 10 seconds, show the elapsed time (§5.5 rule 3). */}
        {seconds >= 10 && (
          <p className="text-brand-strong/80 text-xs tabular-nums">Running for {seconds}s</p>
        )}
        {seconds >= 60 && <p className="text-ink-3 text-xs">{LONG_WAIT_HINT}</p>}

        {/* A lost SSE connection must **never** look like a dead job (§5.5 rule 4). */}
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
                Reload status
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
