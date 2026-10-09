#!/usr/bin/env bash
# Invoke only after explicit user authorization for staging public access.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
EVIDENCE="$ROOT/evidence/public-web-20261009"
NGINX=/usr/local/lib/naumi-staging-web/usr/sbin/nginx
UNIT=naumi-staging-public.service
test "$(id -u)" = 0
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test -x "$NGINX"
test -r "$ROOT/config/nginx-public.conf"
test -r "$ROOT/config/$UNIT"
test -s "$EVIDENCE/BASELINE.sha256"
if test -e "/etc/systemd/system/$UNIT" || ss -H -lnt 'sport = :80' | grep -q .; then
    echo 'PUBLIC_WEB_EXISTING_UNIT_OR_PORT=1 NO_OVERWRITE=1' >&2
    exit 73
fi
test "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:13012/api/health)" = 200
install -d -m 755 /run/naumi-staging-public
install -d -m 700 -o www-data -g www-data /var/lib/naumi-staging-web
for name in client_body proxy fastcgi uwsgi scgi; do
    install -d -m 700 -o www-data -g www-data "/var/lib/naumi-staging-web/$name"
done
install -m 600 "$ROOT/config/nginx-public.conf" "$EVIDENCE/MODIFIED_FILE.conf"
sha256sum "$EVIDENCE/MODIFIED_FILE.conf" > "$EVIDENCE/MODIFIED.sha256"
"$NGINX" -e stderr -t -c "$EVIDENCE/MODIFIED_FILE.conf"
install -m 644 "$ROOT/config/$UNIT" "/etc/systemd/system/$UNIT"
sha256sum "/etc/systemd/system/$UNIT" > "$EVIDENCE/$UNIT.sha256"
systemctl daemon-reload
systemctl enable --now "$UNIT"
for n in $(seq 1 20); do
    if curl -fsS -o /dev/null http://127.0.0.1/api/health; then break; fi
    sleep 1
done
"$NGINX" -e stderr -t -c "$EVIDENCE/MODIFIED_FILE.conf"
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/api/admin/usage)" = 403
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/api/video/worker/tick)" = 403
echo 'PUBLIC_WEB=PASS LISTEN=80 HEALTH=200 ADMIN_UNAUTH=403 WORKER_PUBLIC=403 APP_BINDING=UNCHANGED APPLICATION_RESTARTED=0'
