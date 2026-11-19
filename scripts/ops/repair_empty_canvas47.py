"""Run one evidence-bound project registry repair; no restart or code release."""
import contextlib,fcntl,hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path('/opt/naumi-staging/evidence/repair-empty-canvas-20261119-r2')
TMP='/tmp/repair-empty-canvas-20261119-r2'
LOCKS=['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']
def run(args,timeout=35):
    r=subprocess.run(args,capture_output=True,timeout=timeout)
    if r.returncode:
        # CJS emits error codes/assertions, never connection strings.
        if args[-1]==TMP:print(r.stderr.decode('utf8','replace')[-1200:])
        raise RuntimeError('REPAIR_COMMAND_FAILED_'+str(r.returncode))
    return r.stdout
def main():
    mode,digest=sys.argv[1:];assert mode in ['PLAN','APPLY','VERIFY','ROLLBACK']
    source=ROOT/'repair-empty-canvas-project.cjs';assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
    with contextlib.ExitStack() as stack:
        for p in LOCKS:
            f=stack.enter_context(open(p,'a+'));fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        lifecycle=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json');original=lifecycle.read_bytes();state=json.loads(original)
        manifest=json.loads(pathlib.Path(state['runtimeRecovery']['manifestPath']).read_bytes());web=manifest['web']
        identity=json.loads(run(['docker','inspect',web['id']]))[0];assert identity['State']['Running']
        if mode=='PLAN':
            run(['docker','exec',web['id'],'mkdir','-m','700',TMP])
            for name in ['SPEC.json','repair-empty-canvas-project.cjs']:
                run(['docker','cp',str(ROOT/name),web['id']+':'+TMP+'/'+name]);run(['docker','exec','--user','0',web['id'],'chown','1001:1001',TMP+'/'+name])
                run(['docker','exec',web['id'],'chmod','600',TMP+'/'+name])
        assert run(['docker','exec',web['id'],'sha256sum',TMP+'/repair-empty-canvas-project.cjs']).decode().split()[0]==digest
        exported=ROOT/('export-'+mode);exported.mkdir(mode=0o700,exist_ok=False)
        try:
            out=run(['docker','exec','-e','NODE_OPTIONS=','-e','NODE_PATH=/app/node_modules',web['id'],'node',TMP+'/repair-empty-canvas-project.cjs',mode,TMP])
        finally:run(['docker','cp',web['id']+':'+TMP+'/.',str(exported)])
        assert lifecycle.read_bytes()==original,'PROGRAM_LIFECYCLE_CHANGED'
        after=json.loads(run(['docker','inspect',web['id']]))[0];assert after['State']['StartedAt']==identity['State']['StartedAt']
        print(out.decode().strip());print('PROGRAM_UNCHANGED=true THREE_LOCKS_RELEASED_ON_EXIT=true')
if __name__=='__main__':main()
