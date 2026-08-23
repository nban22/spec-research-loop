import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusChip } from './status-chip';

describe('StatusChip', () => {
  it('renders CONFIRMED status chip with ok-soft styling', () => {
    render(<StatusChip status="CONFIRMED" />);
    const chip = screen.getByText('Đã xác nhận');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-ok-soft', 'text-ok-strong');
  });

  it('renders PROPOSED status chip with surface styling', () => {
    render(<StatusChip status="PROPOSED" />);
    const chip = screen.getByText('Đề xuất');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-surface', 'text-brand-strong');
  });

  it('renders MISSING status chip with dashed border styling', () => {
    render(<StatusChip status="MISSING" />);
    const chip = screen.getByText('Còn thiếu');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('border-dashed');
  });

  it('renders UNSUPPORTED status chip with danger-soft styling', () => {
    render(<StatusChip status="UNSUPPORTED" />);
    const chip = screen.getByText('Không có nguồn');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-danger-soft', 'text-danger-strong');
  });

  it('renders CONFLICT status chip with decide-soft styling', () => {
    render(<StatusChip status="CONFLICT" />);
    const chip = screen.getByText('Mâu thuẫn');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-decide-soft', 'text-decide-strong');
  });

  it('applies custom className passed via props', () => {
    render(<StatusChip status="CONFIRMED" className="custom-chip-class" />);
    const chip = screen.getByText('Đã xác nhận');
    expect(chip.closest('span')).toHaveClass('custom-chip-class');
  });
});
