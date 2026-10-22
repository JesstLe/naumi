"""Reviewed normal successor operator. New release journal, fresh pins, full three-lock transaction.

Shared transaction/control implementations are retained; the consumed 20261018
controller is not invoked. Historical successor and unresolved events are immutable.
"""
import contextlib,copy,datetime as dt,hashlib,json,os,pathlib,secrets,subprocess,sys,time,uuid
from types import SimpleNamespace
from release47_host import HostTransaction,Hold,require,sha,file_sha,environment,public_identity
import release47_controls as c
import release47_authorized_successor as policy
import release47_normal_policy as normal
import release47_task_snapshot as tasks
import release47_recovery_supervisor as recovery
import release_client_compat as compat
import worker_handoff

ROOT=None
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
HOST='eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
OLDWEB=OLDWORKER=WEB=WORKER=RELEASE=STATE=COOKIE=None

def configure(cfg):
 global ROOT,OLDWEB,OLDWORKER,WEB,WORKER,RELEASE,STATE,COOKIE
 import re
 require(cfg['target']=='47.105.59.142' and re.fullmatch(r'release47-[a-z0-9-]{6,80}',cfg['releaseId']),'FIXED_NORMAL_TARGET_REQUIRED')
 ROOT=pathlib.Path(cfg['evidenceRoot']);require(ROOT.is_absolute() and ROOT.parent==pathlib.Path('/opt/naumi-staging/evidence'),'PRIVATE_EVIDENCE_ROOT_REQUIRED')
 OLDWEB=cfg['oldWeb']['name'];OLDWORKER=cfg['oldWorker']['name'];WEB=cfg['newWebName'];WORKER=cfg['newWorkerName'];RELEASE=cfg['releaseId'];STATE=cfg['stateDir'];COOKIE=pathlib.Path(cfg['cookiePath'])
 require(all(re.fullmatch(r'naumi47-[A-Za-z0-9_.-]{1,80}',n) for n in [OLDWEB,OLDWORKER,WEB,WORKER]) and len({OLDWEB,OLDWORKER,WEB,WORKER})==4,'EXPLICIT_DISTINCT_SLOT_NAMES_REQUIRED')
 require(13000<=cfg['oldPort']<=13999 and 13000<=cfg['newPort']<=13999 and cfg['oldPort']!=cfg['newPort'],'DISTINCT_LOOPBACK_PORTS_REQUIRED')
 require(pathlib.Path(STATE).parent==pathlib.Path('/opt/naumi-staging/releases') and COOKIE.is_absolute(),'REVIEWED_STATE_AND_AUTH_PATHS_REQUIRED')
 require(type(cfg.get('webMemoryMiB',2048)) is int and 1536<=cfg.get('webMemoryMiB',2048)<=2048,'REVIEWED_WEB_MEMORY_REQUIRED')
 require(cfg.get('workerMemoryMiB',128)==(1024 if cfg.get('reviewedCombinedMedia') is True else 128),'REVIEWED_WORKER_MEMORY_REQUIRED')
 require(bool(cfg.get('combinedMedia'))==(cfg.get('reviewedCombinedMedia') is True),'REVIEWED_COMBINED_MEDIA_REQUIRED')

def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def enc(v):return recovery.encoded(v)
def save(p,v):c._atomic_private(p,v)

@contextlib.contextmanager
def transaction():
 for attempt in range(30):
  tx=HostTransaction(policy.TARGET,HOST,ROOT/'transaction')
  try:tx.__enter__();break
  except BlockingIOError:
   if attempt==29:raise
   time.sleep(1)
 try:yield tx
 finally:tx.__exit__(None,None,None)

class Controller:
 saas_controlled_recovery=False
 def __init__(self,tx,config):
  require(not (config.get('releaseId','').startswith('release47-saas-') or
          config.get('recoveryMode')=='saas-controlled-maintenance') or self.saas_controlled_recovery,
          'SAAS_RECOVERY_CONTROLLER_REQUIRED')
  self.tx=tx;self.cfg=config;self.original=CANON.read_bytes();self.state=json.loads(self.original)
  self.disk=sha(self.original);self.web=public_identity(tx.inspect(OLDWEB));self.worker=public_identity(tx.inspect(OLDWORKER));self.db=public_identity(tx.inspect('naumi-staging-db-1'))
  self.de=environment(tx.inspect(self.db['id']));self.backup=ROOT/'transaction';self.runtime=dict(self.state['runtimeRecovery'])
  self.original_manifest=json.loads(pathlib.Path(self.runtime['manifestPath']).read_bytes())
  self.old_adapter=recovery.Adapter(tx,self.original_manifest);self.cookie=COOKIE.read_text().strip()
  self.switched=False;self.worker_paused=False;self.old_drained=False
  self.historical_successor=copy.deepcopy(self.state.get('blueGreenSuccessor'))
  require(self.web==config['oldWeb'] and self.worker==config['oldWorker'],'RUNTIME_CONTAINER_BASELINE_CHANGED')
  self.infra=[public_identity(tx.inspect(n)) for n in ['naumi-staging-db-1','naumi-new-api-redis','naumi-new-api-postgres','naumi-new-api-app','reverse-hub-new-server']]

 def sql(self,query):
  raw=self.tx.run(['docker','exec','-i',self.db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=("BEGIN READ ONLY; SET LOCAL statement_timeout='5s';"+query+'COMMIT;').encode(),timeout=30)
  return [json.loads(v) for v in raw.splitlines() if v.startswith(b'{')]

 def incidents(self):
  rows=self.sql("SELECT json_build_object('kind','activities','rows',COALESCE(json_agg(row_to_json(t)),'[]')) FROM (SELECT id,instance_id,boot_id,activity_kind,state,work_scope,work_key,claim_token,outcome FROM app_release_activities WHERE state<>'finished' AND instance_id='naumi47-unified-main7bd-20261016' ORDER BY id)t;SELECT json_build_object('kind','held','rows',json_agg(row_to_json(t))) FROM (SELECT j.id,j.snapshot->>'status' AS status,j.snapshot->'paidOperations'->j.id->>'state' AS paid_state,j.billing_settled,jsonb_array_length(COALESCE(j.snapshot->'images','[]'::jsonb)) AS images_count,COALESCE(j.lease_until>now(),false) AS live_lease,b.state AS billing_state,(SELECT count(*)::int FROM app_ledger WHERE id='led-image-job-d2c9a9c0-533a-40ef-bd11-135048f8946d') AS ledger_count,encode(sha256(convert_to(to_jsonb(j)::text,'UTF8')),'hex') AS job_sha256,encode(sha256(convert_to(to_jsonb(b)::text,'UTF8')),'hex') AS billing_sha256 FROM app_image_jobs j JOIN app_billing_operations b ON b.id=j.id WHERE j.id='"+policy.PAID_JOB+"')t;")
  require(len(rows)==2 and len(rows[1]['rows'])==1,'INCIDENT_READ_INCOMPLETE')
  return rows[0]['rows'],rows[1]['rows'][0]

 def owners(self):return self.sql("SELECT json_build_object('rows',COALESCE(json_agg(row_to_json(t)),'[]')) FROM (SELECT state,kind,instance_id,boot_id FROM app_release_session_owners WHERE instance_id='"+OLDWEB+"')t;")[0]['rows']

 def check_running_slots(self,extra=()):
  running=set(self.tx.run(['docker','ps','-q','--no-trunc']).decode().splitlines())
  required={self.web['id'],self.worker['id'],*[r['id'] for r in self.infra]}|set(extra)
  permitted=set()
  for pin in self.cfg.get('reviewedNasSidecars',[]):
   row=self.tx.inspect(pin['id'])
   require(all(public_identity(row).get(k)==pin.get(k) for k in ['id','name','image','startedAt']), 'NAS_SIDECAR_IDENTITY_CHANGED')
   require(row['Config']['Cmd']==pin['command'] and row['Config']['Cmd'][0]=='node' and
           row['Config']['Cmd'][1] in ['/work/migrate-media47.cjs','/verify.cjs'] and
           not any(row['HostConfig'].get('PortBindings',{}).values()),'NAS_SIDECAR_NOT_A_REVIEWED_DATA_RUNNER')
   require(all(not m['RW'] for m in row['Mounts'] if m['Destination'] in ['/media','/creds.json','/lifecycle','/migration']),
           'NAS_SIDECAR_SOURCE_NOT_READ_ONLY')
   if row['State']['Running']:permitted.add(row['Id'])
  require(required.issubset(running) and running.issubset(required|permitted),'UNREGISTERED_RUNNING_CANDIDATE')

 def persist(self):
  require(sha(CANON.read_bytes())==self.disk,'CANONICAL_CAS_CHANGED')
  require(self.state.get('blueGreenSuccessor')==self.historical_successor and self.state.get('legacyDrainProven') is False,'HISTORICAL_SUCCESSOR_MUST_REMAIN_UNCHANGED')
  self.state['revision']+=1;save(CANON,self.state);self.disk=sha(CANON.read_bytes())

 def phase(self,name,**evidence):
  self.succ.update(phase=name,updatedAt=now(),**evidence);self.persist();print('PHASE='+name,flush=True)

 def op(self,name,fn):
  require(name not in self.succ['operations'],'EXISTING_OPERATION_RECONCILE_REQUIRED')
  op={'operationId':str(uuid.uuid4()),'phase':'INTENT_RECORDED','at':now()};self.succ['operations'][name]=op;self.persist()
  try:r=fn(op['operationId'])
  except BaseException:
   op['phase']='UNKNOWN';self.persist();raise
  op.update(phase='ACKNOWLEDGED',receipt=r);self.persist();return r

 def request(self,identity,path,body=None,auth=True):
  if path=='/api/video/worker/drain-status':
   js="const r=await fetch('http://127.0.0.1:3000/api/video/worker/drain-status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('DRAIN_HTTP_'+r.status);console.log(JSON.stringify(await r.json()));"
   return json.loads(self.tx.run(['docker','exec','-e','NODE_OPTIONS=',identity['id'],'node','--input-type=module','-e',js]))
  spec={**identity,'role':'web'}
  return self.old_adapter.request(spec,path,body=body,cookie=self.cookie if auth else None)

 def worker_control(self,identity,action,operation):
  env=environment(self.tx.inspect(identity['id']));folder=self.tx.folder/('worker-controls-'+identity['id'][:12]);folder.mkdir(mode=0o700,exist_ok=True)
  a=SimpleNamespace(container=identity['id'],expected_id=identity['id'],expected_image=identity['image'],expected_commit=env['SOURCE_COMMIT'],expected_origin=env['NAUMI_APP_ORIGIN'],action=action,operation_id=operation,tick_id=None,require_media_worker=env.get('NAUMI_MEDIA_WORKER')=='1' or self.cfg.get('reviewedCombinedMedia') is True and identity['name']==WORKER)
  return worker_handoff.execute(a,folder,lambda argv:self.tx.run(argv).decode())

 def wait(self,fn,label,seconds=60):
  error=None
  for _ in range(seconds):
   try:
    r=fn()
    if r:return r
   except (Hold,ValueError,KeyError) as ex:error=ex
   time.sleep(1)
  raise Hold('WAIT_'+label+'_'+(str(error) if isinstance(error,Hold) else 'NOT_READY'))

 def marker(self,name):
  p=ROOT/name
  if not p.exists():return None
  require(not p.is_symlink() and p.stat().st_size<100000,'BROWSER_RECEIPT_INVALID');v=json.loads(p.read_bytes())
  require(v.get('releaseId')==RELEASE and v.get('passed') is True,'BROWSER_RECEIPT_FAILED')
  return v

 def build_gateway(self):
  self.dump=self.tx.run(['nginx','-T']).decode();self.parsed=compat.Dump(self.dump)
  self.before={name:pathlib.Path(name).read_bytes() for name in self.parsed.files};self.real={name:str(pathlib.Path(name).resolve()) for name in self.before}
  aliases=compat.alias_inventory(self.parsed);roots=set()
  for nodes in self.parsed.nodes.values():
   for node in compat.walk(nodes):
    if node.name=='location' and node.args==['^~','/_next/static/']:
     for child in node.children:
      if child.name=='alias':roots.add(child.args[0])
  require(len(roots)==1,'ONE_EXISTING_STATIC_UNION_REQUIRED');oldroot=pathlib.Path(next(iter(roots)))
  extracted=ROOT/'candidate-static';extracted.mkdir(mode=0o700,exist_ok=True)
  self.tx.run(['docker','cp',self.newweb['id']+':/app/.next/static/.',str(extracted)],timeout=90)
  manifest=compat.collect_assets([('previous-union',oldroot),('candidate',extracted)],[(a['url'],a['path']) for a in aliases])
  union=pathlib.Path('/var/www/naumi-assets-compat')/ROOT.name;compat.verify_assets(manifest,union) if union.exists() else compat.materialize_assets(manifest,union)
  union.chmod(0o755)
  for directory in union.rglob('*'):
   if directory.is_dir():require(not directory.is_symlink(),'STATIC_SYMLINK_FORBIDDEN');directory.chmod(0o755)
  self.tx.run(['runuser','-u','www-data','--','test','-r',str(union/manifest['assets'][0]['url'].lstrip('/'))])
  edits={};old='http://127.0.0.1:'+str(self.cfg['oldPort']);new='http://127.0.0.1:'+str(self.cfg['newPort'])
  for name,nodes in self.parsed.nodes.items():
   for node in compat.walk(nodes):
    for token in node.tokens:
     if token.value==old or token.value.startswith(old+'/') or token.value.startswith(old+'$'):
      edits.setdefault(name,[]).append((token.start,token.end,compat.quote(new+token.value[len(old):])))
     if node.name=='alias' and token.value.rstrip('/')==str(oldroot):
      edits.setdefault(name,[]).append((token.start,token.end,compat.quote(str(union/'_next/static')+'/')))
  patches={}
  for name,changes in edits.items():
   s=self.parsed.files[name]
   for start,end,newvalue in sorted(changes,reverse=True):s=s[:start]+newvalue+s[end:]
   patches[name]=s
  require(patches,'NO_GATEWAY_TRANSITION')
  after=self.parsed.render(patches);self.after_dump=after;report={'configClosureValidated':True,'beforeDumpSha256':sha(self.dump.encode()),'afterDumpSha256':sha(after.encode()),'kind':'authorized-bluegreen-no-maintenance'}
  compat.write_gateway_bundle(self.dump,patches,after,report,ROOT/'gateway-forward',self.before)
  self.forward=json.loads((ROOT/'gateway-forward/report.json').read_bytes());self.after={p['path']:(ROOT/'gateway-forward'/p['after']).read_bytes() for p in self.forward['patches']}
  # The inverse uses the complete generated closure and exact original bytes.
  self.candidate_closure={**self.before,**self.after}
  inverse={'configClosureValidated':True,'baselineFileCasVerified':True,'beforeDumpSha256':report['afterDumpSha256'],'afterDumpSha256':report['beforeDumpSha256'],'patches':[{'path':n,'beforeSha256':sha(raw),'afterSha256':sha(self.before[n])} for n,raw in self.after.items()]}
  self.rollback=inverse;self.tx.save('gateway-rollback.json',inverse);self.tx.save('static-union-report.json',{'count':len(manifest['assets']),'manifestSha256':compat.file_sha(union/'manifest.json'),'oldAliasesUnchanged':compat.alias_inventory(compat.Dump(after))==aliases})
  require(compat.alias_inventory(compat.Dump(after))==aliases,'EXACT_OLD_ALIAS_CHANGED')
  for text in [self.dump,after]:
   actions=[t.value for nodes in compat.Dump(text).nodes.values() for node in compat.walk(nodes) for t in node.tokens]
   require('http://127.0.0.1:17847' in actions,'LEGACY_WORKBENCH_MISSING')
  # Real syntax check against isolated copies of the WHOLE config closure.
  # Only include directives are redirected. TLS/auth files remain unchanged.
  for label,bodies in [('candidate',self.candidate_closure),('rollback',self.before)]:
   target=ROOT/('syntax-'+label)
   for name,raw in bodies.items():
    body=raw.decode();changes=[]
    for node in compat.walk(compat.parse(body)):
     if node.name in ['pid','lock_file','error_log','access_log','client_body_temp_path','proxy_temp_path','fastcgi_temp_path','uwsgi_temp_path','scgi_temp_path'] and node.args and node.args[0] not in ['off','stderr']:
      token=node.tokens[1];changes.append((token.start,token.end,compat.quote(str(target/('isolated-'+node.name)))))
     if node.name=='http':
      at=body.index('{',node.tokens[-1].end)+1 if node.tokens[-1].value!='{' else node.tokens[-1].end
      # Defaults are isolated even if nginx.conf did not name paths explicitly.
      names=['client_body','proxy','fastcgi','uwsgi','scgi']
      if not any(x.name.endswith('_temp_path') for x in node.children):
       changes.append((at,at,'\n'+''.join(n+'_temp_path '+compat.quote(str(target/('default-'+n)))+';\n' for n in names)))
     if node.name=='include':
      for token in node.tokens[1:]:
       if token.value.startswith('/etc/nginx/'):
        changes.append((token.start,token.end,compat.quote(str(target)+token.value)))
    for start,end,value in sorted(changes,reverse=True):body=body[:start]+value+body[end:]
    p=target/name.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
   self.tx.run(['nginx','-t','-c',str(target/'etc/nginx/nginx.conf')]);self.tx.save('syntax-'+label+'-pass.json',{'at':now(),'actualNginxSyntaxPassed':True,'liveConfigWritten':False})

 def ready(self):
  v=self.request(self.newweb,'/api/version');h=self.request(self.newweb,'/api/health');s=c.app_status(self.tx,self.newweb)
  require(v=={'version':self.cfg['version'],'commit':self.cfg['commit']} and h['db']['ok'] is True and s['admission']['mode']=='draining','CANDIDATE_NOT_READY')
  require(self.request(self.newweb,'/api/auth/session').get('user'),'EXISTING_LOGIN_FAILED')
  checks={}
  for p in ['/api/projects','/api/canvas/text-nodes','/api/canvas/node-settings','/api/image-skills','/canvas','/studio3d','/desktop','/admin']:
   self.request(self.newweb,p);checks[p]=200
  # Do not invent route/adapter acceptance from HTML alone.
  self.new_adapter=recovery.Adapter(self.tx,{**self.cfg,'buildVersion':self.cfg['version']})
  self.tx.save('candidate-http-acceptance-'+str(self.state['revision'])+'.json',{'at':now(),'identity':s['identity'],'checks':checks,'health':h,'version':v,'suppliers':0})
  return {'identity':s['identity'],'checks':checks}

 def drain_proof(self):
  app=c.app_status(self.tx,self.web);domain=self.request(self.web,'/api/video/worker/drain-status')
  ws=self.worker_control(self.worker,'status',str(uuid.uuid4()))['state'];rows,held=self.incidents()
  return normal.current_drained(app,domain,ws,self.owners(),rows,held,self.incident_digest,self.cfg.get('preservedWorkerTick'))

 def run(self):
  if self.cfg.get('resumeReview'):self.resume_review()
  else:
   require(self.state['revision']==self.cfg['expectedRevision'] and sha(enc(self.state))==self.cfg['expectedCanonicalDigest'],'FRESH_PREDECESSOR_REVIEW_REQUIRED');recovery.recovery_binding(self.state,self.original_manifest)
   require(sha(self.tx.run(['nginx','-T']))==self.cfg['expectedGatewayDigest'],'GATEWAY_CHANGED')
   rows,held=self.incidents();self.incident_digest=policy.check_incidents(rows,held)
   self.tx.save('preserved-incidents.json',{'rows':rows,'held':held,'sha256':self.incident_digest})
   descriptor=self.tx.save('original-canonical.json',enc(self.state));self.tx.save('original-canonical-exact.json',self.original)
   self.succ=normal.begin(self.state,self.cfg,descriptor,self.incident_digest)
   self.succ.update(commit=self.cfg['commit'],buildVersion=self.cfg['version'],image=self.cfg['image'],previousRuntimeRecovery=copy.deepcopy(self.runtime))
   self.check_running_slots()
   require(not self.tx.run(['ss','-Hltn','sport = :'+str(self.cfg['newPort'])]).strip(),'CANDIDATE_PORT_IN_USE')
   baseline_app=c.app_status(self.tx,self.web);require(baseline_app['observations']['unknownLeases']==0,'CURRENT_UNKNOWN_WORK_REQUIRES_RECONCILIATION')
   self.state.setdefault('normalBlueGreenReleases',{})[RELEASE]=self.succ;self.persist()
   self.tx.save('original-supervisor.service',pathlib.Path('/etc/systemd/system/naumi47-recovery.service').read_bytes())
   self.tx.save('original-recovery-manifest.json',pathlib.Path(self.runtime['manifestPath']).read_bytes())
   baseline_app=c.app_status(self.tx,self.web);require(baseline_app['observations']['unknownLeases']==0,'CURRENT_UNKNOWN_WORK_REQUIRES_RECONCILIATION')
   self.config_before=self.configuration_facts();self.tx.save('configuration-before.json',self.config_before)
   require(self.config_before==self.cfg['expectedConfigurationFacts'],'MODEL_OR_BILLING_BASELINE_CHANGED')
   self.op('database-backup',lambda _:self.tx.backup_database(self.db))
   self.maintenance_and_import()
  if not getattr(self,'candidate_reused',False):
   self.pre=tasks.collect_task_snapshot(self.tx.run,self.db,self.tx.save,projection='proof',row_limit=self.cfg.get('snapshotRowLimit',5000),allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=self.cfg.get('snapshotStatementTimeoutMs',5000))
   require(self.pre.public.get('tables'),'TASK_BASELINE_MISSING');self.phase('BACKED_UP')
   web_memory=self.cfg.get('webMemoryMiB',2048);worker_memory=self.cfg.get('workerMemoryMiB',128)
   require(int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))//1024>=web_memory+worker_memory+1024,'DUAL_SLOT_MEMORY_INSUFFICIENT')
   image=json.loads(self.tx.run(['docker','image','inspect',self.cfg['image']]))[0];require(image['Id']==self.cfg['image'],'FIXED_IMAGE_MISSING')
   if getattr(self,'partial_nas_web',False):self.newweb=self.succ['operations']['web-create']['receipt'];self.tx.pin(self.newweb)
   else:self.newweb=self.op('web-create',lambda _:self.tx.clone_web(self.web,name=WEB,port=self.cfg['newPort'],image=self.cfg['image'],commit=self.cfg['commit'],memory_mib=web_memory,cpu=1.5,release_secret=secrets.token_urlsafe(48),state_dir=STATE+'/web',build_version=self.cfg['version'],reviewed_prior_state_dir=self.cfg['oldWebStateDir'],reviewed_nas_credentials_sha256=self.cfg.get('nasCredentialsSha256'),reviewed_video_reference_origin=self.cfg.get('videoReferencePublicOrigin'),reviewed_combined_media=self.cfg.get('combinedMedia')))
   self.newweb=self.op('web-start',lambda _:self.tx.start_candidate(self.newweb,dict(webPeakMiB=web_memory,workerPeakMiB=worker_memory,hostReserveMiB=1024),int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))//1024))
   self.wait(lambda:self.request(self.newweb,'/api/health'),'WEB_START')
   self.newworker=self.op('worker-create',lambda _:c.clone_worker(self.tx,self.newweb,name=WORKER,memory_mib=worker_memory,cpu=1 if self.cfg.get('reviewedCombinedMedia') else .25,state_dir=STATE+'/worker',reviewed_combined_media=self.cfg.get('reviewedCombinedMedia') is True))
   self.newworker=self.op('worker-start',lambda _:c.start_worker(self.tx,self.newworker,int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))//1024,reviewed_combined_media=self.cfg.get('reviewedCombinedMedia') is True))
   self.wait(lambda:self.worker_control(self.newworker,'status',str(uuid.uuid4())),'WORKER_START')
  self.phase('CANDIDATE',web=self.newweb,worker=self.newworker);self.ready();self.build_gateway()
  self.tx.save('candidate-server-actions.json',{'old':self.server_actions(self.web),'new':self.server_actions(self.newweb)})
  save(ROOT/'browser-private.json',{'releaseId':RELEASE,'cookie':self.cookie,'candidateOrigin':'http://127.0.0.1:'+str(self.cfg['newPort']),'commit':self.cfg['commit'],'version':self.cfg['version']})
  self.phase('READY');self.wait(lambda:self.marker('browser-before.json'),'BROWSER_BEFORE',600)
  self.finish_ready()

 def finish_ready(self):
  if 'old-worker-drain' not in self.succ['operations']:self.op('old-worker-drain',lambda op:self.worker_control(self.worker,'drain',op))
  self.worker_paused=True
  self.wait(lambda:(lambda s:s if normal.worker_quiescent(s,self.cfg.get('preservedWorkerTick')) else None)(self.worker_control(self.worker,'status',str(uuid.uuid4()))['state']),'OLD_WORKER_DRAIN',120)
  self.op('new-web-open',lambda op:c.control_app(self.tx,self.newweb,'resume',op))
  self.op('gateway-switch',lambda _:self.switch_forward_gateway());self.switched=True
  self.phase('SWITCHED');save(ROOT/'cutover.json',{'releaseId':RELEASE,'version':self.cfg['version'],'at':now()})
  self.wait(lambda:self.marker('browser-after.json'),'BROWSER_AFTER',600)
  self.op('old-web-drain',lambda op:c.control_app(self.tx,self.web,'drain',op));self.old_drained=True
  drained=self.wait(lambda:self.drain_proof(),'OLD_WEB_CURRENT_EXECUTION_DRAIN',120)
  self.tx.save('current-execution-drain.json',drained)
  self.op('new-worker-resume',lambda op:self.worker_control(self.newworker,'resume',op))
  self.wait(lambda:(lambda s:s if normal.worker_completed(s) else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'NEW_WORKER_SERVER_RECEIPT',90)
  self.phase('WORKER_ACTIVE')
  self.post=tasks.collect_task_snapshot(self.tx.run,self.db,self.tx.save,previous=self.pre.private,projection='proof',row_limit=self.pre.private.get('rowLimit',1000),allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=self.cfg.get('snapshotStatementTimeoutMs',5000))
  comparison=tasks.compare_task_snapshots(self.pre,self.post);self.tx.save('task-preservation-comparison.json',comparison)
  require(comparison['preservationVerified'],'TASK_PRESERVATION_NOT_VERIFIED')
  self.retire_ready()

 def retire_ready(self):
  # The domain reader is shared-DB, not old-slot-specific. Pause the new scan
  # at the final retirement barrier so its own read transaction cannot be
  # mistaken for undrained old work. Keep the completed tick receipt intact.
  self.op('new-worker-retirement-barrier',lambda op:self.worker_control(self.newworker,'drain',op))
  self.wait(lambda:(lambda s:s if normal.worker_quiescent(s) else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'NEW_WORKER_RETIREMENT_BARRIER',120)
  # Repeated current-execution proof, including exact immutable held incident.
  self.wait(lambda:self.drain_proof(),'REPEATED_CURRENT_DRAIN',60);time.sleep(2);self.wait(lambda:self.drain_proof(),'FINAL_CURRENT_DRAIN',60)
  require(('http://127.0.0.1:'+str(self.cfg['oldPort'])) not in self.tx.run(['nginx','-T']).decode(),'OLD_ROUTE_STILL_REFERENCED')
  self.reference_proof()
  self.install_supervisor()
  for identity in [self.worker,self.web]:
   self.wait(lambda:self.drain_proof(),'RETIREMENT_CURRENT_DRAIN',120) if identity is self.worker else None
   self.op('retire-'+identity['id'][:12],lambda _,identity=identity:self.stop_exact(identity))
   self.succ['retired'].append(identity['id']);self.persist()
  self.after_retirement()
  self.op('new-worker-after-retirement',lambda op:self.worker_control(self.newworker,'resume',op))
  self.wait(lambda:(lambda s:s if normal.worker_completed(s) else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'NEW_WORKER_FINAL_COMPLETION',90)
  self.verify_recovery_materials()
  self.state['activeNormalBlueGreenReleaseId']=RELEASE
  require(self.configuration_facts()==self.config_before,'MODEL_OR_BILLING_CONFIGURATION_CHANGED')
  self.phase('COMPLETE',completedAt=now(),paidOutputRecovered=False,historicalDrainReclassified=False)
  for identity in self.infra:self.tx.pin(identity)
  rows,held=self.incidents();policy.check_incidents(rows,held,self.incident_digest)
  self.tx.run(['systemctl','start','naumi47-recovery.timer'])
  result={'phase':'COMPLETE','historicalReleasePhase':self.state['phase'],'historicalDrainProven':False,'carriedIncidents':2,'paidOutputRecovered':False,'version':self.cfg['version'],'commit':self.cfg['commit'],'image':self.cfg['image'],'web':self.newweb,'worker':self.newworker,'at':now(),'supplierGenerationReplays':0,'databaseRestored':False}
  self.tx.save('PUBLICATION_RECEIPT.json',result);print('PUBLICATION_RESULT='+json.dumps(result),flush=True)

 def after_retirement(self):
  pass

 def switch_forward_gateway(self):
  return c.switch_gateway_bundle(self.tx,self.forward,self.before,self.after,
          expected_dump_sha=sha(self.dump.encode()),logical_to_real=self.real)

 def verify_recovery_materials(self):
  require(not self.cfg.get('releaseId','').startswith('release47-saas-') and
          self.cfg.get('recoveryMode')!='saas-controlled-maintenance','SAAS_RECOVERY_CONTROLLER_REQUIRED')
  from release47_normal_rollback import run as rollback_check
  rollback_check(self.cfg,apply=False,existing_tx=self.tx)

 def resume_review(self):
  review=self.cfg['resumeReview'];require(self.state['revision']==review['revision'] and sha(enc(self.state))==review['canonicalSha256'],'RESUME_CANONICAL_CHANGED')
  self.succ=self.state['normalBlueGreenReleases'][RELEASE]
  self.candidate_reused=self.succ['phase']=='CANDIDATE'
  self.partial_nas_web=bool(self.cfg.get('nasCredentialsSha256')and self.succ['phase']=='BACKED_UP'and
       self.succ.get('lastError')=='NAS_CREDENTIAL_FILE_CHANGED'and self.succ['operations'].get('web-create',{}).get('phase')=='ACKNOWLEDGED')
  expected={'database-backup','image-import'}|({'web-create','web-start','worker-create','worker-start'} if self.candidate_reused else set())
  if self.partial_nas_web:expected.add('web-create')
  if self.cfg.get('nasCredentialsSha256')and 'nas-media-catalog'in self.succ['operations']:expected.add('nas-media-catalog')
  memory_precreate=self.succ['phase']=='BACKED_UP' and self.succ.get('lastError')=='DUAL_SLOT_MEMORY_INSUFFICIENT' and set(self.succ['operations'])=={'database-backup','image-import'}
  readiness_auth=bool(getattr(self,'reviewed_readiness_resume',False) and self.succ['phase']=='CANDIDATE' and self.succ.get('lastError')=='RECOVERY_HTTP_CHECK_FAILED')
  require((self.partial_nas_web or memory_precreate or readiness_auth or self.succ['phase'] in ['BASELINED','CANDIDATE'] and self.succ.get('lastError') in ['ValueError','HOST_COMMAND_FAILED','POST_IMPORT_DISK_RESERVE_INSUFFICIENT']) and set(self.succ['operations'])==expected,'RESUME_ONLY_PRE_SWITCH_REVIEWED_FAILURE')
  if self.succ.get('lastError')=='POST_IMPORT_DISK_RESERVE_INSUFFICIENT':
   import shutil
   require(self.succ['phase']=='BASELINED' and shutil.disk_usage('/').free>=10*1024**3,'RECONCILED_IMPORT_DISK_RESERVE_INSUFFICIENT')
  for name,op in self.succ['operations'].items():
   require(op['phase']=='ACKNOWLEDGED' and op['operationId']==review['operations'][name],'RESUME_ORIGINAL_OPERATION_REQUIRED')
  require(self.state.get('activeNormalBlueGreenReleaseId')==self.cfg.get('previousNormalReleaseId'),'RESUME_ACTIVE_RELEASE_CHANGED')
  extra=set()
  if self.candidate_reused:
   self.newweb=self.succ['web'];self.newworker=self.succ['worker'];self.tx.pin(self.newweb);self.tx.pin(self.newworker);extra={self.newweb['id'],self.newworker['id']}
   require(self.newweb['image']==self.cfg['image'] and self.newworker['image']==self.cfg['image'] and c.app_status(self.tx,self.newweb)['admission']['mode']=='draining','RESUME_CANDIDATE_BASELINE_CHANGED')
   ws=self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state'];require(ws['paused'] and ws['activeTicks']==0 and ws['unresolvedTicks']==0,'RESUME_CANDIDATE_WORKER_NOT_PAUSED')
   snapshots=list(self.tx.folder.glob('task-snapshot-*.json'));require(len(snapshots)==1,'EXACT_PRE_CANDIDATE_SNAPSHOT_REQUIRED')
   private=json.loads(snapshots[0].read_bytes());self.pre=tasks.Snapshot(public=tasks.summarize(private),private=private)
  else:
   require(not self.tx.run(['ss','-Hltn','sport = :'+str(self.cfg['newPort'])]).strip(),'RESUME_CANDIDATE_ALREADY_PRESENT')
   names=self.tx.run(['docker','ps','-a','--format','{{.Names}}']).decode().splitlines()
   if self.partial_nas_web:
    pending=self.succ['operations']['web-create']['receipt'];self.tx.pin(pending);require(not pending['running']and pending['image']==self.cfg['image']and pending['name']==WEB and WORKER not in names,'RESUME_PARTIAL_WEB_CHANGED')
   else:require(WEB not in names and WORKER not in names,'RESUME_CANDIDATE_ALREADY_EXISTS')
  self.check_running_slots(extra)
  recovery.recovery_binding(self.state,self.original_manifest)
  require(sha(self.tx.run(['nginx','-T']))==self.cfg['expectedGatewayDigest'],'RESUME_GATEWAY_CHANGED')
  saved=json.loads((self.tx.folder/'preserved-incidents.json').read_bytes());self.incident_digest=saved['sha256'];rows,held=self.incidents();policy.check_incidents(rows,held,self.incident_digest)
  self.config_before=self.configuration_facts();require(self.config_before==self.cfg['expectedConfigurationFacts'],'RESUME_CONFIG_CHANGED')
  require(c.app_status(self.tx,self.web)['observations']['unknownLeases']==0,'RESUME_UNKNOWN_EXECUTION')
  backup=json.loads((self.tx.folder/'backup-readable.json').read_bytes());require(file_sha(backup['path'])==backup['sha256'],'RESUME_BACKUP_CHANGED')
  imported=json.loads(self.tx.run(['docker','image','inspect',self.cfg['image']]))[0]
  require(imported['Id']==self.cfg['image'],'RESUME_IMPORTED_IMAGE_CHANGED')
  if self.succ['image']!=self.cfg['image']:
   mapping=review['imageIdentity'];require(mapping['from']==self.succ['image'] and mapping['to']==self.cfg['image'] and imported['RootFS']==mapping['rootFS'],'RESUME_IMAGE_IDENTITY_MAPPING_CHANGED')
   image_env=dict(v.split('=',1) for v in imported['Config'].get('Env',[]) if '=' in v)
   archive=pathlib.Path(self.cfg['imageArchive']);archive_ok=archive.is_file()and file_sha(archive)==self.cfg['imageArchiveSha256']
   if not archive_ok and self.cfg.get('verifiedImageArchiveOffload'):
    off=self.cfg['verifiedImageArchiveOffload'];p=pathlib.Path(off['path'])
    require(p.parent==ROOT and file_sha(p)==off['sha256'],'ARCHIVE_OFFLOAD_RECEIPT_CHANGED')
    proof=json.loads(p.read_bytes());archive_ok=bool(proof['phase']=='ALL_BACKUPS_READBACK_VERIFIED'and len(proof['files'])==1 and
      proof['files'][0]['readback']is True and proof['files'][0]['sha256']==self.cfg['imageArchiveSha256'])
   require(image_env['SOURCE_COMMIT']==self.cfg['commit'] and image_env['BUILD_VERSION']==self.cfg['version'] and archive_ok,'IMPORTED_ARCHIVE_SOURCE_CHANGED')
   self.succ['imageIdentityReconciliation']=mapping;self.succ['image']=self.cfg['image'];self.persist()
  self.tx.save('resume-reviewed-'+str(self.state['revision'])+'.json',{'review':review,'sameOperationIds':True,'backupHashVerified':True,'candidateReused':self.candidate_reused,'gatewayUnchanged':True,'configUnchanged':True,'at':now()})
  print('RESUME_REVIEW=PASS ORIGINAL_OPERATIONS_RETAINED=YES',flush=True)

 def configuration_facts(self):
  return self.sql("SELECT json_build_object('activeModelVersion',s.active_version,'digest',v.digest,'activeModelRowHash',encode(sha256(convert_to(to_jsonb(v)::text,'UTF8')),'hex')) FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true; SELECT json_build_object('billingHash',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.k),'[]'::jsonb)::text,'UTF8')),'hex')) FROM app_settings t WHERE t.k LIKE '%billing%'; SELECT json_build_object('billingVersion',v.version,'billingConfigHash',encode(sha256(convert_to(to_jsonb(v)::text,'UTF8')),'hex')) FROM app_settings s JOIN app_billing_config_versions v ON v.version::text=s.v WHERE s.k='billing_config_version';")

 def maintenance_and_import(self):
  import shutil
  before=shutil.disk_usage('/');images_before=set(self.tx.run(['docker','image','ls','-q','--no-trunc']).splitlines())
  self.tx.save('space-before.json',{'freeBytes':before.free,'totalBytes':before.total})
  if before.used/before.total>.80:
   self.tx.save('filtered-cache-maintenance.txt',self.tx.run(['docker','builder','prune','--force','--filter','until=72h'],timeout=180))
  require(set(self.tx.run(['docker','image','ls','-q','--no-trunc']).splitlines())==images_before,'CACHE_MAINTENANCE_MUST_NOT_REMOVE_IMAGES')
  archive=pathlib.Path(self.cfg['imageArchive']);require(archive.is_file() and file_sha(archive)==self.cfg['imageArchiveSha256'],'FIXED_IMAGE_ARCHIVE_CHANGED')
  require(shutil.disk_usage('/').free>=10*1024**3+archive.stat().st_size,'IMPORT_DISK_RESERVE_INSUFFICIENT')
  self.op('image-import',lambda _:self.tx.run(['docker','load','-i',str(archive)],timeout=240).decode())
  require(shutil.disk_usage('/').free>=10*1024**3,'POST_IMPORT_DISK_RESERVE_INSUFFICIENT')
  self.tx.save('space-after-import.json',{'freeBytes':shutil.disk_usage('/').free})

 def reference_proof(self):
  running=self.tx.run(['docker','ps','-q','--no-trunc']).decode().splitlines()
  for identifier in running:
   if identifier in [self.web['id'],self.worker['id']]:continue
   row=self.tx.inspect(identifier)
   text=json.dumps({'env':row['Config'].get('Env',[]),'links':row['HostConfig'].get('Links')})
   require(not any(value in text for value in [OLDWEB,OLDWORKER,':'+str(self.cfg['oldPort'])]),'RUNNING_INTERNAL_CALLER_STILL_REFERENCES_OLD_SLOT')
  established=self.tx.run(['ss','-Htn','state','established','( sport = :'+str(self.cfg['oldPort'])+' or dport = :'+str(self.cfg['oldPort'])+' )'])
  require(not established.strip(),'OLD_LOOPBACK_CONNECTIONS_STILL_ACTIVE')
  require(self.request(self.newweb,'/api/health')['db']['ok'] is True,'NEW_WEB_HEALTH_CHANGED')
  self.tx.save('retirement-reference-proof.json',{'oldGatewayReferences':0,'runningInternalReferences':0,'oldLoopbackEstablished':0,'at':now()})

 def stop_exact(self,identity):
  self.tx.pin(identity);require(identity['name'] in [OLDWEB,OLDWORKER],'UNKNOWN_RETIRE_TARGET')
  self.tx.run(['docker','update','--restart=no',identity['id']]);self.tx.run(['docker','stop','--time=-1',identity['id']],timeout=120)
  r=public_identity(self.tx.inspect(identity['id']));require(not r['running'] and r['restartPolicy']=='no','RETIRE_NOT_OBSERVED');return r

 def server_actions(self,identity):
  raw=self.tx.run(['docker','exec',identity['id'],'cat','/app/.next/server/server-reference-manifest.json'])
  value=json.loads(raw);count=len(value['node'])+len(value['edge']);require(count==0,'CROSS_BUILD_SERVER_ACTION_OWNERSHIP_REQUIRED')
  return {'count':count,'sha256':sha(raw),'identity':identity}

 def install_supervisor(self):
  # Existing, unit-tested crash supervisor is retained. The manifest receives
  # current pins; the original release stays pending with explicit successor.
  self.tx.run(['systemctl','stop','naumi47-recovery.timer'])
  manifest={**self.original_manifest,'commit':self.cfg['commit'],'buildVersion':self.cfg['version'],'image':self.cfg['image'],'gatewayDumpSha256':sha(self.after_dump.encode()),'operationId':str(uuid.uuid4()),'evidenceDir':str(self.tx.folder),'journalDir':str(ROOT/'supervisor-journal'),'successorReleaseId':RELEASE}
  for role,identity in [('web',self.newweb),('worker',self.newworker)]:
   row=self.tx.inspect(identity['id']);manifest[role]={**identity,'role':role,'staticSha256':recovery.static_pin(row),'memoryMiB':self.cfg.get('webMemoryMiB',2048) if role=='web' else self.cfg.get('workerMemoryMiB',128),'runningAtEnrollment':True}
  p=ROOT/'supervisor-manifest.json';save(p,manifest)
  self.state['runtimeRecovery']={**self.runtime,'operationId':manifest['operationId'],'manifestPath':str(p),'manifestSha256':sha(enc(manifest)),'phase':'ACKNOWLEDGED','effectiveWeb':self.newweb,'effectiveWorker':self.newworker,'successorReleaseId':RELEASE}
  self.state['webs']['main']['running']=self.newweb;self.state['worker']['running']=self.newworker
  self.persist();unit=pathlib.Path('/etc/systemd/system/naumi47-recovery.service')
  old=unit.read_text()
  import shlex
  starts=[shlex.split(line.split('=',1)[1])for line in old.splitlines()if line.startswith('ExecStart=')]
  require(len(starts)==1 and len(starts[0])>=4 and pathlib.Path(starts[0][1]).name=='release47_recovery_supervisor.py'and
          pathlib.Path(starts[0][1]).is_relative_to(pathlib.Path('/opt/naumi-staging')), 'SUPERVISOR_PROGRAM_NOT_REVIEWABLE')
  old_program=starts[0][1]
  new=old.replace(old_program,str(ROOT/'tools/release47_recovery_supervisor.py')).replace(self.runtime['manifestPath'],str(p))
  require(old!=new and str(p) in new and str(ROOT/'tools/release47_recovery_supervisor.py') in new,'SUPERVISOR_UNIT_NOT_BOUND');c._replace_config(unit,new.encode())
  self.state['runtimeRecovery']['supervisorProgramSha256']=file_sha(ROOT/'tools/release47_recovery_supervisor.py');self.persist()
  self.tx.run(['systemd-analyze','verify',str(unit)]);self.tx.run(['systemctl','daemon-reload'])
  r=recovery.Supervisor(manifest,manifest['journalDir'],recovery.Adapter(self.tx,manifest)).once();self.tx.save('new-supervisor-acceptance.json',r)

 def recover_failure(self,ex):
  require(not self.cfg.get('releaseId','').startswith('release47-saas-') and
          self.cfg.get('recoveryMode')!='saas-controlled-maintenance','SAAS_RECOVERY_CONTROLLER_REQUIRED')
  # Never assume a timed-out mutation was not applied. Preserve original UUIDs.
  print('PUBLICATION_HOLD='+ (str(ex) if isinstance(ex,Hold) else type(ex).__name__),flush=True)
  if hasattr(self,'succ'):
   self.succ.update(lastError=str(ex) if isinstance(ex,Hold) else type(ex).__name__,failedAt=now());self.persist()
  if not self.switched and self.worker_paused and sha(self.tx.run(['nginx','-T']))==self.cfg['expectedGatewayDigest']:
   self.op('failure-old-worker-resume',lambda op:self.worker_control(self.worker,'resume',op))
   self.tx.save('PRE_SWITCH_SERVICE_PRESERVED.json',{'oldGatewayVerified':True,'oldWorkerResumed':True,'tasksReplayed':False})
  if self.switched and all(self.tx.inspect(i['id'])['State']['Running'] for i in [self.web,self.worker]):
   try:
    # Do not cut away active successor executions. Keep all slots and original
    # receipts if a control outcome is UNKNOWN instead of manufacturing rollback.
    self.worker_control(self.newworker,'drain',str(uuid.uuid4()))
    ws=self.wait(lambda:(lambda v:v if v['paused'] and v['activeTicks']==0 and v['unresolvedTicks']==0 else None)(self.worker_control(self.newworker,'status',str(uuid.uuid4()))['state']),'ROLLBACK_WORKER',90)
    app=c.app_status(self.tx,self.newweb);domain=self.request(self.newweb,'/api/video/worker/drain-status')
    require(domain['drained'] and app['observations']['trackedAcceptedWork']==0 and app['observations']['agentRuns']==0 and app['observations']['unknownLeases']==0,'ACTIVE_SUCCESSOR_PREVENTS_AUTOMATIC_CUTBACK')
    c.control_app(self.tx,self.newweb,'drain',str(uuid.uuid4()))
    if self.old_drained:c.control_app(self.tx,self.web,'resume',str(uuid.uuid4()))
    prior_folder=self.tx.folder;cutback=ROOT/'failure-cutback';cutback.mkdir(mode=0o700,exist_ok=False)
    try:
     self.tx.folder=cutback
     c.switch_gateway_bundle(self.tx,self.rollback,self.candidate_closure,{n:self.before[n] for n in self.after},expected_dump_sha=sha(self.after_dump.encode()),logical_to_real=self.real)
    finally:self.tx.folder=prior_folder
    self.worker_control(self.worker,'resume',str(uuid.uuid4()))
    # No supervisor rebind occurred before the last validated drain boundary.
    if self.state['runtimeRecovery'].get('successorReleaseId')==RELEASE:
     self.state['runtimeRecovery']=self.runtime;self.state['webs']['main']['running']=self.web;self.state['worker']['running']=self.worker
     unit=pathlib.Path('/etc/systemd/system/naumi47-recovery.service');c._replace_config(unit,(self.tx.folder/'original-supervisor.service').read_bytes());self.tx.run(['systemctl','daemon-reload'])
    self.phase('ROLLED_BACK',rollbackAt=now());self.tx.run(['systemctl','start','naumi47-recovery.timer'])
    self.tx.save('LIVE_ENTRY_ROLLBACK_RECEIPT.json',{'at':now(),'gatewayRestored':True,'oldWebOpen':True,'oldWorkerResumed':True,'databaseRestored':False,'tasksReplayed':False})
    print('LIVE_ENTRY_ROLLBACK=VERIFIED',flush=True)
   except BaseException as rollback_error:
    self.succ['rollbackStatus']='PENDING_RECONCILIATION';self.persist();print('ROLLBACK_PENDING='+type(rollback_error).__name__,flush=True)
  self.tx.save('FAILED_CURRENT_STATUS-'+str(self.state['revision'])+'.json',{'at':now(),'error':str(ex) if isinstance(ex,Hold) else type(ex).__name__,'switched':self.switched,'workerPaused':self.worker_paused,'oldDrained':self.old_drained,'unknownOperations':[k for k,v in getattr(self,'succ',{}).get('operations',{}).items() if v['phase']!='ACKNOWLEDGED']})

def main():
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--config',required=True,type=pathlib.Path);a=p.parse_args()
 cfg=json.loads(a.config.read_bytes());configure(cfg)
 with transaction() as tx:
  print('THREE_LOCKS=ACQUIRED',flush=True);a=Controller(tx,cfg)
  try:a.run()
  except BaseException as ex:a.recover_failure(ex);raise
 print('THREE_LOCKS=RELEASED',flush=True)

if __name__=='__main__':main()
