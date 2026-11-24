#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
[ "$DIR" = /opt/naumi-staging/evidence/central-backup-archive-20261124-r1 ] || exit 2
exec python3 "$DIR/restore-copy.py" "$@"
