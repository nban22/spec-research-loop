# RULE — code style backend (NestJS)

Chỉ nói *viết code thế nào*. Chọn công nghệ gì → `docs/STACK.md`. ERD, API surface → `docs/ARCHITECTURE.md`.
Đừng chép nội dung hai file đó vào đây.

## 0. Đã có sẵn — dùng, đừng dựng lại

| Thứ | Trạng thái |
|---|---|
| ESLint | `eslint.config.mjs` — `recommendedTypeChecked` + `prettier/recommended`. Chạy `npm run lint` |
| Prettier | `.prettierrc` — `singleQuote`, `trailingComma: all`. Chạy `npm run format`. **Không** tự đặt style khác |
| Test | Jest, `rootDir: src`, `testRegex: *.spec.ts`; e2e ở `test/` |
| tsconfig | `strictNullChecks` + `noImplicitAny` bật; `strict` đầy đủ **chưa** bật (§9) |

## 1. Đặt tên

- File: `kebab-case.<vai>.ts` — `judge.service.ts` · `judge.controller.ts` · `judge.module.ts` ·
  `jwt-auth.guard.ts` · `zod-validation.pipe.ts`. Một file một vai.
- Class `PascalCase`, hàm/biến `camelCase`, hằng module-level `SCREAMING_SNAKE`.
- Zod: `cardSchema` + `export type Card = z.infer<typeof cardSchema>`. Tên type = tên domain, không hậu tố `Dto`.
- Field DB giữ `snake_case` đúng như Prisma schema — **không** đổi sang camelCase ở tầng nào.
- Giá trị enum `SCREAMING_SNAKE`, khớp 1-1 Prisma ↔ zod ↔ `frontend/src/lib/types.ts` (STACK §3.1).

## 2. Ranh giới tầng

- 1 feature = 1 folder = `*.module.ts` + `*.controller.ts` + `*.service.ts` (+ `*.spec.ts` cạnh file).
- **Controller mỏng**: parse input → gọi service → trả DTO. Không nghiệp vụ, không Prisma.
- **Service không biết HTTP**: không nhận `Request`/`Response`, không set cookie, không đọc header.
  Cần user thì nhận `userId: string` làm tham số. Lý do: `eval/run-eval.ts` gọi thẳng service, không qua HTTP (STACK §11.3 luật 5).
- Service gọi service khác qua DI. Cấm `new` service bằng tay, cấm `new PrismaClient()` — luôn inject `PrismaService`.
- Type dùng chung sống ở `src/contracts/`, không ở feature folder. Feature import từ `contracts/`, không import chéo nhau.

## 3. Validate & type

- **Zod là hệ validation duy nhất.** `class-validator` / `class-transformer` bị cấm (STACK §8).
- Mọi input từ ngoài (body, query, param, response của API bên thứ ba, output LLM) phải `safeParse`
  trước khi dùng. Dữ liệu chưa parse thì kiểu là `unknown`.
- Dùng `unknown` + narrow, không dùng `any`. (ESLint tắt `no-explicit-any` để khỏi ồn với type của thư viện —
  không phải giấy phép dùng `any` trong code của ta.)
- `no-floating-promises` đang là `warn` — coi như `error`: mọi Promise phải `await` hoặc `return`.
- Không `as` để ép kiểu qua mặt compiler. Cần thu hẹp thì viết type guard.

## 4. Lỗi

- Throw exception của Nest (`NotFoundException`, `BadRequestException`, …) với payload
  `{ code, message, details? }`, `code` **phải** thuộc enum `ErrorCode` trong `contracts/error-code.ts`.
- Cấm ném chuỗi tự do, cấm để FE parse `message` (STACK §3.1 luật 3).
- Tài nguyên của user khác → **404**, không phải 403 (STACK §11.3 luật 2).
- Một `AllExceptionsFilter` duy nhất chuẩn hoá response lỗi. Không try/catch rải rác để đổi format.
- Chỉ bắt lỗi khi thật sự xử lý được. Bắt để `console.log` rồi ném lại = xoá stack, đừng làm.

## 5. Bảo mật — không thương lượng

- `userId` **chỉ** từ `req.user.sub`. Không đọc `user_id`/`owner_id` từ body/query/param.
- Mọi truy vấn `Project` kèm `where: { user_id }`; bảng con join qua `Project` để check quyền.
- `select`/`omit` tường minh khi trả về FE — không bao giờ để `password_hash`, `refresh_token_hash` lọt ra.
- Không log API key, cookie, password, prompt đầy đủ.

## 6. LLM & prompt

- Cấm chuỗi prompt trong `src/` (rule prompt-audit). Prompt đọc từ `prompts/` qua `PromptLoaderService`.
- Mọi lời gọi LLM đi qua `LlmService.completeJson` (STACK §2.4). `client.chat.completions.create`
  chỉ được xuất hiện trong `src/llm/`.
- Mỗi lời gọi ghi `usage` + `attempts` + latency vào DB (STACK §1 luật 5). Không có ngoại lệ "tạm thời".
- 5 judge: 5 lời gọi độc lập, `Promise.all`, không truyền output judge này sang judge kia.

## 7. Prisma

- `Json` native, không `JSON.stringify` thủ công.
- Migration bằng `prisma migrate dev`, commit `migrations/`.
- Truy vấn trong service, không trong controller. Không viết raw SQL trừ khi có lý do ghi trong comment.
- Sửa enum ở `contracts/` → sửa `schema.prisma` **và** `frontend/src/lib/types.ts` + `status-style.ts`
  trong **cùng commit**.

## 8. Log · config · test

- `Logger` của Nest, context = tên class. Cấm `console.log` trong `src/`.
- `process.env` chỉ đọc ở tầng khởi tạo (`main.ts`, provider, config module) — service nghiệp vụ nhận
  giá trị qua DI. Thiếu biến môi trường thì fail lúc boot, không fail giữa request.
- Test bắt buộc cho logic thuần: verifier scoring, diff, estimator. Service có I/O thì mock Prisma/LLM.
- Test đặt tên theo hành vi: `it('trả 404 khi project thuộc user khác')`.

## 9. Cần chốt (chưa cấu hình)

- [ ] `tsconfig.json` chưa bật `"strict": true` — hiện chỉ có `strictNullChecks` + `noImplicitAny`.
- [ ] Chưa có path alias (`@/*` hoặc `src/*`) → import sâu sẽ thành `../../..`.
- [ ] `no-floating-promises` và `no-unsafe-argument` đang là `warn`; nên nâng `error` trước giai đoạn 1.
