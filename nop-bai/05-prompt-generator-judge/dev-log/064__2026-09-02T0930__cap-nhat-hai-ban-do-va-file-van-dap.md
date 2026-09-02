---
stt: 064
timestamp: 2026-09-02T09:30+07:00
model: claude-opus-5
scope: [docs/lane-c-map.html, docs/product-flow-map.html, docs/vandap.md, README.md, docs/handover.md]
---

## Prompt
điều chỉnh lại nội dung cho đúng với phiên bản mới nhất trong file @lan-c-map.html và file
@spec-research-loop/docs/product-flow-map.html. Sau đó tạo file .md trả lời các đầu mục sau: [12
câu vấn đáp về kiến trúc, mô hình AI, session, context, judge, xác minh nội dung, rework, demo,
chi phí] Nếu câu hỏi nào đã có nội dung trong folder @docs/ thì reference trực tiếp tới, không cần
viết lại

## Kết quả
### Hai bản đồ

Phát hiện khi bắt đầu: `main` đã merge `feat/english-ui-i18n` — **toàn bộ giao diện chuyển sang
tiếng Anh** — nên cả hai file đang trích những chuỗi UI không còn tồn tại. Thêm nữa, bản
`lane-c-map.html` trên `main` là bản **trước** khi bỏ chú thích PR: commit `f0f817f` chưa kịp vào
trước lúc PR #48 được merge. Đã lấy lại bản đó rồi mới sửa tiếp.

- Nhãn nav và chuỗi UI được trích đổi sang nhãn thật hiện tại (`Home` · `Projects` ·
  `Analyse idea` · `Build the experiment plan` · `Approve the plan` · `Link to…` ·
  `Topic map / Timeline / Citations`). Phần **narration vẫn tiếng Việt** — đây là tài liệu nội bộ.
- `product-flow-map.html` bước 3: thêm ba trạng thái ước lượng (`OK` · `NOT_APPLICABLE` ·
  `INVALID_PARAMS`), đường tự nhập tham số, và ghi rõ khối quyết định mở theo `hasPlan` chứ không
  theo `hasEstimate`.
- `lane-c-map.html`: thêm ô u13 — form tự nhập ước lượng dùng lại `SliderRow`/`QuantPicker` của
  màn mô phỏng chi phí, và nối vào endpoint có sẵn chưa ai gọi.
- Cả hai thêm một dòng ở header: giao diện sản phẩm là tiếng Anh, tài liệu này tiếng Việt.

Kiểm bằng Playwright thật trên Chromium: mở cả hai file, đổi hết tab, click node, panel hiện đúng
— 0 lỗi console.

### `docs/vandap.md`

Trả lời 12 câu, **trỏ sang `docs/` chỗ nào đã có** thay vì chép lại. Ba chỗ phải tự đo hoặc tự nói
thẳng:

1. **Không có bảng `Session`.** Câu hỏi giả định có; trả lời là `RefreshToken` giữ phiên đăng nhập,
   còn "phiên làm việc" chính là `Project → SpecVersion → Decision` trong DB — không có state nào
   sống trong RAM.
2. **Chi phí đo thật** trên `LlmCall` của 40 dự án: trung vị **~$0,02**/spec, nặng nhất **~$0,25**.
   Kèm cảnh báo đơn giá chưa xác nhận nguồn. Ngân sách đề xuất tách phần biến đổi (API) khỏi phần
   cố định (hạ tầng), và nói rõ khoản lớn nhất **không nằm ở cả hai**: người đọc lại nguồn.
3. **Tự đánh giá dùng thật được không** — trả lời thẳng là *dùng được cho một việc hẹp hơn tên gọi*,
   kèm ba chỗ chưa dùng được mà thêm code không sửa nổi.

Cuối file có mục "ba câu tao sẽ tự nêu trước khi bị hỏi", gồm cả câu **"vòng judge đóng góp gì" —
chưa có số trả lời**.
