import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IssueTable } from './judge';
import type { ApiIssueGroup } from '@/lib/types';

describe('IssueTable', () => {
  const mockGroups: ApiIssueGroup[] = [
    {
      id: 'g1',
      round: 1,
      canonical_title: 'Test issue title',
      max_severity: 'CRITICAL',
      judge_keys: ['J1', 'J2'],
      agreement_count: 2,
      judges_completed: 5,
      disagreement_score: 0.1,
      status: 'OPEN',
      issues: [
        {
          id: 'i1',
          severity: 'CRITICAL',
          title: 'Test issue title',
          reason: 'Short reason text that should not trigger truncation.',
          suggestion: 'Fix it.',
          target_card_id: null,
        },
      ],
    },
    {
      id: 'g2',
      round: 1,
      canonical_title: 'Long issue title',
      max_severity: 'MAJOR',
      judge_keys: ['J3'],
      agreement_count: 1,
      judges_completed: 5,
      disagreement_score: 0.8,
      status: 'OPEN',
      issues: [
        {
          id: 'i2',
          severity: 'MAJOR',
          title: 'Long issue title',
          reason: 'This is a very long reason that exceeds the one hundred and fifty character threshold. '.repeat(5),
          suggestion: 'Fix it too.',
          target_card_id: null,
        },
      ],
    },
  ];

  it('renders table headers and issue data', () => {
    const handlePick = vi.fn();
    render(<IssueTable groups={mockGroups} onPick={handlePick} activeId={null} />);
    
    // Table Headers
    expect(screen.getByText('Mức độ')).toBeInTheDocument();
    expect(screen.getByText('Vấn đề')).toBeInTheDocument();
    expect(screen.getByText('Lý do')).toBeInTheDocument();
    
    // Row 1 (Short reason)
    expect(screen.getAllByText('Test issue title').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Short reason text that should not trigger truncation.').length).toBeGreaterThan(0);
    
    // Row 2 (Long reason triggers truncation and "Đọc thêm" button)
    expect(screen.getAllByText('Long issue title').length).toBeGreaterThan(0);
    const readMoreButtons = screen.getAllByText('Đọc thêm');
    expect(readMoreButtons.length).toBeGreaterThan(0);
  });
});
