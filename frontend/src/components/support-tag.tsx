import { cn } from '@/lib/utils';
import {
  SUPPORT_STYLE,
  UNVERIFIED_STYLE,
  VERIFIER_FLAG_LABEL,
} from '@/lib/status-style';
import { styleOr } from '@/lib/unknown-style';
import type { SupportLabel, VerifierFlag } from '@/lib/types';

/**
 * `SupportLabel` → a **hollow tag**, thicker border, UPPERCASE, shield icon family
 * (DESIGN_SYSTEM §3.4). Hollow is deliberate: this tag always sits next to a source title in a
 * list, and a solid fill would turn every source row into a colour streak, wrecking the
 * related-work table. This is the **only** reader of the `SupportLabel` map.
 *
 * `verified={false}` **overrides `label`** and renders `UNVERIFIED`. It has to exist because
 * `support_label` defaults to `WEAK` the moment the generator creates a `CardSource`, so a
 * freshly generated card already wears a WEAK label while the verifier has never read it. Without
 * separating the two, the card board at step 3 shows WEAK everywhere and the reader concludes the
 * verifier could back nothing at all.
 *
 * Omitting `verified` ⇒ treated as verified — preserving behaviour for call sites that only ever
 * receive post-verifier data (the label roll-up at step 5, for example).
 */
export function SupportTag({
  label,
  flags,
  verified = true,
  className,
}: {
  label: SupportLabel;
  flags?: VerifierFlag[] | null;
  verified?: boolean;
  className?: string;
}) {
  if (!verified) return <UnverifiedTag className={className} />;
  const style = styleOr(SUPPORT_STYLE, label);
  const Icon = style.icon;
  const reasons = (flags ?? []).map((f) => VERIFIER_FLAG_LABEL[f]).filter(Boolean);

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-sm border-2 bg-transparent px-1.5 py-0.5 text-2xs font-bold tracking-wide',
          style.className,
        )}
      >
        <Icon className="size-3" aria-hidden />
        {style.label}
      </span>
      {/* The reason is shown as TEXT, not a tooltip — touch has no hover (§6.7 rule 1). */}
      {reasons.length > 0 && (
        <span className="text-ink-3 text-xs">{reasons.join(' · ')}</span>
      )}
    </span>
  );
}

/**
 * The same shape as `SupportTag` (hollow, thick border, UPPERCASE, shield icon) but with a
 * **dashed** border — the same "empty slot" signal `CardStatus.MISSING` already uses. Sharing the
 * shape is deliberate: it occupies exactly a label's position, so it must read like a label.
 *
 * It always carries a written explanation, because this is the single easiest thing to
 * misread in the whole flow: unsaid, "UNVERIFIED" looks like a fourth negative verdict.
 */
function UnverifiedTag({ className }: { className?: string }) {
  const Icon = UNVERIFIED_STYLE.icon;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-sm border-2 bg-transparent px-1.5 py-0.5 text-2xs font-bold tracking-wide',
          UNVERIFIED_STYLE.className,
        )}
      >
        <Icon className="size-3" aria-hidden />
        {UNVERIFIED_STYLE.label}
      </span>
      <span className="text-ink-3 text-xs">evidence verification has not run for this pair</span>
    </span>
  );
}
