---
stt: 062
timestamp: 2026-09-01T23:00+07:00
model: claude-opus-5
scope:
  [
    backend/src/contracts/estimator.ts,
    backend/src/contracts/llm-io/generator.ts,
    backend/src/estimator/estimator.service.ts,
    backend/src/generator/generator.service.ts,
    backend/src/project/project.controller.ts,
    backend/src/spec/spec.types.ts,
    prompts/generator_experiment.md,
    frontend/src/components/estimate-form.tsx,
    frontend/src/components/steps/step-3.tsx,
  ]
---

## Prompt
đã test bảo đảm work thành công chưa

kiểm hết đi, phản biện tìm ra best practice và impl

## Kết quả
Chạy job thật bằng LLM thật trên đúng dự án đã hỏng, rồi cho một agent phản biện độc lập đọc bản
vá. Nó bắt được **một lỗ hổng nguy hiểm hơn cái đang vá**, và bản vá cũ bị đánh giá là **vá sai
tầng**.

### Lỗ hổng nghiêm trọng nhất: nhánh `safeParse` gần như không bao giờ chạy

`LlmService.completeJson` thử lại 3 lượt và **nhét nguyên lỗi zod ngược lại cho model**. Với một
RCT y khoa, model không có cách nào "sửa cho đúng" ngoài **bịa ra 7B/int8**. Lúc đó mọi schema đều
pass, và bước 3 hiện một con số VRAM hư cấu **như thể đã tính**. Skeleton treo thì người dùng biết
là hỏng; "16 GB, $12.40" cho một thí nghiệm thiền chánh niệm thì người dùng **tin**.

### Vá đúng tầng

1. **Một schema, một sự thật.** Có **hai** schema cho cùng `estimator_inputs` — bản trong
   `experimentOutputSchema` khai `z.number()` ở chỗ bản gốc khai `.positive()`. Giá trị lọt ngoài
   rồi chết trong, sau khi kế hoạch đã lưu. Chuyển sang `contracts/estimator.ts`, cả ba nơi dùng
   chung.
2. **`estimator_inputs` thành `.nullable()`** + `estimator_note`. "Không áp dụng" từ *tai nạn
   parse* trở thành **một giá trị hợp lệ**.
3. **Prompt rule 8** (version 1 → 2) cho model đường ra trung thực, kèm ví dụ JSON thứ hai với
   `null` — không có ví dụ thì model chỉ bắt chước ví dụ duy nhất đang có.
4. **Ghi trạng thái xuống** `plan.estimate_status` (`OK` · `NOT_APPLICABLE` · `INVALID_PARAMS`),
   0 migration. Trước đó giao diện suy từ sự vắng mặt của `ResourceEstimate` — mà sự vắng mặt gộp
   bốn ca cần bốn câu nói khác nhau. Bản vá cũ **nói dối** cho 3 hàng cũ trong DB: chúng thuộc ca
   tham số hỏng, không phải "không phải thí nghiệm tính toán".
5. **Ghi một lần**: `upsert` chuyển xuống sau khi biết kết quả parse, không còn cửa sổ nào mà DB
   có kế hoạch nhưng chưa có trạng thái.
6. **Nối `POST /projects/:id/estimate`** — endpoint có sẵn từ lâu, chưa nơi nào gọi. Ca
   `INVALID_PARAMS` giờ mời người dùng tự nhập bằng `estimate-form.tsx`, dùng lại `SliderRow` và
   `QuantPicker` của màn mô phỏng chi phí.
7. **Ẩn phương án B** khi không có ước lượng. `Decision` là dữ liệu đầu vào của `eval/`; ghi vào
   đó "người dùng chọn giảm quy mô" cho dự án không có quy mô nào là làm bẩn đúng bảng dùng để đo.
8. `GET /estimate/preview` cũng dùng `.parse` trên query của người dùng → 500 thay vì 400. Đã sửa.
   Câu "ngoại lệ duy nhất còn sót" ở commit trước vì thế **sai**, và giờ mới đúng.

### Test viết lại

Hai test cũ khoá **hành vi không tồn tại**: chúng mock thẳng `completeJson` nên bỏ qua
`experimentOutputSchema`, trong khi production thì dữ liệu hỏng ở tầng ngoài đã chết từ trước.
Bộ mới chạy JSON thô **qua schema thật**, và e2e phủ đủ bốn trạng thái gồm cả ca "chưa rõ".

### Kiểm thật

Chạy lại job với LLM thật trên dự án Sleep: `STATUS: NOT_APPLICABLE`, và model tự viết
*"The binding resource is participant recruitment and retention across three parallel randomized
controlled trials … not computational model training."* Trước bản vá nó bị ép trả `0`.

### Còn để lại, có chủ ý

`job.busy` không sống qua F5 (`jobId` nằm trong `useState`, `GET /projects/:id` không trả job đang
chạy). Sửa đúng là trả `active_job_id` từ server — việc đó sửa một lớp lỗi cho **mọi bước**, nên
tách riêng. Nhánh "chưa rõ" ở bước 3 là lưới đỡ: nó **không khẳng định gì**.

backend `lint 0 · build 0 · jest 439/439` · frontend `tsc 0 · lint 0 · vitest 126/126 · build 0 ·
playwright 9/9`.
