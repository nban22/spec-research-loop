---
stt: 036
timestamp: 2026-08-30T10:13+07:00
model: claude-opus-5
scope: [frontend/src/app/(auth)/layout.tsx]
---

## Prompt
after you are done with this issue, please help create a new issue and work on it. right now even when you have authenticated you can still go to this page

https://dsa-bus-booking.io.vn/login

## Kết quả
Tạo issue #25 rồi sửa luôn trên branch `fix/auth-redirect-when-logged-in`: thêm
`(auth)/layout.tsx` đối xứng với `(app)/layout.tsx`, hỏi `/auth/me` rồi `replace('/')` nếu đã có
phiên, hiện skeleton trong lúc chờ để không chớp form. Không dùng middleware đọc cookie: cookie
`httpOnly` chỉ cho biết *có mặt*, không cho biết còn hạn, nên sẽ tạo vòng lặp với token hết hạn.
Lint + build frontend xanh.
