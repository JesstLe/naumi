#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/naumi-staging
CONTAINER=naumi-staging-db-1
DB=naumi_staging_billing_fixture
ENVFILE="$ROOT/config/.env.billing-fixture"
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test "$#" = 1
COMMIT=$1
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
test ! -e "$ENVFILE"
[[ "$(docker exec "$CONTAINER" psql -X -U naumi_staging -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$DB'")" = 0 ]]
docker exec "$CONTAINER" createdb -U naumi_staging "$DB"
cleanup() { rm -f "$ENVFILE"; docker exec "$CONTAINER" dropdb --if-exists -U naumi_staging "$DB"; }
trap cleanup EXIT
# Empty disposable regression DB; real cloned-data/staging guards are tested separately.
python3 - "$ENVFILE" <<'PY'
from dotenv import dotenv_values
import os,sys
src=dotenv_values('/opt/naumi-staging/config/.env',interpolate=False)
password=src['POSTGRES_PASSWORD'];secret=src['SETTINGS_SECRET']
assert not any(x in password for x in '\r\n@$')
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
 f.write('DATABASE_URL=postgres://naumi_staging:'+password+'@127.0.0.1:5432/naumi_staging_billing_fixture?sslmode=disable\n')
 f.write('SETTINGS_SECRET='+secret+'\n')
 f.write('STORAGE_DRIVER=local\nMEDIA_DIR=/app/output/billing-fixture-media\n')
 f.write('NAUMI_VERIFY_ISOLATED_DB=1\nNAUMI_ENVIRONMENT=fixture\nNAUMI_STAGING_HISTORY_GUARD=0\nNAUMI_EDITION=pro\nPRO_LICENSE_KEY=LOCAL-OFFLINE\nNAUMI_MULTI_USER=1\nNAUMI_PUBLIC_COMMERCE=0\n')
PY
mkdir -p "$ROOT/evidence/billing-fixture-output"
chmod 700 "$ROOT/evidence/billing-fixture-output"
docker run --rm --network container:naumi-staging-db-1 --env-file "$ENVFILE" \
 -v "$ROOT/source/$COMMIT-clean:/app:ro" -v naumi-staging-build-deps:/app/node_modules \
 -v "$ROOT/evidence/billing-fixture-output:/app/output" -w /app node:24-bookworm-slim \
 node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-billing-all.mjs
echo 'STAGING_BILLING_RUNTIME=PASS DATABASE=EMPTY_DISPOSABLE WORKING_COPY_CHANGED=0 REAL_SUPPLIER_CALLS=0'
