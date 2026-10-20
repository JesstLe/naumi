"""Exact verified duplicate eviction. No DB/volume/tree deletion; retained NAS rollback.

The enclosing release holds all three locks and has stopped the original writers.
An unexpected source edit is retained, not removed. No supplier operations exist.
"""
import hashlib,json,os,pathlib,stat
from release47_host import require,file_sha,environment
MEDIA_ROOT=pathlib.Path('/opt/naumi-staging/data/media')
CANONICAL=pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')

def execute(operator):
 tx=operator.tx;root=pathlib.Path(operator.cfg['evidenceRoot']);source=pathlib.Path(operator.cfg['mediaSource'])
 require(source.resolve()==MEDIA_ROOT and not source.is_symlink(),'EXACT_MEDIA_ROOT_REQUIRED')
 state=json.loads(CANONICAL.read_bytes())
 require(state['activeNormalBlueGreenReleaseId']==operator.cfg['releaseId']and state['normalBlueGreenReleases'][operator.cfg['releaseId']]['phase']=='COMPLETE','ACTIVE_COMPLETE_NAS_RELEASE_REQUIRED')
 for old in [operator.web,operator.worker]:require(not tx.inspect(old['id'])['State']['Running'],'OLD_WRITER_STILL_RUNNING')
 web=tx.pin(operator.newweb);e=environment(web)
 require(e.get('STORAGE_DRIVER')=='s3'and e.get('MEDIA_REMOTE_ACCESS')=='proxy'and e.get('MEDIA_PRIVATE')=='1','NAS_STORAGE_NOT_ACTIVE')
 check=json.loads((tx.folder/'nas-compatible-rollback-test.json').read_bytes())
 require(check.get('passed')and check.get('priorNasCompatibleRead')and check.get('verificationDataCleaned'),'NAS_ROLLBACK_NOT_TESTED')
 backup=json.loads((tx.folder/'backup-readable.json').read_bytes());require(file_sha(backup['path'])==backup['sha256'],'READABLE_DATABASE_BACKUP_CHANGED')
 proof=root/'final-media-proof';summary=json.loads((proof/'SUMMARY.json').read_bytes())
 require(summary['phase']=='ALL_BYTES_VERIFIED'and all(summary[k]==0 for k in ['errors','missing','mismatch','changed']),'NAS_BYTES_NOT_VERIFIED')
 entries=[json.loads(l)for l in (proof/'verified-files.jsonl').read_text().splitlines()if l]
 require(len(entries)==summary['files']and len({r['key']for r in entries})==len(entries),'VERIFIED_SET_CHANGED')
 receipt={'deleted':0,'bytesDeleted':0,'retainedChanged':0,'retainedMissing':0,'source':'verified-media-duplicates-only',
          'databaseDeleted':False,'volumesDeleted':False,'paidTaskReplays':0,'nasCompatibleRollback':True}
 tx.save('MEDIA_EVICTION_PLAN.private.json',{'source':str(source),'count':len(entries),'manifestSha256':file_sha(proof/'verified-files.jsonl'),'NASBucket':e['S3_BUCKET'],'web':operator.newweb,'retain':'DB, catalogs, credentials, local outage fallbacks, config, prior images and rollback slots'})
 log=tx.folder/'MEDIA_EVICTION.jsonl'
 require(not log.exists(),'EXISTING_MEDIA_EVICTION_RECONCILE_REQUIRED')
 with log.open('x',encoding='utf-8')as stream:
  os.chmod(log,0o600)
  for item in entries:
   key=item['key'];parts=pathlib.PurePosixPath(key).parts
   require(key and not key.startswith('/')and '\\'not in key and all(p not in ['.','..']for p in parts),'MEDIA_KEY_ESCAPE')
   p=source.joinpath(*parts)
   # Reject symlink ancestors as well as symlink files. No computed rmtree.
   require(p.resolve().is_relative_to(source.resolve())and not any(parent.is_symlink()for parent in p.parents if parent!=source and parent.is_relative_to(source)), 'MEDIA_RESOLVED_ESCAPE')
   try:s=p.lstat()
   except FileNotFoundError:receipt['retainedMissing']+=1;continue
   if not stat.S_ISREG(s.st_mode)or s.st_size!=item['size']or s.st_ino!=item['ino']or s.st_mtime_ns//1000000!=int(item['mtimeMs']):receipt['retainedChanged']+=1;continue
   if file_sha(p)!=item['sha256']:receipt['retainedChanged']+=1;continue
   # Open an exact descriptor and recheck immediately before unlinking. Another
   # writer changing this key invalidates eviction; it is never overwritten.
   current=p.lstat()
   if(current.st_ino,current.st_size,current.st_mtime_ns)!=(s.st_ino,s.st_size,s.st_mtime_ns):receipt['retainedChanged']+=1;continue
   stream.write(json.dumps({'phase':'INTENT','key':key,'sha256':item['sha256'],'bytes':s.st_size})+'\n');stream.flush();os.fsync(stream.fileno())
   p.unlink()
   stream.write(json.dumps({'phase':'DELETED','key':key,'sha256':item['sha256'],'bytes':s.st_size})+'\n');stream.flush();os.fsync(stream.fileno())
   receipt['deleted']+=1;receipt['bytesDeleted']+=s.st_size
 tx.save('MEDIA_EVICTION_RESULT.json',receipt);return receipt
