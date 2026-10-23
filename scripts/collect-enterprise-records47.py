"""Explicit 47 read-only snapshot to a private local folder. Never deploys or changes source configuration."""
from pathlib import Path
import argparse,json,subprocess,sys,hashlib,datetime
from urllib.parse import urlsplit

parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
parser.add_argument('--config',default='data/enterprise-sheet-workspace/connection.json')
parser.add_argument('--days',type=int,default=30)
parser.add_argument('--reuse-records',action='store_true',help='Retry thumbnails from an already collected, recent private snapshot')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
assert 1<=args.days<=30
config=json.loads((root/args.config).read_text('utf-8'));assert urlsplit(config['databaseUrl']).hostname=='127.0.0.1'
assert config['container'].startswith('naumi-enterprise-import-')
who=subprocess.check_output(['whoami'],text=True).strip()
subprocess.run(['icacls',str(out),'/inheritance:r','/grant:r',who+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],check=True,capture_output=True)
registry=json.loads((root/'docs/enterprise/config/source47-identity.json').read_text('utf-8'))
query="SELECT json_agg(source_subject ORDER BY source_subject) FROM enterprise_workflow.person_profiles WHERE enterprise_id='"+config['enterpriseId']+"' AND source_instance='naumi47' AND source_enterprise='"+registry['enterpriseId']+"' AND enabled"
subjects=json.loads(subprocess.check_output(['docker','exec',config['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',urlsplit(config['databaseUrl']).path[1:],'-c',query],text=True,encoding='utf-8'))
assert subjects and len(subjects)<=100
wrapper=root.parent/'naumi/output/release47-evening-20261016/window-1830/ssh47-readonly.py'
def remote(script,name):
 path=out/(name+'.sh');path.write_text(script,encoding='utf-8',newline='\n');log=out/(name+'.private.log')
 p=subprocess.run([sys.executable,str(wrapper),str(path),str(log)],capture_output=True)
 (out/(name+'-transport.private.log')).write_bytes(p.stdout+p.stderr)
 if p.returncode:raise RuntimeError('SOURCE_READ_FAILED: '+name)
 return json.loads(next(line for line in log.read_text('utf-8').splitlines() if line.startswith('{')))
inventory="""set -eu
python3 - <<'PY'
import subprocess,json
rows=[]
for cid in subprocess.check_output(['docker','ps','-q'],text=True).split():
 d=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0];env=dict(s.split('=',1) for s in d['Config'].get('Env',[]) if '=' in s)
 if d['Name'].startswith('/naumi47-web-') and 'DATABASE_URL' in env:rows.append({'id':d['Id'],'startedAt':d['State']['StartedAt']})
print(json.dumps({'candidates':rows}))
PY
"""
runtime=remote(inventory,'inventory')['candidates'];assert len(runtime)==1;r=runtime[0]
check='test "$(docker inspect --format \'{{.State.StartedAt}}\' '+r['id']+')" = \''+r['startedAt']+"'\n"
def command(code):
 # Keep the one-shot query out of the live Web's memory cgroup. No mounts,
 # listeners, writes or worker startup. The only inherited secret is the DB URL.
 payload=json.dumps(code,ensure_ascii=False)
 return 'set -eu\n'+check+"python3 - <<'ISOLATED_READ'\n"+'''import subprocess,json,os,sys
cid='''+repr(r['id'])+'''
d=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
available=int(next(s.split()[1] for s in open('/proc/meminfo') if s.startswith('MemAvailable:')))*1024
assert available>=512*1024*1024,'READONLY_CAPACITY_LOW'
envs=dict(s.split('=',1) for s in d['Config']['Env'] if '=' in s)
from urllib.parse import urlsplit
dbhost=urlsplit(envs['DATABASE_URL']).hostname;networks=[]
for network in d['NetworkSettings']['Networks']:
 nd=json.loads(subprocess.check_output(['docker','network','inspect',network],text=True))[0]
 for peer in nd.get('Containers',{}):
  pd=json.loads(subprocess.check_output(['docker','inspect',peer],text=True))[0];pe=pd['NetworkSettings']['Networks'].get(network,{})
  if dbhost in [pd['Name'].lstrip('/'),pe.get('IPAddress'),*(pe.get('Aliases') or []),*(pe.get('DNSNames') or [])]:networks.append(network)
networks=list(set(networks));assert len(networks)==1,'READONLY_NETWORK_AMBIGUOUS'
env={**os.environ,'DATABASE_URL':envs['DATABASE_URL']}
import uuid
name='naumi-enterprise-readonly-'+uuid.uuid4().hex
cmd=['docker','run','--rm','--name',name,'-i','--read-only','--memory=128m','--memory-swap=128m','--cpus=0.25','--pids-limit=32','--cap-drop=ALL','--security-opt=no-new-privileges','--network',networks[0],'-e','DATABASE_URL','-e','NODE_OPTIONS=','-e','NAUMI_RELEASE_RUNTIME=0','--entrypoint','node',d['Image'],'--max-old-space-size=64','--input-type=module']
try:p=subprocess.run(cmd,input='''+payload+'''.encode('utf-8'),env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
except subprocess.TimeoutExpired:
 subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 raise RuntimeError('READONLY_QUERY_TIMEOUT')
sys.stdout.buffer.write(p.stdout)
if p.returncode:print('READONLY_QUERY_FAILED',file=sys.stderr)
sys.exit(p.returncode)
ISOLATED_READ
'''+check
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date();options={'subjects':subjects,'from':str(today-datetime.timedelta(days=args.days-1)),'to':str(today),'limit':1000}
lib=(root/'scripts/lib/enterprise-records-snapshot.mjs').read_text('utf-8')
runner="""
const {createRequire}=await import('node:module');const {Pool}=createRequire('/app/package.json')('pg');
const remotePool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,application_name:'enterprise-records-readonly'});
try{console.log(JSON.stringify(await inspectRecords(remotePool,REGISTRY,OPTIONS)));}finally{await remotePool.end();}
""".replace('REGISTRY',json.dumps(registry,ensure_ascii=False)).replace('OPTIONS',json.dumps(options,ensure_ascii=False))
if args.reuse_records:
 snapshot=json.loads((out/'SOURCE_RECORDS.private.json').read_text('utf-8'))
 assert snapshot['instanceId']==registry['instance'] and snapshot['enterpriseId']==registry['enterpriseId'] and snapshot['from']==options['from'] and snapshot['to']==options['to']
 assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(snapshot['observedAt'].replace('Z','+00:00'))).total_seconds()<1800
else:snapshot=remote(command(lib+runner),'records')
assert snapshot['sourceReadOnly'] and snapshot['sourceWrites']==0
(out/'SOURCE_RECORDS.private.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf-8')
# Media decoding must run outside the live Web cgroup. This collector deliberately
# reads only bounded DB records; no object-store download, sharp decode or file copy.
snapshot.pop('mediaUrls',None);snapshot['media']=[]
# Hash exact JSON byte representation read by the service (JSON.stringify is used there).
jsonData=json.dumps(snapshot,ensure_ascii=False,separators=(',',':'))
sha=hashlib.sha256(jsonData.encode()).hexdigest()
# JS serialisation normalises floating-point whole numbers differently. Use Node for canonical hashing and final envelope.
raw=out/'SNAPSHOT_DATA.private.json';raw.write_text(jsonData,encoding='utf-8')
final=out/'SOURCE_SNAPSHOT.private.json'
script="const fs=require('node:fs'),crypto=require('node:crypto');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const sha256=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');fs.writeFileSync(process.argv[2],JSON.stringify({sha256,data}),{mode:0o600});"
subprocess.run(['node','-e',script,str(raw),str(final)],check=True,capture_output=True)
summary={k:snapshot[k] for k in ['observedAt','from','to','limits','sourceReadOnly','sourceWrites']};summary.update({'mappedSubjects':len(subjects),'availableMembers':len(snapshot['members']),'collected':{k:len(v) for k,v in snapshot['rows'].items()},'media':0,'mediaNotCollected':True,'recordsQueryRuntimeChecked':True})
(out/'RESULT.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('SOURCE_RECORDS_COLLECTED: '+json.dumps(summary,ensure_ascii=False))
