#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=/opt/naumi-staging
EVIDENCE="$ROOT/evidence/public-web-20261009"
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
case "${1:-}" in
    --fixture) UNIT=naumi-staging-public-rollback-fixture.service; PORT=18080 ;;
    --apply) UNIT=naumi-staging-public.service; PORT=80 ;;
    *) echo 'usage: ROLLBACK.sh --fixture|--apply' >&2; exit 64 ;;
esac
test "$(systemctl show "$UNIT" -p FragmentPath --value)" = "/etc/systemd/system/$UNIT"
sha256sum -c "$EVIDENCE/$UNIT.sha256"
systemctl disable --now "$UNIT"
rm -- "/etc/systemd/system/$UNIT"
systemctl daemon-reload
test -z "$(ss -H -lnt "sport = :$PORT")"
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:13012/api/health)" = 200
if test "$1" = --fixture; then
    test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health)" = 200
    sha256sum -c "$EVIDENCE/MODIFIED.sha256"
    echo 'PUBLIC_WEB_ROLLBACK=PASS FIXTURE_PORT=18080 RESTORED=NO_LISTENER MAIN_PORT=80 HEALTH=200 APP=200 MODIFIED_FILE_LEFT_CHANGED=1'
else
    echo 'PUBLIC_WEB_ROLLBACK=PASS PORT=80 RESTORED=NO_PUBLIC_GATEWAY APP=200 FILES_RETAINED=1'
fi
