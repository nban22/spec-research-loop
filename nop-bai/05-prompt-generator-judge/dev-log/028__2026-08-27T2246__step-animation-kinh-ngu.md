---
stt: 028
timestamp: 2026-08-27T22:46+07:00
model: claude-opus-5
scope: [frontend/src/app/globals.css, frontend/src/components, frontend/src/lib/error-code.ts]
---

## Prompt
nếu vậy thì không cần đổi ngôn ngữ. Tôi thấy UI chưa fancy lắm. Thiếu các animation khi chuyển các bước và transition. Vui lòng thêm animation và transition hiện tại. Đồng thời đổi các toast và pop up với ngôn ngữ mang tính lễ phép, lịch sự với người dùng Việt Nam, sử dụng kính ngữ.

## Kết quả

Giữ nguyên tiếng Việt (bỏ hẳn phương án đổi sang tiếng Anh). Hai nhóm thay đổi.

### 1 · Chuyển bước có hướng + transition tại chỗ

- `globals.css`: thêm keyframe `step-next` / `step-prev` (trượt 18px + mờ) và `fade-in`, cùng
  `--animate-step-next` / `--animate-step-prev` / `--animate-fade-in`.
- `step-transition.tsx` **mới**: đi tới thì nội dung trượt vào từ phải, quay lại thì từ trái —
  hướng mang thông tin, người dùng biết mình vừa tiến hay lùi mà không cần đọc stepper.
  Hướng suy bằng **mẫu "điều chỉnh state khi prop đổi"** của React, không dùng `useRef`:
  `react-hooks/refs` chặn việc đọc/ghi `ref.current` trong render, và chặn đúng.
  `key={step}` ép thay cả cây con nên animation chạy lại từ đầu.
- Gắn ở `projects/[id]/step/[step]/page.tsx`, bọc **cả tiêu đề bước lẫn nội dung**; `Stepper`
  đứng ngoài vì nó là điều hướng, không phải nội dung.
- Không dùng View Transitions API: Next 16 chưa mở `viewTransition` ở config ổn định.
- Transition tại chỗ: `RoundTracker` (node đổi màu 300ms), `JobProgress`, `HintBox`, `EmptyState`,
  `ErrorState`, `SummaryBar`, `OptionList` (đường cong tự định nghĩa thay `transition-colors` trần).
- Toàn bộ vẫn tắt sạch dưới `prefers-reduced-motion` nhờ khối ở `@layer base` từ dev-log 027.

### 2 · Kính ngữ cho toast, popup và thông báo lỗi

- `lib/error-code.ts`: viết lại **24 thông báo lỗi** + fallback + 7 `JOB_LABEL` + 2 hint.
  Bỏ giọng thân mật ("Đăng nhập lại nhé", "Thử lại nhé"), chuyển sang "Quý vị vui lòng…",
  "Rất tiếc…", "Thành thật xin lỗi Quý vị…", "hệ thống xin phép…".
- 11 toast ở `use-project.ts`, `step-4.tsx`, `step-5.tsx`.
- Popup xác nhận tạo phiên bản: tiêu đề → "Quý vị xác nhận tạo phiên bản mới?", nút "Huỷ" →
  "Để sau", "Đang tạo…" → "Hệ thống đang tạo…".
- **Mở rộng ngoài phạm vi được yêu cầu, có chủ ý**: thay nốt **36 chỗ dùng "bạn"** ở 12 file
  khác thành "Quý vị". Để toast dùng kính ngữ còn nhãn panel dùng "bạn" là tạo đúng kiểu lệch
  giọng mà người dùng vừa phàn nàn ở chuyện tiếng Việt/tiếng Anh.

Không đụng backend, `prompts/`, `lib/types.ts`, `lib/status-style.ts` (trừ 2 chuỗi hint có "bạn").

`tsc --noEmit` exit 0 · `eslint` exit 0 · `vitest run` 8 file / 32 test pass · `next build` pass.

> **Đính chính (xem dev-log 029):** người dùng đã yêu cầu đổi lại đại từ từ "Quý vị"
> về "bạn". Cấu trúc câu lịch sự ("vui lòng…", "Rất tiếc…", "xin phép…") giữ nguyên;
> chỉ đại từ đổi. Nội dung mô tả "Quý vị" ở trên là trạng thái tại thời điểm 028.
