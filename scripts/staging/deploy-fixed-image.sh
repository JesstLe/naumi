#!/usr/bin/env bash
# Fixed-image staging release under an already-held Naumi/Hub lock. Never restore a DB.
set -Eeuo pipefail
umask 077
echo 'RELEASE_BLOCKED=LEGACY_INPLACE_STAGING; USE=deploy-release.sh_--lifecycle; LIVE_MUTATIONS=0' >&2
exit 78
# Historical implementation retained for code/rollback review, not live entry.
test "$#" = 5
COMMIT=$1 IMAGE_ARCHIVE=$2 BASELINE=$3 E=$4 PRIVATE_ENV=$5
ROOT=/opt/naumi-staging
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ && "$BASELINE" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$E" == "$ROOT/evidence/"* && "$PRIVATE_ENV" == "$E/"* ]]
grep -qx ENVIRONMENT=staging "$ROOT/ENVIRONMENT"
test ! -e /opt/naumi/current
PID=$(cat "$E/lock.pid")
kill -0 "$PID"
test "$(readlink /proc/$PID/fd/9)" = "$ROOT/releases/deploy.lock"
test "$(readlink /proc/$PID/fd/8)" = /opt/naumi-reverse-hub/releases/deploy.lock
! flock -n "$ROOT/releases/deploy.lock" true
! flock -n /opt/naumi-reverse-hub/releases/deploy.lock true
test ! -e "$E/TARGET_SWITCHED"
test -r "$PRIVATE_ENV" && test -r "$IMAGE_ARCHIVE"
ENV=$ROOT/config/.env
COMPOSE=$ROOT/config/docker-compose.yml
test -s "$ENV" && test -s "$COMPOSE"
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$BASELINE"
test "$(docker inspect naumi-staging-video-worker-1 --format '{{.Image}}')" = "$BASELINE"
pending=$(docker exec -i naumi-staging-db-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<'SQL'
-- needs_attention is paused and cannot be claimed/replayed by the durable executor.
-- Preserve its unresolved settlement; it is not an in-flight request to terminate.
SELECT (SELECT count(*) FROM app_image_jobs j WHERE snapshot->>'status' NOT IN ('done','error','failed','cancelled','needs_attention') AND NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='app_image_jobs' AND h.row_key=j.id))
 +(SELECT count(*) FROM app_canvas_image_tasks j WHERE status IN ('queued','processing','running') AND NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='app_canvas_image_tasks' AND h.row_key=j.id))
 +(SELECT count(*) FROM app_video_tasks j WHERE status IN ('queued','processing','running','creating','submitted','creation_unknown') AND NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows h WHERE h.table_name='app_video_tasks' AND h.row_key=j.id));
SQL
)
test "$pending" = 0
mkdir -p "$E/backup"
cp -a "$ENV" "$E/backup/staging.env"
cp -a "$COMPOSE" "$E/backup/docker-compose.yml"
docker exec naumi-staging-db-1 sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$E/backup/naumi.dump"
docker exec -i naumi-staging-db-1 pg_restore -l < "$E/backup/naumi.dump" > "$E/backup/naumi.contents"
test -s "$E/backup/naumi.contents"
find "$ROOT/data/media" -type f -printf '%P\t%s\n' | sort > "$E/backup/media.manifest"
docker image inspect "$BASELINE" --format '{{.Id}}' > "$E/backup/IMAGE_ID"
date -u > "$E/BACKUP_READY"
docker load -i "$IMAGE_ARCHIVE" > "$E/image-load.log"
IMAGE=ghcr.io/jesstle/naumi:$COMMIT
ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')
ACTUAL_COMMIT=$(docker run --rm --entrypoint node "$ID" -e 'process.stdout.write(process.env.SOURCE_COMMIT||"")')
test "$ACTUAL_COMMIT" = "$COMMIT"
compose() { docker compose --env-file "$ENV" -f "$COMPOSE" --profile workers "$@"; }
cat > "$E/ROLLBACK.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -Eeuo pipefail
E=$(cd "$(dirname "$0")" && pwd)
ROOT=/opt/naumi-staging
test -s "$E/backup/staging.env" && test -s "$E/backup/docker-compose.yml"
docker image inspect "$(cat "$E/backup/IMAGE_ID")" >/dev/null
if [ "${1:-}" = --check ]; then echo ROLLBACK_MATERIAL=PASS; exit; fi
PID=$(cat "$E/lock.pid");kill -0 "$PID"
test "$(readlink /proc/$PID/fd/9)" = "$ROOT/releases/deploy.lock"
cp -a "$E/backup/staging.env" "$ROOT/config/.env"
cp -a "$E/backup/docker-compose.yml" "$ROOT/config/docker-compose.yml"
docker compose --env-file "$ROOT/config/.env" -f "$ROOT/config/docker-compose.yml" --profile workers up -d --no-build --no-deps app video-worker
date -u > "$E/ROLLED_BACK"
ROLLBACK
chmod 700 "$E/ROLLBACK.sh"
GATEWAY=${NAUMI_STAGING_PUBLIC_GATEWAY:-$(cat "$E/gateway.path")}
bash "$(dirname "$0")/prepare-private-media-rollback.sh" "$E" "$GATEWAY"
bash "$E/ROLLBACK.sh" --check
rollback_on_failure() { status=$?; if [ "$status" != 0 ] && test -e "$E/CONFIG_SWITCHED"; then bash "$E/ROLLBACK.sh" > "$E/rollback.log" 2>&1 || true; fi; exit "$status"; }
trap rollback_on_failure EXIT
# Never print the merged configuration or credentials.
date -u > "$E/CONFIG_SWITCHED"
python3 - "$ENV" "$COMPOSE" "$PRIVATE_ENV" "$IMAGE" <<'PY'
import pathlib,sys,re
env,compose,private=map(pathlib.Path,sys.argv[1:4]);image=sys.argv[4]
allowed={'STORAGE_DRIVER','MEDIA_PRIVATE','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL'}
extra={line.split('=',1)[0]:line.split('=',1)[1] for line in private.read_text().splitlines() if '=' in line}
assert set(extra)==allowed and extra['MEDIA_PRIVATE']=='1' and extra['STORAGE_DRIVER']=='r2'
lines=[line for line in env.read_text().splitlines() if line.split('=',1)[0] not in allowed|{'NAUMI_IMAGE'}]
env.write_text('\n'.join(lines+[f'{k}={v}' for k,v in extra.items()]+['NAUMI_IMAGE='+image])+'\n')
lines=compose.read_text().splitlines();out=[];in_app=False;seen=set();inserted=False
for line in lines:
 if line=='  app:':in_app=True
 elif in_app and (re.match(r'^  [^ ]',line) or re.match(r'^[^ ]',line)):in_app=False
 match=re.match(r'^      ([A-Z_0-9]+):',line) if in_app else None
 if match and match[1] in allowed:
  key=match[1];seen.add(key);line=f'      {key}: ${{{key}:-}}'
 out.append(line)
 if in_app and line=='    environment:':
  out.append('      MEDIA_PRIVATE: ${MEDIA_PRIVATE:-0}');seen.add('MEDIA_PRIVATE');inserted=True
assert inserted and allowed.issubset(seen)
# Existing MEDIA_PRIVATE binding may duplicate the inserted line; collapse only exact duplicates.
result=[]
for line in out:
 if line.startswith('      MEDIA_PRIVATE:') and any(x.startswith('      MEDIA_PRIVATE:') for x in result):continue
 result.append(line)
compose.write_text('\n'.join(result)+'\n')
PY
date -u > "$E/CONFIG_SWITCHED"
compose config --quiet
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$BASELINE"
compose up -d --no-build --no-deps app video-worker > "$E/compose-up.log" 2>&1
for attempt in $(seq 1 60); do
 if curl -fsS --max-time 5 http://127.0.0.1:13012/api/health > "$E/health.json"; then break; fi
 sleep 2
done
curl -fsS --max-time 10 http://127.0.0.1:13012/api/health > "$E/health.json"
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$ID"
test "$(docker inspect naumi-staging-video-worker-1 --format '{{.Image}}')" = "$ID"
printf '%s\n' "$ID" > "$E/IMAGE_ID"
printf '%s\n' "$COMMIT" > "$E/COMMIT"
date -u > "$E/TARGET_SWITCHED"
trap - EXIT
echo "STAGING_FIXED_IMAGE_SWITCH=PASS COMMIT=$COMMIT"
