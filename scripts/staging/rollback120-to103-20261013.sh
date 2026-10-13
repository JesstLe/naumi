#!/usr/bin/env bash
# Isolated rehearsal by default. Live inverse merge requires explicit --apply.
set -Eeuo pipefail
umask 077
D=/opt/naumi-staging/evidence/data-update-103-20261013
case "${1:---check}" in
 --check)
  docker exec -i naumi-staging-db-1 pg_restore --list < "$D/target.final.before.dump" >/dev/null
  sha256sum -c "$D/source.sha256" >/dev/null
  python3 - "$D" <<'PY'
import json,pathlib,sys
d=pathlib.Path(sys.argv[1]);p=json.loads((d/'naumi_staging.plan.json').read_text())
assert p['plan'] and (d/'APPLIED').exists() and (d/'media.verification.json').exists()
print('ROLLBACK_CHECK=PASS TARGET_BACKUP=READABLE SOURCE_HASH=EXACT PREIMAGES=AVAILABLE')
PY
  ;;
 --rehearse)
  python3 - "$D" <<'PY'
import pathlib,sys,json,importlib.util
d=pathlib.Path(sys.argv[1]);s=importlib.util.spec_from_file_location('rehearsal',d/'rehearse.py')
# Load only helper definitions; no live connection or startup work runs here.
code=(d/'rehearse.py').read_text().split("assert m.sql('postgres'")[0]
ns={};exec(compile(code,'rehearse-helpers','exec'),ns)
m=ns['m'];t=ns['TRIAL'];p=json.loads((d/(t+'.plan.json')).read_text(),parse_float=m.decimal.Decimal)
if m.sql('postgres','SELECT count(*) FROM pg_database WHERE datname='+m.literal(t)).strip()=='0':
 import subprocess
 subprocess.run(['docker','exec',m.CONTAINER,'createdb','-U','naumi_staging',t],check=True)
 with (d/'target.initial.dump').open('rb') as f:
  subprocess.run(['docker','exec','-i',m.CONTAINER,'pg_restore','--no-owner','--no-acl','--exit-on-error','-U','naumi_staging','-d',t],stdin=f,stdout=subprocess.DEVNULL,check=True)
 m.apply(t,p);m.verify(t,p)
m.rollback(t,p)
before=json.loads((d/'baseline.fingerprints.json').read_text())
assert ns['fingerprints'](t)==before,'ROLLBACK_ROW_MISMATCH'
print('ROLLBACK_SCRIPT_REHEARSAL=PASS tables='+str(len(before))+' rows=EXACT target=ISOLATED live_database=UNTOUCHED',flush=True)
m.apply(t,p);m.verify(t,p)
print('RESTORED_BEHAVIOR=ORIGINAL_TARGET_ROWS_EXACT MODIFIED_COPY=REAPPLIED LIVE103=UNCHANGED',flush=True)
import subprocess
subprocess.run(['docker','exec',m.CONTAINER,'dropdb','-U','naumi_staging',t],check=True)
PY
  ;;
 --apply)
  exec 8>/opt/naumi-staging/releases/deploy.lock; flock -w 30 8
  exec 9>/opt/naumi-reverse-hub/releases/deploy.lock; flock -w 30 9
  test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$(cat "$D/image.before")"
  sha256sum -c "$D/config.before.sha256"
  trap 'docker start naumi-staging-app-1 naumi-staging-video-worker-1 >/dev/null' EXIT
  docker stop -t 45 naumi-staging-video-worker-1 naumi-staging-app-1 >/dev/null
  docker exec naumi-staging-db-1 pg_dump -U naumi_staging -d naumi_staging -Fc --no-owner --no-acl > "$D/pre-rollback-$(date -u +%Y%m%dT%H%M%SZ).dump"
  python3 - "$D" <<'PY'
import pathlib,json,sys
d=pathlib.Path(sys.argv[1]);ns={};exec(compile((d/'rehearse.py').read_text().split("assert m.sql('postgres'")[0],'helpers','exec'),ns)
assert ns['fingerprints']('naumi_staging')==json.loads((d/'live.rollback.fingerprints.private.json').read_text()),'LATER_DATABASE_WRITES_DETECTED_ABORT_WITHOUT_OVERWRITE'
PY
  python3 "$D/merge.py" rollback naumi_staging
  # Newly added media remains; no deletion of later business content.
  docker start naumi-staging-app-1 naumi-staging-video-worker-1 >/dev/null
  trap - EXIT
  date -u > "$D/ROLLED_BACK"
  echo LIVE_ROLLBACK=PASS PREIMAGES_RESTORED=1 ADDED_MEDIA_RETAINED=1
  ;;
 *) echo 'Usage: ROLLBACK.sh --check|--rehearse|--apply'; exit 64;;
esac
