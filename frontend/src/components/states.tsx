'use client';

import { CircleAlert, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Shared empty and error states (DESIGN_SYSTEM §5.5).
 * **Rule 6: `ErrorState` always offers an action** — run again, fix the input, or go back a step.
 * Messages come from `lib/error-code.ts`; raw error codes are never printed on screen.
 */

export type EmptyTone = 'neutral' | 'brand' | 'ok' | 'decide';

/** The icon tile takes its colour from the role of the empty block — same accent table as `Panel`. */
const TONE: Record<EmptyTone, string> = {
  neutral: 'bg-sunken text-ink-4',
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok-ink',
  decide: 'bg-decide-soft text-decide-ink',
};

/**
 * An empty slot **teaches exactly one next action**; it never merely describes an absence.
 *
 * `icon` and `tone` are parameters rather than constants: every empty place in the app is a
 * different situation (no projects yet · no sources searched · no gap extracted · judges not run),
 * and using one `Inbox` icon for all four leaves the user unable to tell what is missing.
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
  retryLabel = 'Try again',
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
 * A skeleton has to match the real content's shape — the wrong shape makes the page jump when the
 * data lands. That is why there are **four** shapes and not one: tables, stat-tile grids and the
 * judge row have frames that look nothing like a card.
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

/** Matches `IssueTable` and `RelatedWorkTable`: one header row, then N multi-column rows. */
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

/** Matches `StatTileGrid`: two columns when narrow, four when wide. */
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

/** Matches `JudgePanel`: five cards in a row, scrolling on mobile, a grid on desktop. */
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
