'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ListChecks, Route, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConflictPanel } from '@/components/conflict-panel';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { ExportBar, HowItWorksList, SpecChecklist } from '@/components/spec-views';
import { SupportTag } from '@/components/support-tag';
import { WizardShell } from '@/components/wizard-shell';
import { ApiError, api, apiUrl } from '@/lib/api';
import {
  useApplyDecision,
  useGate,
  useGateDecision,
  useGateOptions,
  useJobAction,
  useProject,
  useSections,
  useVerification,
  type PreviewPayload,
} from '@/lib/use-project';

const HOW_IT_WORKS = [
  'Paraphrased your raw idea back and decomposed it into cards of 8 types, each carrying a status.',
  'Found real literature on Semantic Scholar and OpenAlex, and only then let the model read the abstracts to build the related-work table.',
  'Extracted a research gap answering all four questions, generated five-field claim-evidence pairs and an experiment plan.',
  'Put it through 5 independent judges, merged their findings, and let you decide every change before a new version was created.',
];

/**
 * **S5 · Final spec & publish** — the *two-column* preset, **with no separate decision column**.
 * This step acts through `ExportBar`, so on mobile `ExportBar` becomes the bottom-pinned bar in
 * place of `DecisionSheet` (DESIGN_SYSTEM §6.4).
 */
export function Step5({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;

  const { data: sectionData } = useSections(versionId);
  const { data: gate } = useGate(versionId);
  const { data: verification } = useVerification(versionId);
  const job = useJobAction(projectId);
  const [exporting, setExporting] = useState<'MD' | 'PDF' | null>(null);

  const gateDecision = useGateDecision(projectId);
  const applyDecision = useApplyDecision(projectId);
  const [gatePreview, setGatePreview] = useState<PreviewPayload | null>(null);
  const [gateDecisionId, setGateDecisionId] = useState<string | null>(null);
  const [deferred, setDeferred] = useState<string[]>([]);

  const sections = sectionData?.sections ?? [];
  const summary = verification?.summary;
  const blocked = gate?.blocked ?? false;

  const blockedReason =
    gate?.reason === 'NOT_VERIFIED'
      ? 'This version has not been through evidence verification. Run it before publishing.'
      : gate?.reason === 'UNSUPPORTED_CITATION'
        ? `${gate.offenders.length} citations are still unsupported by their sources. Resolve them in the block below.`
        : undefined;

  /**
   * Handled **one pair at a time**: each choice may create a new version, invalidating the old list.
   *
   * `deferred` holds the pairs where the user chose "I will look for another source" — that option
   * **changes no data**, so without dropping them from the queue the panel would pin forever on
   * the first pair and the rest would never get a turn.
   */
  const offenders = gate?.reason === 'UNSUPPORTED_CITATION' ? gate.offenders : [];
  const queue = offenders.filter((o) => !deferred.includes(o.card_source_id));
  const offender = queue[0] ?? null;
  const { data: gateOptions } = useGateOptions(offender?.card_source_id);

  const doExport = async (format: 'MD' | 'PDF') => {
    if (!versionId) return;
    setExporting(format);
    try {
      const res = await api.post<{ artifactId: string; filename: string }>(
        `/spec-versions/${versionId}/export?format=${format.toLowerCase()}`,
      );
      // Download via an <a download> tag: the httpOnly cookie still rides along and the SPA stays put.
      const a = document.createElement('a');
      a.href = apiUrl(`/spec-versions/${versionId}/export/${res.artifactId}`);
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Exported successfully: ${res.filename}.`);
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The file could not be exported. Please try again.',
      );
    } finally {
      setExporting(null);
    }
  };

  const context = (
    <>
      <Panel accent="brand" icon={ListChecks} title="Research specification — 14 sections">
        <SpecChecklist sections={sections} />
      </Panel>
      <Panel accent="neutral" icon={ShieldCheck} title="Evidence verification results">
        {summary ? (
          <div className="space-y-2">
            {(['SUPPORTED', 'WEAK', 'UNSUPPORTED'] as const).map((label) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <SupportTag label={label} />
                <span className="text-ink-1 text-sm font-semibold tabular-nums">
                  {summary[label]}
                </span>
              </div>
            ))}
            {/*
              Only shown while unverified pairs remain. The three rows above no longer count them,
              so without this line their sum would be smaller than the real pair count with no
              explanation anywhere.
            */}
            {(verification?.unverified ?? 0) > 0 && (
              <div className="flex items-center justify-between gap-2">
                <SupportTag label="WEAK" verified={false} />
                <span className="text-ink-1 text-sm font-semibold tabular-nums">
                  {verification?.unverified}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-ink-3 text-xs">No evidence verification results yet.</p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={job.busy}
          onClick={() => job.run(`/spec-versions/${versionId}/verify`)}
        >
          Re-run evidence verification
        </Button>
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel accent="ok" icon={Route} title="How the system arrived at this spec">
        <HowItWorksList steps={HOW_IT_WORKS} />
      </Panel>

      {/*
        When the verifier gate blocks, there must be a **way out right here**, not a sentence
        telling the user to walk back to step 4 (ARCHITECTURE §6.6: four options A/B/C/Other, each
        recorded as a `Decision`). This is where the gate stops being a sign and becomes a mechanism.
      */}
      {offender && (
        <Panel accent="decide" icon={ShieldAlert} title="Citations unsupported by their sources">
          <p className="text-ink-2 text-xs">
            <span className="font-semibold">{queue.length}</span>/{offenders.length} pairs still
            need resolving. Currently on: the claim{' '}
            <span className="font-medium">“{offender.card_title}”</span> citing{' '}
            <span className="font-medium">“{offender.source_title}”</span>.
          </p>

          {gatePreview ? (
            <div className="space-y-3">
              <HintBox tone="info" title="The draft is ready">
                {gatePreview.summary}
              </HintBox>
              <Button
                className="w-full"
                size="lg"
                disabled={applyDecision.isPending || !gateDecisionId}
                onClick={() =>
                  gateDecisionId &&
                  applyDecision.mutate(gateDecisionId, {
                    onSuccess: (res) => {
                      setGatePreview(null);
                      setGateDecisionId(null);
                      if (res.verifyJobId) job.attach(res.verifyJobId);
                    },
                  })
                }
              >
                {applyDecision.isPending ? 'Creating…' : 'Confirm & create a new version'}
              </Button>
            </div>
          ) : (
            <OptionList
              /*
                `key` follows the pair being handled: `OptionList` keeps the selection and the
                reason box in local state. Without a remount, after resolving pair #1 with "keep it
                + a reason", pair #2 appears with **that same old reason** pre-filled and the button
                enabled — one click and this pair's reason is attached to a different pair.
              */
              key={offender.card_source_id}
              question={gateOptions?.question ?? 'How do you want to handle this?'}
              options={gateOptions?.options ?? []}
              variant="stacked"
              disabled={!gateOptions}
              submitting={gateDecision.isPending}
              submitLabel="Confirm how to handle it"
              onSubmit={(chosenKey, customText) =>
                gateDecision.mutate(
                  { cardSourceId: offender.card_source_id, chosenKey, customText },
                  {
                    onSuccess: (res) => {
                      // `A` and `Other` do not change the spec ⇒ there is no draft to diff.
                      setGateDecisionId(res.preview ? res.decision.id : null);
                      setGatePreview(res.preview);
                      if (res.preview) return;
                      if (chosenKey === 'A') {
                        // Nothing in the data changed ⇒ drop this pair from the queue ourselves,
                        // otherwise the panel would stay pinned here forever.
                        setDeferred((d) => [...d, offender.card_source_id]);
                        toast.info(
                          'Recorded. This citation still blocks publishing until you find another source at step 2.',
                        );
                        return;
                      }
                      toast.success(
                        'Your reason has been recorded. The citation is kept and will be marked in the exported file.',
                      );
                    },
                  },
                )
              }
            />
          )}
        </Panel>
      )}

      {/* Once everything is deferred, say what is being waited on — never leave the user at a blind gate. */}
      {!offender && offenders.length > 0 && (
        <HintBox tone="warn" title="Waiting for you to find other sources">
          <p>
            {offenders.length} citations still block publishing. Go to step 2 to find other sources
            for those claims, or choose a different resolution.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setDeferred([])}
          >
            Revisit the deferred citations
          </Button>
        </HintBox>
      )}

      {/* Lane A · #3 — the source conflict queue. Hides itself when there are no conflicts. */}
      <ConflictPanel projectId={projectId} versionId={versionId} />

      <Panel accent="neutral" icon={CheckCircle2} title="Publish">
        {/* Hidden on mobile: ExportBar already lives in the bottom-pinned bar */}
        <div className="hidden md:block">
          <ExportBar
            blocked={blocked}
            blockedReason={blockedReason}
            exporting={exporting}
            onExport={doExport}
            onBackToEdit={() => router.push(`/projects/${projectId}/step/4`)}
          />
        </div>
        <p className="text-ink-3 md:hidden text-xs">
          The export buttons are in the bar at the bottom of the screen.
        </p>
      </Panel>

      {!blocked && (
        <HintBox tone="ok" title="The spec is ready">
          This specification has been through evidence verification and is ready for implementation
          or for writing a proposal.
        </HintBox>
      )}
    </>
  );

  return (
    <WizardShell
      preset="two-column"
      contextTitle="The 14-section checklist"
      contextDefaultOpen
      context={context}
      content={content}
      bottomBar={
        <div className="border-hairline bg-surface shadow-sheet pb-safe fixed inset-x-0 bottom-0 z-30 border-t px-3 py-2.5 md:hidden">
          <ExportBar
            blocked={blocked}
            blockedReason={blockedReason}
            exporting={exporting}
            onExport={doExport}
            onBackToEdit={() => router.push(`/projects/${projectId}/step/4`)}
          />
        </div>
      }
    />
  );
}
