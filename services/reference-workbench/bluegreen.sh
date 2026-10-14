#!/usr/bin/env bash
set -euo pipefail
BASE=/opt/reference-workbench
VERSION="${1:?version}"; ARCHIVE="${2:?archive}"; ACTION="${3:-prepare}"
[[ "$VERSION" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
exec 9>"$BASE/deploy.lock"; flock -n 9 || { echo DEPLOY_LOCK=BUSY; exit 75; }
EVIDENCE="$BASE/evidence/bluegreen-$VERSION"; mkdir -p "$EVIDENCE"
RELEASE="$BASE/releases/$VERSION"
if [[ "$ACTION" == prepare ]]; then
  [[ ! -e "$RELEASE" ]] || exit 2
  CURRENT=$(readlink -f "$BASE/current")
  printf '%s\n' "$CURRENT" > "$EVIDENCE/baseline-release.txt"
  cp /etc/nginx/sites-available/reference-workbench "$EVIDENCE/baseline-nginx.conf"
  systemctl cat reference-workbench-17847 reference-workbench-17848 > "$EVIDENCE/baseline-units.txt" 2>&1 || true
  PORT=17848; if grep -q ':17848;' "$EVIDENCE/baseline-nginx.conf"; then PORT=17847; fi
  OLD_PORT=17847; [[ "$PORT" == 17847 ]] && OLD_PORT=17848
  printf '%s\n' "$PORT" > "$EVIDENCE/port"; printf '%s\n' "$OLD_PORT" > "$EVIDENCE/old-port"
  python3 - "$BASE/data/workbench.sqlite" "$EVIDENCE/before.sqlite" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c,sqlite3.connect(sys.argv[2]) as d:
 c.backup(d);assert d.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
PY
  mkdir -p "$RELEASE"; tar -xzf "$ARCHIVE" -C "$RELEASE"
  python3 -m venv "$RELEASE/venv"
  "$RELEASE/venv/bin/pip" install -q -r "$RELEASE/requirements.txt" > "$EVIDENCE/install.log" 2>&1
  # 候选允许完整API旁路验收，但还不领取任务；线上旧槽和任务不重启。
  touch "$BASE/data/drain-$VERSION"
  chown reference-workbench:reference-workbench "$BASE/data/drain-$VERSION"
  cat > "/etc/systemd/system/reference-workbench-$PORT.service" <<EOF
[Unit]
Description=Reference workbench blue-green slot $VERSION
After=network-online.target
[Service]
User=reference-workbench
Group=reference-workbench
WorkingDirectory=$RELEASE
Environment=WORKBENCH_DATA=$BASE/data
Environment=WORKBENCH_VERSION=$VERSION
Environment=WORKBENCH_SLOT=$VERSION
Environment=WORKBENCH_RECOVER=0
ExecStart=$RELEASE/venv/bin/uvicorn app:app --host 127.0.0.1 --port $PORT --proxy-headers --forwarded-allow-ips=127.0.0.1 --no-access-log
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$BASE/data
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl start "reference-workbench-$PORT"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORT/health" | grep -F "$VERSION"; then break; fi; sleep 1
  done
  curl -fsS "http://127.0.0.1:$PORT/health" | grep -F "$VERSION"
  curl -fsS https://47.105.59.142/health > "$EVIDENCE/blue-still-live.json"
  echo BLUEGREEN_PREPARE=PASS BLUE_UNTOUCHED=1 GREEN_WORKERS=PAUSED
  exit
fi
PORT=$(cat "$EVIDENCE/port"); OLD_PORT=$(cat "$EVIDENCE/old-port")
if [[ "$ACTION" == promote ]]; then
  [[ "$(readlink -f "$BASE/current")" == "$(cat "$EVIDENCE/baseline-release.txt")" ]] || { echo BASELINE_CHANGED=1; exit 75; }
  cmp /etc/nginx/sites-available/reference-workbench "$EVIDENCE/baseline-nginx.conf" || { echo GATEWAY_CHANGED=1; exit 75; }
  [[ -f "$EVIDENCE/candidate-acceptance.json" ]] || { echo CANDIDATE_ACCEPTANCE=MISSING; exit 2; }
  curl -fsS "http://127.0.0.1:$PORT/health" | grep -F "$VERSION"
  # 拷贝基线改唯一回环目标，保留证书、入口限制和真实用户连接。
  sed "s/127.0.0.1:$OLD_PORT/127.0.0.1:$PORT/g" "$EVIDENCE/baseline-nginx.conf" > /etc/nginx/sites-available/reference-workbench
  nginx -t || { cp "$EVIDENCE/baseline-nginx.conf" /etc/nginx/sites-available/reference-workbench; exit 1; }
  systemctl reload nginx
  for _ in $(seq 1 30); do if curl -fsS https://47.105.59.142/health | grep -F "$VERSION"; then break; fi; sleep 1; done
  curl -fsS https://47.105.59.142/health | grep -F "$VERSION"
  rm -- "$BASE/data/drain-$VERSION"
  systemctl enable "reference-workbench-$PORT" >/dev/null
  ln -sfn "$RELEASE" "$BASE/current.next"; mv -Tf "$BASE/current.next" "$BASE/current"
  echo BLUEGREEN_PROMOTE=PASS NEW_LANE=waiting_geometry_v2 OLD_WORKER_AND_CONNECTIONS=RETAINED
  exit
fi
if [[ "$ACTION" == drain ]]; then
  # 旧f6只读waiting，旧72只读v1，新版只读v2；旧槽不能抢新保真任务。
  # 更老网关worker进程的长请求排空也是条件，不能仅凭DB为空杀旧进程。
  for _ in $(seq 1 1800); do
    LEFT=$(python3 - "$BASE/data/workbench.sqlite" "$VERSION" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
 print(c.execute("SELECT count(*) FROM tasks t WHERE t.state IN ('waiting','waiting_geometry_v1') OR (t.state IN ('running','editing','inferring') AND NOT EXISTS (SELECT 1 FROM worker_owners o WHERE o.task_id=t.id AND o.slot=?))",(sys.argv[2],)).fetchone()[0])
PY
)
    OLD_NGINX=$(ps -eo args | grep -c '[n]ginx: worker process is shutting down' || true)
    if [[ "$LEFT" == 0 && "$OLD_NGINX" == 0 ]]; then break; fi
    printf 'DRAIN_WAIT LEGACY_TASKS=%s OLD_NGINX=%s\n' "$LEFT" "$OLD_NGINX"; sleep 2
  done
  [[ "$LEFT" == 0 && "$OLD_NGINX" == 0 ]] || { echo DRAIN_PENDING=KEEP_BLUE_RUNNING; exit 75; }
  systemctl stop "reference-workbench-$OLD_PORT"
  systemctl disable "reference-workbench-$OLD_PORT" >/dev/null 2>&1 || true
  echo BLUEGREEN_DRAIN=PASS OLD_TASKS=0 OLD_CONNECTIONS=0 BLUE_STOPPED_AFTER_GREEN_READY=1
  exit
fi
if [[ "$ACTION" == rollback ]]; then
  # 保留新槽Worker，已接收的新任务仍由其完成；只回退入口，不回灌DB。
  systemctl start "reference-workbench-$OLD_PORT"
  curl -fsS "http://127.0.0.1:$OLD_PORT/health"
  cp "$EVIDENCE/baseline-nginx.conf" /etc/nginx/sites-available/reference-workbench
  nginx -t; systemctl reload nginx
  ln -sfn "$(cat "$EVIDENCE/baseline-release.txt")" "$BASE/current.next"; mv -Tf "$BASE/current.next" "$BASE/current"
  systemctl enable "reference-workbench-$OLD_PORT" >/dev/null
  echo BLUEGREEN_ROLLBACK=PASS DB_AND_ACCEPTED_TASKS=RETAINED GREEN_WORKER=RETAINED
  exit
fi
exit 2
