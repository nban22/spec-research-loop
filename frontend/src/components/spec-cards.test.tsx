import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { CardBoard } from './spec-cards';
import type { ApiCard } from '@/lib/types';
import { useUiStore } from '@/stores/ui-store';

const mockCards: ApiCard[] = [
  {
    id: 'c1',
    spec_version_id: 'v1',
    type: 'PROBLEM',
    status: 'MISSING',
    title: 'Problem statement card',
    body: 'Problem body text',
    order_index: 0,
    origin: 'GENERATOR',
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    card_sources: [],
  },
  {
    id: 'c2',
    spec_version_id: 'v1',
    type: 'CLAIM',
    status: 'UNSUPPORTED',
    title: 'Claim card unsupported',
    body: 'Claim body text',
    order_index: 1,
    origin: 'GENERATOR',
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    card_sources: [],
  },
];

describe('CardBoard Component', () => {
  // The filter lives in a global store, so it does **not** reset between tests —
  // forget this line and the next test inherits the previous one's filter.
  beforeEach(() => {
    useUiStore.setState({ cardFilter: 'ALL' });
  });

  it('renders all cards when ALL filter is active', () => {
    render(<CardBoard cards={mockCards} />);
    expect(screen.getByText('Problem statement card')).toBeDefined();
    expect(screen.getByText('Claim card unsupported')).toBeDefined();
  });

  it('filters cards by UNSUPPORTED status and hides empty groups', () => {
    render(<CardBoard cards={mockCards} />);

    const unsupportedBtn = screen.getByText('Unsupported (1)');
    fireEvent.click(unsupportedBtn);

    // Only the group containing UNSUPPORTED cards should be visible
    expect(screen.getByText('Claim card unsupported')).toBeDefined();
    expect(screen.queryByText('Problem statement card')).toBeNull();
  });

  // Why the filter lives in the store: changing step on the stepper unmounts `CardBoard`.
  it('keeps the filter across an unmount and remount', () => {
    const first = render(<CardBoard cards={mockCards} />);
    fireEvent.click(screen.getByText('Unsupported (1)'));
    expect(screen.queryByText('Problem statement card')).toBeNull();

    first.unmount();
    render(<CardBoard cards={mockCards} />);

    expect(screen.getByText('Claim card unsupported')).toBeDefined();
    expect(screen.queryByText('Problem statement card')).toBeNull();
  });
});
