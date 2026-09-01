---
stt: 052
timestamp: 2026-09-01T09:10+07:00
model: claude-opus-5
scope: [main, .github/workflows, prompts/dev-log]
---

## Prompt

- checkout qua main, pull origin main về
- merge this feature branch sang main branch, rồi push origin main
- dùng gh đi tracking cicd, githubaction, nếu lỗi thì fix ở nhánh features, rồi đi flow cũ, merge main, check tiếp
- sau khi cicd success, dùng ssh linux149 để lên check container real trên hosted server đó nhé, tìm đúng container của spec proj này
- test cả real api của nó nữa nhé, hosted api ấy

## Kết quả

Không sửa một dòng source nào — turn này chỉ đưa làn A lên `main` và kiểm chứng nó chạy thật.

**Chạy trước hai cổng mà CI có còn máy này thì chưa từng chạy**, vì fix ở nhánh sau khi đã push
lên `main` đắt hơn hẳn fix trước:

- `npm run test:cov` — `package.json` đặt ngưỡng coverage toàn cục (lines/statements 50,
  branches/functions 35). Làn A thêm năm service gần như không có unit test
  (`evidence.service.ts` và `human-check.service.ts` đều 0%), nên đây là chỗ có thật khả năng
  gãy. Qua: 299/299, ngưỡng vẫn đạt.
- `npx playwright test` — chưa từng cài chromium trong checkout này. Cài rồi chạy: 3/3 qua.
  Lần đầu chạy nhầm từ gốc repo nên Playwright không thấy `playwright.config.ts`, quét luôn
  file `*.test.tsx` của vitest rồi báo "No tests found" — phải chạy từ `frontend/`.

Merge `--no-ff` (`fb68094`), push thẳng `main`. Bốn workflow **xanh ngay lượt đầu**, không phải
quay lại nhánh feature lần nào: CI Backend Tests · CI Frontend Tests · Build & deploy backend ·
Build & deploy frontend.

**Kiểm trên host** (`ssh linux149`): `spec-research-loop-backend` và `spec-research-loop-frontend`
đều đã ở `prod-fb68094` — đúng SHA của commit merge — và đều `healthy`. Trong image có
`dist/conflict/`, `dist/verifier/arxiv-id.js`, cùng `prompts/conflict_pair.md` và
`prompts/verifier_passage.md`.

Một điều đáng ghi lại vì nó đổi cách đọc mọi con số ở dev-log 050/051: log của job `migrate`
in ra `neondb ... ep-lingering-wave-azfp2vwo-pooler` rồi `No pending migrations to apply` —
tức là **DB prod và DB dev là cùng một Neon**, và migration `20260831181122_a_evidence_lane`
đã nằm sẵn ở đó từ lúc phát triển. Mọi dữ liệu demo/ablation của làn A đang nằm trên prod:
121 `SourceScore` · 18 `SourceFullText` · 5 `VerifierPassage` · 1 `CardConflict`.

**Test API thật** (`https://api.dsa-bus-booking.io.vn`), hai lượt:

1. Chưa xác thực — bốn route mới đều 401, còn route bịa ra thì 404. Cái 404 đó là phép đối
   chứng: thiếu nó thì 401 không chứng minh được route có tồn tại.
2. Có xác thực, có dữ liệu thật — 10/10. `credibility` trả 6 nguồn HIGH/HIGH/HIGH/MEDIUM/
   REVIEW/REVIEW kèm câu tiếng Việt và 1 thẻ chỉ dựa nguồn yếu · `conflicts` trả đúng hai phạm
   vi `INTRA_CARD` + `CROSS_CARD` với `llm_calls=0` · `evidence-trace` trả 7 cặp trải ba tầng
   L2/L3/L4 kèm ngưỡng của chính lần chạy đó · `label-queue` trả 7 cặp mà **6 field nhãn máy
   đều vắng mặt** — điều kiện chấm mù của #4, giờ kiểm được trên chính API đang chạy chứ không
   chỉ trong unit test.

Để có dữ liệu cho lượt 2 mà không cần mật khẩu của ai: đăng ký một tài khoản dùng một lần trên
prod rồi chạy `seed-evidence-demo.js` cho chính nó (script offline, không LLM, không mạng).
Người dùng đồng ý và chọn giữ lại tài khoản đó.

Một chỗ hụt của riêng script kiểm tra, không phải của API: lượt đầu đọc `label-queue` bằng khoá
`pairs`/`queue` trong khi endpoint trả `items`, nên ra 0 cặp và phép kiểm chấm mù **qua một cách
rỗng tuếch**. Sửa khoá rồi mới thật sự kiểm được.
