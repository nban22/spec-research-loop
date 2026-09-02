'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BookMarked, Filter, Search, Telescope } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HintBox } from '@/components/hint-box';
import { JobProgress } from '@/components/job-progress';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import { SpecCard } from '@/components/spec-cards';
import { KeywordChipInput, RelatedWorkTable, SourceFilterList } from '@/components/sources';
import { EmptyState, TableSkeleton } from '@/components/states';
import { SummaryBar } from '@/components/summary-bar';
import { WizardShell } from '@/components/wizard-shell';
import {
  useAnswerDecision,
  useCredibility,
  useCards,
  useJobAction,
  usePendingDecisions,
  useProject,
  useSources,
  useRelatedWork,
} from '@/lib/use-project';

const FILTERS = [
  { key: 'peer', label: 'Has a venue (peer-reviewed)' },
  { key: 'doi', label: 'Has a DOI' },
  { key: 'recent', label: '2020 or newer' },
  { key: 'abstract', label: 'Has an abstract to check against' },
  // Lane A · #1 — only meaningful when the `source_credibility` flag is on; filtered out below if off.
  { key: 'trusted', label: 'Trusted sources only' },
];

/**
 * **S2 · Related work & research gap** (DESIGN_SYSTEM §5.4, the *wide-middle* preset).
 *
 * The order — **find real sources first, call the LLM second** — is the whole design of this step
 * (C1 · F.6): the related-work table is filled **from the papers already in the store**, never from
 * the model's memory.
 */
export function Step2({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: detail } = useProject(projectId);
  const versionId = detail?.currentVersion?.id;
  const { data: sourceData, isLoading: loadingSources } = useSources(projectId);
  const { data: cardData } = useCards(versionId);
  const { data: pendingData } = usePendingDecisions(projectId);
  const { data: relatedWorkData } = useRelatedWork(versionId);
  const job = useJobAction(projectId);
  const answer = useAnswerDecision(projectId);

  const [active, setActive] = useState<string[]>([]);
  const [sortByTrust, setSortByTrust] = useState(false);
  /* The default keywords are derived from meta **during render**; state holds only what the user
     edited, so no setState in an effect (which would cascade renders). */
  const [editedKeywords, setEditedKeywords] = useState<string[] | null>(null);
  const keywords =
    editedKeywords ?? (detail?.currentVersion?.meta?.search_keywords ?? []).slice(0, 4);
  const setKeywords = setEditedKeywords;

  const { data: credibility } = useCredibility(projectId);
  const credOn = credibility?.enabled ?? false;
  const tierOf = new Map(
    (credibility?.sources ?? []).map((c) => [c.source_id, c]),
  );
  /** Flag off ⇒ hide the filter entirely, rather than leaving a checkbox that does nothing. */
  const filters = credOn ? FILTERS : FILTERS.filter((f) => f.key !== 'trusted');

  const allSources = sourceData?.sources ?? [];
  const sources = allSources.filter((s) => {
    if (active.includes('peer') && !s.venue) return false;
    if (active.includes('doi') && !s.doi) return false;
    if (active.includes('recent') && (s.year ?? 0) < 2020) return false;
    if (active.includes('abstract') && !s.abstract) return false;
    if (active.includes('trusted') && tierOf.get(s.id)?.tier === 'REVIEW')
      return false;
    return true;
  });

  /* The backend returns them by descending citation count. When credibility scores exist we
     re-sort on the client — a heavily cited source with no DOI and no venue still belongs lower. */
  if (credOn && sortByTrust) {
    sources.sort(
      (a, b) => (tierOf.get(b.id)?.total ?? 0) - (tierOf.get(a.id)?.total ?? 0),
    );
  }

  const gaps = (cardData?.cards ?? []).filter((c) => c.type === 'GAP');
  const pending = (pendingData?.decisions ?? []).filter((d) => d.step === 'S2');
  
  const relatedRows = relatedWorkData?.length
    ? relatedWorkData
    : sources.slice(0, 12).map((s) => ({
        id: s.id,
        source: s,
        what_done: s.abstract?.slice(0, 220) ?? 'The provider returned no abstract.',
        feedback_type: s.venue ? 'Published' : 'Preprint',
        what_missing: '—',
      }));

  const context = (
    <>
      <Panel accent="brand" icon={Search} title="Source-search keywords">
        <KeywordChipInput keywords={keywords} onChange={setKeywords} />
        <Button
          className="w-full"
          size="lg"
          disabled={keywords.length === 0 || job.busy}
          onClick={() =>
            job.run(`/projects/${projectId}/sources/search`, { queries: keywords.slice(0, 6) })
          }
        >
          <Search className="size-4" aria-hidden />
          {job.busy ? 'Searching…' : 'Search for real sources'}
        </Button>
        <HintBox tone="info">
          Sources come only from Semantic Scholar and OpenAlex. The system is never allowed to
          invent a paper — if both providers fail, this step stops.
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={Filter} title="Preferred sources">
        <SourceFilterList
          filters={filters.map((f) => ({ ...f, checked: active.includes(f.key) }))}
          onToggle={(key) =>
            setActive((prev) =>
              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
            )
          }
        />
        <p className="text-ink-3 text-xs">
          Showing {sources.length}/{allSources.length} sources
        </p>
        {credOn && (
          <Button
            variant="outline"
            size="sm"
            className="w-full cursor-pointer"
            aria-pressed={sortByTrust}
            onClick={() => setSortByTrust((v) => !v)}
          >
            {sortByTrust ? 'Sorted by credibility' : 'Sort by credibility'}
          </Button>
        )}
        {credOn && (credibility?.low_credibility_cards.length ?? 0) > 0 && (
          <HintBox tone="warn" title="Some claims rest on weak sources only">
            <p>
              The cards below are backed <strong>entirely</strong> by sources in the needs-review
              tier. Find a stronger source for them before moving on:
            </p>
            <ul className="mt-1 space-y-0.5">
              {credibility?.low_credibility_cards.map((c) => (
                <li key={c.card_id}>· {c.title}</li>
              ))}
            </ul>
          </HintBox>
        )}
      </Panel>
    </>
  );

  const content = (
    <>
      <JobProgress view={job.view} onReload={job.reload} />

      <Panel accent="ok" icon={BookMarked} title="Related-work table">
        {loadingSources ? (
          <TableSkeleton rows={4} cols={5} />
        ) : allSources.length === 0 ? (
          <EmptyState
            icon={Search}
            tone="brand"
            title="No source search has run yet"
            description="Edit the keywords on the left and press “Search for real sources”. Every paper retrieved is stored with the verbatim API response, as proof it exists."
          />
        ) : (
          <>
            <RelatedWorkTable rows={relatedRows} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={job.busy}
                onClick={() => job.run(`/projects/${projectId}/related-work`)}
              >
                Build the table’s comments
              </Button>
              <Button
                size="sm"
                disabled={job.busy}
                onClick={() => job.run(`/projects/${projectId}/gap`)}
              >
                Extract the research gap
              </Button>
            </div>
          </>
        )}
      </Panel>
    </>
  );

  const decide = (
    <>
      <Panel accent="decide" icon={Telescope} title="Research gap">
        {gaps.length === 0 ? (
          <p className="text-ink-3 text-xs">
            No gap yet. Once the sources are in, press “Extract the research gap”. Every gap must
            answer all four questions from the brief, and “I have not seen a similar paper” is
            never an acceptable justification.
          </p>
        ) : (
          <div className="space-y-2">
            {gaps.map((g) => (
              <SpecCard key={g.id} card={g} />
            ))}
          </div>
        )}
      </Panel>

      {pending.length > 0 && (
        <Panel accent="decide" icon={Telescope} title="Choose a direction to focus on">
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
        </Panel>
      )}

      {gaps.length > 0 && pending.length === 0 && (
        <Panel accent="ok" title="Direction chosen">
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
              router.push(`/projects/${projectId}/step/3`);
            }}
          >
            Go to the next step
          </Button>
        </Panel>
      )}
    </>
  );

  return (
    <WizardShell
      preset="wide-middle"
      contextTitle="Keywords & preferred sources"
      context={context}
      content={content}
      decide={decide}
      decideCount={pending.length}
      decideSummary={pending.length > 0 ? 'Choose a research direction' : undefined}
      summaryBar={
        <SummaryBar
          round={1}
          nodes={['Find sources', 'Related work', 'Extract gap', 'Confirm']}
          activeIndex={
            allSources.length === 0 ? 0 : gaps.length === 0 ? 1 : pending.length > 0 ? 2 : 3
          }
          hint="Every statement must be traceable to a specific source."
        />
      }
    />
  );
}
