---
stt: 024
timestamp: 2026-08-24T22:54+07:00
model: antigravity
scope:
  - backend/src/project/project.service.ts
  - backend/src/project/project.service.spec.ts
  - frontend/src/components/steps/step-4.tsx
---

## Prompt

> when i click "Tôi thấy đủ tốt — sang bước chốt spec" url changes to step 5 but nothing changes

# 2026-08-24: Fix lỗi không chuyển được từ bước 4 sang bước 5

## Vấn đề
Khi người dùng bấm nút "Tôi thấy đủ tốt — sang bước chốt spec" ở bước 4, frontend chỉ thực hiện `router.push('/projects/:id/step/5')` để đổi URL, nhưng không báo cho backend biết là Project đã tiến sang `S5`.
Do logic bảo vệ của `StepPage` (chỉ hiển thị bước tối đa mà backend ghi nhận, tức là `S4`), React Component tự động render lại `<Step4 />` ngay cả khi URL là `/step/5`, gây ra hiện tượng "URL đổi nhưng giao diện không đổi".

## Nguyên nhân
Backend có cơ chế tự động chuyển bước (auto-advance) khi tất cả các decision của bước đó được `apply`. Tuy nhiên, nếu người dùng muốn "bỏ qua" các issue còn lại (hoặc nếu không có issue nào), sẽ không có decision nào được tạo ra và apply, dẫn đến project vĩnh viễn kẹt ở `S4`.
Tài liệu `ARCHITECTURE.md` có ghi nhận endpoint `PATCH /projects/:id` được phép sửa `step`, nhưng schema xác thực `patchProjectSchema` trong `backend/src/project/project.service.ts` lại bỏ sót trường này.

## Cách giải quyết
1. **Backend**: Thêm `step: projectStepSchema.optional()` vào `patchProjectSchema` và cập nhật logic `patch` trong `ProjectService` để cho phép cập nhật trực tiếp `step`. Sửa lại test case tương ứng trong `project.service.spec.ts` cho phép `step` được sửa.
2. **Frontend**: Cập nhật hàm xử lý click của nút "Sang bước chốt spec" trong `step-4.tsx`:
   - Gửi request `PATCH /projects/:id` kèm `{ step: 'S5' }`.
   - Chờ thành công -> Invalidate query để cập nhật lại dữ liệu trong cache.
   - Gọi `router.push('/projects/:id/step/5')` để chuyển trang.
