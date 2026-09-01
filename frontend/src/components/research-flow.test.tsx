import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchFlowAnimation } from './research-flow';

/**
 * Bốn hợp đồng, không test từng khung hình:
 *
 * 1. **Tự chạy được nhưng dừng được** — animation không tắt được là quảng cáo.
 * 2. **Nhảy thẳng tới một chặng bằng nút thật**, và bấm tay thì dừng tự chạy — nếu không thì vừa
 *    chọn xong hai giây sau nó nhảy đi mất.
 * 3. **Mỗi chặng có chữ mô tả**, không chỉ có hình. Hình một mình không đọc được bằng trình đọc
 *    màn hình.
 * 4. Chặng đang xem đánh dấu bằng `aria-current`.
 */
describe('ResearchFlowAnimation', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('mở ra là đã ở chặng đầu và đang tự chạy', () => {
    render(<ResearchFlowAnimation />);
    expect(screen.getByText('Ý tưởng còn mơ hồ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dừng minh hoạ' })).toBeInTheDocument();
  });

  it('tự chuyển sang chặng kế tiếp sau một nhịp', async () => {
    render(<ResearchFlowAnimation />);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await screen.findByText('Phân rã thành thẻ')).toBeInTheDocument();
  });

  it('bấm Dừng thì đứng yên, không nhảy tiếp', async () => {
    render(<ResearchFlowAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Dừng minh hoạ' }));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(screen.getByText('Ý tưởng còn mơ hồ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chạy minh hoạ' })).toBeInTheDocument();
  });

  it('nhảy thẳng tới một chặng bằng nút, và việc đó dừng luôn tự chạy', async () => {
    render(<ResearchFlowAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Chặng 5: Năm judge phản biện' }));

    expect(await screen.findByText('Năm judge phản biện')).toBeInTheDocument();
    // Không dừng thì 3,4 giây sau nó tự nhảy sang chặng 6 và người dùng mất chỗ đang đọc.
    await vi.advanceTimersByTimeAsync(8000);
    expect(screen.getByText('Năm judge phản biện')).toBeInTheDocument();
  });

  it('chặng đang xem được đánh dấu aria-current', () => {
    render(<ResearchFlowAnimation />);
    expect(
      screen.getByRole('button', { name: 'Chặng 1: Ý tưởng còn mơ hồ' }),
    ).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByRole('button', { name: 'Chặng 2: Phân rã thành thẻ' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('mỗi chặng có chữ mô tả, không chỉ có hình', async () => {
    render(<ResearchFlowAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Chặng 6: Bản đặc tả 14 mục' }));
    expect(await screen.findByText(/chặn xuất bản/)).toBeInTheDocument();
  });

  it('có sáu chặng, khớp năm bước của quy trình', () => {
    render(<ResearchFlowAnimation />);
    expect(screen.getAllByRole('button', { name: /^Chặng \d/ })).toHaveLength(6);
  });
});
