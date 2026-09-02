---
stt: 068
timestamp: 2026-09-02T22:10+07:00
model: claude-opus-5
scope: [docs/vandap.md]
---

## Prompt
ở file vấn đáp, bổ sung phần reference tới dòng code thuộc file đang trả lời.

## Kết quả
Mỗi mục trả lời có thêm một bảng **Trỏ vào code**: cột trái là *khẳng định*, cột phải là
`đường/dẫn.ts:dòng` kèm **tên ký hiệu**. Có tên ký hiệu thì khi file trôi đi vẫn tìm lại được bằng
tên chứ không phải bằng số — đó là lý do không ghi trần số dòng.

Mười mục được gắn neo: §1.1 · §1.2 · §1.3 · §2.1 · §2.2 · §2.3 · §3.1 · §3.2 · §3.3 · §4.2.
(§4.1 là kịch bản demo, không có code để trỏ.)

Riêng §3.2 tách làm hai bảng vì hai thứ khác nhau: **các tầng verifier** đều nằm trong cùng một hàm
nên chỉ cần `:dòng`, còn phần **chặn xuất bản** trải trên ba file.

**Kiểm bằng script, không kiểm bằng mắt:** 49 cặp (file, dòng, chuỗi phải có trên đúng dòng đó),
chạy lại được. **49/49 đúng.** Trong đó có cả một khẳng định *phủ định* — §2.1 nói "không có bảng
`Session`" nên script quét cả `schema.prisma` để chắc là thật sự không có.

**Một chỗ sai nội dung phát hiện được nhờ chính việc gắn neo:** §2.2 và §3.1 đều viết 5 judge chạy
bằng `Promise.all`. Code là **`Promise.allSettled`**, và khác biệt đó không phải tiểu tiết — nó
chính là thứ giữ cho một judge chết không kéo theo bốn kết quả kia, mà bốn kết quả đó đã tốn tiền
thật và đã xong. Đã sửa cả hai chỗ.
