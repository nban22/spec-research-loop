---
stt: 070
timestamp: 2026-09-02T23:40+07:00
model: claude-opus-5
scope: [docs/api-components.md, docs/vandap.md]
---

## Prompt
cho ví dụ về - `spec_json` — toàn bộ spec dựng lại từ DB: 14 mục, thẻ, bảng related work, kế hoạch thí nghiệm.
- `sources_json` — danh sách nguồn **đã nằm trong kho của dự án**, kèm id. Judge chỉ được nói về
  nguồn trong danh sách này.

## Kết quả
`docs/api-components.md` §4.2 — ví dụ **lấy từ DB thật**, không bịa: chạy `buildSpecJson` +
`sourcesForPrompt` trên `spec_version` `9613659e` rồi trích ra. Đây đúng là chuỗi đã đưa cho cả 5
judge trong lượt chạy đó: **121 189 byte** · 19 thẻ · 22 cặp claim–nguồn · 25 nguồn · 14 mục.

Dùng dữ liệu thật vì nó nói được ba thứ mà một ví dụ bịa không nói được:

1. **`payload` đổi hình dạng theo `type`** — `CLAIM` có bốn trường (metric/baseline/evidence/
   refutation_condition), `GAP` có bốn trường **khác hẳn**, `CONSTRAINT` là `null`. Đó chính là lý
   do cột đó để kiểu `Json` chứ không tách cột, và ràng buộc hình dạng nằm ở zod chứ không ở DB.
2. **Một cặp `SUPPORTED` có `evidence_sentence: null`.** Không phải thiếu dữ liệu — nó đi đường tắt
   ở `verifier.service.ts:430` nên **L4 chưa từng chạy**. Nhãn `SUPPORTED` đó tốn **0 token**. Một
   ví dụ bịa gần như chắc chắn sẽ điền một câu trích dẫn vào đấy và dạy sai cả cơ chế.
3. **Nguồn đầu danh sách nói về béo phì trẻ em**, trong một dự án về giấc ngủ người cao tuổi. Nó
   nằm đó vì được trích dẫn nhiều nhất, không phải vì liên quan. Đây là chỗ làm rõ `sources_json`
   là **danh sách trắng để chặn bịa**, không phải thư mục tài liệu đã tuyển chọn — và bắt một claim
   trích vào đúng cái nguồn đó chính là việc của J4.

Kèm luôn ca `NOT_APPLICABLE` của dev-log 062: `estimate_status` · `resource_estimate: null` · mục 11
*Compute budget* `present: false` — ba thứ khớp nhau, và **phải** khớp, nếu không judge nhìn `null`
mà không biết đó là *"chưa chạy"* hay *"không áp dụng được"*.

Phân bố nhãn thật: **18 `WEAK` · 2 `SUPPORTED` · 2 `UNSUPPORTED`**, phần lớn `WEAK` mang cờ
`CITATION_ONLY` — đúng như chốt loại thẻ ở `verifier.service.ts:340`. Và **7/25 nguồn có `abstract`
rỗng**, tức sẽ dính `EMPTY_ABSTRACT` ở L1.

**Kiểm bằng script đối chiếu ngược với bản dump: 21/21 con số khớp.** Sửa một chỗ mơ hồ tự phát
hiện: viết "~121 KB" trong khi 121 189 byte là 121 KB hệ 1000 nhưng 118 KiB — đổi sang ghi thẳng số
byte.

`docs/vandap.md` §3.1 thêm một dòng trỏ sang, không chép lại.
