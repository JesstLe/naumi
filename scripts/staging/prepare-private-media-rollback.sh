#!/usr/bin/env bash
# Prepare only; do not change the live gateway. Old local-media images lack the private gate.
set -Eeuo pipefail
umask 077
test "$#" = 2
E=$1 GATEWAY=$(readlink -f "$2")
[[ "$E" == /opt/naumi-staging/evidence/* && "$GATEWAY" == /etc/nginx/sites-available/* ]]
PID=$(cat "$E/lock.pid");kill -0 "$PID"
test "$(readlink /proc/$PID/fd/9)" = /opt/naumi-staging/releases/deploy.lock
test -s "$E/ROLLBACK.sh" && test ! -e "$E/ROLLBACK_IMAGE_ONLY.sh"
cp -a "$GATEWAY" "$E/backup/public-gateway.before.conf"
printf '%s\n' "$GATEWAY" > "$E/gateway.path"
python3 - "$GATEWAY" "$E/public-maintenance.conf" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]).read_text()
maintenance,count=re.subn(r'(?m)^(\s*server\s*\{)\s*$',r'\1\n    return 503;',source)
assert count>0
pathlib.Path(sys.argv[2]).write_text(maintenance)
PY
mv "$E/ROLLBACK.sh" "$E/ROLLBACK_IMAGE_ONLY.sh"
cat > "$E/ROLLBACK.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -Eeuo pipefail
E=$(cd "$(dirname "$0")" && pwd)
GATEWAY=$(cat "$E/gateway.path")
test -s "$E/public-maintenance.conf" && test -s "$E/backup/public-gateway.before.conf"
grep -q 'return 503;' "$E/public-maintenance.conf"
bash "$E/ROLLBACK_IMAGE_ONLY.sh" --check
if [ "${1:-}" = --check ]; then echo PRIVATE_ROLLBACK_GATE=PREPARED; exit; fi
PID=$(cat "$E/lock.pid");kill -0 "$PID"
test "$(readlink /proc/$PID/fd/9)" = /opt/naumi-staging/releases/deploy.lock
# Keep public requests closed while an old image has no private-media authorization.
cp "$E/public-maintenance.conf" "$GATEWAY"
if ! nginx -t > "$E/rollback-gateway-check.log" 2>&1; then
  cp "$E/backup/public-gateway.before.conf" "$GATEWAY"
  exit 77
fi
systemctl reload nginx
date -u > "$E/PUBLIC_MAINTENANCE"
bash "$E/ROLLBACK_IMAGE_ONLY.sh"
ROLLBACK
cat > "$E/RESTORE_PUBLIC.sh" <<'RESTORE'
#!/usr/bin/env bash
set -Eeuo pipefail
E=$(cd "$(dirname "$0")" && pwd)
PID=$(cat "$E/lock.pid");kill -0 "$PID"
test "$(readlink /proc/$PID/fd/9)" = /opt/naumi-staging/releases/deploy.lock
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$(cat "$E/IMAGE_ID")"
test "$(docker exec naumi-staging-app-1 node -e 'process.stdout.write(process.env.MEDIA_PRIVATE||"")')" = 1
GATEWAY=$(cat "$E/gateway.path")
cp "$E/backup/public-gateway.before.conf" "$GATEWAY"
nginx -t
systemctl reload nginx
date -u > "$E/PUBLIC_RESTORED"
RESTORE
chmod 700 "$E/ROLLBACK.sh" "$E/ROLLBACK_IMAGE_ONLY.sh" "$E/RESTORE_PUBLIC.sh"
bash "$E/ROLLBACK.sh" --check
echo PRIVATE_ROLLBACK_PREPARED=PASS
