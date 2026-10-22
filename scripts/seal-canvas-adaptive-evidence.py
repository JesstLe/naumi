"""Package task-only source and execute guarded rollback on a separate copy."""
from pathlib import Path
import hashlib, io, json, os, shutil, subprocess, sys, tarfile, zipfile

ROOT=Path.cwd().resolve()
OUT=ROOT/'output/canvas-key-frame-long-image-20261021'
BASE='360b5f8b2c6a15f8d6b85016228d541f4ec7aafe'
SOURCE='7323f1b83f2f33aa341e46c646fbc5cf4e71fcce'
sha=lambda b:hashlib.sha256(b).hexdigest()
changed=subprocess.check_output(['git','diff','--name-only',BASE,SOURCE],text=True).splitlines()
manifest={'baseline':BASE,'source':SOURCE,'files':[]}
with zipfile.ZipFile(OUT/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for name in changed:
        modified=subprocess.check_output(['git','show',SOURCE+':'+name])
        bundle.writestr('modified/'+name,modified)
        old=subprocess.run(['git','show',BASE+':'+name],capture_output=True)
        original=None if old.returncode else old.stdout
        captured=OUT/'baseline'/name
        if original is not None and captured.exists(): original=captured.read_bytes()
        if original is not None: bundle.writestr('baseline/'+name,original)
        manifest['files'].append({'path':name,'original':sha(original) if original is not None else None,'modified':sha(modified)})
    bundle.writestr('manifest.json',json.dumps(manifest,indent=2))
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'DIFF_FILE.patch').write_bytes(subprocess.check_output(['git','diff','--binary',BASE,SOURCE]))
rollback=r'''#!/usr/bin/env bash
set -euo pipefail
target="${1:?Usage: ROLLBACK.sh /absolute/isolated-copy}"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if python3 -c "import sys" >/dev/null 2>&1; then py=python3; else py=python; fi
"$py" - "$target" "$here/MODIFIED_FILE.zip" <<'PY'
from pathlib import Path
import sys,json,hashlib,zipfile
root=Path(sys.argv[1]).resolve()
if not root.is_dir() or not (root/'.adaptive-rollback-copy').is_file() or (root/'.git').exists():
    raise SystemExit('ROLLBACK_REFUSED: isolated marker required; Git checkout never modified')
digest=lambda b:hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(sys.argv[2]) as bundle:
    manifest=json.loads(bundle.read('manifest.json')); entries=[]
    for item in manifest['files']:
        path=(root/item['path']).resolve()
        if not path.is_relative_to(root):raise SystemExit('ROLLBACK_REFUSED: path escape')
        current=digest(path.read_bytes()) if path.exists() else None
        if current not in (item['original'],item['modified']):raise SystemExit('ROLLBACK_REFUSED: unrecognized hash '+item['path'])
        entries.append((item,path))
    restored=removed=0
    for item,path in entries:
        if item['original'] is None:
            if path.exists():path.unlink()
            removed+=1
        else:
            data=bundle.read('baseline/'+item['path'])
            if digest(data)!=item['original']:raise SystemExit('ROLLBACK_REFUSED: baseline hash mismatch')
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);restored+=1
    for item,path in entries:
        if (digest(path.read_bytes()) if path.exists() else None)!=item['original']:raise SystemExit('ROLLBACK_HASH_FAILED')
    print(f'ROLLBACK=PASS ORIGINAL_HASHES={restored} ADDED_REMOVED={removed} TARGET=ISOLATED_COPY PRODUCTION_WRITES=0')
PY
'''
(OUT/'ROLLBACK.sh').write_text(rollback,encoding='utf-8',newline='\n')
os.chmod(OUT/'ROLLBACK.sh',0o755)
copy=OUT/os.environ.get('ROLLBACK_COPY_NAME','rollback-copy')
if copy.exists(): raise SystemExit('Rollback target already exists; preserve previous evidence')
copy.mkdir()
archive=subprocess.check_output(['git','archive',SOURCE])
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for member in tar.getmembers(): assert (copy/member.name).resolve().is_relative_to(copy)
    tar.extractall(copy,filter='data')
(copy/'.adaptive-rollback-copy').write_text(SOURCE,encoding='utf-8')
shutil.copyfile(ROOT/'scripts/verify-canvas-adaptive-handler.ts',copy/'scripts/verify-canvas-adaptive-handler-evidence.ts')
subprocess.run(['powershell','-NoProfile','-Command',f"New-Item -ItemType Junction -Path '{copy/'node_modules'}' -Target 'E:/Workspace/naumi-release47-s3first/node_modules' | Out-Null"],check=True,capture_output=True)
records=[]
def run(name,args,cwd=ROOT,extra=None):
    env=dict(os.environ);env["PATH"]=str(Path(sys.executable).parent)+os.pathsep+env.get("PATH","");env.update(extra or {})
    result=subprocess.run(args,cwd=cwd,env=env,text=True,encoding='utf-8',errors='replace',capture_output=True)
    record={'name':name,'cwd':str(cwd),'command':subprocess.list2cmdline(args),'env':extra or {},'exit':result.returncode,'output':result.stdout+result.stderr}
    records.append(record);(OUT/'transaction.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf-8')
    (OUT/(name+'.txt')).write_text(record['output'],encoding='utf-8');print(record['output'].strip(),flush=True)
    if result.returncode:raise SystemExit(result.returncode)
run('baseline',['node','--import','tsx','--conditions','react-server','scripts/verify-canvas-key-frame.ts','--baseline'],extra={'SOURCE_ROOT':str(OUT/'baseline-tree')})
run('baseline-handler',['node','--import','tsx','--conditions','react-server','scripts/verify-canvas-adaptive-handler.ts','--baseline'],cwd=OUT/'baseline-tree')
run('modified-copy',['node','--import','tsx','--conditions','react-server','scripts/verify-canvas-key-frame.ts'],extra={'SOURCE_ROOT':str(copy)})
run('modified-copy-handler',['node','--import','tsx','--conditions','react-server','scripts/verify-canvas-adaptive-handler-evidence.ts'],cwd=copy)
bash='D:/DEV/Git/bin/bash.exe'
run('rollback',[bash,str(OUT/'ROLLBACK.sh'),str(copy)])
run('rollback-behavior',['node','--import','tsx','--conditions','react-server','scripts/verify-canvas-key-frame.ts','--baseline'],extra={'SOURCE_ROOT':str(copy)})
run('rollback-handler',['node','--import','tsx','--conditions','react-server','scripts/verify-canvas-adaptive-handler-evidence.ts','--baseline'],cwd=copy)
with zipfile.ZipFile(OUT/'MODIFIED_FILE.zip') as bundle:assert bundle.testzip() is None
for item in manifest['files']:assert sha((ROOT/item['path']).read_bytes())==item['modified'],item['path']
print(f'ACTIVE_SOURCE=MODIFIED HASHES={len(changed)} ZIP_CRC=PASS FOUR_ARTIFACTS_PENDING_VERIFICATION_TXT')
