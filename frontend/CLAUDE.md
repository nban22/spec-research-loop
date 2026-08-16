@AGENTS.md

# RULE — code style frontend (Next.js + Tailwind v4 + shadcn)

Chỉ nói *viết code thế nào*. Token màu/chữ, component inventory, bố cục responsive →
`docs/DESIGN_SYSTEM.md`. Chọn thư viện gì, cấm cài gì → `docs/STACK.md` §5, §8. Đừng chép hai file đó vào đây.

`AGENTS.md` ở trên do `next dev` tự sinh — không sửa, không xoá.

## 0. Đã có sẵn — dùng, đừng dựng lại

| Thứ | Trạng thái |
|---|---|
| ESLint | `eslint.config.mjs` — `next/core-web-vitals` + `next/typescript`. Chạy `npm run lint` |
| tsconfig | `strict: true`, alias `@/*` → `./src/*`. Import bằng `@/`, không `../../..` |
| Tailwind | v4, cấu hình bằng `@theme` trong `globals.css`. **Không** tạo `tailwind.config.js` |
| Prettier | **chưa có** (backend đã có) — §8 |

## 1. Đặt tên & export

- File component `kebab-case.tsx` (`judge-panel.tsx`), tên component `PascalCase`.
- Named export cho component; `export default` **chỉ** cho `page.tsx` / `layout.tsx` / `route.ts` (Next bắt buộc).
- Prop type `type JudgePanelProps = { … }`, khai ngay trên component. Không `React.FC`.
- Không dựng file `index.ts` re-export gom cả folder — import thẳng đường dẫn thật.
- Chuỗi UI viết thẳng tiếng Việt trong component, không hệ i18n (STACK §5).

## 2. Server / Client Component

- Mặc định là Server Component. `'use client'` chỉ đặt ở **component lá** cần state / effect / event handler.
- Không đặt `'use client'` ở `layout.tsx` và `page.tsx` — nó kéo cả cây xuống client.
- Không import module chỉ chạy được ở server vào file có `'use client'`.

## 3. Dữ liệu

- Server data → **TanStack Query**. Zustand **chỉ** UI state: bước stepper, panel đang mở, filter bảng issue.
  Copy dữ liệu server vào Zustand là sai (STACK §5).
- Query key dạng mảng phân cấp: `['projects']` · `['projects', id]` · `['spec-versions', id, 'issues']`.
  Đổi dữ liệu xong thì `invalidateQueries` đúng nhánh, không `invalidateQueries()` trống.
- Không fetch trong `useEffect`.
- Mọi lời gọi API đi qua `lib/api.ts`. Cấm `fetch()` trực tiếp trong component.
  Đường dẫn luôn tương đối `/api/...` (rewrites của Next) — không hardcode `localhost:3001`.
- Lỗi: đọc `code` rồi map qua `lib/error-code.ts`. Cấm phân nhánh logic bằng `message` (STACK §3.1 luật 3).
- SSE: `EventSource('/api/jobs/:id/stream')`, đóng stream trong cleanup của `useEffect`.

## 4. Style

- Chỉ Tailwind class. Cấm `style={{ color: … }}`, cấm hex trong `.tsx` (DS §7.2).
- Class màu thô (`bg-red-50`, `text-green-600`, …) chỉ được xuất hiện ở `lib/status-style.ts` và
  `components/ui/`. Nơi khác render `<StatusChip>` / `<SeverityBadge>` / `<SupportTag>`.
- Ánh xạ enum → class khai kiểu `Record<CardStatus, StatusStyle>` ở **một** file `lib/status-style.ts` (DS §7.1).
- **Mobile-first**: class không tiền tố = mobile; bố cục cấp trang chỉ dùng `md:` và `xl:` (DS §7.3).
- Giữ nguyên thang breakpoint mặc định của Tailwind. Không khai `--breakpoint-*`, không xoá mốc nào.
- Kích thước nút lấy từ prop `size` của shadcn `Button`, không tự khai `h-*`.
- Nối class có điều kiện bằng `cn()` của shadcn, không nối chuỗi bằng template literal.

## 5. `components/ui/` — vùng shadcn

Sinh bằng `npx shadcn add`. Không sửa để "chuẩn hoá" style/breakpoint — sửa là mất khả năng chạy lại
lệnh add mà không xung đột. Cần khác đi thì bọc một component của ta ở `components/`.

## 6. Ngôn ngữ hiển thị

- Nhãn UI, nút, nav, thông báo lỗi, câu hỏi làm rõ: **tiếng Việt**.
- Nội dung 14 mục spec + nhận xét judge: render **nguyên văn tiếng Anh** backend trả về. FE không dịch,
  không viết hoa lại (STACK §10 — dịch ở FE làm lệch cái verifier đã chấm).

## 7. Chất lượng UI

- Phần tử bấm được phải là `<button>` / `<a>` thật, không `<div onClick>`.
- Không đặt thông tin **chỉ** trong `:hover` hoặc `title=` — cảm ứng không có hover (DS §6.7).
- Mọi input có `<label>` gắn `htmlFor`.
- Ảnh dùng `next/image`, font dùng `next/font`. Không `<img>` trần, không `@import` font trong CSS.
- Không dark mode, không animation phức tạp (STACK §5).
- Danh sách render phải có `key` ổn định từ id, không dùng index.

## 8. Cần chốt (chưa cấu hình)

- [ ] Chưa có Prettier ở `frontend/` trong khi `backend/` có → hai project format lệch nhau
      (backend `singleQuote`, frontend đang là double quote).
- [ ] `next.config.ts` chưa khai `rewrites()` cho `/api/:path*` → `http://localhost:3001/:path*` (STACK §5).
      Thiếu cái này thì cookie auth và SSE không chạy.
- [ ] `globals.css` vẫn là scaffold mặc định: còn block `prefers-color-scheme: dark` và
      `font-family: Arial` — trái với "không dark mode" và token ở DS §2.
- [ ] Chưa có `lib/`, `stores/`, `components/` theo cấu trúc STACK §3.
