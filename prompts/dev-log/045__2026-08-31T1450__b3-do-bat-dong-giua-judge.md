---
stt: 045
timestamp: 2026-08-31T14:50+07:00
model: claude-opus-5
scope:
  [
    backend/src/judge/agreement,
    backend/src/judge/judge.service.ts,
    backend/prisma/schema.prisma,
    backend/eval/seed-agreement-demo.ts,
    frontend/src/components/judge-agreement-panel.tsx,
    frontend/src/lib/use-judge-agreement.ts,
  ]
---

## Prompt
start coding

## Kết quả
Hiện thực #9 trên branch `b3/judge-agreement`. Đổi thiết kế so với đề bài sau khi kiểm bằng số:
κ tính trên `IssueGroup` rút gọn thành hằng số `−1/(R−1)` bất kể dữ liệu (R=5 → −0.25 dù mọi
nhóm 1 hay 2 người nêu), nên chuyển mục sang **tập thẻ** — cố định trước khi judge chạy, không
phụ thuộc bước gộp. Ba nhãn `NONE/MINOR/BLOCKING` vì `issue-grouping` đã gộp CRITICAL với MAJOR.
Ma trận 5×5 gọi đúng tên **Jaccard**, hợp rỗng ⇒ `null`, ô `n<5` bị làm mờ và loại khỏi kết luận.
Thay "lệch nhãn phổ biến" bằng **Δκ bỏ-một-judge** cho #8 — cái cũ rút gọn thành "judge nào nêu
nhiều nhất". Thêm `orderBy` cho `groupRound` (trước đó không có, nên NFR-JDG-6 chỉ là lời khẳng
định). Chạy thật: mọi mẫu hình gieo sẵn khớp chính xác, `LlmCall` 10 → 10. 228 backend + 47
frontend + 3 E2E xanh; 9/9 mutant chết sau khi bổ sung 2 test do mutation chỉ ra.
