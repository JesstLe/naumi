#!/usr/bin/env bash
# Run only on the staging host while this task's persistent deploy lock is held.
set -Eeuo pipefail
D=/opt/naumi-staging/evidence/data-sync-20261012
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' /opt/naumi-staging/ENVIRONMENT
test ! -e "$D/APPLIED"
test -s "$D/LOCK_ACQUIRED"
kill -0 "$(cat "$D/lock.pid")"
test -f "$D/MEDIA_COPY_PASS"
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$(cat "$D/image.before")"
sha256sum -c "$D/config.before.sha256"
trap 'docker start naumi-staging-app-1 naumi-staging-video-worker-1 > /dev/null' EXIT
docker stop naumi-staging-video-worker-1 naumi-staging-app-1 > /dev/null
umask 077
docker exec naumi-staging-db-1 pg_dump -U naumi_staging -d naumi_staging --format=custom --no-owner --no-acl > "$D/staging.latest.before.dump"
docker exec -i naumi-staging-db-1 pg_restore --list < "$D/staging.latest.before.dump" > "$D/staging.latest.before.toc"
python3 "$D/merge.py" plan naumi_staging
python3 "$D/merge.py" apply naumi_staging
python3 "$D/merge.py" verify naumi_staging
date -u > "$D/APPLIED"
docker start naumi-staging-app-1 naumi-staging-video-worker-1 > /dev/null
trap - EXIT
for n in $(seq 1 60); do curl -fsS --max-time 5 http://127.0.0.1:13012/api/health > "$D/health.after.json" && break || sleep 1; done
curl -fsS --max-time 10 http://127.0.0.1:13012/api/health > "$D/health.after.json"
curl -fsS --max-time 10 http://127.0.0.1:13012/api/version > "$D/version.after.json"
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$(cat "$D/image.before")"
sha256sum -c "$D/config.before.sha256"
echo LIVE_INCREMENTAL_SYNC=PASS SAME_IMAGE=1 CONFIG_UNCHANGED=1
