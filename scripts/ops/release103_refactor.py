"""Explicit 103 refactor deployment: locked, journalled blue/green only.

Preserves the canonical historical journal; never claims legacy drain, replays
paid tasks, copies another site's data, or restores a database on rollback.
"""
import base64, copy, datetime as dt, hashlib, hmac, http.client
import json, os, pathlib, re, shutil, socket, time, urllib.parse, uuid
import urllib.request
import urllib.error
from types import SimpleNamespace
from release47_host import HostTransaction, Hold, environment, public_identity, require, sha, file_sha
import release47_controls as controls
import release_client_compat as compat
import release_runtime_recovery as startup
import worker_handoff
import release47_task_snapshot as tasks
from release47_saas_successor import syntax_check

TARGET='103.30.76.93'
MACHINE='26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35'
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
ACK='把重构线发布到103服务器'
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def available(): return int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))//1024
def capacity(free, used, limits):
    remaining=sum(max(0,limits[k]-used.get(k,0)) for k in limits)
    return {'ok':free>=remaining+1024,'availableMiB':free,'remainingPeakMiB':remaining,'reserveMiB':1024,'swapIncluded':False}
def acknowledged(state):
    return all(op.get('phase')=='ACKNOWLEDGED' for op in state.get('operations',{}).values())
def validate_config(c):
    require(c.get('target')==TARGET and c.get('authorization')==ACK,'EXPLICIT_103_REFACTOR_AUTHORIZATION_REQUIRED')
    require(re.fullmatch(r'[a-f0-9]{40}',c.get('commit','')) and re.fullmatch(r'sha256:[a-f0-9]{64}',c.get('image','')),'PINNED_SOURCE_IMAGE_REQUIRED')
    require(re.fullmatch(r'[0-9]{10}',c.get('buildVersion','')),'PINNED_VERSION_REQUIRED')
    require(c.get('releaseId','').startswith('release103-refactor-') and re.fullmatch(r'[a-z0-9-]{20,90}',c['releaseId']),'RELEASE_ID_REQUIRED')
    require(c.get('oldPort')==13104 and c.get('newPort')==13105,'REVIEWED_103_PORTS_REQUIRED')
    require(c.get('restoreDatabase') is False and c.get('replayAcceptedTasks') is False,'NO_RESTORE_OR_REPLAY_REQUIRED')
    require(c.get('date')==dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'RELEASE_DATE_CHANGED')
    require(pathlib.Path(c['evidenceRoot'])==pathlib.Path('/opt/naumi-staging/evidence')/c['releaseId'],'REVIEWED_EVIDENCE_ROOT_REQUIRED')

class DockerHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')

class Release:
    def __init__(self,tx,c):
        self.tx,self.c=tx,c;self.root=tx.folder;self.disk=sha(CANON.read_bytes());self.state=json.loads(CANON.read_bytes())
        require(self.disk==c['canonicalSha256'] and self.state['revision']==c['canonicalRevision'],'CANONICAL_REVIEW_CHANGED')
        require(self.state.get('status') not in ['UNKNOWN','ROLLBACK_FAILED','CLEANUP_PENDING'],'UNRESOLVED_CANONICAL_STATE')
        require(acknowledged(self.state),'UNKNOWN_PRIOR_OPERATION')
        require(not self.state.get('blueGreen103Releases') or all(r['phase'] in ['COMPLETE','ROLLED_BACK','ABORTED'] and acknowledged(r) for r in self.state['blueGreen103Releases'].values()),'PRIOR_103_RELEASE_RECONCILE_REQUIRED')
        self.rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]))
        self.byname={r['Name'].lstrip('/'):r for r in self.rows};self.old={k:self.byname[v] for k,v in c['oldNames'].items()}
        require(all(r['Image']==c['oldImage'] and environment(r).get('SOURCE_COMMIT')==c['oldCommit'] and r['State']['Running'] for r in self.old.values()),'ONLINE_BASELINE_CHANGED')
        require(sorted(r['Id']for r in self.rows if r['State']['Running'])==sorted(c['runningIds']),'UNREGISTERED_RUNNING_INSTANCE')
        self.db=self.byname['naumi-staging-db-1'];self.de=environment(self.db)
        self.new={};self.switched=False;self.old_stopped=False;self.worker_paused=False;self.app_drained=False
        self.record={'releaseId':c['releaseId'],'phase':'PREPARED','commit':c['commit'],'image':c['image'],'buildVersion':c['buildVersion'],'startedAt':now(),'operations':{},'databaseRestored':False,'tasksReplayed':False,'supplierSubmissions':0}
        self.initial=CANON.read_bytes()

    def persist(self):
        require(sha(CANON.read_bytes())==self.disk,'CANONICAL_CAS_CHANGED')
        self.state['revision']+=1;controls._atomic_private(CANON,self.state);self.disk=sha(CANON.read_bytes())
        controls._atomic_private(self.root/'PROGRESS.json',self.record)
    def phase(self,p,**facts):
        self.record.update(phase=p,at=now(),**facts);self.persist();print('PHASE='+p,flush=True)
    def op(self,name,fn):
        require(name not in self.record['operations'],'ORIGINAL_OPERATION_RECONCILE_REQUIRED')
        op={'operationId':str(uuid.uuid4()),'phase':'INTENT_RECORDED','at':now()};self.record['operations'][name]=op;self.persist()
        try:r=fn(op['operationId'])
        except BaseException:op['phase']='UNKNOWN';self.persist();raise
        op.update(phase='ACKNOWLEDGED',receipt=r);self.persist();return r
    def sql(self,q):
        raw=self.tx.run(['docker','exec','-i',self.db['Id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=("BEGIN READ ONLY;SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='1s';"+q+'COMMIT;').encode(),timeout=25)
        return [json.loads(l)for l in raw.splitlines()if l.startswith(b'{')]
    def config(self):
        return self.sql("SELECT json_build_object('models',encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'),'version',t.active_version)FROM app_model_config_state t;SELECT json_build_object('billing',encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'))FROM(SELECT * FROM app_billing_config_versions ORDER BY version DESC LIMIT 1)t;")
    def request(self,row,path,*,auth=True,worker=False,expected=200):
        spec={'path':path,'cookie':self.cookie if auth else '', 'worker':worker}
        js="let raw='';for await(const c of process.stdin)raw+=c;const s=JSON.parse(raw);const r=await fetch('http://127.0.0.1:3000'+s.path,{headers:{...(s.cookie?{cookie:s.cookie}:{}),...(s.worker?{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}:{})},redirect:'manual',signal:AbortSignal.timeout(25000)});let b=await r.text();try{b=JSON.parse(b)}catch{}console.log(JSON.stringify({status:r.status,location:r.headers.get('location'),body:b}));"
        result=json.loads(self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',row['Id'],'node','--input-type=module','-e',js],stdin=json.dumps(spec).encode(),timeout=35))
        allowed=[expected]+([301,302,303,307,308]if path in ['/desktop','/enterprise','/batchshot']else[])
        require(result['status'] in allowed,'HTTP_'+str(result['status'])+'_'+path);self.last_status=result['status'];return result['body']
    def worker(self,row,action):
        e=environment(row);folder=self.root/('worker-control-'+row['Id'][:12]);folder.mkdir(mode=0o700,exist_ok=True)
        a=SimpleNamespace(container=row['Id'],expected_id=row['Id'],expected_image=row['Image'],expected_commit=e['SOURCE_COMMIT'],expected_origin=e['NAUMI_APP_ORIGIN'],action=action,operation_id=str(uuid.uuid4()),tick_id=None)
        return worker_handoff.execute(a,folder,lambda argv:self.tx.run(argv).decode())['state']
    def media(self,row,action):
        js="const a=process.argv[1];const r=await fetch('http://127.0.0.1:3001/'+a,{method:a==='health'?'GET':'POST',headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('MEDIA_HTTP_'+r.status);console.log(JSON.stringify(await r.json()));"
        result=json.loads(self.tx.run(['docker','exec','-e','NODE_OPTIONS=',row['Id'],'node','--input-type=module','-e',js,action]))
        if action!='health':
            require(result.get('ok') and result.get('draining') is (action=='drain'),'MEDIA_MODE_NOT_ACKNOWLEDGED')
            observed=self.media(row,'health');require(observed['draining']==result['draining'],'MEDIA_MODE_NOT_OBSERVED');return {**observed,'controlReceipt':result}
        require(result['version']==environment(row)['SOURCE_COMMIT'] and result['sandbox'] is True,'MEDIA_IDENTITY_CHANGED');return result
    def wait(self,fn,label,seconds=90):
        end=time.monotonic()+seconds
        while True:
            try:
                value=fn()
                if value:return value
            except (Hold,ValueError,KeyError):pass
            if time.monotonic()>end:raise Hold('WAIT_'+label)
            time.sleep(2)
    def reconcile(self):
        self.tx.save('canonical-before.private.json',self.initial);self.tx.save('containers-before.private.json',self.rows)
        prior=pathlib.Path('/opt/naumi-staging/evidence/image-parameter-plan-20261027-main/RESULT.json');p=json.loads(prior.read_bytes())
        require(p.get('status')=='COMPLETE' and p.get('source')==self.c['oldCommit'] and p.get('image')==self.c['oldImage'] and p.get('releaseMode')=='STOP_OLD_REPLACE','PRIOR_AUTHORIZED_REPLACEMENT_NOT_VERIFIED')
        staged=self.state.get('staged103Releases',{});retired=[]
        for rid,s in staged.items():
            require(s.get('phase')=='WEB_DEPLOYED_WORKER_HANDOFF_PENDING' and acknowledged(s),'STAGED_PRIOR_OPERATION_UNRESOLVED')
            ids=[s[k]['id']for k in ['web','worker','media']]
            ids+= [r['Id']for r in self.rows if r['Name'] in ['/naumi-staging-app-1','/naumi-staging-video-worker-1']]
            for cid in ids:
                row=self.tx.inspect(cid);require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name']=='no','PRIOR_SLOT_STILL_ACTIVE')
                retired.append(public_identity(row))
            s.update(phase='SUPERSEDED_BY_AUTHORIZED_REPLACEMENT',supersededAt=now(),supersededEvidence={'path':str(prior),'sha256':sha(prior.read_bytes()),'commit':p['source'],'image':p['image'],'stoppedSlots':retired,'historicalDrainProven':False,'historicalTasksResolved':False,'paidReplayAllowed':False})
        self.tx.save('historical-reconciliation.json',{'priorRelease':p,'retiredObserved':retired,'legacyDrainProven':False,'historicalTasksResolved':False,'originalCanonicalSha256':sha(self.initial)})
        self.state.setdefault('blueGreen103Releases',{})[self.c['releaseId']]=self.record;self.state['active103BlueGreenReleaseId']=self.c['releaseId'];self.persist()
    def prepare(self):
        self.reconcile();self.configuration=self.config();self.tx.save('configuration-before.json',self.configuration)
        self.op('database-backup',lambda _:self.tx.backup_database(public_identity(self.db)))
        self.task_before=tasks.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
        self.dump=self.tx.run(['nginx','-T']).decode();require(sha(self.dump.encode())==self.c['nginxSha256'],'NGINX_BASELINE_CHANGED')
        parsed=compat.Dump(self.dump);self.before={p:pathlib.Path(p).read_bytes()for p in parsed.files};self.real={p:str(pathlib.Path(p).resolve())for p in self.before}
        self.tx.save('nginx-before.private.txt',self.dump.encode());self.tx.save('nginx-files-before.private.json',{p:base64.b64encode(b).decode()for p,b in self.before.items()})
        email=self.sql("SELECT json_build_object('email',email)FROM app_users WHERE role='admin' AND banned=false ORDER BY joined_at LIMIT 1;")[0]['email']
        secret=environment(self.old['web'])['SETTINGS_SECRET'];exp=str(int(time.time()*1000)+30*24*3600*1000);eb=base64.urlsafe_b64encode(email.encode()).decode().rstrip('=')
        self.cookie='nv_user='+eb+'.'+exp+'.'+hmac.new(secret.encode(),('user:'+eb+'.'+exp).encode(),hashlib.sha256).hexdigest();self.tx.save('cookie.private',self.cookie.encode())
        self.request(self.old['web'],'/api/auth/session')
        self.wait(lambda:self.request(self.old['web'],'/api/video/worker/drain-status',auth=False,worker=True).get('drained'),'PREEXISTING_EXECUTION_CHECK')
        for row in [self.old['web']]:
            actions=json.loads(self.tx.run(['docker','exec',row['Id'],'cat','/app/.next/server/server-reference-manifest.json']));require(not actions.get('node') and not actions.get('edge'),'CROSS_BUILD_SERVER_ACTION_REVIEW_REQUIRED')
        self.phase('BACKED_UP')
    def docker_api(self,path,data):
        c=DockerHTTP('localhost');c.request('POST','/v1.45'+path,json.dumps(data),{'Content-Type':'application/json'});r=c.getresponse();raw=r.read();c.close();require(r.status<300,'DOCKER_API_'+str(r.status));return json.loads(raw)if raw else None
    def clone(self,role,*,reuse_empty_state=False):
        old=self.old[role];name=self.c['newNames'][role];e=environment(old);e.update(SOURCE_COMMIT=self.c['commit'],BUILD_VERSION=self.c['buildVersion'])
        for k in ['NAUMI_RELEASE_BOOT_ID','NAUMI_RELEASE_BOOT_SOURCE','NAUMI_RELEASE_COMMIT','NAUMI_RELEASE_INSTANCE_ID']:e.pop(k,None)
        if role=='web':e.update(NAUMI_INSTANCE_ID=name,NAUMI_RELEASE_ADMISSION_START='draining',NAUMI_RELEASE_PEERS='{}',INTERNAL_APP_ORIGIN='http://127.0.0.1:3000',MEDIA_WORKER_ORIGIN='http://'+self.c['newNames']['media']+':3001',NAUMI_VIDEO_WORKER='0')
        if role=='worker':
            require(e.get('NAUMI_WORKER_EXECUTION','http')=='http','UNREVIEWED_WORKER_MODE_CHANGE')
            e.update(NAUMI_INSTANCE_ID=name,NAUMI_APP_ORIGIN='http://'+self.c['newNames']['web']+':3000',NAUMI_WORKER_TARGET_INSTANCE_ID=self.c['newNames']['web'],NAUMI_WORKER_START_PAUSED='1',NAUMI_WORKER_STATE_FILE='/release-state/worker.json')
        # Private, isolated scratch only; this executor has no DB/upstream
        # credentials and cannot acquire work until its new Web admits it.
        if role=='media':e.update(MEDIA_WORKER_START_PAUSED='0')
        hc=old['HostConfig'];host={k:copy.deepcopy(hc[k])for k in ['Memory','MemorySwap','NanoCpus','ReadonlyRootfs','CapDrop','CapAdd','SecurityOpt','Tmpfs','ShmSize','Ulimits','ExtraHosts','Dns','DnsSearch','LogConfig','PidsLimit']if hc.get(k)not in (None,{},[])}
        require(host['Memory']//1024**2=={'web':1536,'worker':128,'media':3072}[role],'MEMORY_BASELINE_CHANGED')
        host.update(RestartPolicy={'Name':'no'},NetworkMode=hc['NetworkMode'],PortBindings=copy.deepcopy(hc.get('PortBindings')or{}))
        if role=='web':host['PortBindings']={'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':str(self.c['newPort'])}]}
        else:require(not host['PortBindings'],'PRIVATE_EXECUTOR_PORT_REQUIRED')
        mounts=[];state=None
        for m in old['Mounts']:
            if m['Destination']=='/release-state':
                state=pathlib.Path('/opt/naumi-staging/releases')/self.c['releaseId']/role
                if reuse_empty_state:require(role=='web' and state.is_dir() and not state.is_symlink() and state.stat().st_uid==1001 and not state.stat().st_mode&0o077 and not list(state.iterdir()),'ONLY_VERIFIED_EMPTY_PRE_CREATE_STATE')
                state.mkdir(mode=0o700,parents=True,exist_ok=reuse_empty_state);os.chown(state,1001,1001)
                mounts.append({'Type':'bind','Source':str(state),'Target':'/release-state','ReadOnly':False})
            elif m['Destination']=='/scratch':
                scratch=self.root/'media-scratch';scratch.mkdir(mode=0o700,exist_ok=True);os.chown(scratch,1001,1001)
                mounts.append({'Type':'bind','Source':str(scratch),'Target':'/scratch','ReadOnly':False})
            else:mounts.append({'Type':m['Type'],'Source':m.get('Name')if m['Type']=='volume'else m['Source'],'Target':m['Destination'],'ReadOnly':not m['RW']})
        host['Mounts']=mounts;config={k:copy.deepcopy(old['Config'][k])for k in ['WorkingDir','User','ExposedPorts','Cmd','Healthcheck','StopSignal']if old['Config'].get(k)not in (None,{},[])}
        entry=old['Config']['Entrypoint']
        if role=='web':
            require(state is not None,'WEB_STATE_MOUNT_REQUIRED');startup.install_launcher(state,release_id=self.c['releaseId'],commit=self.c['commit'],version=self.c['buildVersion'],instance=name);entry=['/release-state/launch.sh']
        config.update(Image=self.c['image'],Env=[k+'='+v for k,v in sorted(e.items())],HostConfig=host,Entrypoint=entry,Labels={'naumi.release':self.c['releaseId'],'naumi.source':self.c['commit'],'naumi.target':TARGET})
        primary=hc['NetworkMode'];config['NetworkingConfig']={'EndpointsConfig':{primary:{'Aliases':[name]}}}
        created=self.docker_api('/containers/create?name='+urllib.parse.quote(name),config)['Id']
        for network in old['NetworkSettings']['Networks']:
            if network!=primary:self.docker_api('/networks/'+urllib.parse.quote(network)+'/connect',{'Container':created,'EndpointConfig':{'Aliases':[name]}})
        row=self.tx.inspect(created);require(row['Image']==self.c['image'] and not row['State']['Running'],'CANDIDATE_CREATE_MISMATCH');self.new[role]=row;return public_identity(row)
    def memory(self):
        used={}
        for role,r in self.new.items():
            r=self.tx.inspect(r['Id'])
            if r['State']['Running']:
                pid=r['State']['Pid'];relative=pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().split('0::',1)[1].strip();used[role]=int((pathlib.Path('/sys/fs/cgroup')/relative.lstrip('/')/'memory.current').read_text())//1024**2
        result=capacity(available(),used,{'web':1536,'worker':128,'media':3072});require(result['ok'],'DUAL_SLOT_PEAK_CAPACITY_GATE');return result
    def candidates(self):
        archive=self.root/'image.tar.gz';require(archive.is_file() and file_sha(archive)==self.c['archiveSha256'],'FIXED_IMAGE_ARCHIVE_CHANGED')
        self.op('image-load',lambda _:{'loaded':bool(self.tx.run(['docker','load','-i',str(archive)],timeout=300)),'archiveSha256':self.c['archiveSha256']})
        image=json.loads(self.tx.run(['docker','image','inspect',self.c['image']]))[0];ie=dict(v.split('=',1)for v in image['Config']['Env']);require(ie.get('SOURCE_COMMIT')==self.c['commit'] and ie.get('BUILD_VERSION')==self.c['buildVersion'],'IMAGE_PROVENANCE_MISMATCH')
        self.tx.save('capacity-before-'+str(self.state['revision'])+'.json',self.memory())
        sock=socket.socket();require(sock.connect_ex(('127.0.0.1',self.c['newPort']))!=0,'CANDIDATE_PORT_BUSY');sock.close()
        for role in ['media','web','worker']:self.op('create-'+role,lambda _,r=role:self.clone(r))
        for role in ['media','web','worker']:
            self.memory();self.op('start-'+role,lambda _,r=role:{'started':bool(self.tx.run(['docker','start',self.new[r]['Id']]))});self.new[role]=self.tx.inspect(self.new[role]['Id'])
        self.wait(lambda:self.media(self.new['media'],'health')['ok'],'MEDIA_READY')
        self.wait(lambda:self.request(self.new['web'],'/api/version')=={'version':self.c['buildVersion'],'commit':self.c['commit']},'WEB_READY')
        require(self.worker(self.new['worker'],'status')['paused'] is True,'CANDIDATE_WORKER_NOT_PAUSED');self.phase('CANDIDATE_READY')
    def acceptance(self):
        w=self.new['web'];h=self.request(w,'/api/health');require(h.get('db',{}).get('ok') is True,'DATABASE_NOT_READY')
        require(self.request(w,'/api/auth/session').get('user'),'EXISTING_ACCOUNT_NOT_ACCEPTED')
        checks={}
        for p in ['/','/canvas','/desktop','/enterprise','/batchshot','/api/projects','/api/canvas/text-nodes','/api/canvas/node-settings','/api/image-skills','/api/admin/model-management']:
            self.request(w,p);checks[p]=self.last_status
        status=controls.app_status(self.tx,public_identity(w));require(status['identity']['commit']==self.c['commit'],'WEB_CONTROL_VERSION_DRIFT')
        worker=self.worker(self.new['worker'],'status')
        require(worker['commit']==self.c['commit'] and worker['origin']=='http://'+self.c['newNames']['web']+':3000' and worker['targetInstanceId']==self.c['newNames']['web'],'WORKER_EXECUTION_GRAPH_DRIFT')
        e=environment(w);require(e['INTERNAL_APP_ORIGIN']=='http://127.0.0.1:3000' and e['MEDIA_WORKER_ORIGIN']=='http://'+self.c['newNames']['media']+':3001','INTERNAL_EXECUTION_GRAPH_DRIFT')
        js="const r=await fetch(process.env.MEDIA_WORKER_ORIGIN+'/health',{headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('MEDIA_BINDING');console.log(JSON.stringify(await r.json()));"
        bound=json.loads(self.tx.run(['docker','exec','-e','NODE_OPTIONS=',w['Id'],'node','--input-type=module','-e',js]));require(bound['version']==self.c['commit'],'BOUND_MEDIA_VERSION_DRIFT')
        actions=json.loads(self.tx.run(['docker','exec',w['Id'],'cat','/app/.next/server/server-reference-manifest.json']));require(not actions.get('node') and not actions.get('edge'),'CANDIDATE_SERVER_ACTION_REVIEW_REQUIRED')
        require(self.config()==self.configuration,'INDEPENDENT_CONFIGURATION_CHANGED')
        if not self.record.get('r2Accepted'):
            script=pathlib.Path(__file__).with_name('r2_103_storage_acceptance.cjs').read_text()
            raw=self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',w['Id'],'node','-e',script],stdin=json.dumps({'cookie':self.cookie,'releaseId':self.c['releaseId']}).encode(),timeout=180)
            receipt=json.loads(raw);require(receipt.get('passed') and receipt.get('verificationDataCleaned'),'REAL_R2_ACCEPTANCE_FAILED');self.tx.save('r2-acceptance.json',receipt);self.record['r2Accepted']=True;self.persist()
        self.tx.save('acceptance-'+str(self.state['revision'])+'.json',{'at':now(),'checks':checks,'healthDb':True,'nativeAccount':True,'configurationPreserved':True,'media':self.media(self.new['media'],'health'),'worker':self.worker(self.new['worker'],'status'),'version':self.request(w,'/api/version'),'supplierSubmissions':0})
    def assets(self):
        oldroot=pathlib.Path(self.c['oldAssetRoot']);newroot=pathlib.Path('/var/www/naumi-client-assets')/self.c['releaseId'];require(oldroot.is_dir() and not newroot.exists(),'ASSET_BASELINE_CHANGED')
        shutil.copytree(oldroot,newroot,copy_function=shutil.copy2)
        temp=self.root/'candidate-static';self.tx.run(['docker','cp',self.new['web']['Id']+':/app/.next/static',str(temp)],timeout=90)
        count=0
        for prefix in ['','desktop/','enterprise/']:
            dest=newroot/prefix/'_next/static';dest.mkdir(parents=True,exist_ok=True)
            for f in temp.rglob('*'):
                require(not f.is_symlink(),'ASSET_SYMLINK_FORBIDDEN')
                if not f.is_file():continue
                target=dest/f.relative_to(temp)
                if target.exists():require(sha(target.read_bytes())==sha(f.read_bytes()),'IMMUTABLE_ASSET_COLLISION')
                else:target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target);count+=1
        for p in [newroot,*newroot.rglob('*')]:p.chmod(0o755 if p.is_dir()else 0o644)
        after={p:b.replace(('127.0.0.1:'+str(self.c['oldPort'])).encode(),('127.0.0.1:'+str(self.c['newPort'])).encode()).replace(str(oldroot).encode(),str(newroot).encode())for p,b in self.before.items()}
        # Existing host Router already targets this stable loopback address.
        # Restore that exact private callback without restarting the Router or
        # adding any public listener/another Web process.
        self.router_binding()
        sock=socket.socket();require(sock.connect_ex(('127.0.0.1',13012))!=0,'LEGACY_CAPACITY_PORT_UNEXPECTED_LISTENER');sock.close()
        site='/etc/nginx/sites-enabled/default'
        callback=('\nserver { listen 127.0.0.1:13012; server_name _; client_max_body_size 4k; '
                  'location = /api/internal/model-capacity { proxy_pass http://127.0.0.1:13105; '
                  'proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header Connection ""; '
                  'proxy_read_timeout 10s; proxy_buffering off; } location / { return 404; } }\n')
        require(site in after,'REVIEWED_CAPACITY_SITE_MISSING');after[site]+=callback.encode()
        require(any(after[p]!=self.before[p]for p in after),'EMPTY_GATEWAY_CHANGE')
        parsed=compat.Dump(self.dump)
        self.after=after;self.afterdump=parsed.render({p:b.decode()+('\n'if parsed.files[p]==self.before[p].decode()+'\n'else'')for p,b in after.items()})
        require('127.0.0.1:'+str(self.c['oldPort']) not in self.afterdump,'OLD_ORIGIN_STILL_REFERENCED')
        syntax_check(self.tx,after,self.root/'isolated-nginx-check')
        self.tx.save('static-assets.json',{'root':str(newroot),'newFiles':count,'previousFilesRetained':True,'isolatedNginxTest':True});self.phase('READY')
    def router_binding(self,live=False):
        root=pathlib.Path('/proc/4460');require(root.joinpath('comm').read_text().strip()=='naumi-router','ROUTER_PROCESS_REVIEW_CHANGED')
        env=dict(p.decode().split('=',1)for p in root.joinpath('environ').read_bytes().split(b'\0')if b'='in p)
        address=env.get('NAUMI_MODEL_CAPACITY_URL');token=env.get('NAUMI_ROUTER_MANAGEMENT_TOKEN','')
        require(address=='http://127.0.0.1:13012/api/internal/model-capacity' and len(token)>=32 and hmac.compare_digest(token,environment(self.new['web']).get('NAUMI_ROUTER_MANAGEMENT_TOKEN','')),'ROUTER_CALLBACK_AUTHORITY_CHANGED')
        require(root.joinpath('ns/net').stat().st_ino==pathlib.Path('/proc/self/ns/net').stat().st_ino,'ROUTER_NAMESPACE_CHANGED')
        if live:
            codes=[]
            for auth in [True,False]:
                req=urllib.request.Request(address,data=b'{}',headers={'content-type':'application/json',**({'authorization':'Bearer '+token}if auth else{})})
                try:
                    with urllib.request.urlopen(req,timeout=15)as response:code=response.status
                except urllib.error.HTTPError as error:code=error.code;error.close()
                codes.append(code)
            require(codes==[400,404],'ACTUAL_ROUTER_CALLBACK_NOT_BOUND')
            self.tx.save('router-callback-acceptance.json',{'at':now(),'sourcePid':4460,'privateOnly':True,'malformedAuthenticated':400,'anonymous':404,'capacityAcquireCalls':0,'routerRestarted':False,'targetCommit':self.c['commit']})
        else:self.tx.save('router-callback-preflight.json',{'at':now(),'sourcePid':4460,'tokenMatches':True,'sameHostNetwork':True,'existingPrivatePort':13012})
    def gateway(self,forward=True):
        before,after,dump,afterdump=(self.before,self.after,self.dump,self.afterdump)if forward else(self.after,self.before,self.afterdump,self.dump)
        patches=[{'path':p,'beforeSha256':sha(before[p]),'afterSha256':sha(after[p])}for p in before if before[p]!=after[p]]
        folder=self.tx.folder;self.tx.folder=self.root/('gateway-forward'if forward else'gateway-rollback');self.tx.folder.mkdir(mode=0o700)
        try:return controls.switch_gateway_bundle(self.tx,{'configClosureValidated':True,'baselineFileCasVerified':True,'beforeDumpSha256':sha(dump.encode()),'afterDumpSha256':sha(afterdump.encode()),'patches':patches},before,{p['path']:after[p['path']]for p in patches},expected_dump_sha=sha(dump.encode()),logical_to_real=self.real)
        finally:self.tx.folder=folder
    def drain(self,group=None):
        group=group or self.old
        app=controls.app_status(self.tx,public_identity(group['web']));o=app['observations'];t=app['transport']['transport']
        require(app['admission']['mode']=='draining' and app['transport']['verified'] and t['completeFromProcessStart'] and not t['accountingFault'] and t['activeRequests']==0 and t['startedRequests']==t['finishedRequests'],'OLD_HTTP_NOT_DRAINED')
        require(all(type(o.get(k))is int and o[k]==0 for k in ['activeRequests','trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases']),'OLD_EXECUTION_NOT_DRAINED')
        domain=self.request(group['web'],'/api/video/worker/drain-status',auth=False,worker=True)
        require(domain.get('drained') and domain.get('absentTables')==[] and all(domain[k]==0 for k in ['activeFences','activeTransactions','advisoryLocks']),'DOMAIN_NOT_DRAINED')
        worker=self.worker(group['worker'],'status');require(worker['paused'] and worker['activeTicks']==worker['unresolvedTicks']==0 and worker['tickDrainComplete'],'OLD_WORKER_NOT_DRAINED')
        owner=group['web']['Name'].lstrip('/');require(re.fullmatch('[A-Za-z0-9_.-]+',owner),'INVALID_OWNER_NAME')
        owners=self.sql("SELECT json_build_object('active',count(*))FROM app_release_session_owners WHERE instance_id='"+owner+"' AND state<>'idle';")[0];require(owners['active']==0,'OLD_AGENT_SESSION_ACTIVE')
        media=self.media(group['media'],'health');require(media['draining'] and media['running']==media['queued']==0,'OLD_MEDIA_NOT_DRAINED')
        return {'observedAt':now(),'currentExecutableWorkDrained':True,'app':app,'domain':domain,'worker':worker,'media':media,'owners':owners,'historicalDrainProven':False}
    def switch(self):
        controls.control_app(self.tx,public_identity(self.new['web']),'resume',str(uuid.uuid4()));self.media(self.new['media'],'resume')
        self.op('gateway-switch',lambda _:self.gateway());self.switched=True;self.phase('DRAINING')
        self.op('pause-old-worker',lambda _:self.worker(self.old['worker'],'drain'));self.worker_paused=True
        self.op('drain-old-web',lambda _:controls.control_app(self.tx,public_identity(self.old['web']),'drain',str(uuid.uuid4())));self.app_drained=True
        self.op('drain-old-media',lambda _:self.media(self.old['media'],'drain'))
        proof=self.wait(self.drain,'OLD_DRAIN',seconds=120);self.tx.save('old-drain-proof.json',proof)
        require(not self.tx.run(['ss','-Htn','state','established','( sport = :13104 or dport = :13104 )']).strip(),'OLD_LOOPBACK_CONNECTIONS_ACTIVE')
        # No new old-slot admissions, no old scanner and no old media queue;
        # the one fresh proof covers this bounded sequential retirement.
        for role in ['worker','media','web']:
            def stop(_,r=self.old[role]):
                self.tx.run(['docker','update','--restart=no',r['Id']]);self.tx.run(['docker','stop','--time','60',r['Id']],timeout=75);a=self.tx.inspect(r['Id']);require(not a['State']['Running'] and not a['State']['OOMKilled'] and a['State']['ExitCode']!=137,'OLD_STOP_NOT_CLEAN');return public_identity(a)
            self.op('retire-'+role,stop)
        self.old_stopped=True
        self.op('resume-new-worker',lambda _:self.worker(self.new['worker'],'resume'))
        self.wait(lambda:self.worker(self.new['worker'],'status').get('lastTick',{}).get('phase')=='complete','NEW_WORKER_RECEIPT')
    def finish(self):
        self.acceptance();self.tx.save('capacity-final.json',self.memory())
        req=urllib.request.Request('http://127.0.0.1/api/version',headers={'Host':TARGET})
        with urllib.request.urlopen(req,timeout=15)as response:public=json.loads(response.read())
        require(public=={'version':self.c['buildVersion'],'commit':self.c['commit']},'PUBLIC_GATEWAY_VERSION_DRIFT')
        self.tx.save('public-gateway-version.json',{'version':public,'observedAt':now()})
        self.router_binding(live=True)
        w=self.new['web'];secret=environment(w)['RELEASE_CONTROL_SECRET'];spec={'releaseId':self.c['releaseId'],'commit':self.c['commit'],'buildVersion':self.c['buildVersion'],'releaseSecret':secret}
        state=next(m['Source']for m in w['Mounts']if m['Destination']=='/release-state');startup.write_activation(pathlib.Path(state)/'activation.json',startup.activation_marker(spec,{'name':self.c['newNames']['web']},True))
        for r in self.new.values():self.tx.run(['docker','update','--restart=unless-stopped',r['Id']])
        require(self.config()==self.configuration,'INDEPENDENT_CONFIGURATION_CHANGED')
        task_after=tasks.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,previous=self.task_before.private,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
        preservation=tasks.compare_task_snapshots(self.task_before,task_after);self.tx.save('task-preservation.json',preservation);require(preservation['preservationVerified'],'TASK_PRESERVATION_FAILED')
        self.phase('COMPLETE',new={k:public_identity(self.tx.inspect(r['Id']))for k,r in self.new.items()},old={k:public_identity(self.tx.inspect(r['Id']))for k,r in self.old.items()},sameImage=True,allInternalOriginsVerified=True,configurationPreserved=True,legacyHistoricalUncertaintyRetained=True)
        self.tx.save('FINAL_STATUS.json',self.record)
    def rollback(self):
        # Only program/entry rollback. Never overwrite database or media bytes.
        for role,r in self.new.items():
            if self.tx.inspect(r['Id'])['State']['Running']:
                if role=='worker':self.worker(r,'drain')
                elif role=='media':self.media(r,'drain')
                else:controls.control_app(self.tx,public_identity(r),'drain',str(uuid.uuid4()))
        if self.switched:
            for r in self.old.values():
                if not self.tx.inspect(r['Id'])['State']['Running']:self.tx.run(['docker','start',r['Id']])
                self.tx.run(['docker','update','--restart='+r['HostConfig']['RestartPolicy']['Name'],r['Id']])
            self.wait(lambda:self.request(self.old['web'],'/api/version')['commit']==self.c['oldCommit'],'ROLLBACK_OLD_WEB')
            self.gateway(False)
            if len(self.new)==3:self.tx.save('rollback-new-drain.json',self.wait(lambda:self.drain(self.new),'ROLLBACK_NEW_DRAIN'))
            if self.app_drained:controls.control_app(self.tx,public_identity(self.tx.inspect(self.old['web']['Id'])),'resume',str(uuid.uuid4()))
            if self.worker_paused:self.worker(self.tx.inspect(self.old['worker']['Id']),'resume')
            self.media(self.tx.inspect(self.old['media']['Id']),'resume')
        # Candidate retirement after uncertain activity requires a new observed
        # drain; keep it and explicitly block further publication in that case.
        self.phase('CLEANUP_PENDING' if self.new else 'ABORTED',rollbackEntryRestored=self.switched,candidatesRetained=bool(self.new),databaseRestored=False,tasksReplayed=False)

def main(config):
    import fcntl
    c=json.loads(pathlib.Path(config).read_bytes());validate_config(c)
    with HostTransaction(TARGET,MACHINE,c['evidenceRoot'])as tx:
        with open(CANON.parent/'.lifecycle.lock','a+')as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            release=Release(tx,c)
            try:
                release.prepare();release.candidates();release.acceptance();release.assets();release.switch();release.finish()
            except BaseException as error:
                controls._atomic_private(tx.folder/'FAILURE.json',{'at':now(),'type':type(error).__name__,'error':str(error)if isinstance(error,Hold)else'INSPECT_PRIVATE_LOG','phase':release.record['phase']})
                try:release.rollback()
                except BaseException:release.phase('ROLLBACK_FAILED')
                raise
