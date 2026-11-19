"""Publish only two model capability fields under the existing 47 deployment locks."""
import contextlib,fcntl,hashlib,json,pathlib,subprocess,sys

ROOT=pathlib.Path('/opt/naumi-staging/evidence/banana-reference14-20261119-r4')
TMP='/tmp/banana-reference14-20261119-r4'
LOCKS=['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']
SOURCE='2778285e15ca66f0082e16f6e4270a2622b8f1e3'
def load(path):return json.loads(pathlib.Path(path).read_bytes())
def run(argv,data=None,timeout=90):
    result=subprocess.run(argv,input=data,capture_output=True,timeout=timeout)
    if result.returncode:
        # No environment or credentials are printed. Bundle emits sanitized assertions only.
        if argv[-1]==TMP:print(result.stderr.decode('utf8','replace')[-1600:])
        raise RuntimeError('COMMAND_FAILED_'+str(result.returncode))
    return result.stdout

def main():
    mode,digest=sys.argv[1:];assert mode in ['PLAN','APPLY','VERIFY','ROLLBACK']
    bundle=ROOT/'banana-reference-limit.cjs';assert hashlib.sha256(bundle.read_bytes()).hexdigest()==digest
    with contextlib.ExitStack() as stack:
        for path in LOCKS:
            f=stack.enter_context(open(path,'a+'));fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        canonical=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
        original=canonical.read_bytes();state=json.loads(original)
        binding=state['runtimeRecovery'];assert binding['successorReleaseId']=='release47-main-20261118-admin-local-r2'
        receipt=load('/opt/naumi-staging/evidence/release47-main-20261118-admin-local-r2/PUBLICATION_RECEIPT.json')
        assert receipt['phase']=='COMPLETE' and receipt['commit']==SOURCE
        manifest=load(binding['manifestPath']);web=manifest['web'];worker=manifest['worker']
        identities=json.loads(run(['docker','inspect',web['id'],worker['id']]))
        for identity in identities:
            assert identity['State']['Running']
            env=dict(s.split('=',1) for s in identity['Config']['Env'] if '=' in s)
            assert env['SOURCE_COMMIT']==SOURCE
        assert identities[0]['Image']==identities[1]['Image']==receipt['image']
        if mode=='PLAN':
            run(['docker','exec',web['id'],'mkdir','-m','700',TMP])
            run(['docker','cp',str(bundle),web['id']+':'+TMP+'/banana-reference-limit.cjs'])
            run(['docker','exec','--user','0',web['id'],'chown','1001:1001',TMP+'/banana-reference-limit.cjs'])
        assert run(['docker','exec',web['id'],'sha256sum',TMP+'/banana-reference-limit.cjs']).decode().split()[0]==digest
        try:
            output=run(['docker','exec','-e','NODE_OPTIONS=--max-old-space-size=512','-e','NODE_PATH=/app/node_modules',web['id'],'node',TMP+'/banana-reference-limit.cjs',mode,TMP])
        finally:
            exported=ROOT/('export-'+mode)
            exported.mkdir(mode=0o700,exist_ok=False)
            run(['docker','cp',web['id']+':'+TMP+'/.',str(exported)])
        assert canonical.read_bytes()==original,'PROGRAM_RELEASE_STATE_CHANGED'
        with (ROOT/(mode+'.json')).open('xb') as f:f.write(output)
        print(output.decode().strip())
        if mode=='VERIFY':
            script="const r=await fetch('http://127.0.0.1:3000/api/models?feature=canvas.image',{cache:'no-store'});const d=await r.json();const m=d.models.filter(m=>/^gemini-3\\.(?:0-pro|1-flash)-image-/.test(m.id));if(r.status!==200||m.length!==10||m.some(m=>m.maxReferenceImages!==14))throw Error('LIVE_CATALOG_MISMATCH');console.log(JSON.stringify({status:r.status,version:d.version,models:m.map(m=>({id:m.id,maxReferenceImages:m.maxReferenceImages}))}));"
            print(run(['docker','exec','-e','NODE_OPTIONS=',web['id'],'node','--input-type=module','-e',script]).decode().strip())
        print('THREE_LOCKS_RELEASED_ON_EXIT=true PROGRAM_CONTAINERS_UNCHANGED=true')

if __name__=='__main__':main()
