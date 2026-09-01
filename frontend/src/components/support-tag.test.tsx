import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SupportTag } from './support-tag';
import type { SupportLabel } from '@/lib/types';

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
      screen.getByText('This source was not found in any registry'),
    ).toBeInTheDocument();
  });

  it('applies custom className passed via props', () => {
    render(<SupportTag label="SUPPORTED" className="custom-tag-container" />);
    const container = screen.getByText('SUPPORTED').closest('.flex-wrap');
    expect(container).toHaveClass('custom-tag-container');
  });

  it('renders an unknown support label verbatim instead of crashing', () => {
    render(<SupportTag label={'PARTIAL' as SupportLabel} />);
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });

  /**
   * The most important property of this component: `verified={false}` must **override** `label`.
   * `CardSource.support_label` defaults to `WEAK` from the moment the generator creates the pair,
   * so if the tag still showed WEAK the whole card board at step 3 would claim the verifier had
   * scored it — while it has never run.
   */
  it('shows UNVERIFIED instead of the label when the pair has not been through the verifier', () => {
    render(<SupportTag label="WEAK" verified={false} />);
    expect(screen.queryByText('WEAK')).toBeNull();
    const tag = screen.getByText('UNVERIFIED');
    expect(tag).toHaveClass('border-neutral-line', 'border-dashed');
    expect(
      screen.getByText('evidence verification has not run for this pair'),
    ).toBeInTheDocument();
  });

  it('does not show diagnostic flags for an unverified pair', () => {
    render(<SupportTag label="WEAK" verified={false} flags={['STALE_SOURCE']} />);
    expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
    expect(screen.queryByText(/rather old/i)).toBeNull();
  });

  it('treats a pair as verified by default — existing call sites keep their behaviour', () => {
    render(<SupportTag label="SUPPORTED" />);
    expect(screen.getByText('SUPPORTED')).toBeInTheDocument();
    expect(screen.queryByText('UNVERIFIED')).toBeNull();
  });
});
