#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test "$#" = 1
COMMIT=$1
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
CONTAINER=naumi-staging-db-1
DB=naumi_staging_history_fixture
ENVFILE="$ROOT/config/.env.history-fixture"
test ! -e "$ENVFILE"
docker exec "$CONTAINER" createdb -U naumi_staging -T naumi_staging "$DB"
trap 'rm -f "$ENVFILE"; docker exec "$CONTAINER" dropdb --if-exists -U naumi_staging "$DB"' EXIT
python3 - "$ENVFILE" <<'PY'
from pathlib import Path
from dotenv import dotenv_values
import os,sys
source=dotenv_values('/opt/naumi-staging/config/.env.db-restore',interpolate=False)
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
 f.write('DATABASE_URL=postgres://naumi_staging:'+source['POSTGRES_PASSWORD']+'@naumi-staging-db-1:5432/naumi_staging_history_fixture?sslmode=disable\n')
 f.write('STAGING_VERIFY_DATABASE_URL=postgres://naumi_staging:'+source['POSTGRES_PASSWORD']+'@naumi-staging-db-1:5432/naumi_staging_history_fixture?sslmode=disable\n')
 f.write('NAUMI_ENVIRONMENT=staging\nNAUMI_STAGING_HISTORY_GUARD=1\nSETTINGS_SECRET='+source['SETTINGS_SECRET']+'\n')
PY
docker run --rm --network naumi-staging_default --env-file "$ENVFILE" \
  -v "$ROOT/source/$COMMIT-clean:/app" -v naumi-staging-build-deps:/app/node_modules \
  -w /app node:24-bookworm-slim bash -c \
  'set -e; npx tsc --noEmit --pretty false; npx tsx --conditions react-server scripts/staging/verify-history-helper.ts; npx tsx --conditions react-server scripts/staging/verify-history-runtime.ts'
echo 'STAGING_RUNTIME_FIXTURE=PASS WORKING_COPY_CHANGED=0'
