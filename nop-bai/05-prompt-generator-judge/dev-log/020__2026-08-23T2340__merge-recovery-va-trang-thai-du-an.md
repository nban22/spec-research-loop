---
stt: 020
timestamp: 2026-08-23T23:40+07:00
model: claude-opus-5
scope:
  - backend/src/decision/decision.service.spec.ts
  - prompts/dev-log
---

## Prompt

> Ba lượt liên tiếp trong cùng một phiên: fix conflict khi pull về → kiểm tra lại các thay đổi
> (dường như đã bị revert) → sửa lỗi lint của CI. Ghi gộp vì cả ba cùng xử một sự cố.

fix conflict khi pull về

kiểm tra lại các thay đổi. Dường như các thay đổi code đã bị revert

Run npm run lint … 'applyChanges' is defined but never used … sửa các đề xuất đi. Kèm lỗi cicd
của github trên

## Kết quả

Ba lần merge liên tiếp phá đúng một file, `backend/src/decision/decision.service.spec.ts`:

| Merge | Nó làm gì | Phát hiện bằng |
| --- | --- | --- |
| `c63b45a` (của tôi) | resolve đúng: giữ test của cả hai bên | — |
| `6f988df` | giữ **cả hai bên nguyên văn** ⇒ `const spec` khai hai lần, `describe('applyChanges')` ba lần, file vỡ syntax | `tsc -p tsconfig.json` |
| `b9e2fdb` | lấy **trọn một bên** ⇒ xoá 12 test nhưng **giữ lại import** của chúng | `npm run lint` trên CI |

`b9e2fdb` là lần nguy hiểm nhất vì nó trông như một merge thành công. Lỗi CI
`'applyChanges' is defined but never used` là **triệu chứng**: import mồ côi chính là dấu vết
của thứ vừa bị xoá. Sửa theo đề xuất của linter (xoá import) sẽ làm CI xanh và chôn luôn
12 test — nên `babd220` chèn lại test, **+247 dòng −0 dòng**, không đụng test của nhánh kia.

Cũng xác minh lại nghi ngờ "code bị revert": **không có gì bị revert**. `53ef1e4` vẫn trong
lịch sử và đã lên `origin/main`; nó nằm dưới trong `git log` vì merge xếp commit của người
khác lên trước theo ngày. `git diff c63b45a HEAD` chỉ ra đúng một file lệch — chính file spec.

**Bài học đã trả giá:** `tsconfig.build.json` loại trừ `*.spec.ts`, nên `npm run build` xanh
trên cả hai bản hỏng. Nếu một merge xoá **cả** import lẫn test thì lint cũng xanh, và 12 test
biến mất không một tiếng động. Thứ duy nhất chặn được là `jest`. Chạy `npx jest` sau **mọi**
lần merge, trước khi commit.

---

## Trạng thái dự án — 2026-08-23

### 10 sản phẩm bàn giao

| # | Hạng mục | Trạng thái |
| --- | --- | --- |
| 1 | Website chạy được | ✅ chạy local (3000/3001), đã lái UI thật qua bước 1 với LLM thật |
| 2 | Source code | ✅ |
| 3 | Tài liệu kiến trúc | ✅ `docs/ARCHITECTURE.md` |
| 4 | Dataset thử nghiệm | ✅ `backend/eval/ideas.json` — 10 ý tưởng |
| 5 | Prompt Generator + Judge | ✅ 8 file trong `prompts/` |
| 6 | Cơ chế kiểm citation | ✅ verifier 5 tầng + gate **đã sinh hành động** (từ 019) |
| 7 | ≥ 2 baseline | ⚠️ **code đủ 4 arm, chưa chạy batch đầy đủ** |
| 8 | Báo cáo đánh giá | ⚠️ `docs/evaluation_report.md` vẫn là n = 1, 2/4 arm |
| 9 | Video demo | ❌ chưa làm |
| 10 | 1 spec hoàn chỉnh | ✅ `docs/sample_spec.md` + `.pdf` |

16/16 chức năng bắt buộc đều có module backend + màn hình.

### Kế hoạch 12 task — xong 6

Xong ở 019: **T1** giới hạn vòng judge có hiệu lực · **T2** nguồn + nhãn verifier sống sót qua
version mới · **T3** tự chạy lại verifier sau apply · **T4** vòng sửa trong eval ·
**T5** verifier gate sinh hành động (chỗ duy nhất `SYS` khác `SYS_NO_VERIFY`) ·
**T6** metric đo đúng thứ cần đo.

Còn lại: **T7** human-check 20 cặp + Cohen's κ · **T8** `eval/calibrate.ts` grid 3×3 ·
**T9** cache embedding · **T10** biểu đồ cột · **T11** conflict pairing · **T12** video.

### Kiểm chứng hiện tại

```
backend   lint sạch · test:cov --runInBand 136/136, coverage đạt ngưỡng
          tsc -p tsconfig.build.json sạch · tsc -p tsconfig.eval.json sạch
frontend  lint sạch · next build xanh · test:component 24/24
DB        2 migration (judge_rounds_total, card_source_override) đã deploy lên Neon
git       main ngang origin/main
```

### Nợ đã biết

1. `tsc -p tsconfig.json` còn ~20 lỗi **có sẵn từ trước**, toàn trong file test
   (`llm.service.spec.ts` dùng purpose `ANALYSIS` đã bỏ, `verifier.service.spec.ts` dùng tên
   threshold cũ, `test/*.e2e-spec.ts` lệch type supertest). Jest không bắt vì
   `isolatedModules` ⇒ ts-jest chạy transpile-only.
2. Job **Playwright E2E** của CI chạy `npm run test:e2e` mà workflow **không dựng backend**;
   `full-journey.spec.ts` cần API thật nên job đó nhiều khả năng đỏ sẵn từ trước.
3. Phương án **A** của verifier gate mới chỉ ghi nhận ý định, chưa mở lại luồng tìm nguồn
   theo claim.
4. Batch `aa000000-…0001` được tính điểm bằng **scorer cũ**; chạy lại `eval:score` trên nó sẽ
   làm mới `EvalMetric` nhưng batch đó vẫn thiếu arm `SYS`/`SYS_NO_VERIFY`.

---

## Next step — theo thứ tự

1. **Đo chi phí trước, đừng đoán.** `npm run eval:run -- --arms=SYS --limit=1` rồi đọc
   `EvalRun.total_tokens`. Vòng sửa thêm ~6 lượt `generator_revise` (`effort: high`) mỗi ý
   tưởng; ước lượng cũ 7,8 M token cho batch đầy đủ giờ khoảng **12–16 M**.
   Dòng log phải có dạng `✓ I01/SYS — …s · 2 vòng, 3 sửa + 1 gate (…)`; **`+ N gate` là bằng
   chứng T5 chạy** — không có nó thì `SYS` vẫn đang bằng `SYS_NO_VERIFY`.
2. **Batch đầy đủ:** `--arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10 --resume` (~3–4 h máy).
3. **`eval:audit` TRƯỚC `eval:score`** — `score.ts` đọc `auditor_blocking_issues` từ bảng
   `AuditorScore`; chạy sai thứ tự thì cột đó rỗng và nó in cảnh báo.
4. **T7** — `eval/human-check.ts`: lấy mẫu phân tầng 20 cặp → gán nhãn tay → accuracy +
   confusion 3×3 + κ. Làm được **ngay**, không cần chờ batch mới.
5. **T8** — `eval/calibrate.ts`: chạy L4 một lượt cho cả 20 cặp (bỏ cửa L3), lưu
   `(sim_max, verdict, confidence)` rồi grid 3×3 **offline, 0 token**. Số thật đã chỉ đúng
   chỗ: `l4_llm_ratio = 0.917` so với thiết kế 30–40% ⇒ `τ_high = 0.72` phải hạ.
6. **Viết lại `evaluation_report.md` §3** với bảng 4 arm × mean ± std ± n, cộng **T10** biểu đồ
   cột. §6 "việc còn lại" lúc đó xoá được cả 6 dòng.
7. **T11** conflict pairing và **T9** cache embedding nếu còn thời gian.
8. **T12** video demo — quay **sau cùng**, khi đã có bảng số để nói vào camera. Kịch bản nhấn
   4 điểm dừng chờ người dùng + 3 bằng chứng: `input_digest` giống nhau ở bảng judge-runs,
   `409 EXPORT_BLOCKED_UNSUPPORTED_CITATION` kèm 4 lựa chọn, `DiffView` v1→v2.

**Đường tới hạn là 1→2→3→6.** Thiếu nó thì deliverable #7 và #8 chỉ chứng minh được
*"retrieval tốt hơn single-shot"*, còn vòng judge và citation verifier — phần đồ án gọi là
cải tiến — không có một dòng số nào chống lưng.

**Quy tắc mới, không thương lượng:** chạy `npx jest` sau mọi lần merge, trước khi commit.
