#!/usr/bin/env bash
# Prepare only the designated staging host. No production access or app start.
set -Eeuo pipefail
test "$(id -u)" = 0
test "${NAUMI_STAGING_BOOTSTRAP:-}" = "120.27.162.85"
test ! -e /opt/naumi/current
if command -v docker >/dev/null; then
  test -z "$(docker ps -aq --filter label=com.docker.compose.project=naumi)"
fi
test -r /etc/os-release
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y --no-install-recommends docker.io docker-compose-v2
fi
apt-get install -y --no-install-recommends git ca-certificates curl rsync python3
systemctl enable --now docker
ROOT=/opt/naumi-staging
install -d -m 700 "$ROOT" "$ROOT/config" "$ROOT/snapshots" "$ROOT/evidence" "$ROOT/releases" "$ROOT/source" "$ROOT/data" "$ROOT/data/postgres"
install -d -m 750 -o 1001 -g 1001 "$ROOT/data/media"
printf '%s\n' 'ENVIRONMENT=staging' 'PRODUCTION_HOST=101.133.166.67' 'STAGING_HOST=120.27.162.85' 'DATA_REFRESH=production-to-staging-only' 'MEDIA=local' > "$ROOT/ENVIRONMENT"
chmod 600 "$ROOT/ENVIRONMENT"
docker version --format 'DOCKER_SERVER={{.Server.Version}}'
docker compose version
df -hT "$ROOT"
echo 'BOOTSTRAP_RESULT=PASS APP_STARTED=0 DATABASE_IMPORTED=0 PRODUCTION_CHANGED=0'
