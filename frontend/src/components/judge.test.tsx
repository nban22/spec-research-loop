import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DisagreementNote, IssueTable } from './judge';
import type { ApiIssueGroup, ApiSource } from '@/lib/types';

/** Two real sources from the store; the first 8 characters of `id` are what judges write in `reason`. */
const mockSources: ApiSource[] = [
  {
    id: '57eea209-1111-4000-8000-000000000001',
    title: 'PhoBERT-CNN for Vietnamese hate speech detection',
    authors: ['Nguyen A'],
    year: 2022,
    venue: 'ACL',
    doi: '10.1234/phobert-cnn',
    url: 'https://example.org/phobert-cnn',
    abstract: 'We present PhoBERT-CNN for hate and offensive comment detection.',
    citation_count: 12,
    retrieved_from: 'SEMANTIC_SCHOLAR',
    doi_verified: true,
  },
  {
    id: '2d98030e-2222-4000-8000-000000000002',
    title: 'vELECTRA for Vietnamese fake news detection',
    authors: ['Tran B'],
    year: 2021,
    venue: null,
    doi: null,
    url: null,
    abstract: 'vELECTRA is evaluated on fake news detection.',
    citation_count: 5,
    retrieved_from: 'OPENALEX',
    doi_verified: null,
  },
];

const baseGroup: ApiIssueGroup = {
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
      judge_key: 'J1',
      severity: 'CRITICAL',
      title: 'Test issue title',
      reason: 'Short reason text that should not trigger truncation.',
      suggestion: 'Fix it.',
      target_card_id: null,
    },
  ],
};

describe('IssueTable', () => {
  const mockGroups: ApiIssueGroup[] = [
    baseGroup,
    {
      ...baseGroup,
      id: 'g2',
      canonical_title: 'Long issue title',
      max_severity: 'MAJOR',
      judge_keys: ['J3'],
      agreement_count: 1,
      disagreement_score: 0.8,
      issues: [
        {
          id: 'i2',
          judge_key: 'J3',
          severity: 'MAJOR',
          title: 'Long issue title',
          reason:
            'This is a very long reason that exceeds the one hundred and fifty character threshold. '.repeat(
              5,
            ),
          suggestion: 'Fix it too.',
          target_card_id: null,
        },
      ],
    },
  ];

  it('renders table headers and issue data', () => {
    const handlePick = vi.fn();
    render(
      <IssueTable
        groups={mockGroups}
        sources={mockSources}
        onPick={handlePick}
        activeId={null}
      />,
    );

    // Table Headers
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Issue')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();

    // Row 1 (Short reason)
    expect(screen.getAllByText('Test issue title').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Short reason text that should not trigger truncation.').length,
    ).toBeGreaterThan(0);

    // Row 2 (Long reason triggers truncation and the "Read more" button)
    expect(screen.getAllByText('Long issue title').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Read more').length).toBeGreaterThan(0);
  });

  it('resolves the shortened source_id in reason into a clickable source chip', () => {
    const group: ApiIssueGroup = {
      ...baseGroup,
      issues: [
        {
          ...baseGroup.issues[0],
          reason:
            'Source 57eea209 reports PhoBERT-CNN results, and source 2d98030e reports vELECTRA results.',
        },
      ],
    };
    render(
      <IssueTable groups={[group]} sources={mockSources} onPick={vi.fn()} activeId={null} />,
    );

    expect(screen.getAllByText('Sources the judge checked against:').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('PhoBERT-CNN for Vietnamese hate speech detection').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('vELECTRA for Vietnamese fake news detection').length,
    ).toBeGreaterThan(0);
  });

  it('says so plainly when an id is not in the source store instead of showing it as real', () => {
    const group: ApiIssueGroup = {
      ...baseGroup,
      issues: [
        { ...baseGroup.issues[0], reason: 'Source 9f3a21bc contradicts the claim.' },
      ],
    };
    render(
      <IssueTable groups={[group]} sources={mockSources} onPick={vi.fn()} activeId={null} />,
    );

    expect(
      screen.getAllByText(/9f3a21bc · not in the source store/).length,
    ).toBeGreaterThan(0);
  });

  it('does not treat a run of 8 plain digits (a date) as an unknown source_id', () => {
    const group: ApiIssueGroup = {
      ...baseGroup,
      issues: [
        { ...baseGroup.issues[0], reason: 'The dataset was collected on 20260826 by the authors.' },
      ],
    };
    render(
      <IssueTable groups={[group]} sources={mockSources} onPick={vi.fn()} activeId={null} />,
    );

    expect(screen.queryByText('Sources the judge checked against:')).toBeNull();
  });
});

describe('DisagreementNote', () => {
  it('uses judges_completed as the denominator, not the constant 5', () => {
    const { container } = render(
      <DisagreementNote
        group={{ ...baseGroup, judge_keys: ['J4'], agreement_count: 1, judges_completed: 4 }}
      />,
    );
    // 4 − 1 = 3, not 5 − 1 = 4.
    expect(container.textContent).toContain('The other 3 judges');
  });

  it('states the judge remit instead of concluding the other four were satisfied', () => {
    const { container } = render(
      <DisagreementNote
        group={{ ...baseGroup, judge_keys: ['J4'], agreement_count: 1, judges_completed: 5 }}
      />,
    );
    // The sentence is split across several `<span>`s, so read the block's `textContent`.
    const text = container.textContent ?? '';
    expect(text).toContain('Evidence');
    expect(text).toContain('does each citation really support the text next to it?');
    expect(text).toContain('their silence does');
    expect(text).toContain('mean they looked and were satisfied');
  });

  it('hides completely once 2 or more judges agree', () => {
    const { container } = render(
      <DisagreementNote group={{ ...baseGroup, agreement_count: 2, judges_completed: 5 }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
