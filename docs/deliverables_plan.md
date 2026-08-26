# KẾ HOẠCH ĐÁP ỨNG 4 YÊU CẦU BẮT BUỘC

> Đối chiếu bốn yêu cầu của đề — *dataset · cơ chế kiểm citation · ≥2 baseline · báo cáo đánh giá* —
> với hiện trạng source code, rồi đề xuất cách hoàn thành từng cái.
>
> Ngày lập: **2026-08-26** · Phạm vi kiểm: `backend/eval/`, `backend/src/verifier/`,
> `backend/prisma/schema.prisma`, `docs/evaluation_report.md`.

---

## Tổng kết trạng thái

| # | Yêu cầu | Hạ tầng code | Dữ liệu đã chạy | Kết luận |
| --- | --- | --- | --- | --- |
| 1 | Dataset / tập use case | ✅ đủ | ✅ có | **Đạt** — còn thiếu tập human-label |
| 2 | Kiểm tra citation/evidence | ✅ đủ | ⚠️ chưa validate | **Đạt hình thức, chưa có bằng chứng đúng** |
| 3 | ≥ 2 baseline | ✅ đủ (4 arm) | ⚠️ mới 2/4 arm × 1/10 ý tưởng | **Đạt code, chưa đạt số liệu** |
| 4 | Báo cáo đánh giá | ✅ khung đủ | ⚠️ n = 1 | **Chưa đạt** |

**Điểm mấu chốt: không thiếu code, thiếu lần chạy.** Trừ hai thứ chưa tồn tại —
`backend/eval/calibrate.ts` và đường ghi vào bảng `HumanCheck`.

---

# Yêu cầu 1 — Dataset hoặc tập use case thử nghiệm

## 1.1 Yêu cầu này đòi gì

Một tập đầu vào **cố định, công khai, đủ đa dạng** để mọi lần chạy và mọi arm đều ăn cùng một thứ.
Không có nó thì so sánh baseline vô nghĩa — mỗi arm chạy một ý tưởng khác nhau thì bảng kết quả
không nói lên điều gì.

## 1.2 Hiện trạng — đã có, và đúng chuẩn

`backend/eval/ideas.json` — **10 ý tưởng thô, 10 domain khác nhau**:

```json
[
  { "id": "I01", "domain": "SE",        "text": "Tôi muốn dùng LLM để tự động phát hiện lỗi logic trong code review." },
  { "id": "I02", "domain": "Medical",   "text": "Tôi muốn làm hệ thống gợi ý phác đồ điều trị từ hồ sơ bệnh án." },
  { "id": "I03", "domain": "Transport", "text": "…graph neural network để dự đoán ùn tắc giao thông ở TP.HCM." },
  { "id": "I04", "domain": "NLP",       "text": "…cải thiện RAG cho tài liệu pháp luật tiếng Việt." }
]
```

Năm mục còn lại: `I05` Systems · `I06` CV · `I07` Security · `I08` Edu · `I09` Finance · `I10` HCI.

Ba tính chất làm nó dùng được:

1. **Mơ hồ có chủ đích.** Mỗi câu thiếu ít nhất một trong ba thứ: task, dữ liệu, tiêu chí đánh giá.
   Đó chính là đầu vào mà hệ thống sinh ra để xử lý — nếu ý tưởng đã rõ thì `clarifying_questions`
   và thẻ `MISSING` không có gì để làm.
2. **`id` cố định** → `EvalRun` có `@@unique([batch_id, arm, idea_id])`, chạy lại cùng batch không
   tạo bản ghi trùng.
3. **Trải 10 domain** → chống kết luận chỉ đúng cho một lĩnh vực.

## 1.3 Thứ còn thiếu — tập human-label 20 cặp

Đây là dataset **thứ hai**, khác mục đích: `ideas.json` là đầu vào của hệ thống, còn tập này là
**thước đo cho chính verifier**.

Bảng `HumanCheck` đã có trong `prisma/schema.prisma:621-633`:

```prisma
model HumanCheck {
  card_source_id String
  human_label    SupportLabel     // người gán
  auto_label     SupportLabel     // verifier gán
  match          Boolean
  note           String?
}
```

Nhưng grep toàn `src/` và `eval/` — **không dòng code nào ghi vào bảng này**. Bảng rỗng và không
có đường ghi.

## 1.4 Cách làm

### Bước 1 — viết `backend/eval/label.ts`

Một CLI lấy mẫu và ghi nhãn:

```bash
npx tsx eval/label.ts --batch=<uuid> --n=20 --export=labels.csv   # xuất ra để gán tay
npx tsx eval/label.ts --import=labels.csv                         # nạp ngược vào HumanCheck
```

Lấy mẫu phải **phân tầng theo `support_label`** — bốc ngẫu nhiên thì 20 cặp có thể rơi hết vào
`WEAK` và không đo được gì ở hai đầu. Đề xuất: **7 `SUPPORTED` · 7 `WEAK` · 6 `UNSUPPORTED`**.

### Bước 2 — gán tay

Với mỗi cặp, đọc `claim` + `abstract` của nguồn rồi trả lời đúng một câu: *abstract này có thật sự
chống lưng cho khẳng định đó không?* → `SUPPORTED` / `WEAK` / `UNSUPPORTED`.
Ghi `note` cho cặp nào phân vân — đó là dữ liệu để giải thích chỗ verifier sai.

### Bước 3 — tính hai con số

- **Accuracy** = `count(match) / 20`
- **Cohen kappa** — hệ số đồng thuận đã loại trừ may rủi. Cần vì với 3 nhãn, đoán bừa đã cho ~33%
  accuracy; kappa nói phần vượt trên may rủi.

  ```
  kappa = (p_o − p_e) / (1 − p_e)
  p_o = tỉ lệ trùng quan sát được
  p_e = tỉ lệ trùng kỳ vọng nếu hai bên gán độc lập
  ```

**Chi phí:** ~1 buổi gán tay, ~1 giờ viết CLI.

---

# Yêu cầu 2 — Cơ chế kiểm tra citation hoặc evidence

## 2.1 Yêu cầu này đòi gì

Không phải "hiển thị nguồn". Phải là một **cơ chế kiểm** — có đầu vào, có luật, có nhãn ra, và
**có hậu quả**. Gắn nhãn mà không chặn gì thì chỉ là trang trí.

## 2.2 Hiện trạng — đã có đủ, và đây là phần mạnh nhất của đồ án

### Tầng 0 — chặn bằng **kiểu dữ liệu**

`Source.retrieved_from` là enum `SEMANTIC_SCHOLAR | OPENALEX | ARXIV | CROSSREF` —
**không có giá trị `LLM`**. Không có đường ghi nào để một paper do model nghĩ ra vào được bảng
`Source`. Đây là phòng thủ mạnh hơn mọi kiểm tra runtime: nó là ràng buộc schema.

Thêm một lớp ở tầng ghi — mọi chỗ nối nguồn đều lọc qua danh sách trắng:

```ts
// backend/src/generator/generator.service.ts:488-507
const valid = [...new Set(sourceIds)].filter((id) => whitelist.has(id));
```

### 5 tầng kiểm, rẻ trước đắt sau

`backend/src/verifier/verifier.service.ts` — mỗi cặp (thẻ, nguồn) đi qua:

| Tầng | Kiểm gì | Chi phí | Dòng |
| --- | --- | --- | --- |
| **L0** | Nguồn có tồn tại không — hỏi **Crossref + DataCite** | HTTP, 0 token | `:217` |
| **L1** | Sanity metadata (năm, title match, abstract đủ dài) | rule, 0 token | `:250` |
| **L2** | Con số trong claim có nằm trong abstract không | rule, 0 token | `:264` |
| **L3** | Embedding cosine, `all-MiniLM-L6-v2` chạy **local CPU** | 0 token API | `:288` |
| **L4** | LLM entailment — **chỉ chạm vùng xám** giữa `tau_low` và `tau_high` | tốn token | `:348` |
| **L4b** | Chống bịa trích dẫn — **rule kiểm output của LLM**: câu trích phải là substring có thật của abstract | rule, 0 token | `:393` |
| **L5** | Bảng quyết định nhãn, luật đầu tiên khớp thì dừng | rule | `:406` |

> **Điểm thiết kế đáng nói:** L4b là **rule kiểm lại LLM**, không phải LLM kiểm LLM. Model có thể
> bịa câu trích dẫn trong lúc giải thích, và một phép `includes()` bắt được ngay.

### Cơ chế **chặn**, không chỉ gắn nhãn

Hai tầng hậu quả.

**① Thẻ đổi status** (`verifier.service.ts:431-447`):

```ts
const allUnsupported = card.card_sources.every((cs) => cs.support_label === 'UNSUPPORTED');
const nextStatus = allUnsupported ? 'UNSUPPORTED'
                 : card.status === 'UNSUPPORTED' ? 'PROPOSED'   // hồi phục được
                 : card.status;
```

**② Verifier gate**: `POST /spec-versions/:id/export` trả **`409 EXPORT_BLOCKED_UNSUPPORTED_CITATION`**
khi còn nhãn `UNSUPPORTED` trên thẻ `CLAIM` / `GAP` / `CONTRIBUTION`
(`backend/src/contracts/card.ts:66` — `GATED_CARD_TYPES`).

Người dùng có 4 đường ra, trong đó nhánh **"Other"** bắt buộc ghi `CardSource.override_reason` và
file xuất ra **đánh dấu** cặp đó — phân biệt *bỏ qua có ghi nhận* với *không kiểm*.

## 2.3 Hai việc để chuyển từ "có cơ chế" thành "có bằng chứng cơ chế đúng"

### ① Validate nhãn bằng người → dùng tập 20 cặp ở Yêu cầu 1

Hiện tại mọi nhãn của verifier ở mức *"máy nói vậy"*. Có `accuracy` + `kappa` thì thành
*"đã validate, sai ở đâu"*.

### ② Hiệu chỉnh ngưỡng — viết `backend/eval/calibrate.ts`

Ngưỡng hiện tại **tự khai là ước đoán**, ghi ngay trong code (`backend/src/verifier/thresholds.ts:3`):

```ts
/**
 * **Đây là ước đoán, không phải số đo** — hiệu chỉnh bằng grid 3×3 trên 20 cặp human-label
 * ở cuối phase 2 (`eval/calibrate.ts`).
 */
export const DEFAULT_THRESHOLDS: VerifierThresholds = {
  tau_low: 0.35, tau_high: 0.72, conf_min: 0.7,
  title_match: 0.85, min_abstract_chars: 200, stale_years: 8,
};

export const GRID = {
  tau_low:  [0.30, 0.35, 0.40],
  tau_high: [0.68, 0.72, 0.76],
} as const;
```

`GRID` đã khai sẵn, `verifyPair` đã nhận `opts.thresholds` — **file `calibrate.ts` chưa tồn tại**,
chỉ vậy thôi.

Việc nó phải làm: với mỗi trong 9 tổ hợp, chạy lại L3/L4/L5 trên 20 cặp human-label
(không gọi lại L0/L1 — kết quả đã cache), tính accuracy, in ma trận 3×3, chọn ô cao nhất.

**Số liệu đã có sẵn để biện minh:** batch đầu đo `l4_llm_ratio = 0.917`, trong khi
`docs/ARCHITECTURE.md` §6.3 đặt mục tiêu 30–40%. Nghĩa là `tau_high = 0.72` quá cao — gần như không
cặp nào kết luận sớm được ở L3, tất cả rơi xuống L4 tốn tiền. Đây là **phát hiện thật, đo được**,
và grid search biến nó thành một con số đã sửa.

**Chi phí:** ~2 giờ code + vài phút chạy.

---

# Yêu cầu 3 — Ít nhất hai baseline

## 3.1 Yêu cầu này đòi gì

Baseline phải **cùng đầu vào, cùng model, cùng cách chấm**, chỉ khác đúng thứ muốn chứng minh.
Nếu baseline chạy model khác hoặc được chấm bằng thước khác thì bảng so sánh không chứng minh gì.

## 3.2 Hiện trạng — có **4 arm**, vượt yêu cầu

`backend/src/contracts/enums.ts:54` — `armSchema = z.enum(['B1', 'B2', 'SYS', 'SYS_NO_VERIFY'])`

| Arm | Là gì | Cặp so sánh đo được điều gì |
| --- | --- | --- |
| `B1` | Single-shot: một prompt → spec 14 mục | sàn dưới |
| `B2` | Pipeline đầy đủ **trừ** vòng judge | `B1→B2` = đóng góp của *retrieval + phân rã có cấu trúc* |
| `SYS` | Hệ đầy đủ: 5 judge + vòng sửa + verifier gate | `B2→SYS` = đóng góp của *vòng judge* |
| `SYS_NO_VERIFY` | `SYS` nhưng `verifier_gate = false` | `SYS−V→SYS` = đóng góp của *citation verifier* |

### Bốn điều kiện công bằng đã cài (`backend/eval/harness.ts`, `run-eval.ts`)

- **Cùng base model theo vai** (`deepseek-v4-pro` / `deepseek-v4-flash`), `temperature: 0` **mọi**
  lời gọi.
- **Cùng một `ScriptedDecisionPolicy`** cho mọi arm: luôn chọn phương án `recommended`, không có
  thì chọn `A`, **không bao giờ chọn `Other`**. Deterministic, 0 LLM.
- **Đi qua đúng service của app**, không có nhánh code riêng cho eval → cả 4 arm ghi vào cùng bộ
  bảng, một câu SQL tính metric cho cả bốn.
- **Chạy xen kẽ theo ý tưởng, hoán vị thứ tự arm** theo chỉ số ý tưởng → arm chạy sau không hưởng
  lợi từ `Source` đã nằm sẵn trong DB.
- `score.ts` **từ chối tổng hợp** nếu một `prompt_id` có hai `prompt_hash` khác nhau trong cùng batch.

### Verifier chạy hai vai tách rời

- Vai **đo** chạy cho **mọi** arm kể cả B1 — đó là cách duy nhất có cùng một thước cho baseline.
- Vai **can thiệp** (chặn export) chỉ bật ở `SYS`.

## 3.3 Vấn đề thật — `SYS` và `SYS_NO_VERIFY` từng chạy y hệt nhau

`verifier_gate` ban đầu chỉ ảnh hưởng tới export, mà eval **không bao giờ gọi export**. Nên hai arm
chạy cùng code, và cột ablation đo đúng số 0.

Đã sửa bằng `backend/eval/repair-loop.ts` (vòng judge → chọn issue → `record(SCRIPTED)` → `apply`
→ re-verify từng phần) và gate sinh hành động thật. Nhưng **chưa có lần chạy nào chứng minh hai arm
giờ đã khác nhau** — đó chính là việc còn lại.

## 3.4 Cách làm

### Bước 1 — đo chi phí thật trước khi cam kết 2 giờ máy

```bash
cd backend
npm run eval:run -- --arms=SYS --limit=1
```

Xem `total_tokens` và `wall_ms` của `EvalRun`, nhân lên để biết batch đầy đủ tốn bao nhiêu.

### Bước 2 — kiểm chứng `SYS` khác `SYS_NO_VERIFY` trước khi chạy batch lớn

```bash
npm run eval:run -- --arms=SYS,SYS_NO_VERIFY --limit=2
```

So `rounds_run` và `decisions_applied` giữa hai arm. **Nếu vẫn bằng nhau thì batch 10 ý tưởng chỉ
tốn tiền vô ích.**

### Bước 3 — batch đầy đủ

```bash
npm run eval:run -- --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10
```

Ước lượng: **~2 giờ, ~7,8 triệu token**.

### Bước 4 — chấm blind, PHẢI chạy TRƯỚC `eval:score`

```bash
npm run eval:audit -- --batch=<uuid>
```

> ⚠️ Thứ tự bắt buộc: metric `auditor_blocking_issues` của `score.ts` đọc từ bảng `AuditorScore`.
> Chạy ngược thì cột đó rỗng.

### Bước 5 — tổng hợp

```bash
npm run eval:score -- --batch=<uuid>
```

Ra `backend/eval/results/<uuid>-summary.csv` với 16 metric × 4 arm, mean ± std.

---

# Yêu cầu 4 — Báo cáo đánh giá hệ thống

## 4.1 Yêu cầu này đòi gì

Trả lời đúng ba câu: *cải tiến giải quyết vấn đề gì · kiểm nghiệm thế nào · kết quả có tốt hơn
baseline không.* Kèm limitation viết ra **trước khi bị hỏi**.

## 4.2 Hiện trạng — khung đã đủ 6 mục, số liệu mới n = 1

`docs/evaluation_report.md`:

| Mục | Nội dung | Trạng thái |
| --- | --- | --- |
| §1 | Cải tiến là gì — Citation Verifier 5 tầng | ✅ đủ |
| §2 | Thiết kế thí nghiệm — 4 arm, điều kiện công bằng | ✅ đủ |
| §3 | Kết quả | ⚠️ **n = 1, 2/4 arm** |
| §4 | Bug thật do chạy thí nghiệm phát hiện (2 bug) | ✅ đủ — phần này mạnh |
| §5 | Limitation (9 mục) | ✅ đủ |
| §6 | Việc còn lại (6 mục) | ✅ đủ |

### §4 là phần đáng giá nhất và không cần làm thêm

Nó ghi hai bug **chỉ lộ ra khi chạy dữ liệu thật**:

1. L0 chỉ hỏi Crossref → DOI arXiv (`10.48550/…`) đăng ký ở **DataCite** → mọi paper arXiv bị gắn
   `SOURCE_NOT_FOUND` → `citation_validity` **âm tính giả hàng loạt**.
2. OpenAlex gọi bằng `search=` → khớp lỏng kiểu OR → trả Landsat-8 cho truy vấn về RAG pháp luật.

Đây là bằng chứng "đã thật sự chạy thí nghiệm", không phải chạy cho có.

### §3 đã có một phát hiện thật, đo được

`unsupported_rate` của B2 (0.917) **cao hơn** B1 (0.600) — không phải B2 tệ hơn mà là **hai arm
đang bị chấm bằng hai thước khác nhau**:

- B1 có 5 trích dẫn *tự nhớ*, metric hỏi "có tra ra không".
- B2 có 12 cặp (claim, nguồn) *có thật*, metric hỏi câu khó hơn: "abstract này có **thật sự** nói
  điều claim nói không".

Đã tách thành `fabrication_rate` (B1 → `null`) và `unsupported_rate` trong `score.ts`,
**nhưng báo cáo chưa viết lại theo cột mới**.

## 4.3 Sáu việc, theo thứ tự

### ① Viết lại §3 bằng bảng 4 arm × 10 ý tưởng

Mỗi ô là `mean ± std`. 16 metric đã có trong `backend/eval/score.ts:58-75`:

```
citation_validity · fabrication_rate · unsupported_rate · unsupported_rate_v1
completeness_14 · auditor_blocking_issues · own_judge_issues_open
json_validity{,_generator,_judge,_entailment} · l4_llm_ratio
rounds_run · decisions_applied · total_tokens · wall_ms
```

Bảng chính nên gọn — chọn 6 metric: `citation_validity`, `unsupported_rate`, `completeness_14`,
`auditor_blocking_issues`, `total_tokens`, `wall_ms`. Mười metric còn lại đưa xuống phụ lục.

### ② Thêm §3.1 — ba cột ablation

Phần trả lời trực tiếp câu *"cải tiến có tốt hơn không"*:

```
Δ(B1→B2)     = đóng góp của retrieval + phân rã có cấu trúc
Δ(B2→SYS)    = đóng góp của vòng judge
Δ(SYS−V→SYS) = đóng góp của citation verifier   ← cải tiến chính của đồ án
```

Cột thứ ba là cột **phải có số**, vì §1 tuyên bố citation verifier là cải tiến được đề xuất.

### ③ Thêm §3.2 — kết quả human validation

Accuracy + Cohen kappa trên 20 cặp, kèm **ma trận nhầm lẫn 3×3** (`human_label` × `auto_label`) để
thấy verifier sai lệch về hướng nào — quá khắt khe hay quá dễ dãi.

### ④ Thêm §3.3 — hiệu chỉnh ngưỡng

Ma trận 9 ô của grid search, ngưỡng cũ vs ngưỡng mới, `l4_llm_ratio` trước/sau. Đây là chỗ biến
`tau_high` từ *"số tôi chọn"* thành *"số tôi đo"*.

### ⑤ Một biểu đồ cột

Đề yêu cầu ở §7.4. Trục X = 4 arm, gom 4 metric chính. Không cần thư viện vẽ ở backend — xuất SVG
tĩnh từ `summary.csv`, hoặc chèn thẳng vào file HTML là đủ.

### ⑥ Cập nhật §5 limitation

Hai mục sẽ tự biến mất sau khi chạy (n=1, chưa có human validation), nhưng phải **giữ nguyên** ba
mục không giải quyết được và ghi rõ lý do:

- **Auditor không đổi được nhà cung cấp** — MVP chỉ có DeepSeek. Bù bằng 4 lớp: khác tier +
  `reasoning_effort: max` · prompt viết độc lập · chấm blind có xáo thứ tự · human validation.
  **Tín hiệu còn sót và không che được: độ dài văn bản** — B1 ngắn hơn hẳn nên auditor có thể đoán ra.
- **Không tái lập hoàn toàn** — DeepSeek **không có tham số `seed`**. Thứ tái lập được là
  `temperature: 0` + prompt cố định + `prompt_hash`. Đề đòi "cùng seed", điều kiện này không thoả được.
- **Verifier chạy chế độ đo cho cả B1/B2.** Sẽ bị hỏi *"baseline được hưởng lợi từ hệ thống của bạn
  à?"* — câu trả lời đã viết sẵn: đó là **thước đo**, không phải hành vi; nó không đổi output của
  baseline, chỉ gắn nhãn lên output đã có.

---

# Đường tới hoàn thành — thứ tự bắt buộc

```
NHÁNH MÁY
① eval:run --arms=SYS --limit=1                        ~10 phút   đo chi phí thật
② eval:run --arms=SYS,SYS_NO_VERIFY --limit=2          ~30 phút   kiểm chứng 2 arm đã khác nhau
③ eval:run --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10   ~2 giờ, ~7,8M token
④ eval:audit --batch=<uuid>                            ~20 phút   PHẢI trước ⑤
⑤ eval:score --batch=<uuid>                            ~1 phút    → summary.csv

NHÁNH NGƯỜI (chạy song song với ③④⑤)
⑥ viết eval/label.ts                                   ~1 giờ code
⑦ gán tay 20 cặp → HumanCheck                          ~1 buổi
⑧ viết eval/calibrate.ts, chạy grid 3×3                ~2 giờ code + vài phút chạy

SAU CÙNG
⑨ viết lại evaluation_report.md §3 + §3.1–3.3 + biểu đồ + cập nhật §5
```

Hai nhánh độc lập — nhánh trên là **thời gian máy**, nhánh dưới là **thời gian người**.
Chạy đồng thời thì tổng còn khoảng **một ngày làm việc**.

**Ràng buộc thứ tự duy nhất không được phá:** `eval:audit` phải chạy trước `eval:score`, vì metric
`auditor_blocking_issues` đọc từ bảng `AuditorScore`.

---

## Phụ lục — bản đồ file liên quan

| Yêu cầu | File |
| --- | --- |
| 1 | `backend/eval/ideas.json` · `backend/prisma/schema.prisma` (`HumanCheck`) · *`backend/eval/label.ts`* (chưa có) |
| 2 | `backend/src/verifier/verifier.service.ts` · `backend/src/verifier/thresholds.ts` · `backend/src/contracts/card.ts` · `prompts/verifier_entailment.md` · *`backend/eval/calibrate.ts`* (chưa có) |
| 3 | `backend/src/contracts/enums.ts` · `backend/eval/harness.ts` · `backend/eval/run-eval.ts` · `backend/eval/repair-loop.ts` |
| 4 | `docs/evaluation_report.md` · `backend/eval/score.ts` · `backend/eval/audit.ts` · `prompts/auditor.md` · `backend/eval/results/` |

*File in nghiêng = cần viết mới.*
