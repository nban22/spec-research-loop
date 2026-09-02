---
stt: 044
timestamp: 2026-08-30T17:12+07:00
model: claude-opus-5
scope:
  [
    backend/src/critique/clarify-questions.ts,
    backend/src/critique/ambiguity.spec.ts,
  ]
---

## Prompt
please include in 26

## Kết quả
Ghép `finding.reason` vào đầu câu hỏi làm rõ. `Decision` chỉ có `question` và `options` nên
trước đó `AmbiguityFlag.reason` không có đường nào ra giao diện — người dùng thấy nhãn
`AMBIGUOUS` và một câu hỏi trống ngữ cảnh. Tách khung câu hỏi thành `buildQuestionCore` để chỗ
ghép chỉ có một. Việc này cũng làm mô tả PR #26 thành đúng: nó vốn tuyên bố "câu hỏi mang nguyên
reason của cờ" trong khi code không hề dùng `reason`. Hai test ghim, bỏ dòng ghép thì 2 test đỏ.
200/200 xanh.
