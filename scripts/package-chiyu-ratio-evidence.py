"""Local evidence only. Fixed copy rollback has no server/DB/container operations."""
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tarfile

repo = pathlib.Path(__file__).resolve().parents[1]
out = pathlib.Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
base = 'c2634fba41fd50a117f9af93e63d865e446f7394'
runtime = ['src/app/api/generate-image/route.ts', 'src/lib/imagegen/aspect.ts', 'src/lib/imagegen/output-shape.ts']
sha = lambda b: hashlib.sha256(b).hexdigest()
files = subprocess.check_output(['git', 'diff', '--cached', '--name-only', base], cwd=repo, text=True).splitlines()
assert all(p.startswith(('src/', 'scripts/', 'docs/')) for p in files)
assert set(runtime).issubset(files)
manifest = {}
for name in runtime:
    p = out/'original'/name
    old = subprocess.run(['git', 'show', f'{base}:{name}'], cwd=repo, capture_output=True)
    old_hash = None
    if old.returncode == 0:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(old.stdout)
        old_hash = sha(old.stdout)
    modified = out/'modified'/name
    modified.parent.mkdir(parents=True, exist_ok=True)
    modified.write_bytes((repo/name).read_bytes())
    manifest[name] = {'original': old_hash, 'modified': sha(modified.read_bytes())}
(out/'ORIGINAL_SHA256.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
with tarfile.open(out/'MODIFIED_FILE.tar', 'w') as tf:
    for name in files:
        tf.add(repo/name, arcname=name)
(out/'DIFF_FILE.patch').write_bytes(subprocess.check_output(['git', 'diff', '--cached', '--binary', base], cwd=repo))
archive = subprocess.check_output(['git', 'archive', base], cwd=repo)
for label in ['baseline-copy', 'rollback-copy']:
    target = out/label
    if '--refresh' in sys.argv:
        assert target.is_dir(), f'Existing isolated copy missing: {target}'
        continue
    assert not target.exists(), f'Refuse to overwrite existing copy: {target}'
    target.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
        tf.extractall(target, filter='data')
    # Test instrumentation is separate from the three runtime fields being rolled back.
    shutil.copyfile(repo/'scripts/verify-chiyu-ratio-routes.ts', target/'scripts/verify-chiyu-ratio-routes.ts')
    subprocess.run(['cmd', '/c', 'mklink', '/J', str(target/'node_modules'), str(repo/'node_modules')], check=True, capture_output=True)
    if label == 'rollback-copy':
        for name in runtime:
            (target/name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(repo/name, target/name)
        (target/'.chiyu-ratio-copy').write_text(base, encoding='ascii')
rollback = '''#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd -- "$(dirname -- "$0")" && pwd -P)
export CHIYU_RATIO_EVIDENCE="$DIR"
python - <<'PY'
import hashlib,json,os,pathlib,shutil
d=pathlib.Path(os.environ['CHIYU_RATIO_EVIDENCE']).resolve(); t=d/'rollback-copy'
assert (t/'.chiyu-ratio-copy').read_text()=='c2634fba41fd50a117f9af93e63d865e446f7394'
m=json.loads((d/'ORIGINAL_SHA256.json').read_text())
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for n,v in m.items():
 p=t/n
 assert p.resolve().is_relative_to(t.resolve())
 assert h(p)==v['modified']
 assert h(d/'modified'/n)==v['modified']
 if v['original']:
  assert h(d/'original'/n)==v['original'];shutil.copyfile(d/'original'/n,p)
 else:p.unlink()
for n,v in m.items():
 assert (h(t/n)==v['original']) if v['original'] else not (t/n).exists()
 assert h(d/'modified'/n)==v['modified']
print('ROLLBACK_COPY=PASS RUNTIME_ORIGINAL_HASHES=EXACT ADDED_HELPERS=REMOVED MODIFIED_FILE=UNCHANGED SERVER=UNTOUCHED EXIT=0')
PY
'''
(out/'ROLLBACK.sh').write_text(rollback, encoding='utf-8', newline='\n')
(out/'ROLLBACK.sh').chmod(0o755)
print('PACKAGE=PASS MODIFIED_FILE=READABLE DIFF=CHANGED ORIGINAL_RUNTIME_HASHES=PRESERVED ROLLBACK_TARGET=COPY_ONLY EXIT=0')
