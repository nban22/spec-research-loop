---
stt: 043
timestamp: 2026-08-30T16:56+07:00
model: claude-opus-5
scope:
  [
    backend/src/critique/ambiguity-lexicon.ts,
    backend/src/critique/critique.service.ts,
    backend/src/critique/ambiguity.spec.ts,
    backend/src/critique/critique.service.spec.ts,
    backend/src/decision/decision.service.ts,
    backend/src/app.module.ts,
  ]
---

## Prompt
fix them

## Kết quả
Sửa 6 lỗi do 4 subagent review PR #26 tìm ra. Nặng nhất: regex `AUX` thiếu `\b` nên khớp như
tiền tố (`do` ⊂ `document`) làm cờ oan hàng loạt; và `AMBIGUOUS` rò sang version con qua
`apply()` rồi bị ghi làm `previous_status`, mất vĩnh viễn trạng thái thật — nay version con bắt
đầu từ trạng thái gốc. Thêm `status:'AMBIGUOUS'` vào `where` của khôi phục để không đè sửa tay
người dùng, `safeParse` thay `as CardStatus`, lọc `step:'S1'` cho hạn mức, chỉ cờ nặng nhất trỏ
về câu hỏi, lọc cờ ma ở `listForVersion`. Thêm 9 test: mutation score cũ 46%, ba mutant nặng
nhất (ghi `AMBIGUOUS`, vòng `previous_status`, bỏ `clearForVersion`) đều sống sót — nay đều
chết. 198/198 xanh.
