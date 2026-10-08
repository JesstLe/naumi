#!/usr/bin/env bash
# Existing tests only. Bootstrap/submission recovery is deliberately separate.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
CONTAINER=naumi-staging-app-1
RECEIPT=/tmp/naumi-staging-functional-20261009.json
HOST_RECEIPT="$ROOT/evidence/functional-receipt-20261009.json"
SCRIPT="$ROOT/config/verify-functional-runtime.mjs"
LOCK="$ROOT/evidence/functional-wrapper.lock"
test "$#" = 2
COMMIT=$1
MODE=$2
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
case "$MODE" in --inventory|--edit|--video|--poll|--verify) ;; *) exit 64;; esac
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
exec 9>"$LOCK"
flock -n 9 || { echo 'FUNCTIONAL_WRAPPER=BUSY'; exit 75; }
EXPECTED=$(tr -d '\r\n' < "$ROOT/releases/$COMMIT/IMAGE_ID")
test "$(docker inspect "$CONTAINER" --format '{{.Image}}')" = "$EXPECTED"
test "$(docker inspect "$CONTAINER" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
test -s "$HOST_RECEIPT" || { echo 'FUNCTIONAL_RECEIPT=MISSING NO_EXECUTION=1'; exit 66; }
python3 - "$HOST_RECEIPT" "$MODE" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
assert r['version'] == 1 and r['sourceJob'] == 'job-234bb140-6937-45ae-ba2d-4e50711a27f3'
if sys.argv[2] in ('--edit', '--verify'):
    assert r.get('edit', {}).get('operationId'), 'missing original edit receipt; do not resubmit'
if sys.argv[2] in ('--video', '--poll', '--verify'):
    assert r.get('video', {}).get('taskId'), 'missing original video task; reconcile before resubmit'
PY
docker cp "$SCRIPT" "$CONTAINER:/tmp/verify-functional-runtime.mjs"
docker cp "$HOST_RECEIPT" "$CONTAINER:$RECEIPT"
docker exec --user root "$CONTAINER" chown 1001:1001 "$RECEIPT"
docker exec --user root "$CONTAINER" chmod 600 "$RECEIPT"
persist() {
  status=$?
  trap - EXIT
  if docker cp "$CONTAINER:$RECEIPT" "$HOST_RECEIPT.tmp"; then
    chmod 600 "$HOST_RECEIPT.tmp"
    mv -f "$HOST_RECEIPT.tmp" "$HOST_RECEIPT"
    echo "FUNCTIONAL_RECEIPT=PERSISTED COMMAND_EXIT=$status"
  else
    echo "FUNCTIONAL_RECEIPT=COPY_FAILED ORIGINAL_HOST_RECEIPT=KEPT COMMAND_EXIT=$status" >&2
    status=74
  fi
  exit "$status"
}
trap persist EXIT
echo "FUNCTIONAL_RECEIPT=RESTORED FIXED_IMAGE=VERIFIED MODE=$MODE"
docker exec "$CONTAINER" node /tmp/verify-functional-runtime.mjs "$MODE"
