# Setup Claude Code (bắt buộc, làm 1 lần sau khi clone)

Repo đã commit sẵn `.mcp.json` + `.claude/settings.json`. Hai file đó chỉ **khai báo**, không tự cài. Mỗi máy vẫn phải chạy 3 bước dưới.

## 1. Cài LSP binary (global npm)

```bash
npm install -g typescript-language-server typescript
```

Thiếu bước này plugin sẽ báo `Executable not found in $PATH`.

## 2. Cài plugin trong Claude Code

```bash
claude plugin install typescript-lsp@claude-plugins-official
```

Hoặc gõ `/plugin install typescript-lsp@claude-plugins-official` trong session, rồi `/reload-plugins`.

## 3. Approve MCP server

Mở Claude Code ở root repo → nó hỏi trust `.mcp.json` (server `context7`) → **Allow**.
Lỡ bấm Deny thì chạy `claude mcp reset-project-choices` rồi mở lại.

Kiểm tra: `claude mcp list` phải thấy `context7 - ✓ Connected` và `next-devtools - ✓ Connected`.

---

## 4. Cài source base (đã scaffold sẵn trong repo)

```bash
cd frontend && npm install   # Next.js 16.3.1 — App Router, TS, Tailwind v4, ESLint, src/
cd backend  && npm install   # NestJS 11 — TypeScript strict
```

Chạy dev:

```bash
cd frontend && npm run dev          # http://localhost:3000
cd backend  && npm run start:dev    # http://localhost:3001 (đổi PORT trong src/main.ts nếu cần)
```

---

## Next.js DevTools MCP (`next-devtools`)

Đã khai báo trong `.mcp.json`, không cần cài gì thêm (chạy qua `npx`).

**Bắt buộc: phải có dev server Next.js đang chạy** thì 2 tool runtime mới hoạt động — Next 16 tự bật endpoint `http://localhost:3000/_next/mcp`.

4 tool nó cung cấp:

| Tool | Việc |
|---|---|
| `nextjs_index` | Quét port, liệt kê dev server đang chạy + các tool runtime của nó |
| `nextjs_call` | Gọi tool runtime (`get_errors`, `get_routes`, `get_logs`, `get_page_metadata`, `get_request_insights`, …) |
| `nextjs_docs` | Trỏ tới docs đúng version tại `node_modules/next/dist/docs/` (không cần dev server) |
| `browser_eval` | Trỏ tới CLI `agent-browser` để tự động hóa trình duyệt (không cần dev server) |

Lưu ý tham số của `nextjs_call`: `port` là **string** (`"3000"`), `toolName` là tên tool lấy từ `nextjs_index`, `args` là **object**.

---

## Tùy chọn: Context7 API key

Mặc định chạy không cần key (rate limit thấp). Muốn nới limit:

1. Vào https://context7.com/dashboard → đăng nhập (OAuth: GitHub/Google).
2. Tạo API key, copy.
3. Đăng ký key cho Claude Code bằng **local scope** (lưu ở `~/.claude.json`, không vào git). Local đè project, nên `.mcp.json` chung giữ nguyên:

   ```bash
   claude mcp add --scope local context7 -- npx -y @upstash/context7-mcp --api-key ctx7sk-...
   ```

   Sau đó `claude mcp list` sẽ cảnh báo "Conflicting scopes" — **bình thường**, chỉ là thông báo local đang đè project.

4. Copy `.env.example` → `.env` và điền key (app code dùng sau này; `.env` đã gitignore).

**Không bao giờ commit key thật vào `.mcp.json`.**
