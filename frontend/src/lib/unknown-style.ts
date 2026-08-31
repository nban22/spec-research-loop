import { CircleHelp } from 'lucide-react';
import type { StatusStyle } from './status-style';

/**
 * Lối thoát khi bảng tra nhãn **không có khoá đang cần**.
 *
 * `Record<Enum, StatusStyle>` khiến TypeScript tin mọi khoá đều tồn tại — nhưng giá trị enum ở
 * đây đến từ **API lúc chạy**, không từ trình biên dịch. Backend thêm một trạng thái thứ bảy,
 * hoặc một bản mock/fixture ghi sai giá trị, là bảng tra trả `undefined` và `style.icon` làm
 * **trắng cả trang**.
 *
 * Đặt ở file riêng chứ không nhét vào `status-style.ts`: file kia là **một nguồn sự thật duy
 * nhất về màu** (DESIGN_SYSTEM §7.1) và là chỗ duy nhất được chứa class màu thô. Thứ ở đây
 * không phải một màu của hệ, mà là hành vi khi hệ không biết giá trị nào đó.
 *
 * Nguyên tắc: **hiện nguyên văn giá trị lạ**, không nuốt thành "Không rõ". Người dùng thấy có
 * gì đó chưa khớp, lập trình viên đọc ra ngay giá trị nào gây chuyện. Nuốt đi là biến một lỗi
 * ồn ào thành một lỗi im lặng.
 */
export function styleOr(
  table: Record<string, StatusStyle | undefined>,
  key: string,
): StatusStyle {
  return (
    table[key] ?? {
      label: key,
      icon: CircleHelp,
      className: 'bg-neutral-soft text-neutral-strong border-neutral-line',
    }
  );
}
