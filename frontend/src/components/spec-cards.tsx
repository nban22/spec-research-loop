'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  CARD_STATUSES,
  CARD_TYPES,
  CARD_TYPE_LABEL,
  type ApiCard,
  type CardStatus,
} from '@/lib/types';
import { CARD_STATUS_BAR, CARD_STATUS_STYLE } from '@/lib/status-style';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import { StatusChip } from './status-chip';
import { SupportTag } from './support-tag';

/**
 * One card of the 8 types: a **status colour rail on the left** + `StatusChip` + content +
 * attached sources (DESIGN_SYSTEM §3.7). The card is **never** filled by status — six coloured
 * fills side by side turn into noise. `MISSING` is the exception: dashed border, sunken fill,
 * dimmed text — the card looks like an empty slot waiting to be filled, because that is exactly
 * what it is.
 */
export function SpecCard({ card }: { card: ApiCard }) {
  const missing = card.status === 'MISSING';
  const payload = card.payload ?? {};
  const extras = Object.entries(payload).filter(
    ([k, v]) => k !== 'role' && typeof v === 'string' && v.length > 0,
  );

  return (
    <article
      className={cn(
        'group/card relative overflow-hidden rounded-lg border pl-3',
        'ease-out-quart transition-[border-color,box-shadow] duration-150',
        'hover:shadow-card',
        missing
          ? 'border-hairline bg-sunken hover:border-neutral-line border-dashed'
          : 'border-hairline bg-surface hover:border-brand-line',
      )}
    >
      {/* The rail gains 1px on hover — a "this card is targeted" signal that does not touch the
          background colour, because the background belongs to the status (§3.7). */}
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1 group-hover/card:w-1.5',
          'ease-out-quart transition-[width] duration-150',
          CARD_STATUS_BAR[card.status],
        )}
        aria-hidden
      />
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4
            className={cn(
              'min-w-0 flex-1 text-sm font-medium',
              missing ? 'text-ink-3' : 'text-ink-1',
            )}
          >
            {card.title}
          </h4>
          <StatusChip status={card.status} />
        </div>

        {card.body && (
          <p className={cn('text-xs leading-relaxed', missing ? 'text-ink-4' : 'text-ink-2')}>
            {card.body}
          </p>
        )}

        {extras.length > 0 && (
          <dl className="space-y-1">
            {extras.map(([k, v]) => (
              <div key={k} className="text-xs">
                <dt className="text-ink-3 font-medium">{FIELD_LABEL[k] ?? k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {card.card_sources.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {card.card_sources.map((cs) => (
              <li key={cs.id} className="border-hairline space-y-1 border-t pt-1.5">
                <p className="text-ink-2 text-xs">
                  {cs.source.title}
                  {cs.source.year ? ` (${cs.source.year})` : ''}
                </p>
                <SupportTag
                  label={cs.support_label}
                  flags={cs.flags}
                  verified={cs.verifier_run_id !== null}
                />
                {cs.evidence_sentence && (
                  <p className="text-ink-3 border-hairline border-l-2 pl-2 text-xs italic">
                    “{cs.evidence_sentence}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** The four mandatory gap questions + the five claim fields — reader-facing labels. */
const FIELD_LABEL: Record<string, string> = {
  prior_work: 'What prior work achieved',
  limitation: 'What is still limited',
  why_it_matters: 'Why that limitation matters',
  testable_experiment: 'Which experiment would test it',
  baseline: 'Baseline',
  metric: 'Metric',
  evidence: 'Evidence',
  refutation_condition: 'Refutation condition',
};

/**
 * **`CardBoard` — the decomposition board of 8 types × 6 statuses.**
 *
 * A **mandatory** block of the brief (step 2 + feature 3) that **no mockup draws**
 * (DESIGN_SYSTEM §5.4 #1, §8 #10). Drop it and the six `CardStatus` values of §3.2 never appear
 * on any screen, turning the whole of §3 into decoration.
 *
 * Mobile: a single column with one accordion per card type; a group that still holds cards needing
 * attention is **open by default**, a fully `CONFIRMED` group is closed — open or shut depends on
 * whether there is work there (§6.9).
 */
const NEEDS_ATTENTION: CardStatus[] = ['MISSING', 'AMBIGUOUS', 'CONFLICT', 'UNSUPPORTED'];

export function CardBoard({ cards }: { cards: ApiCard[] }) {
  // The filter lives in `useUiStore`, not `useState`: `CardBoard` unmounts on every stepper
  // change, so a local filter would be lost the moment the user visits another step (§6.9).
  const filter = useUiStore((s) => s.cardFilter);
  const setFilter = useUiStore((s) => s.setCardFilter);
  const shown = filter === 'ALL' ? cards : cards.filter((c) => c.status === filter);

  const groups = CARD_TYPES.map((type) => ({
    type,
    items: shown.filter((c) => c.type === type),
    all: cards.filter((c) => c.type === type),
  })).filter((g) => (filter === 'ALL' ? g.all.length > 0 : g.items.length > 0));

  const activeKeys = groups.map((g) => g.type);
  const openByDefault =
    filter === 'ALL'
      ? groups
          .filter((g) => g.all.some((c) => NEEDS_ATTENTION.includes(c.status)))
          .map((g) => g.type)
      : activeKeys;

  const counts = CARD_STATUSES.map((s) => ({
    status: s,
    n: cards.filter((c) => c.status === s).length,
  }));

  return (
    <div className="space-y-3">
      {/* Quick status filter — all six values keep their full text label, even at 375px. */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={filter === 'ALL' ? 'default' : 'outline'}
          onClick={() => setFilter('ALL')}
          className="ease-out-quart tabular-nums transition-all duration-150"
        >
          All ({cards.length})
        </Button>
        {counts.map(({ status, n }) => (
          <Button
            key={status}
            size="sm"
            variant={filter === status ? 'default' : 'outline'}
            disabled={n === 0}
            onClick={() => setFilter(status)}
            className="ease-out-quart tabular-nums transition-all duration-150"
          >
            {CARD_STATUS_STYLE[status].label} ({n})
          </Button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="border-hairline bg-surface rounded-lg border p-4 text-center">
          <p className="text-ink-3 text-xs">No cards match this filter.</p>
        </div>
      ) : (
        <Accordion
          key={filter}
          type="multiple"
          defaultValue={openByDefault}
          className="space-y-2"
        >
          {groups.map((g, i) => (
            <AccordionItem
              key={g.type}
              value={g.type}
              /* Staggered 40ms in reading order; capped at 6 groups so the last one does not wait too long. */
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              className={cn(
                'border-hairline bg-surface animate-rise rounded-lg border px-3',
                'ease-out-quart transition-colors duration-150 hover:border-brand-line',
              )}
            >
              <AccordionTrigger className="py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-ink-1 font-medium">{CARD_TYPE_LABEL[g.type]}</span>
                  <span className="text-ink-3 text-xs tabular-nums">({g.items.length})</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                {g.items.map((c) => (
                  <SpecCard key={c.id} card={c} />
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
