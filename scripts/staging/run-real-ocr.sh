#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
MODE=${1:---verify}
case "$MODE" in --submit|--verify) ;; *) exit 64;; esac
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
exec 9>"$ROOT/evidence/ocr-acceptance.lock"
flock -n 9 || exit 75
COMMIT=65adfe8742e7a1fe120e7ce7a94409c50c76eb44
APP=naumi-staging-app-1
test "$(docker inspect "$APP" --format '{{.Image}}')" = "$(cat "$ROOT/releases/$COMMIT/IMAGE_ID")"
HOST="$ROOT/evidence/ocr-readable-receipt-20261009.json"
CONTAINER=/tmp/naumi-staging-ocr-readable-20261009.json
LATCH="$ROOT/evidence/ocr-readable-execution.started"
test ! -e "$LATCH" || { echo 'STAGING_OCR=RECOVERY_REQUIRED NO_EXECUTION=1'; exit 75; }
docker cp "$ROOT/config/verify-real-ocr.mjs" "$APP:/tmp/verify-real-ocr.mjs"
docker cp "$ROOT/evidence/ocr-readable-fixture.png" "$APP:/tmp/staging-ocr-readable-fixture.png"
docker exec --user root "$APP" chown 1001:1001 /tmp/staging-ocr-readable-fixture.png
if test -s "$HOST"; then docker cp "$HOST" "$APP:$CONTAINER"; fi
docker exec --user root "$APP" sh -c "if test -f $CONTAINER; then chown 1001:1001 $CONTAINER; chmod 600 $CONTAINER; fi"
persist(){
 status=$?; trap - EXIT
 if docker cp "$APP:$CONTAINER" "$HOST.tmp"; then
   chmod 600 "$HOST.tmp"; mv "$HOST.tmp" "$HOST"
   rm -f "$LATCH"
   echo "STAGING_OCR_RECEIPT=PERSISTED COMMAND_EXIT=$status"
 else status=74; fi
 exit "$status"
}
trap persist EXIT
touch "$LATCH"
docker exec "$APP" node /tmp/verify-real-ocr.mjs "$MODE"
