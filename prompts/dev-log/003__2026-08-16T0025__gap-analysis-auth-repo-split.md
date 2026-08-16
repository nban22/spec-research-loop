---
stt: 003
timestamp: 2026-08-16T00:25+07:00
model: claude-opus-5
scope: [docs/STACK.md, .env.example]
---

## Prompt
giúp tôi check thông tin dự án xem còn thiếu gì nữa, thiếu stack, thiết design system, thiếu quyết định gì nữa để bạn có thể bắt đầu coding?

## Kết quả
Rà toàn repo, báo cáo khoảng trống (code mới ở mức scaffold, `prompts/` 0/6 file, chưa có design
system, STACK.md và SETUP.md mâu thuẫn về cấu trúc repo). Chốt 4 quyết định với user và cập nhật
`docs/STACK.md`: repo 2 project rời — bỏ `shared/`, thay bằng `backend/src/contracts/` + luật khai
lại type ở FE (§3.1); auth JWT access+refresh qua httpOnly cookie + proxy `rewrites()` của Next
(§11, vì `EventSource` không set được header); ngôn ngữ UI tiếng Việt / nội dung spec tiếng Anh
(§10); data model lên 13 bảng (thêm `User`, `RefreshToken`, `JobRun` vốn bị sót). Viết lại
`.env.example` cho khớp §6.
