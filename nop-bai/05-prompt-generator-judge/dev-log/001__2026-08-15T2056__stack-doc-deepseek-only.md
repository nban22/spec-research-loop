---
stt: 001
timestamp: 2026-08-15T20:56+07:00
model: claude-opus-5
scope: [docs/STACK.md]
---

## Prompt
tạo 1 file về stack usage trong docs folder nhé, để note rõ stack sử dụng cho ai coding agent đọc nhé, về llm thì mvp chỉ dùng deepseek nhé, claude api mắc lắm mvp ko sponsor nổi

## Kết quả
Tạo `docs/STACK.md` — chốt toàn bộ stack cho coding agent: bảng chốt + danh sách cấm cài, ràng buộc cứng (cấm hardcode prompt, judge độc lập, log usage), mục LLM DeepSeek-only (model `deepseek-v4-pro`/`deepseek-v4-flash`, JSON mode không có strict schema nên bắt buộc wrapper `completeJson` retry + zod, prefix caching, 4 lớp bù rủi ro auditor cùng provider), cấu trúc repo, data model, env, lệnh, thứ tự triển khai.
