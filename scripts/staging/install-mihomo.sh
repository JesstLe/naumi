#!/usr/bin/env bash
set -Eeuo pipefail
test "$(id -u)" = 0
test ! -e /opt/naumi/current
test -z "$(docker ps -aq)"
PACKAGE=${1:?Protected proxy package directory required}
test "$PACKAGE" = /opt/naumi-staging/config/proxy-package
for file in mihomo-v1.19.32.gz config.yaml Country.mmdb ASN.mmdb geoip.dat geosite.dat; do
  test -r "$PACKAGE/$file"
done
printf '%s  %s\n' ba3ce607747a07f948fc35780e108a4a7c7f552a38b9bd4d115f313ebcb89c20 "$PACKAGE/mihomo-v1.19.32.gz" | sha256sum -c -
if test -e /usr/local/bin/mihomo; then
  # Only resume a config-validation failure from this staged installation.
  test -r "$PACKAGE/config-test.log"
  test ! -e /etc/systemd/system/mihomo.service
fi
test ! -e /etc/systemd/system/mihomo.service
test ! -e /etc/systemd/system/docker.service.d/20-naumi-proxy.conf
id mihomo >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mihomo
install -d -m 750 -o root -g mihomo /etc/mihomo
install -d -m 750 -o mihomo -g mihomo /var/lib/mihomo
gzip -dc "$PACKAGE/mihomo-v1.19.32.gz" > "$PACKAGE/mihomo"
install -m 755 "$PACKAGE/mihomo" /usr/local/bin/mihomo
install -m 640 -o root -g mihomo "$PACKAGE/config.yaml" /etc/mihomo/config.yaml
for file in Country.mmdb ASN.mmdb geoip.dat geosite.dat; do
  install -m 644 "$PACKAGE/$file" "/var/lib/mihomo/$file"
done
/usr/local/bin/mihomo -t -d /var/lib/mihomo -f /etc/mihomo/config.yaml > "$PACKAGE/config-test.log" 2>&1
echo MIHOMO_CONFIG_TEST=PASS
cat > /etc/systemd/system/mihomo.service <<'UNIT'
[Unit]
Description=Naumi staging Mihomo download proxy
Wants=network-online.target
After=network-online.target
[Service]
Type=simple
User=mihomo
Group=mihomo
ExecStart=/usr/local/bin/mihomo -d /var/lib/mihomo -f /etc/mihomo/config.yaml
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/mihomo
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
UNIT
install -d -m 755 /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/20-naumi-proxy.conf <<'DROPIN'
[Unit]
Wants=mihomo.service
After=mihomo.service
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:7897"
Environment="HTTPS_PROXY=http://127.0.0.1:7897"
Environment="NO_PROXY=localhost,127.0.0.1,::1,.local,.aliyuncs.com"
DROPIN
cat > /usr/local/bin/naumi-with-proxy <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
exec env HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 ALL_PROXY=socks5h://127.0.0.1:7897 NO_PROXY=localhost,127.0.0.1,::1,.local,101.133.166.67,120.27.162.85 "$@"
WRAPPER
chmod 755 /usr/local/bin/naumi-with-proxy
systemctl daemon-reload
systemctl enable --now mihomo
systemctl restart docker
systemctl is-enabled mihomo
systemctl is-active mihomo
systemctl is-active docker
/usr/local/bin/mihomo -v
ss -ltnup | grep -E ':7897|:1053' || true
echo 'MIHOMO_INSTALL=PASS HOST=staging LISTEN=loopback TUN=disabled CONTROLLER=disabled'
