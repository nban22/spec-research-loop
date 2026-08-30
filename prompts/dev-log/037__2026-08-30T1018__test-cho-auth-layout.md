---
stt: 037
timestamp: 2026-08-30T10:18+07:00
model: claude-opus-5
scope:
  [
    frontend/src/app/(auth)/layout.test.tsx,
    frontend/package.json,
    prompts/dev-log,
  ]
---

## Prompt
please remove this file

prompts/dev-log/037__2026-08-30T1013__sua-prompt-sai-o-dev-log-036.md

also why does this change not have any test?

## Kết quả
Xoá dev-log 037 cũ. Viết test cho `(auth)/layout.tsx` — pin ba hành vi: đã có phiên ⇒
`replace('/')` không render form · chưa đăng nhập ⇒ render form và không chuyển hướng · đang chờ
⇒ không chớp form. Muốn chạy được test phải thêm `@testing-library/dom` vào devDependencies:
nó là peer bắt buộc của `@testing-library/react` v16 nhưng chưa khai, nên cả 8 suite frontend
fail khi cài mới. Giờ 9 suite / 35 test xanh.
