import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepTransition } from './step-transition';

/**
 * Hai thứ đáng khoá lại — đều là **hợp đồng**, không phải chi tiết hoạt cảnh:
 *
 * 1. Nội dung bước phải **luôn** ra được màn hình. Hoạt cảnh hỏng thì cùng lắm là xấu, nhưng
 *    nuốt mất nội dung thì là trang trắng.
 * 2. Vùng này phải là `aria-live` — trình đọc màn hình cần biết nội dung vừa được **thay**,
 *    không phải người dùng vừa sang trang mới.
 *
 * Cố ý **không** test giá trị `x`, thời lượng hay kiểu lò xo: đó là thứ sẽ chỉnh đi chỉnh lại,
 * khoá chúng lại chỉ tạo ra test phải sửa mỗi lần đổi cảm giác chuyển động.
 */
describe('StepTransition', () => {
  it('hiện nội dung của bước đang xem', () => {
    render(
      <StepTransition step={1}>
        <p>Nội dung bước 1</p>
      </StepTransition>,
    );
    expect(screen.getByText('Nội dung bước 1')).toBeInTheDocument();
  });

  it('đổi bước thì nội dung mới ra được màn hình', async () => {
    const { rerender } = render(
      <StepTransition step={1}>
        <p>Nội dung bước 1</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition step={2}>
        <p>Nội dung bước 2</p>
      </StepTransition>,
    );
    // `findBy` chứ không `getBy`: `mode="wait"` giữ bước cũ lại cho tới khi nó chạy xong hoạt
    // cảnh ra — chính chỗ đó là thứ khử được khoảng trắng nháy giữa hai bước.
    expect(await screen.findByText('Nội dung bước 2')).toBeInTheDocument();
  });

  it('quay lại bước trước cũng hiện được nội dung', async () => {
    const { rerender } = render(
      <StepTransition step={3}>
        <p>Nội dung bước 3</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition step={2}>
        <p>Nội dung bước 2</p>
      </StepTransition>,
    );
    expect(await screen.findByText('Nội dung bước 2')).toBeInTheDocument();
  });

  it('vùng nội dung là aria-live để trình đọc màn hình biết nó vừa được thay', () => {
    render(
      <StepTransition step={1}>
        <p>Nội dung bước 1</p>
      </StepTransition>,
    );
    expect(screen.getByText('Nội dung bước 1').parentElement).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
