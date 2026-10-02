#!/usr/bin/env bash
# Run in a disposable container without a Docker socket or production mounts.
set -Eeuo pipefail
[[ "${NAUMI_VERIFY_RELEASE_FIXTURE:-}" == 1 ]]
test ! -e /opt/naumi/current
test ! -e /etc/nginx/sites-enabled/naumi-ip
mkdir -p /fixture/bin /fixture/source/deploy /opt/naumi/releases/fixture-old /etc/nginx/sites-available /etc/nginx/sites-enabled
export FIXTURE_COMMIT=1111111111111111111111111111111111111111
export FIXTURE_TRACE=/fixture/trace
export FAIL_HEALTH=${FAIL_HEALTH:-0}
export PATH="/fixture/bin:$PATH"
cat > /fixture/bin/docker <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$FIXTURE_TRACE"
case "$*" in
 'ps -q '* ) exit 0 ;;
 'image inspect '* ) echo sha256:fixture ;;
 'inspect '* ) echo "ghcr.io/jesstle/naumi:$FIXTURE_COMMIT" ;;
 'exec naumi-db-1 printenv '* ) echo fixture ;;
 'exec naumi-db-1 pg_dump '* ) echo fixture-database ;;
 'exec naumi-db-1 psql '* ) printf '1\n1\n' ;;
 'exec -i naumi-app-1 node '* ) cat >/dev/null; echo APP_HEALTH=PASS ;;
 'compose '* )
   case "$*" in
    *'config --quiet' ) exit 0 ;;
    *'config --services' ) printf 'db\napp\nvideo-worker\n' ;;
    *'ps --status running --services' ) echo app ;;
    *'ps -q app' ) echo app-fixture ;;
    *'ps -q video-worker' ) exit 0 ;;
    *' up '* | *' stop '* ) exit 0 ;;
    *) echo "unsupported compose fixture operation" >&2; exit 1 ;;
   esac ;;
 *) echo "unsupported fixture operation" >&2; exit 1 ;;
esac
EOF
cat > /fixture/bin/curl <<'EOF'
#!/usr/bin/env bash
[[ "$FAIL_HEALTH" == 0 ]] || exit 1
printf '%s\n' '{"db":{"ok":true},"openai":{"enabled":true}}'
EOF
for tool in nginx systemctl sleep; do
 printf '#!/usr/bin/env bash\nexit 0\n' > "/fixture/bin/$tool"
done
chmod 0755 /fixture/bin/*
cat > /opt/naumi/releases/fixture-old/.env <<'EOF'
VIDEO_WORKER_SECRET=fixture-non-production-worker-secret-00000000
EOF
cat > /opt/naumi/releases/fixture-old/docker-compose.yml <<'EOF'
services:
  db:
    image: postgres:16-alpine
  app:
    image: ghcr.io/jesstle/naumi:old
    environment:
      OPENAI_API_KEY: fixture-unused
      AGENT_MODEL: fixture
      AGENT_VISION_MODEL: fixture
  video-worker:
    image: ghcr.io/jesstle/naumi:old
volumes:
  appdata:
EOF
cat > /etc/nginx/sites-available/naumi-ip <<'EOF'
server {
    return 503;
}
EOF
ln -s /etc/nginx/sites-available/naumi-ip /etc/nginx/sites-enabled/naumi-ip
ln -s /opt/naumi/releases/fixture-old /opt/naumi/current
printf 'server { return 200; }\n' > /fixture/source/deploy/nginx-naumi.conf
tar -czf /fixture/source.tar.gz -C /fixture/source .
printf 'fixture-image' | gzip > /fixture/image.tar.gz
set +e
NAUMI_COORDINATED_RELEASE=1 bash /deploy.sh "$FIXTURE_COMMIT" /fixture/source.tar.gz /fixture/image.tar.gz > /fixture/result 2>&1
status=$?
set -e
grep -q 'return 503;' /etc/nginx/sites-available/naumi-ip
if grep -E ' up .*video-worker' "$FIXTURE_TRACE"; then
 echo 'A coordinated release or rollback started a worker prematurely' >&2
 exit 1
fi
if [[ "$FAIL_HEALTH" == 0 ]]; then
 test "$status" = 0
 grep -q COORDINATED_RELEASE_READY=1 /fixture/result
 test "$(cat /opt/naumi/current/DEPLOYED_COMMIT)" = "$FIXTURE_COMMIT"
 echo COORDINATED_SUCCESS_MAINTENANCE_AND_WORKER_GUARD=PASS
else
 test "$status" != 0
 grep -q ROLLBACK_RESULT=APP_RESTORED_WORKERS_PAUSED_MAINTENANCE_RETAINED /fixture/result
 test "$(readlink -f /opt/naumi/current)" = /opt/naumi/releases/fixture-old
 echo COORDINATED_FAILURE_ROLLBACK_WORKER_GUARD=PASS
fi
