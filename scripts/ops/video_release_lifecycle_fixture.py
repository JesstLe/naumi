"""Closed-world LOCAL release CLI acceptance with actual runtime observations.

Never imported by a live publisher. The driver owns every creator in its random
schema/network. Metrics are bound to raw receipts; missing facts stay unknown.
This does not certify uninstrumented production Agent/background coverage.
"""
import copy
import datetime as dt
import fcntl
import hashlib
import io
import json
import pathlib
import subprocess
import tarfile
import uuid

import release47_controls as controls
import release_lifecycle as lifecycle
from release47_host import public_identity, environment


def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def sha(data):return hashlib.sha256(data).hexdigest()


def fixture_drain_counts(app,domain,worker,owners):
    """Only for the driver-owned closed world; not a production collector."""
    zero=lambda value:type(value) is int and value==0
    t=app['transport']['transport'];obs=app['observations']
    assert app['transport']['verified'] is True and t['completeFromProcessStart'] is True and t['accountingFault'] is False
    assert zero(t['activeRequests']) and type(t['startedRequests']) is int and t['startedRequests']>=0 and t['startedRequests']==t['finishedRequests']
    assert app['admission']['mode']=='draining' and all(zero(obs[k]) for k in ['trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases'])
    assert all(row['state']=='idle' for row in owners) and domain['drained'] is True and domain['absentTables']==[]
    assert set(domain['counts'])=={'imageJobs','canvasImages','videoPolls','supplierCosts','imagegenItems'} and all(zero(v) for v in domain['counts'].values())
    assert all(zero(domain[k]) for k in ['activeFences','activeTransactions','advisoryLocks'])
    assert worker['paused'] is True and zero(worker['activeTicks']) and zero(worker['unresolvedTicks']) and worker['phase']=='QUIESCENT' and not worker.get('controlFault')
    if 'mediaWorker' in worker:
        media=worker['mediaWorker'];assert media['ok'] is True and media['draining'] is True and zero(media['running']) and zero(media['queued'])
    return {'observedAt':now(),'connections':t['activeRequests'],'agentSessions':sum(row['state']!='idle' for row in owners),
        'acceptedTasks':obs['trackedAcceptedWork']+domain['activeFences'],'workerLeases':domain['activeFences']+domain['activeTransactions']+domain['advisoryLocks'],'newAdmissions':0}


class VideoReleaseLifecycle:
    def __init__(self,gateway,query):
        self.g=gateway;self.query=query;self.folder=gateway.args.evidence/'lifecycle';self.folder.mkdir()
        self.state=self.folder/'fixture-state';self.commands=[];self.observations=[];self.drains={};self.locks=[]
        for name in ['naumi','hub','reference-workbench']:
            lock=(self.folder/(name+'.fixture.lock')).open('a+b');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);self.locks.append(lock)
        self.baseline=[self.container(gateway.old_web,'web'),self.container(gateway.old_worker['id'],'worker'),self.container(gateway.gateway,'infra')]
        self.baseline_dump=self.dump()
        self.plan={'schemaVersion':1,'evidenceMode':'fixture','target':'local-video-release-fixture','releaseId':'video-cli-'+uuid.uuid4().hex,
            'hostIdentitySha256':sha(pathlib.Path('/etc/machine-id').read_bytes()) if pathlib.Path('/etc/machine-id').exists() else sha(pathlib.Path('/proc/sys/kernel/random/boot_id').read_bytes()),
            'commit':environment(gateway.tx.inspect(gateway.web))['SOURCE_COMMIT'],'image':gateway.args.image,
            'baseline':self.baseline,'web':gateway.web,'worker':gateway.worker,
            'retire':[gateway.old_web,gateway.old_worker['id']],
            'baselineRoutes':dict.fromkeys(lifecycle.ROUTES,gateway.old_web),'baselineExecutionTargets':dict.fromkeys(lifecycle.EXECUTION_PATHS,gateway.old_web),
            'budget':{'candidatePeakMiB':1024,'reservedMiB':1024,'minimumAvailableMiB':1024},'affectedFeatures':['all-live-routes','video.generate'],
            'routingConfigSha256':{'baseline':sha(self.baseline_dump),'unified':sha(gateway.expected_dump('new'))}}
        self.plan_path=self.folder/'plan.json';self.plan_path.write_text(json.dumps(self.plan,indent=2));self.call('begin','old')
        gateway.check('actual-lifecycle-cli-begin-prepared',self.current()['status']=='PREPARED')

    def container(self,identity,role):
        row=self.g.tx.inspect(identity);values=environment(row)
        return {'id':row['Id'],'role':role,'image':row['Image'],'commit':values.get('SOURCE_COMMIT',''),
            'running':row['State']['Running'],'restartPolicy':row['HostConfig']['RestartPolicy']['Name'] or 'no','startedAt':row['State']['StartedAt']}

    def dump(self):return self.g.execute(self.g.gateway,['sh','-c','nginx -T -c /fixture/nginx.conf 2>/tmp/lifecycle-nginx-error || { cat /tmp/lifecycle-nginx-error >&2; exit 1; }'])
    def current(self):return json.loads((self.state/'current.json').read_text())
    def domain(self,web):
        code="fetch('http://127.0.0.1:3000/api/video/worker/drain-status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}}).then(async r=>{if(!r.ok)throw Error('DRAIN_'+r.status);console.log(JSON.stringify(await r.json()))})"
        return json.loads(self.g.execute(web,['node','-e',code]))

    def observe(self):
        g=self.g;rows=[]
        for identity,role in [(g.old_web,'web'),(g.old_worker['id'],'worker'),(g.gateway,'infra'),(g.web,'web'),(g.worker,'worker')]:rows.append(self.container(identity,role))
        status_web=g.web if g.tx.inspect(g.web)['State']['Running'] else g.old_web
        probes=[]
        for route in ['/', '/login', '/canvas', '/batchshot','/api/internal/model-capacity','/api/generate-image','/api/imagegen','/api/imagegen/fixture','/api/health']:
            got=g.fetch(status_web,g.origin+route);assert got['slot'] in ['old','new'] and got['status']!=502;probes.append({'path':route,**got})
            if route=='/api/health':assert got['status']==200 and json.loads(got['body'])['videoExecution']['ready']
        slots={p['slot'] for p in probes};assert len(slots)==1;active=g.old_web if slots=={'old'} else g.web
        status_worker=g.worker if g.tx.inspect(g.worker)['State']['Running'] else g.old_worker['id']
        app=controls.app_status(g.tx,public_identity(g.tx.inspect(status_web)))
        worker=json.loads(g.execute(status_worker,['node','-e',"fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}}).then(r=>r.json()).then(x=>console.log(JSON.stringify(x)))"]))
        assert environment(g.tx.inspect(status_worker))['NAUMI_APP_ORIGIN']=='http://'+g.tx.inspect(status_web)['Name'].lstrip('/')+':3000'
        assert worker['targetInstanceId']==g.tx.inspect(status_worker)['Name'].lstrip('/')
        assert all('lock:' in pathlib.Path('/proc/self/fdinfo/'+str(lock.fileno())).read_text() for lock in self.locks)
        mem=int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))//1024
        raw={'containers':rows,'memory':{'availableMiB':mem},'routingConfigSha256':sha(self.dump()),'routes':dict.fromkeys(lifecycle.ROUTES,active),
            'executionTargets':dict.fromkeys(lifecycle.EXECUTION_PATHS,active),'app':app,'worker':worker,'http':probes,
            'scope':'closed-world random fixture schema/network; actual driver is only creator; not production universal collector'}
        self.observations.append(raw);return raw

    def call(self,action,phase,expected=0,revision=None,plan=None):
        p=plan or self.plan;raw=self.observe();at=now();s={k:raw[k] for k in ['containers','memory','routingConfigSha256','routes','executionTargets']}
        s.update(target=p['target'],evidenceMode='fixture',releaseId=p['releaseId'],planSha256=lifecycle.digest(p),observedAt=at,
            locksHeld=['naumi','hub','reference-workbench'],drain=self.drains,retainedReleases=getattr(self,'retained',[]))
        artifacts={}
        # These evidence bodies are real runtime/package/asset receipts. The CLI
        # verifies immutable artifact hashes and binding; it is not the collector.
        for kind in ['baseline','readiness','old-client-compatibility','backup-and-rollback','worker-handoff','continuity','retirement','rollback']:
            path=self.folder/(str(len(self.commands))+'-'+kind+'.json')
            body={'kind':kind,'rawObservation':raw,'oldStaticAssets':len(self.g.assets_before),'staticManifest':self.g.manifest,
                'drainReceipts':getattr(self,'drain_receipts',None),'retainedPackages':getattr(self,'retained_receipts',None),
                'scope':'LOCAL closed-world video transaction and gateway routing; not production/TLS/browser/all-business acceptance'}
            path.write_text(json.dumps(body,indent=2));artifacts[kind]={'ok':True,'releaseId':p['releaseId'],'target':p['target'],
                'planSha256':lifecycle.digest(p),'snapshotSha256':lifecycle.digest(s),'observedAt':at,'artifact':path.name,'artifactSha256':sha(path.read_bytes())}
        s['evidence']=artifacts;path=self.folder/(str(len(self.commands))+'-'+action+'-snapshot.json');path.write_text(json.dumps(s,indent=2))
        plan_path=self.plan_path
        if plan is not None:plan_path=self.folder/'negative-plan.json';plan_path.write_text(json.dumps(plan,indent=2))
        cmd=['bash',str(pathlib.Path(__file__).resolve().parents[1]/'deploy-release.sh'),'--lifecycle',action,'--plan',str(plan_path),'--snapshot',str(path),'--state-dir',str(self.state)]
        if action!='begin':cmd+=['--revision',str(self.current()['revision'] if revision is None else revision)]
        result=subprocess.run(cmd,capture_output=True,text=True);self.commands.append({'command':cmd,'inputSnapshot':str(path),'exit':result.returncode,'output':result.stdout,'stderr':result.stderr});self.save()
        assert result.returncode==expected,self.commands[-1];return result

    def save(self):
        (self.folder/'COMMANDS.json').write_text(json.dumps(self.commands,indent=2))
        if (self.state/'current.json').exists():(self.folder/'RESULT.json').write_text(json.dumps({'state':self.current(),'commands':len(self.commands),'scope':'fixture','siteOperations':0,'paidCalls':0},indent=2))

    def ready(self):
        for identity in [self.g.web,self.g.worker]:self.g.api('POST','/containers/'+identity+'/update',{'RestartPolicy':{'Name':'unless-stopped'}})
        self.call('ready','old');self.g.check('actual-lifecycle-cli-ready',self.current()['status']=='READY')
    def switched(self):
        self.call('switched','new');self.g.check('actual-lifecycle-cli-switched',self.current()['status']=='DRAINING')
        bad=self.call('finish','new',expected=2);assert 'OLD_WEB_STILL_RUNNING' in bad.stderr
        self.g.check('actual-lifecycle-cli-running-old-slot-keeps-debt',self.current()['status']=='CLEANUP_PENDING')
        other={**self.plan,'releaseId':self.plan['releaseId']+'-next'};bad=self.call('begin','new',expected=2,plan=other)
        assert 'UNFINISHED_RELEASE_BLOCKS_NEXT' in bad.stderr
        before=(self.state/'current.json').read_bytes();bad=self.call('finish','new',expected=2,revision=-1)
        assert 'REVISION_CONFLICT' in bad.stderr and (self.state/'current.json').read_bytes()==before
        self.g.check('actual-lifecycle-cli-pending-blocks-next-and-stale-CAS')

    def collect_drain(self):
        g=self.g;app=controls.app_status(g.tx,public_identity(g.tx.inspect(g.old_web)));domain=self.domain(g.old_web);worker=g.state()
        name=g.tx.inspect(g.old_web)['Name'].lstrip('/')
        owners=json.loads(self.query("SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (SELECT state FROM app_release_session_owners WHERE instance_id='"+name+"')t;"))
        drain=fixture_drain_counts(app,domain,worker,owners)
        self.drain_receipts={'app':app,'domain':domain,'worker':worker,'owners':owners,
            'metricSemantics':{'connections':'preload active HTTP response lifetimes, not idle TCP keepalives','acceptedTasks':'tracked local promises plus actual shared DB fences; closed-world fixture only','newAdmissions':'actual application admission is draining'},
            'coverageNotUpgraded':app['coverage']}
        self.drains={identity:dict(drain) for identity in self.plan['retire']}

    def complete(self):
        g=self.g;self.collect_drain()
        self.retained=[];self.retained_receipts=[]
        import release47_video_profile_guard as guard
        durable=json.loads(self.query(guard.build_readonly_sql(dict.fromkeys(guard.SCHEMA_KEYS,True))))
        (self.folder/'rollback-nginx.conf').write_bytes(self.baseline_dump)
        schema=self.query('SELECT current_schema();').strip()
        assert schema.startswith('release_direct_') and schema.replace('_','').isalnum()
        dump=g.execute('naumi-video-compiler-pg-20261114',['pg_dump','-U','postgres','-d','video_compiler_fixture','--schema='+schema,'--no-owner','--no-acl'])
        assert b'CREATE TABLE' in dump and b'app_video_tasks' in dump
        backup=self.folder/'fixture-only-backup.sql';backup.write_bytes(dump);backup.chmod(0o600)
        for image in [g.args.prior_image,g.args.retained_image]:
            code=g.tx.run(['docker','run','--rm','--network=none','--read-only','--entrypoint=node',image,'--input-type=commonjs','-e',guard.RUNTIME_PACKAGE_PROBE])
            receipt=json.loads(code);assert receipt['bundleVerified']
            guard.enforce(guard.evaluate(durable,runtime_formats=receipt['videoRuntimeFormats']))
            stopped=g.api('POST','/containers/create',{'Image':image,'Cmd':['node','-e','process.exit(0)'],'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True}})['Id']
            try:archive=g.api('GET','/containers/'+stopped+'/archive?path=/app/.next/static',raw=True)
            finally:g.api('DELETE','/containers/'+stopped)
            with tarfile.open(fileobj=io.BytesIO(archive)) as data:
                files=[m for m in data.getmembers() if m.isfile()];assert files
                assets={m.name:sha(data.extractfile(m).read()) for m in files}
            asset_path=self.folder/('retained-'+image[7:19]+'-static.tar');asset_path.write_bytes(archive)
            env=environment(g.tx.inspect(g.old_web));env.update({k:v for k,v in environment(g.api('GET','/images/'+image+'/json')).items() if k in ['SOURCE_COMMIT','BUILD_VERSION']})
            config_path=self.folder/('retained-'+image[7:19]+'-fixture-env.json');config_path.write_text(json.dumps(env));config_path.chmod(0o600)
            receipt.update(image=image,staticArchive=asset_path.name,staticArchiveSha256=sha(archive),assets=assets,
                fixtureConfig=config_path.name,fixtureConfigSha256=sha(config_path.read_bytes()),fixtureDatabaseBackupSha256=sha(backup.read_bytes()))
            self.retained.append({'image':image,'materialsReadable':True});self.retained_receipts.append(receipt)
        for identity in self.plan['retire']:
            g.api('POST','/containers/'+identity+'/stop?t=60');g.api('POST','/containers/'+identity+'/update',{'RestartPolicy':{'Name':'no'}})
        for identity in [g.web,g.worker]:g.api('POST','/containers/'+identity+'/update',{'RestartPolicy':{'Name':'unless-stopped'}})
        self.call('finish','new');assert self.current()['status']=='COMPLETE';g.check('actual-lifecycle-cli-complete-after-real-retirement')
        self.save()

    def rolled_back(self):
        g=self.g
        for identity in [g.worker,g.web]:g.api('POST','/containers/'+identity+'/stop?t=60');g.api('POST','/containers/'+identity+'/update',{'RestartPolicy':{'Name':'no'}})
        self.call('rollback','old');assert self.current()['status']=='ROLLED_BACK';g.check('actual-lifecycle-cli-rollback-confirms-real-restored-slots')
        self.save()
