"""Actual fixed-image media lifecycle rehearsal; local isolated Docker only."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import uuid

from release47_host import HostTransaction, Hold, public_identity, require
from release_video_media import MediaLifecycle
import release47_maintenance as authorization
from release_maintenance_session import LiveAdapter


def main():
    require(os.name == 'posix' and os.geteuid() == 0 and
            os.environ.get('NAUMI_MEDIA_RELEASE_FIXTURE') == 'canvas-video-fusion-20261013', 'OWNED_LOCAL_LINUX_FIXTURE_ONLY')
    args = argparse.ArgumentParser()
    args.add_argument('--image', required=True)
    args.add_argument('--assets', required=True, type=pathlib.Path)
    args.add_argument('--report', required=True, type=pathlib.Path)
    options = args.parse_args()
    commit = 'e997b290b39fc9df63e4c3b6387fa008b7b0e18d'
    require(options.image == 'sha256:9fea589fed46a283fe8601d2771d0517077ce176708bdc9ff9e7226693c20f1e', 'FIXED_CANDIDATE_REQUIRED')
    token = uuid.uuid4().hex; names = {}; network = None; lost = {'create': True, 'start': True}; counts = {'create': 0, 'start': 0}
    root = pathlib.Path(tempfile.mkdtemp(prefix='video103-media-'))
    state_root = pathlib.Path('/opt/naumi-staging/releases') / ('media-fixture-' + token)
    state_root.mkdir(mode=0o700, parents=True); (state_root/'OWNER').write_text(token)
    stack = contextlib.ExitStack(); lock = stack.enter_context((root/'fixture.lock').open('a'))
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    def run(argv, **kwargs):
        result = subprocess.run(argv, input=kwargs.get('stdin'), capture_output=True, check=True, timeout=kwargs.get('timeout', 120))
        is_media = 'naumi-video-media-' + commit[:12] in argv
        if argv[:2] == ['docker', 'create'] and is_media:
            counts['create'] += 1
            if lost['create']: lost['create'] = False; raise Hold('FIXTURE_LOST_CREATE_RESPONSE')
        if argv[:2] == ['docker', 'start'] and argv[-1] == names.get('media'):
            counts['start'] += 1
            if lost['start']: lost['start'] = False; raise Hold('FIXTURE_LOST_START_RESPONSE')
        return result.stdout
    tx = HostTransaction('103.30.76.93', 'a'*64, root, command=run); tx.stack = stack
    raw = lambda *argv: subprocess.check_output(argv, text=True).strip()
    original = (options.assets/'landscape-4-audio.mp4').read_bytes()
    original_sha = hashlib.sha256(original).hexdigest()
    manifest = json.loads((options.assets/'manifest.json').read_text())
    require(any(row['name'] == 'landscape-4-audio.mp4' and row['sha256'] == original_sha for row in manifest['files']), 'LEGAL_SOURCE_HASH_REQUIRED')
    try:
        network = raw('docker','network','create','--internal','--label','owner=canvas-video-fusion-20261013','video103-media-'+token)
        names['source'] = raw('docker','create','--name','video103-source-'+token,'--network',network,
            '--label','owner=canvas-video-fusion-20261013','-e','NAUMI_VIDEO_WORKER=0',
            '-e','DATABASE_URL=postgresql://fixture:fixture@127.0.0.1/naumi_video_fixture_unused',
            '-e','SETTINGS_SECRET=synthetic-existing-fixture-settings-key',options.image)
        source = public_identity(tx.inspect(names['source']))
        plan = {'target':'103.30.76.93','commit':commit,'releaseId':'canvas-video-fusion-fixture-'+token,
            'authorization':{'mode':'canvas-video-fusion-103','target':'103.30.76.93','scope':'canvas-video-fusion',
                'goalThread':authorization.VIDEO_GOAL,'userAcknowledgement':authorization.VIDEO_HK_ACK,
                'restoreDatabase':False,'replayAcceptedTasks':False},
            'webs':[{'variant':'main','name':'video103-app-'+token,'image':options.image,'source':source}],
            'worker':{'name':'video103-caller-'+token},
            'mediaWorker':{'name':'naumi-video-media-'+commit[:12],'image':options.image,'memoryMiB':3072,'cpu':1}}
        with socket.socket() as chosen: chosen.bind(('127.0.0.1',0)); port = chosen.getsockname()[1]
        plan.update(releaseSecret='fixture-release-secret-'*3,buildVersion='1792200281')
        web=plan['webs'][0];web.update(port=port,memoryMiB=896,cpu=1,stateDir=str(state_root/'app'))
        adapter=LiveAdapter(tx,plan)
        adapter.inventory=lambda _operation:{'containers':[{'name':name} for name in raw('docker','ps','-a','--filter','network='+network,'--format','{{.Names}}').splitlines()]}
        lifecycle = MediaLifecycle(tx, plan)
        # MAINTENANCE/FROZEN rollback must also work before any media attempt.
        require(lifecycle.rollback().get('mediaNotCreated') is True,'EARLY_ROLLBACK_FAILED')
        operation=str(uuid.uuid4())
        try: adapter.web_create(web,operation); raise AssertionError('Lost create response was not injected')
        except Hold as error: require(str(error) == 'FIXTURE_LOST_CREATE_RESPONSE', 'UNEXPECTED_CREATE_FAILURE')
        names['media'] = tx.inspect(plan['mediaWorker']['name'])['Id']
        require(MediaLifecycle(tx,plan).rollback().get('mediaNeverStarted') is True,'UNSTARTED_MEDIA_ROLLBACK_FAILED')
        try: adapter.web_create(web,operation,reconcile=True); raise AssertionError('Lost start response was not injected')
        except Hold as error: require(str(error) == 'FIXTURE_LOST_START_RESPONSE', 'UNEXPECTED_START_FAILURE')
        app=adapter.web_create(web,operation,reconcile=True); names['app']=app['id']
        require(adapter.web_create(web,operation,reconcile=True)==app,'APP_RECONCILE_IDENTITY_CHANGED')
        phase=json.loads((root/('media-web-create-'+operation+'.json')).read_bytes())
        require(phase['phase']=='APP_CREATED','WEB_PHASE_NOT_COMMITTED')
        lifecycle = MediaLifecycle(tx,plan); identity = public_identity(lifecycle.owned()); require(counts == {'create':1,'start':1}, 'DUPLICATE_CREATE_OR_START')
        require(lifecycle.health()['draining'] is True, 'CANDIDATE_MEDIA_NOT_DRAINING')
        names['app'] = app['id']; row = tx.inspect(app['id']); lifecycle.verify_app(row)
        env = dict(value.split('=',1) for value in row['Config']['Env'])
        require(env['DATABASE_URL'].endswith('/naumi_video_fixture_unused') and env['SETTINGS_SECRET']=='synthetic-existing-fixture-settings-key', 'BASELINE_ENV_OVERWRITTEN')
        remote = r"""
const [method,id,body]=process.argv.slice(1);
const r=await fetch('http://127.0.0.1:3001/jobs/'+id,{method,headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET,'content-type':'application/json'},...(body?{body}:{})});
console.log(JSON.stringify({status:r.status,body:await r.json()}));
"""
        def job_request(method, identifier, body=None):
            return json.loads(tx.run(['docker','exec',identity['id'],'node','--input-type=module','-e',remote,method,identifier,json.dumps(body) if body is not None else '']))
        job_id=str(uuid.uuid4()); job_dir=lifecycle.scratch/job_id
        (job_dir/'inputs').mkdir(parents=True,mode=0o700); (job_dir/'inputs/input-0.mp4').write_bytes(original)
        request={'action':'frame','timestamp':1,'inputs':[{'name':'input-0.mp4','bytes':len(original),'sha256':original_sha}],'outputs':['frame.png']}
        require(job_request('POST',job_id,request)['status']==429,'DRAINED_JOB_ACCEPTED')
        lifecycle.mode('resume'); require(job_request('POST',job_id,request)['status']==202,'MEDIA_SUBMIT_FAILED')
        deadline=time.monotonic()+60; result=None
        while time.monotonic()<deadline:
            result=job_request('GET',job_id)['body']
            if result['status'] in ('completed','failed'):break
            time.sleep(.25)
        require(result and result['status']=='completed','REAL_FRAME_FAILED')
        frame=(job_dir/'results/frame.png').read_bytes(); require(hashlib.sha256(frame).hexdigest()==result['result']['outputs'][0]['sha256'],'FRAME_OUTPUT_HASH_MISMATCH')
        try:lifecycle.rollback();raise AssertionError('Unacknowledged terminal output did not hold rollback')
        except Hold as error:require(str(error)=='MEDIA_JOBS_NOT_DRAINED','UNEXPECTED_ROLLBACK_FAILURE')
        require((job_dir/'results/frame.png').read_bytes()==frame,'ROLLBACK_DELETED_PENDING_OUTPUT')
        require(job_request('PATCH',job_id)['status']==200,'MEDIA_ACK_FAILED')
        retained=lifecycle.rollback();require(retained['retainedForCandidateCleanup'] and retained['scratchDeleted'] is False,'UNSAFE_MEDIA_TEARDOWN')
        MediaLifecycle(tx,plan).prepare();require(counts=={'create':1,'start':1},'RECONCILE_RECREATED_MEDIA')
        require(hashlib.sha256((options.assets/'landscape-4-audio.mp4').read_bytes()).hexdigest()==original_sha,'SOURCE_CHANGED')
        options.report.parent.mkdir(parents=True,exist_ok=True)
        options.report.write_text(json.dumps({'ok':True,'scope':'actual-fixed-image-isolated-local-media-release-lifecycle',
            'image':options.image,'sourceCommit':commit,'lostCreateAndStartReconciledOnce':True,'wholeWebCreateReconcilesMediaBeforeApp':True,
            'earlyAndUnstartedRollbackWithoutMediaHealth':True,'exactAppMediaBindings':True,
            'baselineDatabaseAndSettingsPreserved':True,'privateNetworkNoPublicMediaPorts':True,'realSandboxFrameHash':True,
            'unacknowledgedOutputBlocksRollbackWithoutDeletion':True,'ackThenDrainedRetention':True,'formalConnections':0,
            'productionLocksUsed':False,'sourceUnchanged':True},indent=2))
        print('VIDEO_MEDIA_RELEASE_LINUX=PASS '+str(options.report))
    finally:
        if 'media' not in names and (root/'media-intent.json').exists():
            pending=raw('docker','ps','-aq','--filter','name=^/naumi-video-media-'+commit[:12]+'$')
            if pending:
                row=tx.inspect(pending)
                require(row['Config']['Labels'].get('naumi.media.release')=='canvas-video-fusion-fixture-'+token,
                        'FIXTURE_MEDIA_CLEANUP_OWNER_CHANGED')
                names['media']=row['Id']
        for key in ('app','media','source'):
            if key not in names:continue
            row=tx.inspect(names[key]);require(row['Id']==names[key] and row['Image']==options.image,'FIXTURE_CLEANUP_IDENTITY_CHANGED')
            subprocess.run(['docker','rm','-f','-v',names[key]],check=True,stdout=subprocess.DEVNULL)
        if network:subprocess.run(['docker','network','rm',network],check=True,stdout=subprocess.DEVNULL)
        stack.close();require((state_root/'OWNER').read_text()==token and state_root.parent==pathlib.Path('/opt/naumi-staging/releases'),'FIXTURE_STATE_OWNER_CHANGED')
        shutil.rmtree(state_root);require(root.parent==pathlib.Path('/tmp') and root.name.startswith('video103-media-'),'FIXTURE_ROOT_CHANGED');shutil.rmtree(root)


if __name__=='__main__':main()
