import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceMapView, type SourceMapData, type SourceNode } from './source-map';

/**
 * Ba thứ đáng khoá lại ở tầng này:
 *
 * 1. **Không có thông tin nào chỉ nằm trong hover** — cảm ứng không có hover (DS §6.7).
 * 2. **Vùng thưa nhìn ra được** bằng màu, và **nguồn chưa ai trích** nhìn ra được bằng nét rỗng.
 * 3. **Không vỡ khi dữ liệu thiếu** — không nguồn nào, hoặc nguồn không rõ năm.
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
  ...over,
});

/** Chấm trên bản đồ là `<g role="button">` — tra bằng tên chứ không quét `circle`, vì icon của
    lucide cũng render `<circle>`. */
function dotFor(title: string): HTMLElement {
  return screen.getByRole('button', { name: `Xem chi tiết nguồn ${title}` });
}

function circleIn(dot: HTMLElement): Element {
  const c = dot.querySelector('circle');
  if (!c) throw new Error('chấm không có <circle>');
  return c;
}

describe('SourceMapView', () => {
  it('dự án chưa có nguồn nào thì hiện trạng thái rỗng, không vẽ SVG', () => {
    render(<SourceMapView data={data({ nodes: [], timeline: [] })} />);
    expect(screen.getByText('Chưa có nguồn nào để vẽ')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('mặc định mở bản đồ chủ đề, và nút đang chọn có aria-pressed', () => {
    render(<SourceMapView data={data()} />);
    expect(screen.getByRole('button', { name: 'Bản đồ chủ đề' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('img', { name: 'Bản đồ chủ đề của 1 nguồn' })).toBeInTheDocument();
  });

  it('chuyển sang dòng thời gian thì hiện cột năm thay cho bản đồ', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Dòng thời gian' }));

    expect(screen.getByText('2019')).toBeInTheDocument();
    // Nguồn không rõ năm vẫn phải xuất hiện, không bị nuốt mất khỏi trục.
    expect(screen.getByText('không rõ')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('bấm vào một chấm hiện chi tiết bằng CHỮ, không phải tooltip', () => {
    render(<SourceMapView data={data()} />);
    fireEvent.click(dotFor('Neural machine translation with attention'));
    expect(screen.getByText(/2 claim đang dùng/)).toBeInTheDocument();
    expect(screen.getByText(/gần nhất: Attention is all you need \(62%\)/)).toBeInTheDocument();
  });

  it('nguồn ở vùng thưa tô màu cảnh báo, nguồn giữa cụm thì không', () => {
    render(
      <SourceMapView
        data={data({
          nodes: [
            node({ id: 's-1', title: 'Giữa cụm', sparsity: 0.05, x: -0.5 }),
            node({ id: 's-2', title: 'Lạc lõng', sparsity: 0.9, x: 0.5 }),
          ],
        })}
      />,
    );
    expect(circleIn(dotFor('Giữa cụm'))).toHaveClass('fill-brand-ink');
    expect(circleIn(dotFor('Lạc lõng'))).toHaveClass('fill-warn-ink');
  });

  it('nguồn chưa claim nào trích thì vẽ rỗng ruột', () => {
    render(<SourceMapView data={data({ nodes: [node({ cited_by: 0 })] })} />);
    expect(circleIn(dotFor('Neural machine translation with attention'))).toHaveClass(
      'fill-surface',
    );
  });

  it('nguồn không cùng từ khoá với ai thì nói rõ, không bịa nguồn gần nhất', () => {
    render(<SourceMapView data={data({ nodes: [node({ nearest: null })] })} />);
    fireEvent.click(dotFor('Neural machine translation with attention'));
    expect(screen.getByText(/không nguồn nào cùng từ khoá/)).toBeInTheDocument();
  });

  it('cảnh báo khi có nguồn thiếu abstract', () => {
    render(<SourceMapView data={data({ weak_text_count: 1 })} />);
    expect(screen.getByText(/1\/1 nguồn thiếu abstract/)).toBeInTheDocument();
  });

  it('không cảnh báo khi mọi nguồn đều có abstract', () => {
    render(<SourceMapView data={data()} />);
    expect(screen.queryByText(/thiếu abstract/)).not.toBeInTheDocument();
  });
});
