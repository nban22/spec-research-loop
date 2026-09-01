'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Gavel, ListChecks, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { ConsensusMeter, IssueTable, JudgePanel, type JudgeState } from '@/components/judge';
import { OptionList } from '@/components/option-list';
import { JudgeAgreementPanel } from '@/components/judge-agreement-panel';
import { OverclaimPanel } from '@/components/overclaim-panel';
import { Panel } from '@/components/panel';
import { SpecOutline } from '@/components/spec-views';
import { EmptyState, JudgePanelSkeleton } from '@/components/states';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import { ApiError, api, qk } from '@/lib/api';
import { MAX_JUDGE_ROUNDS, type ApiIssueGroup, type ApiOption, type JudgeKey } from '@/lib/types';
import {
  useApplyDecision,
  useIssueGroups,
  useJobAction,
  useJudgeRuns,
  useProject,
  useSections,
  useSources,
  type PreviewPayload,
} from '@/lib/use-project';

/**
 * **S4 · Independent judges & spec fixes** (the *wide-middle* preset).
 *
 * The loop of step 10 in the brief: judges raise issues → the system offers A/B/C/Other →
 * the user chooses → the spec is edited → **the diff is shown** → confirmation → a new version.
 * Four checkpoints, with no shortcut past any of them (ARCHITECTURE §1.2).
 */
export function Step4({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;

  const { data: sectionData } = useSections(versionId);
  const { data: groupData } = useIssueGroups(versionId);
  const { data: runData } = useJudgeRuns(versionId);
  /* Same `queryKey` as S2, so it comes from cache — no extra round trip. Used to resolve the
     shortened `source_id` judges write inside `reason`. */
  const { data: sourceData } = useSources(projectId);
  const job = useJobAction(projectId);
  const applyDecision = useApplyDecision(projectId);

  const [active, setActive] = useState<ApiIssueGroup | null>(null);
  const [options, setOptions] = useState<{ question: string; options: ApiOption[] } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const skipStep = useMutation({
    mutationFn: () => api.patch(`/projects/${projectId}`, { step: 'S5' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      router.push(`/projects/${projectId}/step/5`);
    },
  });

  const groups = groupData?.groups ?? [];
  const runs = runData?.runs ?? [];
  /**
   * Counted per **project**, not per version: `judge_round` resets on every new version, so using
   * it would make the "at most 3 rounds per project" label below a lie.
   */
  const roundsTotal = detail?.project.judge_rounds_total ?? 0;
  const roundsExhausted = roundsTotal >= MAX_JUDGE_ROUNDS;
  const hasJudged = runs.length > 0;

  const judgeStates = judgeStatesFrom(runs, job.view.isRunning);
  const completed = runs.filter((r) => r.status === 'OK').length;
  const failedKeys = runs.filter((r) => r.status === 'FAILED').map((r) => r.judge_key);

  /**
   * `POST /issue-groups/:id/options` returns `options[]` **directly**, without opening a job — a
   * single ~10s call with the user waiting right there (SYSTEM_DESIGN_ANALYSIS §4.4 #1).
   */
  const pickIssue = async (g: ApiIssueGroup) => {
    setActive(g);
    setOptions(null);
    setPreview(null);
    setDecisionId(null);
    setLoadingOptions(true);
    try {
      const res = await api.post<{ question: string; options: ApiOption[] }>(
        `/issue-groups/${g.id}/options`,
      );
      setOptions(res);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The options could not be generated. Please try again.',
      );
    } finally {
      setLoadingOptions(false);
    }
  };

  const submitChoice = async (chosenKey: string, customText: string | null) => {
    if (!active || !options || !versionId) return;
    setLoadingOptions(true);
    try {
      const res = await api.post<{
        decision: { id: string };
        preview: PreviewPayload | null;
      }>('/decisions', {
        project_id: projectId,
        spec_version_id: versionId,
        step: 'S4',
        issue_group_id: active.id,
        question: options.question,
        options: options.options,
        chosen_key: chosenKey,
        custom_text: customText,
      });
      setDecisionId(res.decision.id);
      setPreview(res.preview);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Your choice could not be saved. Please try again.',
      );
    } finally {
      setLoadingOptions(false);
    }
  };

  const context = (
    <Panel accent="brand" icon={FileText} title="Working spec">
      {sectionData ? (
        <>
          <SpecOutline sections={sectionData.sections} />
          <p className="text-ink-3 text-xs">
            {sectionData.completeness}/14 sections have content
          </p>
        </>
      ) : (
        <p className="text-ink-3 text-xs">Building the working spec…</p>
      )}
    </Panel>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel
        accent="ok"
        icon={Gavel}
        title="The judge panel"
        action={
          <Button
            size="sm"
            disabled={job.busy || roundsExhausted}
            onClick={() => job.run(`/spec-versions/${versionId}/judge`)}
          >
            {roundsTotal === 0 ? 'Run the judges' : `Run round ${roundsTotal + 1}`}
          </Button>
        }
      >
        {runData ? <JudgePanel states={judgeStates} /> : <JudgePanelSkeleton />}
        {roundsExhausted && (
          <HintBox tone="warn">
            All {MAX_JUDGE_ROUNDS} judge rounds for this project have been used.
          </HintBox>
        )}
      </Panel>

      <Panel accent="neutral" icon={ListChecks} title="Issue roll-up">
        {!hasJudged ? (
          <EmptyState
            icon={Gavel}
            tone="decide"
            title="No judge round has run yet"
            description="Press “Run the judges” above. The 5 judges score independently, each with a clean context — none of them ever sees another judge's comments."
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            tone="ok"
            title="No issues were raised"
            description="None of the 5 judges found a defect worth reporting. You can move on to finalising the spec."
          />
        ) : (
          <>
            <ConsensusMeter
              agreement={Math.max(0, ...groups.map((g) => g.agreement_count))}
              completed={completed}
              failedKeys={failedKeys}
            />
            <IssueTable
              groups={groups}
              sources={sourceData?.sources ?? []}
              onPick={pickIssue}
              activeId={active?.id}
            />
          </>
        )}
      </Panel>

      {/* Lane B · #9 — the *disagreement* half of feature 13; the panel is self-contained, so the
          diff in this file is a single line. */}
      <JudgeAgreementPanel versionId={versionId} />

      {/* Lane B · #7 — overclaim flags sit beside the issue table rather than inside it: they come
          from a different mechanism (rules + a grey zone) and have their own three exits from Step 10. */}
      <OverclaimPanel versionId={versionId} />

      {/* Independence evidence read straight from the data — an evidence endpoint, not a debug one. */}
      {hasJudged && (
        <Panel accent="neutral" icon={ShieldCheck} title="Proof the judges ran independently">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-3 text-left">
                  <th className="py-1 pr-2">Judge</th>
                  <th className="py-1 pr-2">Model</th>
                  <th className="py-1 pr-2">input_digest</th>
                  <th className="py-1 pr-2">sha(raw_output)</th>
                  <th className="py-1">Started</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {runs.map((r) => (
                  <tr key={r.id} className="border-hairline border-t">
                    <td className="py-1 pr-2">{r.judge_key}</td>
                    <td className="text-ink-3 py-1 pr-2">{r.model}</td>
                    <td className="text-ok-strong py-1 pr-2">
                      {r.input_digest.slice(0, 10)}
                    </td>
                    <td className="text-brand-strong py-1 pr-2">
                      {r.raw_output_sha256.slice(0, 10)}
                    </td>
                    <td className="text-ink-3 py-1">
                      {new Date(r.started_at).toISOString().slice(11, 23)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-3 text-xs">
            The same <span className="text-ok-strong font-medium">input_digest</span> ⇒ all 5 judges
            received exactly one input. Different{' '}
            <span className="text-brand-strong font-medium">sha(raw_output)</span> ⇒ they scored
            independently and did not copy each other.
          </p>
        </Panel>
      )}
    </>
  );

  const decide = (
    <Panel accent="decide" icon={Gavel} title="Decisions waiting on you">
      {!active ? (
        <p className="text-ink-3 text-xs">
          Pick an issue from the table on the left to see the ways to handle it. The system never
          edits anything on its own — the final call is yours.
        </p>
      ) : loadingOptions && !options ? (
        <p className="text-ink-3 text-xs">Generating options for this issue…</p>
      ) : preview ? (
        <div className="space-y-3">
          <HintBox tone="info" title="The draft is ready">
            {preview.summary}
          </HintBox>
          <ul className="space-y-2">
            {preview.changes.map((c, i) => (
              <li key={i} className="border-hairline bg-sunken rounded-md border px-2.5 py-2">
                <p className="text-ink-1 text-xs font-medium">
                  {c.operation} · {c.target_card_title || c.new_title}
                </p>
                <p className="text-ink-2 text-xs">{c.rationale}</p>
              </li>
            ))}
          </ul>
          <ConfirmApply
            decisionId={decisionId}
            pending={applyDecision.isPending}
            onConfirm={(id) =>
              applyDecision.mutate(id, {
                onSuccess: (res) => {
                  setActive(null);
                  setOptions(null);
                  setPreview(null);
                  // Attach to the evidence re-check job the backend just opened, so the progress
                  // bar appears right here at step 4 — exactly what the confirm dialog promised.
                  if (res.verifyJobId) job.attach(res.verifyJobId);
                  void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
                },
              })
            }
          />
        </div>
      ) : options ? (
        <OptionList
          question={options.question}
          options={options.options}
          variant="stacked"
          submitting={loadingOptions}
          submitLabel="Preview the changes"
          onSubmit={submitChoice}
        />
      ) : null}

      {hasJudged && groups.length === 0 && (
        <Button
          className="mt-2 w-full"
          size="lg"
          disabled={skipStep.isPending}
          onClick={() => skipStep.mutate()}
        >
          Move on to finalising the spec
        </Button>
      )}
      {hasJudged && groups.length > 0 && (
        <Button
          className="mt-2 w-full"
          size="lg"
          variant="outline"
          disabled={skipStep.isPending}
          onClick={() => skipStep.mutate()}
        >
          Good enough for me — finalise the spec
        </Button>
      )}
    </Panel>
  );

  return (
    <WizardShell
      preset="wide-middle"
      contextTitle="Working spec"
      context={context}
      content={content}
      decide={decide}
      decideCount={groups.filter((g) => g.status === 'OPEN').length}
      decideSummary={
        active ? 'Working on one issue' : `Waiting on you: ${groups.length} issues`
      }
      summaryBar={
        <SummaryBar
          round={Math.max(1, roundsTotal)}
          nodes={['Independent judges', 'Choose a fix', 'Review diff', 'Confirm', 'Done']}
          activeIndex={!hasJudged ? 0 : !options ? 1 : !preview ? 2 : 3}
          hint={`At most ${MAX_JUDGE_ROUNDS} judge rounds per project.`}
        />
      }
    />
  );
}

/** The **mandatory** gate for every action that creates a new version (DESIGN_SYSTEM §5.3 `ConfirmDialog`). */
function ConfirmApply({
  decisionId,
  pending,
  onConfirm,
}: {
  decisionId: string | null;
  pending: boolean;
  onConfirm: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!decisionId) return null;
  return (
    <>
      <Button className="w-full" size="lg" onClick={() => setOpen(true)} disabled={pending}>
        Confirm &amp; create a new version
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new version?</DialogTitle>
            <DialogDescription>
              The current version is kept intact and is never overwritten — you can always compare
              the two. After applying, the system re-runs evidence verification over the parts that
              were just touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Later
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onConfirm(decisionId);
              }}
            >
              {pending ? 'Creating…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function judgeStatesFrom(
  runs: { judge_key: JudgeKey; status: 'OK' | 'FAILED' }[],
  running: boolean,
): Record<JudgeKey, JudgeState> {
  const keys: JudgeKey[] = ['J1', 'J2', 'J3', 'J4', 'J5'];
  const out = {} as Record<JudgeKey, JudgeState>;
  for (const k of keys) {
    const run = runs.find((r) => r.judge_key === k);
    out[k] = run ? (run.status === 'OK' ? 'done' : 'failed') : running ? 'running' : 'idle';
  }
  return out;
}
