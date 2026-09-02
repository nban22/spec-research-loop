---
stt: 055
timestamp: 2026-09-01T13:55+07:00
model: claude-opus-5
scope:
  [
    frontend/src/components/claim-evidence-map.tsx,
    frontend/src/app/(app)/projects/[id]/claim-map/page.tsx,
    frontend/src/lib/use-card-link.ts,
    frontend/src/components/command-palette.tsx,
  ]
---

## Prompt
đóng #16 + #18 kèm comment trỏ PR và tick epic #23 luôn. Làm #15 theo best practice

## Kết quả
PR 2/2 của #15 — toàn bộ frontend, dựa trên ba endpoint ở PR #38.

Route mới `/projects/[id]/claim-map`: cột trái là mọi nguồn của dự án, cột phải là các thẻ `CLAIM`,
mỗi claim là một vùng thả. Kéo nguồn vào claim để nối; kéo một liên kết sang claim khác để chuyển;
kéo xuống vùng "gỡ" để tháo.

Bốn quyết định:

- **`@dnd-kit` chứ không HTML5 Drag and Drop API**: API gốc không chạy trên cảm ứng và không có
  đường đi bằng bàn phím. `KeyboardSensor` là thứ duy nhất làm kéo thả dùng được với trình đọc
  màn hình.
- **Kéo thả không phải đường duy nhất**: mỗi nguồn có nút "Nối vào…", mỗi liên kết có nút gỡ, mỗi
  thẻ có nút xoá. Một tính năng chỉ dùng được bằng cách kéo là tính năng không dùng được bằng ngón
  tay run hay trackpad tệ.
- **Chuyển claim = nối trước, gỡ sau**. Nếu lệnh gỡ hỏng thì bằng chứng vẫn còn ở đâu đó — mất
  liên kết tệ hơn thừa liên kết.
- **Chỉ lọc `CLAIM`**, không gộp `CONTRIBUTION`: contribution là lời hứa về đóng góp, không phải
  phát biểu cần nguồn đỡ; gộp vào thì mọi thẻ contribution hiện ra như "claim treo".

Claim chưa có nguồn nào vẽ viền cảnh báo và nói thẳng bằng chữ — đó là câu hỏi màn hình này sinh
ra để trả lời.

Test khoá **hợp đồng**, không test cơ chế kéo thả: jsdom không dựng được toạ độ chuột và phép đo
bố cục nên test kéo thả ở đó chỉ cho cảm giác an toàn giả.

Hai chỗ tự sửa: `Panel` không có accent `warn` (chỉ `brand/ok/decide/neutral`) → dùng `decide`;
nhãn `SupportTag` giữ nguyên tiếng Anh theo CLAUDE.md §6 nên test sửa kỳ vọng.

`tsc 0 · lint 0 · vitest 92/92 · build 0 · playwright 3/3`. `@dnd-kit` cài bằng npm 10.9.8 —
lockfile chỉ thêm 56 dòng, xoá 0.
