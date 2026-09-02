---
stt: 031
timestamp: 2026-08-29T14:40+07:00
model: claude-opus-5
scope:
  [
    backend/src/judge/overclaim,
    backend/src/contracts/llm-io/overclaim.ts,
    backend/prisma/schema.prisma,
    prompts/judge_overclaim.md,
    backend/eval/overclaim-seed.json,
    frontend/src/components/overclaim-panel.tsx,
    frontend/src/lib/use-overclaim.ts,
  ]
---

## Prompt
please work on B1

## Kết quả
Hiện thực #7 trên branch `b1/overclaim-detector`: tầng luật 0 token (`overclaim-lexicon.ts` +
`overclaim-scope.ts`) + tầng LLM cho vùng xám (`prompts/judge_overclaim.md`), model
`OverclaimFlag`, cờ `Project.overclaim_detector` mặc định tắt, panel bước 4 với ba đường ra ghi
thành `Decision`. Đo trên 20 claim gieo tay + 12 đối chứng: luật bắt 16/20, báo nhầm 0/12.
