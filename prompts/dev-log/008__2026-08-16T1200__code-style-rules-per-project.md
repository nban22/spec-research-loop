---
stt: 008
timestamp: 2026-08-16T12:00+07:00
model: claude-opus-5
scope: [backend/CLAUDE.md, frontend/CLAUDE.md, .agents/rules/code-style.md, CLAUDE.md]
---

## Prompt
về styles code, hay các rules khi coding trong mỗi source backend và frontend xem đã define gì chưa nhé, check kĩ cho tôi để list các rules best practice nhé (ngắn gọn để tôi có thể review nhanh, đưa nó vào rules ở mỗi sub folder tương ứng nhé

## Kết quả
Rà toàn bộ cấu hình đang có (eslint/prettier/tsconfig hai project) + luật code nằm rải trong
`docs/STACK.md`, `docs/DESIGN_SYSTEM.md` §7, `docs/ARCHITECTURE.md` §5. Viết mới `backend/CLAUDE.md`
(9 mục: đặt tên, ranh giới tầng, zod, lỗi, bảo mật, LLM, Prisma, log/test) và `frontend/CLAUDE.md`
(8 mục: naming/export, server-client, data, style, shadcn, ngôn ngữ, chất lượng UI) — chỉ nói cách
viết code, tham chiếu docs thay vì chép lại. Thêm `.agents/rules/code-style.md` trỏ ngược, và mục
Rules trong `CLAUDE.md` gốc. Mỗi file có "Cần chốt" liệt kê 3–4 gap cấu hình chưa xử lý.
