# Naumi — production image (Next.js standalone).
# Build:  docker build -t naumi .
# Run:    see docker-compose.yml (recommended: bundles Postgres + data volume)

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 可选:接自托管 GoTrue/Supabase 认证时按实例传入(NEXT_PUBLIC_* 是构建期内联,
# 运行时 env 无效)。留空 = 单机模式(默认),与原行为完全一致。
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
# 白标品牌(构建期内联):站名 / 联系邮箱 / Logo 路径,见 src/lib/brand.ts。
ARG NEXT_PUBLIC_BRAND_NAME=
ARG NEXT_PUBLIC_BRAND_EMAIL=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME \
    NEXT_PUBLIC_BRAND_EMAIL=$NEXT_PUBLIC_BRAND_EMAIL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runner
WORKDIR /app
# 构建版本号(CI 传入 date +%s):后台"检查更新"用它跟官方站比对。
ARG BUILD_VERSION=0
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MEDIA_DIR=/data/media \
    BUILD_VERSION=$BUILD_VERSION

# Non-root user
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/scripts/video-worker.mjs ./scripts/video-worker.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/rotate-settings-secret.mjs ./scripts/rotate-settings-secret.mjs

# Local media storage (used when R2 is not configured)
RUN mkdir -p /data/media && chown -R nextjs:nodejs /data
VOLUME /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
