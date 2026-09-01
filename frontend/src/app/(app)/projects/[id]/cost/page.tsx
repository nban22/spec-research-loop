'use client';

import { useQuery } from '@tanstack/react-query';
import { Coins, Gauge, Layers, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { CardSkeleton, EmptyState, StatTileSkeleton, TableSkeleton } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * **The dashboard for real tokens, time and cost** — issue #17 (lane C).
 *
 * `LlmCall` has recorded everything for **every** call since day one, and no screen ever read it.
 * This page is read-only; it has no write action at all.
 */

type Bucket = {
  key: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_usd: number;
  retried_calls: number;
  failed_calls: number;
};

type CostOverview = {
  project: { id: string; title: string };
  totals: {
    calls: number;
    failed_calls: number;
    retried_calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    latency_ms: number;
    cost_usd: number;
  };
  cache: { hit_tokens: number; miss_tokens: number; hit_ratio: number | null };
  reliability: { retry_ratio: number | null; failure_ratio: number | null };
  by_step: Bucket[];
  by_prompt: Bucket[];
  by_model: Bucket[];
  estimate_vs_actual: {
    estimated_usd: number;
    estimated_tokens: number;
    actual_usd: number;
    diff_usd: number;
    diff_ratio: number | null;
  } | null;
};

const n = (v: number) => v.toLocaleString('en-US');
const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export default function CostPage({ params }: PageProps<'/projects/[id]/cost'>) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', id, 'cost'],
    queryFn: () => api.get<CostOverview>(`/projects/${id}/cost`),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <StatTileSkeleton />
        <TableSkeleton rows={5} cols={5} />
        <CardSkeleton rows={2} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={Coins}
          title="The cost figures could not be read"
          description="The data for this project could not be fetched. Please reload the page."
        />
      </div>
    );
  }

  const t = data.totals;
  const ev = data.estimate_vs_actual;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          Real tokens, time and cost
        </h1>
        <p className="text-ink-3 line-clamp-1 text-xs md:text-sm">
          {data.project.title} ·{' '}
          <Link
            href={`/projects/${id}/step/1`}
            className="text-brand-strong underline underline-offset-2"
          >
            back to the project
          </Link>
        </p>
      </header>

      {t.calls === 0 ? (
        <EmptyState
          icon={Coins}
          tone="brand"
          title="This project has never called the model"
          description="Run step 1 to analyse the idea, then come back here. Every call records its tokens, latency and retry count."
        />
      ) : (
        <>
          <Panel accent="brand" icon={Gauge} title="Overview">
            <StatTileGrid
              items={[
                { label: 'Real cost', value: usd(t.cost_usd) },
                { label: 'Total tokens', value: n(t.total_tokens) },
                { label: 'Calls', value: n(t.calls) },
                { label: 'Total time', value: secs(t.latency_ms) },
              ]}
            />
            <StatTileGrid
              items={[
                { label: 'Prefix cache hits', value: pct(data.cache.hit_ratio) },
                { label: 'Needed a retry', value: pct(data.reliability.retry_ratio) },
                { label: 'Failed calls', value: pct(data.reliability.failure_ratio) },
                { label: 'Tokens in / out', value: `${n(t.prompt_tokens)} / ${n(t.completion_tokens)}` },
              ]}
            />
            <HintBox tone="info">
              The prefix cache hit ratio tells you whether the shared part of a prompt sits at the
              front — placed correctly, later calls only pay for what differs. A high “needed a
              retry” ratio on one prompt means that prompt often returns malformed JSON.
            </HintBox>
          </Panel>

          {ev && (
            <Panel accent="decide" icon={Coins} title="Estimate versus actual">
              <StatTileGrid
                items={[
                  { label: 'Experiment budget', value: usd(ev.estimated_usd) },
                  { label: 'Spent building the spec', value: usd(ev.actual_usd) },
                  { label: 'Difference', value: usd(ev.diff_usd) },
                  { label: 'Relative difference', value: pct(ev.diff_ratio) },
                ]}
              />
              <HintBox tone="warn" title="How to read this correctly">
                The two sides measure different things: the budget is money for the{' '}
                <strong>experiments still to run</strong>, while the real cost is money already
                spent <strong>building the specification</strong>. So this gauges how optimistic the
                estimator is, not the difference between two comparable quantities. Both sides use
                the same unit prices, so no price drift is mixed in.
              </HintBox>
            </Panel>
          )}

          <Panel accent="ok" icon={Layers} title="By step">
            <BucketTable rows={data.by_step} firstCol="Step" />
          </Panel>

          <Panel accent="neutral" icon={RefreshCw} title="By prompt">
            <BucketTable rows={data.by_prompt} firstCol="Prompt" mono />
          </Panel>

          <Panel accent="neutral" icon={Layers} title="By model">
            <BucketTable rows={data.by_model} firstCol="Model" mono />
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * One table for all three slices — the three tables differ only in their first column, so splitting
 * them into three components would be copying the same thing three times.
 *
 * Below `md` it switches to a list, not a broken-up table (DESIGN_SYSTEM §6.5).
 */
function BucketTable({
  rows,
  firstCol,
  mono,
}: {
  rows: Bucket[];
  firstCol: string;
  mono?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-ink-3 text-xs">No data for this slice yet.</p>;
  }
  const total = rows.reduce((a, b) => a + b.cost_usd, 0);

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-3 border-hairline border-b text-left">
              <th className="py-1.5 pr-2 font-medium">{firstCol}</th>
              <th className="py-1.5 pr-2 text-right font-medium">Calls</th>
              <th className="py-1.5 pr-2 text-right font-medium">Tokens</th>
              <th className="py-1.5 pr-2 text-right font-medium">Time</th>
              <th className="py-1.5 pr-2 text-right font-medium">Retries</th>
              <th className="py-1.5 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-hairline ease-out-quart hover:bg-sunken border-b transition-colors duration-150"
              >
                <td className={cn('text-ink-1 py-1.5 pr-2', mono && 'font-mono')}>{r.key}</td>
                <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">{n(r.calls)}</td>
                <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">
                  {n(r.total_tokens)}
                </td>
                <td className="text-ink-2 py-1.5 pr-2 text-right tabular-nums">
                  {secs(r.latency_ms)}
                </td>
                <td
                  className={cn(
                    'py-1.5 pr-2 text-right tabular-nums',
                    r.retried_calls > 0 ? 'text-warn-strong' : 'text-ink-4',
                  )}
                >
                  {n(r.retried_calls)}
                </td>
                <td className="text-ink-1 py-1.5 text-right font-medium tabular-nums">
                  {usd(r.cost_usd)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="text-ink-2 py-1.5 pr-2 font-medium">Total</td>
              <td colSpan={4} />
              <td className="text-ink-1 py-1.5 text-right font-semibold tabular-nums">
                {usd(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="border-hairline bg-surface space-y-1 rounded-lg border p-3">
            <p className={cn('text-ink-1 text-sm font-medium', mono && 'font-mono')}>{r.key}</p>
            <dl className="text-ink-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums">
              <div className="flex justify-between">
                <dt className="text-ink-3">Calls</dt>
                <dd>{n(r.calls)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Tokens</dt>
                <dd>{n(r.total_tokens)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Time</dt>
                <dd>{secs(r.latency_ms)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">Cost</dt>
                <dd className="text-ink-1 font-medium">{usd(r.cost_usd)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
