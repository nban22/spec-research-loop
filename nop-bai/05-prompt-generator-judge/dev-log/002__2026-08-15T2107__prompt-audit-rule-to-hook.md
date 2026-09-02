---
stt: 002
timestamp: 2026-08-15T21:07+07:00
model: claude-opus-5
scope: [.claude/hooks/prompt-guard.mjs, .claude/settings.json, .claude/rules/prompt-audit.md, .agents/hooks.json, .agents/rules/prompt-audit.md, .gitignore]
---

## Prompt
về rule này @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/.claude/rules/prompt-audit.md  tôi nghĩ nên đỏi thành hook nhỉ? sao cho adapt với convention của claude code và antigrativity cho tôi nhé

## Kết quả
Chuyển phần kiểm tra máy làm được của rule prompt-audit thành hook `.claude/hooks/prompt-guard.mjs`
(3 mode: capture / audit / stop, 2 adapter output claude|antigravity), wire vào
`.claude/settings.json` (UserPromptSubmit + PostToolUse Write|Edit + Stop) và `.agents/hooks.json`
(Stop, vì Antigravity PostToolUse không chặn được). Rule gốc rút gọn còn phần yêu cầu + bảng
"hook enforce cái gì"; thêm `.agents/rules/prompt-audit.md` trỏ về nguồn duy nhất; gitignore
`.claude/.state/`. Mở rộng scope dev-log thêm `.claude/` và `.agents/`.
