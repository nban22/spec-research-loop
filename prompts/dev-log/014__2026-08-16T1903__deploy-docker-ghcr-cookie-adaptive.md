---
stt: 014
timestamp: 2026-08-16T19:03+07:00
model: claude-opus-5
scope: [backend, frontend, deploy, .github/workflows, .dockerignore]
---

## Prompt
tham khảo D:\VSCODE\KaikunAI\kaikunai-backend\.github\workflows\deploy.yml, D:\VSCODE\KaikunAI\kaikunai-backend\Dockerfile, D:\VSCODE\KaikunAI\kaikunai-frontend\.github\workflows\deploy.yml, D:\VSCODE\KaikunAI\kaikunai-frontend\Dockerfile nhé, 4 files này là setup cho repo backend riêng frontend riêng, và chung server linux mà tôi sắp tới sẽ deploy specresearch_loop, specresearch_loop là cùng 1 repo, khác chỉ có thế, đọc rồi tham khảo pattern, syntax, để giúp tôi setup workflow và 2 dockerfile cho phù hợp với dự án specresearch_loop của tôi nhé (research và chú ý các điều bạn notes ở trên nhé), về domain sẽ là https://dsa-bus-booking.io.vn/ và https://api.dsa-bus-booking.io.vn/ nhé, nên cần cấu hình lại cookie sao cho auth suit, work better nhé, adaptive nhé

## Kết quả
Thêm hạ tầng deploy theo pattern của kaikunai, chỉnh cho monorepo: `backend/Dockerfile`
(bookworm-slim vì Chromium, nướng sẵn model embedding, COPY `prompts/`, build context = gốc repo),
`frontend/Dockerfile` (alpine + standalone, `NEXT_PUBLIC_API_BASE` là build-arg), hai workflow
GHCR có `paths:` filter + job `migrate` chạy `prisma migrate deploy` trước khi đổi container,
`deploy/` (compose + Caddyfile không buffer SSE + .env.example), `.dockerignore`.
Cookie/CORS chuyển thành **adaptive theo env** (`COOKIE_DOMAIN`/`COOKIE_SAMESITE`/`COOKIE_SECURE`/
`CORS_ORIGINS`) để hai subdomain vẫn giữ được `SameSite=Lax`; FE thêm `apiUrl()` và
`EventSource` dùng `withCredentials`. Đã kiểm chứng bằng cách chạy hai cấu hình song song.
