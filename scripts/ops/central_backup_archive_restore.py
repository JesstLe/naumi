#!/usr/bin/env python3
import pathlib,json,sys,os,hashlib,shutil,subprocess,importlib.util
ROOT=pathlib.Path('/opt/naumi-staging/evidence/central-backup-archive-20261124-r1')
spec=importlib.util.spec_from_file_location('archive',ROOT/'central_backup_archive.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
p=a.load_plan();x=p['files'][0];target=ROOT/'ROLLBACK_TEST.dump';resultPath=ROOT/'ROLLBACK_TEST_RESULT.json'
a.require(target.resolve()==target and target.parent==ROOT and not target.is_symlink(),'DEDICATED_ROLLBACK_COPY_REQUIRED')
if len(sys.argv)>1 and sys.argv[1]=='--cleanup':
 r=a.read(resultPath);a.require(r['restoredSha256']==x['sha256'] and r['pgRestoreListExit']==0 and target.is_file() and a.sha(target)==x['sha256'],'TEST_COPY_CLEANUP_GUARD')
 target.unlink();a.atomic(ROOT/'ROLLBACK_TEST_CLEANED.json',{'exactCopyPath':str(target),'sha256':x['sha256'],'nasArchiveRetained':True,'originalLocalPathsRemainReleased':all(not pathlib.Path(v['path']).exists() for v in p['files']),'at':a.now()});print('ROLLBACK_TEST_COPY_REMOVED_NAS_ARCHIVE_RETAINED');sys.exit(0)
a.require(not target.exists(),'ROLLBACK_COPY_EXISTS_NO_OVERWRITE');required=10*1024**3+x['bytes']+512*1024**2;free=shutil.disk_usage('/').free;a.require(free>=required,'RESTORE_TEST_REMAINING_PEAK_NOT_ADMITTED')
s,bucket=a.client();proof=a.read(a.receipt_path(x));a.eligible_to_release(x,proof,a.object_head(s,bucket,x))
fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb') as f:r=a.full_get(s,bucket,x,f);f.flush();os.fsync(f.fileno())
a.require(a.sha(target)==x['sha256'] and target.open('rb').read(5)==b'PGDMP','RESTORED_COPY_REOPEN_SHA_FAILED')
with target.open('rb') as f:listing=subprocess.run(['docker','exec','-i','naumi-staging-db-1','pg_restore','--list'],stdin=f,capture_output=True,timeout=120)
a.require(listing.returncode==0 and hashlib.sha256(listing.stdout).hexdigest()==x['originalPgRestoreListSha256'],'RESTORED_COPY_PG_LIST_MISMATCH')
a.atomic(resultPath,{'phase':'SEPARATE_BACKUP_COPY_RESTORED_AND_REOPENED','at':a.now(),'sourceRelease':x['release'],'copyPath':str(target),'bytes':target.stat().st_size,'restoredSha256':a.sha(target),'originalSha256':x['sha256'],'pgRestoreListExit':listing.returncode,'pgRestoreListSha256':hashlib.sha256(listing.stdout).hexdigest(),'fullNasGet':r,'rootFreeBeforeTest':free,'testPeakRequiredBytes':required,'rootFreeAfterTest':shutil.disk_usage('/').free,'databaseRestoreExecuted':False,'productionOriginalPathsRestored':False,'archivedIndexStillModified':True})
print('NAS_ROLLBACK_COPY_RESTORED_SHA_AND_PG_LIST_OK databaseRestore=0')
