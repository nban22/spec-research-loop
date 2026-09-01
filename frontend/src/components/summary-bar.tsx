import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `RoundTracker` — progress **inside a single round**, rendered inside `SummaryBar`.
 *
 * This is the node strip mockups 1–4 draw at the bottom of the page, and it is **not** the
 * 5-step stepper: its labels change per mockup and it always ends on a *Confirm* node
 * (DESIGN_SYSTEM §8 #2). Keeping it is how the UI expresses the word *Loop* in the project name
 * and step 10 of the brief (fix → re-verify → re-judge → confirm).
 */
export function RoundTracker({
  nodes,
  activeIndex,
}: {
  nodes: string[];
  activeIndex: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {nodes.map((node, i) => (
        <li key={node} className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full text-2xs font-semibold tabular-nums',
                'ease-out-quart transition-colors duration-300',
                i < activeIndex && 'bg-ok-ink text-white',
                i === activeIndex && 'bg-brand-ink text-white',
                i > activeIndex && 'border-hairline text-ink-4 border',
              )}
            >
              {i < activeIndex ? <Check className="size-2.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                'text-xs ease-out-quart transition-colors duration-300',
                i === activeIndex ? 'text-ink-1 font-medium' : 'text-ink-3',
              )}
            >
              {node}
            </span>
          </span>
          {i < nodes.length - 1 && (
            <span className="bg-hairline hidden h-px w-4 sm:block" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The bottom bar "Summary after round N". It does **not** repeat the global `Stepper` (§5.3).
 * On mobile it stacks vertically and sits above the space reserved for `DecisionSheet`.
 */
export function SummaryBar({
  round,
  nodes,
  activeIndex,
  hint,
}: {
  round: number;
  nodes: string[];
  activeIndex: number;
  hint?: string;
}) {
  return (
    <section className="border-hairline bg-surface shadow-card animate-rise flex flex-col gap-2 rounded-xl border px-3 py-3 sm:px-4 md:flex-row md:items-center md:gap-4">
      <p className="text-ink-1 shrink-0 text-sm font-semibold">Summary after round {round}</p>
      <div className="min-w-0 flex-1">
        <RoundTracker nodes={nodes} activeIndex={activeIndex} />
      </div>
      {hint && <p className="text-ink-3 shrink-0 text-xs md:max-w-xs md:text-right">{hint}</p>}
    </section>
  );
}
