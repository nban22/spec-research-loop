---
stt: 049
timestamp: 2026-08-31T21:15+07:00
model: claude-opus-5
scope:
  [
    frontend/src/components/cost-simulator.tsx,
    frontend/src/app/(app)/projects/[id]/simulate/page.tsx,
    frontend/src/app/(app)/projects/[id]/map/page.tsx,
    frontend/src/lib/use-debounced.ts,
    frontend/src/lib/api.ts,
    frontend/src/components/command-palette.tsx,
  ]
---

## Prompt
đã merge PR vừa tạo và git pull từ nhánh main. Tiếp tục bước tiếp theo

## Kết quả
Issue #18 (C5) — mô phỏng chi phí + đường Pareto, thuần frontend.

Route mới `/projects/[id]/simulate`: thanh trượt cho 5 tham số, số liệu cập nhật theo thời gian
thực qua `GET /projects/:id/estimate/preview` **đang có** — không thêm endpoint, không chép công
thức của `EstimatorService` sang frontend. Cái giá là mỗi cấu hình một lời gọi; chấp nhận được vì
endpoint là hàm thuần 0 I/O và TanStack cache với `staleTime: Infinity`.

Biểu đồ: X = chi phí, Y = VRAM, **vạch 24 GB vẽ thẳng lên trục** kèm vùng tô đỏ phía trên. Lưới
36 cấu hình (4 cỡ model × 3 mức lượng tử hoá × 3 mức ngân sách tìm kiếm) — phải có trục ngân sách
vì chi phí *chỉ* đổi theo nhóm đó. `downscale_suggestion` của hệ thống được áp lên cấu hình đang
chọn rồi vẽ thành một chấm xanh lá bấm được.

Hai chỗ tự sửa trong lúc làm:
- `qualityProxy` ban đầu bỏ qua `quantization` ⇒ int4 và fp16 cùng cỡ model hoà điểm, cả hai cùng
  trụ trên frontier và đường Pareto zigzag dọc. Đã trừ điểm theo mức lượng tử hoá.
- `HintBox` render raw nên `**...**` hiện đúng dấu sao. Lỗi này đã lỡ vào `main` ở trang `/map`
  (#16) — sửa luôn ở đây bằng `<strong>`.

frontend `tsc 0 · lint 0 · vitest 74/74 · build 0 · playwright 3/3` · backend `jest 232/232`
(không đụng backend).
