'use client';

import { Check, Download, FileText, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApiEstimate, ApiExperimentPlan, ApiSpecSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { HintBox } from './hint-box';

/** E1…En: experiment code + title + bullet points. */
export function ExperimentPlanList({ plan }: { plan: ApiExperimentPlan }) {
  return (
    <ol className="space-y-2">
      {plan.experiments.map((e) => (
        <li
          key={e.code}
          className="border-hairline bg-surface ease-out-quart hover:border-brand-line hover:shadow-card rounded-lg border p-3 transition-[border-color,box-shadow] duration-150"
        >
          <p className="text-ink-1 text-sm font-semibold">
            <span className="text-brand-strong">{e.code}</span> — {e.title}
          </p>
          <ul className="mt-1.5 space-y-1">
            {e.bullets.map((b, i) => (
              <li key={i} className="text-ink-2 flex gap-1.5 text-xs">
                <span className="text-ink-4">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {e.linked_claim_title && (
            <p className="text-ink-3 mt-1.5 text-xs italic">
              Tests the claim: {e.linked_claim_title}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The stat-tile grid. Container query: short tiles, two columns still comfortable at 375px (§6.5, §6.8). */
export function StatTileGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {items.map((s) => (
          <div
            key={s.label}
            className="border-hairline bg-sunken ease-out-quart hover:border-brand-line rounded-md border px-2.5 py-2 transition-colors duration-150"
          >
            <dt className="text-ink-3 text-xs">{s.label}</dt>
            <dd className="text-ink-1 text-sm font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** VRAM · Time · Tokens · Cost + a warning when the RTX 3090 limit is exceeded. */
export function EstimateRows({ estimate }: { estimate: ApiEstimate }) {
  const rows = [
    { label: 'VRAM', value: `${estimate.vram_gb} GB`, warn: !estimate.fits_rtx3090 },
    { label: 'Time', value: `${estimate.hours_min}–${estimate.hours_max} hours` },
    { label: 'Tokens', value: estimate.tokens_est.toLocaleString('en-US') },
    { label: 'API cost', value: `~$${estimate.cost_usd}` },
  ];

  return (
    <div className="space-y-2">
      <dl className="divide-hairline border-hairline divide-y rounded-md border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-3 py-2">
            <dt className="text-ink-2 text-xs">{r.label}</dt>
            <dd
              className={cn(
                'text-sm font-semibold tabular-nums',
                r.warn ? 'text-danger-strong' : 'text-ink-1',
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {estimate.warn_near_limit && (
        <HintBox tone={estimate.fits_rtx3090 ? 'warn' : 'danger'} title="Feasibility check">
          {estimate.fits_rtx3090
            ? `Estimated ${estimate.vram_gb} GB — still fits an RTX 3090 (24 GB), but close to the limit.`
            : `Estimated ${estimate.vram_gb} GB — over the 24 GB of an RTX 3090.`}
        </HintBox>
      )}

      {estimate.downscale_suggestion && (
        <HintBox tone="warn" title="Suggested downscaling">
          <ul className="space-y-1">
            {estimate.downscale_suggestion.map((s, i) => (
              <li key={i}>
                <span className="font-medium">
                  {s.field}: {String(s.from)} → {String(s.to)}
                </span>
                <span className="block">{s.reason}</span>
              </li>
            ))}
          </ul>
        </HintBox>
      )}

      <details className="text-ink-3 text-xs">
        <summary className="cursor-pointer">Formulas used</summary>
        <ul className="mt-1 space-y-0.5 pl-3">
          {estimate.breakdown.map((b) => (
            <li key={b.label}>
              <span className="font-medium">{b.label}:</span> {b.value}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * The **14 sections** of the spec with a present/missing state (mockup 5 only draws 10 — 14 comes
 * from the brief, §8 #9). It must scroll on mobile because 14 rows are taller than a 375px screen.
 */
export function SpecChecklist({ sections }: { sections: ApiSpecSection[] }) {
  const present = sections.filter((s) => s.present).length;
  return (
    <div className="space-y-2">
      <p className="text-ink-2 text-xs">
        <span className="text-ink-1 font-semibold tabular-nums">{present}/14</span> sections filled in
      </p>
      <ol className="space-y-1">
        {sections.map((s, i) => (
          <li
            key={s.key}
            /* Staggered 30ms: the 14 sections tick in reading order instead of popping in at once. */
            style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            className="animate-rise flex items-start gap-2 text-xs"
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                s.present ? 'bg-ok-soft text-ok-strong' : 'bg-neutral-soft text-neutral-ink',
              )}
            >
              {s.present ? (
                <Check className="size-2.5" aria-hidden />
              ) : (
                <Minus className="size-2.5" aria-hidden />
              )}
            </span>
            <span className={s.present ? 'text-ink-1' : 'text-ink-4'}>
              {s.no}. {s.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A table of contents to **read** — unlike `SpecChecklist`, which is a present/missing checklist (§5.3). */
export function SpecOutline({ sections }: { sections: ApiSpecSection[] }) {
  return (
    <ol className="space-y-1.5">
      {sections.map((s) => (
        <li key={s.key} className="flex gap-2">
          <span className="bg-sunken text-ink-3 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-2xs font-semibold">
            {s.no}
          </span>
          <span className="min-w-0">
            <span className="text-ink-1 block text-xs font-medium">{s.title}</span>
            <span className="text-ink-3 line-clamp-1 block text-xs">
              {s.body.replace(/[#*_`|-]/g, ' ').slice(0, 90) || 'No content yet'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "How the LLM did it" (mockup 5, right column): 4 numbered steps in `ok` circles. */
export function HowItWorksList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="bg-ok-soft text-ok-strong flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold">
            {i + 1}
          </span>
          <span className="text-ink-2 text-xs leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** The Before/After pair of rows (mockup 5); reused as the preview before creating a new version. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <div className="space-y-2">
      <div className="border-hairline bg-sunken rounded-md border px-3 py-2">
        <p className="text-ink-3 text-xs font-medium">Before</p>
        <p className="text-ink-2 text-xs">{before}</p>
      </div>
      <div className="border-ok-line bg-ok-soft rounded-md border px-3 py-2">
        <p className="text-ok-strong text-xs font-medium">After</p>
        <p className="text-ink-1 text-xs">{after}</p>
      </div>
    </div>
  );
}

/**
 * Confirm spec · Export PDF · Export Markdown.
 * While the verifier is still blocking, the buttons are **disabled with the reason spelled out in
 * text** — tooltips are unusable on touch (§6.7 rule 1).
 */
export function ExportBar({
  blocked,
  blockedReason,
  exporting,
  onExport,
  onBackToEdit,
}: {
  blocked: boolean;
  blockedReason?: string;
  exporting: 'MD' | 'PDF' | null;
  onExport: (format: 'MD' | 'PDF') => void;
  onBackToEdit: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="flex-1"
          disabled={blocked || exporting !== null}
          onClick={() => onExport('PDF')}
        >
          <FileText className="size-4" aria-hidden />
          {exporting === 'PDF' ? 'Building PDF…' : 'Export PDF'}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          disabled={blocked || exporting !== null}
          onClick={() => onExport('MD')}
        >
          <Download className="size-4" aria-hidden />
          {exporting === 'MD' ? 'Building…' : 'Export Markdown'}
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="w-full" onClick={onBackToEdit}>
        Go back and edit further
      </Button>
      {blocked && blockedReason && (
        <HintBox tone="danger" title="Cannot publish yet">
          {blockedReason}
        </HintBox>
      )}
    </div>
  );
}
