# Restricted sidecar: reuses application UI/auth/business contracts; no generation entrypoints.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/patch-next-body.mjs ./scripts/patch-next-body.mjs
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG SOURCE_COMMIT
ARG BUILD_VERSION
ENV SOURCE_COMMIT=$SOURCE_COMMIT BUILD_VERSION=$BUILD_VERSION FLEET_UI_BUILD=1 NAUMI_VIDEO_WORKER=0 NEXT_PUBLIC_MEDIA_VARIANTS=1 NAUMI_BUILD_CPUS=1 NODE_OPTIONS=--max-old-space-size=2560 NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ARG SOURCE_COMMIT
ARG BUILD_VERSION
ENV SOURCE_COMMIT=$SOURCE_COMMIT BUILD_VERSION=$BUILD_VERSION NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 FLEET_CONTROL_ENABLED=1 FLEET_PORTAL_ONLY=1 FLEET_RELEASE_DISPATCH_ENABLED=0 FLEET_SCHEDULER_ENABLED=0 NAUMI_VIDEO_WORKER=0 NEXT_TELEMETRY_DISABLED=1
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT io.naumi.runtime=fleet-portal
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
CMD ["node","server.js"]
