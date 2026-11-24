import pathlib,importlib.util,hashlib,json,fcntl,os
ROOT=pathlib.Path('/opt/naumi-staging/evidence/central-backup-archive-20261124-r1')
spec=importlib.util.spec_from_file_location('archive',ROOT/'central_backup_archive.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
with (ROOT/'archive.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);s,bucket=a.client();catalog=[]
 for name in ['PLAN.json','ARCHIVE_RECEIPT.json','ROLLBACK_TEST_RESULT.json']:
  p=ROOT/name;data=p.read_bytes();digest=hashlib.sha256(data).hexdigest();x={'key':a.PREFIX+'catalogs/'+ROOT.name+'/'+name+'-'+digest,'bytes':len(data),'sha256':digest}
  if a.object_head(s,bucket,x) is None:
   try:s.put_object(Bucket=bucket,Key=x['key'],Body=data,ContentLength=len(data),ContentType='application/json',CacheControl='private, no-store',Metadata={'sha256':digest,'archive-schema':'1'})
   except Exception:a.require(a.object_head(s,bucket,x) is not None,'CATALOG_PUT_UNCERTAIN')
  proof=a.full_get(s,bucket,x);anon=a.no_anonymous_access(bucket,x);catalog.append({'file':name,'bucket':bucket,**x,'fullGet':proof,'anonymousHeadStatus':anon})
 a.atomic(ROOT/'NAS_CATALOG_RECEIPT.json',{'phase':'NAS_CATALOG_FULL_READBACK_VERIFIED','files':catalog,'at':a.now(),'secretsIncluded':False});print('NAS_CATALOG_VERIFIED files=3 fullReadback=1 anonymousAccess=0')
