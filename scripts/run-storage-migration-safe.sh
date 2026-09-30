#!/usr/bin/env bash
# Production host helper: migrate /data/media to the private Garage bucket
# without switching Naumi away from local storage. The copy is resumable and
# intentionally slow; a watchdog stops it if app health or host headroom drops.
set -Eeuo pipefail

MODE=${1:-status}
APP_CONTAINER=${APP_CONTAINER:-naumi-app-1}
MIGRATION_CONTAINER=${MIGRATION_CONTAINER:-naumi-media-migration}
ENV_FILE=${ENV_FILE:-/root/.env.garage.production.local}
WORK_ROOT=${WORK_ROOT:-/opt/naumi-gateway/migration}
RCLONE_CONFIG=${RCLONE_CONFIG:-$WORK_ROOT/rclone.conf}
RCLONE_IMAGE=${RCLONE_IMAGE:-rclone/rclone@sha256:d5971950c2b370fb04dd3292541b5bda6d9103143fd7e345aeb435a399388afc}
BW_LIMIT=${BW_LIMIT:-96K}
MEMORY_LIMIT=${MEMORY_LIMIT:-128m}
MEMORY_SWAP_LIMIT=${MEMORY_SWAP_LIMIT:-192m}
CPU_LIMIT=${CPU_LIMIT:-0.15}
MIN_AVAILABLE_KB=${MIN_AVAILABLE_KB:-262144}

require_root() {
  test "$(id -u)" = 0
  test -r "$ENV_FILE"
  docker inspect "$APP_CONTAINER" >/dev/null
}

load_storage_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  : "${S3_ENDPOINT:?missing S3_ENDPOINT}"
  : "${S3_REGION:?missing S3_REGION}"
  : "${S3_ACCESS_KEY_ID:?missing S3_ACCESS_KEY_ID}"
  : "${S3_SECRET_ACCESS_KEY:?missing S3_SECRET_ACCESS_KEY}"
  : "${S3_BUCKET:?missing S3_BUCKET}"
}

write_config() {
  install -d -m 700 "$WORK_ROOT"
  umask 077
  {
    printf '%s\n' '[garage]'
    printf '%s\n' 'type = s3' 'provider = Other' 'env_auth = false'
    printf 'access_key_id = %s\n' "$S3_ACCESS_KEY_ID"
    printf 'secret_access_key = %s\n' "$S3_SECRET_ACCESS_KEY"
    printf 'region = %s\n' "$S3_REGION"
    printf 'endpoint = %s\n' "$S3_ENDPOINT"
    printf '%s\n' 'force_path_style = true' 'acl = private'
  } > "$RCLONE_CONFIG"
  chmod 600 "$RCLONE_CONFIG"
}

gateway_ready() {
  test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$S3_ENDPOINT/" || true)" = 403
}

run_rclone() {
  docker run --rm --network host \
    --memory "$MEMORY_LIMIT" --memory-swap "$MEMORY_SWAP_LIMIT" --cpus "$CPU_LIMIT" \
    --volumes-from "$APP_CONTAINER:ro" \
    -v "$RCLONE_CONFIG:/config/rclone/rclone.conf:ro" \
    "$RCLONE_IMAGE" --config /config/rclone/rclone.conf "$@"
}

prepare() {
  require_root
  load_storage_env
  test "$(docker exec "$APP_CONTAINER" sh -lc 'printf %s "${STORAGE_DRIVER:-local}"')" = local
  gateway_ready
  docker pull "$RCLONE_IMAGE" >/dev/null
  write_config
  run_rclone lsd "garage:$S3_BUCKET" >/dev/null
  echo "MIGRATION_PREPARE=PASS DRIVER=local BW_LIMIT=$BW_LIMIT IMAGE=$RCLONE_IMAGE"
}

write_watchdog() {
  cat > "$WORK_ROOT/watchdog.sh" <<EOF
#!/usr/bin/env bash
set -u
failures=0
while docker inspect '$MIGRATION_CONTAINER' >/dev/null 2>&1; do
  running=\$(docker inspect '$MIGRATION_CONTAINER' --format '{{.State.Running}}' 2>/dev/null || echo false)
  [ "\$running" = true ] || exit 0
  available=\$(awk '/MemAvailable:/ {print \$2}' /proc/meminfo)
  disk_use=\$(df -P / | awk 'NR==2 {gsub(/%/,"",\$5); print \$5}')
  if [ "\$available" -lt '$MIN_AVAILABLE_KB' ] || [ "\$disk_use" -ge 90 ]; then
    echo "WATCHDOG_STOP available_kb=\$available disk_use=\$disk_use" >> '$WORK_ROOT/watchdog.log'
    docker stop -t 10 '$MIGRATION_CONTAINER' >/dev/null 2>&1 || true
    exit 1
  fi
  if curl -fsS --max-time 3 http://127.0.0.1:3012/api/health >/dev/null; then
    failures=0
  else
    failures=\$((failures + 1))
    if [ "\$failures" -ge 2 ]; then
      echo "WATCHDOG_STOP health_failures=\$failures" >> '$WORK_ROOT/watchdog.log'
      docker stop -t 10 '$MIGRATION_CONTAINER' >/dev/null 2>&1 || true
      exit 1
    fi
  fi
  sleep 15
done
EOF
  chmod 700 "$WORK_ROOT/watchdog.sh"
}

start() {
  prepare
  docker rm -f "$MIGRATION_CONTAINER" >/dev/null 2>&1 || true
  : > "$WORK_ROOT/watchdog.log"
  write_watchdog
  docker run -d --name "$MIGRATION_CONTAINER" --network host \
    --memory "$MEMORY_LIMIT" --memory-swap "$MEMORY_SWAP_LIMIT" --cpus "$CPU_LIMIT" \
    --log-opt max-size=10m --log-opt max-file=2 \
    --volumes-from "$APP_CONTAINER:ro" \
    -v "$RCLONE_CONFIG:/config/rclone/rclone.conf:ro" \
    "$RCLONE_IMAGE" --config /config/rclone/rclone.conf \
    copy /data/media "garage:$S3_BUCKET" \
    --size-only --transfers 1 --checkers 1 --buffer-size 0 \
    --bwlimit "$BW_LIMIT" --contimeout 10s --timeout 45s \
    --retries 3 --low-level-retries 3 --stats 1m --stats-one-line \
    --log-level NOTICE >/dev/null
  systemctl stop naumi-media-migration-watchdog.service >/dev/null 2>&1 || true
  systemd-run --quiet --unit naumi-media-migration-watchdog \
    "$WORK_ROOT/watchdog.sh"
  echo "MIGRATION_START=PASS CONTAINER=$MIGRATION_CONTAINER BW_LIMIT=$BW_LIMIT DRIVER=local"
}

status() {
  require_root
  echo "APP_HEALTH=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3012/api/health || true)"
  docker ps -a --filter "name=^/${MIGRATION_CONTAINER}$" --format 'MIGRATION={{.Status}}'
  docker stats --no-stream --format 'RESOURCE={{.CPUPerc}} {{.MemUsage}} {{.NetIO}}' "$MIGRATION_CONTAINER" 2>/dev/null || true
  docker logs --tail 5 "$MIGRATION_CONTAINER" 2>/dev/null || true
  tail -5 "$WORK_ROOT/watchdog.log" 2>/dev/null || true
}

incremental() {
  prepare
  test "$(docker inspect "$MIGRATION_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || echo false)" != true
  run_rclone copy /data/media "garage:$S3_BUCKET" \
    --size-only --transfers 1 --checkers 1 --buffer-size 0 \
    --bwlimit "$BW_LIMIT" --contimeout 10s --timeout 45s \
    --retries 3 --low-level-retries 3 --stats 1m --stats-one-line \
    --log-level NOTICE
  echo "MIGRATION_INCREMENTAL=PASS MODE=size-only DRIVER=local"
}

rollback_check() {
  require_root
  load_storage_env
  test "$(docker exec "$APP_CONTAINER" sh -lc 'printf %s "${STORAGE_DRIVER:-local}"')" = local
  echo "MIGRATION_ROLLBACK_CHECK=PASS DRIVER=local MEDIA_VOLUME_PRESERVED=yes"
}

verify() {
  prepare
  test "$(docker inspect "$MIGRATION_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || echo false)" != true
  run_rclone check /data/media "garage:$S3_BUCKET" --one-way --size-only \
    --checkers 1 --bwlimit "$BW_LIMIT" --log-level NOTICE
  echo "MIGRATION_VERIFY=PASS MODE=size-only DRIVER=local"
}

stop() {
  docker stop -t 10 "$MIGRATION_CONTAINER" >/dev/null 2>&1 || true
  systemctl stop naumi-media-migration-watchdog.service >/dev/null 2>&1 || true
  echo "MIGRATION_STOP=PASS"
}

case "$MODE" in
  prepare) prepare ;;
  start) start ;;
  status) status ;;
  incremental) incremental ;;
  rollback-check) rollback_check ;;
  verify) verify ;;
  stop) stop ;;
  *) echo "usage: $0 {prepare|start|status|incremental|verify|rollback-check|stop}" >&2; exit 64 ;;
esac
