---
stt: 058
timestamp: 2026-09-01T15:15+07:00
model: claude-opus-5
scope:
  [
    frontend/src/components/research-flow.tsx,
    frontend/src/app/(app)/page.tsx,
    backend/src/analytics/citation-graph.ts,
    backend/src/analytics/source-map.service.ts,
    frontend/src/components/source-map.tsx,
  ]
---

## Prompt
các bước sáng tạo tôi làm nếu có là gì? Tôi có thể làm thêm các bước sáng tạo nào nữa mà yêu cầu đang gợi ý không

làm animation và citation graph đi

## Kết quả
Hai mục *Khuyến khích sáng tạo* còn trống của đề.

**1. Animation mô tả luồng nghiên cứu** (Bước 1) — `research-flow.tsx`, gắn vào trang chủ ngay dưới
ô nhập ý tưởng. Sáu chặng, mỗi chặng vẽ đúng thứ chặng đó sinh ra (thẻ, chấm nguồn, đường nối,
huy hiệu judge, tài liệu) chứ không phải sáu ô đổi màu. Tự chạy nhưng **dừng được**, và sáu nút
thật để nhảy thẳng tới từng chặng. `prefers-reduced-motion` thì **không tự chạy**.

**2. Citation graph** (Bước 3) — phần tao hoãn ở #16, nay làm được **mà không cần đụng
`sources/**`**. Phát hiện: truy vấn OpenAlex (`source.client.ts:204-205`) không có tham số
`select` nên trả về cả object work, và `normalizeOpenAlex` lưu nguyên nó vào `Source.raw` — tức là
`referenced_works` **đã nằm sẵn trong DB từ ngày đầu**, chưa ai đọc. Cùng mô típ với `LlmCall` ở
issue #17.

`citation-graph.ts` là hàm thuần trong `analytics/`, chỉ đọc. Đồ thị vẽ ở tab thứ ba của `/map`,
**dùng lại đúng toạ độ MDS** của bản đồ chủ đề nên chuyển tab thì nút đứng nguyên chỗ — đọc được
"hai paper gần nhau về chủ đề *và* có trích dẫn nhau".

Giới hạn ghi thẳng lên hình, không giấu cuối trang: chỉ nguồn OpenAlex mới có dữ liệu trích dẫn,
nên `coverage` (bao nhiêu/tổng) hiện ngay cạnh đồ thị. Nút rỗng nghĩa là **chưa biết**, không phải
"không trích ai" — hai kết luận trái ngược nhau.

Hai chỗ tự sửa: bỏ `AnimatePresence` ở phần chữ và phần hình của animation (hoạt cảnh **ra** làm
nội dung mới phải chờ mới được gắn, trình đọc màn hình và test đều thấy khoảng trống); fixture của
`source-map.service.spec.ts` thiếu ba trường mới.

backend `lint 0 · build 0 · jest 371/371` (+15) · frontend `tsc 0 · lint 0 · vitest 108/108 (+10) ·
build 0 · playwright 3/3`.
