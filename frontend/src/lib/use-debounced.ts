'use client';

import { useEffect, useState } from 'react';

/**
 * Trả về `value` sau khi nó **đứng yên** đủ `ms` mili-giây.
 *
 * Dùng cho thanh trượt: kéo một lần bắn ra hàng chục sự kiện `change`, mà mỗi giá trị trung gian
 * không đáng một lời gọi mạng. Giá trị trả về giữ **nguyên tham chiếu** của `value`, nên so sánh
 * `value !== debounced` là cách rẻ để biết "đang chờ tính lại".
 *
 * `setState` nằm trong timer chứ không trong thân effect, nên không vi phạm
 * `react-hooks/set-state-in-effect`.
 */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return settled;
}
