#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:?BASELINE, MODIFIED or ROLLBACK}"
case "$MODE" in
  BASELINE) INPUT="$ROOT/ORIGINAL_FILE.json" ;;
  MODIFIED) INPUT="$ROOT/MODIFIED_FILE.json" ;;
  ROLLBACK)
    cp -- "$ROOT/MODIFIED_FILE.json" "$ROOT/rollback-copy.json"
    bash "$ROOT/ROLLBACK.sh" --copy "$ROOT/rollback-copy.json"
    INPUT="$ROOT/rollback-copy.json" ;;
  *) exit 2 ;;
esac
docker cp "$ROOT/hub-concurrency-fixture.mjs" reverse-hub-new-server:/tmp/hub-concurrency-fixture.mjs
docker exec -u 0 reverse-hub-new-server chmod 644 /tmp/hub-concurrency-fixture.mjs
trap 'docker exec -u 0 reverse-hub-new-server rm -f /tmp/hub-concurrency-fixture.mjs' EXIT
FIXTURE_CONFIG="$(cat -- "$INPUT")"
export FIXTURE_CONFIG
docker exec -e FIXTURE_CONFIG reverse-hub-new-server node /tmp/hub-concurrency-fixture.mjs "$MODE"
