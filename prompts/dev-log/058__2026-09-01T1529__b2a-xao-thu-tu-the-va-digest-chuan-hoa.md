---
stt: 058
timestamp: 2026-09-01T15:29+07:00
model: claude-opus-5
scope:
  [
    backend/prisma/schema.prisma,
    backend/prisma/migrations/20260901083724_b_judge_debias_shuffle,
    backend/src/judge/prng.ts,
    backend/src/judge/card-shuffle.ts,
    backend/src/judge/judge.service.ts,
    backend/src/judge/judge-independence.spec.ts,
  ]
---

## Prompt

please break into 3 issues then work on them

## Kết quả

Tách #8 thành #43 (xáo thứ tự thẻ) · #44 (chuẩn hoá thang điểm) · #45 (tự nhất quán k=3), lý do là
ba cơ chế có hồ sơ rủi ro khác nhau hẳn — gộp chung thì hai cái miễn phí bị giữ làm con tin bởi cái
đắt gấp ba và có thể phải cắt. Hoàn thành #43: digest băm dạng chuẩn hoá thứ tự nên 5 judge vẫn cùng
digest dù thấy 5 thứ tự khác; seed suy tất định từ `(digest, judge_key, round)` nên dựng lại được
từng byte đầu vào của từng judge, và người kiểm chứng tự tính lại đối chiếu được. Phát hiện test
`judge-independence.spec.ts` — file đề bài chấm như bằng chứng độc lập — là **tautology** (`map` qua
5 judge nhưng bỏ qua phần tử, băm một chuỗi 5 lần), đã viết lại để gọi đúng hàm production. Chạy
thật trên spec 11 thẻ: 5 seed khác, 5 thứ tự khác, digest khớp cả 5, dựng lại J3 khớp từng byte.
Backend 448/448.
