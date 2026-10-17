#!/usr/bin/env bash
set -euo pipefail
TARGET=${1:?Usage: ROLLBACK.sh TARGET_COPY [BUNDLE_DIRECTORY]}
BUNDLE=${2:-$(cd -- "$(dirname -- "$0")" && pwd)}
python - "$TARGET" "$BUNDLE" <<'PY'
import hashlib,json,pathlib,sys,zipfile
target=pathlib.Path(sys.argv[1]).resolve()
bundle=pathlib.Path(sys.argv[2]).resolve()
if not target.is_dir() or not (target/'.enterprise-rollback-fixture').is_file():
    raise SystemExit('ROLLBACK_ABORT: marked disposable code copy required')
manifest=json.loads((bundle/'MANIFEST.json').read_text(encoding='utf-8'))
def resolve(name):
    p=(target/name).resolve()
    p.relative_to(target)
    return p
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
planned=[]
with zipfile.ZipFile(bundle/'BASELINE_FILE.zip') as z:
    # Preflight every current hash and every baseline payload BEFORE the first write.
    for e in manifest['files']:
        p=resolve(e['path'])
        if digest(p)!=e['modifiedSha256']:
            raise SystemExit('ROLLBACK_ABORT: modified hash mismatch '+e['path'])
        data=None if e['baselineSha256'] is None else z.read(e['path'])
        if data is not None and hashlib.sha256(data).hexdigest()!=e['baselineSha256']:
            raise SystemExit('ROLLBACK_ABORT: baseline archive corrupt '+e['path'])
        planned.append((p,data,e))
for p,data,e in planned:
    if data is None:
        p.unlink()
    else:
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(data)
for p,_,e in planned:
    if digest(p)!=e['baselineSha256']:
        raise SystemExit('ROLLBACK_FAIL: restored hash mismatch '+e['path'])
print('ROLLBACK_PASS: original_hashes=restored new_files=removed target_copy=1')
PY
