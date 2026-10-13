#!/usr/bin/env bash
# Build exclusively on staging, from a verified clean fixed-commit source export.
set -Eeuo pipefail
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test "$#" = 1
COMMIT=$1
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
SOURCE="$ROOT/source/$COMMIT-clean"
RELEASE="$ROOT/releases/$COMMIT"
test -s "$SOURCE/package-lock.json"
test -f "$SOURCE/deploy/staging/Dockerfile.runtime"
test ! -e "$SOURCE/.env"
test ! -e "$RELEASE/runtime"
# Dependencies come from npm ci on this host using the same lockfile.
expected=$(sha256sum "$SOURCE/package-lock.json" | cut -d' ' -f1)
test "$expected" = "$(cat "$ROOT/evidence/npm-lock.sha256")"
mkdir -p "$RELEASE"
VERSION=$(date +%s)
docker run --rm --name naumi-staging-next-build --network none \
 -e MEDIA_PRIVATE="${NAUMI_BUILD_MEDIA_PRIVATE:-0}" -e BUILD_VERSION="$VERSION" -e SOURCE_COMMIT="$COMMIT" \
 -e NEXT_TELEMETRY_DISABLED=1 -e NODE_OPTIONS=--max-old-space-size=4096 \
 -v "$SOURCE:/app" -v naumi-staging-build-deps:/app/node_modules \
 -w /app node:24-bookworm-slim npm run build
mkdir -p "$RELEASE/runtime/scripts"
cp -a "$SOURCE/.next/standalone" "$RELEASE/runtime/standalone"
cp -a "$SOURCE/.next/static" "$RELEASE/runtime/static"
cp -a "$SOURCE/public" "$RELEASE/runtime/public"
cp "$SOURCE/scripts/video-worker.mjs" "$SOURCE/scripts/rotate-settings-secret.mjs" "$RELEASE/runtime/scripts/"
cp "$SOURCE/deploy/staging/Dockerfile.runtime" "$RELEASE/runtime/Dockerfile"
docker build --pull=false --network none --build-arg BUILD_VERSION="$VERSION" \
 --build-arg SOURCE_COMMIT="$COMMIT" -t "ghcr.io/jesstle/naumi:$COMMIT" "$RELEASE/runtime"
docker image inspect "ghcr.io/jesstle/naumi:$COMMIT" --format '{{.Id}}' > "$RELEASE/IMAGE_ID"
printf '%s\n' "$COMMIT" > "$RELEASE/COMMIT"
printf '%s\n' "$VERSION" > "$RELEASE/BUILD_VERSION"
echo "STAGING_CANDIDATE_BUILD=PASS COMMIT=$COMMIT PRODUCTION_DEPLOYED=0"
