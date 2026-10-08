#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
COMMIT=65adfe8742e7a1fe120e7ce7a94409c50c76eb44
SOURCE="$ROOT/source/$COMMIT-clean"
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
IMAGE=$(docker inspect naumi-staging-app-1 --format '{{.Image}}')
test "$IMAGE" = sha256:3cda12e2fe7ce6a6a5ebfb2d0448186569c6ec83a946a82cf111b94963f54056
test "$(docker inspect naumi-staging-app-1 --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
test -r "$SOURCE/scripts/verify-coordinated-release.sh"
for fail in 0 1; do
  docker run --rm --network none --cpus 1 --memory 384m \
    -e NAUMI_VERIFY_RELEASE_FIXTURE=1 -e FAIL_HEALTH="$fail" \
    -v "$SOURCE/scripts/deploy-release.sh:/deploy.sh:ro" \
    -v "$SOURCE/scripts/verify-coordinated-release.sh:/verify.sh:ro" \
    --user root --entrypoint bash "$IMAGE" /verify.sh
done
echo 'RETURN_DEPLOY_FIXTURE=PASS CANDIDATE_DEPLOY_SCRIPT=1 SUCCESS_AND_FAILURE=1 DATABASE=MOCK DOCKER=MOCK SOCKET_MOUNTED=0 REAL_SERVICES_CHANGED=0'
