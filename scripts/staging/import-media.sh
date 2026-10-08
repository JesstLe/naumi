#!/usr/bin/env bash
# Copy objects only from source to isolated local media. Never sync/delete source.
set -Eeuo pipefail
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
CONFIG="$ROOT/config/media-import.conf"
BUCKET=$(cat "$ROOT/config/media-import.bucket")
DEST="$ROOT/data/media"
SNAP="$ROOT/snapshots/20261008-full"
test -r "$CONFIG" && test -d "$DEST"
test ! -e "$SNAP/MEDIA_S3_IMPORTED"
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:13900/)" = 403
rclone --config "$CONFIG" lsjson --recursive --files-only --hash "source:$BUCKET" > "$SNAP/s3-source-manifest.json.part"
mv "$SNAP/s3-source-manifest.json.part" "$SNAP/s3-source-manifest.json"
chmod 400 "$SNAP/s3-source-manifest.json"
python3 - "$SNAP/s3-source-manifest.json" <<'PY'
import json,sys
objects=json.load(open(sys.argv[1]))
print('MEDIA_SOURCE_OBJECTS='+str(len(objects))+' BYTES='+str(sum(o['Size'] for o in objects)))
PY
rclone --config "$CONFIG" copy "source:$BUCKET" "$DEST" \
  --transfers 1 --checkers 1 --buffer-size 1M --bwlimit 2M \
  --contimeout 10s --timeout 90s --retries 3 --low-level-retries 3 \
  --stats 1m --stats-one-line --log-level NOTICE
find "$DEST" -type d -exec chown 1001:1001 {} +
find "$DEST" -type f -exec chown 1001:1001 {} +
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$SNAP/MEDIA_S3_IMPORTED"
chmod 400 "$SNAP/MEDIA_S3_IMPORTED"
echo 'S3_MEDIA_COPY=PASS DESTINATION=LOCAL SOURCE_DELETES=0'
