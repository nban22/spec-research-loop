'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';

/**
 * Chuyển bước **có hướng**: đi tới thì nội dung trượt vào từ phải, quay lại thì từ trái.
 *
 * Trước đây làm bằng CSS keyframe. Đổi sang `motion` vì keyframe **không có đường ra**: bước cũ
 * biến mất tức thì rồi bước mới mới trượt vào, nên mắt thấy một khoảng trắng nháy giữa hai bước.
 * `AnimatePresence mode="wait"` giữ bước cũ sống đủ lâu để nó trượt ra trước — đó là toàn bộ
 * khác biệt giữa "có animation" và "mượt".
 *
 * Vẫn **không** dùng View Transitions API: Next 16 chưa mở `viewTransition` ở config ổn định.
 *
 * Hướng suy ra bằng **mẫu "điều chỉnh state khi prop đổi"** của React, không dùng `useRef`:
 * đọc hay ghi `ref.current` trong lúc render là thứ `react-hooks/refs` chặn, và chặn có lý —
 * ref không tham gia render nên React không bảo đảm giá trị đọc ra là mới nhất.
 */
export function StepTransition({ step, children }: { step: number; children: ReactNode }) {
  const [prevStep, setPrevStep] = useState(step);
  const [forward, setForward] = useState(true);
  const reduced = useReducedMotion();

  if (prevStep !== step) {
    setForward(step >= prevStep);
    setPrevStep(step);
  }

  // Người đã tắt hiệu ứng chuyển động thì đổi bước phải là **tức thì**, không phải chậm hơn.
  const offset = reduced ? 0 : forward ? 28 : -28;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0, x: offset }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -offset }}
        transition={
          reduced
            ? { duration: 0 }
            : // Lò xo chứ không phải easing cố định: khi người dùng bấm nhanh hai bước liền,
              // lò xo nhận vận tốc đang có và đổi hướng mượt, còn easing thì giật về đầu.
              { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 }
        }
        /* Trình đọc màn hình phải biết vùng này vừa được thay, không phải trang mới. */
        aria-live="polite"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
