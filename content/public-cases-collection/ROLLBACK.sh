#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="${1:?Usage: ROLLBACK.sh path/to/catalog-copy.json}"
target="$(cd -- "$(dirname -- "$target")" && pwd)/$(basename -- "$target")"
if [[ "$target" == "$root/catalog.json" || "$target" == "$root/catalog.baseline.json" ]]; then
  echo 'COPY_REQUIRED: keep the delivered catalog changed'
  exit 64
fi
expected="$(sha256sum "$root/catalog.json" | cut -d' ' -f1)"
actual="$(sha256sum "$target" | cut -d' ' -f1)"
[[ "$actual" == "$expected" ]] || { echo 'HASH_MISMATCH'; exit 65; }
cp -- "$root/catalog.baseline.json" "$target"
cmp --silent "$root/catalog.baseline.json" "$target"
echo 'ROLLBACK_PASS restored=empty-catalog cases=0'
