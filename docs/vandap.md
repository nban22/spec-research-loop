# TRẢ LỜI VẤN ĐÁP — SpecResearch Loop

> Trả lời 12 câu hỏi vấn đáp. **Chỗ nào `docs/` đã có nội dung thì trỏ tới, không viết lại** —
> để một sự thật chỉ nằm ở một chỗ, và bản này không trôi xa khỏi tài liệu gốc.
>
> Ngày lập: **2026-09-02** · Số liệu đo trên DB thật tại thời điểm này.
>
> **Giao diện sản phẩm là tiếng Anh** (`frontend/CLAUDE.md` §6); tài liệu nội bộ là tiếng Việt.
> **Số dòng trỏ vào code tính tại commit `fd130c6`.** Mỗi chỗ đều ghi kèm **tên ký hiệu**, nên
> khi file trôi đi thì vẫn tìm lại được bằng tên chứ không phải bằng số.

## Mở đầu vấn đáp — chiếu gì

| Thứ tự | File                                                       | Vì sao mở nó                                                                                          |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | `docs/product-flow-map.html`                             | Bản đồ luồng sản phẩm, click được. Trả lời "hệ thống chạy thế nào" nhanh hơn mọi slide |
| 2        | Chính app đang chạy —`https://dsa-bus-booking.io.vn` | Demo thật, xem §4.1                                                                                    |
| 3        | `docs/lane-c-map.html`                                   | Sáng tạo UI/UX và techstack của làn C, có khối*trước / sau / vì sao*                         |
| 4        | `docs/evaluation_report.md`                              | Số đo, baseline, và**limitation**                                                               |
| 5        | `docs/handover.md`                                       | Đối chiếu 10 sản phẩm bàn giao — cái gì đủ, cái gì thiếu                                   |

---

# 1. Kiến trúc & Mô hình tổng quan

## 1.1 Tổng quan kiến trúc

**→ `docs/ARCHITECTURE.md`** (ERD đầy đủ + API surface) · **`docs/STACK.md`** (chọn công nghệ gì
và **vì sao loại cái khác**) · **`docs/product-flow-map.html`** (bản đồ click được).

Ba câu tóm lại phần không nằm trong hai file đó:

- **Hai project rời**, không monorepo: `frontend/` Next.js 16 App Router · `backend/` NestJS 11.
  Frontend gọi đường dẫn tương đối `/api/*`, `rewrites()` chuyển tiếp sang backend — **cùng
  origin** nên cookie auth và SSE chạy được mà không cần CORS.
- **Mọi bước gọi LLM đều là job nền + SSE**, không phải request đồng bộ. Ngoại lệ duy nhất là bộ
  ước lượng tài nguyên: công thức thuần, trả trong vài ms.
- **Ranh giới tầng cứng**: controller mỏng (parse → gọi service → trả DTO), service **không biết
  HTTP**. Nhờ vậy `backend/eval/run-eval.ts` gọi thẳng service để chạy thí nghiệm, không qua HTTP.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Cùng origin nhờ `rewrites()` | `frontend/next.config.ts:13` — `async rewrites()` |
| Controller mỏng, chỉ parse → gọi service | `backend/src/spec/spec.controller.ts:46` — `SpecController.version` |
| Service không biết HTTP nên eval gọi thẳng | `backend/eval/harness.ts:70-80` — `createApplicationContext` rồi `app.get(JudgeService)` |

## 1.2 Mô hình AI đang dùng

**Một nhà cung cấp duy nhất: DeepSeek**, gọi qua SDK `openai` trỏ vào `DEEPSEEK_BASE_URL`.
Hai tier, chọn theo vai chứ không theo tiện:

| Model                       | Dùng ở đâu                                                             | Vì sao                                         |
| --------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `deepseek-v4-pro`         | generator (phân rã, gap, contribution, kế hoạch thí nghiệm), 5 judge | Việc cần suy luận,`reasoning_effort: high` |
| `deepseek-v4-flash`       | entailment của verifier (tầng L4), baseline B1                           | Việc lặp nhiều, ngắn, rẻ                   |
| `Xenova/all-MiniLM-L6-v2` | tầng L3 của verifier (embedding)                                         | **Chạy local trên CPU, 0 token**        |

Ba luật không thương lượng, áp cho mọi lời gọi (`backend/CLAUDE.md` §6):

1. **`temperature: 0`** và `response_format: json_object` — đầu ra là JSON có schema, không phải
   văn bản tự do.
2. **Mọi lời gọi đi qua `LlmService.completeJson`**; `client.chat.completions.create` chỉ được xuất
   hiện trong `src/llm/`. Nhờ vậy mỗi lời gọi đều ghi `usage` + `attempts` + latency + `prompt_hash`
   vào bảng `LlmCall` — **không có ngoại lệ "tạm thời"**. Đó là nền của toàn bộ §4.2.
3. **Prompt không được hardcode trong `src/`** — đọc từ `prompts/` qua `PromptLoaderService`, hash
   sha256 ghi kèm mỗi lời gọi. `docs/evaluation_report.md` từ chối tổng hợp nếu một `prompt_id` có
   hai hash khác nhau trong cùng một batch.

**Giới hạn phải nói ra:** DeepSeek **không có tham số `seed`**. Thứ tái lập được là
`temperature: 0` + prompt cố định + hash ghi lại. Yêu cầu "cùng seed" của đề **không thoả được**
với provider hiện tại — chi tiết ở `docs/evaluation_report.md` §5.6.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| `temperature: 0` cho mọi lời gọi | `backend/src/llm/deepseek.provider.ts:47` |
| `response_format: json_object` | `backend/src/llm/deepseek.provider.ts:50` |
| Cửa duy nhất vào LLM | `backend/src/llm/llm.service.ts:94` — `LlmService.completeJson` |
| Ghi `usage` + `attempts` + latency vào DB | `backend/src/llm/llm.service.ts:153` — `recordCall(...)`; bảng ở `backend/prisma/schema.prisma:555` — `model LlmCall` |
| `prompt_hash` sha256 | `backend/src/llm/llm.service.ts:91` — `LlmService.digest` |
| Prompt đọc từ file, tách `## SYSTEM` / `## USER` | `backend/src/prompts/prompt-loader.service.ts:91-98` |
| Tier `pro` cho generator | `backend/src/generator/generator.service.ts:66` |
| Tier `flash` cho entailment L4 | `backend/src/verifier/verifier.service.ts:454` |
| Embedding chạy local, 0 token | `backend/src/verifier/embedder.service.ts:16` — `MODEL_ID` |
| Model của từng judge | `backend/src/contracts/enums.ts:147` — `JUDGE_DEFS` |

## 1.3 Tự đánh giá: hệ này dùng thật được không?

Trả lời thẳng: **dùng được cho đúng một việc, và việc đó hẹp hơn tên gọi của nó.**

**Chỗ nó thật sự có giá trị** — cơ chế kiểm chứng cứ 5 tầng và **cơ chế chặn**. Không phải gắn
nhãn rồi cho qua: còn claim `UNSUPPORTED` thì **chặn xuất bản thật**. Đó là thứ phân biệt nó với
"ChatGPT viết hộ cái spec": nguồn lấy từ Semantic Scholar/OpenAlex và đối chiếu DOI, không để mô
hình tự nhớ paper.

**Ba chỗ chưa dùng thật được, và không sửa được bằng thêm code:**

1. **Chưa validate bằng người.** Cho tới khi có 30 cặp gán tay, mọi nhãn verifier còn ở mức *"máy
   nói vậy"*. Đối chiếu chéo mô hình đã chạy (`docs/evaluation_report.md` §C.12) và **không phải**
   human validation.
2. **Ngưỡng verifier là số chọn, không phải số đo.** `τ_low = 0.35` · `τ_high = 0.72` ·
   `conf_min = 0.70`. Tệ hơn: §C.12 phát hiện `calibrate.ts` **không thể** hiệu chỉnh chúng từ dữ
   liệu đã lưu — τ chỉ quyết định *có gọi L4 hay không*, mà replay lại chỉ chạy được với cặp *đã có*
   entailment. Hai điều kiện loại trừ nhau.
3. **Tập test 10 ý tưởng, chưa chạy đủ 4 arm.** Hai câu hỏi trung tâm — *vòng judge đóng góp gì* và
   *verifier đóng góp gì* — **chưa có số trả lời**.

**Ai dùng được ngay:** người đã biết mình muốn viết spec gì và cần một bộ khung 14 mục có nguồn,
cộng một cái phanh chặn claim không nguồn. **Ai chưa nên dùng:** người cần tin vào nhãn `SUPPORTED`
mà không tự đọc lại nguồn.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Ba ngưỡng là số chọn, không phải số đo | `backend/src/verifier/thresholds.ts:19-21` — `tau_low` · `tau_high` · `conf_min` |
| Chính code tự thú điều đó | `backend/src/verifier/replay.ts:9` — comment *"là ước đoán, không phải số đo"* |

---

# 2. Dữ liệu, Session & luồng ngữ cảnh

## 2.1 Cơ chế Session

**Không có bảng `Session`.** Nói rõ ngay vì câu hỏi giả định có. Hai thứ đóng hai vai của nó:

| Vai                                               | Bảng                                          | Lưu gì                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phiên đăng nhập**                     | `RefreshToken`                               | `token_hash` (không lưu token thô), `expires_at`, `revoked_at`. Access token là JWT ngắn hạn trong cookie HttpOnly, **không lưu DB** |
| **Phiên làm việc trên một ý tưởng** | `Project` → `SpecVersion` → `Decision` | Không phải "session" mà là**lịch sử có thể tua lại**                                                                                      |

Chỗ đáng nói là vai thứ hai. Không có khái niệm "session state" nào sống trong RAM: **trạng thái
làm việc chính là dữ liệu trong DB**. Đóng tab, mở máy khác, đăng nhập lại — mở đúng dự án là về
đúng chỗ đang dở, vì `Project.step` và `Project.current_spec_version_id` nằm trong DB chứ không
trong bộ nhớ phiên.

**Một chỗ chưa đúng, đang nợ:** `job.busy` ở frontend nằm trong `useState`, và
`GET /projects/:id` **không trả job đang chạy**. Tải lại trang giữa lúc một job nền còn sống là
mất dấu nó trên màn hình. Cách sửa đã biết (trả `active_job_id` từ server) và cố ý tách riêng vì
nó sửa một lớp lỗi cho **mọi bước**, không riêng bước nào.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Không có bảng `Session` | `backend/prisma/schema.prisma` — quét cả file không có `model Session` |
| Phiên đăng nhập lưu hash, không lưu token thô | `backend/prisma/schema.prisma:173` — `model RefreshToken` |
| Trạng thái làm việc nằm trong DB | `backend/prisma/schema.prisma:195` — `Project.step`; `:197` — `current_spec_version_id` |
| `job.busy` sống trong `useState`, mất khi F5 | `frontend/src/lib/use-project.ts:191` — `useState` giữ `jobId`; `:248` — `busy:` |

## 2.2 Ngữ cảnh được truyền qua lại thế nào

**Không có cửa sổ hội thoại tích luỹ. Không có "memory" của agent.** Đây là quyết định thiết kế,
không phải thiếu sót:

```
DB → buildSpecJson(versionId) → biến {{spec_json}} trong prompt → LLM → JSON có schema → DB
```

Mỗi lời gọi LLM **dựng lại ngữ cảnh từ DB**, không nhận lịch sử hội thoại từ lời gọi trước. Ba hệ
quả, đều là thứ ta muốn:

1. **Chạy lại một bước cho ra cùng kết quả** (trong giới hạn không có `seed`), vì đầu vào là trạng
   thái DB chứ không phải một chuỗi hội thoại đã dài ra.
2. **5 judge chấm độc lập thật.** 5 lời gọi song song `Promise.allSettled` — **không phải**
   `Promise.all`, vì một judge ném lỗi không được làm rơi bốn kết quả kia; chúng đã tốn tiền thật
   và đã xong. Không truyền output judge này sang judge kia: nếu có cửa sổ hội thoại chung thì
   "độc lập" chỉ còn là lời nói.
3. **Prompt cache ăn được**: phần dùng chung đặt ở đầu prompt, `cacheScope = projectId`. Tỉ lệ ăn
   cache đo được ở màn `/cost`.

Cái đóng vai "memory" giữa các bước là **`meta` của `SpecVersion`** (bản diễn giải lại, mức chắc
chắn, từ khoá tìm kiếm) cộng **bộ thẻ `Card`**. Nó thuộc về *version*, không thuộc *project* — chạy
lại bước 1 là ra bản diễn giải khác, và bản cũ vẫn còn.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Ngữ cảnh dựng lại từ DB mỗi lần gọi | `backend/src/spec/spec.service.ts:294` — `buildSpecJson(specVersionId)` |
| 5 judge song song, một con hỏng không kéo bốn con kia | `backend/src/judge/judge.service.ts:96` — `Promise.allSettled`, kèm comment vì sao không dùng `Promise.all` |
| Cả 5 judge nhận **cùng một chuỗi đầu vào**, băm lại làm bằng chứng | `backend/src/judge/judge.service.ts:79-85` — `sharedInput` → `inputDigest` |
| Prompt cache theo dự án | `backend/src/llm/llm.service.ts:130` — `cacheScope: opts.link?.projectId` |

## 2.3 Sau khi sửa đổi thì lưu thế nào

**Hai đường ghi khác nhau, cố ý không gộp:**

| Loại thay đổi                            | Cách lưu                                                                                                                     | Ví dụ                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Người dùng sửa tay bản nháp** | Ghi thẳng vào hàng đang có,`origin` chuyển `USER`                                                                    | Sửa tiêu đề thẻ · nối nguồn vào claim · xoá thẻ               |
| **Quyết định thay đổi spec**     | **Sinh `SpecVersion` MỚI**, `parent_version_id` trỏ về bản cũ, `created_by_decision_id` trỏ về `Decision` | Chọn cách sửa một issue của judge · duyệt/giảm quy mô kế hoạch |

Đường thứ hai là phần đáng nói: **không ghi đè**. Mỗi lần người dùng quyết là một version mới, nên
lịch sử là một **cây** có thể so hai bản bất kỳ (`/versions`, diff tính lúc đọc, không lưu). Cột
`Decision.chosen_key` rỗng nghĩa là **câu hỏi chưa trả lời** — đó cũng là cách hệ thống hiện thực
điểm dừng chờ người dùng, không có đường ghi riêng cho "câu hỏi đang chờ".

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Sửa tay đổi `origin` của thẻ | `backend/prisma/schema.prisma:279` — `Card.origin` |
| Version mới trỏ ngược về bản cũ và về quyết định sinh ra nó | `backend/prisma/schema.prisma:234` — `model SpecVersion`, cột `parent_version_id` · `created_by_decision_id` |
| `chosen_key` là chỗ ghi câu trả lời của người dùng | `backend/prisma/schema.prisma:442` — `Decision.chosen_key` |

---

# 3. Chi tiết kỹ thuật & luồng xử lý spec

## 3.1 Judge: input là gì, hoạt động ra sao

**Năm judge, năm lời gọi độc lập, `Promise.allSettled`.** Input của bốn judge chính (xem frontmatter của
`prompts/judge_*.md`):

```
inputs: [spec_json, sources_json]
```

- `spec_json` — toàn bộ spec dựng lại từ DB: 14 mục, thẻ, bảng related work, kế hoạch thí nghiệm.
- `sources_json` — danh sách nguồn **đã nằm trong kho của dự án**, kèm id. Judge chỉ được nói về
  nguồn trong danh sách này.

**Ví dụ thật của hai đầu vào này** — trích từ một dự án có thật trong DB, kèm phân bố nhãn và
số đo quy mô: **→ `docs/api-components.md` §4.2**.

Judge thứ sáu `judge_overclaim` nhận input khác — `[claim_json, plan_json, rule_signals_json]` —
vì nó so **claim với kế hoạch thí nghiệm**, cộng tín hiệu từ rule chứ không chỉ LLM.

**Ba luật làm cho "độc lập" là thật, không phải lời nói:**

1. **Phạm vi tách rời.** Mỗi prompt tự đứng độc lập, và nói thẳng *"other aspects are out of your
   scope entirely"*. `judge_readiness` còn bị cấm suy lại phát hiện thuộc về một mục đơn lẻ.
2. **Không judge nào thấy nhận xét của judge khác** — không có ngữ cảnh chung, xem §2.2.
3. Kết quả gộp thành `IssueGroup` bằng **rule tất định**, và mỗi issue **trace về judge nào nêu**.

**Hệ quả cần nói trước khi bị hỏi:** phạm vi tách rời làm `agreement_count` thấp *theo thiết kế* —
phần lớn loại lỗi chỉ có đúng một judge có quyền nêu, nên `1/5` là **trần toán học**, không phải
bất đồng.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| 5 judge, phạm vi và model của từng con | `backend/src/contracts/enums.ts:147` — `JUDGE_DEFS` |
| Gộp issue bằng **rule tất định**, không bằng LLM | `backend/src/judge/issue-grouping.ts:37` — kèm lý do: *"F5 hai lần phải ra một kết quả"* |
| Gộp một lần lúc chạy rồi lưu, không tính lại lúc render | `backend/src/judge/judge.service.ts:279` |
| Dưới 3 judge sống thì từ chối kết luận | `backend/src/judge/judge.service.ts:200` — `MIN_JUDGES_FOR_DONE` |

## 3.2 Làm sao biết claim của AI là đúng hay sai

**→ `docs/deliverables_plan.md` Yêu cầu 2** có mô tả đầy đủ 5 tầng. Phần tóm và phần đánh giá:

Nguyên tắc đầu tiên: **chặn bằng kiểu dữ liệu trước khi chặn bằng mô hình.** Nguồn không đến từ
trí nhớ LLM — nó đến từ Semantic Scholar / OpenAlex, có `external_id`, và DOI được đối chiếu với
Crossref/DataCite. Mô hình **không được** đặt ra một paper mới; nó chỉ được trỏ vào id trong danh
sách trắng, và dòng nào trỏ ra ngoài danh sách bị **bỏ và đếm vào một bộ đếm**.

Trên đó là thang 5 tầng, **rẻ trước đắt sau**: tra DOI thật → khớp metadata → kiểm con số có trong
nguồn không → embedding local (0 token) → LLM entailment → rule kiểm lại LLM → bảng quyết định ra
nhãn `SUPPORTED` / `WEAK` / `UNSUPPORTED`.

Và quan trọng nhất: **nó chặn, không chỉ gắn nhãn.** Còn claim `UNSUPPORTED` thì
`POST /spec-versions/:id/export` trả lỗi, không xuất được. Muốn xuất mà giữ trích dẫn đó thì phải
chọn "Other" **kèm lý do bắt buộc**, và file xuất ra **đánh dấu** nó — đó là chỗ khác nhau giữa
*bỏ qua có ghi nhận* và *không kiểm*.

**Tự đánh giá phần này:** cơ chế là phần mạnh nhất của đồ án về thiết kế, nhưng
**chưa có bằng chứng nó đúng**. Xem §1.3 điểm 1 và 2, và `docs/evaluation_report.md` §C.12.

**Trỏ vào code** — các tầng nằm cùng một hàm trong `backend/src/verifier/verifier.service.ts`,
đọc từ trên xuống là đi từ rẻ tới đắt:

| Tầng | Dòng |
| --- | --- |
| L0 · nguồn có tồn tại — rule + HTTP, 0 token | `:275` |
| L1 · sanity metadata — 0 token | `:308` |
| L2 · đối chiếu con số — 0 token | `:322` |
| L3 · embedding — CPU local, 0 token API | `:371` |
| L3b · leo thang xuống toàn văn khi abstract không đủ | `:404` |
| L4 · LLM entailment, **chỉ chạm vùng xám** | `:446` |
| L4b · rule kiểm lại output của LLM, chống bịa trích dẫn | `:491` |
| L5 · bảng quyết định ra nhãn | `:504` |

Và phần **chặn** — chỗ phân biệt *gắn nhãn* với *chặn*:

| Khẳng định | Chỗ trong code |
| --- | --- |
| Còn claim `UNSUPPORTED` thì xuất bản **trả lỗi** | `backend/src/spec/export.service.ts:128` — `EXPORT_BLOCKED_UNSUPPORTED_CITATION` |
| Endpoint bị chặn | `backend/src/spec/spec.controller.ts:240` — `@Post('spec-versions/:id/export')` |
| Chọn "Other" thì **bắt buộc** có lý do | `backend/src/decision/decision.service.ts:196` — `OTHER_REASON_REQUIRED` |

## 3.3 Cơ chế Rework ở bước cuối

Không có nút "rework" riêng. Đường đi là **quay lại bước 4**, và điều đó là cố ý:

```
Bước 5 (Final spec) ──[Back to edit]──► Bước 4 (Judges)
   │                                        │
   │                                   chạy vòng judge mới (tối đa 3 vòng)
   │                                        │
   └──◄── SpecVersion MỚI ◄── Decision ◄── người dùng chọn cách sửa
```

Cụ thể phản hồi của người dùng được xử lý thế nào:

1. **Không có ô "nhập phản hồi tự do" rồi để mô hình tự hiểu.** Người dùng chọn giữa các phương án
   A/B/C **có giải thích và ví dụ**, cộng luôn **"Other — tôi tự mô tả"**. Phương án được hệ thống
   gợi ý mang nhãn *GỢI Ý*, nhưng không tự chọn.
2. Chọn xong → hệ thống **sinh `SpecVersion` mới**, hiện **diff** cho người dùng xem đúng chỗ đã
   đổi, rồi **chạy lại verifier cho đúng những cặp bị ảnh hưởng** — không chạy lại toàn bộ.
3. Judge chấm lại trên version mới. **Tối đa 3 vòng** (`MAX_JUDGE_ROUNDS`), và lý do dừng được ghi
   lại: hội đồng đã sạch, hết vòng, hay judge lỗi. Đây là "cơ chế dừng sớm" mà đề khuyến khích.
4. Version cũ **không bị xoá**. Người dùng so được bản trước và bản sau ở `/versions`.

Hai chỗ khiến cơ chế này khác một vòng "hỏi lại cho tới khi hài lòng":

- **Mỗi lần sửa để lại dấu.** `Decision` ghi ai chọn gì, lúc nào, tạo ra version nào — và bảng đó
  là **dữ liệu đầu vào của báo cáo đánh giá**, nên nó không phải log cho vui.
- **Trần 3 vòng là một cái van chi phí**, không phải giới hạn kỹ thuật. Không có nó thì vòng
  judge–sửa–judge có thể chạy vô hạn và hoá đơn cũng vậy.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Trần 3 vòng | `backend/src/contracts/enums.ts:185` — `MAX_JUDGE_ROUNDS = 3` |
| Đếm bằng `judge_rounds_total` chứ không bằng `judge_round` | `backend/src/judge/judge.service.ts:56-62` — kèm lý do: `apply` reset `judge_round` về 0 cho version mới |
| "Other — tôi tự mô tả" bắt buộc kèm lý do | `backend/src/decision/decision.service.ts:196` |

---

# 4. Demo & chi phí

## 4.1 Kịch bản demo

**→ `docs/handover.md` §2** — kịch bản 14 cảnh, đi hết một vòng B1→B5 trên một ý tưởng thật, dừng
ở ba điểm nhấn của ba làn, kết bằng màn chi phí thật.

Ba điều đã ghi trong đó, nhắc lại vì chúng dễ bị bỏ:

- **Cảnh 10 cố tình cho gate chặn** trước khi sửa — đó là chỗ chứng minh cơ chế kiểm citation không
  phải trang trí.
- **Đừng tua phần chờ.** Video đã tua sẽ mâu thuẫn với con số thời gian ở màn chi phí cảnh 12.
- **Đừng giấu bước hỏng.** `attempts > 1` cũng là dữ liệu, và báo cáo đánh giá có đo nó.

## 4.2 Chi phí vận hành

### Số đo thật, không phải ước lượng

Đo trên bảng `LlmCall` của **40 dự án** đã chạy trong DB hiện tại, đơn giá `$0.28` / `$0.42` trên
1 triệu token vào/ra:

|                                                                        | Lời gọi | Token       | Chi phí         |
| ---------------------------------------------------------------------- | --------- | ----------- | ---------------- |
| **Dự án trung vị**                                            | 8         | ~58 nghìn  | **~$0,02** |
| **Dự án nặng nhất** (chạy hết 5 bước, nhiều vòng sửa) | 57        | ~721 nghìn | **~$0,25** |

Nói cách khác: **một bản spec hoàn chỉnh tốn khoảng 5–25 cent**. Rẻ hơn trực giác vì ba lý do —
embedding chạy local (0 token), bộ ước lượng là công thức thuần, và verifier lọc rẻ-trước-đắt-sau
nên tầng LLM chỉ chạy cho phần vùng xám.

> ⚠️ **Đơn giá chưa xác nhận nguồn.** `0.28`/`0.42` là con số đang dùng trong code, và
> `docs/evaluation_report.md` §C.9 đánh dấu nó `[CẦN XÁC NHẬN]`. Mọi số USD ở đây vì thế là
> **token đổi đơn vị**, chính xác về bậc độ lớn chứ không phải về đồng cent. Phần tương đối giữa
> các arm thì vững — xem §C.9.

**Trỏ vào code:**

| Khẳng định | Chỗ trong code |
| --- | --- |
| Đơn giá `0.28` / `0.42` | `backend/eval/pricing.json:6` |
| Chính file đó tự đánh dấu `CẦN XÁC NHẬN`, và ghi rõ còn **hai bản sao khác** của đơn giá ở `estimator.service.ts` và `analytics.service.ts` cũng không ghi nguồn | `backend/eval/pricing.json:2` — `_source` |
| Nguồn của mọi số token | `backend/prisma/schema.prisma:555` — `model LlmCall` |

### Hạ tầng

| Hạng mục                             | Hiện tại                                       | Ghi chú                                                        |
| -------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Backend + Frontend                     | 1 VPS, Docker Compose, deploy qua GitHub Actions | Đang chạy thật ở`dsa-bus-booking.io.vn`                   |
| PostgreSQL                             | Neon (managed)                                   | Gói free đủ cho quy mô đồ án                             |
| Embedding                              | **Chạy trên chính VPS**, CPU            | Đổi lấy: cần ~1 GB RAM và ~4 giây khởi động lần đầu |
| Semantic Scholar / OpenAlex / Crossref | Miễn phí, có giới hạn nhịp gọi            | Có key S2 thì 1 req/s; không key thì phải nới rộng hẳn  |

### Nếu đầu tư một trang web hoàn chỉnh phục vụ viết spec — ngân sách nên là bao nhiêu

Tách hai phần, vì chúng co giãn khác nhau:

**Phần biến đổi theo lượng dùng (API):** ~$0,25 cho một spec ở trường hợp nặng. Nghĩa là
**1.000 spec/tháng ≈ $250 tiền LLM**. Đây là con số dễ dự đoán nhất và cũng là con số nhỏ nhất.

**Phần cố định (hạ tầng):** với vài trăm người dùng đồng thời thì $40–80/tháng là đủ — 1 VPS 4 GB
cho backend (embedding cần RAM), 1 gói Postgres managed có backup, CDN thì Vercel free tier đã
xong. Chưa cần Redis hay hàng đợi riêng: SSE cộng bảng `JobRun` đã đủ, và đây là quyết định đã cân
nhắc chứ không phải bỏ sót (`docs/STACK.md` §8).

| Mức                           | Ngân sách/tháng  | Chịu được gì                                                   |
| ------------------------------ | ------------------- | ------------------------------------------------------------------- |
| Đồ án / demo                | **$0–20**    | Neon free + 1 VPS nhỏ + API trả theo dùng                        |
| Sản phẩm thật, quy mô nhỏ | **$100–350** | ~1.000 spec/tháng, hạ tầng có backup và theo dõi              |
| Trần nên đặt               | **~$500**     | Vượt mức này thì nút thắt**không còn là hạ tầng** |

**Chỗ tiền thật sự đi, và nó không nằm ở dòng nào bên trên:** khoá S2 API có hạn mức cao, và
**người đọc lại nguồn**. Đồ án này đo được rằng verifier chưa được validate bằng người (§1.3); với
một sản phẩm thật thì một buổi gán nhãn của chuyên gia đắt hơn cả tháng tiền server. Ai lập ngân
sách cho hệ này mà chỉ tính API với VPS là đang bỏ qua khoản lớn nhất.

---

## Ba câu tao sẽ tự nêu trước khi bị hỏi

1. **"Số USD lấy ở đâu ra?"** — Từ `LlmCall`, đo thật, 40 dự án. Nhưng đơn giá thì chưa xác nhận
   nguồn; xem cảnh báo ở §4.2.
2. **"Sao dám nói verifier đúng?"** — Không dám. §1.3 và §3.2 nói rõ nó **chưa được validate bằng
   người**, và §C.12 còn chỉ ra công cụ hiệu chỉnh ngưỡng hiện tại **không thể** hiệu chỉnh được.
3. **"Vòng judge đóng góp gì?"** — **Chưa có số trả lời.** Hạ tầng 4 arm đã chạy được, còn thiếu
   một lần chạy máy khoảng 2 giờ. Đó là khoảng trống lớn nhất của báo cáo, ghi ở
   `docs/evaluation_report.md` §5.2 và `docs/handover.md` §4.
