"""Package this task's staged paths; validate copy-only rollback before delivery."""
import argparse, hashlib, json, os, pathlib, subprocess, zipfile, uuid

parser=argparse.ArgumentParser()
parser.add_argument('--base',required=True)
parser.add_argument('--out',required=True)
args=parser.parse_args()
root=pathlib.Path.cwd().resolve(); out=pathlib.Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
def git(*values): return subprocess.check_output(['git',*values],cwd=root)
def sha(value): return hashlib.sha256(value).hexdigest()
paths=git('diff','--cached','--name-only',args.base).decode().splitlines()
if not paths: raise SystemExit('No staged task paths')
manifest={'base':args.base,'source':str(root),'files':[]}
with zipfile.ZipFile(out/'BASELINE.zip','w',zipfile.ZIP_DEFLATED) as original, zipfile.ZipFile(out/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as modified:
    for name in paths:
        status=subprocess.run(['git','cat-file','-e',f'{args.base}:{name}'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        before=git('show',f'{args.base}:{name}') if status.returncode==0 else None
        after=(root/name).read_bytes() if (root/name).is_file() else None
        if before is not None:original.writestr(name,before)
        if after is not None:modified.writestr(name,after)
        manifest['files'].append({'path':name,'before':sha(before) if before is not None else None,'after':sha(after) if after is not None else None})
manifest['baselineArchive']=sha((out/'BASELINE.zip').read_bytes())
manifest['modifiedArchive']=sha((out/'MODIFIED_FILE.zip').read_bytes())
(out/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'DIFF_FILE.patch').write_bytes(git('diff','--cached','--binary',args.base))
rollback=r'''import hashlib,json,pathlib,sys,zipfile
here=pathlib.Path(__file__).resolve().parent
manifest=json.loads((here/'MANIFEST.json').read_text(encoding='utf-8'))
target=pathlib.Path(sys.argv[1]).resolve()
def digest(value): return hashlib.sha256(value).hexdigest()
def reject(): print('ROLLBACK=REJECT HASHGUARD_FULL_PREFLIGHT WRITES=0');sys.exit(73)
if target==pathlib.Path(manifest['source']).resolve() or (here/'copies').resolve() not in target.parents or not (target/'.copy-only').is_file(): reject()
archive=(here/'BASELINE.zip').read_bytes()
if digest(archive)!=manifest['baselineArchive']:reject()
payload={}
with zipfile.ZipFile(here/'BASELINE.zip') as z:
 for row in manifest['files']:
  p=(target/row['path']).resolve()
  if target not in p.parents or p.is_symlink():reject()
  actual=digest(p.read_bytes()) if p.is_file() else None
  if actual!=row['after']:reject()
  body=z.read(row['path']) if row['before'] else None
  if body is not None and digest(body)!=row['before']:reject()
  payload[row['path']]=body
for name,body in payload.items():
 p=target/name
 if body is None:
  if p.exists():p.unlink()
 else:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
for row in manifest['files']:
 p=target/row['path']
 if (digest(p.read_bytes()) if p.is_file() else None)!=row['before']:raise RuntimeError('Restored hash mismatch')
print(f"ROLLBACK=PASS FILES={len(payload)} BASELINE_BYTES=RESTORED COPY_ONLY=true")
'''
(out/'rollback.py').write_text(rollback,encoding='utf-8')
(out/'ROLLBACK.sh').write_text('#!/usr/bin/env bash\nset -euo pipefail\nhere="$(cd -- "$(dirname -- "$0")" && pwd)"\nexec python "$here/rollback.py" "$@"\n',encoding='utf-8',newline='\n')
os.chmod(out/'ROLLBACK.sh',0o755)
def copy(label):
    dest=out/'copies'/f'{label}-{uuid.uuid4().hex[:8]}';dest.mkdir(parents=True);(dest/'.copy-only').write_text('copy-only',encoding='ascii')
    with zipfile.ZipFile(out/'MODIFIED_FILE.zip') as z:z.extractall(dest)
    return dest
records=[]
def run(command,input_text):
    result=subprocess.run(command,cwd=root,text=True,encoding='utf-8',errors='replace',capture_output=True)
    records.append({'command':command,'cwd':str(root),'input':input_text,'stdout':result.stdout,'stderr':result.stderr,'exit':result.returncode})
    print(result.stdout,end='');return result
baseline=out/'baseline';baseline.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'BASELINE.zip') as z:z.extractall(baseline)
test=str(root/'scripts/verify-dock-reference-layout.cjs')
if run(['node',test,'BASELINE'],'Original product shell/CSS/layout; 60 lines and 16 local PNGs; no stdin').returncode:raise RuntimeError('Baseline mismatch')
if run(['node',test,'MODIFIED'],'Real React/Chromium and product layout; 12 cases; no suppliers').returncode:raise RuntimeError('Modified failure')
restored=copy('rollback');bash='D:/DEV/Git/bin/bash.exe'
if run([bash,str(out/'ROLLBACK.sh'),str(restored)],'Independent changed copy; preflight every target and original archive').returncode:raise RuntimeError('Rollback failed')
if run(['node',test,'ROLLBACK',str(restored)],'Restored independent copy; original nested scrolling, ineffective expansion and clipped menu').returncode:raise RuntimeError('Restored behavior mismatch')
drift=copy('later-edit');last=next(row for row in reversed(manifest['files']) if row['after']);target=drift/last['path'];target.write_bytes(target.read_bytes()+b'\nlater edit\n')
before={row['path']:sha((drift/row['path']).read_bytes()) if (drift/row['path']).is_file() else None for row in manifest['files']}
if run([bash,str(out/'ROLLBACK.sh'),str(drift)],'Last target changed; expect exit73 and zero writes').returncode!=73:raise RuntimeError('Guard failed')
after={row['path']:sha((drift/row['path']).read_bytes()) if (drift/row['path']).is_file() else None for row in manifest['files']}
if before!=after:raise RuntimeError('Partial rollback writes')
with zipfile.ZipFile(out/'MODIFIED_FILE.zip') as z:
    for row in manifest['files']:
        if row['after'] and (sha(z.read(row['path']))!=row['after'] or sha((root/row['path']).read_bytes())!=row['after']):raise RuntimeError('Modified hash mismatch')
verification={'changedFields':'mediaComposerExpanded actual Dock height; one body scroller; body portal reference picker; current caret and selection retained','base':args.base,'artifacts':{name:str(out/name) for name in ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']},'commands':records,'originalHashes':manifest['files'],'restoredBehavior':'Independent copy restores nested_scroll=3, expand_delta=0, mention_clipped=1; source and MODIFIED_FILE keep the fixed layout. No deployment or public release note changes.'}
(out/'VERIFICATION.txt').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
for name in ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']:
    if not (out/name).read_bytes():raise RuntimeError(f'Empty artifact {name}')
print(f'DOCK_REFERENCE_ARTIFACTS=PASS FILES={len(paths)} REOPENED=4 SOURCE=MODIFIED ROLLBACK=BASELINE GUARD_ZERO_WRITES=1')
