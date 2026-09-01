'use client';

import { useQuery } from '@tanstack/react-query';
import { Beaker, Cpu, Gauge, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { SpecCard } from '@/components/spec-cards';
import { EmptyState, StatTileSkeleton } from '@/components/states';
import { EstimateRows, ExperimentPlanList, StatTileGrid } from '@/components/spec-views';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import { api } from '@/lib/api';
import type { ApiEstimate, ApiExperimentPlan } from '@/lib/types';
import { useAnswerDecision, useCards, useJobAction, useProject } from '@/lib/use-project';

/**
 * **S3 · Contribution & experiment plan** (the *balanced* preset).
 *
 * **[DECISION] diverges from mockup 3:** the mockup leaves the right column purely *informational*
 * (a feasibility check), so this step would offer the user nothing to decide — against NFR-G-3. A
 * compact decision block was added at the bottom of the right column: **approve the plan ·
 * downscale as suggested · Other** (DESIGN_SYSTEM §5.4 #2, §8 #11).
 */
export function Step3({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;
  const { data: cardData } = useCards(versionId);
  const job = useJobAction(projectId);
  const answer = useAnswerDecision(projectId);

  const cards = cardData?.cards ?? [];
  const contributions = cards.filter(
    (c) => c.type === 'CONTRIBUTION' && c.payload?.role !== 'proposed_approach',
  );
  const approach = cards.find(
    (c) => c.type === 'CONTRIBUTION' && c.payload?.role === 'proposed_approach',
  );
  const claims = cards.filter((c) => c.type === 'CLAIM');

  /**
   * The verifier runs at **step 5**, so every card-source pair just generated here is unscored.
   * `CardSource.support_label` defaults to `WEAK`, so left unsaid the whole board would look as
   * though the verifier read everything and could back none of it — a completely wrong conclusion.
   */
  const unverifiedPairs = cards
    .flatMap((c) => c.card_sources)
    .filter((cs) => cs.verifier_run_id === null).length;
  const hasPlan = detail?.currentVersion?.has_experiment_plan ?? false;
  const hasEstimate = detail?.currentVersion?.has_estimate ?? false;

  const { data: planData } = usePlanAndEstimate(versionId);
  const plan = planData?.plan ?? null;
  const estimate = planData?.estimate ? toApiEstimate(planData.estimate) : null;

  const context = (
    <>
      <Panel accent="brand" icon={Trophy} title="Intended contributions">
        {contributions.length === 0 ? (
          <p className="text-ink-3 text-xs">
            Not generated yet. Press “Generate contributions &amp; claims” in the middle column.
          </p>
        ) : (
          <>
            {approach && (
              <div className="border-brand-line bg-brand-soft rounded-md border px-3 py-2">
                <p className="text-brand-strong text-xs font-medium">Proposed approach</p>
                <p className="text-ink-1 text-xs">{approach.body}</p>
              </div>
            )}
            <ol className="space-y-2">
              {contributions.map((c) => (
                <SpecCard key={c.id} card={c} />
              ))}
            </ol>
          </>
        )}
      </Panel>

      <Panel accent="neutral" icon={Gauge} title="Claim – Evidence">
        {claims.length === 0 ? (
          <p className="text-ink-3 text-xs">No claims yet.</p>
        ) : (
          <div className="space-y-2">
            {unverifiedPairs > 0 && (
              <HintBox tone="info" title="These pairs have not been through evidence verification">
                <p>
                  {unverifiedPairs} claim-source pairs currently carry the{' '}
                  <strong>UNVERIFIED</strong> tag. Evidence verification runs at step 5; before
                  that, no label here is a conclusion of the system.
                </p>
              </HintBox>
            )}
            {claims.map((c) => (
              <SpecCard key={c.id} card={c} />
            ))}
          </div>
        )}
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel accent="ok" icon={Beaker} title="Experiment plan">
        {!hasPlan ? (
          <EmptyState
            icon={Beaker}
            tone="ok"
            title="No experiment plan yet"
            description="Generate the contributions and claim-evidence pairs first, then build the experiment plan. Every experiment must attach to at least one claim."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  size="sm"
                  disabled={job.busy}
                  onClick={() => job.run(`/projects/${projectId}/contributions`)}
                >
                  Generate contributions &amp; claims
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={job.busy || claims.length === 0}
                  onClick={() => job.run(`/projects/${projectId}/experiment-plan`)}
                >
                  Build the experiment plan
                </Button>
              </div>
            }
          />
        ) : plan ? (
          <ExperimentPlanList plan={plan} />
        ) : null}
      </Panel>
    </>
  );

  const decide = (
    <>
      <Panel accent="decide" icon={Cpu} title="Feasibility check">
        {estimate ? (
          <>
            <StatTileGrid
              items={[
                { label: 'Model', value: `${estimate.inputs.model_params_b}B` },
                { label: 'Quantisation', value: String(estimate.inputs.quantization) },
                { label: 'Candidates', value: String(estimate.inputs.candidates) },
                { label: 'Rounds', value: String(estimate.inputs.rounds) },
              ]}
            />
            <EstimateRows estimate={estimate} />
          </>
        ) : hasPlan ? (
          /* A plan without an estimate ⇒ phase 2 of the job is running: show the four-tile frame
             that is coming, not a sentence implying nothing is happening. */
          <StatTileSkeleton />
        ) : (
          <p className="text-ink-3 text-xs">
            The estimate appears once the experiment plan exists. It is pure arithmetic — no model
            call involved.
          </p>
        )}
      </Panel>

      {/* A decision block added over mockup 3 — without it this step would confirm itself. */}
      {hasEstimate && (
        <Panel accent="decide" icon={Beaker} title="Approve the plan">
          <OptionList
            question="How do you want to settle the experiment plan?"
            options={[
              {
                key: 'A',
                label: 'Approve the plan',
                explain: 'Keep the current scale and move on to the critique step.',
                example: 'Run exactly the candidate count and evaluation sample size estimated here.',
                recommended: estimate?.fits_rtx3090 ?? true,
              },
              {
                key: 'B',
                label: 'Downscale as suggested',
                explain: 'Apply the downscaling suggestions so it fits the available resources.',
                example:
                  estimate?.downscale_suggestion?.[0]?.reason ??
                  'Reduce the candidate count or lower the quantisation.',
                recommended: !(estimate?.fits_rtx3090 ?? true),
              },
            ]}
            variant="compact"
            submitting={answer.isPending}
            submitLabel="Settle the plan"
            onSubmit={(chosenKey, customText) =>
              answer.mutate(
                {
                  spec_version_id: versionId,
                  step: 'S3',
                  question: 'How do you want to settle the experiment plan?',
                  options: [
                    { key: 'A', label: 'Approve the plan', explain: '', example: '' },
                    { key: 'B', label: 'Downscale as suggested', explain: '', example: '' },
                  ],
                  chosen_key: chosenKey,
                  custom_text: customText,
                },
                { onSuccess: () => router.push(`/projects/${projectId}/step/4`) },
              )
            }
          />
          {estimate && !estimate.fits_rtx3090 && (
            <HintBox tone="warn">
              The current configuration exceeds an RTX 3090. Choose “Downscale as suggested” if you
              plan to run on a single card.
            </HintBox>
          )}
        </Panel>
      )}
    </>
  );

  return (
    <WizardShell
      preset="balanced"
      contextTitle="Contributions & claim-evidence"
      contextDefaultOpen
      context={context}
      content={content}
      decide={decide}
      decideCount={hasEstimate ? 1 : 0}
      decideSummary={hasEstimate ? 'Approve the experiment plan' : undefined}
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Contribution', 'Experiments', 'Estimate', 'Confirm']}
          activeIndex={claims.length === 0 ? 0 : !hasPlan ? 1 : !hasEstimate ? 2 : 3}
          hint="Every claim needs a refutation condition — the field most often forgotten."
        />
      }
    />
  );
}

/**
 * The experiment plan + the resource estimate of the current version.
 * One endpoint, one round trip — the two are always read together, so they are not split.
 */
function usePlanAndEstimate(versionId: string | undefined) {
  return useQuery({
    queryKey: ['spec-versions', versionId, 'plan'],
    queryFn: () =>
      api.get<{ plan: ApiExperimentPlan | null; estimate: StoredEstimate | null }>(
        `/spec-versions/${versionId}/plan`,
      ),
    enabled: Boolean(versionId),
  });
}

/** The `ResourceEstimate` DB record — the same numbers as `ApiEstimate` but without `breakdown`. */
type StoredEstimate = {
  inputs: Record<string, string | number>;
  vram_gb: number;
  hours_min: number;
  hours_max: number;
  tokens_est: number;
  cost_usd: number;
  fits_rtx3090: boolean;
  downscale_suggestion: ApiEstimate['downscale_suggestion'];
};

/** Rebuild the `ApiEstimate` shape so the same display component can be reused. */
function toApiEstimate(e: StoredEstimate): ApiEstimate {
  return {
    ...e,
    warn_near_limit: !e.fits_rtx3090 || e.vram_gb >= 20,
    breakdown: [],
  };
}
