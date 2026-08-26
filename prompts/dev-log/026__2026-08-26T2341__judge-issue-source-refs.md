---
stt: 026
timestamp: 2026-08-26T23:41+07:00
model: claude-opus-5
scope: [frontend/src/components/judge.tsx, frontend/src/components/judge.test.tsx, frontend/src/components/steps/step-4.tsx]
---

## Prompt
sửa đi

## Kết quả

Sửa B4 sau khi phân tích vì sao 16/16 issue group đều là `1/5`: năm judge phụ trách năm phạm vi
rời nhau và prompt cấm lấn sân (`prompts/judge_*.md`, khối `## USER`), nên `1/n` là trần toán học
chứ không phải bất đồng.

**`frontend/src/components/judge.tsx`**

- `DisagreementNote` — sửa **bug**: `{5 - keys.length}` hardcode 5 → `judges_completed -
  agreement_count`. Mẫu số sai khi có judge lỗi, và mâu thuẫn với `{agreement_count}/{judges_completed}`
  hiện ngay cột bên cạnh trong cùng một hàng.
- `DisagreementNote` — viết lại câu chữ: bỏ "4 judge còn lại không nhắc tới · Cân nhắc trước khi
  sửa" (hàm ý bốn judge kia đã xem và thấy ổn), thay bằng phạm vi của judge lấy từ `JUDGE_META`
  và câu nói rõ không nhắc tới ≠ đã xem.
- `ConsensusMeter` — nhãn đổi thành "Đồng thuận cao nhất: x/y judge" cho khớp giá trị mới truyền vào.
- `JudgePanel` — thêm một câu vào dải chú giải: mỗi Judge phụ trách một khía cạnh riêng nên
  phần lớn vấn đề chỉ do một Judge nêu.
- **Mới**: `SOURCE_REF` / `indexByPrefix` / `referencedSources` — tra ngược `source_id` rút gọn
  8 ký tự mà judge viết trong `reason` về `ApiSource`. Chuỗi 8 chữ số thuần (ngày tháng) bị loại
  bằng `/[a-f]/`.
- **Mới**: `SourceRefList` — chip nguồn dưới mỗi `reason`, dùng lại `SourceChip` (Dialog có
  abstract + DOI kèm trạng thái tra cứu + nút mở nguồn gốc). Id tra không ra hiện chip cảnh báo
  "không có trong kho nguồn" thay vì hiện nguyên văn như thể có thật.
- **Mới**: `LinkedReason` — trong Dialog "Đọc thêm" thì link thẳng ra ngoài (`url`, fallback
  `https://doi.org/<doi>`), không lồng Dialog thứ hai.
- `ReasonCell` nhận thêm `sources`; chip đặt **ngoài** vùng bấm của "Đọc thêm" vì đoạn
  `line-clamp-3` đã là một `<button>`.
- `IssueTable` nhận prop `sources`, truyền xuống cả nhánh `≥ md` lẫn nhánh mobile (nhánh mobile
  trước đây render `reason` trần, giờ dùng chung `ReasonCell`).

**`frontend/src/components/steps/step-4.tsx`**

- Thêm `useSources(projectId)` — cùng `queryKey` với B2 nên lấy từ cache, không thêm round-trip.
- Sửa **bug**: `ConsensusMeter agreement={groups[0]?.agreement_count}` → `Math.max(0, ...groups.map(…))`.
  `groups` sort theo severity chứ không theo agreement, nên `groups[0]` là nhóm nặng nhất chứ
  không phải nhóm đồng thuận nhất — thanh đứng trên cả bảng mà hiện số của một hàng.
- Truyền `sources` vào `IssueTable`.

**`frontend/src/components/judge.test.tsx`**

Từ 1 test lên 7: tra ngược source_id · id lạ → chip cảnh báo · ngày tháng 8 chữ số không bị nhận
nhầm · mẫu số `judges_completed` thay vì 5 · câu chữ mới · ẩn khi ≥ 2 judge.

Không đụng backend, `prompts/`, `prisma/schema.prisma`, `lib/types.ts`, `sources.tsx`.
`tsc --noEmit` exit 0 · `eslint` sạch · `vitest run` 8 file / 32 test pass · `next build` pass.
