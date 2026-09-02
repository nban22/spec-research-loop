---
stt: 004
timestamp: 2026-08-16T01:35+07:00
model: claude-opus-5
scope: [docs/STACK.md, docs/DESIGN_BRIEF_prompt.md, .env.example, .claude/rules/prompt-audit.md]
---

## Prompt
giữa backend và forntend ko dùng chung shared folder gì cả nhé, vì khi deploy thì nó riêng biệt, 2 source riêng, chẳng quan để gọn nên tôi để chung 1 github repo thôi
về model mvp chỉ dùng deepseek nhé, claude xem xét sau, vì kinh phí ko đủ, ko cần giữ docs gì về nó (Về anthropic api)
về data model nó nên được design theo design system chứ nhỉ, sao ại nằm trong stack file?  sửa đi nhé, trong stack ko define ERD hay model  database gì cả? remove
về design system, có template đó, cho tôi prompt sẽ refer các docs, rồi prompt sao cho nó design system, design architecture toàn bộ app của tôi nhé, từ a tưới z tôi sẽ verify rồi dùng nó làm plan nhé
về cơ chế auth, tôi thấy có tính năng lưu lịch sử, lưu dự án, thì tôi cần implemetns auth, user như thường nhé (mvp enough), tôi thấy bạn có 2 options, thì bạn tự chọn options phù hợp cho mvp cho tôi nhé
về docker thì bạn chưa cần cares, cứ dùng db theo string nhé, tôi sẽ fill db real sau (neon db)
về cơ chế mới tôi chưa rõ, bạn chọn mvp options cho tôi nhé

## Kết quả
`docs/STACK.md`: xoá hẳn §4 Data model (ERD chuyển sang `docs/ARCHITECTURE.md`), còn lại quy ước dùng
Prisma; bỏ Docker/docker-compose → `DATABASE_URL` trỏ Neon; gỡ mọi nhắc tới Anthropic/Claude; ghi rõ
ranh giới 3 tài liệu STACK/DESIGN_SYSTEM/ARCHITECTURE; chốt auth cookie httpOnly + cắt rotation và
các phần thừa cho MVP (§11.1–11.2). Thêm `docs/DESIGN_BRIEF_prompt.md` — prompt copy-paste để sinh
`DESIGN_SYSTEM.md` + `ARCHITECTURE.md`. Sửa `.env.example` sang connection string Neon và
`.claude/rules/prompt-audit.md` đổi model mẫu sang `deepseek-v4-pro | deepseek-v4-flash`.
