# Prompt khởi động cho AI coding agent — SpecResearch Loop

> Dán **toàn bộ phần trong khung dưới** vào một phiên agent mới. Không cần thêm gì khác.
> File này là công cụ, không phải deliverable — không nộp.

---

Bạn là coding agent thực thi đồ án **SpecResearch Loop** trong repo này, từ scaffold trống tới
sản phẩm chạy được end-to-end. Repo đã có sẵn toàn bộ tài liệu thiết kế; **việc của bạn là hiện thực
hoá chúng, không phải thiết kế lại chúng.**

## 0. Đọc trước khi viết dòng code đầu tiên

Đọc theo đúng thứ tự này. Không skim, không đọc lướt phần bảng — phần lớn quyết định nằm trong bảng.

| # | File | Lấy gì từ đó |
|---|---|---|
| 1 | `CLAUDE.md` + `.claude/rules/prompt-audit.md` | Luật bắt buộc của repo. Có hook chặn thật, không phải gợi ý |
| 2 | `docs/SPECRESEARCH_LOOP-kim-chi-nam.md` | Yêu cầu gốc đã giải mã: 16 chức năng, 10 deliverable, chỗ mất điểm |
| 3 | `docs/STACK.md` | Dùng công nghệ gì, **cấm cài gì**. Đọc §1 (ràng buộc cứng) và §8 (danh sách cấm) kỹ nhất |
| 4 | `docs/ARCHITECTURE.md` | ERD, API surface, thuật toán verifier 5 tầng, kế hoạch 8 phase (§8) |
| 5 | `docs/DESIGN_SYSTEM.md` | Toàn bộ giao diện: token, ánh xạ trạng thái, **§5.4 bản đồ màn hình**, **§5.5 trạng thái chờ**, **§6 responsive** |
| 6 | `docs/SYSTEM_DESIGN_ANALYSIS.md` | Thiết kế vỡ ở đâu và mỗi lựa chọn đánh đổi gì. **§4.4 là danh sách quyết định đã chốt — làm theo, đừng quyết lại** |
| 7 | `backend/CLAUDE.md` · `frontend/CLAUDE.md` | Code style từng project. Đọc khi bắt đầu đụng vào project đó |
| 8 | `docs/sample1..5.png` | Mockup desktop của giảng viên — **gợi ý**, không phải hợp đồng. Xem §"Mockup" bên dưới |

**Ranh giới tài liệu, để không đi tìm nhầm chỗ:** công nghệ → `STACK.md` · ERD/API/thuật toán →
`ARCHITECTURE.md` · giao diện → `DESIGN_SYSTEM.md` · đánh đổi và điểm vỡ → `SYSTEM_DESIGN_ANALYSIS.md`.
Bốn file không chép nội dung của nhau; nếu bạn thấy chúng mâu thuẫn thì đó là bug tài liệu — dừng và
hỏi, đừng tự chọn một bên.

## 1. Hiện trạng repo — chính xác tới đâu

Đừng giả định nhiều hơn danh sách này.

- `backend/` — **chỉ là `nest new` trống**: `app.module/controller/service` mặc định. Dependency chỉ có
  `@nestjs/common|core|platform-express`, `rxjs`, `reflect-metadata`. **Chưa có** Prisma, zod, openai,
  passport, bcryptjs. **Chưa có** thư mục `prisma/`, `src/contracts/`, `eval/`.
- `frontend/` — **chỉ là `create-next-app` trống**: `layout.tsx`, `page.tsx`, `globals.css`. Dependency
  chỉ có `next` 16.3.1, `react` 19. **Chưa init shadcn** (không có `components.json`). **Chưa có**
  TanStack Query, Zustand, react-hook-form, zod.
- `prompts/` — **chỉ có `dev-log/`**, chưa có file prompt runtime nào.
- `docs/` — đầy đủ, đã duyệt. `docs/evaluation_report.md` chưa tồn tại (deliverable #8, phase 6).
- ESLint + Prettier + tsconfig đã cấu hình sẵn ở cả hai project — **dùng, đừng dựng lại** (xem
  `backend/CLAUDE.md` §0 và `frontend/CLAUDE.md` §0).
- `node_modules/` đã cài ở cả hai. Windows + PowerShell, **không có Docker**.

## 2. Biến môi trường — trạng thái thật

`.env.example` ở root đã liệt kê đủ. Copy sang `backend/.env` và `frontend/.env.local`.

| Biến | Trạng thái | Bạn phải làm gì |
|---|---|---|
| `DATABASE_URL` | **Đã có** (Neon) | Dùng ngay |
| `DEEPSEEK_API_KEY` | **Đã có** | Dùng ngay |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Chưa có | Tự sinh, **hai chuỗi khác nhau**, ≥32 byte |
| `OPENALEX_MAILTO` | Chưa có | Điền email bất kỳ của chủ dự án để vào polite pool |
| `SEMANTIC_SCHOLAR_API_KEY` | **Đã có** (cấp 2026-08-16) | Dùng ngay. Vẫn phải chạy được khi thiếu — xem dưới |

**Key Semantic Scholar đã được cấp: hạn mức 1 req/s cộng dồn trên mọi endpoint, gửi ở header
`x-api-key`.** Nhưng vẫn giữ nguyên thiết kế hai chế độ — người chấm clone repo về sẽ không có key
trong `.env`. Làm đúng ba việc:

1. **Không** để thiếu key làm app không boot được. Validate env bằng zod (`@nestjs/config`) nhưng khai
   biến này là **optional**; các biến khác thiếu thì fail lúc boot.
2. `SourceClient` phải chạy đúng ở **cả hai chế độ**, quyết định lúc runtime chứ không phải lúc build:
   - **Có key** → 1 req/s ổn định.
   - **Không key** → pool chung dùng với cả thế giới, không dự đoán được (`SYSTEM_DESIGN_ANALYSIS.md`
     §1.5). Nới throttle rộng hơn, và khi gặp 429 thì **fallback sang OpenAlex ngay**, không retry dài.
   Ghi `retrieved_from` để về sau biết dòng nào đến từ provider nào.
3. **Tuyệt đối không** vì thiếu key mà cho LLM tự nghĩ ra paper. Cả hai provider chết thì trả
   `SOURCE_PROVIDER_UNAVAILABLE` và **chặn** bước B2 — đó là hành vi đúng (`STACK.md` §1 ràng buộc 2,
   NFR-G-2). Thà tắc còn hơn bịa.

Khi chủ dự án đưa key, việc duy nhất phải làm là điền vào `.env` — **không sửa dòng code nào**. Nếu
thiết kế của bạn cần sửa code lúc đó thì thiết kế sai, làm lại.

## 3. Tám ràng buộc cứng — vi phạm là hỏng deliverable

Đây là bản rút gọn của `STACK.md` §1. Đọc bản đầy đủ; giữ danh sách này trong đầu suốt dự án.

1. **Cấm hardcode prompt** trong `backend/src` và `frontend/src`. Code chỉ được **đọc file** từ `prompts/`.
2. **Cấm để LLM bịa paper.** Mọi `Source` phải có `external_id` từ Semantic Scholar / OpenAlex / arXiv thật.
3. **5 judge chạy độc lập**: 5 lời gọi riêng, context sạch, không truyền output judge này sang judge kia.
4. **Không bước nào tự chốt.** Mọi thay đổi spec đi qua `Decision` do user chọn. Mọi câu hỏi có option **"Other"**.
5. **Mọi lời gọi LLM ghi `usage`** vào DB (token, cache hit/miss, latency, attempts) — dữ liệu của deliverable #8.
6. **Mọi turn sửa file** trong `backend/` `frontend/` `prompts/` `docs/` `.claude/` `.agents/` phải ghi `prompts/dev-log/NNN__...md`.
7. **Spec sinh ra bằng tiếng Anh, UI và câu hỏi bằng tiếng Việt.** Không trộn (`STACK.md` §10).
8. **Mọi truy vấn scope theo `user_id` lấy từ token**, không nhận `owner_id` từ client. Sai là IDOR.

Thêm hai luật riêng của phiên làm việc này:

9. **Không cài dependency ngoài `STACK.md` §0.** Muốn thêm → hỏi trước, kèm lý do và phương án đã loại.
10. **Không sửa file trong `frontend/src/components/ui/`** (shadcn sinh ra) ngoài việc trỏ biến CSS về
    token. Sửa là mất khả năng chạy lại `npx shadcn add`.

## 4. Hook `prompt-guard` — biết trước để khỏi bị chặn giữa chừng

`.claude/hooks/prompt-guard.mjs` chạy khi ghi `prompts/*.md` và ở cuối mỗi turn. Hai cái bẫy hay gặp:

- **Sáu file prompt phải ra đời cùng một turn.** Hook đòi đủ `generator.md` · `judge_gap.md` ·
  `judge_contribution.md` · `judge_experiment.md` · `judge_evidence.md` · `judge_readiness.md`. Tạo
  một file rồi để đó là bị chặn ngay turn đó. (`auditor.md` là file thứ bảy, cho eval — thêm ở phase 6.)
- **Frontmatter phải hợp lệ**: đủ field, `id` khớp tên file, `updated` = ngày hôm nay, `model` dùng ID
  đầy đủ (`deepseek-v4-pro` / `deepseek-v4-flash`, **không** dùng alias `deepseek-chat`).
  `generator.md` phải yêu cầu structured JSON; `judge_evidence.md` phải đối chiếu `Source.doi`/`url` thật.

Dev-log: số thứ tự kế tiếp là **011**, tên `NNN__YYYY-MM-DDTHHMM__slug.md` (chữ `T`, không dấu hai chấm).
Prompt nguyên văn của turn nằm ở `.claude/.state/turn.json` field `prompt` — **chép từ đó**, đừng nhớ lại.

## 5. Thứ tự thi công

Bám **`ARCHITECTURE.md` §8** — bảng đó có cột *"coi là xong khi"* viết bằng thứ **quan sát được**, không
phải *"đã viết code"*. Dùng đúng cột đó làm cổng, đừng tự định nghĩa lại tiêu chí.

Tóm tắt để bạn giữ hướng: `0 Setup → 0.5 Auth → 1 Xương sống → 2 Grounding → 3 Nội dung spec →
4 Judge loop → 5 Export + nghiệm thu UI → 6 Đánh giá 3 arm → 7 Video + docs`.

**Ba luật của quy trình:**

- **Không sang phase sau khi phase trước chưa chạy end-to-end.** Pipeline xấu chạy trọn 10 bước tốt hơn
  3 bước đẹp + 7 bước rỗng.
- **Phase 6 (đánh giá) chiếm 15% và là mảng lớn nhất của điểm số.** Đừng hoãn tới cuối — đó là rủi ro
  mất điểm #1 trong kim-chỉ-nam §11.
- **Responsive không phải việc của phase 5.** Phase 5 chỉ *nghiệm thu*. `WizardShell` đủ ba tầng bố cục
  và `DecisionSheet` rỗng chạy được ở 375px là điều kiện **xong phase 0**. Mỗi phase 1–4 khi xong một
  bước wizard thì bước đó đã phải chạy được ở 375px, **không nợ sang sau**. Bọc mobile lên một UI viết
  chết theo 3 cột là viết lại, không phải chỉnh.

Đầu mỗi phase: nói ngắn gọn bạn sắp làm gì và cổng nào sẽ đóng phase đó. Cuối mỗi phase: chứng minh
cổng đã đóng bằng **kết quả chạy thật** (lệnh, ảnh chụp, dòng DB), không bằng lời khẳng định.

## 6. Giao diện — phần dễ làm hụt nhất

`DESIGN_SYSTEM.md` là nguồn sự thật. Bốn điều phải nắm trước khi viết component đầu tiên:

1. **§5.4 là bản đồ màn hình**: component nào nằm ở cột nào cho từng bước B1–B5, cộng 5 route ngoài
   wizard. Không tự bịa bố cục.
2. **§5.5 là trạng thái chờ**. Mọi lời gọi LLM mất 20–90 giây, nên **người dùng nhìn màn hình chờ nhiều
   hơn nhìn màn hình xong**. Bốn kiểu chờ và sáu luật ở đó là bắt buộc, không phải trang trí.
3. **§3 là ánh xạ trạng thái → hình dạng + màu.** Ba component `StatusChip`/`SeverityBadge`/`SupportTag`
   là **nơi duy nhất** được đọc `lib/status-style.ts`. Cấm màu inline — §7.2 có lệnh grep để tự kiểm.
4. **§6 là responsive**, và §6.10 là bảng nghiệm thu. Ba bề rộng kiểm: **375px · 768px (`md`) · 1280px
   (`xl`)**.

**Mockup là gợi ý, đề bài mới là hợp đồng.** Đề nói rõ không cần làm y hệt. `DESIGN_SYSTEM.md` §8 liệt kê
12 chỗ mockup mâu thuẫn hoặc thiếu, mỗi chỗ đã có cách xử lý. **Ba khối đề bắt buộc mà không mockup nào
vẽ — làm theo mockup là thiếu chức năng, không phải "khác thiết kế":**

- **`CardBoard`** ở cột giữa B1 — bảng thẻ 8 loại × 6 trạng thái (đề bước 2 + chức năng 3). Bỏ nó thì
  sáu `CardStatus` không xuất hiện trên màn hình nào.
- **Khối quyết định ở B3** — mockup 3 để cột phải thuần thông báo nên bước đó tự chốt, trái NFR-G-3.
- **`DisagreementNote`** ở B4 — chức năng 13 đòi cả đồng thuận **lẫn bất đồng**; mockup chỉ vẽ bảng issue.

## 7. Quyết định đã chốt — thực thi, đừng mở lại

`SYSTEM_DESIGN_ANALYSIS.md` §4.4 là danh sách đầy đủ. Chín cái hay bị làm sai nhất:

| Vấn đề | Cách làm đã chốt |
|---|---|
| 1 trong 5 judge chết | `Promise.allSettled`. Job vẫn `DONE` nếu **≥ 3/5** judge xong. Mẫu số của "đồng thuận" là **số judge xong**, không phải hằng số 5 — UI nói thẳng *"3/4 judge đồng ý (J2 lỗi)"* |
| Gộp `IssueGroup` | **Rule deterministic**, không dùng LLM. Dùng lại đúng hàm so title của verifier L0 |
| Embedding 8s giữ event loop | Chia lô 8–16 câu + nhả event loop giữa các lô + warm-up model lúc boot. **Chưa** dùng `worker_threads` |
| Hai tab cùng apply | `UNIQUE(project_id, version_no)` làm optimistic lock → `409 VERSION_CONFLICT`. Không bảng lock, không `SELECT FOR UPDATE` |
| Bấm "Xác nhận" hai lần | `Decision.applied` **chính là** khoá idempotency. Lần hai trả `409` kèm `resultingSpecVersionId` để FE điều hướng |
| Verifier fail | **Fail-closed** (không nhãn ⇒ không xuất bản). **Ngoại lệ:** Crossref chết thì **fail-open kèm cờ `DOI_UNVERIFIED`** — bất đối xứng có lý do, đọc §3.4 |
| `POST /issue-groups/:id/options` | Trả **thẳng `options[]`**, không mở job. Một lời gọi ~10s, người dùng đang đứng chờ. Sửa câu quy ước ở `ARCHITECTURE.md` §5 thành *"trừ `/estimate`, `/decisions` và `/options`"* |
| Thứ tự chạy arm khi eval | Chạy **xen kẽ theo ý tưởng**, hoán vị thứ tự arm. Thời gian chỉ là chỉ số phụ có ghi chú |
| Prompt sửa giữa batch | `score.ts` **từ chối tổng hợp** nếu một `prompt_id` có hai `prompt_hash` trong cùng batch |

**Bốn thứ vẫn chờ chủ dự án xác nhận** (`DESIGN_SYSTEM.md` §9). **Cứ làm theo mặc định dưới đây, đừng
dừng lại chờ** — nhưng nêu rõ khi bàn giao phase liên quan:

- `CardBoard` đặt ở cột giữa B1, dưới phần diễn giải (không tách thành bước riêng).
- Khối quyết định B3 gồm ba phương án: *duyệt kế hoạch · giảm quy mô theo đề xuất · Other*.
- `RoundTracker` giữ trong `SummaryBar` — tiến độ **trong một vòng**, tách khỏi `Stepper` 5 bước ở đầu trang.
- `SpecChecklist` lấy **14 mục theo đề**, không phải 10 mục như mockup 5.

**Một chỗ lệch nhỏ giữa tài liệu, đã biết:** `ARCHITECTURE.md` §8 phase 5 ghi kiểm ở 1440px, còn
`DESIGN_SYSTEM.md` §6.1 chốt 1280px (`xl`). Lấy **1280px** — rộng hơn `xl` thì bố cục không đổi nữa.

## 8. Tự kiểm — chạy trước khi tuyên bố xong bất cứ phase nào

```bash
# 1. Không hardcode prompt trong source (STACK §1.1) → phải rỗng
grep -rniE "you are an?|hãy đóng vai|system prompt" backend/src frontend/src \
  --include=*.ts --include=*.tsx

# 2. Không màu thô trong component (DESIGN_SYSTEM §7.2) → phải rỗng
grep -rnE "(bg|text|border|ring|from|to)-(red|green|blue|yellow|orange|purple|violet|amber|slate|gray|zinc|emerald|sky)-[0-9]{2,3}" \
  frontend/src/app frontend/src/components --include=*.tsx | grep -v "frontend/src/components/ui/"

# 3. Không console.log trong source backend (backend/CLAUDE.md) → phải rỗng
grep -rn "console\.log" backend/src --include=*.ts

# 4. Lint + build cả hai project
cd backend && npm run lint && npm run build
cd frontend && npm run lint && npm run build
```

**Bằng chứng judge độc lập** (phase 4, đề bài chấm thẳng vào đây): 5 bản ghi `JudgeRun` **cùng
`input_digest`** · **khác `raw_output`** · `started_at` chênh nhau dưới 1 giây. Viết thêm một test tự
động khẳng định đầu vào của J2 **không chứa** đầu ra của J1. Đây là khác biệt giữa *"tôi có gọi 5 lần
riêng"* và *"tôi chứng minh được 5 lần đó riêng"*.

**Nghiệm thu responsive** (mỗi phase 1–4, không đợi phase 5): chạy đủ checklist `DESIGN_SYSTEM.md` §6.10
ở 375px · 768px · 1280px cho bước wizard vừa làm xong.

## 9. Cách làm việc

- **Làm thật, đừng hỏi vặt.** Quyết định thường ngày tự quyết theo tài liệu. Chỉ dừng lại hỏi khi:
  (a) hai tài liệu mâu thuẫn nhau, (b) cần dependency ngoài `STACK.md` §0, (c) một ràng buộc cứng ở §3
  buộc phải phá mới đi tiếp được.
- **Báo cáo trung thực.** Test fail thì nói fail kèm output. Bỏ qua bước nào thì nói rõ bỏ bước nào và
  vì sao. Không tuyên bố "đã xong" cho thứ chưa chạy được.
- **Commit theo phase, prompt đi cùng code dùng nó trong cùng một commit** (rule §Commit). Không đưa
  `prompts/` vào `.gitignore`.
- **Ghi dev-log ở cuối mọi turn có sửa file** trong `backend/` `frontend/` `prompts/` `docs/` `.claude/`
  `.agents/`. Turn chỉ đọc, chỉ hỏi–đáp thì không ghi.
- **Đang ở branch `main`.** Tạo branch trước khi commit nếu chủ dự án chưa nói khác.

## 10. Bắt đầu

Việc đầu tiên: đọc hết §0, rồi trả lời gọn bốn câu **trước khi viết code**:

1. Bạn hiểu 16 chức năng bắt buộc gồm những gì, và mỗi cái nằm ở màn hình nào?
2. Ba deliverable dễ mất điểm nhất là gì, và bạn định làm chúng ở phase nào?
3. Bốn ràng buộc kiến trúc nào **không thể** sửa sau khi đã viết nhiều code?
4. Cổng đóng phase 0 gồm những gì, và bạn định chứng minh từng cái bằng cách nào?

Trả lời xong thì bắt đầu **phase 0**. Đừng lên kế hoạch cho cả 8 phase ngay — làm xong phase 0, chứng
minh cổng đã đóng, rồi mới sang phase tiếp theo.
