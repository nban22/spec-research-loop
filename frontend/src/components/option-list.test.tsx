import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { OptionList } from './option-list';

const options = [
  { key: 'A', label: 'Approve the plan', explain: 'Keep it as is', example: 'Example A', recommended: true },
  { key: 'B', label: 'Change the plan', explain: 'Adjust it', example: 'Example B', recommended: false },
];

describe('OptionList', () => {
  it('renders radio options with proper ARIA attributes and recommendation badge', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<OptionList question="Choose an option" options={options} variant="compact" onSubmit={onSubmit} />);

    const optionA = screen.getByRole('radio', { name: /approve the plan/i });
    const optionB = screen.getByRole('radio', { name: /change the plan/i });

    expect(optionA).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('SUGGESTED')).toHaveClass('whitespace-nowrap');

    await user.click(optionA);
    expect(optionA).toHaveAttribute('aria-checked', 'true');
    expect(optionB).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Confirm choice' }));
    expect(onSubmit).toHaveBeenCalledWith('A', null);
  });
});
