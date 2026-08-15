---
name: writing-skills
description: Ràng buộc khi viết hoặc sửa SKILL.md. Dùng khi được yêu cầu
  tạo skill mới, sửa skill, viết rule, hoặc viết instruction cho agent.
---

## Trước khi viết
Hỏi: skill này bù đắp gap nào mà model chưa có? Nếu không nêu được
gap cụ thể, dừng lại và báo là không cần skill.

## Ràng buộc cứng
- SKILL.md < 500 dòng. Vượt → tách file, link một tầng từ SKILL.md.
- description < 1536 ký tự, viết ngôi thứ ba, use case chính đứng đầu,
  gồm cả "làm gì" và "khi nào dùng".
- name: chữ thường/số/gạch ngang, ưu tiên dạng gerund (processing-pdfs).
- Đường dẫn luôn dùng dấu /.

## Mức tự do — chọn đúng một
- Cao: nhiều cách đúng → chỉ nêu hướng, không liệt kê bước.
- Trung bình: có pattern ưu tiên → pseudocode/script có tham số.
- Thấp: thao tác dễ hỏng → lệnh chính xác + "không được sửa".

## Chống dài dòng
Với mỗi đoạn: model đã biết điều này chưa? Nếu rồi, xóa.
Không giải thích khái niệm phổ thông. Không viết lý do trừ khi lý do
thay đổi cách hành động.

## Chống nông
Mỗi bước phải verify được. Nếu bước nào không có cách kiểm chứng,
hoặc bổ sung cách kiểm chứng, hoặc bỏ bước đó.

## Cấm
- Reference lồng quá một tầng.
- Nhiều hơn một lựa chọn cho cùng một việc (cho 1 default + 1 escape hatch).
- Mốc thời gian trong nội dung chính.
- Thuật ngữ không nhất quán.

## Sau khi viết
Đề xuất 3 eval case: 2 should-trigger, 1 should-not-trigger.