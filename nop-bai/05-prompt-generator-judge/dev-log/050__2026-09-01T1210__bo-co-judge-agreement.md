---
stt: 050
timestamp: 2026-09-01T12:10+07:00
model: claude-opus-5
scope:
  [
    backend/prisma/schema.prisma,
    backend/prisma/migrations/20260831090000_b_judge_agreement,
    backend/src/judge/agreement,
    backend/eval/seed-agreement-demo.ts,
    frontend/src/components/judge-agreement-panel.tsx,
    frontend/src/lib/use-judge-agreement.ts,
  ]
---

## Prompt

can we not go with the feature flag route and just implement this feature in place?

## Kết quả

Bỏ cờ `Project.judge_agreement`. Kiểm trước khi khuyên: lý lẽ nền của luật chung 1 là **cần gạt
ablation** cho #13, nhưng grep toàn backend cho thấy không gì tiêu thụ số đo để đổi hành vi — #9
chỉ hiển thị, tắt panel thì bản spec sinh ra không khác một chữ, nên không có gì để ablate. Cộng
thêm: không có API nào ghi cờ `Project`, nên "mặc định tắt" = tính năng vô hình trừ khi gõ SQL.
Cột chưa có trên main nên sửa migration thẳng (không thêm add-rồi-drop), drop cột ở DB local cho
khớp, `prisma migrate status` sạch. Bỏ luôn `enabled` khỏi response, nhánh `flagOff` ở panel, và
3 test của nhánh cờ. Chạy thật: GET chỉ còn khoá `agreement`, κ = 0.1811 và p = 0.0290 giữ nguyên,
`LlmCall` 10 → 10. Backend 293/293 · frontend 92/92 · E2E 3/3.
