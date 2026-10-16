"""Create reversible source artifacts without touching the active candidate or database."""
import hashlib
import json
import pathlib
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
out = root / "output/brand-packaging-20261016"
out.mkdir(parents=True, exist_ok=True)
base = "c2634fb"
def git(*args):
    return subprocess.check_output(["git", "-C", str(root), *args])
sha = git("rev-parse", "HEAD").decode().strip()
paths = git("diff", "--name-only", base, "HEAD").decode().splitlines()
patch = git("diff", "--binary", base, "HEAD")
(out / "DIFF_FILE.patch").write_bytes(patch)
manifest = {"baseline": base, "candidate": sha, "files": []}
with zipfile.ZipFile(out / "MODIFIED_FILE.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for path in paths:
        data = (root / path).read_bytes()
        old = subprocess.run(["git", "-C", str(root), "show", f"{base}:{path}"], capture_output=True)
        manifest["files"].append({"path": path, "baseline": hashlib.sha256(old.stdout).hexdigest() if old.returncode == 0 else None, "modified": hashlib.sha256(data).hexdigest()})
        z.writestr(path, data)
    z.writestr("SOURCE_MANIFEST.json", json.dumps(manifest, indent=2))
(out / "SOURCE_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
checker = '''import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1]); manifest=json.loads(pathlib.Path(sys.argv[2]).read_text()); phase=sys.argv[3]
for row in manifest['files']:
 p=root/row['path']; expected=row[phase]
 if expected is None:
  assert not p.exists(),f"unexpected remaining file: {p}"
 else:
  assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==expected,f"hash mismatch: {p}"
print('SOURCE_HASHES='+phase.upper()+'_PASS FILES='+str(len(manifest['files'])))
'''
(out / "verify-source.py").write_text(checker, encoding="utf8")
rollback = '''#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
TARGET="${1:?Usage: ROLLBACK.sh /absolute/path/to/isolated-source-copy}"
TARGET="$(cd -- "$TARGET" && pwd)"
test -e "$TARGET/.git"
python "$HERE/verify-source.py" "$TARGET" "$HERE/SOURCE_MANIFEST.json" modified
git -C "$TARGET" apply --reverse --check "$HERE/DIFF_FILE.patch"
git -C "$TARGET" apply --reverse "$HERE/DIFF_FILE.patch"
python "$HERE/verify-source.py" "$TARGET" "$HERE/SOURCE_MANIFEST.json" baseline
echo 'ROLLBACK=PASS SOURCE=BASELINE_RESTORED DATABASE=UNTOUCHED'
'''
(out / "ROLLBACK.sh").write_text(rollback, encoding="utf8", newline="\n")
print(f"ARTIFACTS=CREATED FILES={len(paths)} CANDIDATE={sha}")
