#!/usr/bin/env bash
set -euo pipefail
BASE=/opt/reference-workbench
exec 9>"$BASE/deploy.lock"; flock -n 9 || exit 75
[[ -f /etc/letsencrypt-reference-workbench/live/47.105.59.142/fullchain.pem ]]
cp /etc/nginx/sites-available/reference-workbench "$BASE/evidence/nginx-before-https.conf"
cat > /etc/nginx/sites-available/reference-workbench <<'NGINX'
server {
    listen 80;
    server_name 47.105.59.142;
    location /.well-known/acme-challenge/ { root /opt/reference-workbench/acme; }
    location / { return 308 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    server_name 47.105.59.142;
    ssl_certificate /etc/letsencrypt-reference-workbench/live/47.105.59.142/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt-reference-workbench/live/47.105.59.142/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 310m;
    location / {
        proxy_pass http://127.0.0.1:17847;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1900s;
    }
}
NGINX
cat > /etc/systemd/system/reference-workbench-cert-renew.service <<'UNIT'
[Unit]
Description=Renew workbench short-lived IP certificate
[Service]
Type=oneshot
ExecStart=/opt/reference-workbench/certbot/bin/certbot renew --quiet --config-dir /etc/letsencrypt-reference-workbench --work-dir /var/lib/letsencrypt-reference-workbench --logs-dir /var/log/letsencrypt-reference-workbench --deploy-hook "nginx -t && systemctl reload nginx"
UNIT
cat > /etc/systemd/system/reference-workbench-cert-renew.timer <<'UNIT'
[Unit]
Description=Workbench IP certificate renewal schedule
[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
UNIT
nginx -t; systemctl reload nginx
systemctl daemon-reload; systemctl enable --now reference-workbench-cert-renew.timer
curl -fsS https://47.105.59.142/health
echo HTTPS=PASS CERT_RENEW_TIMER=ACTIVE
