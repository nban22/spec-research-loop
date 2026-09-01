---
stt: 049
timestamp: 2026-09-01T11:20+07:00
model: claude-opus-5
scope:
  [
    frontend/src/lib/use-judge-agreement.ts,
    frontend/src/lib/kappa-reason-contract.test.tsx,
    frontend/src/components/judge-agreement-panel.tsx,
    frontend/src/components/judge-agreement-panel.test.tsx,
  ]
---

## Prompt

what is Kappa Reason APIKappa are we calling an external api or what

## Kết quả

Trả lời: `Api` là quy ước sẵn có của dự án cho hình dạng JSON backend trả về (`ApiCard`, `ApiSource`,
`ApiOverclaimFlag` đã có trước), không phải API bên thứ ba — 0 lời gọi ngoài, 0 LLM. Nhưng khi kiểm
để trả lời thì lộ lỗi thật: backend sinh 5 `KappaReason`, frontend chỉ khai 4, thiếu
`MALFORMED_COUNTS`; panel dùng chuỗi `? :` kết thúc bằng `else` trần nên lỗi dữ liệu hiện thành
"Chưa có thẻ nào để đo" — sai sự thật và che đúng vấn đề cần thấy. Đổi sang
`Record<KappaReason, string>` để TypeScript **từ chối biên dịch** nếu thiếu lý do, thêm chốt hợp đồng
đọc thẳng mã nguồn backend so hai union (đã kiểm: bỏ một giá trị thì chốt đỏ và nêu đích danh). Đây
là lần thứ ba loại lỗi chép-tay-giữa-hai-package cắn trong cùng tính năng.
