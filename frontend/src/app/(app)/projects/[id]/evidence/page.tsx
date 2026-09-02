'use client';

import { ShieldQuestion } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { EvidenceTraceView } from '@/components/evidence-trace';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { StatTileGrid } from '@/components/spec-views';
import { CardSkeleton, EmptyState } from '@/components/states';
import { useEvidenceTrace, useProject } from '@/lib/use-project';

/**
 * **Why this label** — issue #5 (lane A).
 *
 * The verifier assigns `SUPPORTED` / `WEAK` / `UNSUPPORTED` to each claim-source pair, but before
 * this page the user could not see **why**. All the data needed to explain it was already in the
 * database from day one; the only thing missing was somewhere to show it.
 *
 * This is not a debug screen — it is the visual answer to the question that will certainly be asked
 * at the defence: *"how do I know this label is right?"*. Same shape as lane C's `/cost`, `/map`
 * and `/errors`: a **read-only** screen hanging off the wizard, with no write endpoint and no new
 * table.
 */
export default function EvidencePage({
  params,
}: PageProps<'/projects/[id]/evidence'>) {
  const { id } = use(params);
  const { data: detail } = useProject(id);
  const versionId = detail?.currentVersion?.id;
  const { data, isLoading, isError } = useEvidenceTrace(versionId);

  if (isLoading || !detail) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={ShieldQuestion}
          title="The evidence could not be read"
          description="This project has no verified spec version. Run evidence verification at step 5 first."
        />
      </div>
    );
  }

  const total = data.pairs.length;
  const l4Ratio =
    data.run && data.run.units_total > 0
      ? `${Math.round((data.run.units_l4 / data.run.units_total) * 100)}%`
      : '—';
  const fromFullText = data.pairs.filter((p) => p.passages.length > 0).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          Why this label
        </h1>
        <p className="text-ink-3 text-xs md:text-sm">
          The path of {total} claim-source pairs through the verification layers ·{' '}
          <Link
            href={`/projects/${id}/step/5`}
            className="text-brand-strong underline underline-offset-2"
          >
            back to step 5
          </Link>
        </p>
      </header>

      <Panel accent="brand" icon={ShieldQuestion} title="Run overview">
        <StatTileGrid
          items={[
            { label: 'Supported', value: String(data.summary.SUPPORTED) },
            { label: 'Weak', value: String(data.summary.WEAK) },
            { label: 'Unsupported', value: String(data.summary.UNSUPPORTED) },
            { label: 'Needed the model', value: l4Ratio },
            { label: 'Read from full text', value: String(fromFullText) },
          ]}
        />
        <HintBox tone="info" title="How to read this page">
          <p>
            Click a row to see which layer decided its label. The first three layers run on rules
            and cost no tokens; only pairs in the grey zone are sent to the model.
          </p>
          <p className="mt-1">
            The thresholds shown here belong to <strong>that particular run</strong> (similarity{' '}
            {data.thresholds.tau_low}–{data.thresholds.tau_high}, minimum confidence{' '}
            {data.thresholds.conf_min}), not today’s — so an old label stays explainable after the
            thresholds are recalibrated.
          </p>
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={ShieldQuestion} title="Pair by pair">
        <EvidenceTraceView data={data} />
      </Panel>
    </div>
  );
}
