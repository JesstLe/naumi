#!/usr/bin/env bash
# Requires an explicit private OSS configuration. Never toggles app storage.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
COMMIT=${1:?Full candidate commit required}
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
CONFIG="$ROOT/config/.env.oss"
exec 9>"$ROOT/evidence/oss-live-probe.lock"
flock -n 9 || exit 75
LATCH="$ROOT/evidence/oss-live-probe.inflight"
if test -e "$LATCH"; then echo 'OSS_LIVE_PROBE=RECONCILE_PRIOR_RECEIPT NEW_REQUESTS=0';exit 75;fi
if ! test -s "$CONFIG"; then echo 'OSS_LIVE_PROBE=CONFIG_PENDING REAL_REQUESTS=0';exit 78;fi
IMAGE=$(docker inspect naumi-staging-app-1 --format '{{.Image}}')
test "$(docker inspect naumi-staging-app-1 --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
SOURCE="$ROOT/source/$COMMIT-clean"
test -r "$SOURCE/src/lib/storage.ts"
EVIDENCE=$(mktemp -d "$ROOT/evidence/oss-live-probe.XXXXXX")
CONTAINER="naumi-staging-oss-probe-${EVIDENCE##*.}"
ENVFILE="$EVIDENCE/private.env"
cleanup(){ status=$?;rm -f "$ENVFILE";exit "$status"; }
trap cleanup EXIT
python3 "$ROOT/config/prepare-oss-probe.py" "$CONFIG" "$ENVFILE"
HASH=$(sha256sum "$CONFIG" | cut -d' ' -f1)
printf 'EVIDENCE=%s\nCONTAINER=%s\n' "$EVIDENCE" "$CONTAINER" > "$LATCH"
set +e
docker run --rm --name "$CONTAINER" --label naumi.purpose=staging-oss-probe \
  --network bridge --cpus 1 --memory 768m \
  --env-file "$ENVFILE" -e NAUMI_PROBE_COMMIT="$COMMIT" \
  -e NAUMI_PROBE_IMAGE="$IMAGE" -e NAUMI_PROBE_CONFIG_HASH="$HASH" \
  -v "$SOURCE:/source:ro" -v naumi-staging-build-deps:/source/node_modules:ro \
  -v "$ROOT/config/verify-oss-live.ts:/tmp/verify-oss-live.ts:ro" \
  -v "$EVIDENCE:/evidence" --user root "$IMAGE" \
  node --conditions react-server /tmp/verify-oss-live.ts > "$EVIDENCE/result.txt" 2>&1
rc=$?
set -e
# Raw exception content is never logged by the probe; Node import warnings are nonsecret.
cat "$EVIDENCE/result.txt"
echo "OSS_LIVE_PROBE_EXIT=$rc RECEIPT_DIR=$EVIDENCE"
test -s "$EVIDENCE/receipt.json" || exit 74
test "$(sha256sum "$CONFIG" | cut -d' ' -f1)" = "$HASH" || exit 74
if python3 - "$EVIDENCE/receipt.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));sys.exit(0 if r.get('cleanup')=='PASS' else 1)
PY
then rm -f "$LATCH"; else exit 74; fi
exit "$rc"
