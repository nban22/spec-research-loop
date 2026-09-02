---
stt: 061
timestamp: 2026-09-01T18:00+07:00
model: claude-opus-5
scope:
  [
    backend/src/generator/generator.service.ts,
    backend/src/generator/generator.service.spec.ts,
    frontend/src/components/steps/step-3.tsx,
    frontend/e2e/step3-no-estimate.spec.ts,
  ]
---

## Prompt
lỗi khi sinh kế hoạch thí nghiệm, mục kiểm tra tính khả thi không hiện bất kỳ điều gì
[kèm ảnh chụp bước 3: cột "Kiểm tra tính khả thi" chỉ có bốn ô xám trống]

sửa đi

## Kết quả
Chẩn đoán có bằng chứng trong DB, không phải suy đoán: **60 `ExperimentPlan` nhưng chỉ 57
`ResourceEstimate`**, và **5 job `GENERATE` FAILED** với `error_code: INTERNAL_ERROR`, message
đóng băng đúng tại chuỗi tiến độ `"Đang ước lượng tài nguyên…"`.

`generator.service.ts` dùng `.parse` — hàm **ném lỗi** — và nó nằm **sau** khi kế hoạch đã lưu.
Mô hình bịa `estimator_inputs` vì prompt hỏi số tham số model và mức lượng tử hoá, còn dự án đang
mở là một RCT y khoa (thiền chánh niệm vs vệ sinh giấc ngủ, 200 người, đo PSQI) — **không có model
nào cả**. Giá trị bịa rơi ra ngoài `positive()`/enum ⇒ job chết, kế hoạch mồ côi.

Sửa ba chỗ, tất cả đều **ngoài phạm vi làn C** — đã báo trước và mở PR riêng:

1. `generator.service.ts`: `safeParse`. Hỏng thì **giữ kế hoạch, bỏ ước lượng, job vẫn DONE**, và
   báo tiến độ nói rõ vì sao. Log tham số sai chứ không log toàn bộ output của model (§5).
2. `step-3.tsx`: skeleton chỉ hiện khi job **đang chạy**. Job dừng mà vẫn không có ước lượng thì
   nói thẳng bằng chữ. Skeleton nghĩa là "đang tải" — dùng nó cho trạng thái đã kết thúc là bắt
   người dùng chờ một thứ không bao giờ tới.
3. **Lỗi nặng hơn phát hiện thêm trong lúc sửa:** khối "Duyệt kế hoạch" khoá sau `hasEstimate`,
   nên một nghiên cứu không chạy trên mô hình sẽ **kẹt vĩnh viễn ở bước 3** — nút chốt không bao
   giờ hiện. Đổi cổng sang `hasPlan`; thanh tiến độ cũng vậy.

Thêm 4 test hồi quy: tham số hợp lệ lưu cả hai; không hợp lệ thì giữ kế hoạch bỏ ước lượng và
**không ném**; thiếu hẳn `estimator_inputs` cũng không chết; báo tiến độ nói rõ lý do.

**Người dùng hỏi lại "đã test bảo đảm work chưa" — câu trả lời trung thực lúc đó là *chưa*.**
Backend có 4 test, còn hai thay đổi ở frontend thì không có test nào, mà đó lại chính là phần
người dùng nhìn thấy hỏng. Bổ sung `e2e/step3-no-estimate.spec.ts` dựng đúng trạng thái
`has_experiment_plan: true` + `estimate: null`, khoá cả ba điều: nói rõ lý do thay vì skeleton,
vẫn chốt được kế hoạch, và kế hoạch không bị mất theo ước lượng.

Test đầu tiên viết ra **flaky**: đếm `.animate-pulse` trên cả trang nên bắt nhầm skeleton thoáng
qua của panel khác khi máy chậm — xanh khi chạy một mình, đỏ khi chạy song song. Khoanh vùng vào
đúng panel đang xét thì hết; đã chạy song song 4 lần liên tiếp, 6/6 mỗi lần.

backend `lint 0 · build 0 · jest 436/436` · frontend `tsc 0 · lint 0 · vitest 126/126 · build 0 ·
playwright 6/6`.
