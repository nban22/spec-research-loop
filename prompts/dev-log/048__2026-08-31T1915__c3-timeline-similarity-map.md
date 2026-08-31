---
stt: 048
timestamp: 2026-08-31T19:15+07:00
model: claude-opus-5
scope:
  [
    backend/src/analytics/similarity.ts,
    backend/src/analytics/source-map.service.ts,
    backend/src/analytics/source-map.controller.ts,
    backend/src/analytics/analytics.module.ts,
    frontend/src/components/source-map.tsx,
    frontend/src/app/(app)/projects/[id]/map/page.tsx,
    frontend/src/components/command-palette.tsx,
    frontend/src/lib/api.ts,
  ]
---

## Prompt
bước tiếp theo làm gì

Làm hết từ tất cả các bước luôn đi

## Kết quả
Issue #16 (C3) — timeline nghiên cứu + similarity map, chỉ đọc.

Backend: `similarity.ts` là hàm thuần (TF-IDF → cosine → MDS cổ điển 2 chiều → độ thưa quanh mỗi
điểm). **Không** gọi `EmbedderService` của làn A theo ràng buộc độc lập của issue. MDS chọn thay
t-SNE vì tất định, không thêm dependency, và giữ khoảng cách toàn cục — đúng phần mà "vùng thưa"
cần đọc. `source-map.service.ts` đọc `Source` + đếm `CardSource`, trả `nodes` (toạ độ, độ thưa,
số claim đang trích, nguồn gần nhất) và `timeline` không điền khoảng trống.

Frontend: route mới `/projects/[id]/map` + `source-map.tsx` vẽ SVG viết tay (không thêm thư viện
biểu đồ). Chấm là `<g role="button">` để tới được bằng bàn phím; chi tiết hiện bằng chữ dưới bản
đồ chứ không tooltip. Lối vào qua bảng lệnh vì `top-nav.tsx` ngoài phạm vi làn C.

**Citation graph không làm trong issue này**: nó cần trường `references` mà `S2_FIELDS`
(`sources/source.client.ts:29`) không xin, sửa thì phải đụng `backend/src/sources/**` — nằm ngoài
phạm vi #16. Issue đã cho phép hoãn.

backend `lint 0 · build 0 · jest 232/232` · frontend `tsc 0 · lint 0 · vitest 59/59 · build 0 ·
playwright 3/3`.
