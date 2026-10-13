#!/usr/bin/env bash
# Candidate-only media lifecycle. App cutover/drain belongs to the blue-green
# release coordinator; this helper never overwrites live Compose/env or the DB.
set -Eeuo pipefail
umask 077
test "$#" = 4
MODE=$1 COMMIT=$2 BASELINE=$3 E=$4
[[ "$MODE" =~ ^(prepare|check|drain|resume|rollback)$ ]]
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ && "$BASELINE" =~ ^sha256:[a-f0-9]{64}$ ]]
ROOT=/opt/naumi-staging
[[ "$E" == "$ROOT/evidence/"* && "$E" != *..* ]]
E=$(realpath -e "$E")
[[ "$E" == "$ROOT/evidence/"* ]]
grep -qx ENVIRONMENT=staging "$ROOT/ENVIRONMENT"
grep -qx 103.30.76.93 "$E/TARGET_HOST"
PID=$(cat "$E/lock.pid");kill -0 "$PID"
test "$(readlink /proc/$PID/fd/9)" = "$ROOT/releases/deploy.lock"
test "$(readlink /proc/$PID/fd/8)" = /opt/naumi-reverse-hub/releases/deploy.lock
! flock -n "$ROOT/releases/deploy.lock" true
! flock -n /opt/naumi-reverse-hub/releases/deploy.lock true
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$BASELINE"
NAME=naumi-media-${COMMIT:0:12}
ENV_FILE=$E/media-worker.env
STATE=$E/media-worker.json
SCRATCH=$E/media-worker-scratch
IMAGE=ghcr.io/jesstle/naumi:$COMMIT
ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')
docker image inspect "$IMAGE" | python3 -c 'import json,sys;assert "SOURCE_COMMIT="+sys.argv[1] in json.load(sys.stdin)[0]["Config"]["Env"]' "$COMMIT"
owned() {
  test "$(docker inspect "$NAME" --format '{{index .Config.Labels "naumi.media.evidence"}}')" = "$E"
  test "$(docker inspect "$NAME" --format '{{.Image}}')" = "$ID"
}
request() {
  docker exec -i "$NAME" node - "$1" "$2" <<'JS'
const endpoint=process.argv[2],method=process.argv[3];
(async()=>{const r=await fetch('http://127.0.0.1:3001'+endpoint,{method,headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('MEDIA_HTTP_'+r.status);console.log(JSON.stringify(await r.json()));})().catch(()=>{console.error('MEDIA_CANDIDATE_REQUEST_FAILED');process.exitCode=1;});
JS
}
validate() {
  owned
  request /health GET > "$E/media-health.json"
  python3 - "$E/media-health.json" "$COMMIT" <<'PY'
import json,sys
h=json.load(open(sys.argv[1]));assert h['ok'] is True and h['sandbox'] is True and h['version']==sys.argv[2]
PY
  docker inspect "$NAME" | python3 -c 'import json,sys; c=json.load(sys.stdin)[0];h=c["HostConfig"];assert h["ReadonlyRootfs"] and not h["PortBindings"] and h["Privileged"] is False;assert set(h["CapDrop"])=={"ALL"};assert set(h["CapAdd"])=={"SYS_CHROOT","SETUID","SETGID","CHOWN","DAC_OVERRIDE","FOWNER"};binds=[m for m in c["Mounts"] if m["Type"]=="bind"];assert len(binds)==1 and binds[0]["Destination"]=="/scratch" and binds[0]["Source"]==sys.argv[1];assert all(m["Destination"] in {"/scratch","/data","/tmp","/tmp/naumi-media-sandbox"} for m in c["Mounts"]);assert "/data" in h["Tmpfs"] and "noexec" in h["Tmpfs"]["/tmp"].split(",") and "exec" in h["Tmpfs"]["/tmp/naumi-media-sandbox"].split(",");assert not any(v.split("=",1)[0] in {"DATABASE_URL","SETTINGS_SECRET","R2_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY","VIDEO_WORKER_SECRET"} for v in c["Config"]["Env"])' "$SCRATCH"
}
if [ "$MODE" = prepare ]; then
  if docker inspect "$NAME" >/dev/null 2>&1; then owned;validate;echo MEDIA_CANDIDATE=READY;exit;fi
  test ! -e "$STATE"
  mkdir -m 770 "$SCRATCH";chown 1001:1001 "$SCRATCH"
  python3 - "$ENV_FILE" "$E/media-app-bindings.env" "$NAME" "$SCRATCH" <<'PY'
import pathlib,secrets,sys
secret=secrets.token_hex(32)
pathlib.Path(sys.argv[1]).write_text('MEDIA_WORKER_SECRET='+secret+'\nMEDIA_JOB_DIR=/scratch\n')
pathlib.Path(sys.argv[2]).write_text('MEDIA_WORKER_SECRET='+secret+'\nMEDIA_WORKER_ORIGIN=http://'+sys.argv[3]+':3001\nMEDIA_JOB_DIR=/scratch\nMEDIA_JOB_HOST_DIR='+sys.argv[4]+'\n')
PY
  chmod 600 "$ENV_FILE" "$E/media-app-bindings.env"
  NETWORK=$(docker inspect naumi-staging-app-1 --format '{{json .NetworkSettings.Networks}}' | python3 -c 'import json,sys;v=json.load(sys.stdin);assert len(v)==1;print(next(iter(v)))')
  docker run -d --name "$NAME" --label "naumi.media.evidence=$E" --network "$NETWORK" \
    --restart unless-stopped --user 0:0 --read-only --cap-drop ALL \
    --cap-add SYS_CHROOT --cap-add SETUID --cap-add SETGID --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    --security-opt no-new-privileges --pids-limit 160 --memory 3g --cpus 2 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777 \
    --tmpfs /tmp/naumi-media-sandbox:rw,exec,nosuid,nodev,size=2g,mode=755 --tmpfs /data:rw,size=1m,mode=755 \
    --mount "type=bind,src=$SCRATCH,dst=/scratch" --env-file "$ENV_FILE" \
    --entrypoint node "$ID" scripts/video-media-worker.mjs > "$E/media-container.id"
  python3 - "$STATE" "$NAME" "$ID" "$E" <<'PY'
import json,pathlib,sys
pathlib.Path(sys.argv[1]).write_text(json.dumps(dict(container=sys.argv[2],image=sys.argv[3],evidence=sys.argv[4],candidateOnly=True)))
PY
  for attempt in $(seq 1 30); do if request /health GET > "$E/media-health.json" 2>/dev/null; then break;fi;sleep 2;done
  validate
  echo MEDIA_CANDIDATE=READY
elif [ "$MODE" = check ]; then
  validate;echo MEDIA_CANDIDATE=READY
elif [ "$MODE" = drain ] || [ "$MODE" = resume ]; then
  owned;request "/$MODE" POST > "$E/media-$MODE.json";echo "MEDIA_CANDIDATE_MODE=$MODE"
else
  owned
  # Every running App must be detached before removal. Inspect in memory only;
  # never print process environments or deployment credentials.
  docker inspect $(docker ps -q) | python3 -c 'import json,sys;name=sys.argv[1];assert not any(any(v.startswith("MEDIA_WORKER_ORIGIN=") and ("//"+name+":") in v for v in c["Config"].get("Env",[])) for c in json.load(sys.stdin))' "$NAME"
  request /drain POST > "$E/media-drain.json"
  python3 - "$E/media-drain.json" <<'PY'
import json,sys
h=json.load(open(sys.argv[1]));assert h['running']==h['queued']==h['terminal']==0,'MEDIA_CANDIDATE_NOT_DRAINED'
PY
  docker stop --time 10 "$NAME" > "$E/media-stop.log"
  owned;docker rm "$NAME" > "$E/media-remove.log"
  date -u > "$E/MEDIA_CANDIDATE_ROLLED_BACK"
  echo MEDIA_CANDIDATE_ROLLBACK=PASS
fi
