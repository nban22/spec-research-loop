'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Chuyển bước **có hướng**: đi tới thì nội dung trượt vào từ phải, quay lại thì từ trái.
 *
 * Vì sao không dùng View Transitions API: Next 16 chưa mở `viewTransition` ở config ổn định,
 * nên tự làm bằng keyframe — kiểm soát hoàn toàn, không phụ thuộc cờ experimental, và tắt sạch
 * dưới `prefers-reduced-motion` như mọi chuyển động khác.
 *
 * Hướng suy ra bằng **mẫu "điều chỉnh state khi prop đổi"** của React, không dùng `useRef`:
 * đọc hay ghi `ref.current` trong lúc render là thứ `react-hooks/refs` chặn, và chặn có lý —
 * ref không tham gia render nên React không bảo đảm giá trị mày đọc là mới nhất. Gán state
 * ngay trong thân component thì React render lại **lập tức**, chưa vẽ gì ra màn hình.
 *
 * `key={step}` ép React thay cả cây con mỗi lần đổi bước, nên animation chạy lại từ đầu.
 */
export function StepTransition({ step, children }: { step: number; children: ReactNode }) {
  const [prevStep, setPrevStep] = useState(step);
  const [forward, setForward] = useState(true);

  if (prevStep !== step) {
    setForward(step >= prevStep);
    setPrevStep(step);
  }

  return (
    <div
      key={step}
      className={cn(forward ? 'animate-step-next' : 'animate-step-prev')}
      /* Trình đọc màn hình phải biết vùng này vừa được thay, không phải trang mới. */
      aria-live="polite"
    >
      {children}
    </div>
  );
}
