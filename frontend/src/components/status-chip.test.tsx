import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusChip } from './status-chip';
import type { CardStatus } from '@/lib/types';

describe('StatusChip', () => {
  it('renders CONFIRMED status chip with ok-soft styling', () => {
    render(<StatusChip status="CONFIRMED" />);
    const chip = screen.getByText('Confirmed');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-ok-soft', 'text-ok-strong');
  });

  it('renders PROPOSED status chip with surface styling', () => {
    render(<StatusChip status="PROPOSED" />);
    const chip = screen.getByText('Proposed');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-surface', 'text-brand-strong');
  });

  it('renders MISSING status chip with dashed border styling', () => {
    render(<StatusChip status="MISSING" />);
    const chip = screen.getByText('Missing');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('border-dashed');
  });

  it('renders UNSUPPORTED status chip with danger-soft styling', () => {
    render(<StatusChip status="UNSUPPORTED" />);
    const chip = screen.getByText('Unsupported');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-danger-soft', 'text-danger-strong');
  });

  it('renders CONFLICT status chip with decide-soft styling', () => {
    render(<StatusChip status="CONFLICT" />);
    const chip = screen.getByText('Conflict');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('span')).toHaveClass('bg-decide-soft', 'text-decide-strong');
  });

  it('applies custom className passed via props', () => {
    render(<StatusChip status="CONFIRMED" className="custom-chip-class" />);
    const chip = screen.getByText('Confirmed');
    expect(chip.closest('span')).toHaveClass('custom-chip-class');
  });

  /* Regression: an enum value the frontend has not learned yet must not blank the page.
     See lib/unknown-style.ts. */
  it('renders an unknown status verbatim instead of crashing', () => {
    render(<StatusChip status={'PARTIAL' as CardStatus} />);
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });

});
