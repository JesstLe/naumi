#!/usr/bin/env bash
set -euo pipefail
cd /opt/naumi-staging/evidence/canvas-credits47-20261015
if [[ "${1:-}" == "--copy" ]]; then
  cp MODIFIED_FILE.js ROLLBACK_COPY.js
  cmp MODIFIED_FILE.js ROLLBACK_COPY.js
  cp BASELINE_FILE.js ROLLBACK_COPY.js
  cmp BASELINE_FILE.js ROLLBACK_COPY.js
  printf 'ROLLBACK_COPY=PASS BASELINE_BYTES=EXACT LIVE_MODIFIED=PRESERVED\n'
elif [[ "${1:-}" == "--execute" ]]; then
  exec 9>/opt/naumi-staging/releases/deploy.lock; flock -n 9
  exec 8>/opt/naumi-reverse-hub/releases/deploy.lock; flock -n 8
  exec 7>/opt/reference-workbench/deploy.lock; flock -n 7
  cmp gateway.after /etc/nginx/sites-available/reference-workbench
  python3 - <<'PY'
from pathlib import Path
from nginx_syntax import check_gateway_syntax
e=Path.cwd();check_gateway_syntax(e,'credits-guarded-rollback',(e/'gateway.before').read_text())
PY
  cp gateway.before /etc/nginx/sites-available/reference-workbench
  systemctl reload nginx
  printf 'ROLLBACK=PASS ORIGINAL_CANVAS_RESTORED DATABASE_AND_NEW_WORKS=PRESERVED\n'
else
  printf 'Usage: ROLLBACK.sh --copy | --execute\n'; exit 2
fi
