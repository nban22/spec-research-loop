---
stt: 023
timestamp: 2026-08-24T21:20+07:00
model: antigravity
scope:
  - frontend/src/components/judge.tsx
---

## Prompt

> the name of these judges are truncated

# 2026-08-24: Bỏ giới hạn cắt chữ (truncate) ở tên Judge

## Bối cảnh
Người dùng nhận thấy tên của các Judge trong danh sách (như "Research Gap", "Contribution") bị cắt bớt bằng dấu ba chấm khi màn hình hoặc container bị thu hẹp, dẫn đến khó đọc.

## Thay đổi
- Gỡ class `truncate` ở thẻ bọc tên Judge trong component `JudgePanel` (`frontend/src/components/judge.tsx`).
- Bổ sung class `leading-tight`, `break-words` cho thẻ tên, và `shrink-0` cho các icon trạng thái cũng như mã Judge (J1, J2) để đảm bảo khi không đủ chỗ trống, chữ sẽ tự động bẻ từ (wrap) rớt dòng thay vì nằm đè lên icon.
