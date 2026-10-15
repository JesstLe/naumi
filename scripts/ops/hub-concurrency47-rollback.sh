#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--copy" ]]; then
  python3 - "$ROOT" "$2" <<'PY'
import hashlib,pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve(); target=pathlib.Path(sys.argv[2]).resolve()
assert target != pathlib.Path('/opt/naumi-reverse-hub/config/hub.json')
assert target.parent == root and target.is_file() and not target.is_symlink()
original=(root/'ORIGINAL_FILE.json').read_bytes()
modified=(root/'MODIFIED_FILE.json').read_bytes()
assert target.read_bytes() == modified
target.write_bytes(original)
assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(original).digest()
print('ROLLBACK_COPY=PASS; ORIGINAL_SHA256='+hashlib.sha256(original).hexdigest()+'; LIVE_UNCHANGED=TRUE')
PY
else
  exec python3 "$ROOT/hub-concurrency47.py" --rollback
fi
