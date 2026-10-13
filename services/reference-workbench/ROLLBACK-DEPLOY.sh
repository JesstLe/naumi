#!/usr/bin/env bash
set -euo pipefail
BASE=/opt/reference-workbench
[[ "${1:-}" == --check || "${1:-}" == --apply ]] || exit 2
PREVIOUS=$(cat "$BASE/evidence/previous-release.txt")
if [[ -n "$PREVIOUS" ]]; then
  [[ "$PREVIOUS" == "$BASE/releases/"* && -f "$PREVIOUS/app.py" && -x "$PREVIOUS/venv/bin/uvicorn" ]] || exit 2
fi
[[ -f "$BASE/data/workbench.sqlite" && -f "$BASE/data/master.key" ]] || exit 2
if [[ "$1" == --check ]]; then echo ROLLBACK_CHECK=PASS DATA_AND_KEY=RETAINED; exit; fi
exec 9>"$BASE/deploy.lock"; flock -n 9 || exit 75
if [[ -n "$PREVIOUS" ]]; then
  ln -sfn "$PREVIOUS" "$BASE/current.next"; mv -Tf "$BASE/current.next" "$BASE/current"
  if [[ -f "$BASE/evidence/rollback-nginx.conf" ]]; then
    OLD_PORT=$(grep 'proxy_pass' "$BASE/evidence/rollback-nginx.conf" | sed -E 's/.*:([0-9]+);/\1/' | head -1)
    UNIT="reference-workbench-$OLD_PORT"
    if [[ ! -f "/etc/systemd/system/$UNIT.service" ]]; then UNIT=reference-workbench; fi
    systemctl start "$UNIT"
    curl -fsS "http://127.0.0.1:$OLD_PORT/health"
    cp "$BASE/evidence/rollback-nginx.conf" /etc/nginx/sites-available/reference-workbench
    nginx -t; systemctl reload nginx
    systemctl enable "$UNIT" >/dev/null
  else
    systemctl restart reference-workbench
  fi
else
  systemctl stop reference-workbench
fi
echo ROLLBACK=APPLIED DATA_AND_KEY=RETAINED NO_DATABASE_RESTORE=1
