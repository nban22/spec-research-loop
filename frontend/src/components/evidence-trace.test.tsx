import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceTraceView } from './evidence-trace';
import type { ApiEvidencePair, ApiEvidenceTrace } from '@/lib/use-project';

/**
 * Bốn thứ đáng khoá lại ở tầng này:
 *
 * 1. **Ngưỡng hiện ra là ngưỡng của lần chạy đó**, không phải hằng số hiện hành — đây là điều kiện
 *    tường minh của #5 và là cả lý do NFR-VER-4 chép ngưỡng vào mỗi `VerifierRun`.
 * 2. **Mọi nhãn truy được về tầng đã quyết định nó.**
 * 3. Lời giải thích và cờ hiện bằng **chữ**, không giấu trong hover (DS §6.7).
 * 4. Bộ lọc thu hẹp thật, và không vỡ khi lọc ra rỗng.
 */

const pair = (over: Partial<ApiEvidencePair> = {}): ApiEvidencePair => ({
  card_source_id: 'cs-1',
  card: { id: 'c-1', title: 'Hybrid retrieval helps', type: 'CLAIM', status: 'PROPOSED' },
  source: {
    id: 's-1',
    title: 'A paper about retrieval',
    year: 2024,
    doi: '10.1/x',
    url: null,
    venue: 'SIGIR',
  },
  support_label: 'SUPPORTED',
  similarity: 0.812,
  entailment: null,
  confidence: null,
  evidence_sentence: null,
  flags: [],
  layer: 'L3',
  layer_why: 'Câu gần nhất trong nguồn đạt độ tương đồng 0.81, vượt ngưỡng trên.',
  credibility: null,
  passages: [],
  ...over,
});

const data = (over: Partial<ApiEvidenceTrace> = {}): ApiEvidenceTrace => ({
  // Ngưỡng **khác** mặc định, để test bắt được nếu ai đó hardcode hằng số hiện hành.
  thresholds: {
    tau_low: 0.4,
    tau_high: 0.76,
    conf_min: 0.8,
    title_match: 0.85,
    min_abstract_chars: 200,
    stale_years: 8,
  },
  run: { id: 'vr-1', created_at: '2026-08-31T00:00:00Z', units_total: 4, units_l4: 1 },
  summary: { SUPPORTED: 1, WEAK: 0, UNSUPPORTED: 0 },
  pairs: [pair()],
  ...over,
});

describe('trang vì sao nhãn này', () => {
  it('hiện ngưỡng của chính lần chạy đó, không phải hằng số hiện hành', () => {
    // Cặp có phán quyết của mô hình, để cả ba ngưỡng cùng lộ ra một chỗ.
    render(
      <EvidenceTraceView
        data={data({
          pairs: [pair({ entailment: 'ENTAILS', confidence: 0.91, layer: 'L4' })],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    expect(screen.getByText(/ngưỡng dưới 0.4/)).toBeInTheDocument();
    expect(screen.getByText(/ngưỡng trên 0.76/)).toBeInTheDocument();
    expect(screen.getByText(/tối thiểu 0.8/)).toBeInTheDocument();
  });

  it('mỗi nhãn truy được về tầng đã quyết định nó', () => {
    render(<EvidenceTraceView data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    const step = screen.getByRole('listitem', { current: 'step' });
    expect(step).toHaveTextContent('L3');
    expect(screen.getByText(/vượt ngưỡng trên/)).toBeInTheDocument();
  });

  it('cờ chẩn đoán hiện thành câu, không phải mã enum trần', () => {
    render(
      <EvidenceTraceView
        data={data({ pairs: [pair({ flags: ['FULLTEXT_USED'], layer: 'L3b' })] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    expect(
      screen.getByText(/^· Nhãn này đọc từ toàn văn bài báo/),
    ).toBeInTheDocument();
  });

  it('hiện các đoạn toàn văn và đánh dấu đoạn chứa câu trích', () => {
    render(
      <EvidenceTraceView
        data={data({
          pairs: [
            pair({
              layer: 'L3b',
              evidence_sentence: 'We presented the Transformer.',
              passages: [
                {
                  rank: 0,
                  similarity: 0.78,
                  char_start: 10,
                  text: 'Some other passage.',
                  is_evidence: false,
                },
                {
                  rank: 1,
                  similarity: 0.77,
                  char_start: 90,
                  text: 'We presented the Transformer.',
                  is_evidence: true,
                },
              ],
            }),
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    expect(screen.getByText(/đoạn chứa câu trích/)).toBeInTheDocument();
  });

  it('lọc theo nhãn thu hẹp danh sách và không vỡ khi rỗng', () => {
    render(<EvidenceTraceView data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Không hỗ trợ' }));
    expect(screen.getByText(/Không có cặp nào khớp bộ lọc/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(screen.getByText('Hybrid retrieval helps')).toBeInTheDocument();
  });
});
