#!/usr/bin/env bash
# Disposable read-only source mount, no Docker socket, no production mounts.
set -Eeuo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
test "${NAUMI_VERIFY_RELEASE_FIXTURE:-}" = 1
test ! -S /var/run/docker.sock
test ! -e /opt/naumi/current
expect_block() {
  local result status
  set +e
  result=$("$@" 2>&1)
  status=$?
  set -e
  test "$status" = 78
  grep -q 'RELEASE_BLOCKED=LEGACY_' <<< "$result"
  grep -q 'LIVE_MUTATIONS=0' <<< "$result"
  echo "ENTRY_GUARD=PASS EXIT=78 COMMAND=$1"
}
expect_block bash "$ROOT/scripts/deploy-release.sh"
expect_block bash "$ROOT/scripts/deploy-release.sh" --offline-legacy-fixture x y z
expect_block bash "$ROOT/scripts/staging/deploy-fixed-image.sh"
expect_block python3 "$ROOT/scripts/ops/geeknow-unlimited-deploy.py"
expect_block python3 "$ROOT/scripts/ops/canvas-credits47-release.py"
expect_block python3 "$ROOT/scripts/ops/hub-concurrency47.py"
expect_block python3 "$ROOT/scripts/deploy-image-cache-slots.py" /unused start
expect_block python3 "$ROOT/scripts/deploy-image-cache-slots.py" /unused cutover
expect_block python3 "$ROOT/scripts/deploy-canvas-performance-slots.py" /unused start
expect_block python3 "$ROOT/scripts/deploy-canvas-performance-slots.py" /unused cutover
test ! -e /opt/naumi/current
test ! -e /opt/naumi-staging
echo 'RELEASE_ENTRY_GUARDS=PASS CHECKS=10 LIVE_MUTATIONS=0 ENV_ONLY_BYPASS=REJECTED'
