'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { DecisionSheet } from './decision-sheet';

/** The three column ratios, declared as presets (DESIGN_SYSTEM §6.4). */
export type ColumnPreset = 'balanced' | 'wide-middle' | 'two-column';

const GRID: Record<ColumnPreset, string> = {
  balanced: 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.05fr)]',
  'wide-middle': 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.7fr)_minmax(0,1fr)]',
  'two-column': 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]',
};

/**
 * Three layout tiers on Tailwind's **default** breakpoints (DESIGN_SYSTEM §6.1):
 *
 * | below `md` (mobile) | `md`→`xl` (tablet) | `xl`+ (desktop) |
 * | one column + bottom sheet | two columns, decisions pinned right | full three columns |
 *
 * The three roles survive every width through **three different mechanisms**, not by stacking all
 * three (§6.3): context → accordion · content → full width · decisions → the bottom-anchored
 * `DecisionSheet`. Stacking the three columns into three vertical blocks would push the decision
 * column to the bottom of the page and break NFR-G-3 — that is more than an aesthetic problem.
 */
export function WizardShell({
  preset = 'balanced',
  contextTitle = 'Context',
  contextDefaultOpen = false,
  context,
  content,
  decide,
  decideSummary,
  decideCount = 0,
  summaryBar,
  bottomBar,
}: {
  preset?: ColumnPreset;
  contextTitle?: string;
  contextDefaultOpen?: boolean;
  context: ReactNode;
  content: ReactNode;
  decide?: ReactNode;
  decideSummary?: string;
  decideCount?: number;
  summaryBar?: ReactNode;
  /** Replaces `DecisionSheet` in B5 — `ExportBar` becomes the bottom-pinned bar (§6.4). */
  bottomBar?: ReactNode;
}) {
  const hasDecide = Boolean(decide);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-3 md:px-4 md:py-4">
      <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4', GRID[preset])}>
        {/* ── Role 1 · context ─────────────────────────────────────────────
            Mobile: an accordion, closed by default once the step has data — this is finished work,
            consulted only on demand. Tablet/desktop: a real column. */}
        <div className="md:hidden">
          <Accordion
            type="single"
            collapsible
            defaultValue={contextDefaultOpen ? 'ctx' : undefined}
          >
            <AccordionItem
              value="ctx"
              className="border-hairline bg-surface rounded-xl border px-3"
            >
              <AccordionTrigger className="py-3 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <ChevronDown className="hidden" aria-hidden />
                  {contextTitle}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">{context}</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <div className="hidden min-w-0 space-y-3 md:block">{context}</div>

        {/* ── Role 2 · content · full width on mobile ─────────────────────── */}
        <div
          className={cn(
            'min-w-0 space-y-3',
            preset === 'two-column' ? 'md:col-span-1' : 'md:col-span-1',
          )}
        >
          {content}
        </div>

        {/* ── Role 3 · decisions ───────────────────────────────────────────
            Tablet/desktop: a column that sticks while scrolling. Mobile: moves entirely into DecisionSheet. */}
        {hasDecide && (
          <div className="hidden min-w-0 space-y-3 md:sticky md:top-32 md:col-span-1 md:block md:self-start">
            {decide}
          </div>
        )}
      </div>

      {summaryBar && <div className="mt-3 md:mt-4">{summaryBar}</div>}

      {/* The content leaves enough bottom padding that the last line is not hidden by the peek notch (§6.3). */}
      <div className={cn('md:hidden', hasDecide || bottomBar ? 'h-28' : 'h-2')} aria-hidden />

      {hasDecide && (
        <DecisionSheet summary={decideSummary} count={decideCount}>
          {decide}
        </DecisionSheet>
      )}
      {bottomBar}
    </div>
  );
}
