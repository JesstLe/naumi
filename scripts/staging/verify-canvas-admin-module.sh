#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
SOURCE=$(realpath "$1")
[[ "$SOURCE" == "$ROOT/"* ]]
MODE=${2:-modified}
[[ "$MODE" == baseline || "$MODE" == modified ]]
DB=naumi_canvas_policy_fixture
ENVFILE="$ROOT/evidence/canvas-admin-models-20261009/.env.fixture"
test ! -e "$ENVFILE"
docker exec naumi-staging-db-1 createdb -U naumi_staging "$DB"
cleanup() { rm -f "$ENVFILE"; docker exec naumi-staging-db-1 dropdb --if-exists -U naumi_staging "$DB"; }
trap cleanup EXIT
python3 - "$ENVFILE" <<'PY'
from dotenv import dotenv_values
import os,sys
s=dotenv_values('/opt/naumi-staging/config/.env',interpolate=False)
password=s['POSTGRES_PASSWORD']; assert not any(x in password for x in '\r\n@$')
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
 f.write('DATABASE_URL=postgres://naumi_staging:'+password+'@127.0.0.1:5432/naumi_canvas_policy_fixture?sslmode=disable\n')
 f.write('SETTINGS_SECRET='+s['SETTINGS_SECRET']+'\nNAUMI_VERIFY_ISOLATED_DB=1\nNAUMI_ENVIRONMENT=fixture\nNAUMI_STAGING_HISTORY_GUARD=0\n')
PY
flag=; [[ "$MODE" != baseline ]] || flag=--baseline
docker run --rm --network container:naumi-staging-db-1 --env-file "$ENVFILE" \
 -v "$SOURCE:/app:ro" -v naumi-staging-build-deps:/app/node_modules -w /app node:24-bookworm-slim \
 node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-canvas-admin-models.ts $flag
docker run --rm --network container:naumi-staging-db-1 --env-file "$ENVFILE" \
 -v "$SOURCE:/app:ro" -v naumi-staging-build-deps:/app/node_modules -w /app node:24-bookworm-slim \
 node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-canvas-admin-runtime.ts $flag
if [[ "$MODE" == modified ]]; then
 docker run --rm --network none -v "$SOURCE:/app:ro" -v naumi-staging-build-deps:/app/node_modules -w /app node:24-bookworm-slim \
  node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-admin-client.tsx
 docker run --rm --network container:naumi-staging-db-1 --env-file "$ENVFILE" \
  -v "$SOURCE:/app:ro" -v naumi-staging-build-deps:/app/node_modules -w /app node:24-bookworm-slim \
  node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-business-routing.ts
fi
echo "CANVAS_POLICY_MODULE=PASS MODE=$MODE DB=EMPTY_DISPOSABLE REAL_SUPPLIER_CALLS=0"
