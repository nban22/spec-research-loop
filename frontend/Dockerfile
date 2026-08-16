# syntax=docker/dockerfile:1.7
# Multi-stage build cho frontend Next.js 16 (standalone output).
#
# ⚠ BUILD CONTEXT LÀ **GỐC REPO** cho đồng bộ với backend:
#     docker build -f frontend/Dockerfile .
#
# ⚠ NEXT_PUBLIC_* được **nướng vào bundle JS lúc BUILD**, không đọc lúc container khởi động.
#   Nên `NEXT_PUBLIC_API_BASE` phải truyền bằng `--build-arg`, và prod/beta là **hai image thật
#   sự khác nhau**. Đặt nó vào `environment:` của container sẽ không có tác dụng gì.
#
# Kết quả: ~180 MB Alpine, chạy `node server.js` ở cổng 3000.

# ---------- 1. Cài deps ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 2. Build Next standalone ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

# URL công khai — khai bằng ARG để truyền qua --build-arg.
# Để TRỐNG = FE gọi `/api/*` và `rewrites()` proxy sang backend (cùng origin, không CORS).
# Đặt giá trị = FE gọi thẳng `https://api.<domain>` (cần CORS + cookie Domain ở backend).
ARG NEXT_PUBLIC_API_BASE=""

# BACKEND_ORIGIN chỉ dùng cho `rewrites()`, **đọc lúc server khởi động** chứ không phải lúc build
# — nhưng vẫn khai ở đây để build log ghi lại giá trị đã dùng.
ARG BACKEND_ORIGIN="http://backend:3001"

ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    BACKEND_ORIGIN=${BACKEND_ORIGIN} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ---------- 3. Image runtime ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# standalone gói sẵn đúng những file cần lúc chạy
COPY --from=builder                        /app/public           ./public
COPY --from=builder --chown=nextjs:nodejs  /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs  /app/.next/static     ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
