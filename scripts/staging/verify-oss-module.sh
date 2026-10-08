#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
COMMIT=${1:?Full candidate commit required}
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
TEMP=$(mktemp -d "$ROOT/evidence/oss-compose-fixture.XXXXXX")
trap 'rm -f "$TEMP/env" "$TEMP/env.no-oss" "$TEMP/base.json" "$TEMP/merged.json" "$TEMP/missing.log"; rmdir "$TEMP"' EXIT
cat > "$TEMP/env" <<'ENV'
POSTGRES_PASSWORD=fixture-password
SETTINGS_SECRET=fixture-secret
VIDEO_WORKER_SECRET=fixture-worker-secret
NAUMI_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
NAUMI_OSS_REGION=cn-hangzhou
NAUMI_OSS_ACCESS_KEY_ID=fixture-not-real
NAUMI_OSS_SECRET_ACCESS_KEY=fixture-not-real
NAUMI_OSS_BUCKET=fixture-staging-bucket
ENV
printf 'NAUMI_STAGING_ENV_FILE=%s\nNAUMI_IMAGE=ghcr.io/jesstle/naumi:%s\n' "$TEMP/env" "$COMMIT" >> "$TEMP/env"
BASE="$ROOT/config/oss-baseline-fixture.yml"
OVERLAY="$ROOT/config/docker-compose.oss.yml"
docker compose --profile workers --env-file "$TEMP/env" -f "$BASE" config --format json > "$TEMP/base.json"
python3 "$ROOT/config/verify-compose.py" "$TEMP/base.json"
docker compose --profile workers --env-file "$TEMP/env" -f "$BASE" -f "$OVERLAY" config --format json > "$TEMP/merged.json"
python3 "$ROOT/config/verify-oss-compose.py" "$TEMP/base.json" "$TEMP/merged.json"
python3 - "$TEMP/base.json" "$TEMP/merged.json" <<'PY'
import copy, importlib.util, json, sys
spec=importlib.util.spec_from_file_location('osscheck','/opt/naumi-staging/config/verify-oss-compose.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
b,o=(json.load(open(p)) for p in sys.argv[1:])
cases=[('NAUMI_STAGING_HISTORY_GUARD','0'),('DATABASE_URL','postgres://production.invalid/db'),('S3_ENDPOINT','https://bucket.oss-cn-hangzhou.aliyuncs.com'),('S3_ENDPOINT','http://oss-cn-hangzhou.aliyuncs.com'),('S3_FORCE_PATH_STYLE','true'),('S3_PUBLIC_BASE_URL','https://public.invalid')]
for k,v in cases:
    bad=copy.deepcopy(o);bad['services']['app']['environment'][k]=v
    try: m.verify(b,bad)
    except AssertionError: pass
    else: raise AssertionError('negative configuration accepted')
print('OSS_COMPOSE_NEGATIVE=PASS CASES=6 CREDENTIALS_PRINTED=0')
PY
grep -v '^NAUMI_OSS_' "$TEMP/env" > "$TEMP/env.no-oss"
if docker compose --profile workers --env-file "$TEMP/env.no-oss" -f "$BASE" -f "$OVERLAY" config --quiet > "$TEMP/missing.log" 2>&1; then
  rm -f "$TEMP/env.no-oss"; exit 1
fi
rm -f "$TEMP/env.no-oss"
echo 'OSS_COMPOSE_MISSING_PARAMS=BLOCKED EXIT=NONZERO'
bash "$ROOT/config/run-oss-fixture.sh" "$COMMIT"
echo 'OSS_MODULE=PASS MOCK_CREDENTIALS=1 LIVE_SWITCH=0'
