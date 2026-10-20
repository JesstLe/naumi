"""Finite host-side monitor; activation command is an exact reviewed private file.

No paid calls, database mutation or data deletion. A single service invocation
holds its own monitor mutex. Release commands must acquire the normal three locks.
"""
import datetime as dt,json,os,pathlib,subprocess,sys,tempfile
ROOT=pathlib.Path('/opt/naumi-staging/evidence/nas47-finish-20261020')
COPY=pathlib.Path('/opt/naumi-staging/evidence/nas47-ops-20261020-remote')
VERIFY=pathlib.Path('/opt/naumi-staging/evidence/nas47-full-verification-20261020/proof-r2')
TAIL=pathlib.Path('/opt/naumi-staging/evidence/nas47-tail-copy-20261020/proof/migrate-tail-final.json')
BACKUPS=[pathlib.Path('/opt/naumi-staging/evidence')/p for p in [
 'nas47-data-backup-20261020/database-r2-proof/STATUS.json',
 'nas47-data-backup-20261020/new-api-proof/STATUS.json',
 'nas47-data-backup-20261020/archive-proof/STATUS.json',
 'nas47-extra-data-20261020/proof/STATUS.json']]
def load(p):
 try:return json.loads(p.read_bytes())
 except(FileNotFoundError,ValueError):return None
def atomic(p,v):
 p.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd,n=tempfile.mkstemp(dir=p.parent)
 with os.fdopen(fd,'w')as f:json.dump(v,f);f.flush();os.fsync(f.fileno())
 os.replace(n,p)
def ready(copy,verify):
 return bool(copy and verify and not copy.get('FATAL') and all(copy.get(k)==0 for k in ['errors','mismatch','tooLarge'])
  and verify.get('phase') in ['ALL_BYTES_VERIFIED','INCOMPLETE_RETAIN_LOCAL']
  and type(verify.get('files'))is int and type(verify.get('verified'))is int and type(verify.get('missing'))is int
  and verify['files']>0 and verify['verified']+verify['missing']==verify['files']
  and all(verify.get(k)==0 for k in ['errors','mismatch','changed']))

def all_gates(copy,verify,tail,backups):
 return bool(ready(copy,verify) and tail and all(tail.get(k)==0 for k in ['errors','mismatch','tooLarge'])
             and len(backups)==4 and all(v and v.get('phase')=='ALL_BACKUPS_READBACK_VERIFIED' for v in backups))
def main():
 import fcntl
 ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
 with(ROOT/'monitor.lock').open('a')as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return
  copy=load(COPY/'migrate-final.json');verify=load(ROOT/'final-media-proof/SUMMARY.json') or load(VERIFY/'SUMMARY.json')
  tail=load(TAIL);backups=[load(p)for p in BACKUPS]
  health=subprocess.run(['curl','--silent','--show-error','--fail','--max-time','12','http://127.0.0.1:13103/api/health'],capture_output=True)
  status={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'copy':copy or load(COPY/'migrate-summary.json'),
          'verify':verify,'tail':tail,'backups':[v.get('phase')if v else None for v in backups],
          'migrationReady':all_gates(copy,verify,tail,backups),'healthExit':health.returncode,'paidCalls':0,'deleted':0}
  final=load(ROOT/'FINAL_RESULT.json')
  if final and final.get('phase')=='COMPLETE' and final.get('publicAcceptance') is True:
   status['phase']='COMPLETE';atomic(ROOT/'MONITOR.json',status)
   subprocess.run(['systemctl','disable','--now','naumi47-nas-finish.timer'],check=True);return
  command=ROOT/'reviewed-execute.json'
  if status['migrationReady'] and health.returncode==0 and command.exists():
   spec=load(command);script=pathlib.Path(spec['script']);import hashlib
   assert script.parent==ROOT and not script.is_symlink() and hashlib.sha256(script.read_bytes()).hexdigest()==spec['sha256']
   assert spec['target']=='47.105.59.142' and spec['replayPaidTasks'] is False
   intent=ROOT/'EXECUTION_INTENT.json'
   if intent.exists():status['phase']='EXISTING_OPERATION_RECONCILE_REQUIRED'
   else:
    atomic(intent,{'operationId':spec['operationId'],'scriptSha256':spec['sha256'],'at':status['at']})
    with(ROOT/'execute.log').open('ab')as out:
     result=subprocess.run([sys.executable,str(script)],stdout=out,stderr=subprocess.STDOUT)
    status.update(phase='EXECUTION_RETURNED',executionExit=result.returncode,operationId=spec['operationId'])
  else:status['phase']='COPY_OR_VERIFICATION_RUNNING' if not status['migrationReady'] else 'AWAITING_REVIEWED_OPERATOR'
  atomic(ROOT/'MONITOR.json',status)
if __name__=='__main__':main()
