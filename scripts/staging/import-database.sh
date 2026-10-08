#!/usr/bin/env bash
# One-time restore on designated staging host. Production never contacted here.
set -Eeuo pipefail
ROOT=/opt/naumi-staging
SNAP="$ROOT/snapshots/20261008-full"
ENV="$ROOT/config/.env.db-restore"
COMPOSE="$ROOT/config/docker-compose.yml"
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test -r "$ENV" && test -r "$SNAP/production.database.dump"
test ! -e "$SNAP/DATABASE_RESTORED"
test -z "$(docker ps -aq --filter label=com.docker.compose.project=naumi-staging)"
docker image inspect postgres:16-alpine >/dev/null
compose() { docker compose --env-file "$ENV" -f "$COMPOSE" "$@"; }
compose config --quiet
compose up -d --no-build --pull never db
container=$(compose ps -q db)
test -n "$container"
for attempt in $(seq 1 60); do
  docker exec "$container" pg_isready -U naumi_staging -d naumi_staging >/dev/null && break
  sleep 1
done
docker exec "$container" pg_isready -U naumi_staging -d naumi_staging
docker exec -i "$container" pg_restore --list < "$SNAP/production.database.dump" > "$SNAP/database-toc.txt"
docker exec -i "$container" pg_restore -U naumi_staging -d naumi_staging --exit-on-error --single-transaction --no-owner --no-acl < "$SNAP/production.database.dump"
docker exec "$container" createdb -U naumi_staging naumi_snapshot_reference
docker exec -i "$container" pg_restore -U naumi_staging -d naumi_snapshot_reference --exit-on-error --single-transaction --no-owner --no-acl < "$SNAP/production.database.dump"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$SNAP/DATABASE_RESTORED"
chmod 400 "$SNAP/DATABASE_RESTORED" "$SNAP/database-toc.txt"
docker exec "$container" psql -X -U naumi_staging -d naumi_staging -Atc 'SELECT count(*) FROM app_users; SELECT count(*) FROM app_artworks; SELECT count(*) FROM app_ledger; SELECT count(*) FROM app_image_jobs; SELECT count(*) FROM app_video_tasks;'
echo 'STAGING_DATABASE_RESTORE=PASS REFERENCE_COPY=PASS APP_STARTED=0 WORKER_STARTED=0'
