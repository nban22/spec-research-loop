---
stt: 011
timestamp: 2026-08-16T15:12+07:00
model: claude-opus-5
scope: [docs/IMPLEMENTATION_PROMPT.md]
---

## Prompt
cho tôi 1 fully prompt, có refer các docs để ai coding agent ở fresh session sử dụng được optimize để implements end to end nhé, (đã có DATABASE_URL, DEEPSEEK_API_KEY) còn về SEMANTIC_SCHOLAR_API_KEY thì đã request, tôi sẽ bổ sung sau)

## Kết quả
Tạo mới `docs/IMPLEMENTATION_PROMPT.md` — prompt khởi động cho agent ở phiên mới, 10 mục: thứ tự đọc
6 tài liệu, hiện trạng repo chính xác (backend/frontend mới chỉ là scaffold trống, chưa có Prisma/
shadcn/dependency), xử lý thiếu `SEMANTIC_SCHOLAR_API_KEY` (optional env + fallback OpenAlex, thêm key
sau không phải sửa code), 10 ràng buộc cứng, cảnh báo hook `prompt-guard` (6 file prompt phải ra đời
cùng một turn), thứ tự 8 phase trỏ về `ARCHITECTURE.md` §8, phần giao diện nhấn 3 khối đề bắt buộc mà
mockup không vẽ, 9 quyết định đã chốt + 4 mặc định không chờ xác nhận, 4 lệnh tự kiểm, và 4 câu hỏi
kiểm tra hiểu bài trước khi code. Không sửa file nào khác.
