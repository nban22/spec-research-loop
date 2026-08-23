import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HintBox } from './hint-box';

describe('HintBox', () => {
  it('renders info tone hint box with brand styles by default', () => {
    render(<HintBox title="Thông tin">Nội dung hướng dẫn</HintBox>);
    expect(screen.getByText('Thông tin')).toBeInTheDocument();
    expect(screen.getByText('Nội dung hướng dẫn')).toBeInTheDocument();
    const box = screen.getByText('Thông tin').closest('.rounded-md');
    expect(box).toHaveClass('bg-brand-soft', 'border-brand-line');
  });

  it('renders ok tone hint box with ok styles', () => {
    render(
      <HintBox tone="ok" title="Thành công">
        Thao tác đã xong.
      </HintBox>,
    );
    const box = screen.getByText('Thành công').closest('.rounded-md');
    expect(box).toHaveClass('bg-ok-soft', 'border-ok-line');
  });

  it('renders warn tone hint box with warn styles', () => {
    render(
      <HintBox tone="warn" title="Cảnh báo">
        Hãy kiểm tra kỹ.
      </HintBox>,
    );
    const box = screen.getByText('Cảnh báo').closest('.rounded-md');
    expect(box).toHaveClass('bg-warn-soft', 'border-warn-line');
  });

  it('renders danger tone hint box with danger styles', () => {
    render(
      <HintBox tone="danger" title="Lỗi nghiệm trọng">
        Có lỗi xảy ra.
      </HintBox>,
    );
    const box = screen.getByText('Lỗi nghiệm trọng').closest('.rounded-md');
    expect(box).toHaveClass('bg-danger-soft', 'border-danger-line');
  });

  it('applies custom className passed via props', () => {
    render(<HintBox className="custom-hint-box">Nội dung</HintBox>);
    const box = screen.getByText('Nội dung').closest('.rounded-md');
    expect(box).toHaveClass('custom-hint-box');
  });
});
