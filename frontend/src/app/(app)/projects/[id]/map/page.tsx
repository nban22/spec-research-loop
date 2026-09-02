'use client';

import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { SourceMapView, type SourceMapData } from '@/components/source-map';
import { CardSkeleton, EmptyState } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { api, qk } from '@/lib/api';

/**
 * **The source map** — issue #16 (lane C): the research timeline and the topic map.
 *
 * Its own page rather than folded into step 2, for two reasons: step 2's three columns are already
 * full, and this map is something you open to look at and then leave, not something you operate
 * inside the flow. Same shape as `/cost` (#17) and `/errors` (#19) — all three are **read-only**
 * screens hanging off the wizard.
 *
 * The citation graph is not here yet: it needs the `references` field that
 * `sources/source.client.ts` does not request, and that file is outside #16's editable scope. The
 * two maps below do not depend on it.
 */
export default function SourceMapPage({ params }: PageProps<'/projects/[id]/map'>) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.sourceMap(id),
    queryFn: () => api.get<SourceMapData>(`/projects/${id}/source-map`),
  });

  if (isLoading) {
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
          icon={MapIcon}
          title="The source map could not be read"
          description="The data for this project could not be fetched. Please reload the page."
        />
      </div>
    );
  }

  const cited = data.nodes.filter((n) => n.cited_by > 0).length;
  const sparse = data.nodes.filter((n) => n.sparsity > 0.66).length;
  const years = data.timeline.filter((r) => r.year !== null).map((r) => r.year as number);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Source map</h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Timeline and topic map of {data.nodes.length} sources ·{' '}
          <Link
            href={`/projects/${id}/step/2`}
            className="text-brand-strong underline underline-offset-2"
          >
            back to step 2
          </Link>
        </p>
      </header>

      <Panel accent="brand" icon={Sparkles} title="Overview">
        <StatTileGrid
          items={[
            { label: 'Sources', value: String(data.nodes.length) },
            { label: 'Currently cited', value: `${cited}/${data.nodes.length}` },
            { label: 'In sparse regions', value: String(sparse) },
            {
              label: 'Year span',
              value: years.length === 0 ? '—' : `${Math.min(...years)}–${Math.max(...years)}`,
            },
          ]}
        />
        <HintBox tone="info">
          A dot far from every other means few papers surround that topic. That is a{' '}
          <strong>hint</strong> about where to look closely for a research gap, not a conclusion —
          you still have to read and confirm it is a real gap rather than a keyword that missed.
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={MapIcon} title="Maps">
        <SourceMapView data={data} />
      </Panel>
    </div>
  );
}
