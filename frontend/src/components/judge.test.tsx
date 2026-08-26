import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DisagreementNote, IssueTable } from './judge';
import type { ApiIssueGroup, ApiSource } from '@/lib/types';

/** Hai nguồn thật của kho; `id` 8 ký tự đầu là thứ judge viết trong `reason`. */
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
    expect(screen.getByText('Mức độ')).toBeInTheDocument();
    expect(screen.getByText('Vấn đề')).toBeInTheDocument();
    expect(screen.getByText('Lý do')).toBeInTheDocument();

    // Row 1 (Short reason)
    expect(screen.getAllByText('Test issue title').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Short reason text that should not trigger truncation.').length,
    ).toBeGreaterThan(0);

    // Row 2 (Long reason triggers truncation and "Đọc thêm" button)
    expect(screen.getAllByText('Long issue title').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đọc thêm').length).toBeGreaterThan(0);
  });

  it('tra ngược source_id rút gọn trong reason thành chip nguồn bấm được', () => {
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

    expect(screen.getAllByText('Nguồn judge đối chiếu:').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('PhoBERT-CNN for Vietnamese hate speech detection').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('vELECTRA for Vietnamese fake news detection').length,
    ).toBeGreaterThan(0);
  });

  it('id không có trong kho nguồn thì báo thẳng ra thay vì hiện như thật', () => {
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
      screen.getAllByText(/9f3a21bc · không có trong kho nguồn/).length,
    ).toBeGreaterThan(0);
  });

  it('chuỗi 8 chữ số thuần (ngày tháng) không bị coi là source_id lạ', () => {
    const group: ApiIssueGroup = {
      ...baseGroup,
      issues: [
        { ...baseGroup.issues[0], reason: 'The dataset was collected on 20260826 by the authors.' },
      ],
    };
    render(
      <IssueTable groups={[group]} sources={mockSources} onPick={vi.fn()} activeId={null} />,
    );

    expect(screen.queryByText('Nguồn judge đối chiếu:')).toBeNull();
  });
});

describe('DisagreementNote', () => {
  it('dùng judges_completed làm mẫu số, không phải hằng số 5', () => {
    render(
      <DisagreementNote
        group={{ ...baseGroup, judge_keys: ['J4'], agreement_count: 1, judges_completed: 4 }}
      />,
    );
    // 4 − 1 = 3, không phải 5 − 1 = 4.
    expect(screen.getByText(/3 judge/)).toBeInTheDocument();
  });

  it('nêu rõ phạm vi của judge thay vì kết luận bốn judge kia thấy ổn', () => {
    const { container } = render(
      <DisagreementNote
        group={{ ...baseGroup, judge_keys: ['J4'], agreement_count: 1, judges_completed: 5 }}
      />,
    );
    // Câu bị cắt qua nhiều `<span>` nên phải đọc `textContent` của cả khối.
    const text = container.textContent ?? '';
    expect(text).toContain('Evidence');
    expect(text).toContain('citation có thật sự hỗ trợ nội dung đi kèm không');
    expect(text).toContain('không có nghĩa là đã xem và thấy ổn');
    expect(text).not.toContain('Cân nhắc trước khi sửa');
  });

  it('ẩn hoàn toàn khi có từ 2 judge trở lên', () => {
    const { container } = render(
      <DisagreementNote group={{ ...baseGroup, agreement_count: 2, judges_completed: 5 }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
