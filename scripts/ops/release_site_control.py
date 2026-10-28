"""Pinned enterprise-site rollout, using the existing host/control transaction.

The scoped operator preserves the canonical historical journal. It adds one Web
and one paused combined Worker. First-install workflow processes share the Web's
private network namespace and keep their own database, storage and lifecycle.
No source-account writes, task replay, DB restore, or automatic old-program
cutback after enterprise policy becomes active.
"""
import base64,copy,datetime as dt,hmac,hashlib,json,os,pathlib,re,secrets,shutil,socket,time,uuid
from release47_host import HostTransaction,Hold,require,sha,file_sha,environment,public_identity
import release103_refactor as base
import release47_controls as controls
import release_client_compat as compat
import release_runtime_recovery as startup
import release47_task_snapshot as tasks
from release47_saas_successor import syntax_check

CANON=base.CANON
HOSTS={'47.105.59.142':'eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df',
       '103.30.76.93':'26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35'}
AUTHORIZATION='103统一管理47的功能开放，47的/admin做企业管理、/enterprise做协作交付，把真实数据和权限链路接通，验收后再上线，别影响正在使用的员工。'

def render_file_edits(dump,before,edits):
    parsed=compat.Dump(dump);after=dict(before);sections={}
    for name,changes in edits.items():
        raw=before[name].decode();body=parsed.files[name]
        require(body.startswith(raw) and not body[len(raw):].strip(),'DUMP_FILE_BOUNDARY_CHANGED')
        value=raw
        for start,end,replacement in sorted(changes,reverse=True):
            require(0<=start<=end<=len(raw),'EDIT_OUTSIDE_REAL_FILE')
            value=value[:start]+replacement+value[end:]
        after[name]=value.encode();sections[name]=value+body[len(raw):]
    return parsed.render(sections),after

def validate(c):
    require(c.get('target') in HOSTS and c.get('authorization')==AUTHORIZATION,'SITE_ROLLOUT_AUTHORIZATION_REQUIRED')
    host=c['target'].split('.')[0]
    require(re.fullmatch('release'+host+'-site-control-[a-z0-9-]{6,50}',c.get('releaseId','')),'SITE_RELEASE_ID_REQUIRED')
    require(re.fullmatch('[a-f0-9]{40}',c.get('commit','')) and re.fullmatch('sha256:[a-f0-9]{64}',c.get('image','')),'FIXED_IMAGE_REQUIRED')
    require(re.fullmatch('[0-9]{10}',c.get('buildVersion','')),'FIXED_VERSION_REQUIRED')
    require(c.get('restoreDatabase') is False and c.get('replayAcceptedTasks') is False,'NO_DATA_RESTORE_OR_REPLAY')
    require(pathlib.PurePosixPath(c['evidenceRoot'])==pathlib.PurePosixPath('/opt/naumi-staging/evidence')/c['releaseId'],'EVIDENCE_PATH_REQUIRED')
    require(c.get('webMemoryMiB')==({'47':2560,'103':1536}[host]) and c.get('workerMemoryMiB')==1024,'REVIEWED_MEMORY_REQUIRED')
    require(13000<=c['newPort']<=13999 and c['newPort']!=c['oldPort'],'DISTINCT_PRIVATE_PORT_REQUIRED')
    require(set(c['newNames'])=={'web','worker'} and all(re.fullmatch('naumi'+host+'-[a-z0-9-]{6,80}',n) for n in c['newNames'].values()),'DISTINCT_SITE_NAMES_REQUIRED')
    require(set(c['oldNames'])==({'web','worker'} if host=='47' else {'web','worker','media','portal'}),'EXACT_OLD_ROLES_REQUIRED')
    require(len(set([*c['newNames'].values(),*c['oldNames'].values()]))==len(c['newNames'])+len(c['oldNames']),'REUSED_SLOT_NAME_FORBIDDEN')
    require(c.get('date')==dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'FRESH_REVIEW_REQUIRED')
    # 47 first-install runtime/capacity still requires its own completed review.
    require(c['target']=='103.30.76.93','ENTERPRISE_RUNTIME_CAPACITY_REVIEW_PENDING')
    require(c.get('webEnvironment')=={'FLEET_CONTROL_ENABLED':'1','FLEET_PORTAL_ONLY':'0','FLEET_RELEASE_DISPATCH_ENABLED':'0','FLEET_SCHEDULER_ENABLED':'0'},'UNREVIEWED_WEB_ENVIRONMENT_CHANGE')

class Release(base.Release):
    def __init__(self,tx,c):
        self.tx,self.c=tx,c;self.root=tx.folder;self.initial=CANON.read_bytes();self.disk=sha(self.initial);self.state=json.loads(self.initial)
        require(self.disk==c['canonicalSha256'] and self.state['revision']==c['canonicalRevision'],'CANONICAL_REVIEW_CHANGED')
        key,active=('normalBlueGreenReleases','activeNormalBlueGreenReleaseId') if c['target'].startswith('47.') else ('blueGreen103Releases','active103BlueGreenReleaseId')
        previous=(self.state.get('siteControlReleases',{}).get(self.state.get('activeSiteControlReleaseId')) or self.state[key][self.state[active]])
        require(previous.get('phase')=='COMPLETE' and previous.get('commit')==c['oldCommit'],'PREDECESSOR_NOT_COMPLETE')
        require(all(o.get('phase') in ['ACKNOWLEDGED','REJECTED_PRECONDITION'] for o in previous.get('operations',{}).values()),'PREDECESSOR_OPERATION_UNKNOWN')
        require(all(r.get('phase') in ['COMPLETE','ABORTED'] for r in self.state.get('siteControlReleases',{}).values()),'SITE_ROLLOUT_UNRESOLVED')
        self.rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]))
        self.byname={r['Name'].lstrip('/'):r for r in self.rows};self.old={role:self.byname[name] for role,name in c['oldNames'].items()}
        require(sorted(r['Id'] for r in self.rows if r['State']['Running'])==sorted(c['runningIds']),'RUNNING_BASELINE_CHANGED')
        for role,r in self.old.items():
            require(public_identity(r)==c['oldPins'][role],'PINNED_INSTANCE_CHANGED')
            if role!='portal':require(r['Image']==c['oldImage'] and environment(r).get('SOURCE_COMMIT')==c['oldCommit'],'SOURCE_BASELINE_CHANGED')
        self.db=self.byname['naumi-staging-db-1'];self.de=environment(self.db)
        self.new={};self.switched=self.old_stopped=self.worker_paused=self.app_drained=False
        self.record={'releaseId':c['releaseId'],'phase':'PREPARED','commit':c['commit'],'image':c['image'],'buildVersion':c['buildVersion'],'startedAt':base.now(),'operations':{},'databaseRestored':False,'tasksReplayed':False}
        self.extra=[]

    def reconcile(self):
        self.tx.save('canonical-before.private.json',self.initial);self.tx.save('containers-before.private.json',self.rows)
        self.state.setdefault('siteControlReleases',{})[self.c['releaseId']]=self.record
        self.state['activeSiteControlReleaseId']=self.c['releaseId'];self.persist()
        # A prior incident is retained verbatim; this rollout cannot discharge it.
        self.tx.save('prior-history-preserved.json',{'previousStatus':self.state.get('status'),'legacyDrainProven':self.state.get('legacyDrainProven'),'historyModified':False})

    def prepare(self):
        super().prepare()
        if self.c['target'].startswith('103.'):
            value=self.sql("SELECT json_build_object('hash',v) FROM app_settings WHERE k='admin_password_hash';")
            if value and value[0].get('hash'):
                expiry=str(int(time.time()*1000)+3600000)
                mac=hmac.new(environment(self.old['web'])['SETTINGS_SECRET'].encode(),('admin-access:'+expiry+':'+value[0]['hash']).encode(),hashlib.sha256).hexdigest()
                self.cookie+='; nv_admin='+expiry+'.'+mac
            self.tx.save('acceptance-cookie.private',self.cookie.encode())
        if self.c['target'].startswith('47.'):
            path=pathlib.Path(self.state['runtimeRecovery']['manifestPath'])
            self.previousRecovery=copy.deepcopy(self.state['runtimeRecovery']);self.previousManifest=json.loads(path.read_bytes())
            self.tx.save('supervisor-before.service',pathlib.Path('/etc/systemd/system/naumi47-recovery.service').read_bytes())
            self.tx.save('supervisor-before.private.json',self.previousManifest)
        self.tx.save('release-config.private.json',self.c)

    def memory(self):
        consumed=0
        for row in [*self.new.values(),*self.extra]:
            row=self.tx.inspect(row['Id'])
            if row['State']['Running']:
                rel=pathlib.Path('/proc/'+str(row['State']['Pid'])+'/cgroup').read_text().split('0::',1)[1].strip()
                consumed+=int((pathlib.Path('/sys/fs/cgroup')/rel.lstrip('/')/'memory.current').read_text())//1024**2
        peak=self.c['webMemoryMiB']+1024+(384 if self.c['target'].startswith('47.') else 0)
        free=base.available();remaining=max(0,peak-consumed)
        require(free>=remaining+1024,'DUAL_SLOT_MEMORY_INSUFFICIENT')
        return {'availableMiB':free,'remainingPeakMiB':remaining,'reserveMiB':1024,'swapIncluded':False}

    def clone_web(self):
        old=self.old['web'];name=self.c['newNames']['web'];e=environment(old)
        for k in ['NAUMI_RELEASE_BOOT_ID','NAUMI_RELEASE_BOOT_SOURCE','NAUMI_RELEASE_COMMIT','NAUMI_RELEASE_INSTANCE_ID','NAUMI_WORKER_EXECUTION']:e.pop(k,None)
        e.update(self.c['webEnvironment'])
        e.update(SOURCE_COMMIT=self.c['commit'],BUILD_VERSION=self.c['buildVersion'],NAUMI_INSTANCE_ID=name,
                 NAUMI_RELEASE_RUNTIME='1',NAUMI_RELEASE_ADMISSION_START='draining',NAUMI_RELEASE_PEERS='{}',
                 INTERNAL_APP_ORIGIN='http://127.0.0.1:3000',NAUMI_VIDEO_WORKER='0',NAUMI_MEDIA_WORKER='1',
                 MEDIA_WORKER_ORIGIN='http://'+self.c['newNames']['worker']+':3002',MEDIA_JOB_DIR='/scratch',
                 MEDIA_WORKER_CONCURRENCY='1',MEDIA_WORKER_START_PAUSED='1')
        require(e['MEDIA_WORKER_SECRET']!=e['VIDEO_WORKER_SECRET'],'SEPARATE_MEDIA_SECRET_REQUIRED')
        # Keep the observed heap/native budgets and supplier/storage configuration.
        hc=old['HostConfig'];host={k:copy.deepcopy(hc[k]) for k in ['Memory','MemorySwap','NanoCpus','ReadonlyRootfs','CapDrop','CapAdd','SecurityOpt','Tmpfs','ShmSize','Ulimits','ExtraHosts','Dns','DnsSearch','LogConfig','PidsLimit'] if hc.get(k) not in (None,{},[])}
        require(host['Memory']//1024**2==self.c['webMemoryMiB'],'WEB_MEMORY_BASELINE_CHANGED')
        host.update(RestartPolicy={'Name':'no'},NetworkMode=hc['NetworkMode'],PortBindings={'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':str(self.c['newPort'])}]})
        state=pathlib.Path('/opt/naumi-staging/releases')/self.c['releaseId']/'web';state.mkdir(mode=0o700,parents=True);os.chown(state,1001,1001)
        mounts=[]
        for m in old['Mounts']:
            if m['Destination']=='/release-state':continue
            if m['Destination']=='/scratch':
                scratch=self.root/'media-scratch';scratch.mkdir(mode=0o700);os.chown(scratch,1001,1001)
                mounts.append({'Type':'bind','Source':str(scratch),'Target':'/scratch','ReadOnly':False});continue
            mounts.append({'Type':m['Type'],'Source':m.get('Name') if m['Type']=='volume' else m['Source'],'Target':m['Destination'],'ReadOnly':not m['RW']})
        require(any(m['Target']=='/scratch' for m in mounts),'EXISTING_PRIVATE_SCRATCH_REQUIRED')
        mounts.append({'Type':'bind','Source':str(state),'Target':'/release-state','ReadOnly':False});host['Mounts']=mounts
        startup.install_launcher(state,release_id=self.c['releaseId'],commit=self.c['commit'],version=self.c['buildVersion'],instance=name)
        config={k:copy.deepcopy(old['Config'][k]) for k in ['WorkingDir','User','ExposedPorts','Cmd','Healthcheck','StopSignal'] if old['Config'].get(k) not in (None,{},[])}
        config.update(Image=self.c['image'],Env=[k+'='+v for k,v in sorted(e.items())],HostConfig=host,Entrypoint=['/release-state/launch.sh'],Labels={'naumi.release':self.c['releaseId'],'naumi.source':self.c['commit'],'naumi.target':self.c['target']},NetworkingConfig={'EndpointsConfig':{hc['NetworkMode']:{'Aliases':[name]}}})
        cid=self.docker_api('/containers/create?name='+name,config)['Id']
        for network in old['NetworkSettings']['Networks']:
            if network!=hc['NetworkMode']:self.docker_api('/networks/'+network+'/connect',{'Container':cid,'EndpointConfig':{'Aliases':[name]}})
        self.new['web']=self.tx.inspect(cid);return public_identity(self.new['web'])

    def candidates(self):
        require(file_sha(self.root/'image.tar.gz')==self.c['archiveSha256'],'IMAGE_ARCHIVE_CHANGED')
        self.op('image-load',lambda _:{'loaded':bool(self.tx.run(['docker','load','-i',str(self.root/'image.tar.gz')],timeout=300))})
        image=json.loads(self.tx.run(['docker','image','inspect',self.c['image']]))[0];env=environment(image)
        require(env.get('SOURCE_COMMIT')==self.c['commit'] and env.get('BUILD_VERSION')==self.c['buildVersion'],'IMAGE_PROVENANCE_CHANGED')
        self.tx.save('capacity-before.json',self.memory())
        sock=socket.socket();require(sock.connect_ex(('127.0.0.1',self.c['newPort']))!=0,'CANDIDATE_PORT_BUSY');sock.close()
        self.op('web-create',lambda _:self.clone_web());self.op('web-start',lambda _:{'started':bool(self.tx.run(['docker','start',self.new['web']['Id']]))});self.new['web']=self.tx.inspect(self.new['web']['Id'])
        self.wait(lambda:self.request(self.new['web'],'/api/health',auth=False).get('db',{}).get('ok'),'WEB_READY')
        w=self.op('worker-create',lambda _:controls.clone_worker(self.tx,public_identity(self.new['web']),name=self.c['newNames']['worker'],memory_mib=1024,cpu=1,state_dir='/opt/naumi-staging/releases/'+self.c['releaseId']+'/worker',reviewed_combined_media=True,reviewed_runtime_memory=True))
        self.op('worker-start',lambda _:controls.start_worker(self.tx,w,base.available(),reviewed_combined_media=True,reviewed_runtime_memory=True));self.new['worker']=self.tx.inspect(w['id'])
        self.wait(lambda:self.worker(self.new['worker'],'status')['paused'],'CANDIDATE_WORKER_PAUSED',90)
        self.phase('CANDIDATE_READY',new={k:public_identity(r) for k,r in self.new.items()})

    def acceptance(self):
        w=self.new['web'];version=self.request(w,'/api/version',auth=False)
        require(version=={'version':self.c['buildVersion'],'commit':self.c['commit']},'CANDIDATE_VERSION_DRIFT')
        require(self.request(w,'/api/health',auth=False).get('db',{}).get('ok'),'DB_NOT_READY')
        require(self.request(w,'/api/auth/session').get('user'),'NATIVE_ACCOUNT_NOT_ACCEPTED')
        paths=['/api/projects','/api/canvas/text-nodes','/api/canvas/node-settings','/canvas','/enterprise','/admin']
        for p in paths:self.request(w,p)
        s=controls.app_status(self.tx,public_identity(w));worker=self.worker(self.new['worker'],'status')
        require(s['identity']['commit']==self.c['commit'] and worker['commit']==self.c['commit'] and worker['targetInstanceId']==self.c['newNames']['web'],'EXECUTION_GRAPH_DRIFT')
        require(worker['origin']=='http://'+self.c['newNames']['web']+':3000' and environment(w)['INTERNAL_APP_ORIGIN']=='http://127.0.0.1:3000','WORKER_ORIGIN_DRIFT')
        require(self.config()==self.configuration,'MODEL_OR_BILLING_CHANGED')
        if self.c['target'].startswith('103.'):
            self.request(w,'/api/admin/fleet');self.request(w,'/api/admin/model-management')
            profile=self.request(w,'/api/site-profile',auth=False);require(profile.get('mode')=='platform','CENTRAL_MODE_DRIFT')
            if not self.record.get('storageAccepted'):
                script=pathlib.Path(__file__).with_name('r2_103_storage_acceptance.cjs')
                require(script.is_file() and file_sha(script)==self.c['storageProbeSha256'],'PINNED_STORAGE_ACCEPTANCE_REQUIRED')
                result=json.loads(self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',w['Id'],'node','-e',script.read_text()],stdin=json.dumps({'cookie':self.cookie,'releaseId':self.c['releaseId']}).encode(),timeout=180))
                require(result.get('passed') and result.get('verificationDataCleaned'),'REAL_STORAGE_ACCEPTANCE_FAILED')
                self.tx.save('storage-acceptance.json',result);self.record['storageAccepted']=True;self.persist()
        self.tx.save('acceptance-'+str(self.state['revision'])+'.json',{'at':base.now(),'version':version,'nativeAccount':True,'db':True,'paths':paths,'worker':worker,'configurationPreserved':True})

    def assets(self):
        parsed=compat.Dump(self.dump);aliases=compat.alias_inventory(parsed);sources=[];roots=set()
        for nodes in parsed.nodes.values():
            for node in compat.walk(nodes):
                if node.name=='location' and '_next/static' in ' '.join(node.args):
                    for child in node.children:
                        if child.name=='alias' and len(child.args)==1 and pathlib.Path(child.args[0]).is_dir():roots.add(child.args[0].rstrip('/'))
        require(roots,'EXISTING_ASSET_ROOT_REQUIRED')
        for i,p in enumerate(sorted(roots)):sources.append(('old-'+str(i),pathlib.Path(p)))
        extracted=self.root/'candidate-static'
        if not extracted.exists():
            extracted.mkdir(mode=0o700);self.tx.run(['docker','cp',self.new['web']['Id']+':/app/.next/static/.',str(extracted)],timeout=90)
        else:require(self.c.get('resumeCandidate')=='gateway','EXTRACTION_ALREADY_EXISTS')
        sources.append(('candidate',extracted))
        manifest=compat.collect_assets(sources,[(a['url'],a['path']) for a in aliases]);union=pathlib.Path('/var/www/naumi-assets-compat')/self.c['releaseId']
        if union.exists():
            require(self.c.get('resumeCandidate')=='gateway','STATIC_UNION_ALREADY_EXISTS');compat.verify_assets(manifest,union)
        else:compat.materialize_assets(manifest,union)
        for p in [union,*union.rglob('*')]:p.chmod(0o755 if p.is_dir() else 0o644)
        edits={};ports=[self.c['oldPort']]+([13062] if 'portal' in self.old else [])
        for name,nodes in parsed.nodes.items():
            for node in compat.walk(nodes):
                for token in node.tokens:
                    for port in ports:
                        old='http://127.0.0.1:'+str(port)
                        if token.value==old or token.value.startswith(old+'/') or token.value.startswith(old+'$'):
                            edits.setdefault(name,[]).append((token.start,token.end,compat.quote('http://127.0.0.1:'+str(self.c['newPort'])+token.value[len(old):])))
                    if node.name=='alias' and token.value.rstrip('/') in roots:edits.setdefault(name,[]).append((token.start,token.end,compat.quote(str(union/'_next/static')+'/')))
        require(edits,'EMPTY_GATEWAY_TRANSITION');self.afterdump,self.after=render_file_edits(self.dump,self.before,edits)
        # Exact legacy aliases and all unrelated services stay unchanged.
        require(compat.alias_inventory(compat.Dump(self.afterdump))==aliases,'LEGACY_ALIAS_CHANGED')
        syntax_check(self.tx,self.after,self.root/('isolated-nginx-check-'+str(self.state['revision'])));self.tx.save('static-union-'+str(self.state['revision'])+'.json',{'files':len(manifest['assets']),'manifestSha256':file_sha(union/'manifest.json'),'oldAliasesUnchanged':True})
        self.phase('READY')

    def marker(self,name):
        p=self.root/name
        if not p.exists():return False
        r=json.loads(p.read_bytes());require(r.get('commit')==self.c['commit'] and r.get('releaseId')==self.c['releaseId'] and r.get('passed') is True,'INVALID_BROWSER_ACCEPTANCE')
        return r

    def drain(self,group=None):
        group=group or self.old
        app=controls.app_status(self.tx,public_identity(group['web']));o=app['observations'];t=app['transport']['transport']
        require(app['admission']['mode']=='draining' and app['transport']['verified'] and t['completeFromProcessStart'] and not t['accountingFault'] and t['activeRequests']==0 and t['startedRequests']==t['finishedRequests'],'WEB_HTTP_NOT_DRAINED')
        require(all(type(o.get(k)) is int and o[k]==0 for k in ['activeRequests','trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases']),'WEB_EXECUTION_NOT_DRAINED')
        domain=self.request(group['web'],'/api/video/worker/drain-status',auth=False,worker=True)
        require(domain.get('drained') and domain.get('absentTables')==[] and all(domain[k]==0 for k in ['activeFences','activeTransactions','advisoryLocks']),'DOMAIN_NOT_DRAINED')
        owner=group['web']['Name'].lstrip('/');require(re.fullmatch('[A-Za-z0-9_.-]+',owner),'INVALID_OWNER_NAME')
        owners=self.sql("SELECT json_build_object('active',count(*)) FROM app_release_session_owners WHERE instance_id='"+owner+"' AND state<>'idle';")[0]
        require(owners['active']==0,'OLD_AGENT_SESSION_ACTIVE')
        ws=self.worker(group['worker'],'status');require(ws['paused'] and ws['activeTicks']==ws['unresolvedTicks']==0 and ws['tickDrainComplete'] and ws.get('backgroundTasks',0)==0,'WORKER_NOT_DRAINED')
        if 'media' in group:
            row=self.tx.inspect(group['media']['Id'])
            if row['State']['Running']:
                media=self.media(row,'health');require(media['running']==media['queued']==0,'MEDIA_NOT_DRAINED')
            else:require(self.record['operations'].get('retire-old-media',{}).get('phase')=='ACKNOWLEDGED' and row['State']['ExitCode']==0 and row['HostConfig']['RestartPolicy']['Name']=='no','MEDIA_STOP_NOT_ACKNOWLEDGED')
        return {'at':base.now(),'app':app,'domain':domain,'worker':ws,'historicalDrainProven':False}

    def switch(self):
        self.wait(lambda:self.marker('browser-before.json'),'REAL_CANDIDATE_ACCEPTANCE',600)
        action=self.retry_reconciled if self.c.get('resumeCandidate')=='gateway' else self.op
        action('pause-old-worker',lambda _:self.worker(self.old['worker'],'drain'));self.worker_paused=True
        self.wait(lambda:(lambda s:s['paused'] and s['activeTicks']==s['unresolvedTicks']==0 and s.get('backgroundTasks',0)==0)(self.worker(self.old['worker'],'status')),'OLD_WORKER_QUIESCENT',120)
        action('open-new-web',lambda _:controls.control_app(self.tx,public_identity(self.new['web']),'resume',str(uuid.uuid4())))
        action('gateway-switch',lambda _:self.gateway());self.switched=True;self.phase('SWITCHED')
        self.op('drain-old-web',lambda _:controls.control_app(self.tx,public_identity(self.old['web']),'drain',str(uuid.uuid4())));self.app_drained=True
        proof=self.wait(self.drain,'OLD_EXECUTION',180);self.tx.save('old-drain.json',proof)
        if 'media' in self.old:
            self.op('drain-old-media',lambda _:self.media(self.old['media'],'drain'))
            self.op('retire-old-media',lambda _:self.stop_media())
            self.op('cold-media-receipt-handoff',lambda _:self.handoff_media())
        self.op('resume-new-worker',lambda _:self.worker(self.new['worker'],'resume'))
        self.wait(lambda:(self.worker(self.new['worker'],'status').get('lastTick') or {}).get('phase')=='complete','NEW_WORKER_RECEIPT',120)
        self.phase('WORKER_ACTIVE');self.wait(lambda:self.marker('browser-after.json'),'PUBLIC_ACCEPTANCE',600)

    def retry_reconciled(self,name,fn):
        require(name in ['pause-old-worker','open-new-web','gateway-switch'] and self.record['operations'].get('gateway-preimage-reconciled',{}).get('phase')=='ACKNOWLEDGED','EXPLICIT_PREIMAGE_RECONCILIATION_REQUIRED')
        op=self.record['operations'][name];op.setdefault('attempts',[]).append({k:copy.deepcopy(v) for k,v in op.items() if k!='attempts'})
        op.update(phase='INTENT_RECORDED',at=base.now());self.persist()
        try:receipt=fn(op['operationId'])
        except BaseException:op['phase']='UNKNOWN';self.persist();raise
        op.update(phase='ACKNOWLEDGED',receipt=receipt);self.persist();return receipt

    def stop_media(self):
        row=self.old['media'];s=self.media(row,'health');require(s['draining'] and s['running']==s['queued']==0,'MEDIA_NOT_QUIESCENT')
        self.tx.run(['docker','update','--restart=no',row['Id']]);self.tx.run(['docker','stop','--time','60',row['Id']],timeout=75)
        row=self.tx.inspect(row['Id']);require(not row['State']['Running'] and row['State']['ExitCode']==0,'MEDIA_STOP_FAILED');self.old['media']=row;return public_identity(row)

    def handoff_media(self):
        # Copy only after BOTH writers are stopped. No accepted render is replayed.
        row=self.new['worker'];s=self.worker(row,'status');require(s['paused'] and s['activeTicks']==s['unresolvedTicks']==0 and s['mediaWorker']['running']==s['mediaWorker']['queued']==0,'NEW_MEDIA_NOT_QUIESCENT')
        self.tx.run(['docker','stop','--time','60',row['Id']],timeout=75);stopped=self.tx.inspect(row['Id']);require(not stopped['State']['Running'] and stopped['State']['ExitCode']==0,'PAUSED_WORKER_STOP_FAILED')
        source=pathlib.Path(next(m['Source'] for m in self.old['web']['Mounts'] if m['Destination']=='/scratch'));target=self.root/'media-scratch'
        require(source.is_absolute() and source.is_dir() and not source.is_symlink() and target.is_dir() and source!=target,'PRIVATE_SCRATCH_HANDOFF_REQUIRED')
        files=[p for p in source.rglob('*') if p.is_file()];require(all(not p.is_symlink() for p in source.rglob('*')),'SCRATCH_SYMLINK_FORBIDDEN')
        require(all(not (target/p.relative_to(source)).exists() for p in files),'SCRATCH_HANDOFF_COLLISION')
        total=0
        for p in files:
            dest=target/p.relative_to(source);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
            require(file_sha(dest)==file_sha(p),'SCRATCH_COPY_NOT_IDENTICAL');os.chown(dest,1001,1001);total+=dest.stat().st_size
        for p in target.rglob('*'):
            if p.is_dir():os.chown(p,1001,1001);p.chmod(0o700)
        self.tx.run(['docker','start',row['Id']]);self.new['worker']=self.tx.inspect(row['Id'])
        self.wait(lambda:self.worker(self.new['worker'],'status')['paused'],'WORKER_HANDOFF_PAUSED')
        return {'files':len(files),'bytes':total,'sourceRetained':True,'bothWritersStoppedDuringCopy':True,'acceptedTasksReplayed':False}

    def rollback(self):
        # Before a switch the old site remains authoritative and can resume.
        # After a switch, older code cannot enforce the new tenant policy.
        if not self.switched and self.worker_paused:
            observed=sha(self.tx.run(['nginx','-T']))
            if observed!=self.c['nginxSha256']:
                self.phase('UNKNOWN',gatewaySwitchAcknowledged=False,gatewayObservedSha256=observed,databaseRestored=False,tasksReplayed=False)
                return
            self.worker(self.old['worker'],'resume')
        self.phase('CLEANUP_PENDING',gatewaySwitched=self.switched,oldProgramCutbackAllowed=False,databaseRestored=False,tasksReplayed=False)

    def finish(self):
        self.acceptance()
        self.op('retirement-worker-barrier',lambda _:self.worker(self.new['worker'],'drain'))
        self.wait(lambda:(lambda s:s['paused'] and s['activeTicks']==s['unresolvedTicks']==0)(self.worker(self.new['worker'],'status')),'RETIREMENT_WORKER_BARRIER',120)
        try:
            for index in range(3):
                self.tx.save('retirement-drain-'+str(index)+'.json',self.wait(self.drain,'RETIREMENT_DRAIN',90));time.sleep(2)
            for port in [self.c['oldPort'],13062]:
                require(not self.tx.run(['ss','-Htn','state','established','( sport = :'+str(port)+' or dport = :'+str(port)+' )']).strip(),'OLD_HTTP_CONNECTIONS_ACTIVE')
            # This exact old portal cannot run scanners or generate jobs. Its
            # synchronous handlers lose ingress before its zero-connection and
            # DB-transaction grace period. It is not treated as a full Web.
            portal=self.old['portal'];e=environment(portal)
            require(e.get('FLEET_PORTAL_ONLY')=='1' and e.get('FLEET_SCHEDULER_ENABLED')=='0' and e.get('FLEET_RELEASE_DISPATCH_ENABLED')=='0','PORTAL_ASYNC_SCOPE_CHANGED')
            checks=[]
            for _ in range(7):
                require(not self.tx.run(['ss','-Htn','state','established','( sport = :13062 or dport = :13062 )']).strip(),'PORTAL_STILL_ACTIVE')
                addresses=[n['IPAddress'] for n in portal['NetworkSettings']['Networks'].values() if n.get('IPAddress')]
                require(addresses and all(re.fullmatch('[0-9.]+',a) for a in addresses),'PORTAL_PRIVATE_ADDRESS_REQUIRED')
                count=self.sql("SELECT json_build_object('active',count(*)) FROM pg_stat_activity WHERE client_addr::text IN ("+','.join("'"+a+"'" for a in addresses)+") AND state<>'idle';")[0]['active']
                require(count==0,'PORTAL_DATABASE_TRANSACTION_ACTIVE');checks.append({'at':base.now(),'active':count});time.sleep(5)
            self.tx.save('portal-quiescence.json',{'scope':'fleet-only-no-background-workers','observations':checks,'ingressRemoved':True})
            require(all(('http://127.0.0.1:'+str(p)) not in self.tx.run(['nginx','-T']).decode() for p in [self.c['oldPort'],13062]),'OLD_GATEWAY_REFERENCE_REMAINS')
            after=tasks.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,previous=self.task_before.private,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
            preservation=tasks.compare_task_snapshots(self.task_before,after);self.tx.save('task-preservation.json',preservation);require(preservation['preservationVerified'],'TASK_PRESERVATION_FAILED')
            for role in ['worker','media','portal','web']:
                row=self.old[role]
                if role=='media':
                    current=self.tx.inspect(row['Id']);require(not current['State']['Running'] and current['State']['ExitCode']==0 and current['HostConfig']['RestartPolicy']['Name']=='no','OLD_MEDIA_RESTARTED');continue
                def stop(_,r=row):
                    self.tx.pin(public_identity(r));self.tx.run(['docker','update','--restart=no',r['Id']]);self.tx.run(['docker','stop','--time','60',r['Id']],timeout=75)
                    result=self.tx.inspect(r['Id']);require(not result['State']['Running'] and result['State']['ExitCode']!=137 and not result['State']['OOMKilled'],'OLD_SLOT_NOT_CLEANLY_RETIRED');return public_identity(result)
                self.op('retire-'+role,stop)
            self.old_stopped=True
            web=self.new['web'];state=next(m['Source'] for m in web['Mounts'] if m['Destination']=='/release-state')
            spec={'releaseId':self.c['releaseId'],'commit':self.c['commit'],'buildVersion':self.c['buildVersion'],'releaseSecret':environment(web)['RELEASE_CONTROL_SECRET']}
            startup.write_activation(pathlib.Path(state)/'activation.json',startup.activation_marker(spec,public_identity(web),True))
            startup.verify_launcher(state,release_id=self.c['releaseId'],commit=self.c['commit'],version=self.c['buildVersion'],instance=web['Name'].lstrip('/'))
            for role,row in list(self.new.items()):
                self.tx.run(['docker','update','--restart=unless-stopped',row['Id']]);self.new[role]=self.tx.inspect(row['Id'])
        finally:
            resumed=time.time();self.op('worker-after-retirement-barrier',lambda _:self.worker(self.new['worker'],'resume'))
        def current_tick():
            s=self.worker(self.new['worker'],'status');tick=s.get('lastTick') or {}
            return tick.get('phase')=='complete' and dt.datetime.fromisoformat(tick['startedAt'].replace('Z','+00:00')).timestamp()>=resumed and tick.get('workerCommit')==self.c['commit']
        self.wait(current_tick,'FINAL_WORKER_RECEIPT',120)
        self.acceptance();self.tx.save('capacity-final.json',self.memory())
        import urllib.request
        request=urllib.request.Request('http://127.0.0.1/api/version',headers={'Host':self.c['target']})
        with urllib.request.urlopen(request,timeout=15) as response:public=json.loads(response.read())
        require(public=={'version':self.c['buildVersion'],'commit':self.c['commit']},'PUBLIC_GATEWAY_VERSION_DRIFT')
        self.tx.save('public-version.json',{'observedAt':base.now(),'version':public})
        self.phase('COMPLETE',completedAt=base.now(),new={k:public_identity(self.tx.inspect(r['Id'])) for k,r in self.new.items()},old={k:public_identity(self.tx.inspect(r['Id'])) for k,r in self.old.items()},sameWebWorkerImage=True,configurationPreserved=True,legacyHistoricalUncertaintyRetained=True)
        self.tx.save('FINAL_STATUS.json',self.record)

def resume_after_worker_start(tx,c):
    """Reconcile this exact pre-switch startup wait; never repeat create or backup."""
    from types import SimpleNamespace
    root=tx.folder;original=json.loads((root/'release-config.private.json').read_bytes())
    require(c.get('originalConfigSha256')==file_sha(root/'release-config.private.json'),'ORIGINAL_REVIEW_CHANGED')
    require({k:v for k,v in c.items() if k not in ['resumeCandidate','originalConfigSha256','canonicalRevision','canonicalSha256','date']}=={k:v for k,v in original.items() if k not in ['canonicalRevision','canonicalSha256','date']},'RESUME_SCOPE_CHANGED')
    raw=CANON.read_bytes();state=json.loads(raw)
    require(sha(raw)==c['canonicalSha256'] and state['revision']==c['canonicalRevision'],'RESUME_CANONICAL_CHANGED')
    record=state['siteControlReleases'][c['releaseId']]
    gateway=c.get('resumeCandidate')=='gateway'
    expected={'database-backup','image-load','web-create','web-start','worker-create','worker-start'}|({'startup-readiness-reconciled','pause-old-worker','open-new-web','gateway-switch'} if gateway else set())
    require(record['phase']=='CLEANUP_PENDING' and record.get('gatewaySwitched') is False and set(record['operations'])==expected and all(o['phase']==('UNKNOWN' if gateway and name=='gateway-switch' else 'ACKNOWLEDGED') for name,o in record['operations'].items()),'ONLY_REVIEWED_PRE_SWITCH_RESUME')
    require(sha(tx.run(['nginx','-T']))==c['nginxSha256'],'PRE_SWITCH_GATEWAY_CHANGED')
    r=Release.__new__(Release);r.tx=tx;r.c=c;r.root=root;r.state=state;r.record=record;r.disk=sha(raw);r.initial=raw
    r.rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]));r.byname={v['Name'].lstrip('/'):v for v in r.rows}
    r.old={k:r.byname[n] for k,n in c['oldNames'].items()};r.new={k:r.byname[n] for k,n in c['newNames'].items()};r.extra=[]
    for k,v in r.old.items():require(public_identity(v)==c['oldPins'][k],'OLD_INSTANCE_CHANGED')
    for k,v in r.new.items():
        require(v['Id']==record['operations'][k+'-create']['receipt']['id'] and v['Image']==c['image'] and v['State']['Running'] and v['HostConfig']['RestartPolicy']['Name']=='no','ORIGINAL_CANDIDATE_CHANGED')
    require(sorted(v['Id'] for v in r.rows if v['State']['Running'])==sorted([*c['runningIds'],*[v['Id'] for v in r.new.values()]]),'UNREVIEWED_RUNNING_INSTANCE')
    r.db=r.byname['naumi-staging-db-1'];r.de=environment(r.db);r.configuration=json.loads((root/'configuration-before.json').read_bytes());r.cookie=(root/'acceptance-cookie.private').read_text()
    r.dump=(root/'nginx-before.private.txt').read_text();r.before={p:base64.b64decode(v) for p,v in json.loads((root/'nginx-files-before.private.json').read_bytes()).items()};r.real={p:str(pathlib.Path(p).resolve()) for p in r.before}
    snapshots=list(root.glob('task-snapshot-*.json'));require(len(snapshots)==1,'ORIGINAL_TASK_SNAPSHOT_AMBIGUOUS');r.task_before=tasks.Snapshot(public={},private=json.loads(snapshots[0].read_bytes()))
    r.switched=r.old_stopped=r.worker_paused=r.app_drained=False
    require(controls.app_status(tx,public_identity(r.new['web']))['admission']['mode']==('accepting' if gateway else 'draining'),'CANDIDATE_ADMISSION_CHANGED')
    require(r.worker(r.new['worker'],'status')['paused'],'CANDIDATE_WORKER_ACTIVE')
    if gateway:
        require(all(pathlib.Path(p).read_bytes()==data for p,data in r.before.items()),'GATEWAY_PREIMAGE_NOT_RESTORED')
        require(not r.worker(r.old['worker'],'status')['paused'],'OLD_WORKER_NOT_RESUMED')
        import urllib.request
        req=urllib.request.Request('http://127.0.0.1/api/version',headers={'Host':c['target']})
        with urllib.request.urlopen(req,timeout=15) as response:observed=json.loads(response.read())
        require(observed['commit']==c['oldCommit'],'PUBLIC_NOT_ON_PREIMAGE')
    r.op('gateway-preimage-reconciled' if gateway else 'startup-readiness-reconciled',lambda _: {'sameCandidateIds':{k:public_identity(v) for k,v in r.new.items()},'backupRepeated':False,'gatewayUnchanged':True,'originalOperationId':record['operations'].get('gateway-switch',{}).get('operationId')})
    r.phase('CANDIDATE_READY',new={k:public_identity(v) for k,v in r.new.items()})
    return r

def main(config):
    import fcntl
    c=json.loads(pathlib.Path(config).read_bytes());validate(c)
    with HostTransaction(c['target'],HOSTS[c['target']],c['evidenceRoot']) as tx:
        with open(CANON.parent/'.lifecycle.lock','a+') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            r=resume_after_worker_start(tx,c) if c.get('resumeCandidate') else Release(tx,c)
            try:
                if not c.get('resumeCandidate'):r.prepare();r.candidates()
                r.acceptance();r.assets();r.switch();r.finish()
            except BaseException:
                if r.record['releaseId'] in r.state.get('siteControlReleases',{}):r.rollback()
                raise
