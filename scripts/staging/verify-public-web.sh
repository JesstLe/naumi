#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
E="$ROOT/evidence/public-web-20261009"
NGINX=/usr/local/lib/naumi-staging-web/usr/sbin/nginx
FIXTURE=naumi-staging-public-rollback-fixture.service
sha256sum -c "$E/BASELINE.sha256"
sed -e 's/listen 80 default_server;/listen 127.0.0.1:18080 default_server;/' -e 's#pid /run/naumi-staging-public/nginx.pid;#pid /run/naumi-staging-public-fixture/nginx.pid;#' "$E/MODIFIED_FILE.conf" > "$E/rollback-copy.conf"
install -d -m 755 /run/naumi-staging-public-fixture
sed -e 's#MODIFIED_FILE.conf#rollback-copy.conf#g' -e 's#RuntimeDirectory=naumi-staging-public#RuntimeDirectory=naumi-staging-public-fixture#' -e 's#ReadWritePaths=/var/lib/naumi-staging-web /run/naumi-staging-public#ReadWritePaths=/var/lib/naumi-staging-web /run/naumi-staging-public-fixture#' /etc/systemd/system/naumi-staging-public.service > "/etc/systemd/system/$FIXTURE"
sha256sum "/etc/systemd/system/$FIXTURE" > "$E/$FIXTURE.sha256"
"$NGINX" -e stderr -t -c "$E/rollback-copy.conf"
systemctl daemon-reload
systemctl start "$FIXTURE"
for n in $(seq 1 10); do
    if curl -fsS -o /dev/null http://127.0.0.1:18080/api/health; then break; fi
    sleep 1
done
test "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/health)" = 200
"$E/ROLLBACK.sh" --fixture | tee "$E/ROLLBACK.txt"
for name in naumi-staging-app-1 naumi-staging-video-worker-1 naumi-staging-db-1; do
    docker inspect "$name" --format '{{json .Config}} {{json .HostConfig}} {{.State.StartedAt}} {{.Image}}' | sha256sum > "$E/$name.CURRENT.sha256"
    cmp "$E/$name.BASELINE.sha256" "$E/$name.CURRENT.sha256"
done
docker inspect naumi-staging-app-1 --format '{{json .NetworkSettings.Ports}}' | python3 -c 'import json,sys; p=json.load(sys.stdin)["3000/tcp"];assert p==[{"HostIp":"127.0.0.1","HostPort":"13012"}]'
docker inspect naumi-staging-db-1 --format '{{json .HostConfig.PortBindings}}' | python3 -c 'import json,sys;assert not json.load(sys.stdin)'
curl -fsS http://127.0.0.1/api/auth/session | python3 -c 'import json,sys;assert json.load(sys.stdin).get("user")==None;print("PUBLIC_SESSION=ANONYMOUS AUTH_PRESERVED=1")'
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/.env)" = 404
systemctl is-active naumi-staging-public.service
systemctl is-enabled naumi-staging-public.service
"$NGINX" -v
echo 'PUBLIC_WEB_INVARIANTS=PASS APP_WORKER_DB_CONFIG_AND_START_TIME=IDENTICAL DB_PUBLIC_PORTS=0 APP_DIRECT=LOOPBACK ENV_PATH=404'
for f in MODIFIED_FILE.conf DIFF_FILE.patch ROLLBACK.sh; do test -s "$E/$f"; sha256sum "$E/$f"; done
