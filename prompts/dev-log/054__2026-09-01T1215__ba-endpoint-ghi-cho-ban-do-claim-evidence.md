---
stt: 054
timestamp: 2026-09-01T12:15+07:00
model: claude-opus-5
scope:
  [
    backend/src/card-link/card-link.service.ts,
    backend/src/card-link/card-link.controller.ts,
    backend/src/card-link/card-link.module.ts,
    backend/src/card-link/card-link.service.spec.ts,
    backend/src/app.module.ts,
  ]
---

## Prompt
#15 A hay B là best practice?

đóng #16 + #18 kèm comment trỏ PR và tick epic #23 luôn. Làm #15 theo best practice

## Kết quả
Đóng #16 và #18 kèm comment trỏ PR #35/#36, tick hai dòng đó trong epic #23.

PR 1 của #15 — ba endpoint ghi mà bản đồ claim–evidence kéo thả cần:

```
POST   /cards/:id/sources
DELETE /card-sources/:id
DELETE /cards/:id
```

Ba endpoint này nằm ngoài phạm vi sở hữu của làn C. Cách xử lý chọn theo phản biện: **không** nhét
chúng vào chung PR frontend (giấu việc vượt ranh giới trong một PR lớn), cũng **không** chờ tiếp
(spec đã treo không phản hồi). Tách hai PR, và viết dưới dạng **module mới hoàn toàn**
`backend/src/card-link/` — không sửa một dòng nào trong file của người khác, chỉ thêm một dòng vào
cuối `app.module.ts` theo luật chung 4. Ai không đồng ý thì revert đúng module này.

Đã comment lên #15 báo trước, kèm thiết kế của cả ba endpoint, mời phản đối.

Ba quyết định đáng ghi:
- Cặp nối tay có `verifier_run_id: null` = **chưa kiểm**, khác `support_label: WEAK` = *đã kiểm và
  thấy yếu*. Theo tiền lệ `decision.service.ts:625-627`.
- `upsert` chứ không `create`: kéo thả thì thả trùng là chuyện thường, không được thành lỗi 500.
  Nhánh `update` rỗng để nối lại không xoá kết quả kiểm chứng đang có.
- Nguồn phải cùng dự án với thẻ — nối chéo dự án hợp lệ về khoá ngoại nhưng vô nghĩa về nghiệp vụ.

backend `lint 0 · build 0 · jest 309/309` (+10 test mới).
