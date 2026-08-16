# syntax=docker/dockerfile:1.7
# Multi-stage build cho backend NestJS của SpecResearch Loop.
#
# ⚠ BUILD CONTEXT LÀ **GỐC REPO**, không phải `backend/`:
#     docker build -f backend/Dockerfile .
#   Vì `prompts/` (deliverable #5) là thư mục **anh em** của `backend/`, và nếu nó không nằm
#   trong image thì app vẫn boot, /health vẫn xanh, nhưng **mọi lời gọi LLM ném ENOENT**.
#
# ⚠ KHÔNG DÙNG ALPINE: image này chạy Chromium (Puppeteer → xuất PDF). Chromium trên musl rất
#   khổ. Prisma 7 thì đã không còn engine binary native (driver adapter + query compiler) nên
#   *không phải* Prisma bắt dùng Debian — chỉ Chromium thôi.
#
# Kết quả: ~700 MB (phần lớn là Chromium + model embedding), chạy `node dist/main.js` ở cổng 3001.

# ---------- 1. Cài toàn bộ deps (kể cả dev) để build được ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
# Puppeteer sẽ dùng Chromium của hệ thống ở stage runtime → không tải Chrome riêng (~150 MB).
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --no-audit --no-fund

# ---------- 2. Sinh Prisma Client + build NestJS ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
# `prisma generate` phải chạy **trong image**, không tin vào client đã commit sẵn:
# client sinh ra phải khớp đúng phiên bản Prisma trong `node_modules` của image này.
RUN npx prisma generate && npm run build

# ---------- 3. Deps production, layer sạch ----------
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY backend/package.json backend/package-lock.json ./
RUN npm pkg delete scripts.prepare \
  && npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ---------- 4. Nướng sẵn model embedding (~90 MB) vào image ----------
# Không có stage này thì mỗi container mới lại tải lại model từ HuggingFace ở request đầu tiên,
# và **chết hẳn** nếu máy chủ không ra được internet. Nướng sẵn ⇒ runtime không cần egress ra HF.
FROM node:22-bookworm-slim AS model
WORKDIR /app
ENV TRANSFORMERS_CACHE=/app/.cache/transformers
COPY --from=prod-deps /app/node_modules ./node_modules
RUN mkdir -p "$TRANSFORMERS_CACHE" && node -e "\
  import('@xenova/transformers').then(async (m) => { \
    m.env.allowLocalModels = false; \
    m.env.cacheDir = process.env.TRANSFORMERS_CACHE; \
    await m.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'); \
    console.log('model cached'); \
  }).catch((e) => { console.error(e); process.exit(1); })"

# ---------- 5. Image runtime ----------
FROM node:22-bookworm-slim AS runner
# chromium: động cơ xuất PDF.
# fonts-noto-core + fonts-liberation: **bắt buộc**. `wrapDocument()` khai font
#   "Segoe UI / Helvetica Neue / Arial" — trên Linux không có cái nào, và không có font Unicode
#   phủ tiếng Việt thì tiêu đề trong PDF ra ô vuông tofu.
# tini: nhận PID 1, chuyển tín hiệu, thu xác tiến trình con Chromium (nếu không sẽ đầy zombie).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium tini \
      fonts-liberation fonts-noto-core \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TRANSFORMERS_CACHE=/app/.cache/transformers \
    PROMPTS_DIR=/app/prompts

RUN groupadd -r nodejs && useradd -r -g nodejs -m nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules        ./node_modules
COPY --from=builder   --chown=nestjs:nodejs /app/dist                ./dist
COPY --from=builder   --chown=nestjs:nodejs /app/package.json        ./package.json
COPY --from=model     --chown=nestjs:nodejs /app/.cache/transformers ./.cache/transformers

# Deliverable #5 — mà không có nó thì mọi lời gọi LLM chết. Xem chú thích đầu file.
COPY --chown=nestjs:nodejs prompts/ ./prompts/

USER nestjs
EXPOSE 3001

# `embedder_ready` **cố ý không** nằm trong điều kiện healthy: model nạp mất vài giây lúc boot,
# gắn nó vào đây thì container không bao giờ healthy ở lần deploy đầu.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
