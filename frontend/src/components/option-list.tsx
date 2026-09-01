'use client';

import { Check, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ApiOption } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The "Other" option is always injected by the **UI**, never left to whether the model remembered it. */
export const OTHER_OPTION: ApiOption = {
  key: 'OTHER',
  label: 'Other — I will describe it myself',
  explain: 'Describe your own way of handling this; the system records your reason verbatim.',
  example: 'For example: keep the claim as it stands but note that the evidence is still weak.',
};

/** The "Example: …" line with a lightbulb icon, caption size, `decide` colour (DESIGN_SYSTEM §5.3). */
function OptionHint({ example }: { example: string }) {
  if (!example) return null;
  return (
    <p className="text-decide-strong/80 mt-1 flex items-start gap-1 text-xs">
      <Lightbulb className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>Example: {example}</span>
    </p>
  );
}

/**
 * A/B/C/**Other** — feature 7 of the brief.
 *
 * **`Other` is injected when the API omits it** — that is NFR-G-3, never left to the LLM.
 * Choosing `Other` **requires** a reason.
 *
 * The two variants are chosen by **label length**, not by step (§5.3):
 * - `compact` — a wrapping grid of short chips, labels of 2–4 words
 * - `stacked` — one full-width row per option with a check mark on the right
 *
 * The selected option uses a **doubled border width** — thickness is the selection signal, not
 * colour (§4.4).
 */
export function OptionList({
  question,
  options,
  variant = 'stacked',
  disabled,
  submitting,
  submitLabel = 'Confirm choice',
  onSubmit,
}: {
  question: string;
  options: ApiOption[];
  variant?: 'compact' | 'stacked';
  disabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (chosenKey: string, customText: string | null) => void;
}) {
  const withOther = options.some((o) => o.key === 'OTHER')
    ? options
    : [...options, OTHER_OPTION];

  const [chosen, setChosen] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const needsReason = chosen === 'OTHER';
  const canSubmit =
    chosen !== null && (!needsReason || customText.trim().length > 0) && !disabled;

  return (
    <div className="space-y-3">
      <p className="text-ink-1 text-sm font-medium">{question}</p>

      <div
        className={cn(
          variant === 'compact' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2',
        )}
        role="radiogroup"
        aria-label={question}
      >
        {withOther.map((o) => {
          const active = chosen === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setChosen(o.key)}
              className={cn(
                'rounded-md border px-3 py-2 text-left',
                'ease-out-quart transition-[border-color,background-color] duration-150',
                active
                  ? 'border-decide-ink bg-decide-soft border-2'
                  : 'border-hairline bg-surface hover:border-decide-line',
                variant === 'compact' ? 'text-xs' : 'w-full text-sm',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              <span className="flex items-start gap-2">
                <span className="text-decide-strong shrink-0 font-semibold">{o.key})</span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink-1 font-medium">{o.label}</span>
                  {o.recommended && (
                    <span className="text-ok-strong bg-ok-soft ml-2 inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-semibold">
                      SUGGESTED
                    </span>
                  )}
                  {variant === 'stacked' && o.explain && (
                    <span className="text-ink-2 mt-0.5 block text-xs">{o.explain}</span>
                  )}
                  {variant === 'stacked' && <OptionHint example={o.example} />}
                </span>
                {active && (
                  <Check className="text-decide-ink mt-0.5 size-4 shrink-0" aria-hidden />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Labels are short in the compact variant ⇒ the selected option's explanation appears below. */}
      {variant === 'compact' && chosen && (
        <div className="border-hairline bg-sunken rounded-md border px-3 py-2">
          <p className="text-ink-2 text-xs">
            {withOther.find((o) => o.key === chosen)?.explain}
          </p>
          <OptionHint example={withOther.find((o) => o.key === chosen)?.example ?? ''} />
        </div>
      )}

      {needsReason && (
        <div className="space-y-1.5">
          <Label htmlFor="other-reason" className="text-xs">
            Your reason <span className="text-danger-ink">*</span>
          </Label>
          <Textarea
            id="other-reason"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Describe how you want to handle this. It is stored verbatim in the decision log."
            rows={3}
          />
        </div>
      )}

      <Button
        className="w-full md:w-auto"
        size="lg"
        disabled={!canSubmit || submitting}
        onClick={() => chosen && onSubmit(chosen, needsReason ? customText.trim() : null)}
      >
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </div>
  );
}
