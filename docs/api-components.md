# NĂM COMPONENT CỦA TẦNG API — NestJS 11

> Phân tích chi tiết năm ô trong vùng **API — NestJS 11**, tab *Projects* của
> `docs/product-flow-map.html`: **jobs + SSE** · **generator** · **verifier** · **judge** ·
> **decision**.
>
> Bản đồ HTML trả lời *"có gì ở đây"*. File này trả lời *"nó chạy ra sao, dựng bằng gì, và vì sao
> lại thiết kế như thế"*.
>
> **Số dòng tính tại commit `a267ccc`.** Mỗi chỗ đều kèm **tên ký hiệu**, nên khi file trôi đi vẫn
> tìm lại được bằng tên chứ không phải bằng số.

---

## 0. Ba luật áp cho cả năm component

Đọc ba luật này trước, vì mọi mục dưới đây đều là hệ quả của chúng.

| Luật                                                                                                                         | Nó ép ra điều gì                                                                                             | Chỗ trong code                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Controller mỏng** — parse → gọi service → trả DTO, không nghiệp vụ, không Prisma                            | Controller không test được cũng không sao, vì trong nó không có gì để sai                            | `backend/src/project/project.controller.ts:85` — `analyze`, đúng 12 dòng         |
| **Service không biết HTTP** — không nhận `Request`, không đọc header, cần user thì nhận `userId: string` | `backend/eval/harness.ts:70-80` gọi **thẳng** service để chạy thí nghiệm, không dựng HTTP server | `backend/src/generator/generator.service.ts:57` — `analyze(projectId, onProgress?)` |
| **Zod là hệ validate duy nhất**, `safeParse` cho mọi input ngoài                                                 | Output của LLM bị đối xử y hệt body của người lạ:`unknown` cho tới khi parse xong                    | `backend/src/contracts/llm-io/generator.ts`                                            |

Sơ đồ gọi nhau — mũi tên là *"gọi"*, không phải *"gửi dữ liệu"*:

```
                    ┌──────────── jobs + SSE ────────────┐
                    │  ai cũng đứng trên nó              │
                    └──┬─────────┬──────────┬────────────┘
                       │         │          │
                  generator   verifier    judge
                       │         │          │
                       └────► decision ◄────┘
                              (đọc kết quả của cả ba,
                               ghi ra SpecVersion mới)
```

---

# 1. `jobs + SSE` — nền của bốn cái còn lại

**Trách nhiệm:** mọi endpoint gọi mô hình trả `jobId` **ngay** thay vì bắt người dùng chờ, và phát
tiến độ theo thời gian thực.

| Endpoint                                                    | Chỗ trong code                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /jobs/:id` — trạng thái cuối, luôn trả được | `backend/src/jobs/jobs.controller.ts:12`                           |
| `GET /jobs/:id/stream` — luồng SSE                      | `backend/src/jobs/jobs.controller.ts:17` — `@Sse(':id/stream')` |

## 1.1 Luồng step-by-step

Lấy `POST /projects/:id/analyze` làm ví dụ — **cả bốn component kia dùng đúng khuôn này**:

```ts
// backend/src/project/project.controller.ts:85
@Post(':id/analyze')
async analyze(@Param('id') id: string, @UserId() userId: string) {
  await this.projects.assertOwned(id, userId);          // 1. check quyền
  const jobId = await this.jobs.create('ANALYZE', {...}); // 2. tạo job, có thể ném 409
  this.jobs.runInBackground(jobId, () =>                 // 3. thả ra nền, KHÔNG await
    this.generator.analyze(id, (d, t, m) => this.jobs.progress(jobId, d, t, m)),
  );
  return { jobId };                                      // 4. trả về ngay, ~50ms
}
```

1. **Chặn job trùng.** `create` tìm job **cùng `kind`, cùng project**, đang `QUEUED`/`RUNNING`; có
   thì ném `409 JOB_ALREADY_RUNNING` **kèm `jobId` đang chạy** — `backend/src/jobs/jobs.service.ts:36-50`.
   Trả kèm id là cố ý: frontend nối thẳng vào job đó thay vì báo lỗi rồi bỏ mặc.
2. **Tạo hàng `JobRun`** với `status: 'RUNNING'` và `progress: { done, total }` —
   `jobs.service.ts:52`.
3. **Mở kênh trong RAM.** Một `Subject` của RxJS cho mỗi job, cộng một bộ đếm `seq` —
   `jobs.service.ts:63-64`.
4. **Chạy nền.** `runInBackground` bọc toàn bộ trong try/catch: xong thì `finish(DONE)`, ném thì
   lấy `err.code` nếu là `AppError`, không thì `INTERNAL_ERROR` — `jobs.service.ts:128`.
5. **Mỗi lần báo tiến độ**: `progress` cập nhật `JobRun` rồi `emit` — `jobs.service.ts:87`.
6. **`emit` ghi DB trước, đẩy vào kênh sau** — `jobs.service.ts:76` rồi `:84`. Thứ tự đó là điều
   quan trọng nhất của cả module, xem §1.3.
7. **Kết thúc** ghi `finished_at` + `error_code`, phát `job.done`/`job.failed`, rồi **đợi 2 giây**
   mới đóng kênh — `jobs.service.ts:117`. Không đợi thì client đang nối dở mất đúng sự kiện cuối.

## 1.2 Techstack — cái gì làm gì

| Thứ                               | Làm gì ở đây                      | Vì sao chọn nó                                                                                                                                                               |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server-Sent Events**       | Đẩy tiến độ server → client      | Một chiều là đủ. WebSocket cho một luồng một chiều là trả giá cho thứ không dùng: thêm handshake, thêm heartbeat, thêm đường tự nối lại phải tự viết |
| **RxJS `Subject`**         | Kênh trong RAM cho mỗi job           | Nest hỗ trợ`@Sse()` trả thẳng `Observable`; dùng `Subject` là đi theo hạt gỗ của framework thay vì chống lại nó                                             |
| **`concat(replay, live)`** | Nối lịch sử vào luồng trực tiếp | `backend/src/jobs/jobs.service.ts:189` — một toán tử thay cho cả một vòng lặp đồng bộ hoá tự viết                                                               |
| **`JobEvent.seq`**         | Số thứ tự tăng dần cho từng job  | Là thứ làm`Last-Event-ID` chạy được. Không có nó thì F5 mất sạch                                                                                                 |

## 1.3 Technical design — quyết định và đánh đổi

**SSE là đường tăng tốc, chứ không phải nguồn sự thật.** Chép nguyên văn từ comment đầu file
(`jobs.service.ts:14-16`). Hệ quả cụ thể: `emit` **ghi `JobEvent` xuống DB trước**, đẩy vào kênh RAM
sau. Đảo thứ tự lại thì có một khoảnh khắc client đã thấy sự kiện mà DB chưa có — và đúng khoảnh
khắc đó nếu F5 thì sự kiện biến mất khỏi đời. Ghi DB trước làm chậm hơn vài ms, đổi lại
`GET /jobs/:id` **luôn** trả được trạng thái cuối kể cả khi kênh RAM đã chết.

**Ghi `JobEvent` hỏng thì log rồi đi tiếp, không ném** — `jobs.service.ts:79-83`. Đây là đánh đổi có
chủ ý: mất một dòng log tiến độ **không** đáng để giết một job đã tốn tiền thật gọi LLM.

**Không có nút huỷ job** — `jobs.service.ts:124-127`. Lý do ghi thẳng trong code: job dài nhất
khoảng 90 giây, mà thêm cơ chế huỷ là thêm một **trạng thái** phải xử ở mọi chỗ đang đọc job
(`CANCELLED` khác `FAILED` thế nào? job đã gọi LLM rồi thì tiền đã tiêu, huỷ nghĩa là gì?). Đổi lấy:
người dùng lỡ bấm nhầm phải chờ hết 90 giây.

**Check quyền tách khỏi luồng** — `assertOwned` ở `jobs.service.ts:199`, gọi riêng trước khi mở
stream. Lý do ghi ở `:198`: `@Sse()` không đi qua pipe body được, nên không dùng lại được đường
validate thường.

## 1.4 Chỗ có thể vỡ

`seqCounters` và `channels` là **`Map` trong RAM của một tiến trình**. Chạy hai instance backend thì
client nối vào instance B sẽ không thấy luồng trực tiếp của job đang chạy ở instance A — nó vẫn
nhận được **phần replay từ DB**, nhưng tiến độ đứng im tới khi F5. Đây là cái giá của việc chưa có
Redis pub/sub, và nó **chấp nhận được ở quy mô 1 VPS** đang chạy.

---

# 2. `generator` — mọi bước sinh nội dung

**Trách nhiệm:** năm bước sinh nội dung của spec. Không bước nào ghi trực tiếp ra spec cuối; tất cả
ghi vào `SpecVersion` nháp.

| Endpoint                               | Sinh ra gì                                                  | Service                      |
| -------------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| `POST /projects/:id/analyze`         | Diễn giải lại + bộ thẻ + câu hỏi làm rõ             | `generator.service.ts:57`  |
| `POST /projects/:id/related-work`    | Bảng related work                                           | `:139`                     |
| `POST /projects/:id/gap`             | Research gap                                                 | `:198`                     |
| `POST /projects/:id/contributions`   | Contribution + claim–evidence                               | `:301`                     |
| `POST /projects/:id/experiment-plan` | Kế hoạch thí nghiệm + ước lượng tài nguyên         | `:395`                     |
| `POST /projects/:id/estimate`        | Ước lượng theo tham số**người dùng tự nhập** | `:497` — `saveEstimate` |

## 2.1 Luồng step-by-step — lấy `analyze` làm chuẩn

1. **Đọc project**, báo tiến độ `0/1` — `generator.service.ts:58-61`.
2. **Gọi LLM qua `LlmService.completeJson`** với `promptId: 'generator'`, `deepseek-v4-pro`,
   `reasoningEffort: 'high'`, `maxTokens: 12_000` — `:63-72`. Prompt **không** nằm trong code; nó
   được đọc từ `prompts/generator.md`.
3. **Bảo đảm có version nháp** — `:74`, `ensureDraftVersion` ở `:528`.
4. **Ghi tất cả trong MỘT transaction** — `:76`. Bốn việc, hoặc xong cả bốn hoặc không việc nào:
   - **Xoá sạch thẻ cũ rồi tạo lại**, không cộng dồn — `:78`. Chạy lại `analyze` là **thay thế**,
     vì cộng dồn thì bấm hai lần ra bộ thẻ nhân đôi.
   - Ghi `meta` của version (diễn giải, độ tự tin, từ khoá tìm kiếm) — `:99`.
   - Cập nhật `Project.title`/`domain`/`status`/`current_spec_version_id` — `:103`.
   - **Câu hỏi làm rõ biến thành `Decision` chưa trả lời** (`chosen_key = ''`) — `:116-125`.

Điểm 4 cuối là chỗ đáng nói nhất của cả module: **không có đường ghi riêng cho "câu hỏi đang chờ"**.
Một câu hỏi làm rõ *chính là* một `Decision` chưa có câu trả lời. Nhờ vậy điểm dừng chờ người dùng
không cần bảng mới, không cần trạng thái mới — và mọi câu hỏi từng hỏi đều nằm sẵn trong nhật ký
quyết định.

## 2.2 Luồng `experimentPlan` — ba trạng thái, ba câu nói

Đây là chỗ duy nhất trong generator có nhánh, và nó có nhánh vì một lỗi thật đã xảy ra với 5 job.

```
LLM trả estimator_inputs
   │
   ├── null  ────────────► NOT_APPLICABLE   "không chạy trên model nào, không cần ước lượng"
   ├── parse OK ─────────► OK               chạy công thức, ra VRAM/giờ/chi phí
   └── parse hỏng ───────► INVALID_PARAMS   "tham số không hợp lệ — bạn tự nhập ở cột phải"
```

1. `raw = out.data.estimator_inputs` — `generator.service.ts:423`.
2. `null` là **giá trị hợp lệ**, không phải lỗi: mô hình chủ động nói kế hoạch này không chạy trên
   model nào (prompt rule 8) — `:428`.
3. `safeParse` làm lưới cuối — `:435`. Comment ở `:432-434` nói thẳng nhánh này *về lý thuyết* không
   xảy ra vì schema output đã dùng chung `estimatorInputSchema`, nhưng "về lý thuyết" không phải một
   bảo đảm.
4. **Ghi đúng một lần**, sau khi đã biết trạng thái — `:469`. Trước đây kế hoạch được `upsert` **rồi
   mới** parse; parse ném thì job chết sau khi kế hoạch đã vào DB, để lại một hàng không mang thông
   tin nào về việc vì sao nó thiếu ước lượng.
5. **Ước lượng là công thức thuần, 0 token** — `:488`. Mô hình chỉ cung cấp *tham số*; phép tính do
   `EstimatorService` làm.

**Log ghi `path` + `code`, không ghi giá trị** — `:441-448`. Lý do viết ngay trong comment:
`message` của một zod custom error có thể kèm giá trị, và đó là **output model lọt vào log**
(`backend/CLAUDE.md` §5).

## 2.3 Techstack

| Thứ                                                        | Làm gì                                                 | Vì sao                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`PromptLoaderService`**                           | Đọc`prompts/*.md`, tách `## SYSTEM` / `## USER` | `backend/src/prompts/prompt-loader.service.ts:91-98`. Prompt nằm ngoài code nên **prompt nộp đúng là prompt đã chạy** — chứng minh bằng `prompt_hash` chứ không bằng lời hứa |
| **zod**                                               | Schema cho từng loại output                            | `contracts/llm-io/generator.ts`. Output không khớp → thử lại, đính lỗi zod vào lượt sau                                                                                                     |
| **`prisma.$transaction`**                           | Bốn lệnh ghi của`analyze`                           | Không có nó thì một lỗi giữa chừng để lại version có thẻ mới nhưng`meta` cũ                                                                                                            |
| **`deepseek-v4-pro` + `reasoningEffort: 'high'`** | Mọi bước sinh nội dung                               | Đây là việc cần suy luận, không phải việc lặp                                                                                                                                                  |

## 2.4 Technical design

**`onProgress` là tham số, không phải dependency.** Chữ ký `analyze(projectId, onProgress?)` —
`generator.service.ts:57`. Service **không biết** `JobsService` tồn tại; controller mới là chỗ nối
hai thứ lại. Nhờ đó `eval/harness.ts` gọi generator mà không cần tạo job nào.

**Chạy lại là thay thế, không cộng dồn** — `:78`. Áp cho mọi bước. Nó làm cho "bấm lại nút" là một
thao tác an toàn, và đó là thứ người dùng làm nhiều nhất.

---

# 3. `verifier` — 5 tầng, rẻ trước đắt sau

**Trách nhiệm:** với mỗi cặp *(khẳng định, nguồn)*, gắn nhãn `SUPPORTED` / `WEAK` / `UNSUPPORTED`.

| Endpoint                                                  | Chỗ trong code                                    |
| --------------------------------------------------------- | -------------------------------------------------- |
| `POST /spec-versions/:id/verify`                        | `backend/src/spec/spec.controller.ts:210`        |
| `GET /spec-versions/:id/verification`                   | `:228`                                           |
| `GET /spec-versions/:id/evidence-trace`                 | `backend/src/verifier/verifier.controller.ts:30` |
| `GET /spec-versions/:id/gate` — cổng chặn xuất bản | `backend/src/spec/spec.controller.ts:234`        |

## 3.1 Luồng step-by-step

**Vòng ngoài** — `verifier.service.ts:58`, `verifySpecVersion`:

1. Đọc cờ toàn văn **đúng một lần** cho cả lượt chạy — `:79`.
2. Lấy danh sách cặp cần kiểm — `:87`. Chi tiết đáng chú ý ở `:92-95`: có mảng `cardIds` thì chỉ
   kiểm đúng những thẻ đó **kể cả mảng rỗng**. Trước đây điều kiện là `cardIds?.length`, nên truyền
   `[]` với ý *"không thẻ nào cần kiểm lại"* lại đi kiểm **toàn bộ** version — ngược hẳn ý gọi.
3. Tạo `VerifierRun` và **chép bộ ngưỡng vào hàng đó** — `:101-106`. Nhãn cũ vì thế vẫn giải thích
   được sau khi ngưỡng đổi.
4. Chạy từng cặp, ghi kết quả ngược lại `CardSource` — `:169`.

**Vòng trong** — `verifyUnit`, mỗi tầng một chốt chặn:

| Tầng                      | Làm gì                                                                                       | Tốn gì                        | Dòng    |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- | -------- |
| **L0**               | Không có`external_id` → `UNSUPPORTED` ngay. Có DOI thì tra Crossref/DataCite          | rule + HTTP                     | `:275` |
| **L1**               | Abstract quá ngắn →`capWeak`. Nguồn quá cũ cho một claim về tính mới → cảnh báo | rule                            | `:308` |
| **L2**               | Con số trong claim không có trong nguồn →`capWeak`                                      | rule                            | `:322` |
| **chốt loại thẻ** | Thẻ`GAP`/`CONTRIBUTION` → `WEAK` + cờ `CITATION_ONLY`, dừng                        | 0                               | `:340` |
| **L3**               | Embedding từng câu của abstract, lấy cosine lớn nhất                                     | CPU local,**0 token API** | `:371` |
| **L3b**              | Abstract không kết luận nổi → leo xuống toàn văn                                       | HTTP                            | `:404` |
| **L4**               | LLM entailment,**chỉ chạm vùng xám**                                                 | token                           | `:446` |
| **L4b**              | Câu trích dẫn LLM đưa ra phải là chuỗi con**có thật** của abstract            | rule                            | `:491` |
| **L5**               | Bảng quyết định ra nhãn cuối                                                             | 0                               | `:504` |

Bảng L5 đọc từ trên xuống, luật đầu tiên khớp thì dừng — `verifier.service.ts:766`:

```ts
if (verdict === 'CONTRADICTS')  return 'UNSUPPORTED';
if (verdict === 'NOT_ENTAILED') return 'UNSUPPORTED';
if (capWeak)                    return 'WEAK';   // L1/L2 đã hạ trần
if (verdict === 'PARTIAL')      return 'WEAK';
if (verdict === 'ENTAILS' && confidence < th.conf_min) return 'WEAK';
return 'SUPPORTED';
```

## 3.2 Chín chốt chặn — chi tiết từng cái

Ba ngưỡng dùng chung, đọc từ `thresholds.ts:18` và **chép vào `VerifierRun.config` mỗi lượt chạy**:

```ts
tau_low: 0.35 · tau_high: 0.72 · conf_min: 0.7
title_match: 0.85 · min_abstract_chars: 200 · stale_years: 8
```

Chép lại mỗi lượt là để **nhãn cũ vẫn giải thích được sau khi ngưỡng đổi**. File tự nói thẳng ở
`thresholds.ts:3` rằng đây là **ước đoán, không phải số đo**.

---

### L0 · Nguồn có tồn tại không — `verifier.service.ts:275`

Hai phép thử, và chúng **không cùng sức nặng**.

**a) Không có `external_id` → `UNSUPPORTED` ngay, dừng** (`:276-287`). Đây là chốt cứng duy nhất
trong toàn thang: một nguồn không có mã của provider học thuật là một nguồn **không tồn tại trong
kho**. Không có gì để kiểm tiếp.

**b) Có DOI thì tra — nhưng tra hỏng chỉ hạ tin, không kết luận** (`:288-306`).
`SourceClient.verifyDoi` (`source.client.ts:249`) hỏi **hai** registry theo thứ tự:

```
Crossref  → 200 ⇒ true, dừng            (source.client.ts:253)
DataCite  → 200 ⇒ true, dừng            (:259)
cả hai đều trả 404 ⇒ false              (:266)
còn lại (timeout, 5xx, mạng hỏng) ⇒ null (:267)
```

Ba giá trị chứ không phải hai — `boolean | null` — và `null` nghĩa là *"chưa biết"*, khác hẳn
*"không tồn tại"*. Chỉ khi **cả hai registry đều trả lời và đều nói không có** mới kết luận `false`.

Vì sao phải có DataCite: **DOI của arXiv và Zenodo đăng ký ở DataCite chứ không phải Crossref**
(`source.client.ts:33-34`). Bản đầu chỉ hỏi Crossref, và nó cho `UNSUPPORTED` **mọi paper arXiv** —
tức chặt tay nhất đúng vào loại nguồn phổ biến nhất của ngành ML.

Kể cả `false`, kết quả cũng chỉ là **cờ `DOI_UNVERIFIED`**, không phải nhãn. Lý lẽ ghi ở `:299-301`:
một nguồn có **hai đường chứng minh tồn tại độc lập** — `external_id` và DOI. Mất một cái vẫn còn
một cái, nên DOI tra không ra **không đủ** để kết luận nguồn là bịa.

Kết quả tra được **ghi ngược vào `Source.doi_verified`** (`:292-297`) nên lần chạy sau không hỏi
lại; và lệnh ghi đó `.catch(() => undefined)` — cache hỏng thì không được giết cả lượt kiểm.

---

### L1 · Sanity metadata — `verifier.service.ts:308`

Hai phép thử, **hai mức độ khác nhau**, và đó là điểm đáng chú ý:

| Phát hiện | Hậu quả | Dòng |
| --- | --- | --- |
| Abstract ngắn hơn `min_abstract_chars` (200) | cờ `EMPTY_ABSTRACT` **+ `capWeak = true`** | `:310-313` |
| Claim nói về **tính mới** mà nguồn cũ hơn `stale_years` (8) | cờ `STALE_SOURCE` — **chỉ cảnh báo, không hạ nhãn** | `:314-320` |

`capWeak` là một biến trần: bật lên thì **trần nhãn hạ xuống `WEAK` bất kể L3 và L4 nói gì**. Còn
`STALE_SOURCE` cố tình **không** bật nó — một bài 2015 vẫn có thể là bằng chứng đúng cho một claim
không nói về tính mới, nên nó chỉ hiện ra cho người đọc tự cân.

Điều kiện "claim nói về tính mới" do `claimsRecency()` quyết, không phải áp cho mọi claim.

**Số thật của dự án ví dụ ở §4.2: 7/25 nguồn có `abstract` rỗng** — tức 28% số nguồn dính chốt này
trước khi tới bất kỳ tầng tốn kém nào.

---

### L2 · Đối chiếu con số — `verifier.service.ts:322`

**Đây là luật quan trọng nhất của cả phần rule**, và `numeric-guard.ts:4-8` nói rõ vì sao:

> Dạng hallucination hay gặp nhất **không phải bịa cả paper**, mà là trích đúng paper rồi gán cho nó
> một con số không có. Embedding không bắt được kiểu này: hai câu chỉ khác con số có **cosine rất
> cao**.

Nói cách khác: L3 và L4 **về nguyên lý** mù với loại lỗi này, nên nó phải bị bắt bằng rule, **trước**
khi tới embedding.

Cách làm — `numbersMissingFromSource` (`numeric-guard.ts:50`):

1. Rút mọi con số kèm đơn vị khỏi claim bằng regex (`:11`) — `%`, `×`, `points`, `GB`, `M`, `B`…
2. **Bỏ hai loại số không mang thông tin định lượng**, nếu không sẽ báo động giả liên tục:
   - **năm 1900–2099** không có đơn vị (`:25-27`) — "the 2019 baseline" không phải một kết quả đo;
   - **số nguyên ≤ 10** không có đơn vị (`:29`) — "3 experiments" là số đếm.
3. So với các con số rút từ abstract, **có dung sai một chữ số** (`:38-42`): `20.4` khớp `20`, và
   lệch dưới `0.05` cũng tính là khớp.
4. Còn con số nào không thấy → cờ `NUMBER_NOT_IN_SOURCE` + **`capWeak`**.

Điểm 2 và 3 là chỗ phân biệt một luật dùng được với một luật kêu suốt ngày. Không có chúng thì mọi
claim nhắc năm xuất bản đều bị đánh dấu.

---

### Chốt loại thẻ · trước mọi thứ tốn kém — `verifier.service.ts:340`

Thẻ **không** thuộc `ENTAILMENT_CARD_TYPES` → cờ `CITATION_ONLY`, nhãn `WEAK`, **dừng**. Hai tập hợp
này không giống nhau, và khoảng chênh chính là chốt:

```ts
VERIFIABLE_CARD_TYPES  = ['CLAIM', 'GAP', 'CONTRIBUTION', 'EVIDENCE']  // card.ts:69 — vào L0–L2
ENTAILMENT_CARD_TYPES  = ['CLAIM', 'EVIDENCE']                          // card.ts:97 — mới vào L3–L4
```

Lý do là **ngữ nghĩa, không phải hiệu năng** (`card.ts:82-90`):

- **`GAP` khẳng định một sự vắng mặt** — *"No retrieved work evaluates a cross-encoder reranker on
  Vietnamese legal statute passages"*. Không tóm tắt đơn lẻ nào kéo theo được một **phủ định phổ
  quát**. Câu hỏi đúng cho trích dẫn của một gap là *"nguồn này có thuộc mảng mà gap nói tới không"*
  — tức **độ liên quan**, không phải kéo theo.
- **`CONTRIBUTION` khẳng định việc tác giả sắp làm** — *"We define a paired evaluation that…"*. Một
  bài báo **cũ** mà kéo theo được nó thì nghĩa là đóng góp **không mới**, tức `ENTAILS` đáng ra là
  **tín hiệu xấu** — ngược hẳn cách bảng L5 đang dùng.

Đo trên toàn bộ dữ liệu đã kiểm của dự án (`card.ts:92-95`): **0/315 cặp `GAP`** và **0/130 cặp
`CONTRIBUTION`** từng đạt `SUPPORTED`, trong khi `CLAIM` — đúng loại thẻ phép thử này sinh ra để
phục vụ — vẫn có **4/67**. Không phải ngẫu nhiên, và nó là nguyên nhân của `unsupported_rate ≈ 1`
trong bảng ablation ở `docs/evaluation_report.md` phụ lục A.

**Đặt chốt này SAU L0–L2 là cố ý** (`:338-339`): trích dẫn của một gap **vẫn phải có thật**, DOI vẫn
phải tra được, con số vẫn phải nằm trong nguồn. Chỉ bỏ đúng **phép thử không áp dụng được**, không
bỏ cả việc kiểm.

Và cờ `CITATION_ONLY` là bắt buộc phải có (`enums.ts:94-97`): không có nó thì nhãn `WEAK` của một
thẻ `GAP` trông **y hệt** "đã hỏi mô hình và bằng chứng yếu", trong khi thật ra **mô hình chưa từng
được hỏi**.

---

### L3 · Embedding — `verifier.service.ts:371`

1. Cắt abstract thành câu (`splitSentences`), rỗng thì lấy cả abstract làm một câu (`:372-373`).
2. Nhúng **claim + toàn bộ câu trong một lời gọi** (`:378`) — `[claimText, ...pool]`.
3. Cosine giữa claim và từng câu, sắp giảm dần, **lấy `simMax` là câu cao nhất** (`:380-383`), giữ
   lại **3 câu đầu** làm phụ liệu cho L4 (`:384`).

Vector đã `normalize: true` nên cosine rút gọn thành **dot product** — `embedder.service.ts:108`.
Chạy CPU tại chỗ: **0 token API và hoàn toàn tái lập**.

Rồi hai đường tắt, và chúng chính là thứ giữ cho L4 rẻ:

| Điều kiện | Kết quả | Dòng |
| --- | --- | --- |
| `simMax < tau_low` (0.35) | `UNSUPPORTED`, **không gọi LLM** | `:418` |
| `simMax >= tau_high` (0.72) **và không cờ nào** ngoài `STALE_SOURCE` | `SUPPORTED`, **không gọi LLM** | `:430` |
| còn lại — **vùng xám** | xuống L4 | |

Đây là lý do cặp `SUPPORTED` trong ví dụ §4.2 có `evidence_sentence: null`: nó đi đường tắt thứ hai,
L4 chưa từng chạy, nên **không có câu trích dẫn nào để ghi** — và nhãn đó tốn **0 token**.

**Embedding hỏng thì fail-closed** (`:385-401`): cờ `LLM_UNAVAILABLE`, nhãn `WEAK`. Không kiểm được
thì không được coi là đã kiểm.

---

### L3b · Leo xuống toàn văn — `verifier.service.ts:404`

Chỉ chạy khi abstract **không kết luận nổi**, tức `clearlySupported === false` (`:410-416`).

**Cái bẫy nguy hiểm nhất của cả file nằm ở đây** (`:403-409`): `clearlySupported` phải được tính
**trước** khi bất kỳ cờ mới nào được push. Không thì cờ `FULLTEXT_UNAVAILABLE` **đầu độc** điều kiện
`flags.length === 0` ở đường tắt bên dưới, và âm thầm đẩy những cặp `SUPPORTED` sạch xuống L4 — vừa
tốn tiền vừa đổi nhãn.

`tryFullText` (`:527`) trả `null` = *"không dùng được, đi tiếp đường abstract cũ, không đổi một byte
nào"*. **Bốn lý do trả `null`**, nhưng cờ `FULLTEXT_UNAVAILABLE` **chỉ bật ở hai lý do cuối**:

| Lý do | Bật cờ? | Dòng |
| --- | :-: | --- |
| Cờ toàn văn tắt | không | `:553` |
| Nguồn không phải arXiv | **không** | `:564` |
| Tải hoặc bóc chữ hỏng | có | `:565-569` |
| Không chọn được đoạn nào | có | `:576-579` |

Vì sao "không phải arXiv" không gắn cờ: **60% số cặp** sẽ mang theo một cái cờ vô nghĩa, và một cờ
ai cũng có là một cờ không nói gì.

Chi tiết đắt nhất của tầng này — **L2 chạy lại trên `abstract + các đoạn đã chọn`**, không phải trên
toàn văn (`:583-599`):

- **Không phải abstract**: claim trích số từ Table 3 sẽ dính `NUMBER_NOT_IN_SOURCE` rồi bị hạ trần
  xuống `WEAK`, nên toàn văn **không bao giờ nâng nổi nhãn** — đúng loại claim định lượng mà tính
  năng này sinh ra để phục vụ.
- **Cũng không phải cả tài liệu**: trên 60 000 ký tự thì dung sai làm tròn khiến "trúng" gần như
  chắc chắn, và **check 0-token mạnh nhất của hệ thống thành vô nghĩa**.

Đoạn-đã-chọn giữ đúng nghĩa gốc của L2: **con số phải nằm ở chỗ có bằng chứng.**

---

### L4 · LLM entailment — `verifier.service.ts:446`

Chỉ chạm **vùng xám** còn lại sau hai đường tắt của L3.

| | |
| --- | --- |
| Prompt | `prompts/verifier_entailment.md` |
| Model | `deepseek-v4-flash` — việc ngắn, lặp nhiều |
| `maxTokens` | **1200** — output chỉ là một verdict, không phải một bài luận |
| `reasoningEffort` | `low` |

Ba biến vào prompt (`:458-464`): `claim_text`, **`abstract` nguyên văn**, và `top_sentences` — 3 câu
giống nhất từ L3. Prompt nói thẳng 3 câu đó chỉ là **phụ liệu đọc**, còn *"the whole abstract above
is still the authority"*: không để mô hình chỉ nhìn 3 câu rồi kết luận.

Schema output — `contracts/llm-io/judge.ts:24`:

```ts
verdict:  'ENTAILS' | 'PARTIAL' | 'NOT_ENTAILED' | 'CONTRADICTS'
confidence: number 0..1
evidence_sentence: string | null
reason: string   // .default('')
```

`reason` có `.default('')` (`:28-30`) vì một lý do rất thực dụng ghi ngay trong code: nó **chỉ để
người đọc hiểu**, thiếu nó **không đổi nhãn cuối** — nên cho mặc định thay vì tốn nguyên một lượt
retry. Phát hiện khi chạy batch thật.

**L4 hỏng cũng fail-closed** (`:474-489`): `WEAK` + cờ `LLM_UNAVAILABLE`, và `usedL4: true` vẫn được
ghi — lượt gọi đó đã tốn tiền, số liệu phải phản ánh điều đó.

---

### L4b · Chống bịa trích dẫn — `verifier.service.ts:491`

**Rule kiểm lại output của LLM.** Câu `evidence_sentence` mà mô hình đưa ra phải là **chuỗi con có
thật** của abstract, so sau khi gom khoảng trắng (`collapseWhitespace`). Không phải → cờ
`FABRICATED_QUOTE` và **ép `verdict = 'NOT_ENTAILED'`** (`:496-499`).

Đây là chỗ đáng nói nhất về mặt thiết kế: **tầng đắt nhất bị tầng rẻ nhất kiểm lại.** Một verdict
`ENTAILS` kèm câu trích dẫn bịa sẽ bị chính rule 0-token lật ngược. Không có nó thì cả thang năm
tầng vẫn kết thúc bằng "tin lời mô hình".

Chuỗi rỗng thì chuẩn hoá về `null` (`:500-502`) — không để `''` và `null` cùng tồn tại làm hai cách
viết cho một trạng thái.

---

### L5 · Bảng quyết định — `verifier.service.ts:504`, hàm ở `:766`

Luật đầu tiên khớp thì dừng. Thứ tự **là** ngữ nghĩa:

| # | Điều kiện | Nhãn | Vì sao đặt ở đây |
| --- | --- | --- | --- |
| 1 | `CONTRADICTS` | `UNSUPPORTED` | Nguồn **nói ngược** thì không có gì cứu được |
| 2 | `NOT_ENTAILED` | `UNSUPPORTED` | Gồm cả ca bị L4b ép xuống |
| 3 | `capWeak` | `WEAK` | **Trần của L1/L2 thắng mọi verdict tốt của L4** |
| 4 | `PARTIAL` | `WEAK` | Đúng một phần vẫn là chưa đủ |
| 5 | `ENTAILS` **và** `confidence < conf_min` (0.7) | `WEAK` | Mô hình tự nhận không chắc |
| 6 | còn lại | `SUPPORTED` | |

Luật 3 là chỗ quan trọng nhất: **một con số không có trong nguồn thì không có verdict nào của LLM
nâng nổi nhãn lên `SUPPORTED`.** Rule 0 token đứng trên LLM, không phải ngược lại.

`SUPPORTED` là **nhánh cuối cùng** — mặc định của hệ thống là *chưa chứng minh được*, và phải đi hết
sáu luật mới tới được nó.


## 3.3 Technical design — bốn quyết định đáng bảo vệ

**1 · Rẻ trước đắt sau là kiến trúc, không phải tối ưu.** Comment ở `:41-43` nói thẳng: ba tầng đầu
chặn phần lớn lỗi mà **không tốn một token API nào**, và *"đó chính là thứ biến verifier thành một
cải tiến thay vì gọi thêm một LLM nữa để kiểm tra LLM"*. Nếu tầng đầu là LLM thì cơ chế này không
khác gì thứ nó định kiểm.

**2 · DOI tra không ra thì hạ tin, KHÔNG kết luận là bịa** — `:299-305`. Lý lẽ: một nguồn có **hai**
đường chứng minh tồn tại độc lập — mã của provider học thuật và DOI. Mất một cái vẫn còn một cái.
Bản đầu chặt quá tay và cho `UNSUPPORTED` **mọi paper arXiv**, vì DOI arXiv không nằm ở Crossref.

**3 · Chốt loại thẻ đặt SAU L0–L2, không phải trước** — `:332-339`. Thẻ `GAP` khẳng định một **sự
vắng mặt**, `CONTRIBUTION` khẳng định việc tác giả **sắp làm** — không tóm tắt đơn lẻ nào kéo theo
được hai thứ đó (đo thật: **0/315** cặp GAP và **0/130** cặp CONTRIBUTION từng đạt `SUPPORTED`).
Nhưng đặt chốt này *sau* L0–L2 là cố ý: trích dẫn của một gap **vẫn phải có thật**, DOI vẫn phải tra
được, con số vẫn phải nằm trong nguồn. Chỉ bỏ đúng **phép thử không áp dụng được**, không bỏ cả việc
kiểm.

**4 · Fail-closed ở mọi chỗ có thể hỏng.** Embedding chết → `WEAK` + cờ, không phải `SUPPORTED`
(`:385`). L4 chết → `WEAK` + cờ (`:474`). Nguyên tắc một câu: **không kiểm được thì không được coi
là đã kiểm.**

**Cái bẫy nguy hiểm nhất, đã ghi lại** — `:403-409`. `clearlySupported` phải tính **trước** khi push
bất kỳ cờ mới nào; không thì cờ `FULLTEXT_UNAVAILABLE` đầu độc điều kiện `flags.length === 0` và âm
thầm đẩy những cặp `SUPPORTED` sạch xuống L4 — tốn tiền, và đổi nhãn.

## 3.4 Techstack

| Thứ                                                      | Làm gì                                     | Đánh đổi                                                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@xenova/transformers` + `all-MiniLM-L6-v2`** | L3, chạy CPU tại chỗ                      | `backend/src/verifier/embedder.service.ts:16`. **0 token, hoàn toàn tái lập**. Giá: ~1 GB RAM và ~4 giây khởi động lần đầu |
| **`deepseek-v4-flash`**                           | L4 entailment                                | `:454`. Việc ngắn, lặp nhiều → tier rẻ. `maxTokens: 1200` vì output chỉ là một verdict                                            |
| **Crossref + DataCite**                             | Tra DOI ở L0                                | Hai nhà cung cấp vì DOI arXiv không nằm ở Crossref                                                                                        |
| **`thresholds.ts`**                               | Ba ngưỡng, chép vào từng`VerifierRun` | `:19-21`. Là số **chọn**, không phải số đo — code tự ghi điều đó ở `replay.ts:9`                                        |

---

# 4. `judge` — 5 lời gọi song song, ngữ cảnh sạch

**Trách nhiệm:** đề bài đòi các judge phải chấm **riêng** trước khi thấy nhận xét của nhau. Module
này là bằng chứng kỹ thuật cho điều đó, đọc thẳng được từ dữ liệu.

| Endpoint                              | Chỗ trong code                             |
| ------------------------------------- | ------------------------------------------- |
| `POST /spec-versions/:id/judge`     | `backend/src/spec/spec.controller.ts:172` |
| `GET /spec-versions/:id/judge-runs` | `:198`                                    |
| `GET /spec-versions/:id/issues`     | `:204`                                    |

## 4.1 Luồng step-by-step — `runRound`, `judge.service.ts:47`

1. **Chặn theo `judge_rounds_total`, không theo `judge_round`** — `:56-62`. Lý do ghi trong comment:
   `apply` reset `judge_round` về 0 cho version mới (bắt buộc, vì `JudgeRun` unique theo
   `(spec_version_id, judge_key, round)`), nên đếm bằng nó thì trần "tối đa 3 vòng mỗi dự án"
   **không bao giờ tới**.
2. **Chặn chạy trùng vòng** — `:69`.
3. **Dựng đầu vào ĐÚNG MỘT LẦN rồi băm** — `:78-85`. Đây là câu quan trọng nhất của module:

   > Nếu mỗi judge tự dựng đầu vào riêng thì `input_digest` khác nhau và bằng chứng độc lập biến
   > mất — **không phải vì hệ thống sai, mà vì không còn cách nào chứng minh nó đúng.**
   >
4. **`Promise.allSettled`, không phải `Promise.all`** — `:96`. Một judge ném lỗi không được làm rơi
   bốn kết quả kia; chúng **đã tốn tiền thật và đã xong**.
5. Mỗi judge gọi LLM với **trần token riêng** — `:107`, `maxTokens: def.maxTokens`. Xem §4.3.
6. **Quorum**: dưới 3 judge xong thì **từ chối kết luận** — `:200`. Thông báo nói thẳng lý do:
   *"below the threshold, agreement is meaningless"*.
7. **Gộp issue bằng rule tất định** — `:208` → `issue-grouping.ts:37`.
8. Tăng `judge_rounds_total`, chuyển version sang `UNDER_REVIEW` — `:213-220`.
9. **Chốt số đo bất đồng ngay lúc chạy** — `:225`. Và lỗi ở bước này **không** được làm rơi cả vòng
   judge vừa tốn tiền: `.catch()` ghi log rồi đi tiếp — cùng lý lẽ với `allSettled`.

## 4.2 Hai đầu vào trông như thế nào — ví dụ thật

Trích từ một dự án có thật trong DB (`spec_version` `9613659e`, "Improving Sleep in Older Adults",
version 3). Đây **đúng là chuỗi** đã đưa cho cả 5 judge trong lượt chạy đó.

**Quy mô một lượt:** `spec_json` + `sources_json` = **121 189 byte JSON** → 19 thẻ · 22 cặp claim–nguồn ·
25 nguồn · 14 mục. Cùng một chuỗi đó nhân 5 judge.

### `spec_json` — dựng từ DB bởi `spec.service.ts:294`

Tám khoá ở tầng ngoài cùng:

```jsonc
{
  "title": "Improving Sleep in Older Adults: Research Specification",
  "domain": "Sleep Medicine",
  "version_no": 3,
  "cards":         [ /* 19 thẻ  */ ],
  "card_sources":  [ /* 22 cặp */ ],
  "experiment_plan": { /* … */ },
  "resource_estimate": null,
  "sections":      [ /* 14 mục, mỗi mục kèm present: true|false */ ]
}
```

**`cards`** — bộ thẻ, phân bố thật của dự án này: 4 `CONTRIBUTION` · 4 `CLAIM` · 3 `GAP` ·
2 `PROBLEM` · 2 `RESEARCH_QUESTION` · 2 `OPEN_QUESTION` · 1 `EVIDENCE` · 1 `CONSTRAINT`.
Mỗi thẻ có bốn trường cố định cộng một `payload` **khác nhau theo `type`**:

```jsonc
// type: "CLAIM" — payload mang bốn trường của ma trận claim–evidence
{
  "title":  "Mindfulness meditation produces a greater improvement in subjective sleep quality than sleep hygiene education…",
  "type":   "CLAIM",
  "status": "PROPOSED",
  "body":   "Mindfulness meditation produces a greater improvement…",
  "payload": {
    "metric":   "Change in Pittsburgh Sleep Quality Index (PSQI) global score from baseline to 8 weeks",
    "baseline": "Sleep hygiene education (SHE) delivered in the same format and duration",
    "evidence": "Between-group mean difference in PSQI change ≥1.5 points, with a 95% CI lower bound >0.5, intent-to-treat",
    "refutation_condition": "The mindfulness arm does not achieve a mean PSQI reduction at 8 weeks at least 1.5 points greater than SHE, or the difference is not significant at P<0.05…"
  }
}
```

```jsonc
// type: "GAP" — payload đổi sang bốn trường khác hẳn
{ "type": "GAP", "payload": { "limitation": "…", "prior_work": "…",
                              "why_it_matters": "…", "testable_experiment": "…" } }

// type: "CONSTRAINT" — không có payload
{ "type": "CONSTRAINT", "payload": null }
```

Đây là lý do `payload` để kiểu `Json` chứ không tách cột: **mỗi loại thẻ có một hình dạng riêng**,
và cái ràng buộc hình dạng đó là zod ở tầng ứng dụng, không phải schema DB.

**`card_sources`** — 22 cặp *(thẻ, nguồn)* **kèm nhãn verifier đã chấm**. Đây là chỗ verifier và
judge gặp nhau: J4 không tự đi kiểm lại từ đầu, nó **đọc kết luận của verifier** rồi soi xem claim
có nói quá so với nhãn không.

```jsonc
// một cặp SUPPORTED — sạch cờ
{
  "card_title":   "Mindfulness meditation produces a greater improvement…",
  "source_id":    "9086dc16-3161-4897-952f-e7a2521df841",
  "source_title": "Mindfulness Meditation and Improvement in Sleep Quality and Daytime Impairment Among Older Adults…",
  "support_label": "SUPPORTED",
  "evidence_sentence": null,
  "flags": []
}

// một cặp WEAK — thẻ GAP nên bị chốt loại thẻ chặn ở verifier.service.ts:340
{
  "card_title":   "Evidence from trials in older adults with multimorbidity is limited by restrictive eligibility criteria",
  "source_id":    "c02a390b-51e9-4d5c-9c5c-3618eb1a293a",
  "support_label": "WEAK",
  "evidence_sentence": null,
  "flags": ["NUMBER_NOT_IN_SOURCE", "CITATION_ONLY"]
}
```

Phân bố nhãn thật của lượt này: **18 `WEAK` · 2 `SUPPORTED` · 2 `UNSUPPORTED`**. Phần lớn `WEAK`
mang cờ `CITATION_ONLY` — tức thẻ `GAP`/`CONTRIBUTION` bị chốt loại thẻ chặn trước khi tới L3–L4,
đúng như §3.2 điểm 3 mô tả.

**Hai chi tiết dễ bỏ qua nhưng nói lên cả cơ chế:**

- Cặp `SUPPORTED` ở trên có `evidence_sentence: null`. **Không phải thiếu dữ liệu** — nó đi đường
  tắt ở `verifier.service.ts:430` (`simMax >= tau_high` và không cờ nào), nên **L4 chưa từng chạy**
  và không có câu trích dẫn nào để ghi. Nhãn `SUPPORTED` này tốn **0 token**.
- Thân thẻ `GAP` nhắc nguồn bằng **tiền tố id** (`1a43a519`, `302471a5`, `c02a390b`) chứ không bằng
  tên tác giả. Đó là hệ quả trực tiếp của việc mô hình được đưa `source_id` — nó không có cách nào
  trỏ vào một paper ngoài danh sách.

**`sections`** — 14 mục kèm cờ `present`, để judge biết cái gì **thiếu** chứ không chỉ cái gì có:

```jsonc
[{ "no": 1, "title": "Problem statement",  "present": true  },
 …
 { "no": 11, "title": "Compute budget",    "present": false },   // ← mục duy nhất thiếu
 { "no": 14, "title": "Decision history",  "present": true  }]
```

**`experiment_plan` + `resource_estimate`** — và đây chính là ca `NOT_APPLICABLE` mà §2.2 mô tả:

```jsonc
"experiment_plan": {
  "experiments": [
    { "code": "TN1",
      "title": "Mindfulness meditation vs sleep hygiene education for subjective sleep quality in older adults",
      "bullets": ["Compare 8-week mindfulness program vs standard sleep hygiene education, matched for session length…",
                  "On 200 community-dwelling adults aged 60+ with moderate sleep disturbances (PSQI >5)",
                  "Metric: change in PSQI global score from baseline to 8 weeks, per intent-to-treat",
                  "Success: mindfulness arm achieves a mean PSQI reduction ≥1.5 points greater than SHE, 95% CI lower bound >0.5"],
      "linked_claim_title": "Mindfulness meditation produces a greater improvement…" },
    { "code": "TN2", … }
  ],
  "baselines_and_metrics": "Baselines: sleep hygiene education…, wait-list control…, general sleep education…",
  "ablation_plan": "Remove meditation-specific exercises from the…",
  "risks_and_limitations": "…",
  "estimate_status": "NOT_APPLICABLE",
  "estimate_note": "The binding resource is participant recruitment and retention across three parallel
                    randomized controlled trials, including trained nonclinician facilitators and
                    actigraphy equipment, not computational model training."
},
"resource_estimate": null
```

Ba thứ khớp nhau và **phải** khớp nhau: `estimate_status: "NOT_APPLICABLE"` → `resource_estimate: null` → mục 11 *Compute budget* `present: false`. Không có `estimate_status` thì judge nhìn thấy
`null` mà không biết đó là *"chưa chạy"* hay *"không áp dụng được"* — và sẽ báo một `MAJOR` sai.

### `sources_json` — dựng bởi `sources.service.ts:214`

**Tối đa 25 nguồn**, xếp theo `citation_count` giảm dần rồi `year` giảm dần —
`sources.service.ts:229-230`. Chín trường, không có trường nào thừa:

```jsonc
{
  "source_id":      "ef3e7222-e6a2-4ef8-bb64-438ab86fba51",
  "title":          "Is Sleep Duration Associated With Childhood Obesity? A Systematic Review and Meta-analysis",
  "year":           2008,
  "venue":          "Obesity",
  "doi":            "10.1038/oby.2007.63",
  "url":            "https://doi.org/10.1038/oby.2007.63",
  "retrieved_from": "OPENALEX",
  "external_id":    "W1966782702",
  "abstract":       "Obesity is a major public health epidemic worldwide in children and adults…"
}
```

**Nguồn đầu tiên của danh sách này nói về béo phì trẻ em, trong một dự án về giấc ngủ người cao
tuổi.** Nó nằm đó vì được trích dẫn nhiều nhất, không phải vì nó liên quan — và đó chính là điều
cần hiểu về `sources_json`:

> Nó là **danh sách trắng để chặn bịa**, không phải một thư mục tài liệu đã tuyển chọn.

Mô hình bị cấm trỏ ra ngoài danh sách này; nó **không** được bảo rằng mọi thứ trong danh sách đều
dùng được. Bắt một claim trích vào đúng cái nguồn béo phì trẻ em kia là **việc của J4**, và đó là lý
do J4 tồn tại.

Hai số đo thật khác của lượt này: **7/25 nguồn có `abstract` rỗng** (chúng sẽ dính cờ
`EMPTY_ABSTRACT` ở L1 và bị hạ trần xuống `WEAK` — `verifier.service.ts:310`), và **25/25 đến từ
OpenAlex**.

## 4.3 Technical design

**Ba thứ làm cho "độc lập" là kỹ thuật chứ không phải lời hứa:**

|                     | Cơ chế                                                                     | Chỗ trong code            |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| Cùng đầu vào    | Một chuỗi dựng một lần, băm sha256, đưa cho cả 5                    | `judge.service.ts:78-85` |
| Không thấy nhau   | Không có ngữ cảnh chung, không truyền output judge này sang judge kia | `:96`                    |
| Phạm vi tách rời | Mỗi prompt nói thẳng*"other aspects are out of your scope entirely"*    | `prompts/judge_*.md`     |

**Gộp bằng rule, không bằng LLM** — `issue-grouping.ts:37`. Lý do ghi trong code: `agreement_count`
là **con số đi vào báo cáo**, nên chạy hai lần phải ra một kết quả. Đánh đổi cũng ghi luôn ở `:42`:
rule bỏ sót những cặp diễn đạt khác nhau hoàn toàn, nên con số đó là **cận dưới**.

**Mẫu số của đồng thuận là số judge ĐÃ XONG, không phải hằng số 5** — `:208`, `groupRound` nhận
`completed.length`. Nếu để 5 thì một vòng có 4 judge sống sẽ báo đồng thuận thấp giả tạo.

**Hệ quả phải nói trước khi bị hỏi:** phạm vi tách rời làm `agreement_count` thấp **theo thiết kế**.
Phần lớn loại lỗi chỉ có đúng một judge có quyền nêu, nên `1/5` là **trần toán học** chứ không phải
dấu hiệu bất đồng.

## 4.4 Techstack và một bài học đã trả giá

| Thứ                                     | Làm gì                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **`Promise.allSettled`**         | Cô lập lỗi của từng judge                                                                             |
| **sha256**                         | `input_digest` — bằng chứng cả 5 nhận cùng một đầu vào                                         |
| **`JUDGE_DEFS`**                 | Một chỗ duy nhất khai báo 5 judge: prompt, model, trần token —`backend/src/contracts/enums.ts:147` |
| **`judge-independence.spec.ts`** | Test ép khối`## SYSTEM` của 5 prompt **giống hệt nhau từng byte**, để ăn prefix cache     |

**Trần token là per-judge, không phải hằng số chung** — `enums.ts:113`, `:125`, `:145`. Đo trên 43
lượt chạy thật: đầu ra của `judge_evidence` tỉ lệ với **số cặp claim–nguồn**, còn `judge_experiment`
tỉ lệ với **số claim × số thí nghiệm** — cả hai đều không tỉ lệ với độ dài spec như ba judge kia.
Đặt chung một trần 8 000 thì hai con đó chết trên đúng những dự án làm nghiêm túc nhất.

---

# 5. `decision` — options · record · apply · gate

**Trách nhiệm:** ghi **mọi** lựa chọn của người dùng kèm thời điểm, câu hỏi, phương án đã hiện và lý
do; rồi áp dụng lựa chọn đó thành một `SpecVersion` mới.

| Endpoint                                 | Làm gì                                                        | Chỗ trong code               |
| ---------------------------------------- | --------------------------------------------------------------- | ----------------------------- |
| `POST /issue-groups/:id/options`       | Sinh phương án A/B/C cho một vấn đề                      | `decision.controller.ts:64` |
| `GET /card-sources/:id/gate-options`   | Phương án cho một trích dẫn bị chặn                     | `:78`                       |
| `POST /card-sources/:id/gate-decision` | Quyết định ở cổng chặn                                    | `:94`                       |
| `POST /decisions`                      | **Ghi** lựa chọn + trả bản nháp **chưa lưu** | `:116`                      |
| `POST /decisions/:id/apply`            | **Áp dụng** → sinh version mới                        | `:147`                      |

## 5.1 Luồng step-by-step

**Giai đoạn 1 — sinh phương án** (`decision.service.ts:140`):

1. Đọc `IssueGroup` kèm toàn bộ issue và **judge nào nêu** — `:144-150`.
2. Gọi LLM `generator_options` với spec + issue — `:153`.
3. **Nối `OTHER_OPTION` vào bằng code, không phụ thuộc model** — `:184`. Comment nói rõ vì sao:
   "Other" không được để phụ thuộc vào việc mô hình có nhớ sinh ra nó hay không.
4. **Trả thẳng, không mở job** — lý do ở `:135-138`: một lời gọi ~10 giây và người dùng đang đứng
   chờ ngay tại chỗ; mở job + `EventSource` cho 10 giây là phức tạp thừa.

**Giai đoạn 2 — ghi lựa chọn** (`:193`, `record`):

5. Chọn `OTHER` mà không có lý do → `422 OTHER_REASON_REQUIRED` — `:194-199`.
6. Đã áp dụng rồi → `409 DECISION_ALREADY_APPLIED` **kèm id version kết quả** — `:208`.
7. `assertOptionExists` — `:215`: khoá chọn phải nằm trong **đúng bộ phương án đã hiện cho người
   dùng**, không phải một khoá bất kỳ.
8. Ghi với `applied = false`, kèm **bản nháp chưa lưu** để người dùng xem diff.

**Giai đoạn 3 — áp dụng** (`:537`, `apply`):

9. Parse lại bản nháp bằng `safeParse` — `:549`.
10. Đọc version cha **có `orderBy` cố định** — `:560-565`. Lý do ghi trong comment: `order_index`
    quyết định thứ tự của version mới, nên để Postgres tự chọn thứ tự thì **hai lần apply cùng dữ
    liệu ra hai spec khác nhau**.
11. `applyChanges` tính ra bộ thẻ mới — `:572`.
12. **Khôi phục trạng thái gốc cho thẻ `AMBIGUOUS`** — `:574-599`. Xem §5.2.
13. **Một transaction** — `:602`: tạo `SpecVersion`, `createMany` toàn bộ thẻ một lệnh (`:617`,
    comment: *"để không bao giờ tồn tại một version đầy một nửa"*), rồi nối lại nguồn.
14. **Nối nguồn theo phả hệ thẻ, không theo tiêu đề** — `:631-653`. Thẻ bị đổi tiêu đề vẫn giữ
    được nguồn.
15. **Thẻ bị đụng → nhãn về `WEAK` và vào danh sách kiểm lại; thẻ không đụng → giữ nguyên nhãn** —
    `:650-656`.

## 5.2 Technical design — bốn quyết định

**1 · Tách `record` khỏi `apply` là cố ý** — `:188-192`. Nó tạo ra điểm dừng *"xem diff rồi mới cam
kết"*, và làm cho **huỷ vẫn để lại dấu vết**: bản ghi còn đó với trạng thái chưa áp dụng. Một hệ
thống chỉ ghi những quyết định *đã thực hiện* thì không trả lời được câu "người dùng đã cân nhắc gì
rồi bỏ".

**2 · Phương án đã hiện được chụp lại vào bản ghi.** Prompt đổi ở tuần sau thì lịch sử cũ vẫn đọc
đúng thứ người dùng đã thấy. Không có ảnh chụp này thì nhật ký quyết định là một lời kể lại chứ
không phải bằng chứng.

**3 · Nối nguồn theo lineage, không theo tiêu đề** — `:631-653`. Nối theo tiêu đề thì mỗi lần sửa
chữ trong tiêu đề thẻ là mất sạch nguồn của nó, mà sửa tiêu đề là thao tác thường nhất.

**4 · Version con bắt đầu từ trạng thái GỐC rồi tự quét lại** — `:574-599`. Đây là chỗ tinh vi nhất
của module: `AMBIGUOUS` là trạng thái **suy ra**, cờ gắn theo `spec_version_id`, còn thẻ thì được
chép sang version con. Chép cả `AMBIGUOUS` sang thì version mới có thẻ `AMBIGUOUS` mà **không có cờ
nào**, và lượt quét sau sẽ ghi `previous_status='AMBIGUOUS'` — **mất vĩnh viễn** trạng thái thật.

## 5.3 Techstack

| Thứ                                                 | Làm gì                              | Vì sao                                                                                   |
| ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| **`prisma.$transaction`**                    | Toàn bộ bước 13                   | Version "đầy một nửa" là trạng thái không có đường sửa                       |
| **`createMany` một lệnh**                  | Chép thẻ                            | Vòng lặp`create` trong transaction vừa chậm vừa để lại cửa sổ lỗi rộng hơn |
| **zod `safeParse` trên `decision.draft`** | Bản nháp đọc lại từ DB          | Cột`Json` không có kiểu; đọc ra là `unknown` cho tới khi parse                |
| **`deepseek-v4-pro`**                        | Sinh phương án và bản nháp sửa | Việc cần suy luận về nội dung spec                                                   |

---

# 6. Tổng hợp — techstack theo component

|                   | jobs |    generator    |        verifier        |      judge      | decision |
| ----------------- | :--: | :--------------: | :--------------------: | :-------------: | :------: |
| NestJS DI         |  ✓  |        ✓        |           ✓           |       ✓       |    ✓    |
| Prisma            |  ✓  |        ✓        |           ✓           |       ✓       |    ✓    |
| `$transaction`  |      |        ✓        |                        |                |    ✓    |
| zod               |      |        ✓        |           ✓           |       ✓       |    ✓    |
| DeepSeek`pro`   |      |        ✓        |                        | ✓ (J1·J3·J5) |    ✓    |
| DeepSeek`flash` |      |                  |        ✓ (L4)        |   ✓ (J2·J4)   |          |
| Embedding local   |      |                  |        ✓ (L3)        |                |          |
| RxJS + SSE        |  ✓  |                  |                        |                |          |
| API ngoài        |      | ✓ (S2/OpenAlex) | ✓ (Crossref/DataCite) |                |          |
| **Ghi DB**  |  ✓  |        ✓        |           ✓           |       ✓       |    ✓    |

Một quan sát đáng nói khi đọc bảng này theo cột: **`verifier` là component duy nhất có ba loại chi
phí khác nhau** (rule 0 đồng · CPU local 0 token · LLM có token), và đó chính là lý do nó được thiết
kế thành thang tầng thay vì một lời gọi.

---

# 7. Chỗ hệ thống có thể vỡ — nói trước khi bị hỏi

| Chỗ                                     | Vỡ thế nào                                                                                                     | Trạng thái                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `channels` / `seqCounters` trong RAM | Chạy 2 instance thì SSE trực tiếp không xuyên instance; replay từ DB vẫn chạy                            | **Chấp nhận** ở quy mô 1 VPS                                                                                        |
| `job.busy` ở frontend                 | `jobId` nằm trong `useState`, `GET /projects/:id` không trả job đang chạy → F5 giữa chừng mất dấu | **Đang nợ**, cách sửa đã biết: trả `active_job_id` từ server                                                 |
| Ngưỡng verifier                        | `0.35 / 0.72 / 0.70` là số **chọn**, không phải số đo                                              | Ghi rõ ở`replay.ts:9`; công cụ hiệu chỉnh hiện **không** hiệu chỉnh được — xem `docs/vandap.md` §1.3 |
| Không có nút huỷ job                 | Bấm nhầm thì chờ hết ~90 giây                                                                               | **Cố ý**, lý do ở `jobs.service.ts:124-127`                                                                       |
| `agreement_count`                      | Rule gộp bỏ sót cặp diễn đạt khác hẳn nhau                                                               | **Cận dưới**, ghi ở `issue-grouping.ts:42`                                                                        |

---

## Đọc tiếp

| Cần gì                                          | Mở file nào                      |
| ------------------------------------------------- | ---------------------------------- |
| ERD đầy đủ + toàn bộ API surface            | `docs/ARCHITECTURE.md`           |
| Chọn công nghệ gì và**loại cái gì** | `docs/STACK.md`                  |
| Đánh đổi thiết kế và chỗ hệ thống vỡ   | `docs/SYSTEM_DESIGN_ANALYSIS.md` |
| Bản đồ luồng click được                    | `docs/product-flow-map.html`     |
| 12 câu vấn đáp, có trỏ dòng code           | `docs/vandap.md`                 |
| Kịch bản trình bày hai bản đồ              | `docs/kich-ban-trinh-bay.md`     |
