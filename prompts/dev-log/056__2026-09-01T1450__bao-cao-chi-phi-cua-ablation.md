---
stt: 056
timestamp: 2026-09-01T14:50+07:00
model: claude-opus-5
scope:
  [
    backend/src/analytics/eval-cost.ts,
    backend/src/analytics/eval-cost.spec.ts,
    backend/eval/cost-report.ts,
    backend/eval/pricing.json,
    backend/package.json,
    docs/evaluation_report.md,
  ]
---

## Prompt
tạo thêm 1 agent đánh giá thiết kế trên và phản biện để tìm ra best practice

ok làm đi

## Kết quả
Hạ tầng cho phần đóng góp của làn C vào deliverable #8: **đo chi phí của mỗi bậc kiến trúc trong
ablation 4 arm**. Chưa tốn một lời gọi LLM nào — code + test + khung báo cáo xong, chờ batch.

Thiết kế đã qua phản biện của một agent độc lập và **sửa hai chỗ sai nghiêm trọng**:

1. Bỏ chỉ số "USD trên mỗi +0.1 citation_validity". `citation_validity` đếm cờ `SOURCE_NOT_FOUND`,
   mà mọi nguồn của B2/SYS/SYS_NO_VERIFY đều có `external_id` nên không bao giờ bị gắn cờ đó —
   con số 1.000 của B2 là **hằng số theo cấu trúc**, và mẫu số của tỉ số bằng 0 ở 2/3 phép so.
2. Không gọi `B1→B2` là "giá của retrieval": nó gộp cả đổi model tier, reasoning effort, số lời
   gọi, và **chi phí của chính cái thước** (verifier chạy vai đo cho mọi arm).

- `src/analytics/eval-cost.ts` — hàm thuần: `costOf` (đơn giá theo model, cache-hit rẻ hơn),
  `costByArm` (median/IQR, hai cột `usd_total`/`usd_system`), `costShare` (theo bước và prompt),
  `pairedDiff` (hiệu theo cặp ý tưởng + bootstrap CI tất định). **Không** `@Injectable`, không
  đăng ký vào module — chỉ mượn `analytics/` để jest quét được.
- `eval/cost-report.ts` — đọc `results/<batch>.json` của `score.ts` để lấy **đúng tập lượt đó**,
  rồi join `LlmCall` theo `project_id`. Join theo `eval_run_id` là bẫy: `harness` không truyền nó
  xuống, chỉ auditor mới gắn, nên sẽ ra bảng chỉ chứa chi phí auditor mà trông hợp lý. Có kiểm
  chéo với `EvalRun.total_tokens`, lệch quá 0.1% thì cảnh báo.
- `eval/pricing.json` — bảng giá là **tham số**, không hằng số thứ ba trong `src/`. Ghi rõ đơn giá
  chưa có nguồn, và được chép vào file kết quả.
- `docs/evaluation_report.md` — thêm PHỤ LỤC C (C.0–C.11) theo quy ước phụ lục của làn A. Có mục
  "kết luận ĐƯỢC rút / KHÔNG được rút", giả thuyết ghi trước (gồm cả một giả thuyết tao nói thẳng
  là yếu), và limitation riêng. Thêm việc 7–8 vào §6.

backend `lint 0 · build 0 · jest 356/356` (+22 test mới).
