---
stt: 034
timestamp: 2026-08-29T15:48+07:00
model: claude-opus-5
scope: [frontend/src/components/overclaim-panel.tsx]
---

## Prompt
when i hover over the items i want cursor pointer

## Kết quả
Thêm `cursor-pointer` (và `cursor-not-allowed` lúc đang lưu) cho ba nút đường ra ở panel cờ
phóng đại — Tailwind v4 bỏ cursor mặc định của `<button>`. Dùng đúng cặp class mà
`option-list.tsx` đang dùng. `Button` của shadcn đã có sẵn nên hai nút kia không phải sửa.
