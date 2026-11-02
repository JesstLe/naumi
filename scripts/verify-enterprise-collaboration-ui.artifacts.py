"""Package only this UI slice; guarded rollback is exercised on independent copies."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/enterprise-collaboration-ui/delivery'
BASE = '09437aaa6f8babfc0e52b28ad049ca72122492a0'

def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, capture_output=True, **kwargs)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def owned(name):
    return (name.startswith('src/components/collaboration/') or name.startswith('src/components/desktop/')
            or name.startswith('scripts/verify-enterprise-collaboration-ui.')
            or name in ['src/app/layout.tsx', 'src/components/canvas/canvas-client.tsx',
                        'src/app/desktop/desktop.css', 'src/app/desktop/[[...segments]]/page.tsx',
                        'docs/changes/2026-11-02-enterprise-collaboration-ui.md'])

changed = run(['git', 'diff', '--name-only', BASE]).stdout.decode().splitlines()
untracked = run(['git', 'ls-files', '--others', '--exclude-standard']).stdout.decode().splitlines()
targets = sorted(set(changed + untracked))
assert targets and all(owned(p) for p in targets), targets
OUT.mkdir(parents=True, exist_ok=True)
records = []
with zipfile.ZipFile(OUT/'BASELINE.zip', 'w', zipfile.ZIP_DEFLATED) as original, zipfile.ZipFile(OUT/'MODIFIED_FILE.zip', 'w', zipfile.ZIP_DEFLATED) as modified:
    for name in targets:
        before = run(['git', 'show', f'{BASE}:{name}'])
        data = (ROOT/name).read_bytes()
        modified.writestr(name, data)
        if before.returncode == 0:
            original.writestr(name, before.stdout)
        records.append({'path': name, 'original': digest(before.stdout) if before.returncode == 0 else None, 'modified': digest(data)})
manifest = {'baseline': BASE, 'source': str(ROOT), 'targets': records, 'archives': {'BASELINE.zip': digest((OUT/'BASELINE.zip').read_bytes()), 'MODIFIED_FILE.zip': digest((OUT/'MODIFIED_FILE.zip').read_bytes())}}
(OUT/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
diff = run(['git', 'diff', '--binary', BASE, '--', *targets]).stdout
for name in targets:
    if name in untracked:
        diff += run(['git', 'diff', '--no-index', '--binary', '--', os.devnull, name]).stdout
(OUT/'DIFF_FILE.patch').write_bytes(diff)
with tempfile.TemporaryDirectory(prefix='naumi-ui-patch-') as temporary:
    patch_copy = Path(temporary)
    with zipfile.ZipFile(OUT/'BASELINE.zip') as archive:
        archive.extractall(patch_copy)
    patch_result = subprocess.run(['git','-c','core.autocrlf=false','-c','core.eol=lf','apply','--check',str(OUT/'DIFF_FILE.patch')],cwd=patch_copy,capture_output=True)
    assert patch_result.returncode == 0, patch_result.stderr.decode(errors='replace')
    patch_result = subprocess.run(['git','-c','core.autocrlf=false','-c','core.eol=lf','apply',str(OUT/'DIFF_FILE.patch')],cwd=patch_copy,capture_output=True)
    assert patch_result.returncode == 0, patch_result.stderr.decode(errors='replace')
    assert all(digest((patch_copy/item['path']).read_bytes())==item['modified'] for item in records)
rollback_py = r'''from pathlib import Path
import hashlib,json,sys,zipfile
BASE=Path(__file__).resolve().parent
manifest=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))
if len(sys.argv)!=2:
 print('ROLLBACK_USAGE: ROLLBACK.sh INDEPENDENT_COPY');sys.exit(64)
root=Path(sys.argv[1]).resolve()
source=Path(manifest['source']).resolve()
if root==source or not root.is_dir() or (root/'.git').exists():
 print('ROLLBACK_REFUSED_SOURCE_OR_GIT');sys.exit(73)
def digest(data):return hashlib.sha256(data).hexdigest()
def fail(name):print('ROLLBACK_HASH_GUARD_MISMATCH='+name+' WRITES=0');sys.exit(73)
for archive,expected in manifest['archives'].items():
 if digest((BASE/archive).read_bytes())!=expected:fail(archive)
with zipfile.ZipFile(BASE/'BASELINE.zip') as original:
 for item in manifest['targets']:
  name=item['path'];target=root/name
  if target.resolve()!=target.absolute() or not target.resolve().is_relative_to(root):fail(name)
  if not target.is_file() or digest(target.read_bytes())!=item['modified']:fail(name)
  if item['original'] is not None and digest(original.read(name))!=item['original']:fail('baseline:'+name)
 # No target changes occur until ALL modified and baseline bytes pass preflight.
 for item in manifest['targets']:
  target=root/item['path']
  if item['original'] is None:target.unlink()
  else:target.write_bytes(original.read(item['path']))
 for item in manifest['targets']:
  target=root/item['path']
  if item['original'] is None:assert not target.exists()
  else:assert digest(target.read_bytes())==item['original']
print('ROLLBACK=RESTORED TARGETS='+str(len(manifest['targets']))+' BASELINE_FEATURE=ABSENT')
'''
(OUT/'rollback.py').write_text(rollback_py, encoding='utf-8', newline='\n')
shell = '#!/usr/bin/env bash\nset -euo pipefail\nHERE="$(cd -- "$(dirname -- "$0")" && pwd)"\nexec python "$HERE/rollback.py" "$@"\n'
(OUT/'ROLLBACK.sh').write_text(shell, encoding='utf-8', newline='\n')
os.chmod(OUT/'ROLLBACK.sh', 0o755)
manifest_hash = digest((OUT/'manifest.json').read_bytes())
rollback_py = rollback_py.replace("manifest=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))", f"assert hashlib.sha256((BASE/'manifest.json').read_bytes()).hexdigest()=='{manifest_hash}', 'manifest integrity mismatch'\nmanifest=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))")
(OUT/'rollback.py').write_text(rollback_py, encoding='utf-8', newline='\n')
bash = r'D:\DEV\Git\bin\bash.exe' if os.name == 'nt' else 'bash'
history = []

def record(label, args, expected, input_desc):
    result = run(args)
    output = result.stdout.decode('utf-8', errors='replace').strip()
    stderr = result.stderr.decode('utf-8', errors='replace').strip()
    history.append({'label': label, 'command': subprocess.list2cmdline([str(v) for v in args]), 'input': input_desc, 'output': output, 'stderr': stderr, 'exit': result.returncode})
    assert result.returncode == expected, history[-1]
    return output

copy_root = OUT/'rollback-copy'
guard_root = OUT/'later-edit-copy'
baseline_root = OUT/'baseline-copy'
for directory in [copy_root, guard_root, baseline_root]:
    directory.mkdir(exist_ok=True)
with zipfile.ZipFile(OUT/'MODIFIED_FILE.zip') as archive:
    archive.extractall(copy_root); archive.extractall(guard_root)
with zipfile.ZipFile(OUT/'BASELINE.zip') as archive:
    archive.extractall(baseline_root)
probe = ROOT/'scripts/verify-enterprise-collaboration-ui.baseline.mjs'
record('BASELINE', ['node', str(probe), str(baseline_root)], 0, f'Original bytes of {BASE}; added files absent')
record('MODIFIED', ['node', str(probe), str(ROOT), '--modified'], 0, 'Working source remains modified')
record('EXECUTABLE', [bash, '-c', 'test -x "$1" && printf "ROLLBACK_EXECUTABLE=YES\\n"', '_', str(OUT/'ROLLBACK.sh')], 0, 'Executable ROLLBACK.sh')
record('ROLLBACK', [bash, str(OUT/'ROLLBACK.sh'), str(copy_root)], 0, 'Independent full target copy; all hashes preflighted')
record('RESTORED_BEHAVIOR', ['node', str(probe), str(copy_root)], 0, 'Restored baseline copy; original feature still absent')
guard_file = guard_root/records[-1]['path']
guard_file.write_bytes(guard_file.read_bytes()+b'\n# later edit\n')
guard_before = {x['path']: digest((guard_root/x['path']).read_bytes()) for x in records}
record('LATER_EDIT_GUARD', [bash, str(OUT/'ROLLBACK.sh'), str(guard_root)], 73, 'Last target intentionally edited to prove whole-target preflight')
assert all(digest((guard_root/name).read_bytes()) == value for name,value in guard_before.items())
record('SOURCE_GUARD', [bash, str(OUT/'ROLLBACK.sh'), str(ROOT)], 73, 'Original worktree is explicitly rejected; zero writes')
for item in records:
    assert digest((ROOT/item['path']).read_bytes()) == item['modified']
with zipfile.ZipFile(OUT/'MODIFIED_FILE.zip') as archive:
    assert all(digest(archive.read(item['path'])) == item['modified'] for item in records)
checks = json.loads((OUT.parent/'result.json').read_text(encoding='utf-8'))
browser_log = (OUT.parent/'browser.log').read_text(encoding='utf-8-sig').strip()
history.append({'label':'MODIFIED_BROWSER','command':'node scripts/verify-enterprise-collaboration-ui.mjs','input':'React 19 actual components; two identities; randomized loopback HTTP fixture','output':browser_log,'stderr':'','exit':0 if browser_log.splitlines()[-1].startswith('COLLABORATION_UI=PASS') else 1})
assert history[-1]['exit']==0
typecheck = (OUT.parent/'typecheck.txt').read_text(encoding='utf-8-sig').strip()
assert not typecheck, typecheck
assert (OUT.parent/'typecheck-exit.txt').read_text(encoding='utf-8-sig').strip()=='0'
assert (OUT.parent/'browser-exit.txt').read_text(encoding='utf-8-sig').strip()=='0'
history.append({'label':'MODIFIED_TYPES','command':'node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false','input':'Entire current worktree TypeScript graph, no emit, React19 matched dependency junction','output':'<no output>','stderr':'','exit':0})
verification = [f'BASELINE_SHA={BASE}', 'BRANCH='+run(['git','branch','--show-current']).stdout.decode().strip(), 'CHANGED=Root CollaborationProvider + account/enterprise generation fences + Canvas/Desktop entries + messaging/upload/share interaction',
                'PUBLIC_API=useCollaboration(): available/unread/open(CollaborationOpen?)/share(CollaborationShareIntent)',
                'EVIDENCE=LOCAL_REACT19_HTTP_FIXTURE; REAL_BACKEND=0; PRODUCTION=NOT_DEPLOYED; SUPPLIER_CALLS=0; PG_CONTAINERS=0']
for name in ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']:
    verification.append(name+'='+str(OUT/name))
for entry in history:
    verification.extend(['',entry['label'], 'COMMAND='+entry['command'], 'INPUT='+entry['input'], 'OUTPUT:\n'+(entry['output'] or '<no output>'), 'STDERR='+entry['stderr'], 'EXIT='+str(entry['exit'])])
verification.extend(['', 'PATCH_APPLY_EXACT_HASH=PASS', 'LATER_EDIT_ZERO_WRITES=PASS', 'SOURCE_REMAINS_MODIFIED=YES', 'RESTORED_STATUS=Baseline original bytes and absent new feature on independent copy only', 'ARTIFACT_REOPEN=all zip members, patch UTF8, verification UTF8, executable shell read back', '', 'FILE_HASHES='+json.dumps(records,ensure_ascii=False,indent=2)])
(OUT/'VERIFICATION.txt').write_text('\n'.join(verification)+'\n',encoding='utf-8')
for name in ['DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']:
    content=(OUT/name).read_text(encoding='utf-8');assert content
print('ARTIFACTS=PASS TARGETS='+str(len(records))+' COPY_ROLLBACK=RESTORED LATER_EDIT_EXIT=73 ZERO_WRITES=YES SOURCE_MODIFIED=YES')
print('DELIVERY_DIR='+str(OUT))
