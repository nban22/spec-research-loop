---
stt: 025
timestamp: 2026-08-25T22:31+07:00
model: antigravity
scope:
  - backend/src/spec/spec.controller.ts
  - frontend/src/lib/use-project.ts
  - frontend/src/components/steps/step-2.tsx
---

## Prompt

> i clicked Dựng nhận xét cho bảng but nothing happens after it finishes running, can you check

# 2026-08-25: Fix lỗi giao diện Bảng Related Work không cập nhật (Mock Data Bug)

## Vấn đề
Ở Bước 2, khi người dùng bấm nút "Dựng nhận xét cho bảng", tiến trình `related-work` chạy ngầm trên LLM thành công và lưu kết quả vào database (`RelatedWorkRow`). Tuy nhiên, UI hoàn toàn không cập nhật mà vẫn hiển thị các dòng trống (với cột điểm yếu là dấu `—`).

## Nguyên nhân
Component `step-2.tsx` ở frontend chưa được kết nối API để lấy kết quả thật. Thay vào đó, nó đang dùng một mảng dữ liệu nháp (mock) được `map` trực tiếp từ danh sách nguồn (sources), và gán cứng trường `what_missing` là `'—'`. Do không có hook nào gọi lên backend lấy dữ liệu bảng, UI không bao giờ nhận biết được sự thay đổi của tiến trình LLM.

## Cách giải quyết
1. **Backend:** Mở thêm endpoint `GET /spec-versions/:id/related-work` trong `SpecController` để cho phép truy xuất các dòng `RelatedWorkRow` đã sinh (có include `source`).
2. **Frontend:**
   - Viết thêm hook `useRelatedWork` (bọc `useQuery`) trong `use-project.ts`.
   - Nhờ cơ chế `invalidateQueries(['spec-versions'])` có sẵn trong `useJobAction`, hook mới này tự động refetch sau khi job "Dựng nhận xét" chạy xong.
   - Sửa `step-2.tsx` để ưu tiên render dữ liệu từ hook thật, và chỉ dùng mock data (từ sources) làm fallback (Bản Preview) cho trải nghiệm người dùng trước khi họ kích hoạt LLM.
