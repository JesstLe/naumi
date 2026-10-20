"""Package only this worktree's source delta. No production or credentials."""
from pathlib import Path
import hashlib, json, os, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/image-resolution-fallback-20261020"
BASE = "d54dcdc01312a47be747f83f720194db8b6147e5"
OUT.mkdir(parents=True, exist_ok=True)
def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.DEVNULL)
def digest(data):
    return hashlib.sha256(data).hexdigest()
names = set(git("diff", "--name-only", BASE).decode().splitlines())
names.update(git("ls-files", "--others", "--exclude-standard").decode().splitlines())
names = sorted(n for n in names if not n.startswith("output/") and n != "tsconfig.json")
records = {}
with zipfile.ZipFile(OUT / "MODIFIED_FILE.zip", "w", zipfile.ZIP_DEFLATED) as modified, zipfile.ZipFile(OUT / "BASELINE.zip", "w", zipfile.ZIP_DEFLATED) as baseline:
    for name in names:
        p = ROOT / name
        try:
            old = git("show", f"{BASE}:{name}")
        except subprocess.CalledProcessError:
            old = None
        new = p.read_bytes() if p.exists() else None
        if old == new:
            continue
        records[name] = {"baseline": digest(old) if old is not None else None, "modified": digest(new) if new is not None else None}
        if old is not None:
            baseline.writestr(name, old)
        if new is not None:
            modified.writestr(name, new)
manifest = {"base": BASE, "branch": git("branch", "--show-current").decode().strip(), "protectedOriginalWorktree": str(ROOT), "files": records}
(OUT / "ARTIFACT_HASHES.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
patch = git("diff", "--binary", BASE)
# git diff does not include brand-new unstaged files, so append genuine no-index additions.
for name in records:
    if records[name]["baseline"] is None and records[name]["modified"] is not None:
        result = subprocess.run(["git", "diff", "--no-index", "--binary", "--", os.devnull, name], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode not in (0, 1):
            raise RuntimeError(result.stderr.decode())
        addition = result.stdout.replace(b"a/" + os.devnull.encode(), b"/dev/null")
        # Already committed new files are present in the primary diff.
        if f"diff --git a/{name} b/{name}".encode() not in patch:
            patch += addition
(OUT / "DIFF_FILE.patch").write_bytes(patch)
rollback = '''#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
python - "$HERE" "${1:?Usage: ROLLBACK.sh /absolute/independent-copy}" <<'PY'
from pathlib import Path
import hashlib,json,sys,zipfile
home=Path(sys.argv[1]).resolve();target=Path(sys.argv[2]).resolve()
manifest=json.loads((home/'ARTIFACT_HASHES.json').read_text(encoding='utf-8'))
if str(target).lower()==str(Path(manifest['protectedOriginalWorktree']).resolve()).lower() or not target.is_dir() or target==Path(target.anchor):
 raise SystemExit('ROLLBACK_HOLD: target must be an existing independent copy')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
for name,row in manifest['files'].items():
 p=(target/name).resolve()
 if not p.is_relative_to(target):raise SystemExit('ROLLBACK_HOLD: path escapes target')
 if sha(p)!=row['modified']:raise SystemExit('ROLLBACK_HOLD: changed copy '+name)
with zipfile.ZipFile(home/'BASELINE.zip') as z:
 for name,row in manifest['files'].items():
  p=target/name
  if row['baseline'] is None:
   if p.exists():p.unlink()
  else:
   p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(name))
for name,row in manifest['files'].items():
 if sha(target/name)!=row['baseline']:raise SystemExit('ROLLBACK_FAIL: '+name)
print('ROLLBACK=PASS FILES='+str(len(manifest['files']))+' BASELINE_HASHES=EXACT NEW_FILES=REMOVED ORIGINAL_WORKTREE=UNCHANGED')
PY
'''
(OUT / "ROLLBACK.sh").write_text(rollback, encoding="utf-8", newline="\n")
(OUT / "ROLLBACK.sh").chmod(0o755)
with zipfile.ZipFile(OUT / "ROLLBACK_BUNDLE.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("ROLLBACK.sh", "ARTIFACT_HASHES.json", "BASELINE.zip"):
        info=zipfile.ZipInfo(name);info.create_system=3;info.external_attr=(0o100755 if name.endswith('.sh') else 0o100644)<<16
        z.writestr(info,(OUT/name).read_bytes())
for name in ("MODIFIED_FILE.zip", "BASELINE.zip", "ROLLBACK_BUNDLE.zip"):
    with zipfile.ZipFile(OUT/name) as z:
        assert z.testzip() is None
for name,row in records.items():
    assert (digest((ROOT/name).read_bytes()) if (ROOT/name).exists() else None)==row['modified']
print(f"PACKAGE=PASS FILES={len(records)} ZIP_CRC=PASS SOURCE_HASHES=EXACT BASE={BASE}")
