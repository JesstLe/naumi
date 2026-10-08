#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(cd -- "$HERE/../.." && pwd)"
if [[ "${1:-}" == "--test" ]]; then
  node "$ROOT/node_modules/tsx/dist/cli.mjs" "$HERE/tests/verify.ts"
else
  node "$ROOT/node_modules/tsx/dist/cli.mjs" "$HERE/rollback.ts" "$@"
fi
