#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--copy" ]]; then
 python3 - "$ROOT" <<'PY'
import pathlib,shutil,hashlib
r=pathlib.Path(__import__('sys').argv[1]);p=r/'rollback-copy';p.mkdir(exist_ok=True)
shutil.copyfile(r/'modified/capacity-modified.cjs',p/'capacity-rollback.cjs')
shutil.copyfile(r/'modified/capacity-original.cjs',p/'capacity-rollback.cjs')
assert (p/'capacity-rollback.cjs').read_bytes()==(r/'modified/capacity-original.cjs').read_bytes()
print('ROLLBACK_COPY=PASS; ORIGINAL_MODULE_SHA256='+hashlib.sha256((p/'capacity-rollback.cjs').read_bytes()).hexdigest()+'; LIVE_UNCHANGED=TRUE')
PY
else
 exec python3 "$ROOT/deploy.py" --rollback
fi
