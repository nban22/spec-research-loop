'use client';

import { ClipboardList, Lightbulb, ListChecks, MessageCircleQuestion } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HintBox } from '@/components/hint-box';
import { IdeaInput, TopicChipList } from '@/components/idea-input';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { ConceptMap, ViewToggle } from '@/components/concept-map';
import { CardBoard } from '@/components/spec-cards';
import { CardSkeleton, EmptyState } from '@/components/states';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import { CONFIDENCE_STYLE } from '@/lib/status-style';
import {
  useAnswerDecision,
  useCards,
  useJobAction,
  usePendingDecisions,
  useProject,
} from '@/lib/use-project';

/**
 * **S1 · Idea intake & clarification** — the screen map lives in DESIGN_SYSTEM §5.4.
 *
 * Column 1 `IdeaInput` + `TopicChipList` · Column 2 `ParaphraseCard` → `KeyProblemList` →
 * the confidence `HintBox` → **`CardBoard`** · Column 3 the clarifying questions.
 *
 * `CardBoard` sits in the middle column, **below** the paraphrase — not split into its own step,
 * because ARCHITECTURE §4 already merged the brief's steps 1–2 into S1 (§5.4 #1).
 */
export function Step1({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: detail, isLoading } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;
  const { data: cardData } = useCards(versionId);
  const { data: pendingData } = usePendingDecisions(projectId);
  const job = useJobAction(projectId);
  const answer = useAnswerDecision(projectId);
  /* The map is the default — the brief suggests answering "did I understand you?" with a picture,
     and the read-the-text path stays available on the second tab rather than being replaced (#14). */
  const [view, setView] = useState<'map' | 'board'>('map');
  const reduced = useReducedMotion();

  const meta = detail?.currentVersion?.meta ?? null;
  const cards = cardData?.cards ?? [];
  const pending = (pendingData?.decisions ?? []).filter((d) => d.step === 'S1');
  const analyzed = cards.length > 0;

  const context = (
    <>
      <Panel accent="brand" icon={Lightbulb} title="The original idea">
        <IdeaInput
          value={detail?.project.raw_idea}
          variant="inline"
          analyzing={job.busy}
          onAnalyze={() => job.run(`/projects/${projectId}/analyze`)}
        />
        {meta?.topics && meta.topics.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-ink-3 text-xs font-medium">Topics the system inferred</p>
            <TopicChipList topics={meta.topics} />
          </div>
        )}
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : !analyzed ? (
        <EmptyState
          icon={Lightbulb}
          tone="brand"
          title="The idea has not been analysed yet"
          description="Press “Analyse idea” in the left column. The system will paraphrase the idea back, point out the key problems, and decompose it into cards for you to confirm."
        />
      ) : (
        <>
          {/* ParaphraseCard — feature 2, the "How the system reads your idea" panel */}
          <Panel accent="ok" icon={ClipboardList} title="How the system reads your idea">
            <p className="bg-ok-soft text-ink-1 rounded-md px-3 py-2.5 text-sm leading-relaxed">
              {meta?.paraphrase_en}
            </p>
            {meta?.confidence && (
              <HintBox
                tone={CONFIDENCE_STYLE[meta.confidence].tone}
                title={`Confidence: ${CONFIDENCE_STYLE[meta.confidence].label}`}
              >
                {CONFIDENCE_STYLE[meta.confidence].hint}
              </HintBox>
            )}
          </Panel>

          {meta?.key_problems && meta.key_problems.length > 0 && (
            <Panel accent="neutral" icon={ListChecks} title="Key problems">
              {/* The `warn` family, NOT the mockup's orange — orange belongs to Severity (§8 #5) */}
              <ul className="space-y-1.5">
                {meta.key_problems.map((p, i) => (
                  <li key={i} className="text-ink-2 flex gap-2 text-sm">
                    <span className="bg-warn-ink mt-1.5 size-1.5 shrink-0 rounded-full" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            accent="neutral"
            icon={ClipboardList}
            title="Decomposition board — 8 types × 6 statuses"
            action={<ViewToggle view={view} onChange={setView} />}
          >
            {/* Two views of **the same set of cards**, so switching between them must feel
                continuous rather than like a content swap. `mode="wait"` keeps the height from
                jumping: the map and the board have very different heights. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {view === 'map' ? (
                  <ConceptMap projectId={projectId} meta={meta} cards={cards} />
                ) : (
                  <CardBoard cards={cards} />
                )}
              </motion.div>
            </AnimatePresence>
          </Panel>
        </>
      )}
    </>
  );

  const decide =
    pending.length > 0 ? (
      <Panel accent="decide" icon={MessageCircleQuestion} title="Clarifying questions">
        <div className="space-y-5">
          {pending.map((d) => (
            <OptionList
              key={d.id}
              question={d.question}
              options={d.options}
              variant="compact"
              submitting={answer.isPending}
              onSubmit={(chosenKey, customText) =>
                answer.mutate({
                  decision_id: d.id,
                  chosen_key: chosenKey,
                  custom_text: customText,
                })
              }
            />
          ))}
        </div>
      </Panel>
    ) : analyzed ? (
      <Panel accent="ok" icon={ListChecks} title="All questions answered">
        <HintBox tone="ok">
          You have confirmed how the system reads your idea. Move to step 2 to search for real literature.
        </HintBox>
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}/step/2`)}
          className="bg-brand-ink w-full cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium text-white"
        >
          Go to the next step
        </button>
      </Panel>
    ) : undefined;

  return (
    <WizardShell
      preset="balanced"
      contextTitle="The original idea"
      /* S1: NOT collapsed — `IdeaInput` is the primary action of this step (§6.9). */
      contextDefaultOpen
      context={context}
      content={content}
      decide={decide}
      decideCount={pending.length}
      decideSummary={
        pending.length > 0 ? `Waiting on you: ${pending.length} questions` : undefined
      }
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Enter idea', 'Clarify', 'Confirm', 'Next step']}
          activeIndex={!analyzed ? 0 : pending.length > 0 ? 1 : 2}
          hint="No step confirms itself — the system only moves on once you say so."
        />
      }
    />
  );
}
