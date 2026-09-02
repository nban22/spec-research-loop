'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Grid3x3, ShieldAlert, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { EmptyState, TableSkeleton } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { SupportTag } from '@/components/support-tag';
import { api } from '@/lib/api';
import { VERIFIER_FLAG_LABEL } from '@/lib/status-style';
import { CARD_TYPE_LABEL, type CardType, type SupportLabel } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * **Visual error analysis** — issue #19 (lane C). Read-only.
 *
 * The screen carries **two different resolutions of data**, and it has to say so rather than blur
 * them: the pair matrices are a snapshot of **now** (because `CardSource` is overwritten on every
 * verifier run), while the before/after table reads from `VerifierRun` and therefore holds **every**
 * run.
 */

type Matrix<K extends string> = {
  total: number;
  by_type: Record<string, number>;
} & Record<K, string>;

type ErrorAnalysis = {
  project: { id: string; title: string };
  runs: {
    id: string;
    version_no: number;
    created_at: string;
    units_total: number;
    units_l4: number;
    l4_ratio: number | null;
    label_counts: Record<SupportLabel, number>;
    unsupported_ratio: number | null;
    thresholds: Record<string, number | null>;
  }[];
  current: {
    spec_version_id: string | null;
    pairs_total: number;
    overridden: number;
    flag_by_card_type: Matrix<'flag'>[];
    label_by_card_type: (Matrix<'label'> & { label: SupportLabel })[];
  };
};

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) => (v === null ? '—' : String(v));

export default function ErrorsPage({ params }: PageProps<'/projects/[id]/errors'>) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', id, 'error-analysis'],
    queryFn: () => api.get<ErrorAnalysis>(`/projects/${id}/error-analysis`),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <TableSkeleton rows={3} cols={6} />
        <TableSkeleton rows={7} cols={5} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={ShieldAlert}
          title="The analysis data could not be read"
          description="The evidence verification results for this project could not be fetched. Please reload the page."
        />
      </div>
    );
  }

  const { runs, current } = data;
  // Only the card types actually present — no 8 empty columns for a spec that uses three.
  const types = [
    ...new Set([
      ...current.flag_by_card_type.flatMap((f) => Object.keys(f.by_type)),
      ...current.label_by_card_type.flatMap((l) => Object.keys(l.by_type)),
    ]),
  ].sort() as CardType[];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Error analysis</h1>
        <p className="text-ink-3 line-clamp-1 text-xs md:text-sm">
          {data.project.title} ·{' '}
          <Link
            href={`/projects/${id}/step/5`}
            className="text-brand-strong underline underline-offset-2"
          >
            back to the project
          </Link>
        </p>
      </header>

      {runs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          tone="brand"
          title="The verifier has never run"
          description="Go to step 5 and run evidence verification. It takes at least two runs before the before/after table has anything to compare."
        />
      ) : (
        <>
          <Panel accent="decide" icon={TrendingDown} title="Comparing verifier runs">
            <RunTable runs={runs} />
            {runs.length === 1 && (
              <HintBox tone="info">
                Only one run so far. Change the thresholds and re-run at step 5 and this table will
                show two rows, letting you see which thresholds produce fewer “unsupported” labels.
              </HintBox>
            )}
          </Panel>

          <Panel accent="neutral" icon={Activity} title="Current snapshot">
            <StatTileGrid
              items={[
                { label: 'Pairs present', value: String(current.pairs_total) },
                { label: 'Reasons overridden', value: String(current.overridden) },
                { label: 'Runs', value: String(runs.length) },
                {
                  label: 'Current threshold',
                  value: num(runs[runs.length - 1]?.thresholds.tau_high ?? null),
                },
              ]}
            />
            <HintBox tone="warn" title="The two tables below are a snapshot of NOW">
              Every verifier run <strong>overwrites</strong> each pair’s label and flags — the
              per-pair data of an earlier run cannot be reconstructed. So the two tables below always
              describe the most recent run, while the comparison table above is the one that reads
              over time.
            </HintBox>
          </Panel>

          {current.pairs_total === 0 ? (
            <EmptyState
              icon={Grid3x3}
              title="The current version has no pairs"
              description="No claim has a source attached yet, so there is nothing to verify."
            />
          ) : (
            <>
              <Panel accent="ok" icon={Grid3x3} title="Label × card type">
                <MatrixTable
                  types={types}
                  rows={current.label_by_card_type.map((l) => ({
                    key: l.label,
                    render: <SupportTag label={l.label} />,
                    total: l.total,
                    by_type: l.by_type,
                  }))}
                  firstCol="Label"
                  note="Each pair falls into exactly one cell, so the total equals the pair count."
                />
              </Panel>

              <Panel accent="neutral" icon={ShieldAlert} title="Diagnostic flag × card type">
                <MatrixTable
                  types={types}
                  rows={current.flag_by_card_type.map((f) => ({
                    key: f.flag,
                    render: (
                      <span className="text-ink-1">
                        {VERIFIER_FLAG_LABEL[f.flag] ?? f.flag}
                      </span>
                    ),
                    total: f.total,
                    by_type: f.by_type,
                  }))}
                  firstCol="Flag"
                  note="One pair can carry several flags at once, so the cells sum to MORE than the pair count — this counts occurrences, it is not a partition."
                />
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** One row per run, carrying that run's own thresholds. */
function RunTable({ runs }: { runs: ErrorAnalysis['runs'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-3 border-hairline border-b text-left">
            <th className="py-1.5 pr-2 font-medium">When</th>
            <th className="py-1.5 pr-2 font-medium">Version</th>
            <th className="py-1.5 pr-2 text-right font-medium">τ_low</th>
            <th className="py-1.5 pr-2 text-right font-medium">τ_high</th>
            <th className="py-1.5 pr-2 text-right font-medium">Pairs</th>
            <th className="py-1.5 pr-2 text-right font-medium">Reached L4</th>
            <th className="py-1.5 text-right font-medium">Unsupported</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.id}
              className="border-hairline ease-out-quart hover:bg-sunken border-b transition-colors duration-150"
            >
              <td className="text-ink-2 py-1.5 pr-2 tabular-nums">
                {new Date(r.created_at).toLocaleString('en-US')}
              </td>
              <td className="text-ink-2 py-1.5 pr-2 tabular-nums">v{r.version_no}</td>
              <td className="text-ink-2 py-1.5 pr-2 text-right font-mono tabular-nums">
                {num(r.thresholds.tau_low)}
              </td>
              <td className="text-ink-2 py-1.5 pr-2 text-right font-mono tabular-nums">
                {num(r.thresholds.tau_high)}
              </td>
              <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">
                {r.units_total}
              </td>
              <td
                className={cn(
                  'py-1.5 pr-2 text-right tabular-nums',
                  (r.l4_ratio ?? 0) > 0.5 ? 'text-warn-strong' : 'text-ink-2',
                )}
              >
                {pct(r.l4_ratio)}
              </td>
              <td
                className={cn(
                  'py-1.5 text-right font-medium tabular-nums',
                  (r.unsupported_ratio ?? 0) > 0 ? 'text-danger-strong' : 'text-ink-2',
                )}
              >
                {pct(r.unsupported_ratio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A cross table shared by labels and flags — the two differ only in the first column and the note. */
function MatrixTable({
  types,
  rows,
  firstCol,
  note,
}: {
  types: CardType[];
  rows: { key: string; render: React.ReactNode; total: number; by_type: Record<string, number> }[];
  firstCol: string;
  note: string;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-3 border-hairline border-b text-left">
              <th className="py-1.5 pr-3 font-medium">{firstCol}</th>
              {types.map((t) => (
                <th key={t} className="py-1.5 pr-2 text-right font-medium whitespace-nowrap">
                  {CARD_TYPE_LABEL[t] ?? t}
                </th>
              ))}
              <th className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className={cn(
                  'border-hairline ease-out-quart border-b transition-colors duration-150',
                  r.total === 0 ? 'opacity-45' : 'hover:bg-sunken',
                )}
              >
                <td className="py-1.5 pr-3">{r.render}</td>
                {types.map((t) => {
                  const v = r.by_type[t] ?? 0;
                  return (
                    <td
                      key={t}
                      className={cn(
                        'py-1.5 pr-2 text-right tabular-nums',
                        v === 0 ? 'text-ink-4' : 'text-ink-1',
                      )}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="text-ink-1 py-1.5 text-right font-medium tabular-nums">
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-ink-3 text-2xs">{note}</p>
    </>
  );
}
