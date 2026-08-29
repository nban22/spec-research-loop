---
stt: 032
timestamp: 2026-08-29T15:31+07:00
model: claude-opus-5
scope:
  [
    backend/src/judge/overclaim/overclaim-scope.ts,
    backend/src/judge/overclaim/overclaim.service.ts,
    backend/eval/seed-overclaim-demo.ts,
  ]
---

## Prompt
i turned on docker, run the project so i can test the UI

## Kết quả
Dựng môi trường chạy thật: Postgres trong Docker (`specloop-pg`, cổng 5433), `backend/.env`
(đã gitignore), 6 migration, BE 3001 + FE 3000, `eval/seed-overclaim-demo.ts` gieo dự án demo
không cần key LLM. Chạy thật lộ ra hai lỗi tầng luật, đã sửa kèm test: câu thu hẹp bị dán tiêu
đề thẻ lên đầu, và đếm dataset khống 3 thay vì 1 (tên vắt qua dòng + cửa sổ trượt sang bullet
khác). 151/151 test xanh.
