import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SeverityBadge } from './severity-badge';

describe('SeverityBadge', () => {
  it('renders CRITICAL badge with danger-ink background styles', () => {
    render(<SeverityBadge severity="CRITICAL" />);
    const badge = screen.getByText('CRITICAL');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-danger-ink', 'text-white');
  });

  it('renders MAJOR badge with major-ink background styles', () => {
    render(<SeverityBadge severity="MAJOR" />);
    const badge = screen.getByText('MAJOR');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-major-ink', 'text-white');
  });

  it('renders MINOR badge with minor-ink styles', () => {
    render(<SeverityBadge severity="MINOR" />);
    const badge = screen.getByText('MINOR');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-minor-ink', 'text-minor-strong');
  });

  it('applies custom className passed via props', () => {
    render(<SeverityBadge severity="CRITICAL" className="custom-test-class" />);
    const badge = screen.getByText('CRITICAL');
    expect(badge).toHaveClass('custom-test-class');
  });
});
