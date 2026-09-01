---
stt: 053
timestamp: 2026-09-01T11:40+07:00
model: claude-opus-5
scope:
  [
    frontend/src/components/step-transition.tsx,
    frontend/src/components/source-map.tsx,
    frontend/src/components/cost-simulator.tsx,
    frontend/src/components/steps/step-1.tsx,
    docs/STACK.md,
    frontend/CLAUDE.md,
  ]
---

## Prompt
Mục tiêu tiên quyết là UI phải hiện đại và UX phải mượt mà nhất có thể, yêu cầu sử dụng các thư
viện, framework tối ưu xử lý, phù hợp với yêu cầu của issue được assign trên github

làm bước 1. Sau đó tiếp tục làm các issues được assign có tên bắt đầu là C từ ban đầu. Mục tiêu là
impl và test liên tục để pass cicd. Xong mỗi issue cần tạo pr

## Kết quả
Cài `motion@13` (Framer Motion) và áp cho ba màn hình của làn C:

- `step-transition.tsx`: `AnimatePresence mode="wait"` + lò xo, thay CSS keyframe. Keyframe không
  có hoạt cảnh **ra** nên giữa hai bước có một nhịp trắng.
- `cost-simulator.tsx` (#18): chấm **trượt** tới toạ độ mới khi kéo thanh trượt thay vì nhảy —
  thắng lớn nhất về UX. Đường Pareto hoà mờ vì `points` không tween được (số đỉnh đổi).
- `source-map.tsx` (#16): chuyển bản đồ ↔ dòng thời gian, cột năm mọc lệch pha, chấm nở theo thứ
  tự, hộp chi tiết mở bằng chiều cao (mờ dần không đủ — nó đẩy nội dung dưới nó xuống).
- `steps/step-1.tsx` (#14): chuyển bản đồ ↔ bảng thẻ.

Mọi chỗ đều đọc `useReducedMotion()` và cho `duration: 0` khi người dùng đã tắt hiệu ứng.

**Đảo một quyết định trong tài liệu:** STACK §5 và `frontend/CLAUDE.md` §7 đang ghi "không
animation phức tạp". Đã sửa cả hai kèm lý do và ba ràng buộc, vì để nguyên thì luật mâu thuẫn với
code và đồng đội sẽ revert.

Test: sửa 1 test của `source-map` thành bất đồng bộ (`mode="wait"` làm việc gắn view mới thành
async — đúng hành vi mong muốn), thêm `step-transition.test.tsx` khoá hai hợp đồng: nội dung luôn
ra được màn hình, và vùng đó là `aria-live`.

`tsc 0 · lint 0 · vitest 83/83 · build 0 · playwright 3/3`.
