---
stt: 071
timestamp: 2026-09-03T00:20+07:00
model: claude-opus-5
scope: [docs/api-components.md]
---

## Prompt
trình bày chi tiết nội dung sau kèm refer code: [bảng 9 chốt chặn của `verifyUnit` — L0 · L1 · L2 · chốt loại thẻ · L3 · L3b · L4 · L4b · L5]

## Kết quả
`docs/api-components.md` §3.2 — mỗi chốt một mục, **giữ nguyên bảng tóm tắt ở §3.1** để người đọc
vẫn có cái nhìn một trang trước khi vào chi tiết.

Nội dung mới không nằm trong bảng cũ, xếp theo độ đáng nói:

- **L0 trả `boolean | null`, ba giá trị chứ không hai.** `null` = *"chưa biết"*, khác hẳn *"không
  tồn tại"*. Chỉ khi **cả Crossref lẫn DataCite đều trả lời và đều nói không có** mới kết luận
  `false` — `source.client.ts:266`. Và phải có DataCite vì **DOI arXiv/Zenodo đăng ký ở đó chứ không
  phải Crossref**.
- **L1 có hai phép thử ở hai mức khác nhau**: `EMPTY_ABSTRACT` bật `capWeak`, còn `STALE_SOURCE`
  **cố tình không** — một bài 2015 vẫn có thể là bằng chứng đúng cho claim không nói về tính mới.
- **L2 bỏ hai loại số**: năm 1900–2099 không đơn vị, và số nguyên ≤ 10 không đơn vị. Đây là chỗ
  phân biệt một luật dùng được với một luật kêu suốt ngày.
- **Chốt loại thẻ**: hai tập hợp `VERIFIABLE_CARD_TYPES` (4 loại) và `ENTAILMENT_CARD_TYPES` (2
  loại) và **khoảng chênh giữa chúng chính là chốt**. Lý lẽ trong `card.ts:82-90` đắt hơn cả con số:
  với `CONTRIBUTION`, một bài cũ mà **kéo theo được** đóng góp thì nghĩa là đóng góp **không mới** —
  `ENTAILS` đáng ra là **tín hiệu xấu**, ngược hẳn cách bảng L5 dùng.
- **L3 có hai đường tắt**, và chúng mới là thứ giữ cho L4 rẻ. Nối thẳng về ví dụ §4.2: cặp
  `SUPPORTED` có `evidence_sentence: null` vì đi đường tắt `:430`, tốn **0 token**.
- **L3b**: bốn lý do trả `null` nhưng cờ chỉ bật ở hai — gắn cờ cho "không phải arXiv" thì **60% số
  cặp** mang một cờ vô nghĩa, mà một cờ ai cũng có là cờ không nói gì. Và L2 chạy lại trên
  **abstract + đoạn đã chọn**, không phải abstract (thì toàn văn vô dụng) cũng không phải cả tài
  liệu (thì check 0-token mạnh nhất thành vô nghĩa).
- **L4**: `reason` có `.default('')` vì nó **chỉ để người đọc hiểu**, thiếu nó không đổi nhãn — cho
  mặc định thay vì tốn nguyên một lượt retry. Phát hiện khi chạy batch thật.
- **L4b nói một câu về thiết kế**: tầng **đắt nhất bị tầng rẻ nhất kiểm lại**. Không có nó thì cả
  thang năm tầng vẫn kết thúc bằng "tin lời mô hình".
- **L5**: thứ tự sáu luật **là** ngữ nghĩa. Luật 3 (`capWeak`) đứng trước mọi verdict tốt của L4 —
  rule 0 token đứng **trên** LLM, không phải ngược lại. Và `SUPPORTED` là nhánh **cuối cùng**: mặc
  định của hệ thống là *chưa chứng minh được*.

**Kiểm bằng script 87 neo — sau khi sửa: 87/87 đúng.** Chín neo trong khối `tryFullText` tao ghi
theo ước lượng chứ không tra, và **cả chín đều lệch 1–6 dòng**; đã sửa bằng số thật. Một chỗ tao
"sửa" nhầm cái đang đúng (`enums.ts:94-97`) và đã trả lại.
