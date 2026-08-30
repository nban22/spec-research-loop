---
stt: 046
timestamp: 2026-08-30T16:09+07:00
model: claude-opus-5
scope: [backend/src/analytics, frontend/src/app/(app)/projects/[id]/errors, frontend/src/components/command-palette.tsx]
---

## Prompt
tiếp tục quay lại main và impl issue kế tiếp

## Kết quả

Issue **#19 · C6 · Phân tích lỗi trực quan** — task thứ hai của làn C. Nhánh `c6/error-analysis`
tách từ `main` (không nối tiếp `c4/cost-dashboard` đang chờ review).

Số dev-log là **046**: lúc soạn nhánh này `main` mới tới 039 nên đặt 041, nhưng trong lúc làm thì
đồng đội đẩy lên 041–044 (041 thành `seed-dung-harness-boot`). Đổi số khi rebase để không có hai
file cùng số trên `main` — hook `prompt-guard` cảnh báo dev-log trùng số.

**Backend — `src/analytics/error-analysis.service.ts` (mới, chỉ đọc)**

`errorAnalysis(projectId, userId)` trả hai tầng dữ liệu:

- `runs[]` — mọi `VerifierRun` của dự án, mỗi dòng kèm **ngưỡng của chính lần chạy đó**
  (`tau_low`, `tau_high`, `conf_min`…), `l4_ratio`, `unsupported_ratio`.
- `current` — ma trận **cờ × loại thẻ** và **nhãn × loại thẻ** của phiên bản hiện hành, cộng số
  cặp đã được người dùng ghi đè lý do ở verifier gate.

**Frontend — route `/projects/[id]/errors`**, thêm nhóm lệnh "Phân tích" vào `command-palette.tsx`
(`top-nav.tsx` ngoài phạm vi sở hữu của làn C).

### Phát hiện phải ghi lại: dữ liệu có HAI độ phân giải

`verifier.service.ts:140-150` gọi `cardSource.update` mỗi lần chạy ⇒ `CardSource.flags` và
`support_label` bị **ghi đè**, dữ liệu mức từng cặp của lần chạy cũ **không phục dựng được**.
`VerifierRun` thì giữ nguyên `config` · `label_counts` · `units_total` · `units_l4` cho từng lần.

| Tầng | Nguồn | Phạm vi thời gian |
| --- | --- | --- |
| Cờ × loại thẻ · Nhãn × loại thẻ | `CardSource` | **chỉ lần chạy gần nhất** |
| So sánh trước/sau đổi ngưỡng | `VerifierRun` | **mọi lần chạy** |

Issue viết như thể cả hai đều so được theo thời gian. Không giấu chỗ này: có `HintBox` tông `warn`
ngay trên hai bảng ma trận nói rõ chúng là ảnh chụp hiện tại. Trình bày ma trận cặp như thể nó
thuộc một lần chạy quá khứ là nói dối bằng giao diện.

### Ba quyết định

1. **Bảng cờ là bảng *đếm*, bảng nhãn là bảng *phân hoạch*.** Một cặp mang nhiều cờ cùng lúc nên
   tổng ô cờ lớn hơn số cặp; ghi chú thẳng dưới bảng và có test khoá lại.
2. **Endpoint theo dự án**, không theo version — issue nói "hai `VerifierRun` của cùng một *dự án*".
3. **Chuẩn bị cho lúc merge với #17**: `analytics/` chưa có trên `main` nên phải tạo lại, nhưng
   logic của #19 nằm ở file riêng. Khi #17 merge, chỉ `analytics.module.ts` conflict và conflict
   là hai dòng import cộng hai phần tử mảng — docblock của module ghi rõ điều đó.

### Test — 9 case mới

Mock Prisma ném lỗi nếu ai gọi `create`/`update`/`delete`. Case đáng chú ý nhất mô phỏng đúng kịch
bản issue: hạ `tau_high` 0.72 → 0.68 thì `l4_ratio` 90% → 40% và `unsupported_ratio` 30% → 10%.
Kèm: bảng cờ đếm lần xuất hiện · luôn đủ 7 dòng cờ · bảng nhãn tổng bằng số cặp · `flags` sai kiểu
thì bỏ qua không sập · mẫu số 0 trả `null` chứ không `NaN` · dự án người khác trả `notFound` ·
mọi truy vấn mang `user_id`.

**Không đụng:** `backend/src/verifier/**`, bảng `CardSource` và `VerifierRun` (chỉ đọc),
`prisma/schema.prisma` (không migration), `frontend/src/components/ui/**`, `status-style.ts`
(chỉ đọc `VERIFIER_FLAG_LABEL`).

`eslint` BE 0 · `nest build` 0 · `jest` **160/160** · FE `tsc` 0 · `eslint` 0 · `next build` 0
(route `ƒ /projects/[id]/errors`) · `vitest` 39/39.
