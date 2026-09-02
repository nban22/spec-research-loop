---
stt: 008
timestamp: 2026-08-16T12:00+07:00
model: claude-opus-5
scope: [docs/DESIGN_SYSTEM.md]
---

## Prompt
về styles code, hay các rules khi coding trong mỗi source backend và frontend xem đã define gì chưa nhé, check kĩ cho tôi để list các rules best practice nhé (ngắn gọn để tôi có thể review nhanh, đưa nó vào rules ở mỗi sub folder tương ứng nhé

## Kết quả
Audit `docs/DESIGN_SYSTEM.md` rồi viết lại toàn bộ: 766 → 630 dòng, bỏ **100% chuỗi class Tailwind
(55 dòng), khối CSS `@theme` (94 dòng) và mọi mã hex / số px làm style**. File giờ chỉ mô tả ý đồ bằng
ngôn ngữ tự nhiên; cách viết cụ thể do kiến thức Tailwind + shadcn quyết lúc implement.
Cụ thể: §2 bảng màu đổi từ khối CSS sang bảng "họ token → sắc Tailwind → vai trò"; §3 bỏ cột "Class
riêng", giữ nghĩa + họ màu + icon + hình dạng; §4 bỏ px/rem, chỉ nêu có bao nhiêu bậc và mỗi bậc dùng ở
đâu; §6 bỏ grid fraction, chiều cao sheet, giá trị sticky. Giữ nguyên toàn bộ quyết định thiết kế
(3 nhóm enum phân biệt bằng hình dạng, DecisionSheet, bảng → card, JudgePanel cuộn ngang) và §7 quy ước
code (nói về tổ chức file nên vẫn cụ thể).
Sửa luôn 2 mâu thuẫn nội bộ audit phát hiện: §5.2 tự khai size cho `Button` (ngược §4.2b) và §5.1 còn
câu "đổi sm: → md:" (tàn dư của luật đã xoá).
