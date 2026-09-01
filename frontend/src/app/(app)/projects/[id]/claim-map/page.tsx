'use client';

import { Network } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { ClaimEvidenceMap, type ClaimCard } from '@/components/claim-evidence-map';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { CardSkeleton, EmptyState } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { useDeleteCard, useLinkSource, useUnlinkSource } from '@/lib/use-card-link';
import { useCards, useProject, useSources } from '@/lib/use-project';

/**
 * **The drag-and-drop claim-evidence map** — issue #15 (lane C), the demo centrepiece.
 *
 * Its own page rather than folded into step 3: what happens here is **hand-editing the draft**, not
 * a step of the process. Same shape as `/map` (#16), `/simulate` (#18), `/cost` (#17).
 */
export default function ClaimMapPage({ params }: PageProps<'/projects/[id]/claim-map'>) {
  const { id } = use(params);
  const { data: detail, isLoading } = useProject(id);
  const versionId = detail?.currentVersion?.id;
  const { data: cardData } = useCards(versionId);
  const { data: sourceData } = useSources(id);

  const link = useLinkSource(versionId);
  const unlink = useUnlinkSource(versionId);
  const del = useDeleteCard(versionId);
  const busy = link.isPending || unlink.isPending || del.isPending;

  /* `CLAIM` only — a `CONTRIBUTION` is a promise about what will be contributed, not a statement
     needing a source. Mixing the two would make every contribution card look like a "dangling
     claim" when it is nothing of the sort. */
  const claims: ClaimCard[] = (cardData?.cards ?? []).filter((c) => c.type === 'CLAIM');
  const sources = sourceData?.sources ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (!versionId) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={Network}
          title="This project has no specification yet"
          description="Run step 1 to analyse the idea first, then come back here."
        />
      </div>
    );
  }

  const dangling = claims.filter((c) => c.card_sources.length === 0).length;
  const usedSources = new Set(claims.flatMap((c) => c.card_sources.map((cs) => cs.source.id)));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Claim-evidence map</h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Drag a source onto a claim to link it ·{' '}
          <Link
            href={`/projects/${id}/step/3`}
            className="text-brand-strong underline underline-offset-2"
          >
            back to step 3
          </Link>
        </p>
      </header>

      <Panel accent={dangling > 0 ? 'decide' : 'ok'} icon={Network} title="Status">
        <StatTileGrid
          items={[
            { label: 'Claims', value: String(claims.length) },
            { label: 'Dangling claims', value: String(dangling) },
            { label: 'Sources in use', value: `${usedSources.size}/${sources.length}` },
          ]}
        />
        <HintBox tone={dangling > 0 ? 'warn' : 'ok'}>
          {dangling > 0 ? (
            <>
              <strong>{dangling} claims have no source behind them</strong>. Those are exactly where
              the verifier will attach <code>UNSUPPORTED</code> and block publishing. Link sources
              to them first.
            </>
          ) : (
            <>
              Every claim has at least one source. The pairs you linked by hand are marked{' '}
              <strong>unverified</strong> — run verification at step 5 so the verifier scores them.
            </>
          )}
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={Network} title="Map">
        <ClaimEvidenceMap
          claims={claims}
          sources={sources}
          busy={busy}
          onLink={(cardId, sourceId) => link.mutate({ cardId, sourceId })}
          onUnlink={(cardSourceId) => unlink.mutate(cardSourceId)}
          onDeleteCard={(cardId) => del.mutate(cardId)}
        />
      </Panel>
    </div>
  );
}
