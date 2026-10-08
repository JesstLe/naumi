#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test -s "$ROOT/config/router.env"
test ! -e /etc/systemd/system/naumi-staging-router.service
id naumi-staging-router >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin naumi-staging-router
# Read-only traversal of private parent, no read/list access to private config/data.
setfacl -m u:naumi-staging-router:--x "$ROOT"
chown -R naumi-staging-router:naumi-staging-router "$ROOT/router"
find "$ROOT/router" -type d -exec chmod 700 {} +
find "$ROOT/router" -type f -exec chmod 600 {} +
chmod 700 "$ROOT/router/bin/naumi-router"
cat > /etc/systemd/system/naumi-staging-router.service <<'UNIT'
[Unit]
Description=Naumi isolated staging Router
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
[Service]
User=naumi-staging-router
Group=naumi-staging-router
WorkingDirectory=/opt/naumi-staging/router
EnvironmentFile=/opt/naumi-staging/config/router.env
ExecStart=/opt/naumi-staging/router/bin/naumi-router
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/opt/naumi-staging/router/state
MemoryMax=512M
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now naumi-staging-router.service
sleep 2
systemctl is-active --quiet naumi-staging-router.service
echo 'STAGING_ROUTER_SERVICE=PASS STATE=INDEPENDENT LISTEN=DOCKER_GATEWAY_ONLY'
