import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HintBox } from './hint-box';

describe('HintBox', () => {
  it('renders info tone hint box with brand styles by default', () => {
    render(<HintBox title="Information">Guidance content</HintBox>);
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Guidance content')).toBeInTheDocument();
    const box = screen.getByText('Information').closest('.rounded-md');
    expect(box).toHaveClass('bg-brand-soft', 'border-brand-line');
  });

  it('renders ok tone hint box with ok styles', () => {
    render(
      <HintBox tone="ok" title="Success">
        The action completed.
      </HintBox>,
    );
    const box = screen.getByText('Success').closest('.rounded-md');
    expect(box).toHaveClass('bg-ok-soft', 'border-ok-line');
  });

  it('renders warn tone hint box with warn styles', () => {
    render(
      <HintBox tone="warn" title="Warning">
        Please double-check this.
      </HintBox>,
    );
    const box = screen.getByText('Warning').closest('.rounded-md');
    expect(box).toHaveClass('bg-warn-soft', 'border-warn-line');
  });

  it('renders danger tone hint box with danger styles', () => {
    render(
      <HintBox tone="danger" title="Critical error">
        Something went wrong.
      </HintBox>,
    );
    const box = screen.getByText('Critical error').closest('.rounded-md');
    expect(box).toHaveClass('bg-danger-soft', 'border-danger-line');
  });

  it('applies custom className passed via props', () => {
    render(<HintBox className="custom-hint-box">Content</HintBox>);
    const box = screen.getByText('Content').closest('.rounded-md');
    expect(box).toHaveClass('custom-hint-box');
  });
});
