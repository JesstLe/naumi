#!/usr/bin/env bash
# --check never changes services/data. --apply aborts on later edits/FK references.
set -Eeuo pipefail
ROOT=/opt/naumi-staging
D="$ROOT/evidence/data-sync-20261012"
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
case "${1:---check}" in
  --check)
    test -r "$D/staging.before.dump" && test -r "$D/merge.py"
    docker exec -i naumi-staging-db-1 pg_restore --list < "$D/staging.before.dump" > /dev/null
    echo 'ROLLBACK_CHECK=PASS DATA_CHANGED=0 SERVICES_CHANGED=0'
    ;;
  --apply)
    exec 9>"$ROOT/releases/deploy.lock"
    flock -n -E 75 9
    test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$(cat "$D/image.before")"
    test -f "$D/APPLIED"
    umask 077
    docker exec naumi-staging-db-1 pg_dump -U naumi_staging -d naumi_staging --format=custom --no-owner --no-acl > "$D/before-rollback.dump"
    docker stop naumi-staging-video-worker-1 naumi-staging-app-1 > /dev/null
    trap 'docker start naumi-staging-app-1 naumi-staging-video-worker-1 > /dev/null' EXIT
    python3 "$D/merge.py" rollback naumi_staging
    # Media was only appended: retain it rather than risk deleting a later reference.
    echo 'DATA_ROLLBACK=PASS NEW_MEDIA_RETAINED=1 SOURCE_CHANGED=0'
    ;;
  *) exit 2 ;;
esac
