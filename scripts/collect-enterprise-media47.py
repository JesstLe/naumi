"""Explicit operator-only media read. Remote byte download is isolated; image decoding is local."""
from pathlib import Path
import argparse,datetime,json,subprocess,sys
from urllib.parse import urlsplit

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--output',required=True)
 parser.add_argument('--snapshot',required=True)
 parser.add_argument('--config',default='data/enterprise-sheet-workspace/connection.json')
 parser.add_argument('--count',type=int,default=25)
 args=parser.parse_args();assert 1<=args.count<=25
 root=Path(__file__).resolve().parents[1];out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
 who=subprocess.check_output(['whoami'],encoding='utf-8').strip()
 subprocess.run(['icacls',str(out),'/inheritance:r','/grant:r',who+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],check=True,capture_output=True)
 config=json.loads((root/args.config).read_text('utf-8'));assert urlsplit(config['databaseUrl']).hostname=='127.0.0.1'
 assert config['container'].startswith('naumi-enterprise-import-')
 registry=json.loads((root/'docs/enterprise/config/source47-identity.json').read_text('utf-8'))
 source=json.loads(Path(args.snapshot).read_text('utf-8'));data=source['data']
 assert data['instanceId']==registry['instance'] and data['enterpriseId']==registry['enterpriseId']
 # Only current explicit local source bindings are eligible. No nickname matching.
 query="SELECT json_agg(source_subject ORDER BY source_subject) FROM enterprise_workflow.person_profiles WHERE enterprise_id='"+config['enterpriseId']+"' AND source_instance='naumi47' AND source_enterprise='"+registry['enterpriseId']+"' AND enabled"
 subjects=json.loads(subprocess.check_output(['docker','exec',config['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',urlsplit(config['databaseUrl']).path[1:],'-c',query],text=True,encoding='utf-8'))
 pairs=[{'id':r['ref']['id'],'email':r['account']['email']} for r in data['rows']['artworks'] if r['account']['email'] in subjects][:args.count]
 assert pairs and len(subjects)<=100
 wrapper=root.parent/'naumi/output/release47-evening-20261016/window-1830/ssh47-readonly.py'
 def remote(script,name):
  path=out/(name+'.sh');path.write_text(script,encoding='utf-8',newline='\n');log=out/(name+'.private.log')
  p=subprocess.run([sys.executable,str(wrapper),str(path),str(log)],capture_output=True)
  (out/(name+'-transport.private.log')).write_bytes(p.stdout+p.stderr)
  if p.returncode:raise RuntimeError('MEDIA_REMOTE_READ_FAILED: '+name)
  return [json.loads(s) for s in log.read_text('utf-8').splitlines() if s.startswith('{')]
 inventory="""set -eu
python3 - <<'PY'
import subprocess,json,urllib.request
rows=[]
for cid in subprocess.check_output(['docker','ps','-q'],text=True).split():
 d=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
 if d['Name'].startswith('/naumi47-web-') and any(s.startswith('DATABASE_URL=') for s in d['Config'].get('Env',[])):
  bind=next(b for b in d['NetworkSettings']['Ports']['3000/tcp'] if b['HostIp']=='127.0.0.1')
  with urllib.request.urlopen('http://127.0.0.1:'+bind['HostPort']+'/api/health',timeout=8) as response:
   body=json.load(response);assert response.status==200 and body.get('db',{}).get('ok')==True
  rows.append({'id':d['Id'],'startedAt':d['State']['StartedAt'],'restartCount':d['RestartCount'],'health':200})
available=int(next(s.split()[1] for s in open('/proc/meminfo') if s.startswith('MemAvailable:')))*1024
assert available>=512*1024*1024,'MEDIA_CAPACITY_LOW'
print(json.dumps({'web':rows,'memAvailable':available}))
PY
"""
 before=remote(inventory,'before')[0];assert len(before['web'])==1;runtime=before['web'][0]
 options={'subjects':subjects,'pairs':pairs,'from':data['from'],'to':data['to'],'limit':1000}
 entry="""import {storageConfiguration} from CONFIG;
import {inspectMedia} from AUTHORIZE;
import {readAuthorizedMedia} from READER;
import {AwsClient} from 'aws4fetch';
import {createRequire} from 'node:module';
const config=storageConfiguration(process.env),{Pool}=createRequire('/app/package.json')('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,application_name:'enterprise-media-readonly'});
try{
 const authorized=await inspectMedia(pool,REGISTRY,{...OPTIONS,driver:config.driver,publicBase:config.publicBase});
 const signer=new AwsClient({accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey,region:config.region,service:'s3',retries:0});
 console.log(JSON.stringify({type:'authorization',observedAt:authorized.observedAt,items:authorized.items.length,requested:OPTIONS.pairs.length}));
 const result=await readAuthorizedMedia(authorized.items,config,(url,init)=>signer.sign(url,init),async item=>console.log(JSON.stringify({type:'media',...item})));
 console.log(JSON.stringify({type:'result',...result}));
}finally{await pool.end();}
"""
 for marker,value in [('CONFIG',str(root/'src/lib/object-storage/config.ts')),('AUTHORIZE',str(root/'scripts/lib/enterprise-records-snapshot.mjs')),('READER',str(root/'scripts/lib/enterprise-media-read.mjs')),('REGISTRY',registry),('OPTIONS',options)]:
  entry=entry.replace(marker,json.dumps(value,ensure_ascii=False))
 entryfile=out/'reader-entry.private.mjs';entryfile.write_text(entry,encoding='utf-8');bundle=out/'reader-bundle.private.mjs'
 builder="const {createRequire}=require('node:module');const esbuild=createRequire(process.argv[1])('esbuild');esbuild.buildSync({entryPoints:[process.argv[2]],outfile:process.argv[3],bundle:true,platform:'node',format:'esm',target:'node24',nodePaths:[process.argv[4]],logLevel:'silent'});"
 subprocess.run(['node','-e',builder,str(root/'services/enterprise-workflow/package.json'),str(entryfile),str(bundle),str(root/'services/enterprise-workflow/node_modules')],check=True,capture_output=True)
 storagekeys=['DATABASE_URL','STORAGE_DRIVER','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_BUCKET','S3_REGION','S3_FORCE_PATH_STYLE','S3_PUBLIC_BASE_URL','MEDIA_REMOTE_ACCESS','MEDIA_PRIVATE']
 script='set -eu\n'+"python3 - <<'ISOLATED_MEDIA'\n"+'''import subprocess,json,os,sys,uuid
from urllib.parse import urlsplit
runtime='''+repr(runtime)+'''
d=json.loads(subprocess.check_output(['docker','inspect',runtime['id']],text=True))[0]
assert d['State']['StartedAt']==runtime['startedAt'] and d['RestartCount']==runtime['restartCount'],'MEDIA_RUNTIME_CHANGED'
available=int(next(s.split()[1] for s in open('/proc/meminfo') if s.startswith('MemAvailable:')))*1024
assert available>=512*1024*1024,'MEDIA_CAPACITY_LOW'
envs=dict(s.split('=',1) for s in d['Config']['Env'] if '=' in s)
dbhost=urlsplit(envs['DATABASE_URL']).hostname;networks=[]
for network in d['NetworkSettings']['Networks']:
 nd=json.loads(subprocess.check_output(['docker','network','inspect',network],text=True))[0]
 for peer in nd.get('Containers',{}):
  pd=json.loads(subprocess.check_output(['docker','inspect',peer],text=True))[0];pe=pd['NetworkSettings']['Networks'].get(network,{})
  if dbhost in [pd['Name'].lstrip('/'),pe.get('IPAddress'),*(pe.get('Aliases') or []),*(pe.get('DNSNames') or [])]:networks.append(network)
networks=list(set(networks));assert len(networks)==1,'MEDIA_NETWORK_AMBIGUOUS'
keys='''+repr(storagekeys)+'''
env={**os.environ,**{k:envs[k] for k in keys if k in envs}};name='naumi-enterprise-media-read-'+uuid.uuid4().hex
cmd=['docker','run','--rm','--name',name,'-i','--read-only','--memory=128m','--memory-swap=128m','--cpus=0.25','--pids-limit=32','--cap-drop=ALL','--security-opt=no-new-privileges','--network',networks[0]]
for key in keys:
 if key in envs:cmd+=['-e',key]
cmd+=['-e','NODE_OPTIONS=','-e','NAUMI_RELEASE_RUNTIME=0','--entrypoint','node',d['Image'],'--max-old-space-size=64','--input-type=module']
try:p=subprocess.run(cmd,input='''+json.dumps(bundle.read_text('utf-8'),ensure_ascii=False)+'''.encode('utf-8'),env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
except subprocess.TimeoutExpired:
 subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 raise RuntimeError('MEDIA_ISOLATED_TIMEOUT')
assert len(p.stdout)<=48*1024*1024,'MEDIA_TRANSPORT_LIMIT'
sys.stdout.buffer.write(p.stdout)
if p.returncode:print('MEDIA_ISOLATED_FAILED',file=sys.stderr)
sys.exit(p.returncode)
ISOLATED_MEDIA
'''
 try:lines=remote(script,'media-read')
 finally:
  after=remote(inventory,'after')[0];(out/'RUNTIME.private.json').write_text(json.dumps({'before':before,'after':after}),encoding='utf-8')
  assert before['web']==after['web'],'MEDIA_RUNTIME_CONTINUITY_FAILED'
 media=[v for v in lines if v.get('type')=='media'];result=next(v for v in lines if v.get('type')=='result');authorization=next(v for v in lines if v.get('type')=='authorization')
 (out/'SOURCE_MEDIA.private.json').write_text(json.dumps({'instanceId':data['instanceId'],'enterpriseId':data['enterpriseId'],'observedAt':authorization['observedAt'],'sourceReadOnly':True,'sourceWrites':0,'media':media}),encoding='utf-8')
 (out/'RESULT.private.json').write_text(json.dumps({'authorization':authorization,'download':result,'continuity':True}),encoding='utf-8')
 print('SOURCE_MEDIA_READ_PASS: requested='+str(len(pairs))+' authorized='+str(authorization['items'])+' downloaded='+str(len(media))+' source_bytes='+str(result['totalBytes'])+' isolated_memory_mib=128 source_decode=0 web_started_at_unchanged=1 health=200 source_writes=0')

if __name__=='__main__':main()
