---
stt: 027
timestamp: 2026-08-27T22:16+07:00
model: claude-opus-5
scope: [frontend/src/app/globals.css, frontend/src/components, frontend/src/app/(app)]
---

## Prompt
chỉ làm duy nhất light mode. Áp dụng các đề xuất revamp. Yêu cầu sau khi thay đổi code, cung cấp command line để run local. Tôi phải xem qua UI ở local duyệt mới được push lên github

## Kết quả

Revamp UI, **giữ nguyên light mode** (bỏ hẳn đề xuất dark mode). Chín nhóm thay đổi:

**Token — `globals.css`**
- Thêm `--ease-out-quart` / `--ease-spring`: trước đây mọi transition dùng mặc định trình duyệt.
- Thêm `--shadow-lift` (ám sắc `brand`) cho trạng thái rê chuột trên thứ bấm được.
- Thêm `--text-2xs` (11px) — thay 13 chỗ dùng `text-[10px]` / `text-[11px]` rải rác; thang chữ
  chốt ở sáu nấc, không còn cỡ tuỳ tiện nào.
- Thêm keyframe + `--animate-rise` (opacity + 6px) cho phần tử xuất hiện lần đầu.
- Thêm khối `prefers-reduced-motion` ở `@layer base` — tắt **toàn bộ** chuyển động, không trừ
  component nào.

**Sáu trạng thái cho phần tử bấm được** — `ProjectCard` (trước đây là cả một card bọc `<Link>`
mà không có trạng thái nào), `SpecCard` (vạch màu dày thêm khi hover), hàng `IssueTable` và
`RelatedWorkTable` ở cả hai breakpoint, `SourceChip`, `Stepper`, nav `TopNav`, logo, avatar,
`ExperimentPlanList`, `StatTileGrid`, nhóm `CardBoard`.

**Skeleton khớp layout** — thêm `TableSkeleton` · `StatTileSkeleton` · `JudgePanelSkeleton` vào
`states.tsx` và nối vào B2 (bảng related work), B3 (bốn ô ước lượng ở pha 2 của job), B4 (năm thẻ
judge khi chưa biết đã chạy hay chưa, thay vì hiện "Chưa chạy").

**Empty state theo ngữ cảnh** — `EmptyState` nhận `icon` + `tone`; sáu chỗ rỗng đổi từ icon `Inbox`
dùng chung sang `Lightbulb` / `Search` / `Beaker` / `Gavel` / `ShieldCheck` theo đúng thứ đang thiếu.

**Số liệu thẳng cột** — `tabular-nums` cho `ProjectCard`, nút lọc `CardBoard`, `ConsensusMeter`,
`StatTileGrid`, `SpecChecklist`, `Stepper`, cột agreement của `IssueTable`.

**Bảng lệnh ⌘K / Ctrl+K** — `command-palette.tsx` mới, dựng trên `Dialog` + lọc React thuần,
**không thêm dependency**. Tìm không dấu (gõ "du an" ra "Dự án"), điều hướng bàn phím ↑↓↵,
ba nhóm lệnh: điều hướng · mở dự án · nhảy bước. Gắn ở `(app)/layout.tsx`, nút mở ở `TopNav`.

**Dùng lại primitive có sẵn** — `ScrollArea` cho abstract dài trong `SourceChip`, `Separator` cho
kẻ ngang của `Panel` (kèm field `rule` vì `Separator` vẽ bằng `bg-*`, không phải `border-*`).

**Xoá 5 primitive chết** — `alert` `card` `popover` `radio-group` `tabs` (0 chỗ dùng ngoài `ui/`).

**Không đụng:** backend · `prompts/` · `lib/status-style.ts` · `lib/types.ts` · dark mode (không làm).
Giữ nguyên ba luật: 0 class màu thô ngoài `status-style.ts`, nhãn chữ luôn hiện ở 375px, không
tắt vòng focus.

`tsc --noEmit` exit 0 · `eslint` sạch · `vitest run` 8 file / 32 test pass · `next build` pass.
