'use client';

import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { HintBox } from '@/components/hint-box';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import {
  CONFLICT_SCOPE_LABEL,
  CONFLICT_SIGNAL_LABEL,
} from '@/lib/status-style';
import {
  useConflicts,
  useGateDecision,
  useGateOptions,
  type ApiConflict,
} from '@/lib/use-project';

/**
 * The **two-column confrontation** view for source conflicts (#3).
 *
 * It reuses the four `GATE_OPTIONS` exits and the `useGateOptions`/`useGateDecision` pair that
 * step 5 already uses for unsupported citations — so the user's choice becomes a `Decision` row on
 * its own, instead of building a second decision path.
 *
 * Conflicts are handled **one at a time** and each resolved one is dropped from the queue: same
 * reasoning as noted in `step-5.tsx` — the "I will look for another source" option changes no
 * data, so without dropping it the panel would pin forever on the first conflict.
 */
export function ConflictPanel({
  projectId,
  versionId,
}: {
  projectId: string;
  versionId: string | undefined;
}) {
  const { data } = useConflicts(versionId);
  const [handled, setHandled] = useState<string[]>([]);

  const conflicts = (data?.conflicts ?? []).filter((c) => !handled.includes(c.id));
  const current = conflicts[0] ?? null;

  const gateDecision = useGateDecision(projectId);
  /* Every conflict has two sides; side **A** goes into the decision gate because that is the
     claim-source pair the user would edit if they choose "narrow the claim to match the source". */
  const { data: options } = useGateOptions(current?.card_source_a_id);

  if (!data) return null;
  if ((data.conflicts ?? []).length === 0) return null;

  if (!current) {
    return (
      <HintBox tone="ok" title="All conflicts resolved">
        <p>
          You have chosen how to handle all {data.conflicts.length} conflicts in this version.
        </p>
      </HintBox>
    );
  }

  return (
    <Panel
      accent="decide"
      icon={CircleAlert}
      title={`Conflicts between sources (${conflicts.length})`}
    >
      <ConflictFace conflict={current} />

      <OptionList
        /* Remount per conflict — `OptionList` keeps the selection and the reason box in local
           state, so without a remount the previous conflict's reason lands on the next one. */
        key={current.id}
        question={
          options?.question ??
          'These two sources contradict each other. How do you want to handle it?'
        }
        options={options?.options ?? []}
        variant="stacked"
        disabled={!options}
        submitting={gateDecision.isPending}
        submitLabel="Confirm how to handle it"
        onSubmit={(chosenKey, customText) =>
          gateDecision.mutate(
            {
              cardSourceId: current.card_source_a_id,
              chosenKey,
              customText,
            },
            {
              onSuccess: () => {
                setHandled((h) => [...h, current.id]);
                toast.success(
                  'Your choice for this conflict has been recorded.',
                );
              },
            },
          )
        }
      />
    </Panel>
  );
}

/** The two confrontation columns — what source A says on the left, source B on the right, **each with a verbatim quote**. */
function ConflictFace({ conflict }: { conflict: ApiConflict }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-ink-1 text-sm font-medium">{conflict.card_title}</p>
        <p className="text-ink-3 text-xs">
          {CONFLICT_SCOPE_LABEL[conflict.scope] ?? conflict.scope} ·{' '}
          {CONFLICT_SIGNAL_LABEL[conflict.signal] ?? conflict.signal}
          {conflict.other_card_title
            ? ` · opposing card: “${conflict.other_card_title}”`
            : ''}
        </p>
      </div>

      {/* One column below md, two from md up — page-level layout only uses md: and xl: (DS §7.3). */}
      <div className="grid gap-2 md:grid-cols-2">
        <Side
          title={conflict.source_a_title}
          quote={conflict.evidence_a}
          label="The first source says"
        />
        <Side
          title={conflict.source_b_title}
          quote={conflict.evidence_b}
          label="The second source says"
        />
      </div>

      <HintBox tone="warn" title="Why the system flagged a conflict">
        <p>{conflict.reason}</p>
        {conflict.terms.length > 0 && (
          <p className="mt-1">Signals: {conflict.terms.join(' · ')}</p>
        )}
      </HintBox>
    </div>
  );
}

function Side({
  title,
  quote,
  label,
}: {
  title: string;
  quote: string;
  label: string;
}) {
  return (
    <div className="border-hairline bg-sunken rounded-md border p-3">
      <p className="text-ink-4 text-2xs tracking-wide uppercase">{label}</p>
      <p className="text-ink-2 mt-1 text-xs font-medium">{title}</p>
      {/* The quote is **verbatim** so the reader can check it themselves rather than trust the machine. */}
      <p className="text-ink-1 mt-2 text-sm leading-relaxed italic">
        {quote ? `“${quote}”` : 'This source has no quotable sentence to compare.'}
      </p>
    </div>
  );
}
