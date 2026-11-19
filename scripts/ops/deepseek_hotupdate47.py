"""Hot-publish an audited model registry plan under the 47 deployment locks."""
import contextlib,fcntl,hashlib,json,pathlib,subprocess,sys,uuid
ROOT=pathlib.Path('/opt/naumi-staging/evidence/deepseek-text-hotupdate-20261119-r2')
TMP='/tmp/deepseek-text-hotupdate-20261119-r2'
LOCKS=['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']
def stage_source(mode,digest,folder=ROOT):
    exports=sorted(folder.glob('export-*'),key=lambda p:p.stat().st_mtime)
    if mode=='PROBE':
        assert not exports,'PRIOR_PROBE_OR_OPERATION_REQUIRES_RECONCILIATION'
        return folder,['deepseek-text-hotupdate.cjs','DISCOVERY.json']
    assert exports,'ORIGINAL_DURABLE_OPERATION_REQUIRED'
    source=exports[-1]
    assert (source/('PROBE.json' if mode=='PLAN' else 'PLAN.json')).is_file(),'ORIGINAL_DURABLE_PLAN_REQUIRED'
    names=[p.name for p in source.iterdir()]
    assert all((source/n).is_file() and not (source/n).is_symlink() and (n.endswith('.json') or n=='deepseek-text-hotupdate.cjs') for n in names)
    assert hashlib.sha256((source/'deepseek-text-hotupdate.cjs').read_bytes()).hexdigest()==digest
    return source,names
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,timeout=timeout)
    if p.returncode:
        if args[-1]==TMP:print(p.stderr.decode('utf8','replace')[-1800:])
        raise RuntimeError('HOTUPDATE_COMMAND_FAILED_'+str(p.returncode))
    return p.stdout
def main():
    mode,digest=sys.argv[1:];assert mode in ['PROBE','PLAN','APPLY','VERIFY','ROLLBACK']
    bundle=ROOT/'deepseek-text-hotupdate.cjs';assert hashlib.sha256(bundle.read_bytes()).hexdigest()==digest
    with contextlib.ExitStack() as stack:
        for path in LOCKS:
            f=stack.enter_context(open(path,'a+'));fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        canonical=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json');before=canonical.read_bytes()
        state=json.loads(before);manifest=json.loads(pathlib.Path(state['runtimeRecovery']['manifestPath']).read_bytes());web=manifest['web'];worker=manifest['worker']
        identities=json.loads(run(['docker','inspect',web['id'],worker['id']]));assert all(i['State']['Running'] for i in identities);assert identities[0]['Image']==identities[1]['Image']
        present=run(['docker','exec',web['id'],'node','-e',"console.log(require('fs').existsSync(process.argv[1]))",TMP]).strip()==b'true'
        if not present:
            # A different application release may have completed between PLAN
            # and APPLY. Carry the exact durable operation, never rerun probes
            # or create a fresh publication UUID on the successor Web.
            source,names=stage_source(mode,digest)
            run(['docker','exec',web['id'],'mkdir','-m','700',TMP])
            for name in names:
                run(['docker','cp',str(source/name),web['id']+':'+TMP+'/'+name]);run(['docker','exec','--user','0',web['id'],'chown','1001:1001',TMP+'/'+name]);run(['docker','exec',web['id'],'chmod','600',TMP+'/'+name])
        assert run(['docker','exec',web['id'],'sha256sum',TMP+'/deepseek-text-hotupdate.cjs']).decode().split()[0]==digest
        export=ROOT/('export-'+mode+'-'+str(uuid.uuid4()));export.mkdir(mode=0o700)
        try:out=run(['docker','exec','-e','NODE_OPTIONS=--max-old-space-size=512','-e','NODE_PATH=/app/node_modules',web['id'],'node',TMP+'/deepseek-text-hotupdate.cjs',mode,TMP],timeout=290 if mode=='PROBE' else 45)
        finally:run(['docker','cp',web['id']+':'+TMP+'/.',str(export)])
        assert canonical.read_bytes()==before,'PROGRAM_RELEASE_STATE_CHANGED'
        after=json.loads(run(['docker','inspect',web['id'],worker['id']]));assert all(a['State']['StartedAt']==b['State']['StartedAt'] and a['Image']==b['Image'] for a,b in zip(identities,after))
        print(out.decode().strip());print('WEB_WORKER_UNCHANGED=true THREE_LOCKS_RELEASED_ON_EXIT=true')
if __name__=='__main__':main()
