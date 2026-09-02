---
stt: 066
timestamp: 2026-09-02T17:00+07:00
model: claude-opus-5
scope: [docs/kich-ban-trinh-bay.md, README.md, docs/handover.md]
---

## Prompt
Cung cấp 2 scripts để tôi trình bày với giảng viên về 2 file @spec-research-loop/docs/lane-c-map.html và @spec-research-loop/docs/product-flow-map.html

## Kết quả
`docs/kich-ban-trinh-bay.md` — hai kịch bản độc lập, mỗi cái 6–8 phút.

Mỗi kịch bản là một **bảng tuyến đi**: thời lượng · click ô nào · nói gì · **câu chốt**. Câu chốt là
phần đáng giá nhất — nói xong là chuyển, không nói thêm; đó là thứ giữ cho một buổi trình bày không
tràn giờ.

- **Kịch bản 1** (`product-flow-map.html`): 8 ô, đi từ trang chủ tới bảng đối chiếu 16 chức năng.
  Dừng lâu ở B3 (ba trạng thái ước lượng) và B4 (5 judge độc lập).
- **Kịch bản 2** (`lane-c-map.html`): 8 ô qua cả bốn tab, kèm một ô tuỳ chọn nếu còn thời gian —
  ô "Đối chiếu chéo mô hình", chỗ **ghi điểm** chứ không phải chỗ giấu.

Mỗi kịch bản có mục **câu giảng viên hay hỏi** kèm trả lời ngắn, và mục **ba điều đừng làm** —
trong đó có "đừng đọc panel bên phải thành lời" (người nghe đọc nhanh hơn nghe) và "đừng click quá
8 ô" (bản đồ có gần 40 node).

Cuối file có một câu dùng được cho **mọi câu hỏi chưa có số trả lời**, và nó **thật**: hạ tầng để
đo chạy được rồi, còn thiếu một lần chạy máy, đã ghi ở `handover.md` §4.

Kiểm bằng script: **mọi tên tab và tên node được dẫn trong kịch bản đều tồn tại thật** trong hai
file HTML — không có chỗ nào bảo người trình bày click vào thứ không có.

**Một chỗ lệch phát hiện được nhưng chưa sửa** (ngoài phạm vi turn này): docstring của
`frontend/src/app/(app)/projects/[id]/map/page.tsx` vẫn ghi "citation graph chưa có" — câu đó đúng
lúc viết, nhưng citation graph đã làm xong ở PR #42 và bản dịch sang tiếng Anh chỉ dịch lại câu cũ.
