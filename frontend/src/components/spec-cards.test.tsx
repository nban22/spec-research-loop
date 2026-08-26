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
  // Bộ lọc sống ở store toàn cục nên nó **không** tự reset giữa các test —
  // quên dòng này là test sau ăn bộ lọc của test trước.
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

    const unsupportedBtn = screen.getByText('Không có nguồn (1)');
    fireEvent.click(unsupportedBtn);

    // Only the group containing UNSUPPORTED cards should be visible
    expect(screen.getByText('Claim card unsupported')).toBeDefined();
    expect(screen.queryByText('Problem statement card')).toBeNull();
  });

  // Lý do bộ lọc nằm ở store: đổi bước trên stepper làm `CardBoard` unmount.
  it('giữ bộ lọc sau khi unmount rồi mount lại', () => {
    const first = render(<CardBoard cards={mockCards} />);
    fireEvent.click(screen.getByText('Không có nguồn (1)'));
    expect(screen.queryByText('Problem statement card')).toBeNull();

    first.unmount();
    render(<CardBoard cards={mockCards} />);

    expect(screen.getByText('Claim card unsupported')).toBeDefined();
    expect(screen.queryByText('Problem statement card')).toBeNull();
  });
});
