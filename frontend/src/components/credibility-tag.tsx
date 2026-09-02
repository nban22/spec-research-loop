import { cn } from '@/lib/utils';
import { CREDIBILITY_STYLE } from '@/lib/status-style';
import type { CredibilityTier } from '@/lib/types';

/**
 * `styleOr` does not fit here: it returns a `StatusStyle` (which carries an `icon`), while the
 * credibility tier deliberately has **no icon** — see the docblock below. A dedicated escape
 * hatch, same principle: show the unknown value verbatim instead of swallowing it into "Unknown".
 */
const FALLBACK = {
  label: '',
  className: 'bg-neutral-soft text-neutral-strong border-neutral-line',
};

/**
 * The credibility tier of a source (#1) — a **pale filled pill**, deliberately a different shape
 * from `SupportTag` (hollow tag, thick border). The two often sit side by side and say very
 * different things: `SupportTag` says *does this source back the claim*, while this one says
 * *how trustworthy the source itself is*. Same shape and the reader merges them into one.
 *
 * `reason` is a sentence the backend generates from rules. **Never show the score** — the
 * acceptance criterion of #1 is "every tier is shown with a readable reason, not a raw number".
 */
export function CredibilityTag({
  tier,
  reason,
  className,
}: {
  tier: CredibilityTier;
  reason?: string;
  className?: string;
}) {
  const known: { label: string; className: string } | undefined =
    CREDIBILITY_STYLE[tier];
  const style = known ?? { ...FALLBACK, label: tier };
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-medium',
          style.className,
        )}
      >
        {style.label}
      </span>
      {/* The reason is shown as TEXT, never hidden in a tooltip — touch has no hover (§6.7 rule 1). */}
      {reason && <span className="text-ink-3 text-xs">{reason}</span>}
    </span>
  );
}
