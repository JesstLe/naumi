#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
test ! -e /opt/naumi/current
P="$ROOT/config/public-nginx-package"
install -d -m 700 "$P"
cd "$P"
apt-get download nginx=1.24.0-2ubuntu7.18 nginx-common=1.24.0-2ubuntu7.18
sha256sum *.deb > SHA256SUMS
test ! -e /usr/local/lib/naumi-staging-web
install -d -m 755 /usr/local/lib/naumi-staging-web
for f in *.deb; do dpkg-deb --extract "$f" /usr/local/lib/naumi-staging-web; done
ldd /usr/local/lib/naumi-staging-web/usr/sbin/nginx
/usr/local/lib/naumi-staging-web/usr/sbin/nginx -v
echo 'NGINX_PACKAGE=EXTRACTED OFFICIAL_UBUNTU=1 SYSTEM_PACKAGE_INSTALLED=0 EXISTING_SERVICES_CHANGED=0'
