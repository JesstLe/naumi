#!/usr/bin/env python3
"""Archive only six fixed historical central dumps; retain source until full NAS GET SHA matches."""
import argparse,contextlib,datetime,fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,time
ROOT=pathlib.Path('/opt/naumi-staging/evidence/central-backup-archive-20261124-r1')
EVIDENCE=ROOT.parent
CANON=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
CREDENTIALS=pathlib.Path('/root/.nas47-garage.json')
RELEASES=('release47-main-20261118-admin-local-r1','release47-main-20261118-admin-local-r2','release47-central-identity-20261119-r1','release47-central-ack-20261119-r1','release47-central-resume-20261119-r1','release47-cutout-quoted-20261120-r1')
DUMP='database-988fcfe5d343.dump'
PREFIX='backups/naumi47-central-identity/v1/'
HOST='eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
class Hold(Exception):pass
def require(ok,code):
 if not ok:raise Hold(code)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def read(p):return json.loads(pathlib.Path(p).read_bytes())
def sha(p):
 with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def atomic(p,value):
 p=pathlib.Path(p);tmp=p.with_name('.'+p.name+'.tmp')
 data=(json.dumps(value,sort_keys=True,ensure_ascii=False,indent=2)+'\n').encode()
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
 fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
 require(p.read_bytes()==data,'RECEIPT_REOPEN_FAILED')
def stat_facts(p):
 s=pathlib.Path(p).stat();return {'device':s.st_dev,'inode':s.st_ino,'bytes':s.st_size,'mtimeNs':s.st_mtime_ns}
def client(unsigned=False):
 import boto3,botocore.config,botocore
 require(CREDENTIALS.is_file() and not CREDENTIALS.is_symlink() and CREDENTIALS.stat().st_mode&0o777==0o600,'PRIVATE_CREDENTIAL_MODE')
 c=read(CREDENTIALS);require(c['endpointHost47']=='http://127.0.0.1:13947' and c['bucket']=='naumi47-media-20261020','NAS_ENDPOINT_OR_BUCKET_CHANGED')
 cfg=botocore.config.Config(signature_version=botocore.UNSIGNED if unsigned else 's3v4',s3={'addressing_style':'path'},connect_timeout=8,read_timeout=600,retries={'max_attempts':1})
 s=boto3.client('s3',endpoint_url=c['endpointHost47'],aws_access_key_id=None if unsigned else c['accessKeyId'],aws_secret_access_key=None if unsigned else c['secretAccessKey'],region_name=c.get('region') or 'garage',config=cfg)
 def conditional(params,**kwargs):params['headers']['If-None-Match']='*'
 s.meta.events.register('before-call.s3.PutObject',conditional)
 return s,c['bucket']
def source_path(release):
 require(release in RELEASES,'RELEASE_NOT_ALLOWLISTED');p=EVIDENCE/release/DUMP
 require(p.resolve()==p and not p.is_symlink(),'SOURCE_PATH_CHANGED');return p
def plan():
 require(not (ROOT/'PLAN.json').exists(),'PLAN_EXISTS_RECONCILE_REQUIRED')
 files=[]
 for release in RELEASES:
  p=source_path(release);proof=read(p.parent/'backup-readable.json')
  require(proof['path']==str(p) and proof['bytes']==p.stat().st_size and proof['bytes']>100*1024**2,'BACKUP_DESCRIPTOR_NOT_DUMP')
  require(p.read_bytes()[:5]==b'PGDMP' if p.stat().st_size<32 else p.open('rb').read(5)==b'PGDMP','BACKUP_MAGIC_INVALID')
  digest=sha(p);require(digest==proof['sha256'],'ORIGINAL_BACKUP_SHA_MISMATCH')
  with p.open('rb') as f:r=subprocess.run(['docker','exec','-i','naumi-staging-db-1','pg_restore','--list'],stdin=f,capture_output=True,timeout=120)
  require(r.returncode==0 and b'TABLE DATA' in r.stdout,'ORIGINAL_BACKUP_LIST_FAILED')
  files.append({'release':release,'path':str(p),'bytes':p.stat().st_size,'sha256':digest,'stat':stat_facts(p),'originalProofPath':str(p.parent/'backup-readable.json'),'originalProofSha256':sha(p.parent/'backup-readable.json'),'originalPgRestoreListSha256':hashlib.sha256(r.stdout).hexdigest(),'key':PREFIX+release+'/'+digest+'/'+DUMP,'locator':str(p)+'.nas.json'})
 _,bucket=client();s=read(CANON);data={'schemaVersion':1,'authorization':'User selected precise central historical backup NAS archival; full GET SHA before local release; database/media/other projects unchanged','createdAt':now(),'bucket':bucket,'credentialPath':str(CREDENTIALS),'files':files,'totalBytes':sum(x['bytes'] for x in files),'rootFreeBefore':shutil.disk_usage('/').free,'canonicalRevisionBefore':s['revision'],'canonicalSha256Before':sha(CANON),'retainedLocalBackups':[str(EVIDENCE/n/DUMP) for n in ['release47-layer-export-20261120-r1','release47-central-rendering-20261124-r1']],'scriptSha256':sha(__file__),'databaseRestoreExecuted':False,'nginxWrites':False,'timerPaused':False}
 atomic(ROOT/'PLAN.json',data);atomic(ROOT/'BASELINE_FILE.json',{'phase':'LOCAL_ONLY_REMOTE_UNVERIFIED','bucket':bucket,'files':[{**x,'storageLocation':'LOCAL','fullNasReadbackVerified':False,'localCopyReleased':False} for x in files]})
 print('ARCHIVE_PLAN_READY files='+str(len(files))+' bytes='+str(data['totalBytes']))
def load_plan():
 p=read(ROOT/'PLAN.json');require(p['schemaVersion']==1 and tuple(x['release'] for x in p['files'])==RELEASES,'EXACT_PLAN_CHANGED')
 for x in p['files']:require(x['path']==str(source_path(x['release'])) and x['key']==PREFIX+x['release']+'/'+x['sha256']+'/'+DUMP,'EXACT_PLAN_SCOPE_CHANGED')
 return p
def receipt_path(x):return ROOT/(x['release']+'.REMOTE_VERIFIED.json')
def object_head(s,bucket,x):
 try:return s.head_object(Bucket=bucket,Key=x['key'])
 except Exception as e:
  if getattr(e,'response',{}).get('ResponseMetadata',{}).get('HTTPStatusCode')==404:return None
  raise Hold('NAS_HEAD_FAILED')
def head_matches(h,x):return bool(h and h['ContentLength']==x['bytes'] and h.get('Metadata',{}).get('sha256')==x['sha256'])
def full_get(s,bucket,x,output=None):
 h=object_head(s,bucket,x);require(head_matches(h,x),'NAS_HEAD_BYTES_OR_METADATA_MISMATCH')
 r=s.get_object(Bucket=bucket,Key=x['key'],IfMatch=h['ETag']);require(r['ResponseMetadata']['HTTPStatusCode']==200 and r['ContentLength']==x['bytes'],'NAS_FULL_GET_STATUS_OR_LENGTH')
 digest=hashlib.sha256();total=0;body=r['Body']
 try:
  for chunk in iter(lambda:body.read(4*1024*1024),b''):
   total+=len(chunk);digest.update(chunk)
   if output:output.write(chunk)
 finally:body.close()
 require(total==x['bytes'] and digest.hexdigest()==x['sha256'],'NAS_FULL_GET_SHA_MISMATCH')
 after=object_head(s,bucket,x);require(head_matches(after,x) and after['ETag']==h['ETag'],'NAS_OBJECT_CHANGED_DURING_READBACK')
 return {'status':200,'bytes':total,'sha256':digest.hexdigest(),'etag':h['ETag'],'completedAt':now()}
def no_anonymous_access(bucket,x):
 s,_=client(unsigned=True)
 try:s.head_object(Bucket=bucket,Key=x['key'])
 except Exception as e:
  code=getattr(e,'response',{}).get('ResponseMetadata',{}).get('HTTPStatusCode');require(code in [401,403],'ANONYMOUS_ACCESS_NOT_VERIFIED');return code
 raise Hold('ANONYMOUS_BACKUP_OBJECT_EXPOSED')
def eligible_to_release(x,proof,head):
 require(proof.get('fullNasReadbackVerified') is True,'LOCAL_COPY_RETAINED_REMOTE_NOT_VERIFIED')
 require(proof.get('fullGet',{}).get('bytes')==x['bytes'] and proof['fullGet'].get('sha256')==x['sha256'],'LOCAL_COPY_RETAINED_READBACK_MISMATCH')
 require(head_matches(head,x) and head['ETag']==proof['fullGet']['etag'],'LOCAL_COPY_RETAINED_REMOTE_CHANGED')
 require(proof.get('anonymousHeadStatus') in [401,403],'LOCAL_COPY_RETAINED_ACCESS_UNVERIFIED')
def archive():
 p=load_plan();s,bucket=client();require(bucket==p['bucket'],'ARCHIVE_BUCKET_CHANGED')
 for x in p['files']:
  rp=receipt_path(x)
  if rp.exists():
   proof=read(rp);eligible_to_release(x,proof,object_head(s,bucket,x));continue
  local=source_path(x['release']);require(stat_facts(local)==x['stat'] and sha(local)==x['sha256'],'LOCAL_CHANGED_BEFORE_ARCHIVE')
  head=object_head(s,bucket,x)
  if not head:
   atomic(ROOT/(x['release']+'.UPLOAD_INTENT.json'),{'release':x['release'],'key':x['key'],'sha256':x['sha256'],'bytes':x['bytes'],'at':now(),'conditionalCreateOnly':True})
   try:
    with local.open('rb') as f:response=s.put_object(Bucket=bucket,Key=x['key'],Body=f,ContentLength=x['bytes'],ContentType='application/vnd.postgresql.dump',CacheControl='private, no-store',Metadata={'sha256':x['sha256'],'source-release':x['release'],'archive-schema':'1'})
    require(response['ResponseMetadata']['HTTPStatusCode']==200,'NAS_PUT_NOT_ACKNOWLEDGED')
   except Exception:
    require(object_head(s,bucket,x) is not None,'UPLOAD_UNCERTAIN_LOCAL_RETAINED')
  require(head_matches(object_head(s,bucket,x),x),'PREEXISTING_OBJECT_NOT_IDENTICAL')
  get=full_get(s,bucket,x);anon=no_anonymous_access(bucket,x)
  proof={'schemaVersion':1,'release':x['release'],'sourcePath':x['path'],'bucket':bucket,'key':x['key'],'bytes':x['bytes'],'sha256':x['sha256'],'fullNasReadbackVerified':True,'fullGet':get,'anonymousHeadStatus':anon,'storageLocation':'NAS_VERIFIED_LOCAL_RETAINED','localCopyReleased':False,'verifiedAt':now(),'credentialPath':str(CREDENTIALS),'restoreCommand':'python3 '+str(pathlib.Path(__file__).resolve())+' restore-stdout --release '+x['release']}
  atomic(rp,proof);print(json.dumps({'phase':'NAS_FULL_GET_VERIFIED','release':x['release'],'bytes':x['bytes'],'sha256':x['sha256'],'localRetained':True}),flush=True)
 # Cleanup of exact local duplicates, not a release/supervisor state transaction.
 state=read(CANON);sys.path.insert(0,str(pathlib.Path(state['runtimeRecovery']['manifestPath']).parent/'tools/scripts/ops'))
 import release47_host as host
 require(host.sha(pathlib.Path('/etc/machine-id').read_bytes().strip())==HOST,'ARCHIVE_HOST_CHANGED')
 for attempt in range(90):
  try:
   with host.HostTransaction(host.TARGET,HOST,ROOT/'local-release') as tx:
    with (CANON.parent/'.lifecycle.lock').open('rb') as life:
     fcntl.flock(life,fcntl.LOCK_EX|fcntl.LOCK_NB);raw=CANON.read_bytes();state=read(CANON);nginx=tx.run(['nginx','-T']);free=shutil.disk_usage('/').free
     protected=[]
     for f in p['retainedLocalBackups']:
      q=pathlib.Path(f);require(q.is_file() and q.open('rb').read(5)==b'PGDMP','LATEST_BACKUP_NOT_RETAINED');protected.append({'path':f,'bytes':q.stat().st_size})
     proofs=[]
     for x in p['files']:
      proof=read(receipt_path(x));eligible_to_release(x,proof,object_head(s,bucket,x));q=source_path(x['release'])
      if q.exists():require(stat_facts(q)==x['stat'] and sha(q)==x['sha256'] and sha(q.parent/'backup-readable.json')==x['originalProofSha256'],'LOCAL_DUPLICATE_CHANGED')
      else:require(pathlib.Path(x['locator']).is_file() and read(x['locator']).get('localCopyReleased') is True,'MISSING_LOCAL_WITHOUT_VERIFIED_LOCATOR')
      proofs.append(proof)
     tx.save('RELEASE_INTENT.json',{'phase':'ALL_SIX_FULL_NAS_GET_VERIFIED','rootFreeBefore':free,'files':[{'path':x['path'],'sha256':x['sha256'],'bytes':x['bytes']} for x in p['files']],'canonicalSha256':host.sha(raw),'nginxStdoutSha256':host.sha(nginx),'protectedLatestBackups':protected})
     for x,proof in zip(p['files'],proofs):
      q=source_path(x['release']);locator=pathlib.Path(x['locator']);atomic(locator,{**proof,'storageLocation':'NAS','localCopyReleased':False,'sourceStat':x['stat'],'catalogPath':str(ROOT/'ARCHIVE_RECEIPT.json')})
      if q.exists():q.unlink()
      atomic(locator,{**read(locator),'localCopyReleased':True,'releasedAt':now()})
     require(CANON.read_bytes()==raw and tx.run(['nginx','-T'])==nginx,'LIVE_STATE_CHANGED_DURING_ARCHIVAL')
     after=shutil.disk_usage('/').free;result={'schemaVersion':1,'phase':'ARCHIVE_COMPLETE_LOCAL_DUPLICATES_RELEASED','at':now(),'bucket':bucket,'prefix':PREFIX,'files':[{**x,'storageLocation':'NAS','fullNasReadbackVerified':True,'localCopyReleased':True,'fullGet':proof['fullGet'],'anonymousHeadStatus':proof['anonymousHeadStatus']} for x,proof in zip(p['files'],proofs)],'totalArchivedBytes':p['totalBytes'],'rootFreeBeforeUpload':p['rootFreeBefore'],'rootFreeBeforeLocalRelease':free,'rootFreeAfterLocalRelease':after,'netFreedDuringReleaseBytes':after-free,'retainedLocalBackups':protected,'canonicalRevision':state['revision'],'canonicalUnchanged':True,'nginxStdoutSha256':host.sha(nginx),'nginxUnchanged':True,'timerPaused':False,'databaseRestoreExecuted':False,'businessMediaChanged':False,'secretsShared':False,'restoreTest':'PENDING_SEPARATE_COPY_TEST'}
     atomic(ROOT/'ARCHIVE_RECEIPT.json',result);atomic(ROOT/'MODIFIED_FILE.json',result);tx.save('LOCAL_RELEASE_COMPLETE.json',result)
    atomic(ROOT/'LOCKS_RELEASED.json',{'at':now(),'ownArchiveReleaseLocksReleased':True});print('ARCHIVE_COMPLETE files=6 archivedBytes='+str(p['totalBytes'])+' rootFree='+str(after),flush=True);return
  except BlockingIOError:time.sleep(1)
 raise Hold('ARCHIVE_VERIFIED_LOCAL_RELEASE_LOCK_BUSY')
def verify():
 p=load_plan();f=ROOT/'ARCHIVE_RECEIPT.json'
 require(f.exists(),'LOCAL_COPY_RETAINED_REMOTE_NOT_VERIFIED');r=read(f);require(r['phase']=='ARCHIVE_COMPLETE_LOCAL_DUPLICATES_RELEASED' and len(r['files'])==6,'ARCHIVE_NOT_COMPLETE')
 for x in r['files']:require(x['fullNasReadbackVerified'] and x['localCopyReleased'] and not pathlib.Path(x['path']).exists() and read(x['locator'])['sha256']==x['sha256'],'ARCHIVE_LOCATOR_OR_LOCAL_STATE_MISMATCH')
 print('NAS_ARCHIVE_VERIFIED files=6 localCopies=0 originalBytesPreserved=1')
def restore_stdout(release):
 p=load_plan();x=next(x for x in p['files'] if x['release']==release);s,b=client();proof=read(receipt_path(x));eligible_to_release(x,proof,object_head(s,b,x));full_get(s,b,x,sys.stdout.buffer);sys.stdout.buffer.flush()
def fixtures():
 x={'bytes':7,'sha256':'a'*64};h={'ContentLength':7,'Metadata':{'sha256':'a'*64},'ETag':'pinned'}
 valid={'fullNasReadbackVerified':True,'fullGet':{'bytes':7,'sha256':'a'*64,'etag':'pinned'},'anonymousHeadStatus':403}
 eligible_to_release(x,valid,h);checks=1
 for proof,head in [({**valid,'fullNasReadbackVerified':False},h),({**valid,'fullGet':{'bytes':7,'sha256':'b'*64,'etag':'pinned'}},h),(valid,{**h,'ETag':'changed'}),(valid,{**h,'ContentLength':8}),({**valid,'anonymousHeadStatus':200},h)]:
  try:eligible_to_release(x,proof,head)
  except Hold:checks+=1
  else:raise Hold('FIXTURE_GUARD_NOT_ENFORCED')
 print('ARCHIVE_GUARDS_PASS checks='+str(checks)+' liveWrites=0')
def main():
 a=argparse.ArgumentParser();a.add_argument('mode',choices=['plan','archive','verify','restore-stdout','fixtures']);a.add_argument('--release',choices=RELEASES);args=a.parse_args()
 if args.mode=='fixtures':fixtures();return
 require(os.geteuid()==0 and ROOT.resolve()==ROOT and not ROOT.is_symlink(),'FIXED_PRIVATE_ARCHIVE_ROOT_REQUIRED');ROOT.mkdir(mode=0o700,exist_ok=True);require(ROOT.stat().st_mode&0o777==0o700,'ARCHIVE_ROOT_MODE')
 with (ROOT/'archive.lock').open('a') as lock:
  os.chmod(ROOT/'archive.lock',0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if args.mode=='plan':plan()
  elif args.mode=='archive':archive()
  elif args.mode=='verify':verify()
  else:restore_stdout(args.release)
if __name__=='__main__':
 try:main()
 except Hold as e:print(str(e),file=sys.stderr);sys.exit(1)
 except BlockingIOError:print('ARCHIVE_OWN_LOCK_BUSY_NO_TAKEOVER',file=sys.stderr);sys.exit(75)
 except Exception as e:print('ARCHIVE_FAILED_'+type(e).__name__+'_LOCAL_STATE_REQUIRES_RECONCILIATION',file=sys.stderr);sys.exit(1)
