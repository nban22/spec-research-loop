---
stt: 059
timestamp: 2026-09-01T16:20+07:00
model: claude-opus-5
scope:
  [
    backend/eval/label-sample.ts,
    backend/eval/results/label-sample.json,
    backend/package.json,
    docs/evaluation_report.md,
    docs/handover.md,
  ]
---

## Prompt
gán nhãn tay như thế nào

tự động chấm luôn đi

## Kết quả
Đã nói trước với người dùng: model chấm thì **không còn là human validation**, và ghi nhãn của
model vào cột `human_label` rồi báo cáo là "đã validate bằng người" là bịa bằng chứng. Làm theo
phiên bản hợp lệ — **đối chiếu chéo mô hình**, vì `claude-opus-5` khác nhà cung cấp với DeepSeek,
đúng lỗ hổng §5.5 của báo cáo đang ghi là không làm được.

`eval/label-sample.ts` — xuất mẫu mù ra JSON rồi nạp lại. Lấy mẫu phân tầng **có bù** (phân bố
thật lệch nặng: `SUPPORTED` chỉ 1 cặp trên 473), vứt nhãn máy trước khi ghi file, xáo bằng seed cố
định. `--by` **bắt buộc** và ghi vào `HumanCheck.note`.

Chấm mù 30 cặp, nạp vào DB, chạy `calibrate.ts`. Ba phát hiện, viết vào §C.12:

1. **Gộp chung κ = −0,002; tách theo loại thẻ thì ngược hẳn.** Trên **CLAIM** — loại thẻ phép kiểm
   được thiết kế cho — khớp **4/5**. Bất đồng tập trung ở CONTRIBUTION (1/14): claim dạng *"We
   develop…"* là lời hứa sẽ làm, không phải phát biểu về thế giới; hai bên hiểu khác nhau về định
   nghĩa chứ không bất đồng về sự thật.
2. Hệ thống **đã có luật** cho đúng chuyện đó (`CITATION_ONLY`), nhưng thêm muộn và không áp ngược:
   410 hàng GAP/CONTRIBUTION cũ vẫn chạy L4. Mẫu rút từ điều kiện `entailment != null` nên **toàn
   hàng cũ** — bảng ở ① mô tả hành vi trước luật.
3. **`calibrate.ts` không thể hiệu chỉnh `τ` từ dữ liệu đã lưu.** Cả 27 tổ hợp ngưỡng cho số giống
   hệt nhau tới từng chữ số. `τ` chỉ quyết định *có gọi L4 hay không*; có `entailment` rồi thì nhãn
   suy từ `entailment`. Mà replay chỉ chạy được với cặp **đã có** `entailment`. Hai điều kiện loại
   trừ nhau. Đây là vấn đề thiết kế của làn A, đã ghi đường ra trong §C.12.

`DEFAULT_THRESHOLDS` **không đổi** — lần này có lý do đo được, không phải vì ngại.

Sản phẩm bàn giao #4 và #6 **giữ nguyên ⚠️** trong `handover.md`, ghi rõ vì sao.

backend `lint 0 · build 0 · jest 371/371`.
