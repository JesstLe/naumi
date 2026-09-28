#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
baseline="$script_dir/BASELINE_FILE.md"
target="${1:-$script_dir/ROLLBACK_TEST.md}"

cp "$baseline" "$target"
baseline_hash=$(sha256sum "$baseline" | awk '{print toupper($1)}')
restored_hash=$(sha256sum "$target" | awk '{print toupper($1)}')

test "$baseline_hash" = "$restored_hash"
printf 'ROLLBACK_RESULT=PASS\n'
printf 'RESTORED_HASH=%s\n' "$restored_hash"
printf 'RESTORED_MATCH_BASELINE=True\n'
