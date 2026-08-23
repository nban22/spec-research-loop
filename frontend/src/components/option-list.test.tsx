import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { OptionList } from './option-list';

const options = [
  { key: 'A', label: 'Duyệt kế hoạch', explain: 'Giữ nguyên', example: 'Ví dụ A', recommended: true },
  { key: 'B', label: 'Sửa kế hoạch', explain: 'Thay đổi', example: 'Ví dụ B', recommended: false },
];

describe('OptionList', () => {
  it('renders radio options with proper ARIA attributes and recommendation badge', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<OptionList question="Chọn phương án" options={options} variant="compact" onSubmit={onSubmit} />);

    const optionA = screen.getByRole('radio', { name: /duyệt kế hoạch/i });
    const optionB = screen.getByRole('radio', { name: /sửa kế hoạch/i });

    expect(optionA).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('GỢI Ý')).toHaveClass('whitespace-nowrap');

    await user.click(optionA);
    expect(optionA).toHaveAttribute('aria-checked', 'true');
    expect(optionB).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Xác nhận lựa chọn' }));
    expect(onSubmit).toHaveBeenCalledWith('A', null);
  });
});
