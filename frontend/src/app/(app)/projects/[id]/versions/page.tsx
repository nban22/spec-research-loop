'use client';

import { useQuery } from '@tanstack/react-query';
import { GitBranch, History, ScrollText } from 'lucide-react';
import { use, useState } from 'react';
import { Panel } from '@/components/panel';
import { DiffView } from '@/components/diff-view';
import { CardSkeleton, EmptyState } from '@/components/states';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, qk } from '@/lib/api';
import type { ApiDecision } from '@/lib/types';
import { useDecisionLog } from '@/lib/use-project';

type VersionRow = {
  id: string;
  version_no: number;
  status: string;
  label: string | null;
  parent_version_id: string | null;
  created_by_decision_id: string | null;
  created_at: string;
  _count: { cards: number; judge_runs: number; export_artifacts: number };
};

/**
 * `/projects/:id/versions` — `VersionTimeline` + `DiffView` + `DecisionLog`.
 * Two columns on desktop (picker on the left, diff on the right); on mobile it stacks and picks
 * with a select rather than two side-by-side dropdowns (DESIGN_SYSTEM §5.4).
 */
export default function VersionsPage({ params }: PageProps<'/projects/[id]/versions'>) {
  const { id } = use(params);
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const [pickedTo, setPickedTo] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: qk.versions(id),
    queryFn: () => api.get<{ versions: VersionRow[] }>(`/projects/${id}/versions`),
  });
  const { data: decisionData } = useDecisionLog(id);

  const versions = data?.versions ?? [];
  /* Default to comparing the two newest — derived during render, no setState in an effect. */
  const to = pickedTo ?? versions[0]?.id ?? null;
  const from = pickedFrom ?? versions[1]?.id ?? null;
  const setTo = setPickedTo;
  const setFrom = setPickedFrom;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <h1 className="text-ink-1 text-xl font-semibold">Version history</h1>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <Panel accent="brand" icon={History} title="Versions">
            {isLoading ? (
              <CardSkeleton rows={2} />
            ) : versions.length === 0 ? (
              <EmptyState
                title="No versions yet"
                description="The first version appears as soon as you create the project."
              />
            ) : (
              <ol className="space-y-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="border-hairline bg-surface rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="bg-brand-soft text-brand-strong rounded px-1.5 py-0.5 text-xs font-semibold">
                        v{v.version_no}
                      </span>
                      <span className="text-ink-3 text-xs">{v.status}</span>
                    </div>
                    {v.label && <p className="text-ink-1 mt-1 text-xs">{v.label}</p>}
                    <p className="text-ink-3 mt-1 text-xs">
                      {v._count.cards} cards · {v._count.judge_runs} judge runs ·{' '}
                      {v._count.export_artifacts} exports
                    </p>
                    <p className="text-ink-4 text-xs">
                      {new Date(v.created_at).toLocaleString('en-US')}
                    </p>
                    {/* No `created_by_decision_id` means this is v1 — every later version must
                        have been created by a decision the user made (NFR-G-3). */}
                    <p className="text-ink-4 text-xs">
                      {v.created_by_decision_id
                        ? 'Created by a decision you made'
                        : 'Original version'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel accent="neutral" icon={ScrollText} title="Decision log">
            <DecisionLog decisions={decisionData?.decisions ?? []} />
          </Panel>
        </div>

        <Panel accent="ok" icon={GitBranch} title="Compare two versions">
          {versions.length < 2 ? (
            <EmptyState
              title="At least two versions are needed"
              description="Apply a decision at step 4 to create a second version, then come back here to compare."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <VersionSelect
                  label="From"
                  value={from}
                  versions={versions}
                  onChange={setFrom}
                />
                <VersionSelect label="To" value={to} versions={versions} onChange={setTo} />
              </div>
              {from && to && from !== to && <DiffView versionId={to} against={from} />}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function VersionSelect({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string | null;
  versions: VersionRow[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-ink-3 text-xs">{label}</span>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a version" />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              v{v.version_no} {v.label ? `· ${v.label.slice(0, 30)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Section 14 of the spec: timestamp · question · chosen option · reason. A card list on mobile. */
function DecisionLog({ decisions }: { decisions: ApiDecision[] }) {
  if (decisions.length === 0) {
    return (
      <p className="text-ink-3 text-xs">
        No decisions yet. Every choice you make is recorded here and exported as section 14 of the
        specification.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {decisions.map((d) => {
        const chosen =
          d.chosen_key === 'OTHER'
            ? (d.custom_text ?? 'Other')
            : (d.options.find((o) => o.key === d.chosen_key)?.label ?? d.chosen_key);
        return (
          <li key={d.id} className="border-hairline bg-surface rounded-lg border px-3 py-2">
            <p className="text-ink-4 text-xs">
              {new Date(d.created_at).toLocaleString('en-US')} · {d.step} ·{' '}
              {d.actor === 'SCRIPTED' ? 'scripted' : 'you'}
              {!d.applied && ' · not applied'}
            </p>
            <p className="text-ink-1 mt-0.5 text-xs font-medium">{d.question}</p>
            <p className="text-ink-2 text-xs">
              <span className="text-decide-strong font-semibold">{d.chosen_key}</span> — {chosen}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
