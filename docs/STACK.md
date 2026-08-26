# STACK — SpecResearch Loop

> Tài liệu chốt stack cho **coding agent** và người code. Đọc file này trước khi thêm bất kỳ dependency nào.
> Đặc tả nghiệp vụ: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md`. Rule về prompt: `.claude/rules/prompt-audit.md`.
> Cập nhật: 2026-08-16

---

## 0. TL;DR — bảng chốt

| Lớp | Chốt | Không dùng |
|---|---|---|
| Repo | **2 project độc lập** trong cùng 1 GitHub repo cho gọn: `frontend/` · `backend/`. Cài riêng, build riêng, **deploy riêng** | npm workspaces, package `shared/` dùng chung, import chéo giữa 2 thư mục |
| Ngôn ngữ | **UI + câu hỏi cho user: tiếng Việt · nội dung spec 14 mục: tiếng Anh** — xem §10 | spec tiếng Việt (verifier phải so cross-lingual với abstract) |
| Frontend | Next.js 16.3.1 App Router · React 19 · TypeScript strict | Pages Router |
| Styles | Tailwind CSS v4 (`@import "tailwindcss"`, **không có `tailwind.config.*`**) | CSS-in-JS, SCSS, styled-components |
| UI kit | shadcn/ui (`npx shadcn init`) | MUI, Ant Design, Mantine, Chakra |
| Icon | `lucide-react` — **đi kèm shadcn, không phải dependency mới** | react-icons, heroicons, font-awesome |
| Font | `Be Vietnam Pro` nạp qua `next/font` (có sẵn trong Next.js). Lý do chọn: `DESIGN_SYSTEM.md` §2 | `@fontsource/*`, link CDN Google Fonts, tự host file font |
| Server state | TanStack Query v5 | Redux, RTK Query, SWR |
| Client state | Zustand (chỉ UI state: stepper, panel, modal) | Redux, Context làm store toàn cục |
| Form | react-hook-form + `@hookform/resolvers/zod` | Formik, form thủ công |
| Backend | NestJS 11 · TypeScript strict | Express thuần, Fastify riêng |
| DB | PostgreSQL qua `DATABASE_URL` — Neon serverless. Không dựng Docker | SQLite, MongoDB, docker-compose |
| ORM | Prisma | TypeORM, Drizzle, raw SQL |
| Validation | zod + `nestjs-zod` | class-validator, class-transformer, Joi |
| **LLM** | **DeepSeek — DUY NHẤT** (`openai` SDK trỏ `https://api.deepseek.com`) | mọi provider khác — không dùng ở MVP |
| Embedding | `@xenova/transformers` chạy local CPU | API embedding trả phí |
| Realtime | SSE (`@Sse()` của Nest + `EventSource`) | WebSocket, BullMQ, Redis, socket.io |
| PDF export | Puppeteer (HTML → PDF) | pdfkit, pdfmake, jsPDF |
| Diff | `diff` (jsdiff) ở BE + `react-diff-viewer-continued` ở FE | tự viết thuật toán diff |
| Search nguồn | Semantic Scholar (chính) → OpenAlex (fallback) → Crossref (verify DOI) | để LLM tự nhớ paper |
| Eval | script `tsx` trong `backend/eval/` | Python (trừ vẽ chart) |
| Auth | **JWT access + refresh**, email + password, tự implement (`@nestjs/jwt` + `bcryptjs`) — xem §11 | NextAuth, Clerk, Auth0, OAuth social |

---

## 1. Ràng buộc cứng — vi phạm là hỏng deliverable

1. **Cấm hardcode prompt** trong `backend/src` và `frontend/src`. Code chỉ được **đọc file** từ `prompts/`. Verify:
   `grep -rniE "you are an?|hãy đóng vai|system prompt" backend/src frontend/src --include=*.ts --include=*.tsx` → phải rỗng.
2. **Cấm để LLM tự bịa paper.** Mọi `Source` phải đến từ Semantic Scholar / OpenAlex / arXiv API thật, lưu vào bảng `Source` kèm `retrieved_from`.
3. **5 Judge phải chạy độc lập**: 5 lời gọi API riêng biệt, context sạch, **không** truyền output của judge này vào judge kia. Chạy song song bằng `Promise.all`. Log riêng từng `JudgeRun`.
4. **Không bước nào tự động chốt.** Mọi thay đổi spec phải qua `Decision` do user chọn. Mọi câu hỏi lựa chọn phải có option **"Other"**.
5. **Mọi lời gọi LLM phải ghi `usage`** vào DB (`prompt_tokens`, `completion_tokens`, `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, latency ms). Đây là dữ liệu cho báo cáo đánh giá §7.4.
6. **Mọi turn sửa file** trong `backend/` `frontend/` `prompts/` `docs/` phải ghi `prompts/dev-log/NNN__...md` (xem rule).
7. **Nội dung spec sinh ra bằng tiếng Anh**, UI và câu hỏi cho user bằng tiếng Việt. Không trộn (§10).
8. **Mọi truy vấn dữ liệu phải scope theo `user_id`** lấy từ access token, không nhận `owner_id` từ body/query của client. Sai chỗ này là lỗ hổng IDOR — user A đọc được project của user B (§11).

---

## 2. LLM — DeepSeek only

### 2.1 Vì sao chỉ DeepSeek
Kinh phí MVP không đủ cho provider đắt hơn. Đề bài **cho phép** cấu hình này: mục 9 nêu 3 cách làm judge độc lập, cách (b) là *"cùng model nhưng context và prompt độc lập"*. Đây là cách hợp lệ.

Multi-provider là việc **sau MVP**, chưa cân nhắc, chưa ghi doc. Chừa sẵn interface `LlmProvider` là đủ.

### 2.2 Client

```bash
npm i openai   # DeepSeek là OpenAI-compatible
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

MVP chỉ có 1 nhà cung cấp nên không thể "đổi nhà cung cấp" như đề gợi ý. Bù bằng **4 lớp**, phải làm đủ cả 4 và **ghi thành limitation trong `docs/evaluation_report.md`**:

1. **Khác tier model**: 5 judge chạy đúng phân bổ ở §2.3; auditor luôn chạy `deepseek-v4-pro` với `reasoning_effort: "max"`.
2. **Prompt viết độc lập**: `prompts/auditor.md` viết từ đầu, **cấm** copy hay import từ 5 file judge.
3. **Chấm blind**: giấu nhãn arm (B1/B2/SYS) + xáo thứ tự trước khi đưa auditor chấm. Bắt buộc.
4. **Human validation 20 cặp** (§7.5 của đề) — đây là lớp bù đắp mạnh nhất khi chỉ có 1 provider. **Không được bỏ.**

### 2.7 Không có gì khác từ DeepSeek

- **Không có embedding API** → citation verifier dùng `@xenova/transformers` (model `all-MiniLM-L6-v2`) chạy local CPU. Miễn phí, offline, deterministic. Đây là **bắt buộc**, không phải lựa chọn.
- Không có vision, không cần.

---

## 3. Cấu trúc repo

**Không có package dùng chung.** `frontend/` và `backend/` là hai project rời, `npm install` riêng, không import chéo. Type dùng chung được **khai lại thủ công** ở FE (§3.1).

```
/
├── backend/
│   └── src/
│       ├── contracts/          nguồn sự thật của mọi type — zod schema, BE-only
│       │   ├── card.ts spec.ts issue.ts source.ts    enum + schema nghiệp vụ
│       │   ├── error-code.ts   enum mã lỗi trả về cho FE
│       │   └── llm-io/         schema input/output của TỪNG prompt
│       │       ├── generator.ts
│       │       ├── judge-gap.ts
│       │       └── ...
│       ├── auth/               register · login · refresh · JwtStrategy · JwtAuthGuard
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
│   ├── prisma/schema.prisma    ERD do docs/ARCHITECTURE.md định nghĩa, không phải file này
│   └── eval/
│       ├── ideas.json          ≥ 8 ý tưởng          ← deliverable #4
│       ├── baseline-b1.ts      single-shot LLM      ← deliverable #7
│       ├── run-eval.ts
│       └── results/            commit vào git
├── frontend/src/
│   ├── app/                    App Router — (auth)/login · (auth)/register · (app)/…
│   ├── components/ui/          shadcn (generated)
│   ├── components/             stepper · card · judge-panel · issue-table · diff-view
│   ├── lib/api.ts              fetch client + tự gọi /auth/refresh khi gặp 401
│   ├── lib/types.ts            type khai lại thủ công theo backend/src/contracts/
│   ├── lib/error-code.ts       map mã lỗi BE → thông báo tiếng Việt
│   └── stores/                 Zustand (chỉ UI state)
├── prompts/                    ← deliverable #5, KHÔNG gitignore
│   ├── generator.md  judge_gap.md  judge_contribution.md
│   ├── judge_experiment.md  judge_evidence.md  judge_readiness.md
│   ├── auditor.md              (ngoài 6 file bắt buộc, dùng cho eval §7.3)
│   └── dev-log/                log nội bộ, không nộp
└── docs/
    ├── STACK.md                ← file này: chọn công nghệ gì, cấm cài gì
    ├── DESIGN_SYSTEM.md        ← token màu/chữ/spacing + component inventory
    ├── ARCHITECTURE.md         ← deliverable #3: ERD, data model, luồng xử lý, API surface
    └── evaluation_report.md    ← deliverable #8
```

**Ranh giới tài liệu:** file này chỉ trả lời *"dùng công nghệ gì, cấm cài gì"*. ERD, bảng, quan hệ,
luồng dữ liệu, thiết kế API → `docs/ARCHITECTURE.md`. Màu, typography, component → `docs/DESIGN_SYSTEM.md`.
Đừng nhân bản nội dung của hai file kia vào đây.

### 3.1 Không có `shared/` — luật bù lại

Đổi lấy sự đơn giản, ta chấp nhận **khai lại type ở hai nơi**. Ba luật để cái giá đó không thành bug âm thầm:

1. **Backend là nguồn sự thật.** `backend/src/contracts/` chứa zod schema; Prisma `enum` phải khớp 1-1 với zod enum ở đây. FE **không bao giờ** được coi là nơi định nghĩa.
2. **FE khai lại bằng union string thuần**, không import zod. Ví dụ `export type CardStatus = 'CONFIRMED' | 'PROPOSED' | ...`. Mỗi khi sửa enum ở BE, sửa `frontend/src/lib/types.ts` **trong cùng commit** — coi như một phần của định nghĩa xong.
3. **Mã lỗi đi qua enum, không đi qua chuỗi tự do.** BE trả `{ code: 'SOURCE_NOT_FOUND', message: '...' }`; FE map `code` → thông báo tiếng Việt trong `lib/error-code.ts`. Không parse `message` để phân nhánh logic.

Ba enum dễ lệch nhất, kiểm bằng mắt mỗi lần đụng tới: `CardStatus` (6), `Severity` (3), `SupportLabel` (3).

---

## 4. Quy ước dùng Prisma

**Không định nghĩa ERD ở đây.** Bảng nào, quan hệ nào, field nào → `docs/ARCHITECTURE.md`.
File này chỉ chốt cách *dùng* ORM:

- Postgres dùng `Json` native cho field dạng blob JSON — **không** stringify thủ công.
- Enum khai bằng Prisma `enum` và **phải khớp 1-1** với zod enum trong `backend/src/contracts/` (§3.1). Lệch là bug âm thầm.
- Mọi bảng có `created_at`.
- Migration chạy bằng `prisma migrate dev`, commit thư mục `migrations/` vào git.

---

## 5. Frontend

- **Tailwind v4**: cấu hình bằng CSS (`@theme` trong `globals.css`), **không tạo `tailwind.config.js`**. `postcss.config.mjs` dùng `@tailwindcss/postcss` — đã có sẵn.
- **shadcn**: `npx shadcn init` (tự nhận Next.js). Component sinh ra nằm ở `components/ui/`, được phép sửa trực tiếp.
- **TanStack Query** cho mọi thứ đến từ API. **Zustand** chỉ giữ UI state **sống lâu hơn component đang hiển thị nó** — hiện chỉ có một field: `cardFilter`, bộ lọc trạng thái của `CardBoard` (giữ được khi đổi bước trên stepper vì `CardBoard` unmount theo route). Bước hiện tại của stepper nằm ở **URL** chứ không ở store. State chỉ sống trong một màn hình thì để `useState` — đưa vào store là tạo field không ai đọc. Không đưa dữ liệu server vào Zustand.
- **Proxy `/api` qua Next.js**: khai `rewrites()` trong `next.config.ts` cho `/api/:path*` → `http://localhost:3001/:path*`. Nhờ vậy FE và BE **cùng origin** với trình duyệt → cookie auth chạy `SameSite=Lax` bình thường, không cần CORS, không cần HTTPS ở local. Đây là điều kiện để SSE có auth (§11).
- **SSE**: `new EventSource('/api/jobs/:id/stream')`. Flow: `POST /jobs` tạo job → nhận `jobId` → mở `EventSource` → nhận từng event `judge.started` / `judge.done` / `job.done` → `queryClient.invalidateQueries` khi xong. `EventSource` **không set được header `Authorization`** — đó là lý do token đi bằng cookie chứ không giữ trong memory.
- Màu theo `CardStatus` (đề khuyến khích): map enum → Tailwind class ở **một** file duy nhất, đừng rải inline. Bảng màu và token do `docs/DESIGN_SYSTEM.md` định nghĩa, không quyết ở file này.
- Mockup trong `docs/sample*.png` là **gợi ý**, đề nói rõ không cần làm y hệt. Mockup chỉ có bản desktop — bản mobile do `docs/DESIGN_SYSTEM.md` §6 định nghĩa.
- **Mockup không phủ hết yêu cầu của đề.** Ba khối đề đòi mà không mockup nào vẽ: bảng thẻ phân rã 8 loại × 6 trạng thái (bước 2 + chức năng 3), khối quyết định ở B3, và phần *bất đồng* của chức năng 13. Chốt ở `DESIGN_SYSTEM.md` §5.4 và §8 #10–#11. Làm theo mockup mà bỏ ba khối đó là **thiếu chức năng bắt buộc**, không phải "khác thiết kế".
- **Bố cục màn hình nào có gì**: `DESIGN_SYSTEM.md` §5.4 (desktop) và §6.9 (mobile). **Trạng thái chờ / rỗng / lỗi**: §5.5 — bắt buộc, vì mọi việc gọi LLM mất 20–90s và đó là phần lớn thời gian người dùng nhìn màn hình.
- **Responsive — BẮT BUỘC.** App phải dùng được ở cả điện thoại và desktop. Làm theo **đúng chuẩn Tailwind + shadcn**, không phát minh hệ riêng:
  - Giữ **nguyên** thang breakpoint mặc định của Tailwind (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536). **Không** khai `--breakpoint-*`, **không** xoá mốc nào — shadcn có dùng `sm:` bên trong component của nó.
  - Viết **mobile-first**. Bố cục cấp trang chỉ cần 2 mốc `md:` và `xl:`.
  - Kích thước nút lấy từ prop `size` của shadcn `Button`, không tự khai chiều cao.
  - Không sửa file trong `components/ui/` để "chuẩn hoá" — sửa là mất khả năng chạy lại `npx shadcn add`.
  - Chi tiết bố cục 3 tầng, bảng → card list, bottom sheet, vùng chạm: `docs/DESIGN_SYSTEM.md` §6. Không quyết ở file này.
- Thêm 2 component shadcn cho mobile: `sheet` và `drawer`. Không phải dependency mới, vẫn nằm trong shadcn.

Không làm: i18n (chuỗi tiếng Việt viết thẳng, không dựng hệ thống dịch), dark mode, animation phức tạp. Đề §4 không yêu cầu — đừng tốn thời gian.

> **Đã đổi 2026-08-16:** bản trước của file này ghi "không làm responsive mobile". Luật đó **đã bỏ**.
> Đề bài không *đòi* responsive nhưng cũng không cấm; chủ dự án quyết định app phải chạy được trên
> điện thoại. Mọi tài liệu khác đã được cập nhật theo.

---

## 6. Biến môi trường

`backend/.env` (đã gitignore) — copy từ `.env.example` ở root:

```bash
DATABASE_URL=                      # Neon: postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require
DEEPSEEK_API_KEY=
SEMANTIC_SCHOLAR_API_KEY=          # optional, để nới rate limit
OPENALEX_MAILTO=you@example.com    # vào polite pool, rate limit rộng hơn
PORT=3001

JWT_ACCESS_SECRET=                 # chuỗi ngẫu nhiên ≥32 byte, khác JWT_REFRESH_SECRET
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

CONTEXT7_API_KEY=                  # chỉ cho MCP lúc dev, app không dùng
```

`frontend/.env.local`:

```bash
BACKEND_ORIGIN=http://localhost:3001   # dùng cho rewrites() trong next.config.ts
```

Validate env bằng zod trong `@nestjs/config` — thiếu key phải fail lúc boot, không fail lúc gọi API.
Hai JWT secret **phải khác nhau**: dùng chung nghĩa là refresh token đi qua được cửa access token.

---

## 7. Lệnh

Hai project rời → cài và chạy riêng, hai terminal. **Không có Docker** — `DATABASE_URL` trỏ thẳng
tới Postgres đã có (Neon).

```bash
cd backend  && npm install
npx prisma migrate dev
npm run seed                                # user hệ thống eval@local
npm run start:dev                           # :3001

cd frontend && npm install
npm run dev                                 # :3000

# tiện ích
cd backend && npx prisma studio             # xem dữ liệu khi quay demo
cd backend && npx tsx eval/run-eval.ts
```

Đổi sang Postgres cloud (Neon/Supabase) chỉ cần đổi `DATABASE_URL` — không đụng code.

---

## 8. Cấm cài thêm (đã cân nhắc và loại)

| Package | Lý do loại |
|---|---|
| SDK của provider LLM khác | MVP chỉ DeepSeek, gọi qua `openai` SDK |
| `langchain`, `llamaindex` | Abstraction thừa, che mất `usage` và `prompt_hash` — cả hai đều là dữ liệu bắt buộc cho báo cáo |
| `ai` (Vercel AI SDK) | Thêm 1 lớp trung gian không cần thiết khi chỉ có 1 provider |
| `class-validator`, `class-transformer` | Đã có zod dùng chung FE/BE/LLM-schema; 2 hệ validation là nợ kỹ thuật |
| `redis`, `bullmq` | SSE + bảng `JobRun` đã đủ |
| `socket.io` | SSE một chiều là đủ, nhẹ hơn |
| `next-auth`, `@clerk/nextjs`, `@auth0/*` | Auth tự implement bằng `@nestjs/jwt` (§11) — auth nằm ở backend, không ở Next.js |
| `passport-local` | Chỉ cần `passport-jwt` cho guard; login form tự viết 15 dòng, không đáng thêm strategy |
| `bcrypt` (bản native) | Dùng `bcryptjs` — thuần JS, không cần toolchain build trên Windows |
| `moment` | Dùng `Intl` hoặc `date-fns` nếu thật cần |

Muốn thêm dependency ngoài danh sách ở §0 → hỏi trước, đừng tự cài.

---

## 9. Thứ tự triển khai (theo §9 kim chỉ nam)

| # | Giai đoạn | Điều kiện coi là xong |
|---|---|---|
| 0 | Setup | `DESIGN_SYSTEM.md` + `ARCHITECTURE.md` chốt xong · 6 file `prompts/` · `contracts/` · Prisma migrate chạy được trên Neon · **token màu/chữ trong `globals.css` + `status-style.ts` + khung `WizardShell`/`DecisionSheet` dựng xong và chạy được ở 375px** |
| 0.5 | Auth (§11) | Đăng ký → đăng nhập → refresh → guard chặn được project của user khác |
| 1 | Xương sống (15%) | Nhập ý tưởng → paraphrase → sinh thẻ 8 loại/6 trạng thái (**hiện ra ở `CardBoard`**) → lưu `Decision` |
| 2 | Grounding (20%) | Semantic Scholar/OpenAlex thật + bảng related work + citation verifier |
| 3 | Nội dung spec (20%) | Gap 4-câu-hỏi · Claim–Evidence 5 trường (nhớ **Điều kiện bác bỏ**) · experiment plan · resource estimator |
| 4 | Judge loop (20%) | 5 judge song song · consensus/disagreement · A/B/C/Other · diff · version |
| 5 | Export + hoàn thiện UI (5%) | PDF **và** Markdown · nghiệm thu responsive theo `DESIGN_SYSTEM.md` §6.10 · trạng thái chờ/rỗng/lỗi (§5.5) |
| 6 | Đánh giá (15%) | B1 · B2 (feature flag `SKIP_JUDGE`) · 3 arm × 4 metric · human check 20 cặp |
| 7 | Video + docs (5%) | `ARCHITECTURE.md` cập nhật đúng code thật · video demo |

**Quy tắc:** không sang giai đoạn sau khi giai đoạn trước chưa chạy end-to-end. Pipeline xấu chạy trọn 10 bước > 3 bước đẹp + 7 bước rỗng.

> **Đọc kỹ chỗ này — 5% ở giai đoạn 5 là 5% của phần *còn lại*, không phải toàn bộ UI.**
> Khung bố cục (`WizardShell`, `DecisionSheet`, `Stepper`, token màu) thuộc **giai đoạn 0**, và mỗi
> giai đoạn 1–4 tự làm luôn phần giao diện của mình theo bản đồ màn hình ở `DESIGN_SYSTEM.md` §5.4 —
> chạy được ở cả 375px và desktop mới coi là xong giai đoạn đó. Giai đoạn 5 chỉ còn export và nghiệm
> thu. **Không bọc responsive lên một app đã dựng xong** — `ARCHITECTURE.md` §8 nói cùng một điều, và
> đó là lý do dòng này tồn tại thay vì để người đọc suy ra "UI làm sau cùng, đáng 5%".

---

## 10. Ngôn ngữ — VI ở vỏ, EN ở ruột

Ranh giới rạch ròi, không được nhập nhằng:

| Phần | Ngôn ngữ | Ví dụ |
|---|---|---|
| UI, nhãn nút, nav, thông báo lỗi | **Tiếng Việt** | "Phân tích ý tưởng", "Xác nhận & xuất Spec cuối" |
| Câu hỏi làm rõ + option A/B/C/Other + phần giải thích option | **Tiếng Việt** | "Tác vụ chính là gì?" |
| Ý tưởng thô user nhập | Tiếng Việt (chấp nhận cả EN) | — |
| **Nội dung 14 mục của spec** — problem, gap, claim, contribution, experiment | **Tiếng Anh** | "LLM-based extraction produces unsupported claims when…" |
| Nhận xét của 5 Judge (`Vấn đề`/`Lý do`/`Mức độ`/`Đề xuất`) | **Tiếng Anh** cho nội dung, nhãn severity giữ nguyên `CRITICAL`/`MAJOR`/`MINOR` | — |
| Spec export PDF/Markdown | **Tiếng Anh** hoàn toàn | — |

**Vì sao:** verifier so claim với abstract paper — abstract luôn tiếng Anh. Giữ cùng ngôn ngữ thì
embedding `all-MiniLM-L6-v2` (model tiếng Anh) và entailment check chạy đúng thiết kế. Nếu claim là
tiếng Việt, ta phải so cross-lingual → similarity nhiễu → **metric của deliverable #8 mất giá trị**.
Đây là quyết định phục vụ báo cáo đánh giá, không phải sở thích trình bày.

**Cách enforce:** mỗi prompt trong `prompts/` ghi rõ ngôn ngữ output ngay trong system prompt, và
zod schema tương ứng đặt tên field bằng tiếng Anh. Generator sinh câu hỏi cho user thì output tiếng
Việt — đó là prompt duy nhất trộn hai ngôn ngữ, phải ghi chú rõ trong file.

---

## 11. Auth — JWT access + refresh

Đề không yêu cầu auth, nhưng dự án có **quản lý dự án, lịch sử phiên bản và decision history** — ba
thứ đó vô nghĩa nếu không biết dữ liệu thuộc về ai. Nav trong mockup cũng có avatar user.

### 11.1 Chốt

| Hạng mục | Chốt |
|---|---|
| Đăng ký / đăng nhập | email + password. Hash bằng `bcryptjs`, cost 10 |
| Access token | JWT, TTL 15 phút, payload `{ sub: userId, email }` |
| Refresh token | JWT, TTL 7 ngày, lưu hash vào DB để `logout` thu hồi được |
| Vận chuyển | **httpOnly cookie**, `SameSite=Lax`, `Secure` khi production |
| Guard | `JwtAuthGuard` bật **global**, mở ra bằng decorator `@Public()` cho `/auth/*` và `/health` |
| Thư viện | `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` + `bcryptjs` + `cookie-parser` |

Endpoint: `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`.

**Không làm ở MVP:** refresh token rotation, đăng nhập nhiều thiết bị có quản lý session, đổi/quên
mật khẩu, xác thực email, rate limit đăng nhập. Auth không được chấm điểm — dừng ở mức chạy đúng.

### 11.2 Vì sao cookie chứ không phải `Authorization: Bearer` trong memory

Đây là lựa chọn đã cân nhắc, không phải mặc định. Cách quen thuộc hơn là giữ access token trong
memory rồi gắn header. Nhưng hệ thống chạy 5 judge qua **SSE**, mà `EventSource` của trình duyệt
**không cho set header** — token buộc phải đi kèm request bằng đường khác. Nhét vào query string
(`?token=...`) thì nó lọt vào access log và lịch sử duyệt web, lại phải viết nhánh auth riêng cho SSE.

Cookie httpOnly giải quyết cả hai: `fetch` và `EventSource` đều tự gửi, FE không phải quản lý token,
JS không đọc được nên XSS không lấy được. Điều kiện để nó chạy là FE/BE cùng origin — đã có nhờ
`rewrites()` của Next.js (§5). Tổng cộng ít code hơn phương án Bearer, nên hợp MVP hơn.

Vẫn là JWT access + refresh chuẩn, chỉ khác đường vận chuyển. Khi deploy tách 2 domain thì đổi
`SameSite=None; Secure` + bật CORS `credentials`, không phải viết lại logic.

CSRF: `SameSite=Lax` chặn được form/link cross-site. Mọi endpoint đổi dữ liệu dùng `POST`/`PATCH`/
`DELETE`, không dùng `GET`. Đề không chấm bảo mật nên dừng ở mức này, **không** dựng thêm CSRF token.

### 11.3 Ràng buộc khi code

1. `user_id` **chỉ** lấy từ token đã verify (`req.user.sub`). Không bao giờ nhận từ body/query/param.
2. Mọi truy vấn `Project` kèm `where: { user_id }`. Bảng con join qua `Project` để check quyền —
   trả **404**, không trả 403, khi user hỏi tài nguyên của người khác.
3. `POST /auth/login` sai mật khẩu và sai email đều trả **cùng một** mã lỗi + cùng thời gian phản hồi.
4. Password tối thiểu 8 ký tự, validate bằng zod ở BE. Không cần rule phức tạp hơn.
5. Script eval (`eval/run-eval.ts`) chạy **in-process**, gọi thẳng service, **không** đi qua HTTP và
   không cần login — nhưng vẫn truyền `user_id` của `eval@local` để dữ liệu đi đúng một đường ghi.
