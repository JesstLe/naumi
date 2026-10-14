FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/patch-next-body.mjs ./scripts/patch-next-body.mjs
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY scripts/fleet-connector.ts scripts/fleet-scheduler.ts scripts/fleet-central-preflight.ts scripts/build-fleet-runtime.mjs scripts/fleet-server-only.cjs ./scripts/
RUN node scripts/build-fleet-runtime.mjs
WORKDIR /runtime
COPY deploy/fleet-runtime/package.json deploy/fleet-runtime/package-lock.json ./
RUN cmp /app/dist/fleet/package.json ./package.json && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ARG SOURCE_COMMIT
ARG BUILD_VERSION
ENV NODE_ENV=production NAUMI_VIDEO_WORKER=0 SOURCE_COMMIT=$SOURCE_COMMIT BUILD_VERSION=$BUILD_VERSION
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT io.naumi.runtime=fleet
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /runtime/package.json /runtime/package-lock.json ./
COPY --from=build /app/dist/fleet ./dist/fleet
USER node
CMD ["node", "dist/fleet/connector.js"]
