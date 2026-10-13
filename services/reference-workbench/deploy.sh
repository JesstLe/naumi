#!/usr/bin/env bash
set -euo pipefail
BASE=/opt/reference-workbench
VERSION="${1:?version}"; ARCHIVE="${2:?archive}"
mkdir -p "$BASE/releases" "$BASE/data" "$BASE/evidence"
exec 9>"$BASE/deploy.lock"
flock -n 9 || { echo DEPLOY_LOCK=BUSY; exit 75; }
[[ "$VERSION" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
RELEASE="$BASE/releases/$VERSION"
[[ ! -e "$RELEASE" ]] || { echo RELEASE_EXISTS=1; exit 2; }
df -h / > "$BASE/evidence/disk-before.txt"
PREVIOUS=''
if [[ -L "$BASE/current" ]]; then PREVIOUS=$(readlink -f "$BASE/current"); fi
echo "$PREVIOUS" > "$BASE/evidence/previous-release.txt"
if [[ -e "$BASE/data/workbench.sqlite" ]]; then
  python3 - "$BASE/data/workbench.sqlite" "$BASE/evidence/before-$VERSION.sqlite" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c, sqlite3.connect(sys.argv[2]) as d:c.backup(d)
PY
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx python3-venv > "$BASE/evidence/packages.log" 2>&1
id reference-workbench >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin reference-workbench
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
python3 -m venv "$RELEASE/venv"
"$RELEASE/venv/bin/pip" install -q -r "$RELEASE/requirements.txt" > "$BASE/evidence/pip-$VERSION.log" 2>&1
chmod 700 "$BASE/data"
chown -R reference-workbench:reference-workbench "$BASE/data"
if [[ -f "$BASE/bootstrap.json" ]]; then
  cd "$RELEASE"
  WORKBENCH_DATA="$BASE/data" "$RELEASE/venv/bin/python" - <<'PY'
import os,json,asyncio
from pathlib import Path
raw=json.loads(Path('/opt/reference-workbench/bootstrap.json').read_text())
for k,v in raw.items(): os.environ[k]=v
import bootstrap_channel
asyncio.run(bootstrap_channel.main())
PY
  # 初始化后仅保留密钥加密库和密码哈希。
  rm -- "$BASE/bootstrap.json"
  chown -R reference-workbench:reference-workbench "$BASE/data"
fi
ln -sfn "$RELEASE" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
cat > /etc/systemd/system/reference-workbench.service <<EOF
[Unit]
Description=Independent reference image workbench
After=network-online.target
Wants=network-online.target
[Service]
User=reference-workbench
Group=reference-workbench
WorkingDirectory=$BASE/current
Environment=WORKBENCH_DATA=$BASE/data
Environment=WORKBENCH_VERSION=$VERSION
ExecStart=$BASE/current/venv/bin/uvicorn app:app --host 127.0.0.1 --port 17847 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$BASE/data
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable reference-workbench.service >/dev/null
systemctl restart reference-workbench.service
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:17847/health > "$BASE/evidence/health-$VERSION.json" && break; sleep 1; done
curl -fsS http://127.0.0.1:17847/health
mkdir -p "$BASE/acme"
if [[ ! -f /etc/nginx/sites-available/reference-workbench ]]; then
cat > /etc/nginx/sites-available/reference-workbench <<'NGINX'
server {
    listen 80;
    server_name 47.105.59.142;
    client_max_body_size 310m;
    location /.well-known/acme-challenge/ { root /opt/reference-workbench/acme; }
    location / {
        proxy_pass http://127.0.0.1:17847;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1900s;
    }
}
NGINX
ln -s /etc/nginx/sites-available/reference-workbench /etc/nginx/sites-enabled/reference-workbench
fi
nginx -t
systemctl enable nginx >/dev/null
systemctl reload nginx || systemctl start nginx
echo DEPLOY=PASS
