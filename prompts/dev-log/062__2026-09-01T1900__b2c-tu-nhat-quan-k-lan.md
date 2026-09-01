---
stt: 062
timestamp: 2026-09-01T19:00+07:00
model: claude-opus-5
scope:
  [
    backend/src/judge/self-consistency.ts,
    backend/src/judge/judge.service.ts,
    backend/prisma/schema.prisma,
  ]
---

## Prompt

please continue working on the other 2 sub issues, we need this issue merged by tonight

## Kết quả

Hiện thực #45, cơ chế cuối của #8. `JudgeAttempt` là bảng phụ vì `JudgeRun` có
`@@unique([spec_version_id, judge_key, round])` mà luật 2 cấm sửa — nhờ vậy `JudgeRun` vẫn đúng 5
dòng mỗi vòng và bằng chứng độc lập cùng ngưỡng quorum không phải sửa gì. Chỉ chạy k=3 cho **một**
judge, chọn theo Δκ của #9 và **chỉ khi kiểm định null nói đáng kể**: 5 + 2 = **7 lời gọi thay vì
15**, có test ghim con số đó. Chưa có số đo hoặc không đáng kể ⇒ không bật cho ai, vì đoán sai là
trả giá gấp ba cho judge không có vấn đề. `consensusOf` generic nên issue đi qua nguyên vẹn, không
phải dựng lại và không cần `as`; dùng lại `titleSimilarity` chứ không viết hàm so khớp thứ hai.
Chốt: k=1 thì không lọc gì, lần chạy lỗi không vào mẫu số, cả k lần lỗi thì rơi về đường FAILED cũ.
514/514.
