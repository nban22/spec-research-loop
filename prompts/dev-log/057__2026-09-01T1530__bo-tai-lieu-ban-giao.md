---
stt: 057
timestamp: 2026-09-01T15:30+07:00
model: claude-opus-5
scope: [docs/handover.md, README.md]
---

## Prompt
vào #20 luôn đi. Phần quay video tôi sẽ thêm sau. Làm xong và chủ động tạo PR merge

## Kết quả
Issue #20 (C7) — `docs/handover.md`, ba phần:

1. **Bảng đối chiếu 10 sản phẩm bàn giao** của §6 đề bài. Ba mức: Đủ / Đủ hình thức / Thiếu —
   **cố ý không có mức "gần xong"**, vì gần xong là cách tự nói dối về tiến độ. Kết quả: 4 đủ,
   5 đủ hình thức, 1 thiếu (video).
2. **Kịch bản video** 14 cảnh đi hết B1→B5, dừng ở ba điểm nhấn ba làn. Kèm ba điều đừng làm:
   đừng tua phần chờ (mâu thuẫn với màn chi phí ở cảnh 12), đừng giấu bước hỏng, đừng đọc kịch
   bản thành lời. Có phương án dự phòng nếu vòng chạy không sinh ra overclaim nào.
3. **Bản đồ tài liệu** — người chấm đọc file nào trước, và ba làn chia việc theo ranh giới nào.

Phát hiện đáng nói khi đối chiếu: **bốn dòng ⚠️ đều chặn bởi cùng một thứ** — chưa chạy batch đầy
đủ. Không phải bốn việc riêng mà là một lần chạy máy. Ghi rõ thứ tự bắt buộc
`eval:run → eval:audit → eval:score → eval:cost`; `audit` phải trước `score` vì auditor chấm blind.

Thêm §5 tự đánh giá ba chỗ yếu: chưa validate bằng người, ngưỡng `τ` là số chọn chứ không phải số
đo, và không tái lập được hoàn toàn vì DeepSeek không có `seed`.

Không đụng phần báo cáo của làn A và làn B, đúng ràng buộc của issue. README thêm một dòng trỏ tới
file mới.
