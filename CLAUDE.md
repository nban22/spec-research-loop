# SPECRESEARCH_LOOP

Đồ án. Đặc tả gốc: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md`.
Layout: `frontend/` (Next.js) · `backend/` (NestJS) · `prompts/` · `docs/`.

## Rules

@.claude/rules/prompt-audit.md

Rule trên được enforce bằng hook `.claude/hooks/prompt-guard.mjs`. Cùng script đó chạy cho Antigravity
qua `.agents/hooks.json`; `.agents/rules/` chỉ trỏ ngược về `.claude/rules/` — đừng fork nội dung rule.
