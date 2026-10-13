#!/usr/bin/env bash
set -euo pipefail
BASE=/opt/reference-workbench
VERSION="${1:?version}"; ARCHIVE="${2:?archive}"
[[ "$VERSION" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
exec 9>"$BASE/deploy.lock"; flock -n 9 || exit 75
python3 - "$BASE/data/workbench.sqlite" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
    assert c.execute("SELECT count(*) FROM tasks WHERE state IN ('running','editing','inferring','waiting')").fetchone()[0]==0,'Wait for active tasks; do not interrupt paid work'
PY
PREVIOUS=$(readlink -f "$BASE/current")
RELEASE="$BASE/releases/$VERSION"
[[ ! -e "$RELEASE" ]] || exit 2
printf '%s\n' "$PREVIOUS" > "$BASE/evidence/previous-release.txt"
cp /etc/nginx/sites-available/reference-workbench "$BASE/evidence/nginx-before-$VERSION.conf"
cp /etc/nginx/sites-available/reference-workbench "$BASE/evidence/rollback-nginx.conf"
python3 - "$BASE/data/workbench.sqlite" "$BASE/evidence/before-$VERSION.sqlite" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c,sqlite3.connect(sys.argv[2]) as d:c.backup(d)
PY
mkdir -p "$RELEASE"; tar -xzf "$ARCHIVE" -C "$RELEASE"
python3 -m venv "$RELEASE/venv"
"$RELEASE/venv/bin/pip" install -q -r "$RELEASE/requirements.txt" > "$BASE/evidence/pip-$VERSION.log" 2>&1
PORT=17848
if grep -q '127.0.0.1:17848' /etc/nginx/sites-available/reference-workbench; then PORT=17847; fi
UNIT="reference-workbench-$PORT"
cat > "/etc/systemd/system/$UNIT.service" <<EOF
[Unit]
Description=Reference workbench candidate
After=network-online.target
[Service]
User=reference-workbench
Group=reference-workbench
WorkingDirectory=$RELEASE
Environment=WORKBENCH_DATA=$BASE/data
Environment=WORKBENCH_VERSION=$VERSION
Environment=WORKBENCH_RECOVER=0
ExecStart=$RELEASE/venv/bin/uvicorn app:app --host 127.0.0.1 --port $PORT --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$BASE/data
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl start "$UNIT"
for _ in $(seq 1 30); do if curl -fsS "http://127.0.0.1:$PORT/health" > "$BASE/evidence/candidate-health.json"; then break; fi; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/health" | grep -F "$VERSION"
OLD_PORT=17847; [[ "$PORT" == 17847 ]] && OLD_PORT=17848
sed -i "s/127.0.0.1:$OLD_PORT/127.0.0.1:$PORT/g" /etc/nginx/sites-available/reference-workbench
nginx -t; systemctl reload nginx
for _ in $(seq 1 20); do
  if curl -fsS https://47.105.59.142/health | grep -F "$VERSION"; then break; fi
  sleep 1
done
curl -fsS https://47.105.59.142/health | grep -F "$VERSION"
# 流量已到就绪的新API；队列为空才停旧服务，不重启候选。
python3 - "$BASE/data/workbench.sqlite" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
    assert c.execute("SELECT count(*) FROM tasks WHERE state IN ('running','editing','inferring','waiting')").fetchone()[0]==0,'Keep old worker alive until queue drained'
PY
systemctl stop reference-workbench
systemctl disable reference-workbench >/dev/null 2>&1 || true
systemctl stop "reference-workbench-$OLD_PORT" >/dev/null 2>&1 || true
systemctl disable "reference-workbench-$OLD_PORT" >/dev/null 2>&1 || true
systemctl enable "$UNIT" >/dev/null
systemctl daemon-reload
ln -sfn "$RELEASE" "$BASE/current.next"; mv -Tf "$BASE/current.next" "$BASE/current"
curl -fsS --retry 10 --retry-delay 1 --retry-connrefused https://47.105.59.142/health
echo UPDATE=PASS
