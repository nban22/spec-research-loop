# STACK — SpecResearch Loop

> Tài liệu chốt stack cho **coding agent** và người code. Đọc file này trước khi thêm bất kỳ dependency nào.
> Đặc tả nghiệp vụ: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md`. Rule về prompt: `.claude/rules/prompt-audit.md`.
> Cập nhật: 2026-08-15

---

## 0. TL;DR — bảng chốt

| Lớp | Chốt | Không dùng |
|---|---|---|
| Monorepo | npm workspaces: `frontend/` · `backend/` · `shared/` | pnpm/yarn (repo đã có `package-lock.json`) |
| Frontend | Next.js 16.3.1 App Router · React 19 · TypeScript strict | Pages Router |
| Styles | Tailwind CSS v4 (`@import "tailwindcss"`, **không có `tailwind.config.*`**) | CSS-in-JS, SCSS, styled-components |
| UI kit | shadcn/ui (`npx shadcn init`) | MUI, Ant Design, Mantine, Chakra |
| Server state | TanStack Query v5 | Redux, RTK Query, SWR |
| Client state | Zustand (chỉ UI state: stepper, panel, modal) | Redux, Context làm store toàn cục |
| Form | react-hook-form + `@hookform/resolvers/zod` | Formik, form thủ công |
| Backend | NestJS 11 · TypeScript strict | Express thuần, Fastify riêng |
| DB | PostgreSQL 16 (Docker Compose local) | SQLite, MongoDB |
| ORM | Prisma | TypeORM, Drizzle, raw SQL |
| Validation | zod + `nestjs-zod` | class-validator, class-transformer, Joi |
| **LLM** | **DeepSeek — DUY NHẤT** (`openai` SDK trỏ `https://api.deepseek.com`) | **Anthropic / OpenAI / Gemini — không dùng ở MVP** |
| Embedding | `@xenova/transformers` chạy local CPU | API embedding trả phí |
| Realtime | SSE (`@Sse()` của Nest + `EventSource`) | WebSocket, BullMQ, Redis, socket.io |
| PDF export | Puppeteer (HTML → PDF) | pdfkit, pdfmake, jsPDF |
| Diff | `diff` (jsdiff) ở BE + `react-diff-viewer-continued` ở FE | tự viết thuật toán diff |
| Search nguồn | Semantic Scholar (chính) → OpenAlex (fallback) → Crossref (verify DOI) | để LLM tự nhớ paper |
| Eval | script `tsx` trong `backend/eval/` | Python (trừ vẽ chart) |
| Auth | **Không làm** | NextAuth, Clerk, JWT |

---

## 1. Ràng buộc cứng — vi phạm là hỏng deliverable

1. **Cấm hardcode prompt** trong `backend/src` và `frontend/src`. Code chỉ được **đọc file** từ `prompts/`. Verify:
   `grep -rniE "you are an?|hãy đóng vai|system prompt" backend/src frontend/src --include=*.ts --include=*.tsx` → phải rỗng.
2. **Cấm để LLM tự bịa paper.** Mọi `Source` phải đến từ Semantic Scholar / OpenAlex / arXiv API thật, lưu vào bảng `Source` kèm `retrieved_from`.
3. **5 Judge phải chạy độc lập**: 5 lời gọi API riêng biệt, context sạch, **không** truyền output của judge này vào judge kia. Chạy song song bằng `Promise.all`. Log riêng từng `JudgeRun`.
4. **Không bước nào tự động chốt.** Mọi thay đổi spec phải qua `Decision` do user chọn. Mọi câu hỏi lựa chọn phải có option **"Other"**.
5. **Mọi lời gọi LLM phải ghi `usage`** vào DB (`prompt_tokens`, `completion_tokens`, `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, latency ms). Đây là dữ liệu cho báo cáo đánh giá §7.4.
6. **Mọi turn sửa file** trong `backend/` `frontend/` `prompts/` `docs/` phải ghi `prompts/dev-log/NNN__...md` (xem rule).

---

## 2. LLM — DeepSeek only

### 2.1 Vì sao chỉ DeepSeek
MVP không có kinh phí cho Claude API. Đề bài **cho phép** cấu hình này: mục 9 nêu 3 cách làm judge độc lập, cách (b) là *"cùng model nhưng context và prompt độc lập"*. Đây là cách hợp lệ.

### 2.2 Client

```bash
npm i openai   # DeepSeek là OpenAI-compatible; KHÔNG cài @anthropic-ai/sdk
```

```ts
// backend/src/llm/deepseek.provider.ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});
```

Vẫn giữ interface `LlmProvider` (1 file adapter duy nhất ở MVP) để sau này cắm thêm provider chỉ tốn 1 file — **không** để lời gọi `client.chat.completions.create` rải rác trong service.

### 2.3 Model

| Model ID | Context | Max output | Dùng cho |
|---|---|---|---|
| `deepseek-v4-pro` | 1M | 384K | Generator, J1 Gap, J3 Experiment, J5 Readiness, **Auditor** |
| `deepseek-v4-flash` | 1M | 384K | J2 Contribution, J4 Evidence, entailment check hàng loạt, arm B1 |

Alias cũ `deepseek-chat` còn xuất hiện trong doc cũ — **luôn dùng model ID đầy đủ ở trên**, ghi đúng vào frontmatter `model:` của mỗi file `prompts/*.md`.

Tham số quan trọng:
- `reasoning_effort`: `"low"` | `"high"` | `"max"` — dùng `high` cho generator, `low` cho judge/verifier để tiết kiệm token.
- `temperature`: hỗ trợ 0–2. **Set `temperature: 0` cho mọi lời gọi** (NFR reproducibility §4 của đề).
- `max_tokens`: set tường minh, đừng để mặc định. JSON bị cắt giữa chừng là lỗi phổ biến nhất của JSON mode.
- `user_id`: truyền `project_id` để tách KVCache giữa các project.

### 2.4 Structured JSON — ĐỌC KỸ

DeepSeek chỉ có **JSON mode**, **KHÔNG có strict JSON-schema enforcement**. Nghĩa là:
- API chỉ đảm bảo output là JSON hợp lệ về cú pháp, **không** đảm bảo khớp schema của bạn.
- Bắt buộc set `response_format: { type: 'json_object' }`.
- Bắt buộc **nhắc chữ "json" + kèm ví dụ JSON output** trong system prompt, nếu không API báo lỗi.

→ **Mọi lời gọi LLM phải đi qua một wrapper duy nhất**, không gọi trực tiếp:

```ts
// backend/src/llm/llm.service.ts — chữ ký bắt buộc
async completeJson<T>(opts: {
  promptId: string;        // 'generator' | 'judge_gap' | ... → nạp từ prompts/
  schema: z.ZodType<T>;    // schema lấy từ package shared/
  model: 'deepseek-v4-pro' | 'deepseek-v4-flash';
  variables: Record<string, unknown>;
  maxRetries?: number;     // mặc định 2
}): Promise<{ data: T; usage: UsageRecord; attempts: number }>
```

Vòng đời bên trong: gọi API → `JSON.parse` → `schema.safeParse` → nếu fail thì retry, **đính kèm lỗi zod vào message tiếp theo** để model tự sửa → hết retry thì throw. Ghi `attempts` vào DB.

Lợi ích kép: tỉ lệ parse thành công ở lần đầu chính là metric **JSON validity %** mà đề §4 có nhắc → cho vào báo cáo miễn phí.

### 2.5 Context caching

DeepSeek cache prefix tự động trên đĩa, không cần config. Để 5 judge ăn cache:

> Đặt phần **dùng chung** (`spec_json`, `sources_json`) ở **đầu** — trong `system` message. Đặt phần **riêng của từng judge** ở `user` message **phía sau**.

Cache chỉ khớp **prefix**, nên thứ tự này là bắt buộc. Judge thứ 2–5 sẽ hit cache. Đọc `usage.prompt_cache_hit_tokens` để chứng minh bằng số trong báo cáo.

Không được nhét timestamp / UUID / random ID vào đầu prompt — nó phá toàn bộ cache phía sau.

### 2.6 Rủi ro #4 của đề — auditor không được là judge của chính mình

Chỉ có 1 nhà cung cấp nên không thể "đổi nhà cung cấp" như đề gợi ý. Bù bằng **4 lớp**, phải làm đủ cả 4 và **ghi thành limitation trong `docs/evaluation_report.md`**:

1. **Khác tier model**: 5 judge chạy đúng phân bổ ở §2.3; auditor luôn chạy `deepseek-v4-pro` với `reasoning_effort: "max"`.
2. **Prompt viết độc lập**: `prompts/auditor.md` viết từ đầu, **cấm** copy hay import từ 5 file judge.
3. **Chấm blind**: giấu nhãn arm (B1/B2/SYS) + xáo thứ tự trước khi đưa auditor chấm. Bắt buộc.
4. **Human validation 20 cặp** (§7.5 của đề) — đây là lớp bù đắp mạnh nhất khi chỉ có 1 provider. **Không được bỏ.**

Nếu về sau có free tier của provider khác, nâng cấp auditor chỉ tốn 1 file adapter — chừa sẵn chỗ trong `LlmProvider`.

### 2.7 Không có gì khác từ DeepSeek

- **Không có embedding API** → citation verifier dùng `@xenova/transformers` (model `all-MiniLM-L6-v2`) chạy local CPU. Miễn phí, offline, deterministic. Đây là **bắt buộc**, không phải lựa chọn.
- Không có vision, không cần.

---

## 3. Cấu trúc repo

```
/
├── shared/                     ← npm workspace, nguồn sự thật của mọi type
│   └── src/
│       ├── card.ts             CardType (8 loại) · CardStatus (6 trạng thái)
│       ├── spec.ts             SpecSection (14 mục) · SpecVersionSchema
│       ├── issue.ts            Severity (CRITICAL|MAJOR|MINOR) · JudgeKey (J1..J5)
│       ├── source.ts           SourceSchema · SupportLabel (SUPPORTED|WEAK|UNSUPPORTED)
│       └── llm-io/             schema input/output của TỪNG prompt
│           ├── generator.ts
│           ├── judge-gap.ts
│           └── ...
├── backend/
│   └── src/
│       ├── llm/                LlmProvider · DeepseekProvider · LlmService.completeJson
│       ├── prompts/            PromptLoaderService (đọc prompts/, cache, tính prompt_hash)
│       ├── sources/            SemanticScholar · OpenAlex · Crossref + cache vào bảng Source
│       ├── verifier/           citation-check · embedding · entailment   ← deliverable #6
│       ├── generator/          diễn giải · phân rã thẻ · gap · claim-evidence · experiment
│       ├── judge/              5 judge chạy song song + tổng hợp consensus/disagreement
│       ├── spec/               SpecVersion · Card · diff · export MD/PDF
│       ├── decision/           lưu quyết định user   ← chức năng 8 + mục 14 của spec
│       ├── estimator/          VRAM · thời gian · token cost   ← bước 7 của đề
│       └── jobs/               JobRun + SSE stream
│   └── eval/
│       ├── ideas.json          ≥ 8 ý tưởng          ← deliverable #4
│       ├── baseline-b1.ts      single-shot LLM      ← deliverable #7
│       ├── run-eval.ts
│       └── results/            commit vào git
├── frontend/src/
│   ├── app/                    App Router
│   ├── components/ui/          shadcn (generated)
│   ├── components/             stepper · card · judge-panel · issue-table · diff-view
│   ├── lib/api.ts              fetch client, dùng type từ shared/
│   └── stores/                 Zustand (chỉ UI state)
├── prompts/                    ← deliverable #5, KHÔNG gitignore
│   ├── generator.md  judge_gap.md  judge_contribution.md
│   ├── judge_experiment.md  judge_evidence.md  judge_readiness.md
│   ├── auditor.md              (ngoài 6 file bắt buộc, dùng cho eval §7.3)
│   └── dev-log/                log nội bộ, không nộp
├── docs/
│   ├── STACK.md                ← file này
│   ├── architecture.md         ← deliverable #3
│   └── evaluation_report.md    ← deliverable #8
└── docker-compose.yml          postgres:16
```

---

## 4. Data model (Prisma)

Bám sát §8 của kim chỉ nam, **dựng đủ 9 bảng ngay từ đầu** — đặc biệt `Decision` và `SpecVersion` (bỏ sót = mất chức năng 8 + 15 + mục 14 của spec):

`Project` · `SpecVersion` · `Card` · `Source` · `CardSource` · `JudgeRun` · `Issue` · `Decision` · `ExperimentPlan` · `ResourceEstimate`

Quy ước:
- Postgres nên dùng `Json` / `Json[]` native cho `options_json`, `plan_json`, `raw_output` — **không** stringify thủ công.
- Enum khai bằng Prisma `enum`, và **phải khớp 1-1** với zod enum trong `shared/`. Nếu lệch là bug âm thầm.
- `JudgeRun` bắt buộc có: `judge_key`, `model`, `prompt_hash`, `raw_output`, `usage_json`, `latency_ms`, `created_at`.
- Mọi bảng có `created_at`. `SpecVersion` có `parent_version_id` để render diff.

---

## 5. Frontend

- **Tailwind v4**: cấu hình bằng CSS (`@theme` trong `globals.css`), **không tạo `tailwind.config.js`**. `postcss.config.mjs` dùng `@tailwindcss/postcss` — đã có sẵn.
- **shadcn**: `npx shadcn init` (tự nhận Next.js). Component sinh ra nằm ở `components/ui/`, được phép sửa trực tiếp.
- **TanStack Query** cho mọi thứ đến từ API. **Zustand** chỉ giữ: bước hiện tại của stepper, panel đang mở, filter của bảng issue. Không đưa dữ liệu server vào Zustand.
- **SSE**: `new EventSource('/api/jobs/:id/stream')`. Flow: `POST /jobs` tạo job → nhận `jobId` → mở `EventSource` → nhận từng event `judge.started` / `judge.done` / `job.done` → `queryClient.invalidateQueries` khi xong.
- Màu theo `CardStatus` (đề khuyến khích): map enum → Tailwind class ở **một** file duy nhất, đừng rải inline.
- Mockup trong `docs/sample*.png` là **gợi ý**, đề nói rõ không cần làm y hệt.

Không làm: responsive mobile, i18n, dark mode, accessibility nâng cao, animation. Đề §4 ghi rõ không yêu cầu — đừng tốn thời gian.

---

## 6. Biến môi trường

```bash
# .env  (đã gitignore) — copy từ .env.example
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/specresearch"
DEEPSEEK_API_KEY=
SEMANTIC_SCHOLAR_API_KEY=          # optional, để nới rate limit
OPENALEX_MAILTO=you@example.com    # vào polite pool, rate limit rộng hơn
PORT=3001
CONTEXT7_API_KEY=                  # chỉ cho MCP lúc dev, app không dùng
```

Validate env bằng zod trong `@nestjs/config` — thiếu key phải fail lúc boot, không fail lúc gọi API.

---

## 7. Lệnh

```bash
npm install                            # workspace root, cài cả 3 package
docker compose up -d                   # postgres:16
npm -w backend exec prisma migrate dev
npm run dev                            # concurrently: FE :3000 + BE :3001

npm -w backend exec prisma studio      # xem bảng Decision/SpecVersion khi quay demo
npm -w backend exec tsx eval/run-eval.ts
```

Đổi sang Postgres cloud (Neon/Supabase) chỉ cần đổi `DATABASE_URL` — không đụng code.

---

## 8. Cấm cài thêm (đã cân nhắc và loại)

| Package | Lý do loại |
|---|---|
| `@anthropic-ai/sdk`, `@google/genai` | MVP chỉ DeepSeek |
| `langchain`, `llamaindex` | Abstraction thừa, che mất `usage` và `prompt_hash` — cả hai đều là dữ liệu bắt buộc cho báo cáo |
| `ai` (Vercel AI SDK) | Thêm 1 lớp trung gian không cần thiết khi chỉ có 1 provider |
| `class-validator`, `class-transformer` | Đã có zod dùng chung FE/BE/LLM-schema; 2 hệ validation là nợ kỹ thuật |
| `redis`, `bullmq` | SSE + bảng `JobRun` đã đủ |
| `socket.io` | SSE một chiều là đủ, nhẹ hơn |
| `next-auth`, `@clerk/nextjs` | Đề không yêu cầu auth |
| `moment` | Dùng `Intl` hoặc `date-fns` nếu thật cần |

Muốn thêm dependency ngoài danh sách ở §0 → hỏi trước, đừng tự cài.

---

## 9. Thứ tự triển khai (theo §9 kim chỉ nam)

| # | Giai đoạn | Điều kiện coi là xong |
|---|---|---|
| 0 | Setup | 6 file `prompts/` + `shared/` + Prisma schema + docker-compose chạy được |
| 1 | Xương sống (15%) | Nhập ý tưởng → paraphrase → sinh thẻ 8 loại/6 trạng thái → lưu `Decision` |
| 2 | Grounding (20%) | Semantic Scholar/OpenAlex thật + bảng related work + citation verifier |
| 3 | Nội dung spec (20%) | Gap 4-câu-hỏi · Claim–Evidence 5 trường (nhớ **Điều kiện bác bỏ**) · experiment plan · resource estimator |
| 4 | Judge loop (20%) | 5 judge song song · consensus/disagreement · A/B/C/Other · diff · version |
| 5 | Export + UI (5%) | PDF **và** Markdown · stepper · màu theo trạng thái |
| 6 | Đánh giá (15%) | B1 · B2 (feature flag `SKIP_JUDGE`) · 3 arm × 4 metric · human check 20 cặp |
| 7 | Video + docs (5%) | `architecture.md` có sơ đồ · video demo |

**Quy tắc:** không sang giai đoạn sau khi giai đoạn trước chưa chạy end-to-end. Pipeline xấu chạy trọn 10 bước > 3 bước đẹp + 7 bước rỗng.
