---
stt: 021
timestamp: 2026-08-24T20:58+07:00
model: antigravity
scope:
  - frontend/src/components/judge.tsx
  - frontend/src/components/judge.test.tsx
---

## Prompt

> the Vấn đề column is very tight
> the judge and thao tac columns shouldn't take that much width
> also the content in the Lý do (Reason) column is a lot, can we truncate them, and when click we show a modal to display the full content of that cell? what do you think?
> when i hover over the read more button should change to cursor-pointer

# 2026-08-24: Sửa lỗi hiển thị IssueTable và cập nhật tính năng rút gọn văn bản

## Bối cảnh
Người dùng báo cáo rằng bảng `IssueTable` (Tổng hợp issue) ở Bước 4 bị lỗi thanh cuộn ngang (horizontal scroll) do cột "Lý do" chứa văn bản quá dài nhưng lại bị áp dụng class `whitespace-nowrap` mặc định của component Table trong `shadcn/ui`. Ngoài ra, do các cột "Judge" và "Thao tác" được gán cứng độ rộng quá lớn (`w-28`) khiến cột "Vấn đề" bị ép lại quá hẹp. 

Để khắc phục và nâng cao trải nghiệm, người dùng cũng yêu cầu tính năng cắt ngắn (truncate) đoạn văn bản quá dài ở cột "Lý do", và khi bấm vào sẽ hiển thị đầy đủ trên một popup (modal).

## Chi tiết các thay đổi
1. **Sửa lỗi layout bảng (IssueTable)**:
   - Thay đổi các class của thẻ `<TableHead>` và `<TableCell>` trong `frontend/src/components/judge.tsx`.
   - Cột **Vấn đề**: Cấp thêm `min-w-[200px]` và `whitespace-normal` để văn bản được rớt dòng và không bị ép hẹp lại.
   - Cột **Lý do**: Cấp thêm `w-[35%]` và `whitespace-normal` để văn bản dài được bọc (wrap).
   - Cột **Judge** và **Thao tác**: Bóp nhỏ lại (`w-16` và `w-20`) và thêm `text-center` để canh giữa nội dung, giúp cân đối giao diện.

2. **Tính năng rút gọn văn bản bằng Modal (Dialog)**:
   - Tạo component nội bộ `ReasonCell` ngay trong `judge.tsx`.
   - Nếu đoạn "Lý do" dài hơn 150 ký tự, `ReasonCell` sẽ sử dụng `line-clamp-3` để cắt bớt, và hiển thị thêm nút "ĐỌC THÊM" (`cursor-pointer`).
   - Khi click vào vùng chữ hoặc nút "Đọc thêm", một `Dialog` (shadcn/ui) sẽ hiển thị toàn bộ nội dung của "Lý do" để người dùng dễ đọc.

3. **Kiểm thử tự động (Unit Test)**:
   - Viết test unit `frontend/src/components/judge.test.tsx` bằng React Testing Library và Vitest.
   - Test kiểm tra việc render đúng dữ liệu mock.
   - Test xử lý lỗi multiple elements (sử dụng `getAllByText` thay vì `getByText`) do bảng IssueTable render dữ liệu ở 2 dạng (desktop và mobile view).

## Bài học và Ghi chú
- Khi sử dụng bảng của Shadcn, các phần tử `TableHead` và `TableCell` thường bị áp dụng `whitespace-nowrap` mặc định. Với các cột chứa văn bản dài, cần nhớ đè (override) lại bằng `whitespace-normal`.
- Đối với Responsive Table có hiển thị riêng trên di động (ví dụ: dùng `<ul>` cho `.md:hidden`), khi viết Unit Test cần chú ý không dùng `getByText` do DOM sẽ chứa hai phần tử trùng text; hãy chuyển sang `getAllByText`.
