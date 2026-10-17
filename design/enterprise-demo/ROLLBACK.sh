#!/usr/bin/env bash
set -euo pipefail
TARGET=${1:?Usage: ROLLBACK.sh TARGET [BUNDLE_DIRECTORY]}
BUNDLE=${2:-$(cd -- "$(dirname -- "$0")" && pwd)}
python - "$TARGET" "$BUNDLE" <<'PY'
import hashlib, json, pathlib, sys, zipfile
target=pathlib.Path(sys.argv[1]).resolve()
bundle=pathlib.Path(sys.argv[2]).resolve()
if not target.is_dir():
    raise SystemExit('ROLLBACK_ABORT: target directory missing')
manifest=json.loads((bundle/'MANIFEST.json').read_text(encoding='utf-8'))
def resolve(name):
    p=(target/name).resolve()
    p.relative_to(target)
    return p
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
for entry in manifest['files']:
    if digest(resolve(entry['path'])) != entry['modifiedSha256']:
        raise SystemExit('ROLLBACK_ABORT: modified hash mismatch '+entry['path'])
with zipfile.ZipFile(bundle/'BASELINE_FILE.zip') as z:
    for entry in manifest['files']:
        p=resolve(entry['path'])
        if entry['baselineSha256'] is None:
            p.unlink()
        else:
            data=z.read(entry['path'])
            if hashlib.sha256(data).hexdigest()!=entry['baselineSha256']:
                raise SystemExit('ROLLBACK_ABORT: baseline archive corrupt')
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
for entry in manifest['files']:
    if digest(resolve(entry['path'])) != entry['baselineSha256']:
        raise SystemExit('ROLLBACK_FAIL: restored hash mismatch '+entry['path'])
print('ROLLBACK_PASS: original_hashes=restored new_files=removed target_copy=1')
PY
