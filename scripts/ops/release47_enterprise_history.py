"""Blue/green successor for the already dedicated 47 site; no site bootstrap."""
import base64,datetime as dt,hashlib,hmac,json,pathlib,re,time,uuid
import release_site_control as shared
import release47_site_single as prior
import release103_refactor as base
import release47_controls as controls
import release47_task_snapshot as tasks
from release47_host import HostTransaction,require,public_identity,environment,sha,file_sha

AUTHORIZATION='弄好后若需要上线则直接上线'

def validate(c):
    require(c['target']=='47.105.59.142' and c['authorization']==AUTHORIZATION,'EXPLICIT_HISTORY_RELEASE_REQUIRED')
    require(re.fullmatch('release47-site-control-history-[a-z0-9-]+',c['releaseId']),'EXACT_HISTORY_RELEASE_REQUIRED')
    require(c['evidenceRoot']=='/opt/naumi-staging/evidence/'+c['releaseId'],'EVIDENCE_PATH_REQUIRED')
    require(c['webEnvironment']=={} and c['workspaceModules']==[],'NO_CONFIGURATION_OR_COLLABORATION_CHANGE')
    require(c['webMemoryMiB']==2560 and c['workerMemoryMiB']==1024,'SAME_RESOURCE_LIMITS_REQUIRED')
    require(c['restoreDatabase'] is False and c['replayAcceptedTasks'] is False,'NO_RESTORE_OR_REPLAY')
    require(re.fullmatch('[a-f0-9]{40}',c['commit']) and re.fullmatch('sha256:[a-f0-9]{64}',c['image']),'FIXED_MAIN_IMAGE_REQUIRED')
    require(c['date']==dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'FRESH_REVIEW_REQUIRED')
    require(set(c['oldNames'])==set(c['newNames'])=={'web','worker'} and len(set([*c['oldNames'].values(),*c['newNames'].values()]))==4,'UNIQUE_PAIR_REQUIRED')
    require(13000<=c['newPort']<=13999 and c['newPort']!=c['oldPort'],'PRIVATE_NEW_PORT_REQUIRED')

class Release(shared.Release):
    def memory(self):
        used=0
        for row in self.new.values():
            row=self.tx.inspect(row['Id'])
            if row['State']['Running']:
                rel=pathlib.Path('/proc/'+str(row['State']['Pid'])+'/cgroup').read_text().split('0::',1)[1].strip()
                used+=int((pathlib.Path('/sys/fs/cgroup')/rel.lstrip('/')/'memory.current').read_text())//1024**2
        free=base.available();remaining=max(0,2560+1024-used)
        require(free>=remaining+1024,'DUAL_SLOT_MEMORY_INSUFFICIENT')
        return {'availableMiB':free,'remainingPeakMiB':remaining,'reserveMiB':1024,'additionalServices':0,'swapIncluded':False}

    def drain(self,group=None):
        result=super().drain(group)
        media=self.worker((group or self.old)['worker'],'status').get('mediaWorker',{})
        require(media.get('running')==media.get('queued')==0,'COMBINED_MEDIA_NOT_DRAINED')
        return result

    def prepare(self):
        env=environment(self.old['web'])
        require(env.get('NAUMI_ENTERPRISE_DEPLOYMENT_MODE')=='dedicated' and env.get('NAUMI_ENTERPRISE_ALLOWED_IDS')==prior.ENTERPRISE,'DEDICATED_PREDECESSOR_REQUIRED')
        self.guard=prior.HistoricalEvidence(self);self.guard.establish()
        self.collector=prior.current_activity_collector([self.c['oldNames']['web'],self.c['newNames']['web']])
        original=base.tasks
        try:
            base.tasks=self.collector;super().prepare()
        finally:base.tasks=original
        self.cookies={}
        for name,email in [('owner',self.sql("SELECT json_build_object('email',owner_email) FROM app_account_teams WHERE id='"+prior.ENTERPRISE+"';")[0]['email']),('admin','admin@admin.com')]:
            eb=base64.urlsafe_b64encode(email.encode()).decode().rstrip('=')
            # Native verification computes issuedAt from its fixed 30-day TTL.
            exp=str(int(time.time()*1000)+30*86400000)
            self.cookies[name]='nv_user='+eb+'.'+exp+'.'+hmac.new(env['SETTINGS_SECRET'].encode(),('user:'+eb+'.'+exp).encode(),hashlib.sha256).hexdigest()
        self.cookie=self.cookies['owner'];self.tx.save('acceptance-cookie.private',self.cookie.encode())
        self.tx.save('acceptance-identities.private.json',self.cookies)
        self.record.update(releaseMode='BLUE_GREEN',independentCollaboration=False);self.persist()

    def acceptance(self,storage=False):
        prior.Release.acceptance(self,storage=storage)
        rows=[]
        for name,cookie in self.cookies.items():
            self.cookie=cookie
            snap=self.request(self.new['web'],'/api/enterprise?enterpriseId='+prior.ENTERPRISE)
            require(snap['actor']['owner'] is True,'SITE_ADMIN_REQUIRED')
            history=self.request(self.new['web'],'/api/enterprise/creations?tenantId='+prior.ENTERPRISE+'&source=legacy&period=all')
            require(history['pagination']['total']>0 and history['items'],'REAL_HISTORY_REQUIRED')
            self.request(self.new['web'],'/api/enterprise/creations?tenantId='+prior.ENTERPRISE+'&source=legacy&period=all&status=failed')
            health=self.request(self.new['web'],'/api/enterprise/health?enterpriseId='+prior.ENTERPRISE)
            require(health['database']=='available','HEALTH_READ_REQUIRED')
            rows.append({'identity':name,'historyTotal':history['pagination']['total'],'owner':True,'health':health})
        self.cookie=self.cookies['owner'];self.tx.save('history-admin-acceptance-'+str(self.state['revision'])+'.json',rows)

    def switch(self):
        self.wait(lambda:self.marker('browser-before.json'),'CANDIDATE_BROWSER',600)
        self.op('pause-old-worker',lambda _:self.worker(self.old['worker'],'drain'));self.worker_paused=True
        self.wait(lambda:(lambda s:s['paused'] and s['activeTicks']==s['unresolvedTicks']==0 and s.get('backgroundTasks',0)==0)(self.worker(self.old['worker'],'status')),'OLD_WORKER_QUIESCENT',120)
        self.op('open-new-web',lambda _:controls.control_app(self.tx,public_identity(self.new['web']),'resume',str(uuid.uuid4())))
        self.op('gateway-switch',lambda _:self.gateway());self.switched=True;self.phase('SWITCHED')
        self.op('drain-old-web',lambda _:controls.control_app(self.tx,public_identity(self.old['web']),'drain',str(uuid.uuid4())));self.app_drained=True
        self.tx.save('old-drain.json',self.wait(self.drain,'OLD_EXECUTION',180))
        for role in ['worker','web']:
            def stop(_,role=role):
                row=self.old[role];self.tx.pin(public_identity(row));self.tx.run(['docker','update','--restart=no',row['Id']]);self.tx.run(['docker','stop','--time','60',row['Id']],timeout=75)
                row=self.tx.inspect(row['Id']);require(not row['State']['Running'] and row['State']['ExitCode'] in [0,143] and not row['State']['OOMKilled'],'OLD_SLOT_STOP_REQUIRED');return public_identity(row)
            self.op('retire-'+role,stop)
        self.old_stopped=True
        self.op('cold-media-receipt-handoff',lambda _:self.handoff_media())
        self.op('resume-new-worker',lambda _:self.worker(self.new['worker'],'resume'))
        self.phase('PUBLIC_ACCEPTANCE')

    def finish(self):
        self.wait(lambda:(self.worker(self.new['worker'],'status').get('lastTick') or {}).get('phase')=='complete','NEW_WORKER_RECEIPT',120)
        self.acceptance(storage=True);self.guard.check('after-public')
        self.op('bind-current-recovery',lambda op:prior.Release.bind_recovery(self,op))
        self.wait(lambda:self.marker('browser-after.json'),'PUBLIC_BROWSER',600)
        self.op('proof-worker-barrier',lambda _:self.worker(self.new['worker'],'drain'))
        try:
            self.wait(lambda:(lambda s:s['paused'] and s['activeTicks']==s['unresolvedTicks']==0)(self.worker(self.new['worker'],'status')),'PROOF_BARRIER',120)
            after=self.collector.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,previous=self.task_before.private,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
            proof=tasks.compare_task_snapshots(self.task_before.private,after.private);self.tx.save('task-preservation.json',proof);require(proof['preservationVerified'],'TASK_PRESERVATION_FAILED')
        finally:self.op('proof-worker-resume',lambda _:self.worker(self.new['worker'],'resume'))
        self.guard.check('final');self.tx.save('capacity-final.json',self.memory())
        for row in self.old.values():
            actual=self.tx.inspect(row['Id']);require(not actual['State']['Running'] and actual['HostConfig']['RestartPolicy']['Name']=='no','OLD_SLOT_RUNNING')
        self.phase('COMPLETE',completedAt=base.now(),new={k:public_identity(self.tx.inspect(v['Id'])) for k,v in self.new.items()},old={k:public_identity(self.tx.inspect(v['Id'])) for k,v in self.old.items()},legacyHistoricalUncertaintyRetained=True)
        self.tx.save('FINAL_STATUS.json',self.record)

    def rollback(self):
        if self.switched:
            # Keep accepted work recoverable; never roll back data or repeat calls.
            if 'worker' in self.new:
                row=self.tx.inspect(self.new['worker']['Id'])
                if not row['State']['Running']:self.tx.run(['docker','start',row['Id']])
                self.wait(lambda:self.worker(self.new['worker'],'status'),'KEEP_ACCEPTING_WORKER',90)
                self.worker(self.new['worker'],'resume')
            self.phase('CLEANUP_PENDING',gatewaySwitched=True,databaseRestored=False,tasksReplayed=False)
        else:super().rollback()

def main(config):
    import fcntl
    c=json.loads(pathlib.Path(config).read_bytes());validate(c)
    with HostTransaction(c['target'],shared.HOSTS[c['target']],c['evidenceRoot']) as tx:
        with open(shared.CANON.parent/'.lifecycle.lock','a+') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            r=Release(tx,c)
            try:r.prepare();r.candidates();r.acceptance();r.assets();r.switch();r.finish()
            except BaseException:r.rollback();raise

if __name__=='__main__':
    import sys
    main(sys.argv[1])
