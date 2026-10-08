#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test "$#" = 1
COMMIT=$1
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
SOURCE="$ROOT/source/$COMMIT-clean"
test -s "$SOURCE/package-lock.json"
docker volume create naumi-staging-build-deps >/dev/null
docker volume create naumi-staging-npm-cache >/dev/null
# npm registry direct connectivity is separately verified on this host.
# Persist cache so a network retry does not redownload all resolved packages.
docker run --rm --name naumi-staging-npm-ci --network host \
 -v "$SOURCE:/app" -v naumi-staging-build-deps:/app/node_modules \
 -v naumi-staging-npm-cache:/root/.npm -w /app node:24-bookworm-slim \
 npm ci --maxsockets=8 --fetch-retries=2 --fetch-timeout=120000 --no-audit --no-fund
sha256sum "$SOURCE/package-lock.json" | cut -d' ' -f1 > "$ROOT/evidence/npm-lock.sha256"
echo "STAGING_NPM_CI=PASS HOST=STAGING COMMIT=$COMMIT LOCKFILE=UNCHANGED"
