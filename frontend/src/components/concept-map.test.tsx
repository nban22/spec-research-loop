import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { ConceptMap, ViewToggle } from './concept-map';
import type { ApiCard, CardStatus, CardType } from '@/lib/types';

const card = (over: Partial<ApiCard> = {}): ApiCard => ({
  id: 'c1',
  type: 'PROBLEM' as CardType,
  status: 'PROPOSED' as CardStatus,
  title: 'Hand-written prompts are unstable',
  body: 'Card body',
  payload: null,
  order_index: 0,
  origin: 'GENERATOR',
  card_sources: [],
  ...over,
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ConceptMap', () => {
  it('renders one clickable button per card, each named for screen readers', () => {
    wrap(
      <ConceptMap
        projectId="p-1"
        meta={null}
        cards={[
          card({ id: 'c1', title: 'Card one' }),
          card({ id: 'c2', title: 'Card two', type: 'CLAIM' }),
        ]}
      />,
    );
    expect(screen.getByLabelText('Edit card Card one')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit card Card two')).toBeInTheDocument();
  });

  it('only draws groups for card types ACTUALLY present, never all 8 empty ones', () => {
    const { container } = wrap(
      <ConceptMap
        projectId="p-1"
        meta={null}
        cards={[card({ id: 'c1' }), card({ id: 'c2' }), card({ id: 'c3', type: 'GAP' })]}
      />,
    );
    // Two types present (PROBLEM, GAP) ⇒ two group labels.
    expect(screen.getByText('Problem')).toBeInTheDocument();
    expect(screen.getByText('Research gap')).toBeInTheDocument();
    expect(screen.queryByText('Open question')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  /**
   * The layout must be a **pure function of the data**: the same cards give the same coordinates.
   * That is why no force-directed algorithm is used — users need to remember where a card sat
   * between two visits.
   */
  it('is deterministic — two renders produce the same coordinates', () => {
    const cards = [
      card({ id: 'c1' }),
      card({ id: 'c2', type: 'CLAIM' }),
      card({ id: 'c3', type: 'GAP' }),
    ];
    const a = wrap(<ConceptMap projectId="p-1" meta={null} cards={cards} />);
    const first = [...a.container.querySelectorAll('rect')].map((r) => r.getAttribute('x'));
    a.unmount();
    const b = wrap(<ConceptMap projectId="p-1" meta={null} cards={cards} />);
    const second = [...b.container.querySelectorAll('rect')].map((r) => r.getAttribute('x'));
    expect(second).toEqual(first);
  });

  it('opens the editor with that card content when a button is clicked', () => {
    wrap(
      <ConceptMap
        projectId="p-1"
        meta={null}
        cards={[card({ id: 'c1', title: 'Card to edit', body: 'Original card body' })]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit card Card to edit'));
    expect(screen.getByText('Edit card')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Card to edit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original card body')).toBeInTheDocument();
  });

  /**
   * `status` comes from the API at runtime, not from the compiler. If the backend adds a seventh
   * status before the frontend syncs its enum, the lookup returns `undefined` — and the map draws
   * **every** card immediately, so it hits that before `CardBoard` does (a card inside a closed
   * accordion is never mounted by Radix). This is exactly the blank-page bug that hit CI on this PR.
   */
  it('renders an unknown status verbatim instead of blanking the page', () => {
    const weird = { ...card({ id: 'cx', title: 'Odd card' }), status: 'PARTIAL' as CardStatus };
    expect(() => wrap(<ConceptMap projectId="p-1" meta={null} cards={[weird]} />)).not.toThrow();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit card Odd card')).toBeInTheDocument();
  });

  it('says so plainly when there are no cards instead of drawing an empty figure', () => {
    const { container } = wrap(<ConceptMap projectId="p-1" meta={null} cards={[]} />);
    expect(screen.getByText('No cards yet to build a map from.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('ViewToggle', () => {
  it('marks the selected button with aria-pressed, not colour alone', () => {
    render(<ViewToggle view="map" onChange={() => {}} />);
    expect(screen.getByText('Map')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Card board')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the right mode when the other button is clicked', () => {
    const calls: string[] = [];
    render(<ViewToggle view="map" onChange={(v) => calls.push(v)} />);
    fireEvent.click(screen.getByText('Card board'));
    expect(calls).toEqual(['board']);
  });
});
