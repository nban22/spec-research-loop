---
stt: 059
timestamp: 2026-09-01T17:30+07:00
model: claude-opus-5
scope:
  [
    backend/src/judge/debias.controller.ts,
    backend/src/judge/judge.module.ts,
    backend/src/judge/judge.service.ts,
  ]
---

## Prompt

please spawn a subagent to answer these in preparation for the seminar

## Kết quả

Bốn subagent đọc code trả lời 12 câu hỏi vấn đáp; một con tìm ra ba lỗi trong chính #43 vừa merge,
tôi kiểm lại và đúng cả ba. Nặng nhất: cờ `judge_debias` **được đọc mà không đường nào ghi được** —
`patchProjectSchema` là `.strict()`, không UI, không seed script ⇒ phép xáo thứ tự thẻ **chưa bao
giờ chạy**. Đúng loại lỗi review PR #32 bắt ở #9, soi ngược (lần đó cờ được ghi mà không ai đọc).
Thêm `DebiasController` (GET/PATCH, kiểm quyền 404-không-403), trả `shuffle_seed` ở endpoint bằng
chứng, và sửa comment nói sai *"0 token thêm"* — đúng về số lời gọi, **sai về giá** vì xáo thứ tự
làm vỡ prefix cache. Lần thứ ba trong ngày "test xanh, app hỏng": 453 test xanh mà app không boot
được vì thiếu `imports: [ProjectModule]`.
