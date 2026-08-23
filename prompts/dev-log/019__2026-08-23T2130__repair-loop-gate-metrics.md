---
stt: 019
timestamp: 2026-08-23T21:30+07:00
model: claude-opus-5
scope:
  - backend/prisma/schema.prisma
  - backend/prisma/migrations/20260823120000_judge_rounds_total
  - backend/prisma/migrations/20260823130000_card_source_override
  - backend/src/judge/judge.service.ts
  - backend/src/decision/decision.service.ts
  - backend/src/decision/decision.controller.ts
  - backend/src/verifier/verifier.service.ts
  - backend/src/verifier/metrics.ts
  - backend/src/spec/export.service.ts
  - backend/src/spec/spec.service.ts
  - backend/src/project/project.service.ts
  - backend/eval/repair-loop.ts
  - backend/eval/harness.ts
  - backend/eval/run-eval.ts
  - backend/eval/score.ts
  - frontend/src/lib/types.ts
  - frontend/src/lib/api.ts
  - frontend/src/lib/use-project.ts
  - frontend/src/components/steps/step-4.tsx
  - frontend/src/components/steps/step-5.tsx
---

## Prompt
làm 50% plan đề xuất. Chủ động unit test bảo đảm chạy thành công. Sau dó dùng /code-review cho những thay đổi. Phản biện và chỉnh sửa những điểm đồng thuận với response của tool trả về

## Kết quả

Làm 6/12 task của plan — nhánh tới hạn của deliverable #7/#8.

**T1 · giới hạn vòng judge có hiệu lực.** Thêm `Project.judge_rounds_total` (không reset khi
`apply` tạo version mới) và chuyển điều kiện chặn của `JudgeService.runRound` sang cột đó.
Trước đó `apply` đặt `judge_round = 0` nên "tối đa 3 vòng mỗi dự án" không bao giờ tới.

**T2 · nguồn và nhãn verifier sống sót qua version mới.** `applyChanges` trả thêm
`parentIds` + `touchedParentIds`; `apply` nối `CardSource` theo lineage đó thay vì so tiêu đề
bằng nhau, nên thẻ bị đổi tiêu đề không còn mất sạch nguồn. Thẻ không bị đụng chép đủ nhãn;
thẻ bị sửa trả nhãn về `WEAK` và vào danh sách kiểm lại. Thêm `orderBy` cho `parent.cards` để
hai lần apply cùng dữ liệu ra cùng một spec.

**T3 · chạy lại verifier ngay sau apply.** `POST /decisions/:id/apply` trả `verifyJobId`, mở
job VERIFY trên đúng `revalidateCardIds`. FE thêm `useJobAction().attach()` để bám job đó.
Sửa `verifySpecVersion`: `cardIds: []` giờ nghĩa là "không thẻ nào", trước đó lại kiểm toàn bộ.

**T4 · vòng sửa trong eval** — `eval/repair-loop.ts`. Mỗi vòng: judge → lấy 2 issue chặn →
`optionsForIssueGroup` → `record(SCRIPTED)` → `apply` → verify phần liên quan, tối đa 3 vòng.
Stats (`rounds_run`, `decisions_applied`, `stopped_by`) vào `EvalRun.config.repair`.

**T5 · verifier gate sinh hành động.** `GATE_OPTIONS` + `DecisionService.gateDecision` +
`GET /card-sources/:id/gate-options` + `POST /card-sources/:id/gate-decision`. Nhánh C (được
gợi ý) dựng bản nháp bằng **luật, 0 token**; nhánh OTHER ghi `CardSource.override_reason`
(cột mới) nên gate thôi chặn và file xuất ra mang dấu. Bước 5 của FE hiện 4 lựa chọn tại chỗ.
Đây là chỗ duy nhất `SYS` khác `SYS_NO_VERIFY` — trước đó hai arm chạy y hệt nhau.

**T6 · metric đo đúng thứ cần đo.** Hàm thuần sang `src/verifier/metrics.ts` (jest chỉ quét
`src/`). `auditor_blocking_issues` đọc `AuditorScore` thay vì bảng `Issue` của 5 judge nội bộ;
tách `fabrication_rate` khỏi `unsupported_rate` (B1 trả `null`, không phải `1.0`);
`json_validity` tách theo vai; thêm `unsupported_rate_v1` cho Δ-theo-vòng; `l4_llm_ratio` cộng
dồn mọi lần chạy verifier; metric không đo được thì **không ghi dòng** `EvalMetric`.

Chưa làm: T7 (human-check + κ), T8 (calibrate grid), T9 (cache embedding), T10 (biểu đồ),
T11 (conflict pairing), T12 (video). Option A của gate chỉ ghi nhận ý định, chưa mở lại
luồng tìm nguồn theo claim.

### Sửa sau `/code-review`

Bảy phát hiện, sửa cả bảy (sáu là bug thật, một là hệ quả thiết kế tao chấp nhận nhưng review
chỉ đúng chỗ nó thành đường cụt):

1. `apply` không chép `override_reason` ⇒ quyết định "giữ trích dẫn này" của người dùng bốc hơi
   ở version sau, gate chặn lại và dấu trong file xuất ra mất. Chép cho thẻ không bị đụng.
2. `repair-loop` `break` khi hết issue chặn **trước** khi chạy gate ⇒ hội đồng sạch từ vòng 1
   là gate không bao giờ chạy, đúng cái lỗi file này được viết ra để sửa. Đảo thứ tự.
3. `run-eval` nhánh `update` của upsert thiếu `config` ⇒ chạy lại một lượt giữ `prompt_hashes`
   và `repair` của project đã bị bỏ. Gộp thành một object dùng cho cả hai nhánh.
4. `score.ts` chỉ `upsert`, không xoá ⇒ `EvalMetric` cũ (`issues_major_critical`,
   `unsupported_rate` = 1 của B1) sống sót. `deleteMany` trước rồi `createMany`.
5. `own_judge_issues_open` đếm trên version cuối — mà version cuối do `apply` sinh, chưa judge
   lần nào ⇒ luôn 0 đúng ở lượt tiêu hết vòng. Đổi sang version cuối **đã từng được judge**,
   và chỉ đếm issue thuộc nhóm còn `OPEN`.
6. `OptionList` ở bước 5 không `key` theo cặp ⇒ lý do vừa nhập cho cặp #1 còn nguyên trong ô
   khi cặp #2 hiện ra, một click là gán sai cặp. Thêm `key={card_source_id}`.
7. Phương án A không đổi dữ liệu ⇒ panel ghim mãi ở cặp đầu, các cặp sau không tới lượt. Thêm
   hàng đợi `deferred` phía client + hint và nút "xử lại các trích dẫn đã hoãn".

Thêm 2 test: bản nháp nhánh C nhắm đúng `target_card_title`, và `applyChanges` khớp được nó —
hai nửa test riêng vẫn xanh khi tiêu đề hai bên lệch nhau.

Kiểm: backend `lint` sạch · `jest` **139/139** · `tsc -p tsconfig.eval.json` sạch ·
frontend `lint` sạch · `build` xanh · `vitest` 24/24. **Migration chưa chạy lên DB** —
cần `npx prisma migrate deploy`.
