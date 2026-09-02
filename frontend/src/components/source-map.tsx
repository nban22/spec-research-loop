'use client';

import { CircleDot, Clock, Share2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';

/**
 * The **research timeline** and the **similarity map** — issue #16 (lane C).
 *
 * Both are hand-written SVG, **with no charting library added**: these two figures need only dots,
 * bars and labels; pulling `recharts` or `d3` into the bundle for that much costs more than it
 * buys (STACK §8 — no new dependency for something we can write ourselves).
 *
 * The backend already returns coordinates normalised into the `[-1, 1]` box and sparsity squeezed
 * into `[0, 1]`, so all that remains here is mapping to screen space. That is deliberate: the
 * projection must be **deterministic** and identical across clients, so it belongs on the server.
 */

export type SourceNode = {
  id: string;
  title: string;
  year: number | null;
  venue: string | null;
  citation_count: number | null;
  doi_verified: boolean | null;
  cited_by: number;
  x: number;
  y: number;
  sparsity: number;
  nearest: { id: string; title: string; score: number } | null;
};

export type SourceMapData = {
  nodes: SourceNode[];
  timeline: { year: number | null; count: number; cited: number }[];
  weak_text_count: number;
  citations: {
    edges: { from: string; to: string }[];
    /** How many sources we could **read** citation data for. Without this number the graph lies. */
    coverage: { with_refs: number; total: number };
    most_cited: { id: string; title: string; in_degree: number }[];
  };
};

type Tab = 'similarity' | 'timeline' | 'citations';

/** A fixed drawing frame; the SVG scales via `viewBox`, so no container measuring is needed. */
const W = 640;
const H = 420;
const PAD = 36;

/** Truncate long titles for the label beside a dot. Paper titles are free text — safe to cut. */
function short(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Dot radius follows the citation count on a **square-root** scale so area is proportional to the
 * measure — a linear scale lets a 5000-citation paper swallow the rest of the map.
 */
function radiusOf(citations: number | null): number {
  return 4 + Math.sqrt(Math.max(0, citations ?? 0)) * 0.55;
}

export function SourceMapView({ data }: { data: SourceMapData }) {
  const [tab, setTab] = useState<Tab>('similarity');
  const [focus, setFocus] = useState<string | null>(null);
  const reduced = useReducedMotion();

  if (data.nodes.length === 0) {
    return (
      <EmptyState
        icon={CircleDot}
        title="No sources to plot yet"
        description="Run the source search at step 2, then come back here to see the map."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ViewToggle value={tab} onChange={setTab} />
        {data.weak_text_count > 0 && (
          <p className="text-ink-3 text-2xs">
            {data.weak_text_count}/{data.nodes.length} sources have no abstract — their position on
            the map rests on the title alone, so read it with moderate confidence.
          </p>
        )}
      </div>

      {/* `mode="wait"` rather than overlapping the two views: the figures have different heights,
          and letting both exist for a frame makes the whole page jump. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -8 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === 'similarity' ? (
            <SimilarityMap nodes={data.nodes} focus={focus} onFocus={setFocus} />
          ) : tab === 'timeline' ? (
            <Timeline rows={data.timeline} />
          ) : (
            <CitationGraph nodes={data.nodes} citations={data.citations} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * `aria-pressed` buttons instead of the shadcn `Tabs`: that component was removed in the revamp and
 * `components/ui/**` is outside the scope this issue may edit.
 */
function ViewToggle({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  const opts = [
    { key: 'similarity' as const, label: 'Topic map', icon: CircleDot },
    { key: 'timeline' as const, label: 'Timeline', icon: Clock },
    { key: 'citations' as const, label: 'Citations', icon: Share2 },
  ];
  return (
    <div className="border-hairline inline-flex rounded-md border p-0.5">
      {opts.map((o) => {
        const Icon = o.icon;
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={cn(
              'ease-out-quart flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors duration-150',
              on ? 'bg-brand-soft text-brand-strong font-medium' : 'text-ink-3',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The similarity map: each dot is a source, and proximity means topical proximity.
 *
 * **The sparse regions are the most interesting thing here** (§8 of the brief — how research gaps
 * are spotted). So sparsity is painted in colour rather than hidden in a tooltip: touch has no
 * hover, and information that lives only in hover does not exist on a phone (DS §6.7).
 */
function SimilarityMap({
  nodes,
  focus,
  onFocus,
}: {
  nodes: SourceNode[];
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const sx = (x: number) => PAD + ((x + 1) / 2) * (W - PAD * 2);
  const sy = (y: number) => PAD + ((y + 1) / 2) * (H - PAD * 2);
  const picked = nodes.find((n) => n.id === focus) ?? null;
  const reduced = useReducedMotion();

  return (
    <div className="space-y-2">
      <div className="border-hairline bg-surface overflow-x-auto rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={`Topic map of ${nodes.length} sources`}
        >
          {picked?.nearest && (
            <line
              x1={sx(picked.x)}
              y1={sy(picked.y)}
              x2={sx(nodes.find((n) => n.id === picked.nearest?.id)?.x ?? picked.x)}
              y2={sy(nodes.find((n) => n.id === picked.nearest?.id)?.y ?? picked.y)}
              className="stroke-brand-line"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {nodes.map((n, i) => {
            const on = n.id === focus;
            const pick = () => onFocus(on ? null : n.id);
            return (
              /* `<g role="button">` instead of `<circle onClick>`: a clickable element must be
                 keyboard reachable and have a name (frontend/CLAUDE.md §7). Same shape as
                 `concept-map`. Staggered entry: the map appears progressively so the eye can catch
                 the clusters, instead of dumping dozens of dots at once and forcing a rescan. */
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reduced ? 0 : 0.32,
                  delay: reduced ? 0 : Math.min(i, 24) * 0.022,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{ transformOrigin: `${sx(n.x)}px ${sy(n.y)}px` }}
                role="button"
                tabIndex={0}
                aria-label={`View details for source ${n.title}`}
                aria-pressed={on}
                className="cursor-pointer"
                onClick={pick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick();
                  }
                }}
              >
                <circle
                  cx={sx(n.x)}
                  cy={sy(n.y)}
                  r={radiusOf(n.citation_count)}
                  className={cn(
                    // Sparse ⇒ shifts toward the warning colour. Three steps, no continuous
                    // gradient: the eye cannot read a continuous shade, three steps it can.
                    n.sparsity > 0.66
                      ? 'fill-warn-ink'
                      : n.sparsity > 0.33
                        ? 'fill-brand-line'
                        : 'fill-brand-ink',
                    // A source no claim cites: hollow, so "fetched but unused" is obvious at a glance.
                    n.cited_by === 0 && 'fill-surface',
                  )}
                  stroke="currentColor"
                  strokeWidth={on ? 2.5 : 1.2}
                />
                <text
                  x={sx(n.x)}
                  y={sy(n.y) - radiusOf(n.citation_count) - 4}
                  textAnchor="middle"
                  className="fill-ink-3 pointer-events-none text-[9px]"
                >
                  {short(n.title, 26)}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      <Legend />

      {/* Details appear as TEXT below the map, not in a tooltip — see this function's docblock.
          This box **pushes the content below it down**, so it opens by height rather than merely
          fading in: appearing instantly makes the whole page jump each time another source is picked. */}
      <AnimatePresence initial={false}>
        {picked && (
          <motion.div
            key={picked.id}
            className="border-hairline bg-surface space-y-1 overflow-hidden rounded-md border px-3 py-2"
            initial={{ opacity: 0, height: reduced ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: reduced ? 'auto' : 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-ink-1 text-sm font-medium">{picked.title}</p>
          <p className="text-ink-3 text-xs">
            {picked.year ?? 'year unknown'}
            {picked.venue ? ` · ${picked.venue}` : ''} · {picked.citation_count ?? 0} citations ·{' '}
            {picked.cited_by === 0 ? 'no claim uses it yet' : `${picked.cited_by} claims use it`}
          </p>
          <p className="text-ink-3 text-xs">
            Sparsity {(picked.sparsity * 100).toFixed(0)}% ·{' '}
            {picked.nearest
              ? `nearest: ${short(picked.nearest.title, 48)} (${(picked.nearest.score * 100).toFixed(0)}%)`
              : 'no source shares its keywords'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The citation graph among **the project's own sources**.
 *
 * It reuses the **exact MDS coordinates** of the topic map instead of its own layout: switching
 * tabs leaves every node in place, so the viewer can read "these two papers are topically close
 * *and* cite each other" — information two independently laid-out figures could never convey.
 *
 * `coverage` is shown **on the figure, not at the bottom of the page**: only OpenAlex sources carry
 * citation data, so a sparse graph may mean "these papers rarely cite each other" **or** "most
 * sources came from Semantic Scholar so we know nothing". Those two conclusions are opposites.
 */
function CitationGraph({
  nodes,
  citations,
}: {
  nodes: SourceNode[];
  citations: SourceMapData['citations'];
}) {
  const reduced = useReducedMotion();
  const sx = (x: number) => PAD + ((x + 1) / 2) * (W - PAD * 2);
  const sy = (y: number) => PAD + ((y + 1) / 2) * (H - PAD * 2);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const { with_refs, total } = citations.coverage;
  const linked = new Set(citations.edges.flatMap((e) => [e.from, e.to]));

  return (
    <div className="space-y-2">
      <div className="border-hairline bg-surface overflow-x-auto rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={`Citation graph: ${citations.edges.length} links between ${total} sources`}
        >
          <defs>
            <marker
              id="cite-arrow"
              viewBox="0 0 8 8"
              refX={7}
              refY={4}
              markerWidth={6}
              markerHeight={6}
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="fill-brand-ink" />
            </marker>
          </defs>

          {citations.edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return (
              <motion.line
                key={`${e.from}-${e.to}`}
                x1={sx(a.x)}
                y1={sy(a.y)}
                x2={sx(b.x)}
                y2={sy(b.y)}
                className="stroke-brand-ink"
                strokeWidth={1.2}
                markerEnd="url(#cite-arrow)"
                initial={{ pathLength: reduced ? 1 : 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.75 }}
                transition={{
                  duration: reduced ? 0 : 0.45,
                  delay: reduced ? 0 : Math.min(i, 20) * 0.04,
                }}
              />
            );
          })}

          {nodes.map((n) => (
            <g key={n.id}>
              <circle
                cx={sx(n.x)}
                cy={sy(n.y)}
                r={radiusOf(n.citation_count)}
                className={cn(
                  // A node with no edges is drawn hollow — but the caption spells out that this may
                  // mean "cites nobody" or "we could not read its citation data".
                  linked.has(n.id) ? 'fill-brand-ink' : 'fill-surface',
                )}
                stroke="currentColor"
                strokeWidth={1.2}
              />
              <text
                x={sx(n.x)}
                y={sy(n.y) - radiusOf(n.citation_count) - 4}
                textAnchor="middle"
                className="fill-ink-3 pointer-events-none text-[9px]"
              >
                {short(n.title, 26)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p
        className={cn(
          'rounded-md border px-2.5 py-1.5 text-xs',
          with_refs === total
            ? 'border-hairline text-ink-3'
            : 'border-warn-line bg-warn-soft text-warn-strong',
        )}
      >
        Citation data was readable for <strong>{with_refs}/{total}</strong> sources.{' '}
        {with_refs < total && (
          <>
            The rest came from Semantic Scholar, which does not return a reference list — a hollow
            node here means <strong>unknown</strong>, not “cites nobody”.
          </>
        )}
      </p>

      {citations.most_cited.length > 0 && (
        <div className="border-hairline space-y-1 rounded-md border px-2.5 py-2">
          <p className="text-ink-2 text-xs font-medium">
            Most cited within this source set
          </p>
          <ul className="space-y-0.5">
            {citations.most_cited.map((m) => (
              <li key={m.id} className="text-ink-3 flex gap-2 text-xs">
                <span className="text-brand-strong shrink-0 tabular-nums">{m.in_degree}×</span>
                <span className="line-clamp-1">{m.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="text-ink-3 text-2xs flex flex-wrap items-center gap-x-4 gap-y-1">
      <li className="flex items-center gap-1.5">
        <span className="bg-brand-ink inline-block size-2.5 rounded-full" aria-hidden />
        in the middle of a cluster
      </li>
      <li className="flex items-center gap-1.5">
        <span className="bg-warn-ink inline-block size-2.5 rounded-full" aria-hidden />
        sparse region — a likely gap
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="border-ink-3 bg-surface inline-block size-2.5 rounded-full border"
          aria-hidden
        />
        no claim cites it yet
      </li>
      <li>bigger dot = more citations</li>
    </ul>
  );
}

/**
 * The timeline: one bar per year that has sources. The dark part is how many sources **a claim
 * actually cites** — the gap between the two shows sources fetched and then left unused.
 */
function Timeline({ rows }: { rows: SourceMapData['timeline'] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const reduced = useReducedMotion();

  return (
    <div className="border-hairline bg-surface space-y-2 rounded-lg border px-3 py-3">
      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        {rows.map((r, i) => (
          <div key={String(r.year)} className="flex min-w-9 flex-1 flex-col items-center gap-1">
            <span className="text-ink-3 text-2xs">{r.count}</span>
            {/* Bars grow from the bottom, staggered by year — the eye reads the direction of the
                time axis while the figure is still building, instead of seeing it all at once. */}
            <motion.div
              className="bg-brand-soft flex w-full flex-col justify-end overflow-hidden rounded-t"
              initial={{ height: reduced ? `${(r.count / max) * 120 + 4}px` : 4 }}
              animate={{ height: `${(r.count / max) * 120 + 4}px` }}
              transition={{
                duration: reduced ? 0 : 0.4,
                delay: reduced ? 0 : Math.min(i, 12) * 0.035,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div
                className="bg-brand-ink w-full rounded-t"
                style={{ height: `${(r.cited / r.count) * 100}%` }}
              />
            </motion.div>
            <span className="text-ink-3 text-2xs whitespace-nowrap">
              {r.year ?? 'unknown'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-ink-3 text-2xs">
        The pale bar is every source from that year; the dark part is how many a claim cites. A year
        with no sources gets no bar — a gap on the axis is a real gap.
      </p>
    </div>
  );
}
