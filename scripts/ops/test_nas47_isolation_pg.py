"""Opt-in local fixture PG for the real13/16 isolation SQL, never production."""
import hashlib,json,os,pathlib,subprocess,tempfile,unittest,uuid
from release47_quarantine_dead_boot import execute,NAS_CONTINUATION
from release47_host import Hold
DB='naumi-nas-release-ops-pg-20261020'
def sql(q):
 p=subprocess.run(['docker','exec','-i',DB,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','fixture','-d','fixture'],input=q.encode(),capture_output=True,check=True)
 return p.stdout
class Tx:
 def __init__(self,folder):self.folder=folder
 def pin(self,identity):return{'State':{'StartedAt':identity['startedAt']}}
 def inspect(self,name):
  assert name=='naumi-staging-db-1';return{'Config':{'Env':['POSTGRES_USER=fixture','POSTGRES_DB=fixture']}}
 def run(self,args,stdin=None,timeout=None):return sql(stdin.decode())
 def save(self,name,value):
  raw=value if isinstance(value,bytes)else json.dumps(value).encode();p=self.folder/name;p.write_bytes(raw);return{'path':str(p)}
@unittest.skipUnless(os.environ.get('NAS47_LOCAL_PG_TEST')=='1','explicit dedicated local PG fixture only')
class IsolationPG(unittest.TestCase):
 def test_real_sql_preserves_paid_fields_and_copy_rollback(self):
  self.assertIn(DB,subprocess.check_output(['docker','inspect','--format','{{.Name}}',DB]).decode())
  sql('''CREATE TABLE app_image_jobs(id text PRIMARY KEY,kind text,snapshot jsonb,payload jsonb,lease_token text,lease_until timestamptz,billing_settled boolean,cost int,reserved_cost int,updated_at timestamptz DEFAULT now());
CREATE TABLE app_release_activities(id uuid PRIMARY KEY,instance_id text,boot_id uuid,state text,work_scope text,work_key text,claim_token text,activity_kind text,outcome text,finished_at timestamptz);
CREATE TABLE app_billing_operations(id text PRIMARY KEY,state text,reserved_credits int,charged_credits int);
''')
  oldboot=str(uuid.uuid4());newboot=str(uuid.uuid4());ids=['job-fixture-'+str(i)for i in range(13)]
  for i,id in enumerate(ids):
   snapshot=json.dumps({'status':'pending','paidOperations':{id:{'model':'gpt-image-2','state':'started','replayable':False}}})
   sql("INSERT INTO app_image_jobs VALUES('"+id+"','generate','"+snapshot+"','{\"original\":true}','claim-"+str(i)+"',now()-interval '1 hour',false,8,8,now());INSERT INTO app_billing_operations VALUES('"+id+"','hold',8,0);INSERT INTO app_release_activities VALUES('"+str(uuid.uuid4())+"','naumi47-web-fixture','"+oldboot+"','unknown','durable-image','generate:"+id+"','claim-"+str(i)+"','accepted-work',NULL,NULL);")
  for i,scope in enumerate(['media-variant','reference-sync','reference-sync']):sql("INSERT INTO app_release_activities VALUES('"+str(uuid.uuid4())+"','naumi47-web-fixture','"+oldboot+"','unknown','"+scope+"','fixture-scanner-"+str(i)+"',NULL,'accepted-work',NULL,NULL);")
  jobs=json.loads(sql("SELECT json_agg(to_jsonb(j)ORDER BY id)FROM app_image_jobs j;"));bills=json.loads(sql('SELECT json_agg(to_jsonb(b)ORDER BY id)FROM app_billing_operations b;'))
  sql('CREATE TABLE baseline_jobs AS TABLE app_image_jobs;CREATE TABLE baseline_activities AS TABLE app_release_activities;')
  spec={'authorization':NAS_CONTINUATION,'releaseId':'release47-nas-fixture-20261020','web':{'name':'naumi47-web-fixture','startedAt':'fixture-start'},'newBoot':newboot,'oldBoot':oldboot,'expectedJobs':13,'expectedActivities':16,'reviewedJobIds':ids,'reviewedJobHashes':{j['id']:hashlib.sha256(json.dumps(j,sort_keys=True,separators=(',',':')).encode()).hexdigest()for j in jobs}}
  app={'identity':{'bootId':newboot},'observations':{'trackedAcceptedWork':0}}
  try:
   with tempfile.TemporaryDirectory()as folder:
    tx=Tx(pathlib.Path(folder));result=execute(tx,spec,app)
    self.assertEqual((result['jobs'],result['processObservations']),(13,16))
    after=json.loads(sql('SELECT json_agg(to_jsonb(j)ORDER BY id)FROM app_image_jobs j;'))
    for before,current in zip(jobs,after):
     self.assertEqual(current['snapshot']['status'],'needs_attention');self.assertEqual(current['snapshot']['paidOperations'],before['snapshot']['paidOperations'])
     for k in ['payload','lease_token','lease_until','billing_settled','cost','reserved_cost']:self.assertEqual(current[k],before[k])
    self.assertEqual(bills,json.loads(sql('SELECT json_agg(to_jsonb(b)ORDER BY id)FROM app_billing_operations b;')))
    self.assertEqual(int(sql("SELECT count(*)FROM app_release_activities WHERE state='finished'AND outcome='owner-terminated:quarantined-domain-unresolved';")),16)
    # Actual inverse only in this isolated fixture; no production restore path.
    sql('TRUNCATE app_image_jobs;INSERT INTO app_image_jobs TABLE baseline_jobs;TRUNCATE app_release_activities;INSERT INTO app_release_activities TABLE baseline_activities;')
    self.assertEqual(jobs,json.loads(sql('SELECT json_agg(to_jsonb(j)ORDER BY id)FROM app_image_jobs j;')))
    self.assertEqual(int(sql("SELECT count(*)FROM app_release_activities WHERE state='unknown';")),16)
    with self.assertRaises(Hold):execute(tx,{**spec,'reviewedJobIds':ids[:-1]+['other']},app)
    self.assertEqual(int(sql("SELECT count(*)FROM app_image_jobs WHERE snapshot->>'status'='pending';")),13)
    print('NAS13_REAL_PG=PASS JOBS=13 OBSERVATIONS=16 PAID_FIELDS_UNCHANGED=13 BILLING_UNCHANGED=13 COPY_ROLLBACK=PASS WRONG_ID_REJECTED=1 GENERATION_CALLS=0')
  finally:sql('DROP TABLE app_image_jobs,app_release_activities,app_billing_operations,baseline_jobs,baseline_activities;')

@unittest.skipUnless(os.environ.get('NAS47_LOCAL_PG_TEST')=='1','explicit dedicated local PG fixture only')
class CatalogPG(unittest.TestCase):
 def test_actual_catalog_sql_preserves_acl_and_rejects_conflict(self):
  import release47_nas_execute as m
  from unittest.mock import patch
  sql("CREATE TABLE app_media_assets(key text PRIMARY KEY,owner text,public boolean,driver text,remote_ready boolean,content_type text,sha256 text,bytes bigint,width int,height int,thumbnail_key text,preview_key text);INSERT INTO app_media_assets VALUES('private/a.png','owner@example.test',false,'local',false,'image/png','abc',3,48,64,'thumb','preview');CREATE TABLE media_before AS TABLE app_media_assets;")
  class MediaTx(Tx):
   def run(self,args,stdin=None,timeout=None):return sql(stdin.decode())
  try:
   with tempfile.TemporaryDirectory()as folder:
    root=pathlib.Path(folder);proof=root/'final-media-proof';proof.mkdir()
    (proof/'SUMMARY.json').write_text(json.dumps(dict(phase='ALL_BYTES_VERIFIED',files=2,errors=0,missing=0,mismatch=0,changed=0)))
    rows=[dict(op='verified',key='private/a.png',sha256='abc',size=3),dict(op='verified',key='brand/b.png',sha256='def',size=4)]
    (proof/'verified-files.jsonl').write_text('\n'.join(json.dumps(r)for r in rows))
    obj=object.__new__(m.NasController);obj.tx=MediaTx(root);obj.db={'id':'fixture'};obj.de={'POSTGRES_USER':'fixture','POSTGRES_DB':'fixture'}
    with patch.object(m,'ROOT',root):obj.sync_media_catalog()
    result=json.loads(sql("SELECT json_agg(to_jsonb(a)ORDER BY key)FROM app_media_assets a;"))
    self.assertEqual(len(result),2);private=next(r for r in result if r['key']=='private/a.png')
    self.assertEqual((private['owner'],private['public'],private['width'],private['height'],private['thumbnail_key'],private['preview_key']),('owner@example.test',False,48,64,'thumb','preview'))
    self.assertEqual((private['driver'],private['remote_ready']),('s3',True))
    self.assertEqual(next(r for r in result if r['key']=='brand/b.png')['public'],True)
    rows[0]['sha256']='conflict';(proof/'verified-files.jsonl').write_text('\n'.join(json.dumps(r)for r in rows))
    with patch.object(m,'ROOT',root),self.assertRaises(subprocess.CalledProcessError):obj.sync_media_catalog()
    self.assertEqual(result,json.loads(sql("SELECT json_agg(to_jsonb(a)ORDER BY key)FROM app_media_assets a;")))
    sql('TRUNCATE app_media_assets;INSERT INTO app_media_assets TABLE media_before;')
    restored=json.loads(sql('SELECT to_jsonb(a)FROM app_media_assets a;'));self.assertEqual(restored['driver'],'local');self.assertFalse(restored['remote_ready'])
    print('NAS_CATALOG_REAL_PG=PASS ACL_PRESERVED=1 CONFLICT_ATOMIC_REJECT=1 COPY_ROLLBACK=PASS')
  finally:sql('DROP TABLE app_media_assets,media_before;')

if __name__=='__main__':unittest.main()
