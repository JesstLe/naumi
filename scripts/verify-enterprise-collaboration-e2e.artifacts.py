"""Task-only packaging and zero-write full-preflight rollback, on copies only."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/enterprise-collaboration-e2e/delivery'
BASE = 'e8ff9d67bffb4ac7ed3ade3c68db9257b7d724ee'
FIELDS = 'unreadTotal/membersNextCursor/conversationsNextCursor; authorized GET conversation/:id; targeted SSE; direct title; requestedProject/loadedProjectRequest; selectionPending; canvasOwnerEpochRef'

def run(args, cwd=ROOT):
    result = subprocess.run(args, cwd=cwd, capture_output=True)
    return {'command': [str(v) for v in args], 'input': '', 'stdout': result.stdout.decode('utf-8', errors='replace'), 'stderr': result.stderr.decode('utf-8', errors='replace'), 'exit': result.returncode}

def digest(value):
    return hashlib.sha256(value).hexdigest()

def owned(name):
    return (name.startswith('scripts/verify-enterprise-collaboration-e2e.') or name.startswith('src/components/collaboration/') or name in [
        'src/lib/collaboration/contracts.ts', 'src/lib/collaboration/service.ts',
        'src/app/api/collaboration/conversations/[id]/route.ts', 'src/components/canvas/canvas-client.tsx',
        'docs/changes/2026-11-02-enterprise-collaboration-e2e.md'])

changed = run(['git', 'diff', '--name-only', BASE])['stdout'].splitlines()
untracked = run(['git', 'ls-files', '--others', '--exclude-standard'])['stdout'].splitlines()
targets = sorted(p for p in set(changed + untracked) if owned(p))
assert len(targets) >= 10
OUT.mkdir(parents=True, exist_ok=True)
records = []
with zipfile.ZipFile(OUT/'BASELINE.zip', 'w', zipfile.ZIP_DEFLATED) as before, zipfile.ZipFile(OUT/'MODIFIED_FILE.zip', 'w', zipfile.ZIP_DEFLATED) as after:
    for name in targets:
        original = subprocess.run(['git', 'show', f'{BASE}:{name}'], cwd=ROOT, capture_output=True)
        data = (ROOT/name).read_bytes()
        if original.returncode == 0:
            before.writestr(name, original.stdout)
        after.writestr(name, data)
        records.append({'path': name, 'before': digest(original.stdout) if original.returncode == 0 else None, 'after': digest(data)})
manifest = {'base': BASE, 'source': str(ROOT), 'marker': 'collaboration-e2e-copy-only-v1', 'records': records,
            'archives': {n: digest((OUT/n).read_bytes()) for n in ['BASELINE.zip', 'MODIFIED_FILE.zip']}}
(OUT/'MANIFEST.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
diff = subprocess.run(['git', '-c', 'core.autocrlf=false', 'diff', '--binary', BASE, '--', *targets], cwd=ROOT, capture_output=True).stdout
for name in targets:
    if name in untracked:
        diff += subprocess.run(['git', '-c', 'core.autocrlf=false', 'diff', '--no-index', '--binary', '--', os.devnull, name], cwd=ROOT, capture_output=True).stdout
(OUT/'DIFF_FILE.patch').write_bytes(diff)
with tempfile.TemporaryDirectory(prefix='naumi-e2e-patch-') as temporary:
    with zipfile.ZipFile(OUT/'BASELINE.zip') as z:
        z.extractall(temporary)
    patch_check = run(['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'apply', '--check', str(OUT/'DIFF_FILE.patch')], Path(temporary))
    assert patch_check['exit'] == 0, patch_check
    patch_apply = run(['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'apply', str(OUT/'DIFF_FILE.patch')], Path(temporary))
    assert patch_apply['exit'] == 0, patch_apply
    for entry in records:
        assert digest((Path(temporary)/entry['path']).read_bytes()) == entry['after'], entry['path']

rollback_code = r'''from pathlib import Path
import hashlib,json,sys,zipfile
home=Path(__file__).resolve().parent
def stop():
    print('ROLLBACK=REJECT HASHGUARD_FULL_PREFLIGHT WRITES=0');sys.exit(73)
def hash(b):return hashlib.sha256(b).hexdigest()
try:
    m=json.loads((home/'MANIFEST.json').read_text(encoding='utf-8'))
    root=Path(sys.argv[1]).resolve(strict=True)
    if root==Path(m['source']).resolve() or not root.is_relative_to((home/'copies').resolve()):stop()
    if (root/'.collaboration-copy').read_text() != m['marker']:stop()
    for name,expected in m['archives'].items():
        if hash((home/name).read_bytes())!=expected:stop()
    writes=[]
    with zipfile.ZipFile(home/'BASELINE.zip') as original:
        for entry in m['records']:
            target=root/entry['path']
            if not target.resolve().is_relative_to(root):stop()
            for ancestor in [target,*target.parents]:
                if ancestor==root:break
                if ancestor.is_symlink() or ancestor.is_junction():stop()
            if hash(target.read_bytes()) != entry['after']:stop()
            data=original.read(entry['path']) if entry['before'] else None
            if data is not None and hash(data)!=entry['before']:stop()
            writes.append((target,data))
except (OSError,ValueError,IndexError,KeyError,zipfile.BadZipFile):stop()
# The full target/archive/original preflight is complete before the first write.
for target,data in writes:
    if data is None:target.unlink()
    else:target.write_bytes(data)
print('ROLLBACK=PASS RESTORED='+str(sum(data is not None for _,data in writes))+' REMOVED='+str(sum(data is None for _,data in writes))+' WRITES='+str(len(writes)))
'''
(OUT/'rollback.py').write_text(rollback_code, encoding='utf-8', newline='\n')
(OUT/'ROLLBACK.sh').write_text('#!/usr/bin/env bash\nset -euo pipefail\n[ "$#" -eq 1 ] || { echo "ROLLBACK=REJECT WRITES=0"; exit 73; }\nhere="$(cd -- "$(dirname -- "$0")" && pwd)"\npython "$here/rollback.py" "$1"\n', encoding='utf-8', newline='\n')
os.chmod(OUT/'ROLLBACK.sh', 0o755)
bash = 'D:/DEV/Git/bin/bash.exe' if os.name == 'nt' else 'bash'
assert run([bash, '-c', 'test -x "$1"', '_', str(OUT/'ROLLBACK.sh')])['exit'] == 0

copies = OUT/'copies'; copies.mkdir(exist_ok=True)
def copy(name):
    folder = Path(tempfile.mkdtemp(prefix=name+'-', dir=copies))
    with zipfile.ZipFile(OUT/'MODIFIED_FILE.zip') as z:
        z.extractall(folder)
    (folder/'.collaboration-copy').write_text(manifest['marker'])
    return folder
def hashes(folder):
    return {p.relative_to(folder).as_posix(): digest(p.read_bytes()) for p in folder.rglob('*') if p.is_file()}

restored = copy('rollback')
rollback = run([bash, str(OUT/'ROLLBACK.sh'), str(restored)])
assert rollback['exit'] == 0, rollback
for entry in records:
    target = restored/entry['path']
    assert (digest(target.read_bytes()) if target.exists() else None) == entry['before']
guard = copy('later-edit')
with (guard/records[-1]['path']).open('ab') as f:
    f.write(b'\n# later edit\n')
guard_before = hashes(guard)
guard_result = run([bash, str(OUT/'ROLLBACK.sh'), str(guard)])
assert guard_result['exit'] == 73 and hashes(guard) == guard_before, guard_result
source_before = {e['path']: digest((ROOT/e['path']).read_bytes()) for e in records}
source_guard = run([bash, str(OUT/'ROLLBACK.sh'), str(ROOT)])
assert source_guard['exit'] == 73
assert source_before == {e['path']: digest((ROOT/e['path']).read_bytes()) for e in records}

behavior = run(['node', 'scripts/verify-enterprise-collaboration-e2e.mjs', 'ROLLBACK', str(restored)])
assert behavior['exit'] == 0 and 'COLLABORATION_E2E_BASELINE=REPRODUCED' in behavior['stdout'], behavior
baseline = json.loads((OUT.parent/'BASELINE/RESULT.json').read_text(encoding='utf-8'))
modified = json.loads((OUT.parent/'MODIFIED/RESULT.json').read_text(encoding='utf-8'))
assert baseline['exit'] == modified['exit'] == 0
assert 'checks=16' in modified['stdout']
assert source_before == {e['path']: digest((ROOT/e['path']).read_bytes()) for e in records}

four = [OUT/n for n in ['MODIFIED_FILE.zip', 'DIFF_FILE.patch', 'VERIFICATION.txt', 'ROLLBACK.sh']]
verification = 'Branch: '+run(['git','branch','--show-current'])['stdout'].strip()+'\nFixed HEAD: '+run(['git','rev-parse','HEAD'])['stdout'].strip()+'\nBase: '+BASE+'\nChanged fields: '+FIELDS+'\nFour paths:\n'+'\n'.join(map(str,four))+'\n'
for name,result in [('BASELINE',baseline),('MODIFIED',modified),('ROLLBACK_COMMAND',rollback),('ROLLBACK_BEHAVIOR',behavior),('LATER_EDIT',guard_result),('SOURCE_GUARD',source_guard),('PATCH_CHECK',patch_check),('PATCH_APPLY',patch_apply)]:
    verification += '\n'+name+'\n'+json.dumps(result, ensure_ascii=False, indent=2)+'\n'
for name in ['typecheck-final.txt', 'integration-regression.txt', 'server-regression.txt']:
    verification += '\nREGRESSION '+name+'\n'+(OUT.parent/name).read_text(encoding='utf-8-sig')+'\n'
verification += '\nSOURCE_MODIFIED=YES COPY_ROLLBACK=RESTORED_ORIGINAL_TWO_DEFECTS FULL_PREFLIGHT=YES LATER_EDIT_ZERO_WRITES=YES\n'+json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
with zipfile.ZipFile(four[0]) as z:
    assert z.testzip() is None
    for entry in records:
        assert digest(z.read(entry['path'])) == entry['after']
assert four[1].read_bytes()==diff and four[3].read_text(encoding='utf-8').startswith('#!/usr/bin/env bash')
verification += '\nREOPEN=PASS ZIP_CRC_AND_ALL_FILE_HASHES PATCH_BYTES EXECUTABLE_ROLLBACK\n'
(OUT/'VERIFICATION.txt').write_text(verification,encoding='utf-8',newline='\n')
assert (OUT/'VERIFICATION.txt').read_text(encoding='utf-8')==verification
(OUT/'ROLLBACK_RESULT.json').write_text(json.dumps({'rollback':rollback,'behavior':behavior,'guards':[guard_result,source_guard],'restoredCopy':str(restored)},indent=2),encoding='utf-8')
print(f'ARTIFACTS=PASS TARGETS={len(records)} COPY_ROLLBACK=RESTORED LATER_EDIT_EXIT=73 ZERO_WRITES=YES SOURCE_MODIFIED=YES REOPEN=PASS')
print('ROLLBACK_COPY='+str(restored))
