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
sed -i -E "s#image: ghcr.io/jesstle/naumi:[^ ]+#image: ghcr.io/jesstle/naumi:$COMMIT#" "$RELEASE/docker-compose.yml"
sed -i '/^[[:space:]]*REFERENCE_VISION_\(SOURCE\|MODEL\):/d' "$RELEASE/docker-compose.yml"
sed -i '/^[[:space:]]*AGENT_VISION_MODEL:/a\      REFERENCE_VISION_SOURCE: image\n      REFERENCE_VISION_MODEL: gpt-5.6-luna' "$RELEASE/docker-compose.yml"
grep -q 'REFERENCE_VISION_SOURCE: image' "$RELEASE/docker-compose.yml"
cp -p "$NGINX" "$RELEASE/backups/nginx.before.conf"
printf '%s\n' "$PREVIOUS" > "$RELEASE/PREVIOUS_RELEASE"
printf '%s\n' "$COMMIT" > "$RELEASE/DEPLOYED_COMMIT"
gunzip -c "$IMAGE" | docker load
docker image inspect "ghcr.io/jesstle/naumi:$COMMIT" --format '{{.Id}}' > "$RELEASE/IMAGE_ID"
docker compose -p naumi -f "$RELEASE/docker-compose.yml" config --quiet
docker exec naumi-db-1 pg_dump -U novaryns -d novaryns --format=custom > "$RELEASE/backups/database.dump"
docker run --rm -v naumi_appdata:/data:ro alpine:latest tar -C /data -czf - . > "$RELEASE/backups/appdata.tar.gz"
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
