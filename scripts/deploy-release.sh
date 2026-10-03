#!/usr/bin/env bash
# Run on the Naumi host: deploy-release.sh COMMIT SOURCE_TAR_GZ IMAGE_TAR_GZ
# Never builds on the host and never restores or recreates account/media volumes.
set -Eeuo pipefail
COORDINATED=${NAUMI_COORDINATED_RELEASE:-0}
[[ "$COORDINATED" = 0 || "$COORDINATED" = 1 ]]

compose_app_has_env() {
  local compose=$1 key=$2
  awk -v key="$key" '
    /^  app:[[:space:]]*$/ { in_app = 1; next }
    in_app && (/^  [^ #]/ || /^[^ ]/) { exit(found ? 0 : 1) }
    in_app && $0 ~ ("^      " key ":[[:space:]]*") { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$compose"
}

ensure_app_env() {
  local compose=$1 key=$2 value=$3 tmp
  if compose_app_has_env "$compose" "$key"; then
    return 0
  fi
  tmp="${compose}.tmp"
  if ! awk -v key="$key" -v value="$value" '
    function emit() {
      print "      " key ": " value
      inserted = 1
    }
    /^  app:[[:space:]]*$/ { in_app = 1; print; next }
    in_app && (/^  [^ #]/ || /^[^ ]/) { in_app = 0 }
    in_app && /^    environment:[[:space:]]*$/ {
      in_env = 1
      found_env = 1
      print
      next
    }
    in_env && $0 !~ /^      / {
      emit()
      in_env = 0
    }
    { print }
    END {
      if (in_env && !inserted) emit()
      if (!found_env || !inserted) exit 45
    }
  ' "$compose" > "$tmp"; then
    rm -f "$tmp"
    return 45
  fi
  mv "$tmp" "$compose"
}

ensure_video_worker_service() {
  local compose=$1 commit=$2 tmp
  if grep -qE '^[[:space:]]{2}video-worker:[[:space:]]*$' "$compose"; then
    return 0
  fi
  tmp="${compose}.tmp"
  if ! awk -v image="ghcr.io/jesstle/naumi:$commit" '
    function emit() {
      print ""
      print "  video-worker:"
      print "    image: " image
      print "    restart: unless-stopped"
      print "    command: [\"node\", \"scripts/video-worker.mjs\"]"
      print "    environment:"
      print "      NAUMI_APP_ORIGIN: http://app:3000"
      print "      VIDEO_WORKER_SECRET: ${VIDEO_WORKER_SECRET:?VIDEO_WORKER_SECRET required}"
      print "      VIDEO_WORKER_INTERVAL_MS: ${VIDEO_WORKER_INTERVAL_MS:-15000}"
      print "    depends_on:"
      print "      app:"
      print "        condition: service_started"
      print ""
      inserted = 1
    }
    !inserted && /^(volumes|networks|configs|secrets):[[:space:]]*$/ {
      emit()
      print
      next
    }
    { print }
    END {
      if (!inserted) emit()
    }
  ' "$compose" > "$tmp"; then
    rm -f "$tmp"
    return 46
  fi
  mv "$tmp" "$compose"
}

upgrade_release_compose() {
  local compose=$1 commit=$2
  [[ "$commit" =~ ^[a-f0-9]{40}$ ]]
  test -r "$compose"
  # Product features no longer depend on edition or license environment bindings.
  sed -i -E '/^[[:space:]]*(NAUMI_EDITION|PRO_LICENSE_KEY):/d' "$compose"
  ensure_app_env "$compose" NAUMI_VIDEO_WORKER '"0"'
  ensure_app_env "$compose" VIDEO_WORKER_SECRET '${VIDEO_WORKER_SECRET:?VIDEO_WORKER_SECRET required}'
  ensure_app_env "$compose" VIDEO_API_MODELS '${VIDEO_API_MODELS:-}'
  ensure_app_env "$compose" VIDEO_PROVIDERS_JSON '${VIDEO_PROVIDERS_JSON:-}'
  ensure_app_env "$compose" NAUMI_ROUTER_MANAGEMENT_URL '${NAUMI_ROUTER_MANAGEMENT_URL:-}'
  ensure_app_env "$compose" NAUMI_ROUTER_MANAGEMENT_TOKEN '${NAUMI_ROUTER_MANAGEMENT_TOKEN:-}'
  ensure_app_env "$compose" NAUMI_ROUTER_GENERATION_URL '${NAUMI_ROUTER_GENERATION_URL:-}'
  ensure_app_env "$compose" NAUMI_ROUTER_GENERATION_TOKEN '${NAUMI_ROUTER_GENERATION_TOKEN:-}'
  ensure_app_env "$compose" MODEL_CONFIG_ENVELOPE_SECRET '${MODEL_CONFIG_ENVELOPE_SECRET:-}'
  ensure_app_env "$compose" MODEL_CONFIG_TRUSTED_ORIGINS '${MODEL_CONFIG_TRUSTED_ORIGINS:-}'
  ensure_app_env "$compose" STORAGE_DRIVER '${STORAGE_DRIVER:-local}'
  ensure_app_env "$compose" NAUMI_IMAGE_QUALITY_SUPPORTED '${NAUMI_IMAGE_QUALITY_SUPPORTED:-0}'
  ensure_app_env "$compose" OPENAI_IMAGE_QUALITY '${OPENAI_IMAGE_QUALITY:-medium}'
  ensure_app_env "$compose" NAUMI_PUBLIC_COMMERCE '${NAUMI_PUBLIC_COMMERCE:-0}'
  ensure_app_env "$compose" NAUMI_BETA_PREVIEW '${NAUMI_BETA_PREVIEW:-0}'
  ensure_app_env "$compose" S3_ENDPOINT '${S3_ENDPOINT:-}'
  ensure_app_env "$compose" S3_REGION '${S3_REGION:-us-east-1}'
  ensure_app_env "$compose" S3_ACCESS_KEY_ID '${S3_ACCESS_KEY_ID:-}'
  ensure_app_env "$compose" S3_SECRET_ACCESS_KEY '${S3_SECRET_ACCESS_KEY:-}'
  ensure_app_env "$compose" S3_BUCKET '${S3_BUCKET:-}'
  ensure_app_env "$compose" S3_FORCE_PATH_STYLE '${S3_FORCE_PATH_STYLE:-true}'
  ensure_app_env "$compose" S3_PUBLIC_BASE_URL '${S3_PUBLIC_BASE_URL:-}'
  ensure_video_worker_service "$compose" "$commit"
  sed -i -E "s#image: ghcr.io/jesstle/naumi:[^ ]+#image: ghcr.io/jesstle/naumi:$commit#" "$compose"
  compose_app_has_env "$compose" NAUMI_VIDEO_WORKER
  compose_app_has_env "$compose" VIDEO_WORKER_SECRET
  compose_app_has_env "$compose" VIDEO_API_MODELS
  compose_app_has_env "$compose" VIDEO_PROVIDERS_JSON
  compose_app_has_env "$compose" STORAGE_DRIVER
  compose_app_has_env "$compose" S3_ENDPOINT
  compose_app_has_env "$compose" S3_ACCESS_KEY_ID
  compose_app_has_env "$compose" S3_SECRET_ACCESS_KEY
  compose_app_has_env "$compose" S3_BUCKET
  grep -qE '^[[:space:]]{2}video-worker:[[:space:]]*$' "$compose"
  test "$(grep -Ec "^[[:space:]]*image: ghcr.io/jesstle/naumi:$commit$" "$compose")" -ge 2
  echo "COMPOSE_UPGRADE_RESULT=PASS VIDEO_WORKER=present COMMIT=$commit"
}

if [ "${1:-}" = --upgrade-compose ]; then
  test "$#" -eq 3
  upgrade_release_compose "$2" "$3"
  exit 0
fi

test "$#" -eq 3
COMMIT=$1
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]]
SOURCE=$(readlink -f "$2")
IMAGE=$(readlink -f "$3")
test -r "$SOURCE" && test -r "$IMAGE"
BASE=/opt/naumi
PREVIOUS=$(readlink -f "$BASE/current")
[[ "$PREVIOUS" == "$BASE/releases/"* ]]
RELEASE="$BASE/releases/${COMMIT:0:12}-$(date +%Y%m%d-%H%M%S)"
NGINX=$(readlink -f /etc/nginx/sites-enabled/naumi-ip)
[[ "$NGINX" == /etc/nginx/sites-available/naumi-ip || "$NGINX" == /etc/nginx/sites-enabled/naumi-ip ]]
if [ "$COORDINATED" = 1 ]; then
  grep -Eq '^[[:space:]]*return 503;' "$NGINX"
  test -z "$(docker ps -q --filter label=com.docker.compose.project=naumi --filter label=com.docker.compose.service=video-worker)"
fi
DB_USER=$(docker exec naumi-db-1 printenv POSTGRES_USER)
DB_NAME=$(docker exec naumi-db-1 printenv POSTGRES_DB)
test -n "$DB_USER" && test -n "$DB_NAME"
mkdir -m 700 "$RELEASE"
tar -xzf "$SOURCE" -C "$RELEASE"
mkdir -m 700 "$RELEASE/backups"
cp -p "$PREVIOUS/.env" "$RELEASE/.env"
VIDEO_WORKER_SECRET_VALUE=$(sed -n 's/^VIDEO_WORKER_SECRET=//p' "$RELEASE/.env" | tail -1)
if [ -z "$VIDEO_WORKER_SECRET_VALUE" ] || [ "$VIDEO_WORKER_SECRET_VALUE" = change-video-worker-secret ]; then
  VIDEO_WORKER_SECRET_VALUE=$(openssl rand -hex 32)
  grep -v '^VIDEO_WORKER_SECRET=' "$RELEASE/.env" > "$RELEASE/.env.tmp" || true
  printf '\nVIDEO_WORKER_SECRET=%s\n' "$VIDEO_WORKER_SECRET_VALUE" >> "$RELEASE/.env.tmp"
  mv "$RELEASE/.env.tmp" "$RELEASE/.env"
  chmod 600 "$RELEASE/.env"
  echo 'VIDEO_WORKER_SECRET_STATUS=generated'
else
  echo 'VIDEO_WORKER_SECRET_STATUS=preserved'
fi
unset VIDEO_WORKER_SECRET_VALUE
# Preserve every live runtime override, account secret and volume binding.
cp "$PREVIOUS/docker-compose.yml" "$RELEASE/docker-compose.yml"
if ! grep -q 'NEW_API_IMAGE_BASE_URL:' "$RELEASE/docker-compose.yml"; then
  awk '{
    print
    if (!inserted && $0 ~ /^[[:space:]]*OPENAI_(IMAGE_MODELS|API_KEY):/) {
      print "      NEW_API_IMAGE_BASE_URL: ${NEW_API_IMAGE_BASE_URL:-}"
      print "      NEW_API_IMAGE_API_KEY: ${NEW_API_IMAGE_API_KEY:-}"
      print "      NEW_API_IMAGE_MODELS: ${NEW_API_IMAGE_MODELS:-}"
      inserted = 1
    }
    next
  }
  END {
    if (!inserted) exit 42
  }' "$RELEASE/docker-compose.yml" > "$RELEASE/docker-compose.yml.tmp"
  mv "$RELEASE/docker-compose.yml.tmp" "$RELEASE/docker-compose.yml"
fi
grep -q 'NEW_API_IMAGE_BASE_URL:' "$RELEASE/docker-compose.yml"
grep -q 'NEW_API_IMAGE_API_KEY:' "$RELEASE/docker-compose.yml"
grep -q 'NEW_API_IMAGE_MODELS:' "$RELEASE/docker-compose.yml"
if ! grep -q 'PADDLE_OCR_BASE_URL:' "$RELEASE/docker-compose.yml"; then
  awk '{
    print
    if (!inserted && $0 ~ /^[[:space:]]*(NEW_API_IMAGE_MODELS|OPENAI_API_KEY):/) {
      print "      PADDLE_OCR_BASE_URL: ${PADDLE_OCR_BASE_URL:-}"
      print "      PADDLE_OCR_API_KEY: ${PADDLE_OCR_API_KEY:-}"
      print "      PADDLE_OCR_REQUIRED: ${PADDLE_OCR_REQUIRED:-false}"
      print "      PADDLE_OCR_FALLBACK_MODEL: ${PADDLE_OCR_FALLBACK_MODEL:-gpt-5.6-luna}"
      print "      PADDLE_OCR_TIMEOUT_MS: ${PADDLE_OCR_TIMEOUT_MS:-35000}"
      print "      PADDLE_OCR_MAX_ATTEMPTS: ${PADDLE_OCR_MAX_ATTEMPTS:-2}"
      print "      PADDLE_OCR_MIN_CONFIDENCE: ${PADDLE_OCR_MIN_CONFIDENCE:-0.12}"
      inserted = 1
    }
    next
  }
  END {
    if (!inserted) exit 43
  }' "$RELEASE/docker-compose.yml" > "$RELEASE/docker-compose.yml.tmp"
  mv "$RELEASE/docker-compose.yml.tmp" "$RELEASE/docker-compose.yml"
fi
if ! grep -q 'PADDLE_OCR_TIMEOUT_MS:' "$RELEASE/docker-compose.yml"; then
  awk '{
    print
    if (!inserted && $0 ~ /^[[:space:]]*PADDLE_OCR_FALLBACK_MODEL:/) {
      print "      PADDLE_OCR_TIMEOUT_MS: ${PADDLE_OCR_TIMEOUT_MS:-35000}"
      print "      PADDLE_OCR_MAX_ATTEMPTS: ${PADDLE_OCR_MAX_ATTEMPTS:-2}"
      print "      PADDLE_OCR_MIN_CONFIDENCE: ${PADDLE_OCR_MIN_CONFIDENCE:-0.12}"
      inserted = 1
    }
    next
  }
  END {
    if (!inserted) exit 44
  }' "$RELEASE/docker-compose.yml" > "$RELEASE/docker-compose.yml.tmp"
  mv "$RELEASE/docker-compose.yml.tmp" "$RELEASE/docker-compose.yml"
fi
grep -q 'PADDLE_OCR_BASE_URL:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_API_KEY:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_REQUIRED:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_FALLBACK_MODEL:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_TIMEOUT_MS:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_MAX_ATTEMPTS:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_MIN_CONFIDENCE:' "$RELEASE/docker-compose.yml"
# 文字模型目录白名单与对外假名映射(与仓库 compose 的透传保持同构,老 release 升级时补齐)
if ! grep -q 'TEXT_MODEL_WHITELIST:' "$RELEASE/docker-compose.yml"; then
  awk '{
    print
    if (!inserted && $0 ~ /^[[:space:]]*AGENT_MODEL:/) {
      print "      TEXT_MODEL_WHITELIST: ${TEXT_MODEL_WHITELIST:-}"
      print "      TEXT_MODEL_ALIASES: ${TEXT_MODEL_ALIASES:-}"
      inserted = 1
    }
    next
  }
  END {
    if (!inserted) exit 44
  }' "$RELEASE/docker-compose.yml" > "$RELEASE/docker-compose.yml.tmp"
  mv "$RELEASE/docker-compose.yml.tmp" "$RELEASE/docker-compose.yml"
fi
grep -q 'TEXT_MODEL_WHITELIST:' "$RELEASE/docker-compose.yml"
grep -q 'TEXT_MODEL_ALIASES:' "$RELEASE/docker-compose.yml"
upgrade_release_compose "$RELEASE/docker-compose.yml" "$COMMIT"
sed -i '/^[[:space:]]*REFERENCE_VISION_\(SOURCE\|MODEL\):/d' "$RELEASE/docker-compose.yml"
sed -i '/^[[:space:]]*AGENT_VISION_MODEL:/a\      REFERENCE_VISION_SOURCE: image\n      REFERENCE_VISION_MODEL: gpt-5.6-luna' "$RELEASE/docker-compose.yml"
grep -q 'REFERENCE_VISION_SOURCE: image' "$RELEASE/docker-compose.yml"
cp -p "$NGINX" "$RELEASE/backups/nginx.before.conf"
printf '%s\n' "$PREVIOUS" > "$RELEASE/PREVIOUS_RELEASE"
printf '%s\n' "$COMMIT" > "$RELEASE/DEPLOYED_COMMIT"
if docker image inspect "ghcr.io/jesstle/naumi:$COMMIT" --format '{{.Id}}' >/dev/null 2>&1; then
  echo 'SKIP_LOAD: image already present locally'
else
  gunzip -c "$IMAGE" | docker load
fi
docker image inspect "ghcr.io/jesstle/naumi:$COMMIT" --format '{{.Id}}' > "$RELEASE/IMAGE_ID"
docker compose -p naumi -f "$RELEASE/docker-compose.yml" config --quiet
docker exec naumi-db-1 pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom > "$RELEASE/backups/database.dump"
# appdata 媒体卷备份已停用(2026-09-28):40G 盘装不下"每次部署 ~4G 全量备份"
# (媒体不可压缩,输出≈卷大小,曾三次写满磁盘中断部署)。回滚语义上也不需要:
# 本脚本从不恢复数据库或媒体卷；回滚只切换代码和配置，保留新任务和账务。
# 媒体卷冷备改为低频手动:bash /root/backup-appdata.sh(如需)。
echo "APPDATA_BACKUP_DISABLED: media volume not backed up per-deploy (by design)"
touch "$RELEASE/backups/appdata.tar.gz.skipped"
echo "(disabled by design)" > "$RELEASE/backups/appdata.tar.gz"
docker exec naumi-db-1 psql -U "$DB_USER" -d "$DB_NAME" -Atc 'select count(*) from app_users; select count(*) from app_artworks;' > "$RELEASE/backups/counts.before"
sha256sum "$RELEASE/backups/database.dump" "$RELEASE/backups/appdata.tar.gz" "$RELEASE/backups/nginx.before.conf" > "$RELEASE/backups/SHA256SUMS"

cat > "$RELEASE/ROLLBACK.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
PREVIOUS='$PREVIOUS'
RELEASE='$RELEASE'
NGINX='$NGINX'
COORDINATED='$COORDINATED'
MODEL_RELEASE=0
if grep -Eq '^NAUMI_ROUTER_MANAGEMENT_URL=.+[^[:space:]]' "\$RELEASE/.env"; then
  MODEL_RELEASE=1
  COORDINATED=1
fi
if [ "\${1:-}" = --check ]; then
  test -r "\$PREVIOUS/.env"
  test -r "\$RELEASE/backups/nginx.before.conf"
  docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" config --quiet
  docker compose -p naumi -f "\$RELEASE/docker-compose.yml" config --quiet
  if docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" config --services | grep -qx video-worker; then
    echo ROLLBACK_READY=1 PREVIOUS_VIDEO_WORKER=1
  else
    echo ROLLBACK_READY=1 PREVIOUS_VIDEO_WORKER=0
  fi
  exit 0
fi
if [ "\$COORDINATED" = 1 ]; then
  # A manual rollback can happen after ingress resumed. Close it again before
  # restoring an older app that cannot interpret accepted model snapshots.
  awk '/server[[:space:]]*\\{/ {print; print "    add_header Retry-After 60 always;"; print "    return 503;"; next} {print}' "\$RELEASE/backups/nginx.before.conf" > "\$NGINX"
  nginx -t
  systemctl reload nginx
  docker compose -p naumi -f "\$RELEASE/docker-compose.yml" stop -t 30 video-worker
  if [ "\$MODEL_RELEASE" = 1 ]; then
    dbu=\$(docker exec naumi-db-1 printenv POSTGRES_USER)
    dbn=\$(docker exec naumi-db-1 printenv POSTGRES_DB)
    pending=\$(docker exec naumi-db-1 psql -U "\$dbu" -d "\$dbn" -Atc "SELECT (SELECT count(*) FROM app_image_jobs WHERE payload ? 'modelExecutions' AND billing_settled=false)+(SELECT count(*) FROM app_canvas_image_tasks WHERE parameters ? 'modelExecutions' AND status IN ('queued','processing'))+(SELECT count(*) FROM app_video_tasks WHERE parameters ? 'modelExecutions' AND status IN ('queued','processing','attention'));" )
    if [ "\$pending" != 0 ]; then
      echo ROLLBACK_BLOCKED_PENDING_MODEL_TASKS WORKERS_PAUSED INGRESS_MAINTENANCE >&2
      exit 1
    fi
  fi
  docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" up -d --no-deps --no-build app
  ln -sfn "\$PREVIOUS" /opt/naumi/current
  echo ROLLBACK_RESULT=APP_RESTORED_WORKERS_PAUSED_MAINTENANCE_RETAINED
  exit 0
fi
if docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" config --services | grep -qx video-worker; then
  docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" up -d --no-deps --no-build app video-worker
else
  if docker compose -p naumi -f "\$RELEASE/docker-compose.yml" config --services | grep -qx video-worker; then
    docker compose -p naumi -f "\$RELEASE/docker-compose.yml" stop -t 30 video-worker || true
    docker compose -p naumi -f "\$RELEASE/docker-compose.yml" rm -f -s video-worker || true
  fi
  docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" up -d --no-deps --no-build app
fi
cp "\$RELEASE/backups/nginx.before.conf" "\$NGINX"
nginx -t
systemctl reload nginx
ln -sfn "\$PREVIOUS" /opt/naumi/current
for i in \$(seq 1 60); do
  if curl -fsS http://127.0.0.1:3012/api/health >/dev/null; then
    if docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" config --services | grep -qx video-worker; then
      docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" ps --status running --services | grep -qx video-worker || { sleep 2; continue; }
    else
      test -z "\$(docker ps -q --filter label=com.docker.compose.project=naumi --filter label=com.docker.compose.service=video-worker)"
    fi
    echo ROLLBACK_RESULT=PASS
    exit 0
  fi
  sleep 2
done
exit 1
EOF
chmod 700 "$RELEASE/ROLLBACK.sh"
"$RELEASE/ROLLBACK.sh" --check
SWITCHED=0
trap 'status=$?; if [ "$SWITCHED" = 1 ]; then "$RELEASE/ROLLBACK.sh"; fi; exit "$status"' ERR
SWITCHED=1
if [ "$COORDINATED" = 1 ]; then
  docker compose -p naumi -f "$RELEASE/docker-compose.yml" up -d --no-deps --no-build app
else
  docker compose -p naumi -f "$RELEASE/docker-compose.yml" up -d --no-deps --no-build app video-worker
fi
READY=0
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3012/api/health > "$RELEASE/health.json"; then
    APP_RUNNING=$(docker compose -p naumi -f "$RELEASE/docker-compose.yml" ps --status running --services | grep -cx app || true)
    WORKER_RUNNING=$(docker compose -p naumi -f "$RELEASE/docker-compose.yml" ps --status running --services | grep -cx video-worker || true)
    if [ "$APP_RUNNING" = 1 ] && { { [ "$COORDINATED" = 0 ] && [ "$WORKER_RUNNING" = 1 ]; } || { [ "$COORDINATED" = 1 ] && [ "$WORKER_RUNNING" = 0 ]; }; }; then READY=1; break; fi
  fi
  sleep 2
done
test "$READY" = 1
node_check='const fs=require("fs");const h=JSON.parse(fs.readFileSync(0,"utf8"));if(!h.db.ok||!h.openai.enabled)process.exit(1);console.log("APP_HEALTH=PASS")'
docker exec -i naumi-app-1 node -e "$node_check" < "$RELEASE/health.json"
APP_CONTAINER=$(docker compose -p naumi -f "$RELEASE/docker-compose.yml" ps -q app)
WORKER_CONTAINER=$(docker compose -p naumi -f "$RELEASE/docker-compose.yml" ps -q video-worker)
test -n "$APP_CONTAINER"
test "$(docker inspect "$APP_CONTAINER" --format '{{.Config.Image}}')" = "ghcr.io/jesstle/naumi:$COMMIT"
if [ "$COORDINATED" = 0 ]; then
  test -n "$WORKER_CONTAINER"
  test "$(docker inspect "$WORKER_CONTAINER" --format '{{.Config.Image}}')" = "ghcr.io/jesstle/naumi:$COMMIT"
  echo "VIDEO_WORKER=PASS STATE=running IMAGE=ghcr.io/jesstle/naumi:$COMMIT"
  cp "$RELEASE/deploy/nginx-naumi.conf" "$NGINX"
  nginx -t
  systemctl reload nginx
else
  grep -Eq '^[[:space:]]*return 503;' "$NGINX"
  echo 'COORDINATED_RELEASE_READY=1 WORKER=paused INGRESS=maintenance'
fi
ln -sfn "$RELEASE" "$BASE/current"
ln -sfn "$RELEASE/ROLLBACK.sh" "$BASE/ROLLBACK_RELEASE.sh"
docker exec naumi-db-1 psql -U "$DB_USER" -d "$DB_NAME" -Atc 'select count(*) from app_users; select count(*) from app_artworks;' > "$RELEASE/backups/counts.after"
if [ "$COORDINATED" = 0 ]; then
for route in / /replicate /retouch /competitors /canvas /video; do
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1$route")
  test "$STATUS" = 200
  echo "PUBLIC_ROUTE=$route STATUS=$STATUS"
done
fi
trap - ERR
echo "RELEASE=$RELEASE"
echo "PREVIOUS=$PREVIOUS"
echo "DEPLOYED_COMMIT=$COMMIT"
echo "DEPLOY_RESULT=PASS"
