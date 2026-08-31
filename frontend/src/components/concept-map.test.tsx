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
  title: 'Prompt thủ công không ổn định',
  body: 'Nội dung thẻ',
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
  it('mỗi thẻ một nút bấm được, có nhãn cho trình đọc màn hình', () => {
    wrap(
      <ConceptMap
        projectId="p-1"
        meta={null}
        cards={[
          card({ id: 'c1', title: 'Thẻ một' }),
          card({ id: 'c2', title: 'Thẻ hai', type: 'CLAIM' }),
        ]}
      />,
    );
    expect(screen.getByLabelText('Sửa thẻ Thẻ một')).toBeInTheDocument();
    expect(screen.getByLabelText('Sửa thẻ Thẻ hai')).toBeInTheDocument();
  });

  it('chỉ vẽ nhóm cho loại thẻ THỰC SỰ có mặt, không vẽ đủ 8 nhóm rỗng', () => {
    const { container } = wrap(
      <ConceptMap
        projectId="p-1"
        meta={null}
        cards={[card({ id: 'c1' }), card({ id: 'c2' }), card({ id: 'c3', type: 'GAP' })]}
      />,
    );
    // Hai loại có mặt (PROBLEM, GAP) ⇒ hai nhãn nhóm.
    expect(screen.getByText('Vấn đề')).toBeInTheDocument();
    expect(screen.getByText('Khoảng trống nghiên cứu')).toBeInTheDocument();
    expect(screen.queryByText('Câu hỏi mở')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  /**
   * Bố cục phải là **hàm thuần của dữ liệu**: cùng thẻ thì cùng toạ độ. Đây là lý do không dùng
   * thuật toán lực — người dùng cần nhớ được vị trí thẻ giữa hai lần mở.
   */
  it('bố cục tất định — render hai lần cho ra cùng toạ độ', () => {
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

  it('bấm một nút mở hộp sửa với đúng nội dung thẻ đó', () => {
    wrap(
      <ConceptMap
        projectId="p-1"
        meta={null}
        cards={[card({ id: 'c1', title: 'Thẻ cần sửa', body: 'Thân thẻ ban đầu' })]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Sửa thẻ Thẻ cần sửa'));
    expect(screen.getByText('Sửa thẻ')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thẻ cần sửa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thân thẻ ban đầu')).toBeInTheDocument();
  });

  it('không có thẻ nào thì nói rõ, không vẽ hình rỗng', () => {
    const { container } = wrap(<ConceptMap projectId="p-1" meta={null} cards={[]} />);
    expect(screen.getByText('Chưa có thẻ nào để dựng bản đồ.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('ViewToggle', () => {
  it('nút đang chọn được đánh dấu bằng aria-pressed, không chỉ bằng màu', () => {
    render(<ViewToggle view="map" onChange={() => {}} />);
    expect(screen.getByText('Bản đồ')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Bảng thẻ')).toHaveAttribute('aria-pressed', 'false');
  });

  it('bấm nút kia thì gọi onChange với đúng chế độ', () => {
    const calls: string[] = [];
    render(<ViewToggle view="map" onChange={(v) => calls.push(v)} />);
    fireEvent.click(screen.getByText('Bảng thẻ'));
    expect(calls).toEqual(['board']);
  });
});
