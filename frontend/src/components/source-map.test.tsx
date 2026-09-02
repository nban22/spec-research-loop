import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceMapView, type SourceMapData, type SourceNode } from './source-map';

/**
 * Three things worth locking down at this layer:
 *
 * 1. **No information lives only in hover** — touch has no hover (DS §6.7).
 * 2. **Sparse regions are visible** through colour, and **uncited sources** through a hollow dot.
 * 3. **Nothing breaks on missing data** — no sources at all, or sources with no year.
 */

const node = (over: Partial<SourceNode> = {}): SourceNode => ({
  id: 's-1',
  title: 'Neural machine translation with attention',
  year: 2020,
  venue: 'ACL',
  citation_count: 120,
  doi_verified: true,
  cited_by: 2,
  x: 0,
  y: 0,
  sparsity: 0.1,
  nearest: { id: 's-2', title: 'Attention is all you need', score: 0.62 },
  ...over,
});

const data = (over: Partial<SourceMapData> = {}): SourceMapData => ({
  nodes: [node()],
  timeline: [{ year: 2020, count: 1, cited: 1 }],
  weak_text_count: 0,
  citations: { edges: [], coverage: { with_refs: 1, total: 1 }, most_cited: [] },
  ...over,
});

/** A map dot is a `<g role="button">` — look it up by name rather than scanning for `circle`,
    because lucide icons also render a `<circle>`. */
function dotFor(title: string): HTMLElement {
  return screen.getByRole('button', { name: `View details for source ${title}` });
}

function circleIn(dot: HTMLElement): Element {
  const c = dot.querySelector('circle');
  if (!c) throw new Error('the dot has no <circle>');
  return c;
}

describe('SourceMapView', () => {
  it('shows the empty state and draws no SVG when the project has no sources', () => {
    render(<SourceMapView data={data({ nodes: [], timeline: [] })} />);
    expect(screen.getByText('No sources to plot yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens on the topic map, with the selected button marked aria-pressed', () => {
    render(<SourceMapView data={data()} />);
    expect(screen.getByRole('button', { name: 'Topic map' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('img', { name: 'Topic map of 1 sources' })).toBeInTheDocument();
  });

  /* Asynchronous because of `AnimatePresence mode="wait"`: the old map must finish its exit
     animation before the timeline mounts. That is deliberate — the two figures have different
     heights, and letting both exist for a frame would make the page jump. */
  it('switches to the timeline and shows year bars instead of the map', async () => {
    render(
      <SourceMapView
        data={data({
          timeline: [
            { year: 2019, count: 2, cited: 1 },
            { year: null, count: 1, cited: 0 },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));

    expect(await screen.findByText('2019')).toBeInTheDocument();
    // A source with no year must still appear, never be swallowed off the axis.
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('clicking a dot shows the details as TEXT, not as a tooltip', () => {
    render(<SourceMapView data={data()} />);
    fireEvent.click(dotFor('Neural machine translation with attention'));
    expect(screen.getByText(/2 claims use it/)).toBeInTheDocument();
    expect(screen.getByText(/nearest: Attention is all you need \(62%\)/)).toBeInTheDocument();
  });

  it('paints a sparse-region source in the warning colour and a clustered one not', () => {
    render(
      <SourceMapView
        data={data({
          nodes: [
            node({ id: 's-1', title: 'In the cluster', sparsity: 0.05, x: -0.5 }),
            node({ id: 's-2', title: 'Out on its own', sparsity: 0.9, x: 0.5 }),
          ],
        })}
      />,
    );
    expect(circleIn(dotFor('In the cluster'))).toHaveClass('fill-brand-ink');
    expect(circleIn(dotFor('Out on its own'))).toHaveClass('fill-warn-ink');
  });

  it('draws an uncited source hollow', () => {
    render(<SourceMapView data={data({ nodes: [node({ cited_by: 0 })] })} />);
    expect(circleIn(dotFor('Neural machine translation with attention'))).toHaveClass(
      'fill-surface',
    );
  });

  it('says so plainly when no source shares keywords, instead of inventing a nearest one', () => {
    render(<SourceMapView data={data({ nodes: [node({ nearest: null })] })} />);
    fireEvent.click(dotFor('Neural machine translation with attention'));
    expect(screen.getByText(/no source shares its keywords/)).toBeInTheDocument();
  });

  it('warns when some sources have no abstract', () => {
    render(<SourceMapView data={data({ weak_text_count: 1 })} />);
    expect(screen.getByText(/1\/1 sources have no abstract/)).toBeInTheDocument();
  });

  it('does not warn when every source has an abstract', () => {
    render(<SourceMapView data={data()} />);
    expect(screen.queryByText(/have no abstract/)).not.toBeInTheDocument();
  });

  /* The citations tab. Two things worth locking: a hollow node must NOT read as "cites nobody"
     when we have no data, and the ranking counts in-degree WITHIN the set rather than global fame. */
  it('draws an edge between two sources on the citations tab', async () => {
    render(
      <SourceMapView
        data={data({
          nodes: [
            node({ id: 's-1', title: 'A', x: -0.5 }),
            node({ id: 's-2', title: 'B', x: 0.5 }),
          ],
          citations: {
            edges: [{ from: 's-1', to: 's-2' }],
            coverage: { with_refs: 2, total: 2 },
            most_cited: [{ id: 's-2', title: 'B', in_degree: 1 }],
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Citations' }));

    expect(
      await screen.findByRole('img', { name: /Citation graph: 1 links between 2 sources/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Most cited within this source set')).toBeInTheDocument();
  });

  it('warns on missing citation data, so a reader never reads it as "nobody cites anybody"', async () => {
    render(
      <SourceMapView
        data={data({
          citations: { edges: [], coverage: { with_refs: 0, total: 3 }, most_cited: [] },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Citations' }));

    expect(await screen.findByText(/0\/3/)).toBeInTheDocument();
    expect(screen.getByText(/unknown/)).toBeInTheDocument();
  });

  it('shows no warning when all the data was readable', async () => {
    render(
      <SourceMapView
        data={data({
          citations: { edges: [], coverage: { with_refs: 2, total: 2 }, most_cited: [] },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Citations' }));

    expect(await screen.findByText(/2\/2/)).toBeInTheDocument();
    expect(screen.queryByText(/unknown/)).not.toBeInTheDocument();
  });

});
