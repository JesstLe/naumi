"""103-only staged blue/green. Fixed program; independent data; no paid submissions.

The isolated media container is CREATED but not started while old UI slots still
consume RAM. Its complete 3072MiB budget is checked again after those UI slots
are unreferenced and retired. No swap or unmeasured media allowance is counted.
"""
import base64,copy,datetime as dt,hashlib,hmac,json,os,pathlib,secrets,sys,time,uuid
from types import SimpleNamespace
from release47_host import HostTransaction,environment,public_identity,require,sha,Hold
import release47_controls as controls
import release_client_compat as compat
import release103_gateway as gateway
import release103_authorized_ui_retirement as retirement
import release47_task_snapshot as tasks
import release_runtime_recovery as startup
import release_video_media as video
import worker_handoff

TARGET='103.30.76.93'
MACHINE=retirement.MACHINE
COMMIT='56aa32336cfdd5ec37a133d02db67d25806c3a21'
VERSION='1792471620'
IMAGE='sha256:38e64646c4d68850ec4791a2708553ebf753602f9dedda7a16b9034d20e49078'
RID='canvas-video-fusion-103-20261020-staged'
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
ROOT=pathlib.Path('/opt/naumi-staging/evidence/release103-staged-20261020')
STATE=pathlib.Path('/opt/naumi-staging/releases/release103-staged-20261020')
PORT=13104

def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def available():return int(next(l.split()[1]for l in pathlib.Path('/proc/meminfo').read_text().splitlines()if l.startswith('MemAvailable:')))//1024

def stage_gate(available_mib,*,media_started=False,old_ui_stopped=False):
    require(type(available_mib)is int and available_mib>=0,'MEMORY_OBSERVATION_REQUIRED')
    if media_started:require(old_ui_stopped,'MEDIA_START_BEFORE_UI_RETIREMENT_FORBIDDEN')
    required=1536+128+1024+(3072 if media_started else 0)
    return {'ok':available_mib>=required,'requiredMiB':required,'availableMiB':available_mib,
            'mediaStarted':media_started,'mediaBudgetMiB':3072,'swapIncluded':False}

def remaining_peak_gate(available_mib,usages):
    caps={'web':1536,'worker':128,'media':3072}
    require(set(usages)==set(caps)and all(type(v)is int and 0<=v<=caps[k]for k,v in usages.items()),'MEASURED_ROLE_MEMORY_REQUIRED')
    required=1024+sum(caps[k]-usages[k]for k in caps)
    return {'ok':available_mib>=required,'requiredRemainingMiB':required,'availableMiB':available_mib,
            'capsMiB':caps,'residentMiB':usages,'hostReserveMiB':1024,'swapIncluded':False}

class Release:
 def __init__(self,tx):
  self.tx=tx;self.initial=CANON.read_bytes();self.canon=json.loads(self.initial);self.disk=sha(self.initial)
  require(self.disk=='8471569f6039fd1c720c0dd2bde77b07d116cf90e5a6a9483a2f9590a68bbf0b','FRESH_103_CANONICAL_REQUIRED')
  require(RID not in self.canon.get('staged103Releases',{}),'EXISTING_RELEASE_RECONCILE_ONLY')
  self.original_rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-q','--no-trunc']).decode().split()]))
  self.byname={r['Name'].lstrip('/'):r for r in self.original_rows};self.old=self.byname['naumi-staging-app-1'];self.db=self.byname['naumi-staging-db-1'];self.de=environment(self.db)
  self.olds=[r for r in self.original_rows if r['Config']['Cmd']==['node','server.js']and r['Name'].lstrip('/')!='naumi-fleet-portal-ef08d3db22b7']
  require(len(self.olds)==6 and len(self.original_rows)==13,'FRESH_EXPECTED_103_TOPOLOGY_REQUIRED')
  self.ui=[r for r in self.olds if r['Id']!=self.old['Id']]
  self.record={'releaseId':RID,'phase':'BASELINED','commit':COMMIT,'buildVersion':VERSION,'image':IMAGE,'at':now(),'operations':{},'retired':[],
     'legacyDrainProven':False,'historicalTasksResolved':False,'databaseRestored':False,'tasksReplayed':False}
  self.canon.setdefault('staged103Releases',{})[RID]=self.record
  self.switched=False;self.retired=[];self.newweb=None;self.newworker=None;self.media=None

 def persist(self):
  require(sha(CANON.read_bytes())==self.disk,'CANONICAL_CAS_CHANGED')
  self.canon['revision']+=1;controls._atomic_private(CANON,self.canon);self.disk=sha(CANON.read_bytes())
  controls._atomic_private(ROOT/'PROGRESS.json',self.record)

 def phase(self,p,**facts):self.record.update(phase=p,at=now(),**facts);self.persist();print('PHASE='+p,flush=True)

 def op(self,name,fn):
  require(name not in self.record['operations'],'ORIGINAL_OPERATION_RECONCILE_REQUIRED')
  op={'id':str(uuid.uuid4()),'phase':'INTENT_RECORDED','at':now()};self.record['operations'][name]=op;self.persist()
  try:r=fn(op['id'])
  except BaseException:op['phase']='UNKNOWN';self.persist();raise
  op.update(phase='ACKNOWLEDGED',receipt=r);self.persist();return r

 def sql(self,q):
  raw=self.tx.run(['docker','exec','-i',self.db['Id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=("BEGIN READ ONLY;SET LOCAL statement_timeout='8s';"+q+'COMMIT;').encode())
  return [json.loads(s)for s in raw.splitlines()if s.startswith(b'{')]

 def configuration(self):
  return self.sql("SELECT json_build_object('models',encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'),'modelVersion',t.active_version) FROM app_model_config_state t;SELECT json_build_object('billing',encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'),'billingVersion',t.version) FROM (SELECT * FROM app_billing_config_versions ORDER BY version DESC LIMIT 1)t;")

 def request(self,identity,path,body=None,auth=True,expected=200):
  js="""const s=JSON.parse(process.argv[1]);const r=await fetch('http://127.0.0.1:3000'+s.path,{method:s.body===null?'GET':'POST',headers:{...(s.auth?{cookie:s.cookie}:{}),'content-type':'application/json'},...(s.body===null?{}:{body:JSON.stringify(s.body)}),signal:AbortSignal.timeout(20000)});const b=await r.text();console.log(JSON.stringify({status:r.status,body:b}));"""
  spec={'path':path,'body':body,'auth':auth,'cookie':self.cookie if auth else ''}
  raw=self.tx.run(['docker','exec','-e','NODE_OPTIONS=',identity['id'],'node','--input-type=module','-e',js,json.dumps(spec)],timeout=30)
  r=json.loads(raw);require(r['status']==expected,'HTTP_'+str(r['status'])+'_'+path)
  try:r['json']=json.loads(r['body'])
  except ValueError:pass
  return r

 def wait(self,fn,label,seconds=60):
  end=time.monotonic()+seconds
  while True:
   try:
    r=fn()
    if r:return r
   except (Hold,ValueError,KeyError):pass
   if time.monotonic()>end:raise Hold('WAIT_'+label)
   time.sleep(1)

 def worker(self,action,op=None):
  e=environment(self.tx.inspect(self.newworker['id']))
  a=SimpleNamespace(container=self.newworker['id'],expected_id=self.newworker['id'],expected_image=IMAGE,expected_commit=COMMIT,expected_origin=e['NAUMI_APP_ORIGIN'],action=action,operation_id=op or str(uuid.uuid4()),tick_id=None)
  folder=self.tx.folder/'worker-control';folder.mkdir(mode=0o700,exist_ok=True)
  return worker_handoff.execute(a,folder,lambda argv:self.tx.run(argv).decode())

 def prepare(self):
  self.tx.save('canonical-before.json',self.initial);self.tx.save('private-container-baseline.json',self.original_rows)
  self.nginx=self.tx.run(['nginx','-T']).decode();require(sha(self.nginx.encode())==retirement.GATEWAY,'GATEWAY_BASELINE_CHANGED')
  self.parsed=compat.Dump(self.nginx);self.before={p:pathlib.Path(p).read_bytes()for p in self.parsed.files};self.real={p:str(pathlib.Path(p).resolve())for p in self.before}
  self.config=self.configuration();self.tx.save('configuration-before.json',self.config)
  self.op('database-backup',lambda _:self.tx.backup_database(public_identity(self.db)))
  self.pre=tasks.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
  self.tx.save('task-baseline.json',self.pre.public)
  # Native owned admin session: no password change or account creation.
  email=self.sql("SELECT json_build_object('email',email)FROM app_users WHERE role='admin' AND banned=false ORDER BY joined_at LIMIT 1;")[0]['email']
  secret=environment(self.old)['SETTINGS_SECRET'];exp=str(int(time.time()*1000)+30*24*3600*1000);eb=base64.urlsafe_b64encode(email.encode()).decode().rstrip('=')
  self.cookie='nv_user='+eb+'.'+exp+'.'+hmac.new(secret.encode(),('user:'+eb+'.'+exp).encode(),hashlib.sha256).hexdigest();self.tx.save('cookie.private',self.cookie.encode())
  self.request(public_identity(self.old),'/api/auth/session');self.oldprojects=self.request(public_identity(self.old),'/api/projects')['json']
  gate=stage_gate(available());require(gate['ok'],'WEB_OVERLAP_CAPACITY_GATE');self.tx.save('stage1-capacity.json',gate)
  self.phase('BACKED_UP')

 def candidate(self):
  archive=ROOT/'image.tar.gz'
  from release47_host import file_sha
  require(file_sha(archive)=='52ee5829f808b6ad41edbcd3282bdc1bead42bf5a88547e9bef83b7958021f6f','IMAGE_ARCHIVE_HASH_CHANGED')
  self.op('image-import',lambda _: {'loaded':bool(self.tx.run(['docker','load','-i',str(archive)],timeout=300)),'archiveSha256':file_sha(archive)})
  info=json.loads(self.tx.run(['docker','image','inspect',IMAGE]))[0];require(environment(info).get('SOURCE_COMMIT')==COMMIT and environment(info).get('BUILD_VERSION')==VERSION,'FIXED_IMAGE_SOURCE_REQUIRED')
  require(not self.tx.run(['ss','-Hltn','sport = :'+str(PORT)]).strip(),'CANDIDATE_PORT_IN_USE')
  self.plan={'target':TARGET,'releaseId':RID,'commit':COMMIT,'buildVersion':VERSION,'releaseSecret':secrets.token_urlsafe(48),
   'authorization':{'mode':'latest-103-20261020','target':TARGET,'scope':'latest-unified-release','goalThread':'da1fb6c5-ffa9-4da4-97eb-d71dc858b418','date':'2026-10-20','userAcknowledgement':'上线','restoreDatabase':False,'replayAcceptedTasks':False},
   'webs':[{'variant':'main','name':'naumi-103-web-resolution-20261020','image':IMAGE,'source':public_identity(self.old),'stateDir':str(STATE/'web')}],
   'mediaWorker':{'name':'naumi-video-media-'+COMMIT[:12],'image':IMAGE,'memoryMiB':3072,'cpu':1.5}}
  self.media=video.MediaLifecycle(self.tx,self.plan)
  self.op('media-create-not-start',lambda _:self.media.prepare(start=False))
  self.newweb=self.op('web-create',lambda _:self.tx.clone_web(public_identity(self.old),name=self.plan['webs'][0]['name'],port=PORT,image=IMAGE,commit=COMMIT,memory_mib=1536,cpu=1.5,release_secret=self.plan['releaseSecret'],state_dir=str(STATE/'web'),build_version=VERSION,media_binding=self.media.prepared_binding(),runtime_recovery=RID))
  self.newweb=self.op('web-start',lambda _:self.tx.start_candidate(self.newweb,dict(webPeakMiB=1536,workerPeakMiB=128,hostReserveMiB=1024),available()))
  self.wait(lambda:self.request(self.newweb,'/api/health',auth=False),'WEB_READY')
  self.newworker=self.op('worker-create',lambda _:controls.clone_worker(self.tx,self.newweb,name='naumi-103-worker-resolution-20261020',memory_mib=128,cpu=.25,state_dir=str(STATE/'worker')))
  self.newworker=self.op('worker-start-paused',lambda _:controls.start_worker(self.tx,self.newworker,available()))
  self.wait(lambda:self.worker('status'),'WORKER_PAUSED');self.phase('CANDIDATE_READY',web=self.newweb,worker=self.newworker)

 def acceptance(self):
  version=self.request(self.newweb,'/api/version',auth=False)['json'];require(version['commit']==COMMIT and str(version['version'])==VERSION,'CANDIDATE_VERSION_WRONG')
  require(self.request(self.newweb,'/api/health',auth=False)['json']['db']['ok'] is True,'DATABASE_UNHEALTHY')
  require(self.request(self.newweb,'/api/auth/session')['json'].get('user'),'SESSION_NOT_PRESERVED')
  checks={}
  for path in ['/canvas','/desktop','/enterprise','/team','/studio3d','/admin','/api/projects','/api/canvas/text-nodes','/api/canvas/node-settings','/api/image-skills']:
   r=self.request(self.newweb,path);checks[path]={'status':r['status'],'sha256':sha(r['body'].encode())}
  self.request(self.newweb,'/api/projects',auth=False,expected=401)
  self.request(self.newweb,'/api/internal/release/status',auth=False,expected=404)
  projects=self.request(self.newweb,'/api/projects')['json'];require(projects==self.oldprojects,'EXISTING_PROJECT_LIST_CHANGED')
  self.tx.save('candidate-acceptance.json',{'checks':checks,'version':version,'sessionPreserved':True,'projectsIdentical':True,'supplierCalls':0})
  self.phase('ACCEPTED')

 def assets_gateway(self):
  oldroot=pathlib.Path(gateway.DISK_STATIC_ROOT);self.static=ROOT/'static';self.static.mkdir(mode=0o755)
  candidate=ROOT/'candidate-static';candidate.mkdir();self.tx.run(['docker','cp',self.newweb['id']+':/app/.next/static/.',str(candidate)],timeout=120)
  entries={}
  for base,prefix in [(oldroot,''),(candidate,'/_next/static')]:
   for p in base.rglob('*'):
    if not p.is_file():continue
    require(not p.is_symlink(),'STATIC_SYMLINK_FORBIDDEN');url=prefix+'/'+p.relative_to(base).as_posix();data=p.read_bytes()
    require(url not in entries or (sha(data),len(data))==(entries[url]['sha256'],entries[url]['size']),'STATIC_BYTE_CONFLICT')
    if url in entries:continue
    entries[url]={'url':url,'sha256':sha(data),'size':len(data),'source':str(p)}
    dest=self.static/url.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);dest.chmod(0o644)
  for p in self.static.rglob('*'):
   if p.is_dir():p.chmod(0o755)
  # Nginx serves a public static root; evidence directory stays private.
  public=pathlib.Path('/var/www/naumi-client-assets/release103-staged-20261020');require(not public.exists(),'NEW_STATIC_ROOT_REQUIRED')
  import shutil;shutil.copytree(self.static,public)
  for p in [public,*public.rglob('*')]:p.chmod(0o755 if p.is_dir()else 0o644)
  manifest={'schemaVersion':1,'kind':'103-prefixed-static-union','assets':list(entries.values()),'conflicts':[],'fleetIncluded':False}
  self.tx.save('static-manifest.json',manifest)
  origin='http://127.0.0.1:'+str(PORT)
  patches,after,report=gateway.render(self.nginx,origin,origin,origin,str(public),manifest,runtime_topology='unified-web-three-ui')
  report.update(configClosureValidated=True,beforeDumpSha256=sha(self.nginx.encode()))
  compat.write_gateway_bundle(self.nginx,patches,after,report,ROOT/'gateway-forward',self.before)
  self.forward=json.loads((ROOT/'gateway-forward/report.json').read_bytes());self.after={p['path']:(ROOT/'gateway-forward'/p['after']).read_bytes()for p in self.forward['patches']}
  self.afterdump=after
  afterfiles={p:self.after.get(p,self.before[p])for p in self.before}
  inverse_patches={p:self.before[p].decode()+('\n' if compat.Dump(after).files[p]==afterfiles[p].decode()+'\n' else '')for p in self.before}
  compat.write_gateway_bundle(after,inverse_patches,self.nginx,{'configClosureValidated':True,'beforeDumpSha256':sha(after.encode()),'afterDumpSha256':sha(self.nginx.encode())},ROOT/'gateway-inverse',afterfiles)
  self.inverse=json.loads((ROOT/'gateway-inverse/report.json').read_bytes())
  # Real nginx syntax test in an isolated main config, never reloads the live entry.
  testroot=ROOT/'nginx-check';testroot.mkdir()
  site=testroot/'site.conf';site.write_bytes(self.after[gateway.SITE]);roottext=self.before['/etc/nginx/nginx.conf'].decode().replace('include /etc/nginx/sites-enabled/*;', 'include '+str(site)+';')
  conf=testroot/'nginx.conf';conf.write_text(roottext);self.tx.run(['nginx','-t','-c',str(conf)])
  self.phase('GATEWAY_PREPARED')

 def retire_ui(self):
  # No new database or lease claims exist in these five non-worker UI processes.
  # Historical volatile state is not relabelled as an ordinary drain receipt.
  for old in self.ui:
   retirement.no_references(self.tx,old)
   self.wait(lambda:retirement.serving_connections(self.tx.inspect(old['Id']))==0 and retirement.active_db(self.tx,old,self.db)==0,'OLD_UI_CONNECTIONS',90)
   self.tx.save('old-ui-observation-'+old['Id'][:12]+'.json',{'identity':public_identity(old),'connections':0,'activeDb':0,'ordinaryDrainProven':False,'historicalVolatileStateAccepted':True,'at':now()})
   def stop(op,old=old):
    self.tx.run(['docker','update','--restart=no',old['Id']]);self.tx.run(['docker','kill','--signal=SIGTERM',old['Id']])
    row=self.wait(lambda:(lambda r:r if not r['State']['Running']else None)(self.tx.inspect(old['Id'])),'UI_GRACEFUL_EXIT',60)
    require(not row['State'].get('OOMKilled') and row['State']['ExitCode'] in (0,143),'UI_EXIT_NOT_GRACEFUL')
    return {'identity':public_identity(row),'exitCode':row['State']['ExitCode'],'forcedKill':False}
   self.op('retire-ui-'+old['Id'][:12],stop);self.retired.append(old);self.record['retired'].append(old['Id']);self.persist()
  self.phase('OLD_UI_RETIRED',availableMiB=available())

 def media_gate(self):
  require(len(self.retired)==5 and not self.tx.inspect(self.media.spec['name'])['State']['Running'],'OLD_UI_RETIRED_MEDIA_UNSTARTED_REQUIRED')
  # Web is already running. Reserve its FULL cap, not just observed heap;
  # subtract no speculative future reclamation or Swap.
  required=3072+1536+128+1024
  # Current MemAvailable already excludes Web/Worker resident pages. Add only
  # their measured resident part to avoid counting those exact pages twice.
  usages=self.resident_usages(include_media=False)
  remaining=required-usages['web']-usages['worker']
  check={'availableMiB':available(),'requiredRemainingMiB':remaining,'fullCapsMiB':required,'measuredResidentMiB':usages,'swapIncluded':False,'oldUiStopped':5,'mediaBudgetMiB':3072}
  self.tx.save('stage2-full-media-capacity.json',check);require(check['availableMiB']>=remaining,'FULL_MEDIA_POST_RETIREMENT_CAPACITY_GATE')
  self.op('media-start',lambda _:self.media.prepare())
  self.media.verify_app(self.tx.inspect(self.newweb['id']));self.media.mode('resume')
  self.tx.save('media-real-health.json',self.media.health());self.phase('MEDIA_READY')

 def resident_usages(self,include_media=True):
  result={}
  for key,ident in [('web',self.newweb),('worker',self.newworker)]+([('media',public_identity(self.media.owned()))]if include_media else []):
   row=self.tx.inspect(ident['id']);pid=row['State']['Pid'];require(pid>0,'ROLE_MUST_BE_RUNNING')
   cg=next(l.split(':',2)[2]for l in pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().splitlines()if l.startswith('0::'))
   stats=dict(l.split()for l in(pathlib.Path('/sys/fs/cgroup')/cg.lstrip('/')/'memory.stat').read_text().splitlines())
   result[key]=(int(stats.get('anon',0))+int(stats.get('shmem',0)))//1048576
  return result

 def switch(self):
  self.op('open-new-web',lambda op:controls.control_app(self.tx,self.newweb,'resume',op))
  self.op('switch-gateway',lambda _:controls.switch_gateway_bundle(self.tx,self.forward,self.before,self.after,expected_dump_sha=sha(self.nginx.encode()),logical_to_real=self.real))
  self.switched=True;self.phase('SWITCHED')

 def finish(self):
  self.retire_ui();self.media_gate()
  # The old pre-control Worker has two historical uncertain operations. Keep
  # its app/caller together unless a real complete drain is observable. Never
  # resume a second scan loop on top of them.
  self.worker('status');self.phase('WEB_ACTIVE_WORKER_HANDOFF_REVIEW')
  self.acceptance()
  post=tasks.collect_task_snapshot(self.tx.run,public_identity(self.db),self.tx.save,previous=self.pre.private,projection='proof',row_limit=5000,allow_absent_tables=tasks.ADDITIVE_TABLES,statement_timeout_ms=15000)
  comparison=tasks.compare_task_snapshots(self.pre,post);self.tx.save('task-preservation.json',comparison)
  require(comparison['preservationVerified'],'TASK_PRESERVATION_FAILED')
  require(self.configuration()==self.config,'INDEPENDENT_CONFIG_CHANGED')
  # New Web has persistent signed startup admission; new Worker remains paused.
  webspec=self.plan['webs'][0];startup.write_activation(pathlib.Path(webspec['stateDir'])/'activation.json',startup.activation_marker(self.plan,webspec,True))
  for row in [self.tx.inspect(self.newweb['id']),self.media.owned()]:self.tx.run(['docker','update','--restart=unless-stopped',row['Id']])
  self.newweb=public_identity(self.tx.inspect(self.newweb['id']))
  self.canon['activeStaged103ReleaseId']=RID
  self.phase('WEB_DEPLOYED_WORKER_HANDOFF_PENDING',web=self.newweb,worker=self.newworker,media=public_identity(self.media.owned()),oldWorkerPreserved=True,oldAppPreserved=True,
     configurationUnchanged=True,taskPreservationVerified=True,retiredUiCount=len(self.retired),availableMiB=available(),supplierGenerationCalls=0)
  self.tx.save('FINAL_STATUS.json',self.record)

 def rollback(self):
  # Start retained exact old UI containers before re-exposing their origins.
  for old in self.retired:
   row=self.tx.inspect(old['Id']);require(row['Image']==old['Image'],'ROLLBACK_IMAGE_CHANGED')
   if not row['State']['Running']:self.tx.run(['docker','start',old['Id']])
   self.tx.run(['docker','update','--restart='+old['HostConfig']['RestartPolicy']['Name'],old['Id']])
  if self.switched:
   r=self.inverse;afterfiles={p['path']:self.before[p['path']]for p in r['patches']}
   b={p:self.after.get(p,self.before[p])for p in self.before}
   controls.switch_gateway_bundle(self.tx,r,b,afterfiles,expected_dump_sha=sha(self.afterdump.encode()),logical_to_real=self.real)
  if self.newweb:controls.control_app(self.tx,self.newweb,'drain',str(uuid.uuid4()))
  if self.media and self.media.owned()['State']['Running']:self.media.mode('drain')
  self.phase('ROLLED_BACK_ENTRY',databaseRestored=False,tasksReplayed=False)

def main():
 with HostTransaction(TARGET,MACHINE,ROOT/'transaction')as tx:
  release=Release(tx)
  try:
   release.prepare();release.candidate();release.acceptance();release.assets_gateway();release.switch();release.finish()
  except BaseException as ex:
   release.record['errorType']=type(ex).__name__;release.record['error']=str(ex) if isinstance(ex,Hold)else 'INSPECT_PRIVATE_FAILURE'
   release.persist()
   if release.switched:release.rollback()
   raise

if __name__=='__main__':main()
