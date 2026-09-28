#!/usr/bin/env bash
# Run on the Naumi host: deploy-release.sh COMMIT SOURCE_TAR_GZ IMAGE_TAR_GZ
# Never builds on the host and never restores or recreates account/media volumes.
set -Eeuo pipefail
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
mkdir -m 700 "$RELEASE"
tar -xzf "$SOURCE" -C "$RELEASE"
mkdir -m 700 "$RELEASE/backups"
cp -p "$PREVIOUS/.env" "$RELEASE/.env"
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
      inserted = 1
    }
    next
  }
  END {
    if (!inserted) exit 43
  }' "$RELEASE/docker-compose.yml" > "$RELEASE/docker-compose.yml.tmp"
  mv "$RELEASE/docker-compose.yml.tmp" "$RELEASE/docker-compose.yml"
fi
grep -q 'PADDLE_OCR_BASE_URL:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_API_KEY:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_REQUIRED:' "$RELEASE/docker-compose.yml"
grep -q 'PADDLE_OCR_FALLBACK_MODEL:' "$RELEASE/docker-compose.yml"
sed -i -E "s#image: ghcr.io/jesstle/naumi:[^ ]+#image: ghcr.io/jesstle/naumi:$COMMIT#" "$RELEASE/docker-compose.yml"
sed -i '/^[[:space:]]*REFERENCE_VISION_\(SOURCE\|MODEL\):/d' "$RELEASE/docker-compose.yml"
sed -i '/^[[:space:]]*AGENT_VISION_MODEL:/a\      REFERENCE_VISION_SOURCE: image\n      REFERENCE_VISION_MODEL: gpt-5.6-luna' "$RELEASE/docker-compose.yml"
grep -q 'REFERENCE_VISION_SOURCE: image' "$RELEASE/docker-compose.yml"
cp -p "$NGINX" "$RELEASE/backups/nginx.before.conf"
printf '%s\n' "$PREVIOUS" > "$RELEASE/PREVIOUS_RELEASE"
printf '%s\n' "$COMMIT" > "$RELEASE/DEPLOYED_COMMIT"
# 幂等跳过:镜像已在本地(重试部署)时跳过 load,避免重复 ingest 打满磁盘
if docker image inspect "ghcr.io/jesstle/naumi:$COMMIT" --format '{{.Id}}' >/dev/null 2>&1; then
  echo 'SKIP_LOAD: image already present locally'
else
  gunzip -c "$IMAGE" | docker load
fi
docker image inspect "ghcr.io/jesstle/naumi:$COMMIT" --format '{{.Id}}' > "$RELEASE/IMAGE_ID"
docker compose -p naumi -f "$RELEASE/docker-compose.yml" config --quiet
docker exec naumi-db-1 pg_dump -U novaryns -d novaryns --format=custom > "$RELEASE/backups/database.dump"
# 空间守卫:可用空间低于媒体卷两倍时跳过 appdata 全量备份(保 pg_dump),
# 否则备份本身会打满磁盘导致部署中断
FREE_KB=$(df --output=avail -k / | tail -1 | tr -d ' ')
DATA_KB=$(du -sk /var/lib/docker/volumes/naumi_appdata/_data 2>/dev/null | awk '{print $1}')
if [ "${DATA_KB:-0}" -gt 0 ] && [ "$FREE_KB" -lt $((DATA_KB * 2)) ]; then
  echo "APPDATA_SKIP: free ${FREE_KB}kB < 2x data ${DATA_KB}kB, skip appdata backup"
  touch "$RELEASE/backups/appdata.tar.gz.skipped"
else
  docker run --rm -v naumi_appdata:/data:ro alpine:latest tar -C /data -czf - . > "$RELEASE/backups/appdata.tar.gz"
fi
docker exec naumi-db-1 psql -U novaryns -d novaryns -Atc 'select count(*) from app_users; select count(*) from app_artworks;' > "$RELEASE/backups/counts.before"
sha256sum "$RELEASE/backups/database.dump" "$RELEASE/backups/appdata.tar.gz" "$RELEASE/backups/nginx.before.conf" > "$RELEASE/backups/SHA256SUMS"

cat > "$RELEASE/ROLLBACK.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
PREVIOUS='$PREVIOUS'
RELEASE='$RELEASE'
NGINX='$NGINX'
if [ "\${1:-}" = --check ]; then
  test -r "\$PREVIOUS/.env"
  test -r "\$RELEASE/backups/nginx.before.conf"
  docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" config --quiet
  echo ROLLBACK_READY=1
  exit 0
fi
docker compose -p naumi -f "\$PREVIOUS/docker-compose.yml" up -d --no-deps --no-build app
cp "\$RELEASE/backups/nginx.before.conf" "\$NGINX"
nginx -t
systemctl reload nginx
ln -sfn "\$PREVIOUS" /opt/naumi/current
for i in \$(seq 1 60); do
  if curl -fsS http://127.0.0.1:3012/api/health >/dev/null; then echo ROLLBACK_RESULT=PASS; exit 0; fi
  sleep 2
done
exit 1
EOF
chmod 700 "$RELEASE/ROLLBACK.sh"
"$RELEASE/ROLLBACK.sh" --check
SWITCHED=0
trap 'status=$?; if [ "$SWITCHED" = 1 ]; then "$RELEASE/ROLLBACK.sh"; fi; exit "$status"' ERR
SWITCHED=1
docker compose -p naumi -f "$RELEASE/docker-compose.yml" up -d --no-deps --no-build app
READY=0
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3012/api/health > "$RELEASE/health.json"; then READY=1; break; fi
  sleep 2
done
test "$READY" = 1
node_check='const fs=require("fs");const h=JSON.parse(fs.readFileSync(0,"utf8"));if(!h.db.ok||!h.openai.enabled)process.exit(1);console.log("APP_HEALTH=PASS")'
docker exec -i naumi-app-1 node -e "$node_check" < "$RELEASE/health.json"
cp "$RELEASE/deploy/nginx-naumi.conf" "$NGINX"
nginx -t
systemctl reload nginx
ln -sfn "$RELEASE" "$BASE/current"
ln -sfn "$RELEASE/ROLLBACK.sh" "$BASE/ROLLBACK_RELEASE.sh"
docker exec naumi-db-1 psql -U novaryns -d novaryns -Atc 'select count(*) from app_users; select count(*) from app_artworks;' > "$RELEASE/backups/counts.after"
for route in / /replicate /retouch /competitors /canvas; do
  STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1$route")
  test "$STATUS" = 200
  echo "PUBLIC_ROUTE=$route STATUS=$STATUS"
done
trap - ERR
echo "RELEASE=$RELEASE"
echo "PREVIOUS=$PREVIOUS"
echo "DEPLOYED_COMMIT=$COMMIT"
echo "DEPLOY_RESULT=PASS"
