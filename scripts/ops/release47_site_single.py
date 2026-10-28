"""User-authorized single-instance enterprise cutover, with preserved task receipts.

Offline build/backup/policy/bootstrap/static preparation precede a short stop/start.
Never runs both Webs, restores business data, or replays paid operations.
"""
import base64,copy,datetime as dt,hashlib,hmac,importlib.util,json,os,pathlib,re,shutil,sys,time,uuid
from release47_host import HostTransaction,require,file_sha,environment,public_identity,sha
import release_site_control as shared
import release103_refactor as base
import release47_controls as controls
import release47_task_snapshot as tasks
import release47_recovery_supervisor as recovery

ACK='不用双槽了 只保留最新的'
ENTERPRISE='1095114e-6b57-429e-a954-7d663907e0c9'
SOURCE='naumi47-tdh'

def current_activity_collector(names):
    """Bound live-slot observations; HistoricalEvidence covers excluded rows."""
    require(len(names)==2 and all(re.fullmatch('naumi47-web-[a-z0-9-]+',n) for n in names),'CURRENT_PAIR_REQUIRED')
    spec=importlib.util.spec_from_file_location('_site47_current_tasks',tasks.__file__)
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    module.SPECS=dict(module.SPECS);module.GRAPH_FIELDS=[*module.GRAPH_FIELDS,'instance_id']
    key,predicate=module.SPECS['app_release_activities']
    module.SPECS['app_release_activities']=(key,'('+predicate+") AND j->>'instance_id' IN ("+','.join(module.literal(n) for n in names)+')')
    return module

def scoped_activity_baseline(snapshot,history):
    """Retain the original artifact; delegate only a proven historical overflow."""
    original=snapshot.private;table=original['tables']['app_release_activities']
    if table.get('selectedCount',0)<=original.get('rowLimit',5000):return snapshot,None
    retained=next((v for v in history if v.get('kind')=='historicalActivities'),{})
    # Every originally active observation must be in the separately hashed set.
    # Never hide business-task overflow or an unobserved current-slot activity.
    require(table.get('status')=='observed' and table.get('activeCount')==table.get('selectedCount')==retained.get('count') and re.fullmatch('[a-f0-9]{64}',retained.get('sha256','')),'HISTORICAL_OVERFLOW_NOT_FULLY_COVERED')
    scoped=copy.deepcopy(original);scoped['tables']['app_release_activities']={**table,'rows':[],'selectedCount':0,'activeCount':0}
    evidence={'originalSnapshotSha256':tasks.sha(original),'delegatedTable':'app_release_activities','retainedRows':retained['count'],'retainedRowsSha256':retained['sha256'],'currentPairActiveAtBaseline':0,'originalArtifactUnchanged':True,'unknownReclassified':False}
    return tasks.Snapshot(public={},private=scoped),evidence

class HistoricalEvidence:
    """Same retained-history scope as the actual 2026-10-28 predecessor.

    Business tasks, supplier calls and ledger remain in the full task snapshot.
    Historical slot observations are additionally protected by exact SQL hashes.
    """
    def __init__(self,r):self.r=r;self.before=None;self.sequence=0
    def capture(self):
        names=','.join("'"+self.r.c[k]['web']+"'" for k in ['oldNames','newNames'])
        return self.r.sql("SELECT jsonb_build_object('kind','historicalActivities','count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(a) ORDER BY id),'[]')::text,'UTF8')),'hex')) FROM app_release_activities a WHERE state<>'finished' AND instance_id NOT IN ("+names+");SELECT jsonb_build_object('kind','oldSessionOwners','count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(a) ORDER BY account_key,session_id,kind),'[]')::text,'UTF8')),'hex')) FROM app_release_session_owners a WHERE instance_id NOT IN ("+names+");")
    def establish(self):
        self.before=self.capture();self.r.tx.save('retained-history-before.json',self.before)
    def check(self,stage):
        after=self.capture();require(self.before==after,'RETAINED_HISTORICAL_OBSERVATIONS_CHANGED');self.sequence+=1
        self.r.tx.save('retained-history-'+str(self.sequence)+'.json',{'stage':stage,'exact':True,'data':after,'unknownReclassified':False})

def validate(c):
    require(c.get('target')=='47.105.59.142' and c.get('authorization')==shared.AUTHORIZATION and c.get('replacementAuthorization')==ACK,'EXPLICIT_SINGLE_INSTANCE_AUTHORIZATION_REQUIRED')
    require(c.get('releaseMode')=='STOP_OLD_REPLACE' and c.get('workspaceModules')==[],'NO_INDEPENDENT_COLLABORATION')
    require(re.fullmatch('release47-site-control-[a-z0-9-]{6,50}',c.get('releaseId','')),'RELEASE_ID_REQUIRED')
    require(pathlib.PurePosixPath(c['evidenceRoot'])==pathlib.PurePosixPath('/opt/naumi-staging/evidence')/c['releaseId'],'EVIDENCE_ROOT_REQUIRED')
    require(re.fullmatch('[a-f0-9]{40}',c.get('commit','')) and re.fullmatch('sha256:[a-f0-9]{64}',c.get('image','')),'FIXED_BUILD_REQUIRED')
    require(c.get('restoreDatabase') is False and c.get('replayAcceptedTasks') is False,'NO_RESTORE_OR_REPLAY')
    require(c.get('webMemoryMiB')==2560 and c.get('workerMemoryMiB')==1024,'EXISTING_RAM_LIMITS_REQUIRED')
    require(c.get('oldPort')==13121 and c.get('newPort')==13122,'REVIEWED_PORTS_REQUIRED')
    require(c.get('date')==dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'FRESH_REVIEW_REQUIRED')
    require(set(c['oldNames'])==set(c['newNames'])=={'web','worker'},'SINGLE_WEB_WORKER_REQUIRED')
    require(len(set([*c['oldNames'].values(),*c['newNames'].values()]))==4 and all(re.fullmatch('naumi47-[a-z0-9-]{6,85}',n) for n in c['newNames'].values()),'EXACT_INSTANCE_NAMES_REQUIRED')
    require(c.get('webEnvironment')=={'NAUMI_ENTERPRISE_DEPLOYMENT_MODE':'dedicated','NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID':SOURCE,'NAUMI_ENTERPRISE_ALLOWED_IDS':ENTERPRISE,'NAUMI_FLEET_MEDIA_ORIGIN':'https://47.105.59.142','FLEET_INSTANCE_ID':c['fleetInstanceId'],'FLEET_CONTROL_ENABLED':'0','FLEET_PORTAL_ONLY':'0','FLEET_RELEASE_DISPATCH_ENABLED':'0','FLEET_SCHEDULER_ENABLED':'0'},'PINNED_ENTERPRISE_ENV_REQUIRED')

class Release(shared.Release):
    def prepare(self):
        if not self.c.get('resumePrepared'):super().prepare()
        self.record.update(releaseMode='STOP_OLD_REPLACE',replacementAuthorization=ACK,independentCollaboration=False)
        self.persist()
        self.guard=HistoricalEvidence(self)
        self.guard.establish()
        owner=self.sql("SELECT json_build_object('email',t.owner_email) FROM app_account_teams t JOIN app_users u ON u.email=t.owner_email WHERE t.id='"+ENTERPRISE+"' AND NOT u.banned;")
        require(len(owner)==1,'ACTIVE_COMPANY_OWNER_REQUIRED')
        email=owner[0]['email'];secret=environment(self.old['web'])['SETTINGS_SECRET'];exp=str(int(time.time()*1000)+30*86400000);eb=base64.urlsafe_b64encode(email.encode()).decode().rstrip('=')
        self.cookie='nv_user='+eb+'.'+exp+'.'+hmac.new(secret.encode(),('user:'+eb+'.'+exp).encode(),hashlib.sha256).hexdigest()
        self.tx.save('acceptance-cookie.private',self.cookie.encode());self.request(self.old['web'],'/api/auth/session')
        oldsnap=self.request(self.old['web'],'/api/enterprise?enterpriseId='+ENTERPRISE)
        require(oldsnap['actor']['owner'] is True,'ORIGINAL_OWNER_PERMISSION_REQUIRED')
        self.tx.save('enterprise-before.private.json',oldsnap)
        for name,digest in [('image.tar.gz',self.c['archiveSha256']),('services-image.tar.gz',self.c['runtimeArchiveSha256']),('origin-ca.pem',self.c['caSha256'])]:
            require(file_sha(self.root/name)==digest,'PINNED_ARCHIVE_CHANGED')
        self.op('image-load',lambda _:{'loaded':bool(self.tx.run(['docker','load','-i',str(self.root/'image.tar.gz')],timeout=300))})
        self.op('runtime-load',lambda _:{'loaded':bool(self.tx.run(['docker','load','-i',str(self.root/'services-image.tar.gz')],timeout=300))})
        env=environment(json.loads(self.tx.run(['docker','image','inspect',self.c['image']]))[0])
        require(env.get('SOURCE_COMMIT')==self.c['commit'] and env.get('BUILD_VERSION')==self.c['buildVersion'],'IMAGE_PROVENANCE_CHANGED')
        self.op('policy-bootstrap',lambda _:self.connector(self.old['web'],once=True))
        policy=self.sql('SELECT json_build_object(\'policy\',policy) FROM app_site_policy WHERE singleton;')
        require(len(policy)==1 and policy[0]['policy']['enterpriseId']==ENTERPRISE and policy[0]['policy']['sourceInstanceId']==SOURCE and policy[0]['policy']['revision']==1 and policy[0]['policy']['workspaceModules']==[],'INITIAL_POLICY_NOT_APPLIED')
        self.tx.save('policy-initial.json',policy)
        self.guard.check('bootstrap')
        self.op('web-create-stopped',lambda _:self.clone_web())
        require(not self.new['web']['State']['Running'],'SINGLE_INSTANCE_PREPARATION_ONLY')
        self.assets();self.phase('REPLACEMENT_PREPARED')

    def connector(self,web,once=False):
        credential=json.loads((self.root/'instance.private.json').read_bytes())
        require(credential['id']==self.c['fleetInstanceId'] and re.fullmatch('[A-Za-z0-9_-]{43}',credential['token']),'PRIVATE_INSTANCE_CREDENTIAL_REQUIRED')
        oldenv=environment(web);env={k:oldenv[k] for k in ['DATABASE_URL','SETTINGS_SECRET','STORAGE_DRIVER']}
        env.update(self.c['webEnvironment']);env.update(FLEET_CONNECTOR_ENABLED='1',FLEET_CENTRAL_URL='https://naumi.top',FLEET_INSTANCE_TOKEN=credential['token'],FLEET_CENTRAL_RESOLVE_IP='103.30.76.93',FLEET_CENTRAL_CA_FILE='/run/fleet/origin-ca.pem',FLEET_RELEASE_RELAY_ENABLED='0',FLEET_APP_ORIGIN='http://127.0.0.1:3000',FLEET_DESKTOP_ORIGIN='http://127.0.0.1:3000',FLEET_ENTERPRISE_ORIGIN='http://127.0.0.1:3000',NODE_OPTIONS='--max-old-space-size=96')
        ca=self.root/'origin-ca.pem';ca.chmod(0o644)
        name='naumi47-fleet-site-control-20261029'+('-bootstrap' if once else '')
        config={'Image':self.c['runtimeImage'],'User':'1000:1000','WorkingDir':'/runtime','Cmd':['node','fleet/connector.js']+(['--once'] if once else []),'Env':[k+'='+v for k,v in sorted(env.items())], 'Labels':{'naumi.release':self.c['releaseId']},'HostConfig':{'NetworkMode':'container:'+web['Id'],'Memory':192*1024**2,'MemorySwap':192*1024**2,'NanoCpus':250000000,'PidsLimit':64,'ReadonlyRootfs':True,'CapDrop':['ALL'],'SecurityOpt':['no-new-privileges:true'],'RestartPolicy':{'Name':'no' if once else 'unless-stopped'},'Tmpfs':{'/tmp':'rw,noexec,nosuid,size=16m,mode=1777'},'Mounts':[{'Type':'bind','Source':str(ca),'Target':'/run/fleet/origin-ca.pem','ReadOnly':True}]}}
        if not once:
            # Stable Docker DNS survives Web restarts; do not pin a namespace
            # that becomes stale when the Web process/container is recovered.
            network=web['HostConfig']['NetworkMode'];require(network in web['NetworkSettings']['Networks'],'PRIMARY_NETWORK_REQUIRED')
            for key in ['FLEET_APP_ORIGIN','FLEET_DESKTOP_ORIGIN','FLEET_ENTERPRISE_ORIGIN']:env[key]='http://naumi-app:3000'
            config['Env']=[k+'='+v for k,v in sorted(env.items())];config['HostConfig']['NetworkMode']=network
            config['NetworkingConfig']={'EndpointsConfig':{network:{'Aliases':[name]}}}
        cid=self.docker_api('/containers/create?name='+name,config)['Id']
        if not once:
            for network in web['NetworkSettings']['Networks']:
                if network!=web['HostConfig']['NetworkMode']:self.docker_api('/networks/'+network+'/connect',{'Container':cid})
        self.tx.run(['docker','start',cid])
        if once:
            code=self.tx.run(['docker','wait',cid],timeout=90).decode().strip();row=self.tx.inspect(cid)
            logs=self.tx.run(['docker','logs',cid]).decode();self.tx.save('connector-bootstrap.json',{'exit':code,'log':logs,'identity':public_identity(row)})
            require(code=='0' and 'FLEET_TICK=succeeded' in logs,'CENTRAL_SIGNED_POLICY_FAILED')
        else:self.extra.append(self.tx.inspect(cid))
        return public_identity(self.tx.inspect(cid))

    def memory(self):
        used=0
        for row in [*self.new.values(),*self.extra]:
            row=self.tx.inspect(row['Id'])
            if row['State']['Running']:
                rel=pathlib.Path('/proc/'+str(row['State']['Pid'])+'/cgroup').read_text().split('0::',1)[1].strip()
                used+=int((pathlib.Path('/sys/fs/cgroup')/rel.lstrip('/')/'memory.current').read_text())//1024**2
        free=base.available();remaining=max(0,2560+1024+192-used)
        require(free>=remaining+1024,'SINGLE_SLOT_MEMORY_INSUFFICIENT')
        return {'availableMiB':free,'remainingPeakMiB':remaining,'reserveMiB':1024,'swapIncluded':False}

    def replace(self):
        # Close admission, let already accepted work finish, then pause the scanner.
        self.op('drain-old-web',lambda _:controls.control_app(self.tx,public_identity(self.old['web']),'drain',str(uuid.uuid4())));self.app_drained=True
        self.wait(lambda:self.request(self.old['web'],'/api/video/worker/drain-status',auth=False,worker=True).get('drained'),'ACCEPTED_TASKS_COMPLETE',300)
        self.op('pause-old-worker',lambda _:self.worker(self.old['worker'],'drain'));self.worker_paused=True
        self.tx.save('old-drain.json',self.wait(self.drain,'OLD_DRAINED',90))
        media=self.worker(self.old['worker'],'status').get('mediaWorker',{})
        require(media.get('running')==media.get('queued')==0,'MEDIA_STILL_RUNNING')
        self.guard.check('before-stop')
        for role in ['worker','web']:
            def stop(_,role=role):
                row=self.old[role];self.tx.run(['docker','update','--restart=no',row['Id']]);self.tx.run(['docker','stop','--time','60',row['Id']],timeout=75)
                row=self.tx.inspect(row['Id']);require(not row['State']['Running'] and row['State']['ExitCode'] in [0,143] and not row['State']['OOMKilled'],'OLD_SLOT_NOT_CLEANLY_STOPPED');return public_identity(row)
            self.op('retire-'+role,stop)
        self.old_stopped=True;self.phase('OLD_STOPPED',outageStartedAt=base.now())
        source=pathlib.Path(next(m['Source'] for m in self.old['web']['Mounts'] if m['Destination']=='/scratch'));dest=self.root/'media-scratch'
        require(source.is_dir() and not source.is_symlink() and not list(dest.iterdir()),'EMPTY_COLD_SCRATCH_REQUIRED')
        files=[p for p in source.rglob('*') if p.is_file()];require(all(not p.is_symlink() for p in source.rglob('*')),'SCRATCH_SYMLINK')
        for p in files:
            to=dest/p.relative_to(source);to.parent.mkdir(mode=0o700,parents=True,exist_ok=True);shutil.copy2(p,to);os.chown(to,1001,1001);require(file_sha(p)==file_sha(to),'SCRATCH_COPY_CHANGED')
        for p in dest.rglob('*'):
            if p.is_dir():os.chown(p,1001,1001)
        self.tx.save('cold-receipts.json',{'files':len(files),'bytes':sum(p.stat().st_size for p in files),'sourceRetained':True,'writersStopped':True})
        self.tx.save('capacity-before-start.json',self.memory())
        self.op('web-start',lambda _:{'started':bool(self.tx.run(['docker','start',self.new['web']['Id']]))});self.new['web']=self.tx.inspect(self.new['web']['Id'])
        self.wait(lambda:self.request(self.new['web'],'/api/health',auth=False).get('db',{}).get('ok'),'WEB_READY')
        w=self.op('worker-create',lambda _:controls.clone_worker(self.tx,public_identity(self.new['web']),name=self.c['newNames']['worker'],memory_mib=1024,cpu=1,state_dir='/opt/naumi-staging/releases/'+self.c['releaseId']+'/worker',reviewed_combined_media=True,reviewed_runtime_memory=True))
        self.op('worker-start',lambda _:controls.start_worker(self.tx,w,base.available(),reviewed_combined_media=True,reviewed_runtime_memory=True));self.new['worker']=self.tx.inspect(w['id'])
        self.wait(lambda:self.worker(self.new['worker'],'status')['paused'],'WORKER_PAUSED')
        self.acceptance(storage=False)
        self.op('open-new-web',lambda _:controls.control_app(self.tx,public_identity(self.new['web']),'resume',str(uuid.uuid4())))
        self.op('gateway-switch',lambda _:self.gateway());self.switched=True
        self.op('resume-new-worker',lambda _:self.worker(self.new['worker'],'resume'))
        self.phase('PUBLIC_ACCEPTANCE',outageEndedAt=base.now())

    def acceptance(self,storage=True):
        w=self.new['web'];require(self.request(w,'/api/version',auth=False)=={'version':self.c['buildVersion'],'commit':self.c['commit']},'VERSION_DRIFT')
        require(self.request(w,'/api/health',auth=False).get('db',{}).get('ok'),'DB_NOT_READY')
        require(self.request(w,'/api/auth/session').get('user'),'NATIVE_LOGIN_REQUIRED')
        profile=self.request(w,'/api/site-profile',auth=False)
        require(profile.get('mode')=='enterprise' and profile['policy']['enterpriseId']==ENTERPRISE and profile['policy']['workspaceModules']==[],'ENTERPRISE_BINDING_CHANGED')
        snap=self.request(w,'/api/enterprise?enterpriseId='+ENTERPRISE);require(snap['actor']['owner'] is True,'COMPANY_ADMIN_DENIED')
        for p in ['/api/projects','/canvas','/admin','/enterprise']:self.request(w,p)
        for p in ['/api/admin/settings','/api/admin/fleet','/api/admin/model-management']:self.request(w,p,expected=404)
        self.request(w,'/api/enterprise?enterpriseId='+ENTERPRISE,auth=False,expected=401)
        worker=self.worker(self.new['worker'],'status');require(worker['commit']==self.c['commit'] and worker['targetInstanceId']==self.c['newNames']['web'] and worker['origin']=='http://'+self.c['newNames']['web']+':3000','WORKER_EXECUTION_GRAPH_CHANGED')
        require(self.config()==self.configuration,'MODEL_OR_BILLING_CONFIG_CHANGED')
        if storage and not self.record.get('storageAccepted'):
            script=pathlib.Path(__file__).with_name('nas47_storage_acceptance.cjs');require(file_sha(script)==self.c['storageProbeSha256'],'STORAGE_PROBE_CHANGED')
            result=json.loads(self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',w['Id'],'node','-e',script.read_text()],stdin=json.dumps({'cookie':self.cookie,'releaseId':self.c['releaseId']}).encode(),timeout=240))
            require(result.get('passed') and result.get('verificationDataCleaned'),'NAS_ACCEPTANCE_FAILED');self.tx.save('storage-acceptance.json',result);self.record['storageAccepted']=True;self.persist()
        self.tx.save('acceptance-'+str(self.state['revision'])+'.json',{'at':base.now(),'nativeOwner':True,'profile':profile,'platformEndpointsDenied':True,'modelBillingPreserved':True,'worker':worker})

    def bind_recovery(self,_):
        m=copy.deepcopy(self.previousManifest);m.update(commit=self.c['commit'],image=self.c['image'],buildVersion=self.c['buildVersion'],successorReleaseId=self.c['releaseId'],gatewayDumpSha256=sha(self.tx.run(['nginx','-T'])),cookieFile=str(self.root/'acceptance-cookie.private'),journalDir=str(self.root/'recovery-journal'),evidenceDir=str(self.root/'runtime-recovery'))
        for role in ['web','worker']:
            r=self.tx.inspect(self.new[role]['Id']);require(r['HostConfig']['RestartPolicy']['Name']=='no','PINNED_RECOVERY_RESTART_POLICY')
            m[role]={**public_identity(r),'role':role,'memoryMiB':r['HostConfig']['Memory']//1024**2,'staticSha256':recovery.static_pin(r),'runningAtEnrollment':True}
        path=self.root/'supervisor-manifest.private.json';self.tx.save(path.name,m)
        self.state['runtimeRecovery'].update(manifestPath=str(path),manifestSha256=sha(recovery.encoded(m)),effectiveWeb=public_identity(self.new['web']),effectiveWorker=public_identity(self.new['worker']),successorReleaseId=self.c['releaseId'])
        self.state['webs']['main']['running']=public_identity(self.new['web']);self.state['worker']['running']=public_identity(self.new['worker']);self.persist();recovery.recovery_binding(self.state,m)
        unit=pathlib.Path('/etc/systemd/system/naumi47-recovery.service');before=unit.read_text();after=re.sub(r'^ExecStart=.*$', 'ExecStart=/usr/bin/python3 '+str(pathlib.Path(__file__).with_name('release47_recovery_supervisor.py'))+' --manifest '+str(path),before,flags=re.M)
        require(after!=before and after.count('ExecStart=')==1,'RECOVERY_UNIT_BINDING_REQUIRED');unit.write_text(after);self.tx.run(['systemctl','daemon-reload'])
        result=recovery.Supervisor(m,pathlib.Path(m['journalDir']),recovery.Adapter(self.tx,m)).once();self.tx.save('recovery-enrollment.json',result)
        return {'manifestSha256':sha(recovery.encoded(m)),'sameOriginalRecoveryOperation':True,'oldInstancesNotRestarted':True}

    def finish(self):
        self.wait(lambda:(self.worker(self.new['worker'],'status').get('lastTick') or {}).get('phase')=='complete','WORKER_RECEIPT',120)
        self.acceptance();self.guard.check('after-public')
        self.op('bind-current-recovery',self.bind_recovery)
        self.op('start-central-connector',lambda _:self.connector(self.new['web']))
        self.wait(lambda:self.marker('browser-after.json'),'PUBLIC_BROWSER_ACCEPTANCE',600)
        self.guard.check('before-task-proof')
        before,delegation=scoped_activity_baseline(self.task_before,self.guard.before)
        if delegation:self.tx.save('task-history-delegation.json',delegation)
        collector=current_activity_collector([self.c['oldNames']['web'],self.c['newNames']['web']])
        after=collector.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,previous=before.private,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
        proof=tasks.compare_task_snapshots(before,after);proof['retainedHistoricalObservationsExact']=True;proof['scope']='all-original-business-task-graph-and-current-pair-observations-plus-separate-exact-retained-history';self.tx.save('task-preservation.json',proof);require(proof['preservationVerified'],'TASK_PRESERVATION_FAILED')
        self.guard.check('final');self.tx.save('capacity-final.json',self.memory())
        for r in self.old.values():
            row=self.tx.inspect(r['Id']);require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name']=='no','OLD_SLOT_RUNNING')
        self.phase('COMPLETE',completedAt=base.now(),new={k:public_identity(self.tx.inspect(v['Id'])) for k,v in self.new.items()},old={k:public_identity(self.tx.inspect(v['Id'])) for k,v in self.old.items()},independentCollaboration=False,legacyHistoricalUncertaintyRetained=True)
        self.tx.save('FINAL_STATUS.json',self.record)

    def rollback(self):
        # Before new ingress, restore the exact still-compatible old program;
        # the old program never advertised or applied dedicated-site semantics.
        if not self.switched and sha(self.tx.run(['nginx','-T']))==self.c['nginxSha256']:
            for r in self.new.values():
                current=self.tx.inspect(r['Id'])
                if current['State']['Running']:self.tx.run(['docker','stop','--time','60',r['Id']],timeout=75)
            for role in ['web','worker']:
                row=self.tx.inspect(self.old[role]['Id'])
                if not row['State']['Running']:self.tx.run(['docker','start',row['Id']])
                self.old[role]=self.tx.inspect(row['Id'])
            self.wait(lambda:self.request(self.old['web'],'/api/health',auth=False).get('db',{}).get('ok'),'RESTORED_OLD_READY')
            controls.control_app(self.tx,public_identity(self.old['web']),'resume',str(uuid.uuid4()))
            self.wait(lambda:self.worker(self.old['worker'],'status'),'RESTORED_WORKER_READY');self.worker(self.old['worker'],'resume')
            self.phase('ROLLED_BACK',gatewaySwitched=False,databaseRestored=False,tasksReplayed=False)
        else:self.phase('CLEANUP_PENDING',gatewaySwitched=self.switched,oldProgramCutbackAllowed=False)

def main(config):
    import fcntl
    c=json.loads(pathlib.Path(config).read_bytes());validate(c)
    with HostTransaction(c['target'],shared.HOSTS[c['target']],c['evidenceRoot']) as tx:
        with open(shared.CANON.parent/'.lifecycle.lock','a+') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);r=resume_final(tx,c) if c.get('resumeFinal') else resume_prepared(tx,c) if c.get('resumePrepared') else Release(tx,c)
            try:
                if not c.get('resumeFinal'):r.prepare();r.replace()
                r.finish()
            except BaseException:
                if r.record['releaseId'] in r.state.get('siteControlReleases',{}):r.rollback()
                raise

def resume_prepared(tx,c):
    """Continue the one verified pre-stop preparation failure; no repeated backup."""
    root=tx.folder;raw=shared.CANON.read_bytes();state=json.loads(raw)
    require(sha(raw)==c['canonicalSha256'] and state['revision']==c['canonicalRevision'],'RESUME_CANONICAL_CHANGED')
    original=json.loads((root/'release-config.private.json').read_bytes())
    ignore={'resumePrepared','canonicalSha256','canonicalRevision','date','toolsCommit'}
    require({k:v for k,v in c.items() if k not in ignore}=={k:v for k,v in original.items() if k not in ignore},'PREPARED_SCOPE_CHANGED')
    record=state['siteControlReleases'][c['releaseId']]
    require(record['phase']=='ROLLED_BACK' and record.get('gatewaySwitched') is False and set(record['operations'])=={'database-backup'} and record['operations']['database-backup']['phase']=='ACKNOWLEDGED','EXACT_PRE_STOP_RESUME_REQUIRED')
    r=Release.__new__(Release);r.tx=tx;r.c=c;r.root=root;r.state=state;r.record=record;r.disk=sha(raw);r.initial=raw;r.extra=[];r.new={}
    r.rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]));r.byname={v['Name'].lstrip('/'):v for v in r.rows};r.old={k:r.byname[n] for k,n in c['oldNames'].items()}
    require(sorted(v['Id'] for v in r.rows if v['State']['Running'])==sorted(c['runningIds']),'RUNNING_BASELINE_CHANGED')
    for k,v in r.old.items():require(public_identity(v)==c['oldPins'][k],'ORIGINAL_SLOT_CHANGED')
    require(sha(tx.run(['nginx','-T']))==c['nginxSha256'],'ORIGINAL_GATEWAY_CHANGED')
    r.db=r.byname['naumi-staging-db-1'];r.de=environment(r.db);r.configuration=json.loads((root/'configuration-before.json').read_bytes());r.cookie=(root/'cookie.private').read_text()
    r.dump=(root/'nginx-before.private.txt').read_text();r.before={p:base64.b64decode(v) for p,v in json.loads((root/'nginx-files-before.private.json').read_bytes()).items()};r.real={p:str(pathlib.Path(p).resolve()) for p in r.before}
    snapshots=list(root.glob('task-snapshot-*.json'));require(len(snapshots)==1,'ORIGINAL_TASK_SNAPSHOT_REQUIRED');r.task_before=tasks.Snapshot(public={},private=json.loads(snapshots[0].read_bytes()))
    backup=json.loads((root/'backup-readable.json').read_bytes());require(file_sha(backup['path'])==backup['sha256'],'ORIGINAL_BACKUP_CHANGED')
    r.previousRecovery=copy.deepcopy(state['runtimeRecovery']);r.previousManifest=json.loads((root/'supervisor-before.private.json').read_bytes())
    r.switched=r.old_stopped=r.worker_paused=r.app_drained=False
    r.op('prepared-baseline-reconciled',lambda _:{'originalBackupReused':True,'oldProgramUnchanged':True,'taskSnapshotReused':True,'historicalGuard':'same SQL history scope as actual predecessor; no original CASE05 artifact exists on this host','previousFailureRetained':True})
    return r

def resume_final(tx,c):
    """Reconcile the exact already-published pair; never repeat stop/start."""
    root=tx.folder;raw=shared.CANON.read_bytes();state=json.loads(raw)
    require(sha(raw)==c['canonicalSha256'] and state['revision']==c['canonicalRevision'],'FINAL_CANONICAL_CHANGED')
    original=json.loads((root/'release-config.private.json').read_bytes())
    ignore={'resumePrepared','resumeFinal','canonicalSha256','canonicalRevision','date','toolsCommit','storageProbeSha256'}
    require({k:v for k,v in c.items() if k not in ignore}=={k:v for k,v in original.items() if k not in ignore},'PUBLISHED_SCOPE_CHANGED')
    record=state['siteControlReleases'][c['releaseId']];ops=record['operations']
    require(record['phase']=='CLEANUP_PENDING' and record.get('gatewaySwitched') is True and all(v['phase']=='ACKNOWLEDGED' for v in ops.values()) and ops.get('gateway-switch',{}).get('receipt',{}).get('afterDumpSha256')==sha(tx.run(['nginx','-T'])),'ACKNOWLEDGED_PUBLISHED_PAIR_REQUIRED')
    r=Release.__new__(Release);r.tx=tx;r.c=c;r.root=root;r.state=state;r.record=record;r.disk=sha(raw);r.initial=raw;r.extra=[]
    r.rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]));r.byname={v['Name'].lstrip('/'):v for v in r.rows};r.old={k:r.byname[n] for k,n in c['oldNames'].items()};r.new={k:r.byname[n] for k,n in c['newNames'].items()}
    for k,v in r.old.items():require(not v['State']['Running'] and v['Id']==c['oldPins'][k]['id'] and v['HostConfig']['RestartPolicy']['Name']=='no','OLD_INSTANCE_NOT_RETIRED')
    for k,v in r.new.items():
        require(v['State']['Running'] and v['Image']==c['image'] and v['Id']==ops['web-create-stopped' if k=='web' else 'worker-create']['receipt']['id'] and environment(v)['SOURCE_COMMIT']==c['commit'],'PUBLISHED_INSTANCE_CHANGED')
    expected=set(c['runningIds'])-{v['Id'] for v in r.old.values()}|{v['Id'] for v in r.new.values()}
    connector=ops.get('start-central-connector',{})
    if connector.get('phase')=='ACKNOWLEDGED':
        receipt=connector['receipt'];row=next((v for v in r.rows if v['Id']==receipt['id']),None)
        require(row is not None and public_identity(row)==receipt and row['Image']==c['runtimeImage'],'PUBLISHED_CONNECTOR_CHANGED')
        expected.add(row['Id']);r.extra.append(row)
    require({v['Id'] for v in r.rows if v['State']['Running']}==expected,'UNREVIEWED_RUNNING_INSTANCE')
    r.db=r.byname['naumi-staging-db-1'];r.de=environment(r.db);r.configuration=json.loads((root/'configuration-before.json').read_bytes());r.cookie=(root/'acceptance-cookie.private').read_text()
    snapshots=list(root.glob('task-snapshot-*.json'));require(len(snapshots)==1,'ORIGINAL_TASK_SNAPSHOT_REQUIRED');r.task_before=tasks.Snapshot(public={},private=json.loads(snapshots[0].read_bytes()))
    r.previousRecovery=copy.deepcopy(state['runtimeRecovery']);r.previousManifest=json.loads((root/'supervisor-before.private.json').read_bytes());r.switched=r.old_stopped=True;r.worker_paused=r.app_drained=False
    r.guard=HistoricalEvidence(r);r.guard.before=json.loads((root/'retained-history-before.json').read_bytes());r.guard.sequence=len(list(root.glob('retained-history-[0-9]*.json')))
    r.op('published-pair-reconciled',lambda _:{'sameWebWorker':True,'noRestart':True,'noBackupRepeat':True,'acceptanceMode':'preserved deferred NAS queue; original immediate-storage assumption corrected','previousFailureRetained':True})
    r.phase('PUBLIC_ACCEPTANCE');return r
