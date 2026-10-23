#!/usr/bin/env bash
set -euo pipefail
# Restore only the explicitly selected file; this task tests a separate local copy.
test "$#" -eq 1 || { printf '%s\n' 'usage: ROLLBACK.sh TARGET_COPY'; exit 2; }
root="$(git rev-parse --show-toplevel)"
target="$1"
test -f "$target"
tmp="${target}.rollback-tmp"
trap 'rm -f -- "$tmp"' EXIT
git -C "$root" show 9f049b07b4219b46ef8a5cb51bc49a4a0ad33e26:src/lib/billing/client.tsx > "$tmp"
hash="$(sha256sum "$tmp" | cut -d ' ' -f 1)"
test "$hash" = cad02f4661245560e8e1ac532de59b15c4ab08969ba7c147a53d322e3f1c1bd5
mv -- "$tmp" "$target"
printf 'ROLLBACK=PASS SHA256=%s\n' "$hash"
