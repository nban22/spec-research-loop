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
      screen.getByText('Không tra ra nguồn này ở registry nào'),
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
   * Điều kiện quan trọng nhất của component này: `verified={false}` phải **đè** `label`.
   * `CardSource.support_label` mặc định là `WEAK` ngay từ lúc generator tạo cặp, nên nếu tag
   * vẫn hiện WEAK thì cả bảng thẻ ở bước 3 nói rằng verifier đã chấm — trong khi nó chưa chạy.
   */
  it('hiện CHƯA KIỂM thay cho nhãn khi cặp chưa qua verifier', () => {
    render(<SupportTag label="WEAK" verified={false} />);
    expect(screen.queryByText('WEAK')).toBeNull();
    const tag = screen.getByText('CHƯA KIỂM');
    expect(tag).toHaveClass('border-neutral-line', 'border-dashed');
    expect(
      screen.getByText('chưa chạy kiểm chứng cứ cho cặp này'),
    ).toBeInTheDocument();
  });

  it('không hiện cờ chẩn đoán của cặp chưa kiểm', () => {
    render(<SupportTag label="WEAK" verified={false} flags={['STALE_SOURCE']} />);
    expect(screen.getByText('CHƯA KIỂM')).toBeInTheDocument();
    expect(screen.queryByText(/xuất bản đã lâu/i)).toBeNull();
  });

  it('mặc định coi như đã kiểm — chỗ gọi cũ không đổi hành vi', () => {
    render(<SupportTag label="SUPPORTED" />);
    expect(screen.getByText('SUPPORTED')).toBeInTheDocument();
    expect(screen.queryByText('CHƯA KIỂM')).toBeNull();
  });
});
