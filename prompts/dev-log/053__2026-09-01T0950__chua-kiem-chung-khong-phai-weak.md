---
stt: 053
timestamp: 2026-09-01T09:50+07:00
model: claude-opus-5
scope:
  [
    backend/src/spec/spec.service.ts,
    backend/src/verifier/verifier.service.ts,
    backend/src/verifier/evidence.service.ts,
    frontend/src/components/support-tag.tsx,
    frontend/src/components/evidence-trace.tsx,
    frontend/src/components/spec-cards.tsx,
    frontend/src/components/steps,
    frontend/src/lib,
    prompts/dev-log,
  ]
---

## Prompt

login vào account apicheck-1788234962@local.test pass là ApiCheck123! để lấy access token, query các data liên quan https://dsa-bus-booking.io.vn/projects/3ccf3bdf-8cef-4295-aa0c-535a7bdc828c/step/3 cho tôi nhé, để xem vì sao các cards đó đề có label weaks, việc every cards có có output là weak là result tệ cho đồ án của tôi đúng không, tìm hiểu lý do, rồi cải thiện chúng cho tôi nhé, (dùng nhiều cách để check kĩ cho tôi nhé, curl, query db, ... làm mọi cách để nắm được tình hình, rồi cải thiện output cho tôi nhé

## Kết quả

**Chẩn đoán: verifier chưa từng chạy trên dự án đó.** WEAK không phải phán quyết — nó là
`@default(WEAK)` của `CardSource.support_label` ở `schema.prisma:325`.

Bằng chứng khớp nhau từ ba đường:

- DB — `0 VerifierRun` trên cả project · `verifier_run_id` null ở **11/11** cặp · `similarity`
  null ở 9/11 · đúng **1 `JobRun` = GENERATE** · 1 `LlmCall` = `generator_contribution` ·
  0 `Decision`.
- API host — `evidence-trace` trả `run: null` và rơi về `DEFAULT_THRESHOLDS`, không phải ngưỡng
  của một lần chạy nào.
- Code — `step-3.tsx` **không có** nút kiểm chứng cứ; nút đó nằm ở `step-5.tsx:135`. Đứng ở bước
  3 thì không có cách nào chạy verifier, cũng không có cách nào biết là nó chưa chạy.

Hai pha ghép lại thành cảnh hiện tại: seed offline viết tay 7 cặp có nhãn thật (nó cố ý không
tạo `VerifierRun` — chạy được khi không có key), rồi "Sinh contribution & claim" gọi
`generator.contributions()`, hàm này `card.deleteMany` mọi thẻ `CONTRIBUTION`/`CLAIM`, cascade
xoá luôn 5 trong 7 cặp, và tạo lại 9 cặp mới nguyên si mặc định.

**Trả lời câu hỏi "toàn WEAK có tệ không": tệ, nhưng không phải vì verifier kém.** Đo thử
offline bằng chính embedder và chính `numbersMissingFromSource` của hệ thống, ngưỡng mặc định,
không gọi LLM và không ghi gì:

| kết quả nếu chạy verifier | số cặp | vì sao |
| --- | --- | --- |
| SUPPORTED ngay ở L3, 0 token | 2 | sim 0.743 và 0.808 ≥ `tau_high` |
| leo lên L4 hỏi mô hình | 5 | sim 0.527–0.696 nằm giữa hai ngưỡng |
| WEAK có lý do thật | 2 | `EMPTY_ABSTRACT` — nguồn 2009/2011 không có tóm tắt |
| WEAK có lý do thật | 2 | `NUMBER_NOT_IN_SOURCE` — thẻ nói `recall@100`, tóm tắt chỉ có `recall@50` |

Tức là màn hình đang **nói dối theo hướng bất lợi cho chính hệ thống**: người chấm nhìn bảng
toàn WEAK sẽ kết luận verifier không chống lưng được gì, trong khi nó chưa đọc dòng nào.

### Sửa: tách "chưa kiểm" khỏi "kiểm rồi, yếu"

Tín hiệu có sẵn trong DB từ đầu — `CardSource.verifier_run_id`. Chỉ là chưa read model nào trả
nó ra. **Không** thêm giá trị vào `SupportLabel` (luật chung 2, và ba giá trị đó là ba phán
quyết của verifier — "chưa nhìn tới" không phải phán quyết). Không migration.

- `spec.service.cards()` trả thêm `verifier_run_id`.
- `getVerification()` và `EvidenceService.trace()` trả `verified` mỗi cặp và `unverified` tổng.
  **`summary` không đếm cặp chưa kiểm nữa** — cộng chúng vào ô WEAK chính là biến "chưa đo"
  thành "đo rồi, yếu".
- `EvidenceService` **không gọi `decidingLayer`** cho cặp chưa kiểm, trả `layer: null`. Hàm đó
  vẫn cho ra một tầng nghe rất hợp lý trên dữ liệu toàn `null`, và trang giải trình sẽ khẳng
  định một tầng nào đó đã quyết định cái nhãn mà không tầng nào từng chạm vào.
- `SupportTag` nhận `verified`; `false` thì đè nhãn, hiện `CHƯA KIỂM` viền đứt nét (mượn tín
  hiệu "chỗ trống" của `CardStatus.MISSING`) kèm một câu bằng chữ. Bỏ trống ⇒ coi như đã kiểm,
  nên mọi chỗ gọi cũ không đổi hành vi.
- Bộ lọc ở trang bằng chứng thêm mục **Chưa kiểm**, và bộ lọc "Yếu" không còn nuốt cặp chưa
  kiểm — trước đó nó nuốt, vì nhãn mặc định đúng là WEAK.
- Bước 3 thêm `HintBox` đếm số cặp chưa kiểm và nói rõ verifier chạy ở bước 5. Bước 5 thêm một
  dòng `CHƯA KIỂM` vào bảng tổng hợp, cần thiết vì ba ô kia không còn cộng gộp nữa.

Chạy read model mới trên đúng dữ liệu thật: `summary {0,0,0} · unverified 11 · 11 cặp ·
run null`, thay cho `WEAK 11` như trước.

backend `jest 302/302 · lint 0 · build 0` · frontend `lint 0 · build 0 · vitest 85/85`

### Phần sau: chạy full flow rồi đụng một lỗi nặng hơn

Merge vào `main` (`71f14ff`), bốn workflow xanh, container lên `prod-71f14ff`, API host trả
đúng `unverified 11/11` và bundle frontend có chuỗi `CHƯA KIỂM`. Rồi chạy **toàn bộ luồng sinh
spec** trên dự án mới qua HTTP, đúng trình tự của `eval/harness.ts:runArm`.

**Luồng chết ngay ở bước đầu.** `POST /projects/:id/analyze` → job FAILED sau 111 giây; log
container: `Không gọi được DeepSeek: terminated`. Mọi bước sau đổ theo **đúng thiết kế**
(không có nguồn ⇒ related-work và gap từ chối, `queries: []` bị zod chặn) — không phải lỗi mới.

Đo trên `LlmCall` của 24h gần nhất:

| prompt | lượt | hỏng | lâu nhất |
| --- | --- | --- | --- |
| `generator` | 7 | 1 (14%) — `LLM_UNAVAILABLE` | 119 210 ms |
| `verifier_entailment` | 64 | 1 (2%) — `LLM_INVALID_JSON` | 30 869 ms |
| còn lại (5 prompt) | 27 | 0 | 107 607 ms |

`generator` chạy `reasoning_effort: high` với 12k token nên mất **77–119 giây** mỗi lượt và
thỉnh thoảng bị cắt kết nối. Lỗi transient — nhưng `LlmService` cho nó **0 lần thử lại**:
JSON sai schema được 3 lượt, socket đứt thì `catch` ném thẳng. Chính sách retry đang lo cho
lỗi của *mô hình* mà bỏ trống lỗi của *đường truyền*, trong khi cái transient lại là cái sau.

Sửa: `llm-transient.ts` (hàm thuần, có test) phân loại theo hình dạng lỗi — `status` 429/5xx,
`APIConnectionError`, mã socket của undici, và lời văn `terminated`/`socket hang up`. 4xx còn
lại **không** thử lại: sai key hay quá context thì thử thêm hai lượt ~110 giây cũng vẫn hỏng.
`LlmService` thử tối đa 3 lượt, backoff 2s/6s, **tách khỏi** `maxRetries` của schema.

Hai chỗ test bắt được trong lúc viết:

1. Ban đầu chỉ phân loại ở `DeepseekProvider`, nên `LlmService` chỉ retry khi
   `err instanceof LlmTransportError` — provider khác (hay test double) ném lỗi mạng trần thì
   không được gọi lại. Đã nhận diện ở cả hai chỗ.
2. `attempts` **cố ý không** cộng số lần thử lại vì mạng: nó là số lần *mô hình* phải sửa JSON,
   và `eval/score.ts` cùng báo cáo đánh giá đọc nó theo nghĩa đó. Lượt hỏng vì mạng cũng không
   trả token nào nên phần đếm token không đổi.

backend `jest 321/321 · lint 0 · build 0`

**Còn lại, cần người bấm:** chạy VERIFY trên dự án demo cũ (`8e800cbd`) để 11 cặp có nhãn
thật — nút *"Chạy lại kiểm chứng cứ"* ở bước 5.
