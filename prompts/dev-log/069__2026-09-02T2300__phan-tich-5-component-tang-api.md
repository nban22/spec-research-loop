---
stt: 069
timestamp: 2026-09-02T23:00+07:00
model: claude-opus-5
scope: [docs/api-components.md, README.md, docs/handover.md, backend/CLAUDE.md]
---

## Prompt
tạo file phân tích chi tiết 5 components trong API — NestJS 11 của file @spec-research-loop/docs/product-flow-map.html . Tôi muốn biết về luồng hoạt động step by step, giải thích techstack làm gì, technical design và các thông tin liên quan kèm reference đến các đoạn code tương ứng

## Kết quả
`docs/api-components.md` — phân tích năm ô trong vùng **API — NestJS 11**, tab *Projects*:
`jobs + SSE` · `generator` · `verifier` · `judge` · `decision`.

Mỗi component có bốn phần cố định: **bảng endpoint** → **luồng step-by-step** → **techstack (cái gì
làm gì, vì sao chọn)** → **technical design (quyết định và đánh đổi)**.

Ba chỗ đáng nói về cách tổ chức:

1. **`jobs` đặt trước tiên** dù nó không phải bước đầu của người dùng — bốn component kia đều đứng
   trên nó, và khuôn `create → runInBackground → return { jobId }` chỉ cần giải thích một lần.
2. **Mở đầu bằng §0 ba luật chung** (controller mỏng · service không biết HTTP · zod là hệ validate
   duy nhất) vì gần như mọi quyết định trong năm mục sau là **hệ quả** của chúng, không phải lựa
   chọn riêng của từng module.
3. **§7 là bảng chỗ có thể vỡ**, phân biệt rõ *cố ý* (không có nút huỷ job) với *đang nợ*
   (`job.busy` mất khi F5) với *chấp nhận ở quy mô hiện tại* (kênh SSE nằm trong RAM một tiến trình).

Ưu tiên giải thích **vì sao** hơn **là gì**, và mỗi "vì sao" đều dẫn về comment có thật trong code
— ví dụ vì sao chốt loại thẻ của verifier đặt *sau* L0–L2 chứ không phải trước (trích dẫn của một
gap vẫn phải có thật), hay vì sao version con phải bắt đầu từ trạng thái gốc thay vì chép cả
`AMBIGUOUS` (chép thì mất vĩnh viễn trạng thái thật).

**Kiểm bằng script: 115 neo (file, dòng, chuỗi phải nằm đúng dòng đó) — 115/115 đúng.** Tám neo lần
đầu báo sai đều là neo trỏ vào một **khoảng** bắt đầu bằng dòng mở `/**`; đó là cách trích đúng cho
một quyết định có docblock, nên sửa đầu dò chứ không sửa neo.

**Một chỗ sai phát hiện thêm:** `backend/CLAUDE.md` §6 vẫn ghi 5 judge chạy bằng `Promise.all` —
cùng lỗi vừa sửa ở `docs/vandap.md` (dev-log 068). Đây là **file rule**, tức chỗ sai này còn dạy sai
cho lượt sửa code sau, nên sửa luôn kèm lý do.
