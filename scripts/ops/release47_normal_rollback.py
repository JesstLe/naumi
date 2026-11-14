"""Configured normal-release program/ingress rollback; never restores DB or retries jobs.

Default --check is read-only. --apply refuses new unknown/active execution,
starts the two pinned prior slots beside the current version, verifies existing
login and DB, then uses the full inverse config CAS and graceful retirement.
"""
import argparse,contextlib,copy,json,pathlib,sys,time,uuid
from types import SimpleNamespace
from release47_host import HostTransaction,require,public_identity,environment,sha,file_sha,Hold
from release47_controls import control_app,app_status,switch_gateway_bundle,_replace_config,_atomic_private,clone_worker,start_worker
from release47_recovery_supervisor import Adapter,encoded,recovery_binding,static_pin
import worker_handoff
import release47_video_profile_guard as video_profile_guard
import release47_normal_policy as normal

ROOT=None
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
HOST='eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'

def run(config,apply=False,existing_tx=None):
 global ROOT
 require(not config.get('releaseId','').startswith('release47-saas-') and
         config.get('recoveryMode')!='saas-controlled-maintenance',
         'SAAS_REQUIRES_CONTROLLED_RECOVERY_NOT_PRIOR_PROGRAM')
 ROOT=pathlib.Path(config['evidenceRoot'])
 require(ROOT.parent==pathlib.Path('/opt/naumi-staging/evidence'),'FIXED_ROLLBACK_EVIDENCE_REQUIRED')
 with contextlib.ExitStack() as stack:
  if existing_tx:tx=existing_tx
  else:
   for attempt in range(30):
    try:tx=stack.enter_context(HostTransaction('47.105.59.142',HOST,ROOT/'rollback-check'));break
    except BlockingIOError:
     if attempt==29:raise
     time.sleep(1)
  original=CANON.read_bytes();s=json.loads(original);succ=s['normalBlueGreenReleases'][config['releaseId']];require(succ['phase'] in (['COMPLETE'] if apply else ['WORKER_ACTIVE','COMPLETE']),'EXACT_NORMAL_SUCCESSOR_REQUIRED')
  m=json.loads((ROOT/'supervisor-manifest.json').read_bytes());recovery_binding(s,m);a=Adapter(tx,m)
  for role in ['web','worker']:
   row=a.inspect(m[role]);require(row['State']['Running'],'CURRENT_SLOT_NOT_RUNNING')
  old=json.loads((ROOT/'transaction/original-canonical-exact.json').read_bytes());prior=old['runtimeRecovery'];pm=json.loads(pathlib.Path(prior['manifestPath']).read_bytes())
  if config.get('nasRollbackManifestPath'):
   # After media eviction the local-only old slot is not a usable fallback.
   # Bind the separately tested, paused same-prior-image NAS-compatible slot.
   path=pathlib.Path(config['nasRollbackManifestPath'])
   require(path.parent==ROOT and file_sha(path)==config.get('nasRollbackManifestSha256'),'NAS_ROLLBACK_MANIFEST_CHANGED')
   alternate=json.loads(path.read_bytes())
   require(alternate['image']==pm['image'] and alternate['commit']==pm['commit'] and
           alternate['worker']==pm['worker'],'NAS_ROLLBACK_PRIOR_VERSION_CHANGED')
   r=tx.inspect(alternate['web']['id']);e=environment(r)
   require(static_pin(r)==alternate['web']['staticSha256'] and e.get('STORAGE_DRIVER')=='s3'and
           e.get('MEDIA_REMOTE_ACCESS')=='proxy'and e.get('S3_ENDPOINT')=='http://172.18.0.1:13947',
           'NAS_ROLLBACK_STORAGE_CHANGED')
   pm=alternate;prior=copy.deepcopy(prior)
   prior.update(manifestPath=str(path),manifestSha256=sha(encoded(pm)),operationId=pm['operationId'])
  for role in ['web','worker']:
   row=tx.inspect(pm[role]['id']);require(not row['State']['Running'] and row['Image']==pm['image'] and row['HostConfig']['RestartPolicy']['Name']=='no','PRIOR_SLOT_BASELINE_CHANGED')
  backup=json.loads((ROOT/'transaction/backup-readable.json').read_bytes());require(file_sha(backup['path'])==backup['sha256'],'BACKUP_CHANGED')
  report=json.loads((ROOT/'gateway-forward/report.json').read_bytes());require(sha(tx.run(['nginx','-T']))==report['afterDumpSha256'],'CURRENT_GATEWAY_CHANGED')
  from release_client_compat import Dump
  before_dump=(ROOT/'gateway-forward/nginx.before.txt').read_text();after_dump=(ROOT/'gateway-forward/nginx.after.txt').read_text()
  # Exact source preimages are recovered from the original capture, not guessed
  # by stripping arbitrary whitespace from nginx -T.
  inverse=json.loads((ROOT/'transaction/gateway-rollback.json').read_bytes())
  before={};after={}
  for name in Dump(after_dump).files:
   disk=pathlib.Path(name).read_bytes();require(Dump(after_dump).files[name] in [disk.decode(),disk.decode()+'\n'],'CURRENT_CONFIG_BYTES_CHANGED');before[name]=disk
  for patch in report['patches']:
   after[patch['path']]=(ROOT/'gateway-forward'/patch['before']).read_bytes()
   require(sha(after[patch['path']])==patch['beforeSha256'],'ROLLBACK_CONFIG_HASH_CHANGED')
  result={'check':'PASS','fixedPriorImage':pm['image'],'currentImage':m['image'],'databaseBackupReadable':True,'inverseGatewayHashesVerified':True,'priorSlotsStopped':True,'historicalIncidentsPreserved':True,'productionCutbackExecuted':False,
          'isolatedUnknownScannerRetained':bool(config.get('preservedWorkerTick')),'priorWorkerRecovery':'fresh-same-prior-image-worker' if config.get('preservedWorkerTick') else 'resume-prior-worker'}
  video_proof=video_profile_guard.check_live(tx,config,prior=pm['web'])
  if existing_tx or apply:tx.save('video-profile-rollback-check-'+uuid.uuid4().hex+'.json',video_proof)
  video_profile_guard.enforce(video_proof)
  result['videoProfileCompatibility']=video_proof
  if not apply:
   if existing_tx:tx.save('nas-normal-rollback-check.json' if config.get('nasRollbackManifestPath') else 'normal-rollback-check.json',result)
   print('SERVER_ROLLBACK_CHECK='+json.dumps(result),flush=True);return result
  if config.get('nasRollbackManifestPath'):
   # New plans freeze an admitted supplier set. A prior executable does not
   # understand that field, so never hand an unfinished new plan to its Worker.
   db=tx.inspect('naumi-staging-db-1');e=environment(db)
   query="""BEGIN READ ONLY;SET LOCAL statement_timeout='5s';
SELECT json_build_object('jobs',(SELECT count(*) FROM app_image_jobs j WHERE
 COALESCE(snapshot->>'status','')NOT IN('done','error')AND
 (jsonb_path_exists(to_jsonb(j),'$.**.channelContractVersion ? (@ == 1)')OR jsonb_path_exists(to_jsonb(j),'$.**.imageUpstreamIds'))),
 'batches',(SELECT count(*)FROM app_imagegen_batches b WHERE state NOT IN('succeeded','partial','failed','cancelled')AND jsonb_path_exists(to_jsonb(b),'$.**.channelContractVersion ? (@ == 1)')));COMMIT;"""
   pending=json.loads(tx.run(['docker','exec','-i',db['Id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',e['POSTGRES_USER'],'-d',e['POSTGRES_DB']],stdin=query.encode()))
   require(pending=={'jobs':0,'batches':0},'NEW_SUPPLIER_CONTRACT_REQUIRES_COMPATIBLE_EXECUTOR_NOT_OLD_WORKER')
  # Persist one operation and use its exact UUID bodies on all uncertain IO.
  journal=ROOT/'rollback-operation.json';require(not journal.exists(),'EXISTING_ROLLBACK_RECONCILE_REQUIRED')
  log={'phase':'INTENT_RECORDED','operationId':str(uuid.uuid4()),'originalCanonicalSha256':sha(original),'steps':{}};_atomic_private(journal,log)
  def step(name,fn):
   op=str(uuid.uuid4());log['steps'][name]={'id':op,'phase':'INTENT_RECORDED'};_atomic_private(journal,log)
   try:r=fn(op)
   except BaseException:log['steps'][name]['phase']='UNKNOWN';_atomic_private(journal,log);raise
   log['steps'][name].update(phase='ACKNOWLEDGED',result=r);_atomic_private(journal,log);return r
  def wc(spec,action,operation):
   r=tx.inspect(spec['id']);e=environment(r);folder=ROOT/('rollback-worker-'+spec['id'][:12]);folder.mkdir(mode=0o700,exist_ok=True)
   args=SimpleNamespace(container=spec['id'],expected_id=spec['id'],expected_image=r['Image'],expected_commit=e['SOURCE_COMMIT'],expected_origin=e['NAUMI_APP_ORIGIN'],action=action,operation_id=operation,tick_id=None,require_media_worker=e.get('NAUMI_MEDIA_WORKER')=='1' or config.get('reviewedCombinedMedia') is True and spec['id']==m['worker']['id'])
   return worker_handoff.execute(args,folder,lambda argv:tx.run(argv).decode())
  def wait(fn,label):
   for _ in range(90):
    try:
     v=fn()
     if v:return v
    except Hold:pass
    time.sleep(1)
   raise Hold(label)
  step('worker-drain',lambda op:wc(m['worker'],'drain',op));wait(lambda:normal.worker_quiescent(wc(m['worker'],'status',str(uuid.uuid4()))['state']),'WORKER_DRAIN_PENDING')
  current=public_identity(tx.inspect(m['web']['id']));step('web-drain',lambda op:control_app(tx,current,'drain',op))
  def drained():
   app=app_status(tx,current);obs=app['observations'];t=app['transport']['transport'];require(obs['unknownLeases']==0,'NEW_UNKNOWN_WORK_BLOCKS_ROLLBACK')
   js="const r=await fetch('http://127.0.0.1:3000/api/video/worker/drain-status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}});console.log(JSON.stringify(await r.json()));"
   domain=json.loads(tx.run(['docker','exec','-e','NODE_OPTIONS=',current['id'],'node','--input-type=module','-e',js]));return domain['drained'] and obs['agentRuns']==0 and obs['trackedAcceptedWork']==0 and t['activeRequests']==0
  wait(drained,'CURRENT_EXECUTION_DRAIN_PENDING')
  # Recheck after admission/ticks are paused: a task may have arrived since --check.
  try:video_proof=video_profile_guard.check_live(tx,config,prior=pm['web'])
  except (Hold,ValueError,KeyError,TypeError) as error:
   video_proof={'safe':False,'kind':'video-profile-program-rollback-compatibility',
                'errorCode':str(error) if isinstance(error,Hold) else type(error).__name__}
  tx.save('video-profile-rollback-drained-'+uuid.uuid4().hex+'.json',video_proof)
  def retain_compatible_executor():
   step('video-profile-hold-current-web-resume',lambda op:control_app(tx,current,'resume',op))
   step('video-profile-hold-current-worker-resume',lambda op:wc(m['worker'],'resume',op))
   log.update(phase='BLOCKED_COMPATIBLE_EXECUTOR_RETAINED',videoProfileCompatibility=video_proof)
   _atomic_private(journal,log)
  video_profile_guard.enforce(video_proof,retain_compatible_executor)
  available=int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))//1024;require(available>=3200,'ROLLBACK_DUAL_SLOT_MEMORY_INSUFFICIENT')
  tx.run(['systemctl','stop','naumi47-recovery.timer'])
  olda=Adapter(tx,pm)
  for role in (['web'] if config.get('preservedWorkerTick') else ['web','worker']):
   step('start-prior-'+role,lambda _,role=role:(tx.run(['docker','start',pm[role]['id']]).decode()))
   wait(lambda:olda.status(pm[role]),'PRIOR_READY')
  if config.get('preservedWorkerTick'):
   # Never resume an unresolved old scanner. A fresh paused Worker uses the
   # exact prior image and respects the retained needs_attention job fences.
   prior_web=public_identity(tx.inspect(pm['web']['id']))
   fresh=step('create-fresh-prior-worker',lambda _:clone_worker(tx,prior_web,name=config['newWorkerName']+'-rollback',memory_mib=128,cpu=.25,state_dir=config['stateDir']+'/rollback-worker'))
   fresh=step('start-fresh-prior-worker',lambda _:start_worker(tx,fresh,available))
   pm['worker']={**fresh,'role':'worker','staticSha256':static_pin(tx.inspect(fresh['id'])),'memoryMiB':128,'runningAtEnrollment':True}
   wait(lambda:olda.status(pm['worker']),'FRESH_PRIOR_WORKER_READY')
  olda.readiness(pm['web']);oldweb=public_identity(tx.inspect(pm['web']['id']));step('prior-web-open',lambda op:control_app(tx,oldweb,'resume',op))
  step('gateway-inverse',lambda _:switch_gateway_bundle(tx,inverse,before,after,expected_dump_sha=report['afterDumpSha256'],logical_to_real={n:str(pathlib.Path(n).resolve()) for n in before}))
  step('prior-worker-resume',lambda op:wc(pm['worker'],'resume',op))
  wait(lambda:normal.worker_completed(olda.status(pm['worker'])),'PRIOR_TICK_RECEIPT_PENDING')
  wait(drained,'SUCCESSOR_WORK_REAPPEARED')
  wait(lambda:normal.worker_quiescent(wc(m['worker'],'status',str(uuid.uuid4()))['state']),'SUCCESSOR_MEDIA_WORK_REAPPEARED')
  for role in ['worker','web']:
   step('stop-successor-'+role,lambda _,role=role:tx.run(['docker','stop','--time=-1',m[role]['id']],timeout=120).decode())
  require(CANON.read_bytes()==original,'CANONICAL_CAS_CHANGED')
  s['runtimeRecovery']=copy.deepcopy(prior)
  for role in ['web','worker']:
   identity=public_identity(tx.inspect(pm[role]['id']));s['runtimeRecovery']['effective'+role.title()]=identity
   if role=='web':s['webs']['main']['running']=identity
   else:s['worker']['running']=identity
  succ.update(phase='ROLLED_BACK',rollbackOperationId=log['operationId']);s['activeNormalBlueGreenReleaseId']=config.get('previousNormalReleaseId');s['revision']+=1;_atomic_private(CANON,s)
  unit=(ROOT/'transaction/original-supervisor.service').read_text()
  if config.get('nasRollbackManifestPath'):
   original_path=old['runtimeRecovery']['manifestPath']
   unit=unit.replace(original_path,prior['manifestPath']).replace(
      str(pathlib.Path(original_path).parent/'release47_recovery_supervisor.py'),str(ROOT/'tools/release47_recovery_supervisor.py'))
  if config.get('preservedWorkerTick'):
   pm['operationId']=str(uuid.uuid4());path=ROOT/'rollback-supervisor-manifest.json';_atomic_private(path,pm)
   s['runtimeRecovery'].update(operationId=pm['operationId'],manifestPath=str(path),manifestSha256=sha(encoded(pm)))
   unit=unit.replace(prior['manifestPath'],str(path));s['revision']+=1;_atomic_private(CANON,s)
  _replace_config(pathlib.Path('/etc/systemd/system/naumi47-recovery.service'),unit.encode());tx.run(['systemctl','daemon-reload']);tx.run(['systemctl','start','naumi47-recovery.timer'])
  log.update(phase='ACKNOWLEDGED',databaseRestored=False,tasksReplayed=False);_atomic_private(journal,log);print('SERVER_ROLLBACK=PASS PROGRAM_AND_GATEWAY_ONLY DB_RESTORED=NO TASKS_REPLAYED=NO')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--config',type=pathlib.Path,required=True);p.add_argument('--apply',action='store_true');a=p.parse_args();run(json.loads(a.config.read_bytes()),a.apply)
