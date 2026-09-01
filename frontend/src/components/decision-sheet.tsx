'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

/**
 * **[mobile]** The bottom sheet that holds the entire decision column (DESIGN_SYSTEM §6.3).
 *
 * An unusual rule with a product reason: the sheet **never closes completely** — dragging it all
 * the way down only returns it to the "peek" notch. This system *never auto-confirms a step*, so
 * there is always something waiting on the user, and the place that holds it must not disappear.
 * Once closed, nothing on screen would signal that a decision is pending.
 *
 * When the current step has nothing left to decide, the peek notch switches to the done state
 * (green fill) and the primary button becomes "Go to the next step".
 *
 * The thumb zone belongs to the primary action — which is why there is **no** bottom tab bar (§6.6).
 */
export function DecisionSheet({
  summary,
  count,
  children,
}: {
  summary?: string;
  count: number;
  children: ReactNode;
}) {
  const hasWork = count > 0;

  return (
    <div className="border-hairline bg-surface shadow-sheet pb-safe fixed inset-x-0 bottom-0 z-30 border-t md:hidden">
      <Drawer>
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2.5',
            hasWork ? 'bg-decide-soft' : 'bg-ok-soft',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              hasWork ? 'text-decide-strong' : 'text-ok-strong',
            )}
          >
            {hasWork ? (
              <TriangleAlert className="size-4" aria-hidden />
            ) : (
              <CircleCheck className="size-4" aria-hidden />
            )}
            <span className="line-clamp-1">
              {hasWork
                ? (summary ?? `Waiting on you: ${count}`)
                : 'Ready to move to the next step'}
            </span>
          </span>
          <DrawerTrigger asChild>
            <Button size="sm" className="ml-auto shrink-0">
              Review &amp; choose
            </Button>
          </DrawerTrigger>
        </div>

        <DrawerContent className="max-h-[88svh]">
          <DrawerTitle className="px-4 pt-1 pb-2 text-sm font-semibold">
            Decisions waiting on you
          </DrawerTitle>
          <div className="space-y-3 overflow-y-auto px-3 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
