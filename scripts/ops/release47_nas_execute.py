"""One finite NAS-backed normal release, using the existing canonical journal.

Invoked only from a private reviewed monitor request. All host writes share the
normal three locks. Unknown paid tasks are retained as explicit incidents.
"""
import copy,datetime as dt,hashlib,json,os,pathlib,sys,time,uuid
import release47_normal_controller as ctl
import release47_controls as controls
import release47_normal_policy as normal
from release47_host import HostTransaction,require,environment,public_identity,sha,file_sha
from release47_quarantine_dead_boot import execute as isolate,NAS_CONTINUATION

ROOT=pathlib.Path('/opt/naumi-staging/evidence/nas47-finish-20261020')
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
RID='release47-nas-s3first-20261020'

def finalize_media(tx,cfg):
 proof=ROOT/'final-media-proof';proof.mkdir(mode=0o700,exist_ok=True)
 name='naumi47-nas-final-readback-20261020'
 if name in tx.run(['docker','ps','-a','--format','{{.Names}}']).decode().splitlines():
  old=tx.inspect(name)
  require(not old['State']['Running'] and old['Config']['Cmd']==['node','/finalize.cjs'] and
          any(m['Destination']=='/work'and m['Source']==str(proof)for m in old['Mounts']), 'FINALIZER_STILL_ACTIVE_OR_CHANGED')
  tx.save('completed-initial-finalizer.json',public_identity(old));tx.run(['docker','rm',old['Id']])
 args=['docker','run','--rm','--name','naumi47-nas-final-readback-20261020','--network','naumi47_staging',
       '--memory=192m','--memory-swap=192m','--cpus=.35','--pids-limit=64','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=8m',
       '--cap-drop=ALL','--cap-add=DAC_OVERRIDE','--security-opt=no-new-privileges','--user','0:0','-e','NODE_OPTIONS=']
 mounts={cfg['mediaSource']:('/media',True),str(proof):('/work',False),
  '/root/.nas47-garage.json':('/creds.json',True),str(ROOT/'tools/nas47_finalize_media.cjs'):('/finalize.cjs',True),
  '/opt/naumi-staging/evidence/nas47-full-verification-20261020/proof-r2':('/initial',True),
  '/opt/naumi-staging/evidence/nas47-ops-20261020-remote':('/migration',True),
  '/opt/naumi-staging/evidence/nas47-tail-copy-20261020/proof':('/tail',True)}
 for source,(dest,ro)in mounts.items():args+=['--mount','type=bind,src='+source+',dst='+dest+(',readonly'if ro else'')]
 args += [cfg['oldWeb']['image'],'node','/finalize.cjs']
 raw=tx.run(args,timeout=1800);receipt=json.loads(raw);require(receipt['phase']=='ALL_BYTES_VERIFIED','FINAL_MEDIA_READBACK_FAILED')
 tx.save('FINAL_MEDIA_READBACK-'+str(uuid.uuid4())+'.json',receipt);return receipt

def decode_rows(raw):
 dec=json.JSONDecoder();s=raw.decode();out=[]
 while s.strip():v,n=dec.raw_decode(s.lstrip());s=s.lstrip()[n:];out.append(v)
 return out

class NasController(ctl.Controller):
 def sql(self,query):
  raw=self.tx.run(['docker','exec','-i',self.db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=("BEGIN READ ONLY;SET LOCAL statement_timeout='15s';"+query+'COMMIT;').encode(),timeout=60)
  return decode_rows(raw)

 def check_paid_incidents(self):
  saved=json.loads((ROOT/'isolation/quarantine-original.private.json').read_bytes());old={j['id']:j for j in saved['jobs']}
  ids=','.join("'"+i+"'"for i in old)
  jobs=self.sql("SELECT json_build_object('jobs',json_agg(to_jsonb(j)))FROM app_image_jobs j WHERE id IN("+ids+");")[0]['jobs']
  bills=self.sql("SELECT json_build_object('bills',json_agg(to_jsonb(b)))FROM app_billing_operations b WHERE id IN("+ids+");")[0]['bills']
  require({b['id']:b for b in bills}=={b['id']:b for b in saved['billing']},'NAS_PAID_BILLING_CHANGED')
  require(len(jobs)==13,'NAS_PAID_JOB_SET_CHANGED')
  for j in jobs:
   original=old[j['id']]
   require(j['snapshot']['status']=='needs_attention' and j['snapshot']['releaseQuarantine']['releaseId']==self.cfg.get('preservedPaidReleaseId',RID),'NAS_PAID_QUARANTINE_CHANGED')
   require(j['snapshot']['paidOperations']==original['snapshot']['paidOperations'],'NAS_PAID_RECEIPT_CHANGED')
   for k in ['payload','lease_token','lease_until','cost','reserved_cost','billing_settled']:
    require(j[k]==original[k],'NAS_PAID_FROZEN_FIELD_CHANGED')
  return {'jobs':13,'billingUnchanged':True,'paidReceiptsUnchanged':True,'supplierRetries':0}

 def drain_proof(self):
  result=super().drain_proof();result['preservedNewPaidIncidents']=self.check_paid_incidents()
  if self.old_drained and not getattr(self,'final_tail_closed',False):
   finalize_media(self.tx,self.cfg);self.sync_media_catalog();self.final_tail_closed=True
  return result

 def ready(self):
  result=super().ready();row=self.tx.inspect(self.newweb['id']);env=environment(row)
  require(env.get('STORAGE_DRIVER')=='s3' and env.get('MEDIA_REMOTE_ACCESS')=='proxy' and env.get('MEDIA_PRIVATE')=='1','ACTUAL_NAS_PROXY_BINDING_MISSING')
  # Actual plan-only admission and private storage verification are bound by the
  # browser receipt; no generation test or replay is introduced here.
  spec={'cookie':self.cookie,'releaseId':RID}
  script=ROOT/'tools/nas47_storage_acceptance.cjs'
  raw=self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',self.newweb['id'],'node','-e',script.read_text()],stdin=json.dumps(spec).encode(),timeout=180)
  proof=json.loads(raw);require(proof.get('passed') and proof.get('verificationDataCleaned'),'ACTUAL_NAS_UPLOAD_ACCEPTANCE_FAILED');self.tx.save('actual-nas-storage-acceptance.json',proof)
  result['actualNasStorage']=proof
  return result

 def sync_media_catalog(self):
  tag='-'+str(uuid.uuid4())
  proof=ROOT/'final-media-proof'
  summary=json.loads((proof/'SUMMARY.json').read_bytes())
  require(summary.get('phase')=='ALL_BYTES_VERIFIED' and all(summary.get(k)==0 for k in ['errors','missing','mismatch','changed']), 'FULL_NAS_BYTES_NOT_VERIFIED')
  rows={}
  for line in (proof/'verified-files.jsonl').read_text().splitlines():
   item=json.loads(line)
   if item.get('op')=='verified':rows[item['key']]={'key':item['key'],'sha':item['sha256'],'bytes':item['size']}
  require(len(rows)==summary['files'],'VERIFIED_MEDIA_SET_INCOMPLETE')
  raw=self.tx.run(['docker','exec','-i',self.db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=b"BEGIN READ ONLY;SELECT coalesce(json_agg(to_jsonb(a)),'[]')FROM app_media_assets a;COMMIT;",timeout=60)
  self.tx.save('media-catalog-before'+tag+'.private.json',json.loads(raw))
  payload=json.dumps(list(rows.values()),separators=(',',':'))
  require('$nasmedia$'not in payload,'MEDIA_INPUT_DELIMITER')
  sql="""BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
CREATE TEMP TABLE nas_verified(key text PRIMARY KEY,sha text,bytes bigint)ON COMMIT DROP;
INSERT INTO nas_verified SELECT * FROM jsonb_to_recordset($nasmedia$%s$nasmedia$::jsonb)AS x(key text,sha text,bytes bigint);
DO $check$ BEGIN IF EXISTS(SELECT 1 FROM nas_verified v JOIN app_media_assets a USING(key)WHERE a.sha256<>v.sha OR a.bytes<>v.bytes)THEN RAISE EXCEPTION 'MEDIA_CATALOG_BYTES_CONFLICT';END IF;END $check$;
INSERT INTO app_media_assets(key,owner,public,driver,remote_ready,content_type,sha256,bytes)
SELECT key,NULL,key~'^(brand|library|templates|template-cache)/','s3',true,
CASE lower(regexp_replace(key,'^.*[.]',''))WHEN 'png'THEN'image/png'WHEN'jpg'THEN'image/jpeg'WHEN'jpeg'THEN'image/jpeg'WHEN'webp'THEN'image/webp'WHEN'mp4'THEN'video/mp4'WHEN'webm'THEN'video/webm'ELSE'application/octet-stream'END,sha,bytes FROM nas_verified
ON CONFLICT(key)DO UPDATE SET driver='s3',remote_ready=true;
SELECT json_build_object('verifiedFiles',count(*),'catalogReady',count(*)FILTER(WHERE a.remote_ready AND a.driver='s3'AND a.sha256=v.sha AND a.bytes=v.bytes))FROM nas_verified v JOIN app_media_assets a USING(key);
COMMIT;""" % payload
  self.tx.save('media-catalog-REQUEST'+tag+'.private.sql',sql.encode())
  raw=self.tx.run(['docker','exec','-i',self.db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=sql.encode(),timeout=90)
  result=json.loads(raw);require(result['catalogReady']==len(rows),'CATALOG_NOT_ALL_READY');self.tx.save('media-catalog-RECEIPT'+tag+'.json',result)

 def maintenance_and_import(self):
  super().maintenance_and_import()
  self.op('nas-media-catalog',lambda _:self.sync_media_catalog())

 def resume_review(self):
  super().resume_review()
  if 'nas-media-catalog'not in self.succ['operations']:
   self.op('nas-media-catalog',lambda _:self.sync_media_catalog())

 def finish_ready(self):
  # Old Web is still serving during candidate verification; close that final
  # read-only-source delta before changing routing. Existing evidence avoids a
  # second full40GB download. A changed source fails rather than being guessed.
  finalize_media(self.tx,self.cfg);self.sync_media_catalog()
  return super().finish_ready()

 def install_supervisor(self):
  super().install_supervisor()
  # Enroll the exact S3 environment already pinned in staticSha256; no old boot
  # is represented as drained/recovered.
  self.tx.save('nas-paid-preservation-final.json',self.check_paid_incidents())

 def prepare_nas_rollback(self):
  from release47_recovery_supervisor import static_pin
  name='naumi47-web-nas-compatible-rollback-20261020'
  prior_env=environment(self.tx.inspect(self.web['id']))
  prior= self.tx.clone_web(self.newweb,name=name,port=13105,image=self.web['image'],commit=prior_env['SOURCE_COMMIT'],
      memory_mib=2048,cpu=1,release_secret=__import__('secrets').token_urlsafe(48),
      state_dir=self.cfg['stateDir']+'/nas-rollback-web',build_version=prior_env['BUILD_VERSION'],
      reviewed_prior_state_dir=self.cfg['stateDir']+'/web',reviewed_nas_credentials_sha256=self.cfg['nasCredentialsSha256'])
  available=int(next(l.split()[1]for l in pathlib.Path('/proc/meminfo').read_text().splitlines()if l.startswith('MemAvailable:')))//1024
  prior=self.tx.start_candidate(prior,dict(webPeakMiB=2048,workerPeakMiB=128,hostReserveMiB=1024),available)
  self.wait(lambda:self.request(prior,'/api/health'),'NAS_COMPATIBLE_PRIOR_WEB',120)
  require(self.request(prior,'/api/version')=={'commit':prior_env['SOURCE_COMMIT'],'version':prior_env['BUILD_VERSION']},'NAS_ROLLBACK_BUILD_CHANGED')
  input={'cookie':self.cookie,'releaseId':RID,'compatibleOrigin':'http://'+name+':3000'}
  raw=self.tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',self.newweb['id'],'node','-e',(ROOT/'tools/nas47_storage_acceptance.cjs').read_text()],stdin=json.dumps(input).encode(),timeout=180)
  check=json.loads(raw);require(check.get('passed')and check.get('priorNasCompatibleRead')and check.get('verificationDataCleaned'),'NAS_COMPATIBLE_ROLLBACK_NOT_PROVEN')
  app=controls.app_status(self.tx,prior);obs=app['observations'];require(app['admission']['mode']=='draining'and all(obs[k]==0 for k in ['trackedAcceptedWork','agentRuns','unknownLeases']),'ROLLBACK_TEST_ACTIVE_WORK')
  self.tx.run(['docker','stop','--time=-1',prior['id']],timeout=120)
  row=self.tx.inspect(prior['id']);require(not row['State']['Running'],'ROLLBACK_WEB_NOT_STOPPED')
  manifest=copy.deepcopy(self.original_manifest);manifest.update(operationId=str(uuid.uuid4()))
  manifest['web']={**public_identity(row),'role':'web','staticSha256':static_pin(row),'memoryMiB':2048,'runningAtEnrollment':True}
  p=ROOT/'nas-compatible-prior-manifest.json';ctl.save(p,manifest)
  self.cfg.update(nasRollbackManifestPath=str(p),nasRollbackManifestSha256=file_sha(p))
  ctl.save(ROOT/'release-config-final.json',self.cfg);self.tx.save('nas-compatible-rollback-test.json',check)
  from release47_normal_rollback import run
  run(self.cfg,apply=False,existing_tx=self.tx)

def main():
 global ROOT,RID
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--config',type=pathlib.Path);args=parser.parse_args()
 cfg=json.loads((args.config or ROOT/'release-config.json').read_bytes());ROOT=pathlib.Path(cfg['evidenceRoot']);RID=cfg['releaseId'];ctl.configure(cfg)
 # Timers can cross midnight, so authorize the actual execution date, not an
 # expired historical release appointment.
 cfg['date']=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
 with ctl.transaction()as tx:
  resume=bool(cfg.get('resumeReview'))
  require(resume or not (ROOT/'transaction/controller-STARTED.json').exists(),'EXISTING_NAS_RELEASE_RECONCILE_REQUIRED')
  s=json.loads(CANON.read_bytes())
  if not resume:require(s['revision']==cfg['expectedRevision'] and sha(ctl.enc(s))==cfg['expectedCanonicalDigest'],'FRESH_BASELINE_CHANGED')
  web=public_identity(tx.inspect(cfg['oldWeb']['id']));require(web==cfg['oldWeb'],'OLD_WEB_RESTARTED')
  app=controls.app_status(tx,web);require(app['identity']['bootId']==cfg['reviewedBoot'],'OLD_BOOT_CHANGED')
  require(app['observations']['trackedAcceptedWork']==0 and app['observations']['agentRuns']==0,'CURRENT_LIVE_WORK_DURING_ISOLATION')
  if not resume and not cfg.get('priorIsolationEvidence'):
   finalize_media(tx,cfg)
   saved=ROOT/'isolation';saved.mkdir(mode=0o700,exist_ok=False);prior=tx.folder
   try:
    tx.folder=saved;tx.backup_database(public_identity(tx.inspect('naumi-staging-db-1')))
    db=tx.inspect('naumi-staging-db-1');e=environment(db)
    q="SELECT json_build_object('jobs',json_agg(to_jsonb(j)))FROM app_image_jobs j WHERE id IN("+','.join("'"+i+"'"for i in cfg['reviewedPaidJobIds'])+");"
    raw=tx.run(['docker','exec','-i',db['Id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',e['POSTGRES_USER'],'-d',e['POSTGRES_DB']],stdin=('BEGIN READ ONLY;'+q+'COMMIT;').encode())
    jobs=json.loads(raw)['jobs'];require(len(jobs)==13,'EXACT_13_JOBS_CHANGED')
    spec={'authorization':NAS_CONTINUATION,'releaseId':RID,'web':web,'oldBoot':'236cc455-8cf8-4e37-ace9-b840242ee5d4','newBoot':cfg['reviewedBoot'],'expectedJobs':13,'expectedActivities':16,'reviewedJobIds':cfg['reviewedPaidJobIds'],'reviewedJobHashes':{j['id']:hashlib.sha256(json.dumps(j,sort_keys=True,separators=(',',':')).encode()).hexdigest()for j in jobs}}
    result=isolate(tx,spec,app)
   finally:tx.folder=prior
   ctl.save(ROOT/'isolation-result.json',result)
  elif not resume:
   prior=pathlib.Path(cfg['priorIsolationEvidence']);require(prior==pathlib.Path('/opt/naumi-staging/evidence/nas47-finish-20261020'),'EXACT_PRIOR_ISOLATION_REQUIRED')
   require(json.loads((prior/'isolation-result.json').read_bytes())==json.loads((ROOT/'isolation-result.json').read_bytes()),'PRIOR_ISOLATION_RECEIPT_CHANGED')
   require(cfg.get('preservedPaidReleaseId')=='release47-nas-s3first-20261020','PRIOR_PAID_QUARANTINE_ID_CHANGED')
   import shutil
   saved=ROOT/'isolation';saved.mkdir(mode=0o700,exist_ok=False)
   shutil.copyfile(prior/'isolation/quarantine-original.private.json',saved/'quarantine-original.private.json');(saved/'quarantine-original.private.json').chmod(0o600)
   previous=tx.folder
   try:tx.folder=saved;tx.backup_database(public_identity(tx.inspect('naumi-staging-db-1')))
   finally:tx.folder=previous
  require(controls.app_status(tx,web)['observations']['unknownLeases']==0,'ISOLATION_NOT_OBSERVED')
  # Only the exact dead-boot observations were closed. Paid tasks remain fenced.
  if not resume:ctl.save(ROOT/'transaction/controller-STARTED.json',{'at':ctl.now(),'releaseId':RID})
  operator=NasController(tx,cfg)
  if resume:operator.check_paid_incidents()
  # One readable baseline dump covers this one transaction. Do not create a
  # second400MB copy after the only intervening change (documented isolation).
  backup=json.loads((ROOT/'isolation/backup-readable.json').read_bytes())
  require(file_sha(backup['path'])==backup['sha256'],'BASELINE_DUMP_CHANGED')
  def reuse_backup(identity):
   require(identity['id']==operator.db['id'],'BACKUP_DATABASE_CHANGED')
   return tx.save('backup-readable.json',backup)
  tx.backup_database=reuse_backup
  worker=operator.worker_control(operator.worker,'status',str(uuid.uuid4()))['state']
  if worker.get('unresolvedTicks'):
   require(worker['unresolvedTicks']==1 and worker['activeTicks']==0 and worker['phase']=='UNKNOWN','UNREVIEWED_WORKER_ACTIVITY')
   tick=worker['lastTick'];cfg['preservedWorkerTick']={**tick,'authorization':'赶紧的切换，磨磨唧唧的，遵循指令好吗','domainJobsQuarantined':13,'quarantinedJobIds':cfg['reviewedPaidJobIds'],'isolationReceiptSha256':file_sha(ROOT/'isolation-result.json'),'paidReplayAllowed':False}
  ctl.save(ROOT/'release-config-final.json',cfg)
  try:operator.run()
  except BaseException as ex:operator.recover_failure(ex);raise
  receipt=json.loads((ROOT/'transaction/PUBLICATION_RECEIPT.json').read_bytes())
  require(receipt['phase']=='COMPLETE','PUBLICATION_NOT_COMPLETE')
  require((operator.request(operator.newweb,'/api/version')or{}).get('commit')==cfg['commit'],'FINAL_VERSION_CHANGED')
  operator.check_paid_incidents()
  operator.prepare_nas_rollback()
  from nas47_evict_verified import execute as evict
  deletion=evict(operator)
  # Recheck the same authenticated historical media SHA proofs after local
  # duplicate eviction; do not substitute a health200 for media acceptance.
  browser=json.loads((ROOT/'browser-after.json').read_bytes())
  require(len(browser.get('media',[]))>=3,'HISTORICAL_MEDIA_PROOF_REQUIRED')
  js="""const fs=require('fs'),crypto=require('crypto');(async()=>{const input=JSON.parse(fs.readFileSync(0,'utf8'));for(const item of input.media){const r=await fetch('http://127.0.0.1:3000'+item.url,{headers:{cookie:input.cookie},signal:AbortSignal.timeout(90000)}),b=Buffer.from(await r.arrayBuffer());if(r.status!==200||crypto.createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('POST_EVICTION_SHA');}console.log(JSON.stringify({passed:true,historicalMedia:input.media.length,supplierCalls:0}));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
  raw=tx.run(['docker','exec','-i','-e','NODE_OPTIONS=',operator.newweb['id'],'node','-e',js],stdin=json.dumps({'cookie':operator.cookie,'media':browser['media']}).encode(),timeout=300)
  after=json.loads(raw);require(after.get('passed'),'POST_EVICTION_MEDIA_FAILED');tx.save('POST_EVICTION_MEDIA_ACCEPTANCE.json',after)
  operator.check_paid_incidents()
  receipt.update(publicAcceptance=True,storageDriver='s3',mediaLocalDeletion=deletion,paid13Preserved=True,nasCompatibleRollbackTested=True,
                 postEvictionMediaAcceptance=after,mediaVerification=json.loads((ROOT/'final-media-proof/SUMMARY.json').read_bytes()))
  ctl.save(ROOT/'FINAL_RESULT.json',receipt)
 print('NAS_RELEASE_COMPLETE',flush=True)
if __name__=='__main__':main()
