#!/usr/bin/env python3
"""Host-local only. A configuration publication, not a Web/Worker release.

The existing unique production owner invokes this AFTER its program transaction
is COMPLETE. No SSH, restart, create/stop/rm container, Nginx change or generation.
"""
import argparse, datetime, hashlib, json, os, pathlib, re, uuid
from release47_host import HostTransaction, require, public_identity, environment

HOST_SHA='eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
LOCKS=['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
def sha(raw):return hashlib.sha256(raw).hexdigest()
def load(path):return json.loads(pathlib.Path(path).read_bytes())

def check_canonical(raw,expected):
    state=json.loads(raw);require(sha(raw)==expected['canonicalSha256'] and state['revision']==expected['canonicalRevision'],'CANONICAL_CAS_CHANGED')
    release=state.get('normalBlueGreenReleases',{}).get(expected['releaseId'],{})
    require(state.get('activeNormalBlueGreenReleaseId')==expected['releaseId'] and release.get('phase')=='COMPLETE','PROGRAM_TRANSACTION_NOT_COMPLETE')
    return {'releaseId':expected['releaseId'],'phase':release['phase'],'revision':state['revision'],'canonicalSha256':sha(raw)}

def run(args):
    spec=load(args.spec);root=pathlib.Path(spec['bundleRoot']).resolve();evidence=pathlib.Path(spec['evidenceRoot'])
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(),'BUNDLE_REQUIRED')
    plan=load(root/'PLAN.json');require(re.fullmatch(r'[0-9a-f-]{36}',plan['operationId']) is not None,'OPERATION_ID_INVALID')
    require(spec['target']=='47.105.59.142' and spec['mode'] in ['PLAN','APPLY','VERIFY','ROLLBACK'],'EXPLICIT_TARGET_MODE_REQUIRED')
    require(re.fullmatch(r'[0-9a-f]{64}',spec['web']['id']) is not None,'FULL_WEB_ID_REQUIRED')
    files=load(root/'BUNDLE_HASHES.json');require('apib-activation.cjs' in files and 'PLAN.json' in files,'BUNDLE_MANIFEST_INCOMPLETE')
    for name,expected in files.items():
        require(pathlib.PurePosixPath(name).name==name,'FLAT_BUNDLE_REQUIRED')
        p=(root/name).resolve();require(p.is_relative_to(root) and p.is_file() and sha(p.read_bytes())==expected,'BUNDLE_HASH_CHANGED')
    with HostTransaction(spec['target'],HOST_SHA,evidence) as tx:
        before=CANON.read_bytes();lifecycle=check_canonical(before,spec)
        web=public_identity(tx.inspect(spec['web']['id']));require(web==spec['web'] and web['running'],'WEB_IDENTITY_CHANGED')
        env=environment(tx.inspect(web['id']));require(env.get('SOURCE_COMMIT')==spec['sourceCommit'] and env.get('BUILD_VERSION')==str(spec['buildVersion']),'WEB_VERSION_CHANGED')
        tx.run(['docker','exec',web['id'],'sh','-c','test -d /app/node_modules/pg && test -d /app/node_modules/sharp && test -d /app/node_modules/next'])
        container_root='/tmp/apib-activation-'+plan['operationId']
        # First PLAN installs only private administrative artifacts. Repeated
        # PLAN and later phases NEVER overwrite durable requests/publications.
        marker=tx.run(['docker','exec',web['id'],'sh','-c','if [ -f "$1/PLAN.json" ]; then echo EXISTS; else echo ABSENT; fi','sh',container_root]).strip()
        if marker==b'ABSENT':
            require(spec['mode']=='PLAN','RUN_PLAN_FIRST')
            tx.run(['docker','exec',web['id'],'mkdir','-p',container_root])
            tx.run(['docker','exec',web['id'],'chmod','700',container_root])
            for name in files:tx.run(['docker','cp',str(root/name),web['id']+':'+container_root+'/'+name])
        else:
            for name,expected in files.items():
                raw=tx.run(['docker','exec',web['id'],'cat',container_root+'/'+name]);require(sha(raw)==expected,'EXISTING_IMMUTABLE_BUNDLE_CHANGED')
        proof={'scope':'host-three-lock-apib-config','target':spec['target'],'operationId':plan['operationId'],'locks':LOCKS,'lifecycle':lifecycle,'web':web,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        proof_bytes=json.dumps(proof).encode()
        tx.run(['docker','exec','-i',web['id'],'sh','-c','umask 077; cat > "$1/LOCK_PROOF.json"','sh',container_root],stdin=proof_bytes)
        try:
            output=tx.run(['docker','exec','-e','NODE_OPTIONS=--conditions=react-server --max-old-space-size=768','-e','NODE_PATH=/app/node_modules',web['id'],'node',container_root+'/apib-activation.cjs',spec['mode'],container_root],timeout=300)
            require(CANON.read_bytes()==before,'CANONICAL_CHANGED_DURING_CONFIGURATION_WINDOW');tx.pin(web)
        finally:
            # Also export UNKNOWN/failed operation receipts. Never replace the
            # live task state, and never retry with a fresh publication UUID.
            export=evidence/('container-'+str(uuid.uuid4()));export.mkdir(mode=0o700)
            tx.run(['docker','cp',web['id']+':'+container_root+'/.',str(export)])
        tx.save('result-'+spec['mode'].lower()+'-'+str(uuid.uuid4())+'.json',{'mode':spec['mode'],'operationId':plan['operationId'],'web':web,'lifecycle':lifecycle,'stdout':output.decode(),'supplierGenerationCalls':0})
        print(output.decode().strip())

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--spec',required=True);args=p.parse_args()
    try:run(args)
    except Exception as error:
        # HostTransaction already sanitizes process errors; preserve remote
        # durable evidence and reuse SAME request IDs after unknown outcomes.
        raise SystemExit('APIB_ACTIVATION_HOLD '+type(error).__name__+' '+str(error)) from None
