import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SupportTag } from './support-tag';

describe('SupportTag', () => {
  it('renders SUPPORTED tag with ok-ink border styles', () => {
    render(<SupportTag label="SUPPORTED" />);
    const tag = screen.getByText('SUPPORTED');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveClass('border-ok-ink', 'text-ok-strong');
  });

  it('renders WEAK tag with warn-ink border styles', () => {
    render(<SupportTag label="WEAK" />);
    const tag = screen.getByText('WEAK');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveClass('border-warn-ink', 'text-warn-strong');
  });

  it('renders UNSUPPORTED tag with danger-ink border styles and flags text', () => {
    render(<SupportTag label="UNSUPPORTED" flags={['SOURCE_NOT_FOUND']} />);
    expect(screen.queryByText('SUPPORTED')).toBeNull();
    const tag = screen.getByText('UNSUPPORTED');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveClass('border-danger-ink', 'text-danger-strong');
    expect(
      screen.getByText('Không tra ra nguồn này ở registry nào'),
    ).toBeInTheDocument();
  });

  it('applies custom className passed via props', () => {
    render(<SupportTag label="SUPPORTED" className="custom-tag-container" />);
    const container = screen.getByText('SUPPORTED').closest('.flex-wrap');
    expect(container).toHaveClass('custom-tag-container');
  });
});
