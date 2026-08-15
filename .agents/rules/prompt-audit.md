# Prompt audit & prompt log (deliverable #5)

Activation: **Always On**.

Nguồn duy nhất của rule này: @/.claude/rules/prompt-audit.md — đọc file đó, đừng đoán.

Tóm tắt để không phải mở file:

- `prompts/` chứa 6 prompt runtime bắt buộc nộp (`generator`, `judge_gap`, `judge_contribution`,
  `judge_experiment`, `judge_evidence`, `judge_readiness`), mỗi file mở đầu bằng frontmatter
  `id / version / model / inputs / output / updated`.
- Cấm hardcode chuỗi prompt trong `backend/src`, `frontend/src` — code chỉ đọc file từ `prompts/`.
- `prompts/dev-log/NNN__YYYY-MM-DDTHHMM__slug.md` ghi lại prompt nguyên văn của người dùng, vào cuối
  mỗi turn có thay đổi file trong `backend/`, `frontend/`, `prompts/`, `docs/`.

Enforcement: hook `prompt-audit` trong `.agents/hooks.json`, chạy
`node .claude/hooks/prompt-guard.mjs stop --host=antigravity` ở sự kiện `Stop`. Hook trả
`decision: "continue"` kèm danh sách lỗi — đọc lỗi rồi sửa hết trước khi kết thúc, không để nợ.

Khác với Claude Code: bên đó còn hook `PostToolUse` soi từng file `prompts/*.md` ngay khi ghi, và hook
`UserPromptSubmit` lưu prompt nguyên văn vào `.claude/.state/turn.json`. Antigravity không có sự kiện
tương đương (`PostToolUse` chỉ trả `{}`, không chặn được), nên toàn bộ dồn về `Stop` và prompt nguyên
văn phải lấy từ context của chính agent.
