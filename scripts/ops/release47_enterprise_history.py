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
        if not self.c.get('resumeFinal'):
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

def resume_final(tx,c):
    """Finish a verified published pair after browser acceptance timeout."""
    root=tx.folder;raw=shared.CANON.read_bytes();state=json.loads(raw)
    require(sha(raw)==c['canonicalSha256'] and state['revision']==c['canonicalRevision'],'FINAL_CANONICAL_CHANGED')
    original=json.loads((root/'release-config.private.json').read_bytes())
    ignore={'resumeFinal','canonicalSha256','canonicalRevision','toolsCommit'}
    require({k:v for k,v in c.items() if k not in ignore}=={k:v for k,v in original.items() if k not in ignore},'PUBLISHED_SCOPE_CHANGED')
    record=state['siteControlReleases'][c['releaseId']];ops=record['operations']
    require(record['phase']=='CLEANUP_PENDING' and record.get('gatewaySwitched') is True and all(v['phase']=='ACKNOWLEDGED' or k=='refresh-gateway-recovery' and v['phase']=='UNKNOWN' for k,v in ops.items()),'PUBLISHED_ACKNOWLEDGED_PAIR_REQUIRED')
    require(ops.get('canonicalize-public-redirects',ops['gateway-switch'])['receipt']['afterDumpSha256']==sha(tx.run(['nginx','-T'])),'PUBLISHED_GATEWAY_CHANGED')
    require('bind-current-recovery' in ops and json.loads((root/'storage-acceptance.json').read_bytes()).get('passed') is True,'PRIOR_ACCEPTANCE_REQUIRED')
    r=Release.__new__(Release);r.tx=tx;r.c=c;r.root=root;r.state=state;r.record=record;r.disk=sha(raw);r.initial=raw;r.extra=[]
    r.rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]));r.byname={v['Name'].lstrip('/'):v for v in r.rows}
    r.old={k:r.byname[n] for k,n in c['oldNames'].items()};r.new={k:r.byname[n] for k,n in c['newNames'].items()}
    for k,v in r.old.items():require(not v['State']['Running'] and v['Id']==c['oldPins'][k]['id'] and v['HostConfig']['RestartPolicy']['Name']=='no','OLD_INSTANCE_NOT_RETIRED')
    for k,v in r.new.items():require(v['State']['Running'] and v['Image']==c['image'] and v['Id']==ops[k+'-create']['receipt']['id'] and environment(v)['SOURCE_COMMIT']==c['commit'],'PUBLISHED_INSTANCE_CHANGED')
    require({v['Id'] for v in r.rows if v['State']['Running']}==set(c['runningIds'])-{v['Id'] for v in r.old.values()}|{v['Id'] for v in r.new.values()},'UNREVIEWED_RUNNING_INSTANCE')
    r.db=r.byname['naumi-staging-db-1'];r.de=environment(r.db);r.configuration=json.loads((root/'configuration-before.json').read_bytes());r.cookies=json.loads((root/'acceptance-identities.private.json').read_bytes());r.cookie=r.cookies['owner']
    r.task_before=prior.original_task_snapshot(root);r.collector=prior.current_activity_collector([c['oldNames']['web'],c['newNames']['web']]);r.switched=r.old_stopped=True;r.worker_paused=r.app_drained=False
    r.guard=prior.HistoricalEvidence(r);r.guard.before=json.loads((root/'retained-history-before.json').read_bytes());r.guard.sequence=len(list(root.glob('retained-history-[0-9]*.json')))
    if 'published-pair-reconciled' not in ops:r.op('published-pair-reconciled',lambda _:{'sameWebWorker':True,'backupRepeated':False,'previousFailureRetained':True})
    if ops.get('refresh-gateway-recovery',{}).get('phase')=='UNKNOWN':
        p=root/'supervisor-manifest.private.json';m=json.loads(p.read_bytes())
        require(state['runtimeRecovery']['manifestPath']==str(p) and sha(prior.recovery.encoded(m))==state['runtimeRecovery']['manifestSha256']==ops['bind-current-recovery']['receipt']['manifestSha256'] and not (root/'supervisor-manifest-redirect.private.json').exists(),'RECOVERY_PREIMAGE_REQUIRED')
        unit=pathlib.Path('/etc/systemd/system/naumi47-recovery.service').read_text();require('--manifest '+str(p) in unit,'RECOVERY_UNIT_PREIMAGE_REQUIRED')
        tx.save('recovery-refresh-preimage.json',{'originalManifestUnchanged':True,'canonicalBindingUnchanged':True,'unitUnchanged':True,'replacementNotCreated':True,'failedExclusiveWrite':True})
        ops['refresh-gateway-recovery'].update(phase='REJECTED_PRECONDITION',reconciledAt=base.now(),reason='Immutable evidence destination already exists; original binding observed unchanged');r.persist()
    return r

def canonicalize_redirects(r):
    """Normalize only this app's internal-port Location headers at its gateway."""
    if 'canonicalize-public-redirects' in r.record['operations']:
        refresh_redirect_recovery(r);r.phase('PUBLIC_ACCEPTANCE');return
    compat=shared.compat;r.dump=r.tx.run(['nginx','-T']).decode();parsed=compat.Dump(r.dump)
    r.before={p:pathlib.Path(p).read_bytes() for p in parsed.files};r.real={p:str(pathlib.Path(p).resolve()) for p in r.before};edits={}
    directive='\n    proxy_redirect https://$host:3000/ https://$http_host/;\n    proxy_redirect http://$host:3000/ $scheme://$http_host/;\n'
    for name,nodes in parsed.nodes.items():
        for node in compat.walk(nodes):
            if node.name!='location' or not any(n.name=='proxy_pass' and n.args==['http://127.0.0.1:'+str(r.c['newPort'])] for n in node.children or []):continue
            require(not any(n.name=='proxy_redirect' for n in node.children),'EXISTING_REDIRECT_RULE_REVIEW_REQUIRED')
            at=node.closing;require(type(at) is int,'LOCATION_CLOSING_REQUIRED');edits.setdefault(name,[]).append((at,at,directive))
    require(edits,'NO_APP_GATEWAY_LOCATION');r.afterdump,r.after=shared.render_file_edits(r.dump,r.before,edits)
    shared.syntax_check(r.tx,r.after,r.root/'isolated-redirect-check')
    r.op('canonicalize-public-redirects',lambda _:r.gateway())
    refresh_redirect_recovery(r);r.phase('PUBLIC_ACCEPTANCE')

def refresh_redirect_recovery(r):
    def bind(_):
        recovery=prior.recovery;p=pathlib.Path(r.state['runtimeRecovery']['manifestPath']);m=json.loads(p.read_bytes());new=r.root/'supervisor-manifest-redirect.private.json'
        require(sha(recovery.encoded(m))==r.state['runtimeRecovery']['manifestSha256'],'RECOVERY_MANIFEST_CHANGED')
        m['gatewayDumpSha256']=sha(r.tx.run(['nginx','-T']));r.tx.save(new.name,m);r.state['runtimeRecovery'].update(manifestPath=str(new),manifestSha256=sha(recovery.encoded(m)));r.persist();recovery.recovery_binding(r.state,m)
        unit=pathlib.Path('/etc/systemd/system/naumi47-recovery.service');before=unit.read_text();require(before.count('--manifest '+str(p))==1,'RECOVERY_UNIT_BINDING_CHANGED');unit.write_text(before.replace('--manifest '+str(p),'--manifest '+str(new)));r.tx.run(['systemctl','daemon-reload'])
        result=recovery.Supervisor(m,pathlib.Path(m['journalDir']),recovery.Adapter(r.tx,m)).once();r.tx.save('redirect-recovery-acceptance.json',result)
        return {'manifestSha256':sha(recovery.encoded(m)),'sameInstances':True,'gatewayOnly':True}
    r.op('refresh-gateway-recovery-final' if 'refresh-gateway-recovery' in r.record['operations'] else 'refresh-gateway-recovery',bind)

def main(config):
    import fcntl
    c=json.loads(pathlib.Path(config).read_bytes());validate(c)
    with HostTransaction(c['target'],shared.HOSTS[c['target']],c['evidenceRoot']) as tx:
        with open(shared.CANON.parent/'.lifecycle.lock','a+') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            r=resume_final(tx,c) if c.get('resumeFinal') else Release(tx,c)
            try:
                if c.get('resumeFinal'):canonicalize_redirects(r)
                else:r.prepare();r.candidates();r.acceptance();r.assets();r.switch()
                r.finish()
            except BaseException:r.rollback();raise

if __name__=='__main__':
    import sys
    main(sys.argv[1])
