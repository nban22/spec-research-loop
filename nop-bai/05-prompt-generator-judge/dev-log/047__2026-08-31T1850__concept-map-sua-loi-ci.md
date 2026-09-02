---
stt: 047
timestamp: 2026-08-31T18:50+07:00
model: claude-opus-5
scope: [frontend/src/components/concept-map.tsx, frontend/src/components/status-chip.tsx, frontend/src/components/severity-badge.tsx, frontend/src/components/support-tag.tsx, frontend/src/lib/unknown-style.ts, frontend/e2e/full-journey.spec.ts]
---

## Prompt
lỗi cicd của PR Concept map: [dán nguyên output Playwright — `TypeError: Cannot read properties of undefined (reading 'label')` tại `concept-map.tsx:255`, 1 failed / 2 passed]

sưả luôn lỗi và update vào PR #14 concept map luôn

## Kết quả
CI đỏ vì mock e2e dùng `status: 'UNVERIFIED'` và `type: 'PROPOSED_APPROACH'` — cả hai đều ngoài enum.
`CardBoard` không vỡ vì accordion đóng thì không mount; `ConceptMap` vẽ mọi thẻ ngay nên lộ ra.
Sửa hai phía: (1) `lib/unknown-style.ts` mới — `styleOr()` trả fallback hiện nguyên văn giá trị lạ
thay vì `undefined`, áp cho `concept-map` + `status-chip` + `severity-badge` + `support-tag`
(ba cái sau cùng lỗi tiềm ẩn, chưa ai chạm trúng); (2) sửa hai giá trị enum sai trong
`e2e/full-journey.spec.ts` thành `PROPOSED` / `CONTRIBUTION` kèm comment giải thích, không xoá test
của member khác. Thêm 4 test hồi quy. tsc 0 · lint 0 · vitest 50/50 · build 0 · playwright 3/3.
