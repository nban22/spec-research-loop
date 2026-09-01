'use client';

import { useMemo, useState } from 'react';
import { CredibilityTag } from '@/components/credibility-tag';
import { HintBox } from '@/components/hint-box';
import { SupportTag } from '@/components/support-tag';
import {
  VERIFIER_FLAG_LABEL,
  VERIFIER_LAYER_LABEL,
  VERIFIER_LAYER_ORDER,
} from '@/lib/status-style';
import type { SupportLabel } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ApiEvidencePair, ApiEvidenceTrace } from '@/lib/use-project';

/**
 * The "why this label" page (#5) — the rendering half.
 *
 * This is not a debug screen. It is the answer to the question that will certainly be asked at the
 * defence: *"how do I know this label is right?"*. Every pair expands into the **path through the
 * layers**, and every number shown carries the thresholds of **that particular run** — read from
 * `VerifierRun.config`, not from today's constants.
 *
 * Split out of `page.tsx` so it can be tested without a network, following the same shape as
 * lane C's four read-only screens.
 */

/**
 * `UNVERIFIED` is **not** a `SupportLabel` — it means "the verifier never looked at this pair".
 * It has to be here because an unverified pair already carries `support_label = 'WEAK'` (the schema
 * default): without it, the "Weak" filter would sweep in pairs that were never scored at all.
 */
type PairFilter = SupportLabel | 'ALL' | 'UNVERIFIED';

const LABEL_FILTERS: { key: PairFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SUPPORTED', label: 'Supported' },
  { key: 'WEAK', label: 'Weak' },
  { key: 'UNSUPPORTED', label: 'Unsupported' },
  { key: 'UNVERIFIED', label: 'Unverified' },
];

export function EvidenceTraceView({ data }: { data: ApiEvidenceTrace }) {
  const [label, setLabel] = useState<PairFilter>('ALL');
  const [flag, setFlag] = useState<string | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(null);

  const flagsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const p of data.pairs) for (const f of p.flags) set.add(f);
    return [...set].sort();
  }, [data.pairs]);

  const pairs = data.pairs.filter((p) => {
    if (label === 'UNVERIFIED' && p.verified) return false;
    // An unverified pair must not slip into any label filter: its label does not exist yet.
    if (label !== 'ALL' && label !== 'UNVERIFIED') {
      if (!p.verified || p.support_label !== label) return false;
    }
    if (flag !== 'ALL' && !p.flags.includes(flag as never)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LABEL_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={label === f.key}
            label={f.label}
            onClick={() => setLabel(f.key)}
          />
        ))}
      </div>

      {flagsPresent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={flag === 'ALL'}
            label="All diagnostic flags"
            onClick={() => setFlag('ALL')}
          />
          {flagsPresent.map((f) => (
            <FilterChip
              key={f}
              active={flag === f}
              label={VERIFIER_FLAG_LABEL[f] ?? f}
              onClick={() => setFlag(f)}
            />
          ))}
        </div>
      )}

      {pairs.length === 0 ? (
        <HintBox tone="info" title="No pair matches these filters">
          <p>Clear some of the filters above to see the full list again.</p>
        </HintBox>
      ) : (
        <ul className="space-y-2">
          {pairs.map((p) => (
            <li key={p.card_source_id}>
              <PairRow
                pair={p}
                thresholds={data.thresholds}
                open={open === p.card_source_id}
                onToggle={() =>
                  setOpen(open === p.card_source_id ? null : p.card_source_id)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-1 text-xs',
        'ease-out-quart transition-[color,background-color,border-color] duration-150',
        active
          ? 'border-brand-line bg-brand-soft text-brand-strong font-medium'
          : 'border-hairline bg-surface text-ink-2 hover:bg-sunken',
      )}
    >
      {label}
    </button>
  );
}

function PairRow({
  pair,
  thresholds,
  open,
  onToggle,
}: {
  pair: ApiEvidencePair;
  thresholds: ApiEvidenceTrace['thresholds'];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-hairline bg-surface rounded-md border">
      {/* A real button, not a div with onClick (frontend/CLAUDE.md §7). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-sunken flex w-full cursor-pointer flex-col gap-1.5 rounded-md p-3 text-left"
      >
        <span className="flex flex-wrap items-center gap-2">
          <SupportTag label={pair.support_label} verified={pair.verified} />
          <span className="text-ink-1 text-sm font-medium">
            {pair.card.title}
          </span>
        </span>
        <span className="text-ink-3 text-xs">
          {pair.source.title}
          {pair.source.year ? ` (${pair.source.year})` : ''}
        </span>
        {pair.credibility && (
          <CredibilityTag
            tier={pair.credibility.tier}
            reason={pair.credibility.reason}
          />
        )}
      </button>

      {open && (
        <div className="border-hairline space-y-3 border-t p-3">
          <LayerBar layer={pair.layer} />
          <p className="text-ink-2 text-sm">{pair.layer_why}</p>

          <dl className="grid gap-x-4 gap-y-1 text-xs md:grid-cols-2">
            <Metric
              label="Similarity"
              value={pair.similarity === null ? '—' : pair.similarity.toFixed(3)}
              note={`lower threshold ${thresholds.tau_low} · upper threshold ${thresholds.tau_high}`}
            />
            <Metric
              label="Model verdict"
              value={pair.entailment ?? 'the model was not called'}
              note={
                pair.confidence === null
                  ? 'no confidence recorded'
                  : `confidence ${pair.confidence.toFixed(2)} · minimum ${thresholds.conf_min}`
              }
            />
          </dl>

          {pair.evidence_sentence && (
            <div>
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                The sentence quoted as evidence
              </p>
              <p className="text-ink-1 mt-1 text-sm leading-relaxed italic">
                “{pair.evidence_sentence}”
              </p>
            </div>
          )}

          {pair.flags.length > 0 && (
            <ul className="text-ink-3 space-y-0.5 text-xs">
              {pair.flags.map((f) => (
                <li key={f}>· {VERIFIER_FLAG_LABEL[f] ?? f}</li>
              ))}
            </ul>
          )}

          {pair.passages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Full-text passages sent to the model
              </p>
              {pair.passages.map((ps) => (
                <p
                  key={ps.rank}
                  className={cn(
                    'rounded-sm border p-2 text-xs leading-relaxed',
                    ps.is_evidence
                      ? 'border-ok-line bg-ok-soft text-ok-strong'
                      : 'border-hairline bg-sunken text-ink-2',
                  )}
                >
                  <span className="text-ink-4">
                    #{ps.rank + 1} · similarity {ps.similarity.toFixed(3)} · offset{' '}
                    {ps.char_start}
                    {ps.is_evidence ? ' · contains the quoted sentence' : ''}
                  </span>
                  <br />
                  {ps.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The layer bar, with the deciding layer highlighted. SVG is unnecessary here — divs are enough
 * and cheaper.
 *
 * `layer === null` ⇒ **draw nothing**. An unverified pair was never touched by any layer; drawing
 * the bar with every layer dimmed would still imply "it went down this path and no layer could
 * decide", when in truth the path never started. The `layer_why` line just below says exactly that.
 */
function LayerBar({ layer }: { layer: string | null }) {
  if (layer === null) return null;
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[520px] gap-1" aria-label="Path through the verifier layers">
        {VERIFIER_LAYER_ORDER.map((l) => {
          const hit = l === layer;
          return (
            <li
              key={l}
              aria-current={hit ? 'step' : undefined}
              className={cn(
                'flex-1 rounded-sm border px-2 py-1.5 text-center text-2xs',
                hit
                  ? 'border-brand-ink bg-brand-soft text-brand-strong font-bold'
                  : 'border-hairline bg-sunken text-ink-4',
              )}
            >
              <span className="block font-mono">{l}</span>
              <span className="block">{VERIFIER_LAYER_LABEL[l] ?? l}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <dt className="text-ink-4 text-2xs tracking-wide uppercase">{label}</dt>
      <dd className="text-ink-1 font-medium">{value}</dd>
      <dd className="text-ink-3">{note}</dd>
    </div>
  );
}
