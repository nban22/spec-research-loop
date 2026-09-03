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

| Luật | Nó ép ra điều gì | Chỗ trong code |
| --- | --- | --- |
| **Controller mỏng** — parse → gọi service → trả DTO, không nghiệp vụ, không Prisma | Controller không test được cũng không sao, vì trong nó không có gì để sai | `backend/src/project/project.controller.ts:85` — `analyze`, đúng 12 dòng |
| **Service không biết HTTP** — không nhận `Request`, không đọc header, cần user thì nhận `userId: string` | `backend/eval/harness.ts:70-80` gọi **thẳng** service để chạy thí nghiệm, không dựng HTTP server | `backend/src/generator/generator.service.ts:57` — `analyze(projectId, onProgress?)` |
| **Zod là hệ validate duy nhất**, `safeParse` cho mọi input ngoài | Output của LLM bị đối xử y hệt body của người lạ: `unknown` cho tới khi parse xong | `backend/src/contracts/llm-io/generator.ts` |

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

| Endpoint | Chỗ trong code |
| --- | --- |
| `GET /jobs/:id` — trạng thái cuối, luôn trả được | `backend/src/jobs/jobs.controller.ts:12` |
| `GET /jobs/:id/stream` — luồng SSE | `backend/src/jobs/jobs.controller.ts:17` — `@Sse(':id/stream')` |

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

| Thứ | Làm gì ở đây | Vì sao chọn nó |
| --- | --- | --- |
| **Server-Sent Events** | Đẩy tiến độ server → client | Một chiều là đủ. WebSocket cho một luồng một chiều là trả giá cho thứ không dùng: thêm handshake, thêm heartbeat, thêm đường tự nối lại phải tự viết |
| **RxJS `Subject`** | Kênh trong RAM cho mỗi job | Nest hỗ trợ `@Sse()` trả thẳng `Observable`; dùng `Subject` là đi theo hạt gỗ của framework thay vì chống lại nó |
| **`concat(replay, live)`** | Nối lịch sử vào luồng trực tiếp | `backend/src/jobs/jobs.service.ts:189` — một toán tử thay cho cả một vòng lặp đồng bộ hoá tự viết |
| **`JobEvent.seq`** | Số thứ tự tăng dần cho từng job | Là thứ làm `Last-Event-ID` chạy được. Không có nó thì F5 mất sạch |

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

| Endpoint | Sinh ra gì | Service |
| --- | --- | --- |
| `POST /projects/:id/analyze` | Diễn giải lại + bộ thẻ + câu hỏi làm rõ | `generator.service.ts:57` |
| `POST /projects/:id/related-work` | Bảng related work | `:139` |
| `POST /projects/:id/gap` | Research gap | `:198` |
| `POST /projects/:id/contributions` | Contribution + claim–evidence | `:301` |
| `POST /projects/:id/experiment-plan` | Kế hoạch thí nghiệm + ước lượng tài nguyên | `:395` |
| `POST /projects/:id/estimate` | Ước lượng theo tham số **người dùng tự nhập** | `:497` — `saveEstimate` |

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

| Thứ | Làm gì | Vì sao |
| --- | --- | --- |
| **`PromptLoaderService`** | Đọc `prompts/*.md`, tách `## SYSTEM` / `## USER` | `backend/src/prompts/prompt-loader.service.ts:91-98`. Prompt nằm ngoài code nên **prompt nộp đúng là prompt đã chạy** — chứng minh bằng `prompt_hash` chứ không bằng lời hứa |
| **zod** | Schema cho từng loại output | `contracts/llm-io/generator.ts`. Output không khớp → thử lại, đính lỗi zod vào lượt sau |
| **`prisma.$transaction`** | Bốn lệnh ghi của `analyze` | Không có nó thì một lỗi giữa chừng để lại version có thẻ mới nhưng `meta` cũ |
| **`deepseek-v4-pro` + `reasoningEffort: 'high'`** | Mọi bước sinh nội dung | Đây là việc cần suy luận, không phải việc lặp |

## 2.4 Technical design

**`onProgress` là tham số, không phải dependency.** Chữ ký `analyze(projectId, onProgress?)` —
`generator.service.ts:57`. Service **không biết** `JobsService` tồn tại; controller mới là chỗ nối
hai thứ lại. Nhờ đó `eval/harness.ts` gọi generator mà không cần tạo job nào.

**Chạy lại là thay thế, không cộng dồn** — `:78`. Áp cho mọi bước. Nó làm cho "bấm lại nút" là một
thao tác an toàn, và đó là thứ người dùng làm nhiều nhất.

---

# 3. `verifier` — 5 tầng, rẻ trước đắt sau

**Trách nhiệm:** với mỗi cặp *(khẳng định, nguồn)*, gắn nhãn `SUPPORTED` / `WEAK` / `UNSUPPORTED`.

| Endpoint | Chỗ trong code |
| --- | --- |
| `POST /spec-versions/:id/verify` | `backend/src/spec/spec.controller.ts:210` |
| `GET /spec-versions/:id/verification` | `:228` |
| `GET /spec-versions/:id/evidence-trace` | `backend/src/verifier/verifier.controller.ts:30` |
| `GET /spec-versions/:id/gate` — cổng chặn xuất bản | `backend/src/spec/spec.controller.ts:234` |

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

| Tầng | Làm gì | Tốn gì | Dòng |
| --- | --- | --- | --- |
| **L0** | Không có `external_id` → `UNSUPPORTED` ngay. Có DOI thì tra Crossref/DataCite | rule + HTTP | `:275` |
| **L1** | Abstract quá ngắn → `capWeak`. Nguồn quá cũ cho một claim về tính mới → cảnh báo | rule | `:308` |
| **L2** | Con số trong claim không có trong nguồn → `capWeak` | rule | `:322` |
| **chốt loại thẻ** | Thẻ `GAP`/`CONTRIBUTION` → `WEAK` + cờ `CITATION_ONLY`, dừng | 0 | `:340` |
| **L3** | Embedding từng câu của abstract, lấy cosine lớn nhất | CPU local, **0 token API** | `:371` |
| **L3b** | Abstract không kết luận nổi → leo xuống toàn văn | HTTP | `:404` |
| **L4** | LLM entailment, **chỉ chạm vùng xám** | token | `:446` |
| **L4b** | Câu trích dẫn LLM đưa ra phải là chuỗi con **có thật** của abstract | rule | `:491` |
| **L5** | Bảng quyết định ra nhãn cuối | 0 | `:504` |

Bảng L5 đọc từ trên xuống, luật đầu tiên khớp thì dừng — `verifier.service.ts:766`:

```ts
if (verdict === 'CONTRADICTS')  return 'UNSUPPORTED';
if (verdict === 'NOT_ENTAILED') return 'UNSUPPORTED';
if (capWeak)                    return 'WEAK';   // L1/L2 đã hạ trần
if (verdict === 'PARTIAL')      return 'WEAK';
if (verdict === 'ENTAILS' && confidence < th.conf_min) return 'WEAK';
return 'SUPPORTED';
```

## 3.2 Technical design — bốn quyết định đáng bảo vệ

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

## 3.3 Techstack

| Thứ | Làm gì | Đánh đổi |
| --- | --- | --- |
| **`@xenova/transformers` + `all-MiniLM-L6-v2`** | L3, chạy CPU tại chỗ | `backend/src/verifier/embedder.service.ts:16`. **0 token, hoàn toàn tái lập**. Giá: ~1 GB RAM và ~4 giây khởi động lần đầu |
| **`deepseek-v4-flash`** | L4 entailment | `:454`. Việc ngắn, lặp nhiều → tier rẻ. `maxTokens: 1200` vì output chỉ là một verdict |
| **Crossref + DataCite** | Tra DOI ở L0 | Hai nhà cung cấp vì DOI arXiv không nằm ở Crossref |
| **`thresholds.ts`** | Ba ngưỡng, chép vào từng `VerifierRun` | `:19-21`. Là số **chọn**, không phải số đo — code tự ghi điều đó ở `replay.ts:9` |

---

# 4. `judge` — 5 lời gọi song song, ngữ cảnh sạch

**Trách nhiệm:** đề bài đòi các judge phải chấm **riêng** trước khi thấy nhận xét của nhau. Module
này là bằng chứng kỹ thuật cho điều đó, đọc thẳng được từ dữ liệu.

| Endpoint | Chỗ trong code |
| --- | --- |
| `POST /spec-versions/:id/judge` | `backend/src/spec/spec.controller.ts:172` |
| `GET /spec-versions/:id/judge-runs` | `:198` |
| `GET /spec-versions/:id/issues` | `:204` |

## 4.1 Luồng step-by-step — `runRound`, `judge.service.ts:47`

1. **Chặn theo `judge_rounds_total`, không theo `judge_round`** — `:56-62`. Lý do ghi trong comment:
   `apply` reset `judge_round` về 0 cho version mới (bắt buộc, vì `JudgeRun` unique theo
   `(spec_version_id, judge_key, round)`), nên đếm bằng nó thì trần "tối đa 3 vòng mỗi dự án"
   **không bao giờ tới**.
2. **Chặn chạy trùng vòng** — `:69`.
3. **Dựng đầu vào ĐÚNG MỘT LẦN rồi băm** — `:78-85`. Đây là câu quan trọng nhất của module:

   > Nếu mỗi judge tự dựng đầu vào riêng thì `input_digest` khác nhau và bằng chứng độc lập biến
   > mất — **không phải vì hệ thống sai, mà vì không còn cách nào chứng minh nó đúng.**

4. **`Promise.allSettled`, không phải `Promise.all`** — `:96`. Một judge ném lỗi không được làm rơi
   bốn kết quả kia; chúng **đã tốn tiền thật và đã xong**.
5. Mỗi judge gọi LLM với **trần token riêng** — `:107`, `maxTokens: def.maxTokens`. Xem §4.3.
6. **Quorum**: dưới 3 judge xong thì **từ chối kết luận** — `:200`. Thông báo nói thẳng lý do:
   *"below the threshold, agreement is meaningless"*.
7. **Gộp issue bằng rule tất định** — `:208` → `issue-grouping.ts:37`.
8. Tăng `judge_rounds_total`, chuyển version sang `UNDER_REVIEW` — `:213-220`.
9. **Chốt số đo bất đồng ngay lúc chạy** — `:225`. Và lỗi ở bước này **không** được làm rơi cả vòng
   judge vừa tốn tiền: `.catch()` ghi log rồi đi tiếp — cùng lý lẽ với `allSettled`.

## 4.2 Technical design

**Ba thứ làm cho "độc lập" là kỹ thuật chứ không phải lời hứa:**

| | Cơ chế | Chỗ trong code |
| --- | --- | --- |
| Cùng đầu vào | Một chuỗi dựng một lần, băm sha256, đưa cho cả 5 | `judge.service.ts:78-85` |
| Không thấy nhau | Không có ngữ cảnh chung, không truyền output judge này sang judge kia | `:96` |
| Phạm vi tách rời | Mỗi prompt nói thẳng *"other aspects are out of your scope entirely"* | `prompts/judge_*.md` |

**Gộp bằng rule, không bằng LLM** — `issue-grouping.ts:37`. Lý do ghi trong code: `agreement_count`
là **con số đi vào báo cáo**, nên chạy hai lần phải ra một kết quả. Đánh đổi cũng ghi luôn ở `:42`:
rule bỏ sót những cặp diễn đạt khác nhau hoàn toàn, nên con số đó là **cận dưới**.

**Mẫu số của đồng thuận là số judge ĐÃ XONG, không phải hằng số 5** — `:208`, `groupRound` nhận
`completed.length`. Nếu để 5 thì một vòng có 4 judge sống sẽ báo đồng thuận thấp giả tạo.

**Hệ quả phải nói trước khi bị hỏi:** phạm vi tách rời làm `agreement_count` thấp **theo thiết kế**.
Phần lớn loại lỗi chỉ có đúng một judge có quyền nêu, nên `1/5` là **trần toán học** chứ không phải
dấu hiệu bất đồng.

## 4.3 Techstack và một bài học đã trả giá

| Thứ | Làm gì |
| --- | --- |
| **`Promise.allSettled`** | Cô lập lỗi của từng judge |
| **sha256** | `input_digest` — bằng chứng cả 5 nhận cùng một đầu vào |
| **`JUDGE_DEFS`** | Một chỗ duy nhất khai báo 5 judge: prompt, model, trần token — `backend/src/contracts/enums.ts:147` |
| **`judge-independence.spec.ts`** | Test ép khối `## SYSTEM` của 5 prompt **giống hệt nhau từng byte**, để ăn prefix cache |

**Trần token là per-judge, không phải hằng số chung** — `enums.ts:113`, `:125`, `:145`. Đo trên 43
lượt chạy thật: đầu ra của `judge_evidence` tỉ lệ với **số cặp claim–nguồn**, còn `judge_experiment`
tỉ lệ với **số claim × số thí nghiệm** — cả hai đều không tỉ lệ với độ dài spec như ba judge kia.
Đặt chung một trần 8 000 thì hai con đó chết trên đúng những dự án làm nghiêm túc nhất.

---

# 5. `decision` — options · record · apply · gate

**Trách nhiệm:** ghi **mọi** lựa chọn của người dùng kèm thời điểm, câu hỏi, phương án đã hiện và lý
do; rồi áp dụng lựa chọn đó thành một `SpecVersion` mới.

| Endpoint | Làm gì | Chỗ trong code |
| --- | --- | --- |
| `POST /issue-groups/:id/options` | Sinh phương án A/B/C cho một vấn đề | `decision.controller.ts:64` |
| `GET /card-sources/:id/gate-options` | Phương án cho một trích dẫn bị chặn | `:78` |
| `POST /card-sources/:id/gate-decision` | Quyết định ở cổng chặn | `:94` |
| `POST /decisions` | **Ghi** lựa chọn + trả bản nháp **chưa lưu** | `:116` |
| `POST /decisions/:id/apply` | **Áp dụng** → sinh version mới | `:147` |

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

| Thứ | Làm gì | Vì sao |
| --- | --- | --- |
| **`prisma.$transaction`** | Toàn bộ bước 13 | Version "đầy một nửa" là trạng thái không có đường sửa |
| **`createMany` một lệnh** | Chép thẻ | Vòng lặp `create` trong transaction vừa chậm vừa để lại cửa sổ lỗi rộng hơn |
| **zod `safeParse` trên `decision.draft`** | Bản nháp đọc lại từ DB | Cột `Json` không có kiểu; đọc ra là `unknown` cho tới khi parse |
| **`deepseek-v4-pro`** | Sinh phương án và bản nháp sửa | Việc cần suy luận về nội dung spec |

---

# 6. Tổng hợp — techstack theo component

| | jobs | generator | verifier | judge | decision |
| --- | :-: | :-: | :-: | :-: | :-: |
| NestJS DI | ✓ | ✓ | ✓ | ✓ | ✓ |
| Prisma | ✓ | ✓ | ✓ | ✓ | ✓ |
| `$transaction` | | ✓ | | | ✓ |
| zod | | ✓ | ✓ | ✓ | ✓ |
| DeepSeek `pro` | | ✓ | | ✓ (J1·J3·J5) | ✓ |
| DeepSeek `flash` | | | ✓ (L4) | ✓ (J2·J4) | |
| Embedding local | | | ✓ (L3) | | |
| RxJS + SSE | ✓ | | | | |
| API ngoài | | ✓ (S2/OpenAlex) | ✓ (Crossref/DataCite) | | |
| **Ghi DB** | ✓ | ✓ | ✓ | ✓ | ✓ |

Một quan sát đáng nói khi đọc bảng này theo cột: **`verifier` là component duy nhất có ba loại chi
phí khác nhau** (rule 0 đồng · CPU local 0 token · LLM có token), và đó chính là lý do nó được thiết
kế thành thang tầng thay vì một lời gọi.

---

# 7. Chỗ hệ thống có thể vỡ — nói trước khi bị hỏi

| Chỗ | Vỡ thế nào | Trạng thái |
| --- | --- | --- |
| `channels` / `seqCounters` trong RAM | Chạy 2 instance thì SSE trực tiếp không xuyên instance; replay từ DB vẫn chạy | **Chấp nhận** ở quy mô 1 VPS |
| `job.busy` ở frontend | `jobId` nằm trong `useState`, `GET /projects/:id` không trả job đang chạy → F5 giữa chừng mất dấu | **Đang nợ**, cách sửa đã biết: trả `active_job_id` từ server |
| Ngưỡng verifier | `0.35 / 0.72 / 0.70` là số **chọn**, không phải số đo | Ghi rõ ở `replay.ts:9`; công cụ hiệu chỉnh hiện **không** hiệu chỉnh được — xem `docs/vandap.md` §1.3 |
| Không có nút huỷ job | Bấm nhầm thì chờ hết ~90 giây | **Cố ý**, lý do ở `jobs.service.ts:124-127` |
| `agreement_count` | Rule gộp bỏ sót cặp diễn đạt khác hẳn nhau | **Cận dưới**, ghi ở `issue-grouping.ts:42` |

---

## Đọc tiếp

| Cần gì | Mở file nào |
| --- | --- |
| ERD đầy đủ + toàn bộ API surface | `docs/ARCHITECTURE.md` |
| Chọn công nghệ gì và **loại cái gì** | `docs/STACK.md` |
| Đánh đổi thiết kế và chỗ hệ thống vỡ | `docs/SYSTEM_DESIGN_ANALYSIS.md` |
| Bản đồ luồng click được | `docs/product-flow-map.html` |
| 12 câu vấn đáp, có trỏ dòng code | `docs/vandap.md` |
| Kịch bản trình bày hai bản đồ | `docs/kich-ban-trinh-bay.md` |
