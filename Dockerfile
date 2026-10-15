# Naumi — production image (Next.js standalone).
# Build:  docker build -t naumi .
# Run:    see docker-compose.yml (recommended: bundles Postgres + data volume)

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/patch-next-body.mjs ./scripts/patch-next-body.mjs
RUN npm ci

# ── build ───────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG BUILD_VERSION=0
ARG SOURCE_COMMIT=
ARG NEXT_PUBLIC_CANVAS_PERF_PROBE=0
ENV NEXT_PUBLIC_CANVAS_PERF_PROBE=$NEXT_PUBLIC_CANVAS_PERF_PROBE
ARG BUILD_NODE_OPTIONS=
ARG NAUMI_BUILD_CPUS=
ENV NODE_OPTIONS=$BUILD_NODE_OPTIONS NAUMI_BUILD_CPUS=$NAUMI_BUILD_CPUS
ARG DESKTOP_UI_BUILD=0
ARG ENTERPRISE_UI_BUILD=0
ENV DESKTOP_UI_BUILD=$DESKTOP_UI_BUILD
ENV ENTERPRISE_UI_BUILD=$ENTERPRISE_UI_BUILD
ENV BUILD_VERSION=$BUILD_VERSION SOURCE_COMMIT=$SOURCE_COMMIT
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 可选:接自托管 GoTrue/Supabase 认证时按实例传入(NEXT_PUBLIC_* 是构建期内联,
# 运行时 env 无效)。留空 = 单机模式(默认),与原行为完全一致。
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_MEDIA_VARIANTS=0
# 白标品牌(构建期内联):站名 / 联系邮箱 / Logo 路径,见 src/lib/brand.ts。
ARG NEXT_PUBLIC_BRAND_NAME=
ARG NEXT_PUBLIC_BRAND_EMAIL=
ARG NEXT_PUBLIC_PHONE_EMAIL_DOMAIN=
ARG NEXT_PUBLIC_CLOUD_BUY_URL=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_MEDIA_VARIANTS=$NEXT_PUBLIC_MEDIA_VARIANTS \
    NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME \
    NEXT_PUBLIC_BRAND_EMAIL=$NEXT_PUBLIC_BRAND_EMAIL \
    NEXT_PUBLIC_PHONE_EMAIL_DOMAIN=$NEXT_PUBLIC_PHONE_EMAIL_DOMAIN \
    NEXT_PUBLIC_CLOUD_BUY_URL=$NEXT_PUBLIC_CLOUD_BUY_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN if [ "$NEXT_PUBLIC_CANVAS_PERF_PROBE" = "1" ]; then npm run build -- --profile; else npm run build; fi

# ── isolated media runtime (no compiler in the release image) ────────────────
FROM node:24-bookworm-slim AS media-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gcc libc6-dev fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY scripts/video-fusion/media-sandbox.c /tmp/media-sandbox.c
COPY scripts/video-fusion/prepare-media-runtime.sh /tmp/prepare-media-runtime.sh
RUN cc -O2 -Wall -Wextra -Werror /tmp/media-sandbox.c -o /usr/local/bin/naumi-media-sandbox && sh /tmp/prepare-media-runtime.sh

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runner
WORKDIR /app
# 构建版本号(CI 传入 date +%s):后台"检查更新"用它跟官方站比对。
ARG BUILD_VERSION=0
ARG SOURCE_COMMIT=
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MEDIA_DIR=/data/media \
    BUILD_VERSION=$BUILD_VERSION \
    SOURCE_COMMIT=$SOURCE_COMMIT

# Non-root user
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/scripts/video-worker.mjs ./scripts/video-worker.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/worker-runtime.mjs ./scripts/worker-runtime.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/video-media-worker.mjs ./scripts/video-media-worker.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/video-fusion/media-engine.mjs ./scripts/video-fusion/media-engine.mjs
COPY --from=build --chown=nextjs:nodejs /app/scripts/video-fusion/media-bundle.mjs ./scripts/video-fusion/media-bundle.mjs
COPY --from=media-runtime /opt/naumi-media-runtime /opt/naumi-media-runtime
COPY --from=media-runtime /usr/local/bin/naumi-media-sandbox /usr/local/bin/naumi-media-sandbox
COPY --from=build --chown=nextjs:nodejs /app/scripts/rotate-settings-secret.mjs ./scripts/rotate-settings-secret.mjs

# Local media storage (used when R2 is not configured)
RUN mkdir -p /data/media /scratch && chown -R nextjs:nodejs /data /scratch
VOLUME /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
