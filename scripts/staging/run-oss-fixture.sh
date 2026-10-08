#!/usr/bin/env bash
# Isolated transport/standalone acceptance, not live Alibaba OSS acceptance.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
COMMIT=${1:?Full candidate commit required}
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
SOURCE="$ROOT/source/$COMMIT-clean"
IMAGE=$(docker inspect naumi-staging-app-1 --format '{{.Image}}')
test "$(docker inspect naumi-staging-app-1 --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
test -r "$SOURCE/src/lib/storage.ts"
test -r "$ROOT/config/verify-oss-runtime.ts"
test -r "$ROOT/evidence/ocr-readable-fixture.png"
exec 9>"$ROOT/evidence/oss-runtime-fixture.lock"
flock -n 9 || exit 75
for mode in 0 1; do
  docker run --rm --network none --cpus 1 --memory 768m \
    --add-host oss-fixture.local:127.0.0.1 \
    --add-host fixture-bucket.oss-fixture.local:127.0.0.1 \
    -e NAUMI_OSS_FIXTURE_VIRTUAL_HOST="$mode" -e NAUMI_STAGING_SOURCE_ROOT=/source \
    -v "$SOURCE:/source:ro" \
    -v naumi-staging-build-deps:/source/node_modules:ro \
    -v "$ROOT/config/verify-oss-runtime.ts:/tmp/verify-oss-runtime.ts:ro" \
    -v "$ROOT/evidence/ocr-readable-fixture.png:/fixture.png:ro" \
    --user root "$IMAGE" \
    node --conditions react-server /tmp/verify-oss-runtime.ts
done
echo 'OSS_RUNTIME_MATRIX=PASS PATH=1 VIRTUAL_HOST=1 LIVE_OSS=NOT_TESTED'
