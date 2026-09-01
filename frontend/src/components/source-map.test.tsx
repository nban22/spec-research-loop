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
  citations: { edges: [], coverage: { with_refs: 1, total: 1 }, most_cited: [] },
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

  /* Bất đồng bộ vì `AnimatePresence mode="wait"`: bản đồ cũ phải chạy xong hoạt cảnh ra thì
     dòng thời gian mới được gắn vào. Đó là hành vi cố ý — hai hình cao khác nhau, cho chúng
     cùng tồn tại một nhịp sẽ làm trang giật chiều cao. */
  it('chuyển sang dòng thời gian thì hiện cột năm thay cho bản đồ', async () => {
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

    expect(await screen.findByText('2019')).toBeInTheDocument();
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

  /* Tab trích dẫn. Hai thứ đáng khoá: nút rỗng KHÔNG được đọc thành "không trích ai" khi ta
     không có dữ liệu, và bảng xếp hạng tính theo in-degree TRONG tập chứ không theo độ nổi
     tiếng toàn cầu. */
  it('tab trích dẫn vẽ được cạnh giữa hai nguồn', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Trích dẫn' }));

    expect(
      await screen.findByRole('img', { name: /Đồ thị trích dẫn: 1 liên kết giữa 2 nguồn/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Được trích nhiều nhất trong chính tập nguồn này')).toBeInTheDocument();
  });

  it('thiếu dữ liệu trích dẫn thì cảnh báo, không để người đọc tưởng là "không ai trích ai"', async () => {
    render(
      <SourceMapView
        data={data({
          citations: { edges: [], coverage: { with_refs: 0, total: 3 }, most_cited: [] },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trích dẫn' }));

    expect(await screen.findByText(/0\/3/)).toBeInTheDocument();
    expect(screen.getByText(/chưa biết/)).toBeInTheDocument();
  });

  it('đọc được đủ dữ liệu thì không hiện cảnh báo', async () => {
    render(
      <SourceMapView
        data={data({
          citations: { edges: [], coverage: { with_refs: 2, total: 2 }, most_cited: [] },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trích dẫn' }));

    expect(await screen.findByText(/2\/2/)).toBeInTheDocument();
    expect(screen.queryByText(/chưa biết/)).not.toBeInTheDocument();
  });

});
