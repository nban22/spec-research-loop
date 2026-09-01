'use client';

import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { CardSkeleton, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SupportLabel } from '@/lib/types';
import {
  useLabelQueue,
  useProject,
  useRecordHumanCheck,
} from '@/lib/use-project';

/**
 * **Hand-labelling claim-source pairs** — issue #4 (lane A).
 *
 * `thresholds.ts` admits that 0.35 / 0.72 / 0.7 *"are guesses, not measurements"*. This page is the
 * input that turns them into measurements: a rater reads the claim and the source abstract and
 * decides, then `eval/calibrate.ts` sweeps a threshold grid over that label set.
 *
 * **Blind labelling is the whole point.** This screen deliberately shows no machine label, no
 * similarity score and no diagnostic flag — the backend does not return them either. Seeing the
 * machine label before choosing would reduce the measurement to "does the human agree with itself".
 */
const CHOICES: { label: SupportLabel; text: string; hint: string }[] = [
  {
    label: 'SUPPORTED',
    text: 'Supported',
    hint: 'The abstract says what the claim says.',
  },
  {
    label: 'WEAK',
    text: 'Weak',
    hint: 'Related, but not enough to conclude.',
  },
  {
    label: 'UNSUPPORTED',
    text: 'Unsupported',
    hint: 'It does not address this, or says the opposite.',
  },
];

export default function LabelPage({ params }: PageProps<'/projects/[id]/label'>) {
  const { id } = use(params);
  const { data: detail } = useProject(id);
  const versionId = detail?.currentVersion?.id;
  const { data, isLoading, isError } = useLabelQueue(versionId);
  const record = useRecordHumanCheck(versionId);
  const [justSaved, setJustSaved] = useState(false);

  if (isLoading || !detail) {
    return (
      <div className="mx-auto w-full max-w-[900px] space-y-3 px-3 py-4 md:px-4">
        <CardSkeleton rows={2} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-3 py-4 md:px-4">
        <EmptyState
          icon={ClipboardCheck}
          title="No pairs to label yet"
          description="This project has no verified spec version. Run evidence verification at step 5 first."
        />
      </div>
    );
  }

  const current = data.items[0] ?? null;
  const { labelled, labelled_total, target } = data.progress;
  const pct = Math.min(100, Math.round((labelled_total / target) * 100));

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">
          Label claim-source pairs
        </h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Used to calibrate the evidence verifier’s thresholds ·{' '}
          <Link
            href={`/projects/${id}/evidence`}
            className="text-brand-strong underline underline-offset-2"
          >
            see the label explainability page
          </Link>
        </p>
      </header>

      <Panel accent="brand" icon={ClipboardCheck} title="Progress">
        <div className="space-y-2">
          <Progress value={pct} />
          <p className="text-ink-3 text-xs">
            {labelled_total}/{target} pairs labelled system-wide ({labelled} of them in this
            project). {data.progress.remaining} pairs remain unlabelled in the current version.
          </p>
        </div>
        <HintBox tone="info" title="Blind labelling — read this carefully">
          <p>
            This screen <strong>deliberately hides the machine label</strong>. You read the claim
            and the abstract and decide; the two are only compared server-side. If you saw the
            machine label before choosing, the resulting measurement would mean nothing.
          </p>
          <p className="mt-1">
            Try to label all {target} pairs and to spread them across all three labels — do not
            only pick the easy ones.
          </p>
        </HintBox>
      </Panel>

      {!current ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Every pair in this version is labelled"
          description={
            labelled_total >= target
              ? `${labelled_total} pairs is enough. Run "npx tsx eval/calibrate.ts" to compare threshold sets.`
              : `Only ${labelled_total}/${target} pairs so far. Open another project and keep labelling to reach the sample size.`
          }
        />
      ) : (
        <Panel accent="decide" icon={ClipboardCheck} title="The pair under review">
          <div className="space-y-3">
            <section>
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Claim
              </p>
              <p className="text-ink-1 mt-1 text-sm font-medium">
                {current.claim_title}
              </p>
              <p className="text-ink-2 mt-1 text-sm">{current.claim_body}</p>
            </section>

            <section>
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Cited source
              </p>
              <p className="text-ink-2 mt-1 text-sm font-medium">
                {current.source_title}
                {current.source_year ? ` (${current.source_year})` : ''}
              </p>
              <ScrollArea className="border-hairline bg-sunken mt-1 max-h-56 rounded-md border p-2">
                <p className="text-ink-2 text-sm leading-relaxed">
                  {current.source_abstract || 'This source has no abstract.'}
                </p>
              </ScrollArea>
            </section>

            <fieldset className="space-y-2">
              <legend className="text-ink-1 text-sm font-medium">
                Does this abstract support the claim above?
              </legend>
              <div className="grid gap-2 md:grid-cols-3">
                {CHOICES.map((c) => (
                  <Button
                    key={c.label}
                    variant="outline"
                    size="lg"
                    className="h-auto cursor-pointer flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                    disabled={record.isPending}
                    onClick={() =>
                      record.mutate(
                        {
                          cardSourceId: current.card_source_id,
                          label: c.label,
                        },
                        {
                          onSuccess: () => {
                            // Deliberately **no** "matched / did not match the machine" feedback:
                            // saying so would break blindness for this rater's remaining pairs.
                            setJustSaved(true);
                            window.setTimeout(() => setJustSaved(false), 1200);
                          },
                        },
                      )
                    }
                  >
                    <span className="text-sm font-medium">{c.text}</span>
                    <span className="text-ink-3 text-xs font-normal">
                      {c.hint}
                    </span>
                  </Button>
                ))}
              </div>
              {justSaved && (
                <p className="text-ok-strong text-xs">Your label has been recorded.</p>
              )}
            </fieldset>
          </div>
        </Panel>
      )}
    </div>
  );
}
