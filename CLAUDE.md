# SPECRESEARCH_LOOP

Đồ án. Đặc tả gốc: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md`.
Layout: `frontend/` (Next.js) · `backend/` (NestJS) · `prompts/` · `docs/`.

## Rules

@.claude/rules/prompt-audit.md

Rule trên được enforce bằng hook `.claude/hooks/prompt-guard.mjs`. Cùng script đó chạy cho Antigravity
qua `.agents/hooks.json`; `.agents/rules/` chỉ trỏ ngược về rule gốc — đừng fork nội dung rule.

Code style theo từng project, đọc khi đụng vào source: `backend/CLAUDE.md` · `frontend/CLAUDE.md`.
Hai file đó chỉ nói *viết code thế nào*; công nghệ → `docs/STACK.md`, ERD + API → `docs/ARCHITECTURE.md`,
token + responsive → `docs/DESIGN_SYSTEM.md`, đánh đổi thiết kế + chỗ hệ thống vỡ →
`docs/SYSTEM_DESIGN_ANALYSIS.md`.
