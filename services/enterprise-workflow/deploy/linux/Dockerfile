ARG NODE_IMAGE=node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ARG RELEASE_ID
ARG GIT_REVISION
LABEL org.opencontainers.image.title="Naumi Enterprise Workflow" \
      org.opencontainers.image.revision=$GIT_REVISION \
      org.naumi.workflow.release=$RELEASE_ID
ENV NODE_ENV=production RUNTIME_CONFIG=/run/enterprise/runtime.json
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY dist ./dist
COPY healthcheck.mjs ./healthcheck.mjs
USER 1000:1000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=8s --start-period=20s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
ENTRYPOINT ["node", "--max-old-space-size=384", "/app/dist/runtime.mjs"]
CMD ["serve", "--config", "/run/enterprise/runtime.json"]
