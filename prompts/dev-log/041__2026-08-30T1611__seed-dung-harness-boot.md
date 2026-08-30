---
stt: 041
timestamp: 2026-08-30T16:11+07:00
model: claude-opus-5
scope:
  [
    backend/eval/seed-overclaim-demo.ts,
    backend/eval/seed-ambiguity-demo.ts,
    backend/src/critique/ambiguity.ts,
    backend/src/app.module.ts,
  ]
---

## Prompt
yes fix both

also review the MR to make sure we dont have similar issues

## Kết quả
Hai script seed tự parse `.env` rồi `new PrismaClient()`, trong khi `eval/harness.ts` đã có
`boot()` trả `PrismaService` đã cấu hình và `backend/CLAUDE.md` §2 cấm `new PrismaClient()`.
Sửa cả hai: bản B6 trong PR #26, bản B1 (đã merge) trên branch `fix/seed-dung-harness`. Soát
thêm PR #26 thì thấy `ambiguity.ts` tự viết hàm tách câu trùng mục đích với `splitSentences()`
của `common/text.ts` — giữ bản riêng vì bản chung lọc `length >= 20` sẽ vứt mất câu ngắn cần
bắt, nhưng ghi rõ lý do vào code. Merge `main` vào PR #26, xử xung đột `app.module.ts` do làn B
và làn C cùng thêm dòng cuối mảng `imports`.
