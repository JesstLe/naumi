#!/bin/bash
# Worker 自动探针 v3 (2026-10-29)：
#  - resume 不依赖 deploy.lock；DB 手术段持锁 10s 拿不到则跳过
#  - 连续 2 轮软复活无效 → 自动硬复活（stop→删状态文件→start→resume）
#  - 状态计数文件 /opt/naumi-staging/releases/.watchdog-fails
LOG=/var/log/worker-watchdog.log
FAILS=/opt/naumi-staging/releases/.watchdog-fails
# v4 release guard (2026-11-06): while any deploy lock is held, a release or
# maintenance session owns worker pause/resume. Never resume or hard-revive then.
for L in /opt/naumi-staging/releases/deploy.lock /opt/naumi-reverse-hub/releases/deploy.lock /opt/reference-workbench/deploy.lock; do
  exec 7>"$L"; if ! flock -n 7; then echo "$(date '+%F %T') deploy lock held ($L), skip" >> "$LOG"; exit 0; fi; flock -u 7; exec 7>&-
done
WORKER=$(docker ps -q --filter name=worker | head -1)
[ -z "$WORKER" ] && exit 0
STATUS=$(docker exec "$WORKER" node -e '
const S=process.env.VIDEO_WORKER_SECRET;
(async()=>{const j=await(await fetch("http://127.0.0.1:3001/status",{headers:{"x-video-worker-secret":S}})).json();
console.log(JSON.stringify({p:j.paused,u:j.uncertain,r:j.revision,b:j.bootId,t:j.lastTick?j.lastTick.id:null}));})().catch(()=>console.log("{}"))
' 2>/dev/null || echo "{}")
PAUSED=$(echo "$STATUS" | grep -o '"p":true' | wc -l)
if [ "$PAUSED" -eq 0 ]; then echo 0 > "$FAILS" 2>/dev/null; exit 0; fi

N=$(cat "$FAILS" 2>/dev/null || echo 0); N=$((N+1)); echo $N > "$FAILS"
echo "$(date '+%F %T') WORKER_PAUSED (round $N) - reviving" >> "$LOG"

# 硬复活：连续 2 轮仍 paused = 软复活救不动（无回执死锁），stop→删→start
if [ "$N" -ge 2 ]; then
  echo "$(date '+%F %T') HARD_REVIVE start" >> "$LOG"
  STATE_DIR=$(docker inspect "$WORKER" --format '{{range .Mounts}}{{if eq .Destination "/release-state"}}{{.Source}}{{end}}{{end}}')
  docker stop -t 25 "$WORKER" >/dev/null 2>&1
  sleep 2
  [ -n "$STATE_DIR" ] && rm -f "$STATE_DIR"/*.json
  docker start "$WORKER" >/dev/null 2>&1
  sleep 12
  echo 0 > "$FAILS"
  # 硬复活后直接 resume（全新状态）
  docker exec "$WORKER" node -e '
const S=process.env.VIDEO_WORKER_SECRET;const uuid=()=>crypto.randomUUID();
fetch("http://127.0.0.1:3001/status",{headers:{"x-video-worker-secret":S}}).then(r=>r.json()).then(st=>{
  if(st.paused)return fetch("http://127.0.0.1:3001/control",{method:"POST",headers:{"x-video-worker-secret":S,"content-type":"application/json"},body:JSON.stringify({action:"resume",operationId:uuid(),bootId:st.bootId,expectedRevision:st.revision})});
}).catch(()=>{})' 2>/dev/null
  sleep 3
  AFTER=$(docker exec "$WORKER" node -e '
const S=process.env.VIDEO_WORKER_SECRET;
fetch("http://127.0.0.1:3001/status",{headers:{"x-video-worker-secret":S}}).then(r=>r.json()).then(j=>console.log(j.paused?"STILL_PAUSED":"REVIVED")).catch(()=>"UNKNOWN")' 2>/dev/null)
  echo "$(date '+%F %T') HARD_REVIVE result=$AFTER" >> "$LOG"
  exit 0
fi

# 软复活（第 1 轮）：DB 手术段（拿锁 10s，拿不到跳过）
exec 9>/opt/naumi-staging/releases/deploy.lock
if flock -w 10 9; then
  docker exec -i $(docker ps -q --filter name=naumi-staging-db) sh -c 'exec psql -X -q -At -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' << 'SQL' 2>/dev/null
UPDATE app_worker_tick_receipts SET phase='completed', completed_at=now(), result=jsonb_build_object('ok',true,'reconciledBy','watchdog') WHERE phase IN('unknown','running');
UPDATE app_release_activities SET state='finished', finished_at=now(), heartbeat_at=now(), outcome='reconciled:watchdog' WHERE activity_kind='accepted-work' AND work_scope IN('durable-image','app-worker-scan') AND state IN('active','unknown') AND (state='unknown' OR heartbeat_at<now()-interval '10 minutes');
UPDATE app_release_boots SET admission='open' WHERE admission='draining' AND started_at>now()-interval '2 hours';
SQL
  flock -u 9
else
  echo "$(date '+%F %T') lock busy, skip SQL surgery" >> "$LOG"
fi

REV=$(echo "$STATUS" | grep -o '"r":[0-9]*' | grep -o '[0-9]*')
BOOTID=$(echo "$STATUS" | grep -o '"b":"[^"]*"' | sed 's/"b":"//;s/"//')
TICKID=$(echo "$STATUS" | grep -o '"t":"[^"]*"' | sed 's/"t":"//;s/"//')
UNCERTAIN=$(echo "$STATUS" | grep -o '"u":true' | wc -l)
if [ "$UNCERTAIN" -gt 0 ] && [ -n "$TICKID" ] && [ "$TICKID" != "null" ]; then
  docker exec "$WORKER" node -e "
const S=process.env.VIDEO_WORKER_SECRET;const uuid=()=>crypto.randomUUID();
fetch('http://127.0.0.1:3001/control',{method:'POST',headers:{'x-video-worker-secret':S,'content-type':'application/json'},body:JSON.stringify({action:'reconcile',operationId:uuid(),bootId:'$BOOTID',expectedRevision:$REV,tickId:'$TICKID'})}).catch(()=>{})" 2>/dev/null
  sleep 3
fi
docker exec "$WORKER" node -e "
const S=process.env.VIDEO_WORKER_SECRET;const uuid=()=>crypto.randomUUID();
fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':S}}).then(r=>r.json()).then(st=>{
  if(st.paused)return fetch('http://127.0.0.1:3001/control',{method:'POST',headers:{'x-video-worker-secret':S,'content-type':'application/json'},body:JSON.stringify({action:'resume',operationId:uuid(),bootId:st.bootId,expectedRevision:st.revision})});
}).catch(()=>{})" 2>/dev/null
echo "$(date '+%F %T') soft revive attempted" >> "$LOG"
