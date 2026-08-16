# SpecResearch Loop

Biến **một ý tưởng nghiên cứu mơ hồ** thành **bản Research Specification 14 mục** đã qua phản biện
của 5 Judge độc lập, trong đó **mọi khẳng định đều truy được về một paper có thật đã được máy kiểm
chứng**, và **không bước nào tự chốt thay người dùng**.

- Đặc tả gốc: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md`
- Công nghệ: `docs/STACK.md` · ERD/API/thuật toán: `docs/ARCHITECTURE.md`
- Giao diện: `docs/DESIGN_SYSTEM.md` · Đánh đổi & điểm vỡ: `docs/SYSTEM_DESIGN_ANALYSIS.md`

---

## Chạy từ máy trắng

**Yêu cầu:** Node.js ≥ 20.9 · một PostgreSQL có sẵn (dự án dùng Neon — **không cần Docker**).

### 1. Biến môi trường

```bash
cp .env.example backend/.env          # rồi điền giá trị thật
echo "BACKEND_ORIGIN=http://localhost:3001" > frontend/.env.local
```

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Connection string Postgres |
| `DEEPSEEK_API_KEY` | ✅ | https://platform.deepseek.com |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✅ | ≥ 32 ký tự, **hai chuỗi khác nhau** |
| `OPENALEX_MAILTO` | ✅ | Email bất kỳ, để vào polite pool |
| `SEMANTIC_SCHOLAR_API_KEY` | ❌ | **Tuỳ chọn.** Key dạng `s2k-…`, gửi ở header `x-api-key`. Có key → 1 req/s ổn định (cộng dồn mọi endpoint); không key → dùng pool chung, gặp 429 thì tự fallback sang OpenAlex. Điền key vào `.env` là đủ, **không phải sửa dòng code nào** |

Thiếu biến bắt buộc thì app **fail ngay lúc boot**, không fail giữa request.

### 2. Backend (cổng 3001)

```bash
cd backend
npm install
npx prisma migrate deploy      # hoặc `npx prisma migrate dev` khi phát triển
npx prisma generate
npm run seed                   # tài khoản hệ thống eval@local
npm run build && npm run start:prod
```

### 3. Frontend (cổng 3000)

```bash
cd frontend
npm install
npm run dev                    # hoặc: npm run build && npm start
```

Mở **http://localhost:3000** → đăng ký một tài khoản → nhập ý tưởng.

> Frontend proxy `/api/*` sang backend bằng `rewrites()` của Next.js, nên trình duyệt thấy hai bên
> **cùng origin**. Đó là điều kiện để cookie auth chạy `SameSite=Lax` và để `EventSource` (SSE)
> mang được cookie — `EventSource` không set được header `Authorization`.

Lần chạy đầu, backend tải model embedding `all-MiniLM-L6-v2` (~90 MB) và cache vào
`backend/.cache/transformers`. Kiểm tình trạng: `curl http://localhost:3001/health`.

---

## Đi hết một vòng

| Bước | Bạn làm gì | Hệ thống làm gì |
| --- | --- | --- |
| **B1** Nhập ý tưởng & Làm rõ | Nhập ý tưởng thô, trả lời 2–4 câu hỏi làm rõ | Diễn giải lại, phân rã thành thẻ **8 loại × 6 trạng thái** |
| **B2** Nghiên cứu & Gap | Sửa từ khoá, chọn hướng nghiên cứu | Gọi Semantic Scholar → OpenAlex lấy paper **thật**, dựng bảng related work, rút gap trả lời đủ **4 câu hỏi** |
| **B3** Contribution & Thí nghiệm | Duyệt kế hoạch hoặc giảm quy mô | Sinh Claim–Evidence **5 trường** (có *Điều kiện bác bỏ*), kế hoạch TN1…TNn, ước lượng VRAM/thời gian/token/chi phí |
| **B4** Judge & Sửa spec | Chọn A/B/C/**Other** cho từng vấn đề, xem diff, xác nhận | **5 Judge chạy độc lập**, gộp issue, tạo phiên bản mới bất biến |
| **B5** Spec cuối | Xuất PDF / Markdown | Chặn xuất bản nếu còn trích dẫn `UNSUPPORTED` |

---

## Bộ đánh giá 3 arm

```bash
cd backend
npm run eval:run   -- --batch=<uuid> --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10 --resume
npm run eval:score -- --batch=<uuid>
npm run eval:audit -- --batch=<uuid>
```

| Arm | Là gì | Đo được gì |
| --- | --- | --- |
| `B1` | Single-shot: một prompt → spec 14 mục | Sàn dưới |
| `B2` | Pipeline đầy đủ **trừ** vòng judge | `B1→B2` = đóng góp của retrieval + phân rã có cấu trúc |
| `SYS` | Hệ đầy đủ: 5 judge + vòng sửa + verifier gate | `B2→SYS` = đóng góp của vòng judge |
| `SYS_NO_VERIFY` | `SYS` nhưng tắt gate | `SYS−V→SYS` = đóng góp của citation verifier |

Kết quả ghi vào `backend/eval/results/` (commit vào git) và tổng hợp ở
`docs/evaluation_report.md`.

> Script eval **biên dịch trước rồi chạy bằng node**, không chạy thẳng bằng `tsx`: `tsx` dựa trên
> esbuild, mà esbuild không phát `emitDecoratorMetadata` — thiếu metadata đó thì DI của NestJS
> hỏng hoàn toàn. Lý do đầy đủ ở `backend/tsconfig.eval.json`.

---

## Kiểm tra chất lượng

```bash
# Không hardcode prompt trong source — phải rỗng
grep -rniE "you are an?|hãy đóng vai|system prompt" backend/src frontend/src --include=*.ts --include=*.tsx

# Không màu thô trong component — phải rỗng
grep -rnE "(bg|text|border|ring|from|to)-(red|green|blue|yellow|orange|purple|violet|amber|slate|gray|zinc|emerald|sky)-[0-9]{2,3}" \
  frontend/src/app frontend/src/components --include=*.tsx | grep -v "frontend/src/components/ui/"

cd backend  && npm run lint && npm run build && npx jest
cd frontend && npm run lint && npm run build
```

**Bằng chứng 5 Judge chạy độc lập** — đọc thẳng từ dữ liệu, không phải lời hứa:

```bash
cd backend && npx tsx scripts/db-peek.ts judges <specVersionId>
```

Ba dấu hiệu phải cùng đúng: 5 `JudgeRun` **cùng `input_digest`** · **khác `raw_output`** ·
`started_at` chênh nhau **dưới 1 giây**. Giao diện ở bước 4 cũng hiện đúng ba cột đó.
Test tự động tương ứng: `src/judge/judge-independence.spec.ts`.

---

## Cấu trúc

```
backend/          NestJS · Prisma · DeepSeek · verifier 5 tầng · eval harness
  src/contracts/  nguồn sự thật của mọi type (zod) — FE khai lại thủ công
  src/verifier/   deliverable #6 — citation verifier
  eval/           deliverable #4 (ideas.json) + #7 (arm B1/B2) + #8 (metric)
frontend/         Next.js 16 · Tailwind v4 · shadcn/ui · TanStack Query
prompts/          deliverable #5 — prompt runtime, KHÔNG gitignore
docs/             kiến trúc, design system, phân tích thiết kế, báo cáo đánh giá
```
