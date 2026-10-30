"""Paired local full-image comparison for the existing UI benchmark.
No production endpoints, existing DBs or paid submits; exact original app vs
candidate with matched runtime dependencies. Owned resources only, always clean.
"""
from pathlib import Path
import argparse,json,subprocess,time,uuid,hashlib,os,datetime

root=Path.cwd().resolve();parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--inputs');parser.add_argument('--private-media',choices=['0','1'],default='1');parser.add_argument('--candidate-manifest',default='output/refactor-r8c-20261030/image/BUILD_RESULT.json');parser.add_argument('--mode',choices=['paired','modified'],default='paired');parser.add_argument('--rounds',type=int,default=5);parser.add_argument('--repeats',type=int,default=3);args=parser.parse_args()
out=Path(args.out).resolve();assert root/'output' in out.parents and 1<=args.rounds<=5 and 2<=args.repeats<=10
out.mkdir(exist_ok=True);inputs=Path(args.inputs).resolve()if args.inputs else out;load=lambda name:json.loads((inputs/name).read_text('utf-8'));h=lambda b:hashlib.sha256(b).hexdigest();commands=[]
def command(label,cmd,expected=0,cwd=root):
 started=time.monotonic();q=subprocess.run(cmd,cwd=cwd,capture_output=True)
 row=dict(label=label,command=cmd,cwd=Path(cwd).as_posix(),exit=q.returncode,elapsedSeconds=time.monotonic()-started,stdout=q.stdout.decode('utf-8','replace'),stderr=q.stderr.decode('utf-8','replace'))
 commands.append(row);(out/'PERFORMANCE_COMMANDS.json').write_text(json.dumps(commands,indent=2)+'\n','utf-8');(out/(label+'.log')).write_bytes(q.stdout+q.stderr)
 if expected is not None:assert q.returncode==expected,row
 return q

def inspect(name):return json.loads(command('INSPECT_'+name,['docker','inspect',name]).stdout)[0]
def wait_ready(name,script):
 deadline=time.monotonic()+90
 while True:
  q=subprocess.run(['docker','exec','--env','NODE_OPTIONS=','--env','PERFORMANCE_OBSERVER_DIR=',name,'node','-e',script],capture_output=True)
  if q.returncode==0:return
  assert inspect(name)['State']['Running'] and time.monotonic()<deadline,(name,q.stdout.decode('utf-8','replace'),q.stderr.decode('utf-8','replace'))
  time.sleep(.3)

candidate=json.loads(Path(args.candidate_manifest).read_text('utf-8'));reference=load('COMPARISON_INPUT.json')
original=load('ORIGINAL_BUILD_RESULT.json')if args.mode=='paired'else None
assert candidate['status']=='PASS'
if original:assert original['status']=='PASS' and original['variant']in ['original-application-matched-current-runtime-dependencies','original-application-original-pinned-dependencies']
for name,digest in candidate['source']['hashes'].items():
 if name.startswith(('src/','services/')):assert h((root/name).read_bytes())==digest,'CANDIDATE_APPLICATION_DRIFT:'+name
fixture=root/'scripts/verification/refactor-performance-fixture.ts'
compile_js="""import{build}from'esbuild';import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';const[entry,source,out,empty]=process.argv.slice(1);const result=await build({entryPoints:[entry],outfile:out+'/fixture.cjs',absWorkingDir:source,tsconfig:source+'/tsconfig.json',bundle:true,metafile:true,platform:'node',target:'node24',format:'cjs',external:['pg','sharp'],alias:{'server-only':empty}});fs.writeFileSync(out+'/FIXTURE_SOURCE.json',JSON.stringify({hashes:Object.fromEntries(Object.keys(result.metafile.inputs).filter(p=>fs.existsSync(path.resolve(source,p))).map(p=>[path.resolve(source,p),createHash('sha256').update(fs.readFileSync(path.resolve(source,p))).digest('hex')]))},null,2));console.log('PERF_FIXTURE_COMPILE=PASS');"""
compiled={}
for mode,source,manifest in ([('baseline',inputs/'original-source',original)]if original else[])+[('modified',root,candidate)]:
 target=out/('fixture-'+mode);target.mkdir();command('COMPILE_'+mode,['node','--input-type=module','-e',compile_js,str(fixture),str(source),str(target),str(root/'scripts/fleet-server-only.cjs')])
 source_hashes=manifest['sourceHashes']if mode=='baseline'else manifest['source']['hashes']
 for name,digest in json.loads((target/'FIXTURE_SOURCE.json').read_text('utf-8'))['hashes'].items():
  file=Path(name)
  if source/'src' in file.parents:
   relative=file.relative_to(source).as_posix();assert source_hashes[relative]==digest,'FIXTURE_SOURCE_MISMATCH:'+relative
 compiled[mode]=target
provider=out/'provider.mjs';provider.write_text("import http from 'node:http';let requests=[];http.createServer((req,res)=>{if(req.url==='/fixture/stats'){res.setHeader('content-type','application/json');res.end(JSON.stringify({requests,calls:requests.length}));return;}requests.push({url:req.url,method:req.method});res.statusCode=503;res.end('unused isolated supplier');}).listen(3300,'0.0.0.0');\n",'utf-8')
results=[];cleanups=[]
def run_mode(round,mode):
 token='refactor-r8d-'+uuid.uuid4().hex[:10];schema='r8d_'+uuid.uuid4().hex;directory=out/('round-'+str(round)+'-'+mode);directory.mkdir();(directory/'media').mkdir()
 manifest=original if mode=='baseline' else candidate;image=manifest['imageId'];names={};network=False
 common={'DATABASE_URL':'postgresql://fixture:r8d-local-only@db:5432/refactor_performance_fixture','PGOPTIONS':'-c search_path='+schema,'NAUMI_VERIFY_ISOLATED_DB':'1','SETTINGS_SECRET':'r8d-isolated-settings-fixture-only-20261030','MODEL_CONFIG_ENVELOPE_SECRET':'r8d-isolated-model-envelope-fixture-only','MODEL_CONFIG_TRUSTED_ORIGINS':'http://provider:3300','NAUMI_ROUTER_MANAGEMENT_URL':'http://provider:3300','NAUMI_ROUTER_MANAGEMENT_TOKEN':'local-unused','NAUMI_MULTI_USER':'1','NAUMI_AUTH_LOGIN_ONLY':'0','NAUMI_AUTH_COOKIE_SECURE':'0','FLEET_PORTAL_ONLY':'0','NAUMI_APPLICATION_TASK_EXECUTION':'worker','NAUMI_VIDEO_WORKER':'0','STORAGE_DRIVER':'local','MEDIA_DIR':'/fixture-media','MEDIA_PRIVATE':args.private_media,'OPENAI_API_KEY':'unused-local-only','OPENAI_BASE_URL':'http://provider:3300/v1','OPENAI_IMAGE_MODEL':'image-a','OPENAI_IMAGE_MODELS':'image-a','VIDEO_WORKER_SECRET':'r8d-isolated-worker-secret-only-20261030','RELEASE_CONTROL_SECRET':'r8d-isolated-release-secret-only-20261030','SOURCE_COMMIT':manifest['source']if isinstance(manifest['source'],str)else manifest['source']['commit'],'INTERNAL_APP_ORIGIN':'http://web:3000'}
 def mount(source,target,readonly=False):return['--mount','type=bind,src='+str(source)+',dst='+target+(',readonly'if readonly else'')]
 shared=mount(directory,'/evidence')+mount(directory/'media','/fixture-media')
 def start(role,image,env,run=None,extra=None):
  name=token+'-'+role;cmd=['docker','run','-d','--name',name,'--network',token,'--network-alias',role,'--label','naumi.fixture='+token]
  for key,value in env.items():cmd+=['-e',key+'='+str(value)]
  cmd+=(extra or[])+[image]+(run or[]);command('START_'+name,cmd);names[role]=name;return name
 try:
  command('NETWORK_'+token,['docker','network','create','--label','naumi.fixture='+token,token]);network=True
  db=start('db','postgres:16-alpine',{'POSTGRES_USER':'fixture','POSTGRES_PASSWORD':'r8d-local-only','POSTGRES_DB':'refactor_performance_fixture'},extra=['--memory','384m','--cpus','1'])
  end=time.monotonic()+40
  while subprocess.run(['docker','exec',db,'pg_isready','-U','fixture','-d','refactor_performance_fixture'],capture_output=True).returncode:
   assert time.monotonic()<end;time.sleep(.3)
  command('SCHEMA_'+token,['docker','exec',db,'psql','-U','fixture','-d','refactor_performance_fixture','-c','CREATE SCHEMA '+schema])
  supplier=start('provider',candidate['imageId'],{},['node','/performance-provider.mjs'],['--memory','128m','--read-only']+mount(provider,'/performance-provider.mjs',True))
  setup=start('setup','naumi-refactor-performance:dependencies-current',{**common,'NODE_PATH':'/app/node_modules'},['node','/performance/fixture.cjs'],['--user','1001:1001','--memory','768m','--tmpfs','/data:rw,size=32m,mode=777']+shared+mount(compiled[mode],'/performance',True))
  exit=int(command('SETUP_WAIT_'+token,['docker','wait',setup]).stdout.strip());log=command('SETUP_'+token,['docker','logs',setup]);assert exit==0,log.stdout.decode('utf-8','replace')
  before=json.loads((directory/'SETUP.json').read_text('utf-8'))
  web=start('web',image,{**common,'NAUMI_RELEASE_RUNTIME':'1','NAUMI_RELEASE_ADMISSION_START':'open','NAUMI_INSTANCE_ID':token,'NODE_PATH':'/app/node_modules','NODE_OPTIONS':'--require=/app/scripts/release-http-observer.cjs --require=/performance-observer.cjs','PERFORMANCE_OBSERVER_DIR':'/evidence'},extra=['-p','127.0.0.1::3000','--memory','1536m','--cpus','2','--read-only','--tmpfs','/tmp:rw,size=128m,mode=1777','--tmpfs','/data:rw,size=32m,mode=777']+shared+mount(root/'scripts/verification/performance-observer.cjs','/performance-observer.cjs',True))
  wait_ready(web,"fetch('http://127.0.0.1:3000/api/health').then(async r=>{const b=await r.json();process.exit(r.ok&&b.db.ok?0:1)}).catch(()=>process.exit(1))")
  info=inspect(web);assert info['Image']==image;port=info['NetworkSettings']['Ports']['3000/tcp'][0];assert port['HostIp']=='127.0.0.1'
  (directory/'INPUT.json').write_text(json.dumps(dict(mode=mode,round=round,source=common['SOURCE_COMMIT'],image=image,container=web,variant=manifest.get('variant','complete-production-candidate'),fixtureHashes=[item['sha256']for item in before['media']],nodeCount=320,privateMedia=args.private_media,observerSha256=h((root/'scripts/verification/performance-observer.cjs').read_bytes())),indent=2)+'\n','utf-8')
  cmd=['node','scripts/benchmark-ui-performance.mjs','--base','http://127.0.0.1:'+port['HostPort'],'--mode',mode,'--container',web,'--out',str(directory),'--repeats',str(args.repeats)]
  print('PERFORMANCE_ROUND_START='+str(round)+' MODE='+mode,flush=True);command('BROWSER_'+token,cmd)
  sql="SELECT json_build_object('artworks',(SELECT count(*) FROM "+schema+".app_artworks),'texts',(SELECT count(*) FROM "+schema+".app_canvas_text_nodes),'consumes',(SELECT count(*) FROM "+schema+".app_ledger WHERE kind='consume'));"
  after=json.loads(command('FINAL_STATE_'+token,['docker','exec',db,'psql','-U','fixture','-d','refactor_performance_fixture','-Atc',sql]).stdout);assert after==before['counts'],after
  supplierStats=command('SUPPLIER_'+token,['docker','exec',supplier,'node','-e',"fetch('http://127.0.0.1:3300/fixture/stats').then(r=>r.text()).then(console.log)"])
  providerReport=json.loads(supplierStats.stdout);assert providerReport['calls']==0,providerReport
  report=json.loads((directory/'PERFORMANCE.json').read_text('utf-8'));report.update(round=round,source=common['SOURCE_COMMIT'],image=image,fixtureUnchanged=True,supplierCalls=0)
  (directory/'PERFORMANCE.json').write_text(json.dumps(report,indent=2)+'\n','utf-8');results.append(report)
  (out/'SAMPLES_ACCEPTED.json').write_text(json.dumps(results,indent=2)+'\n','utf-8');print('PERFORMANCE_ROUND_MEASURED='+str(round)+' MODE='+mode+' READS=60 PREPARES=30 SUPPLIER=0 CONSUME=0',flush=True)
 finally:
  cleanup=[]
  for role,name in reversed(list(names.items())):
   info=inspect(name);assert info['Config']['Labels'].get('naumi.fixture')==token
   command('LOG_'+name,['docker','logs',name],expected=None)
   if info['State']['Running']:command('STOP_'+name,['docker','stop','--time','15',name])
   command('REMOVE_'+name,['docker','rm','-v',name]);cleanup.append(name)
  if network:command('REMOVE_NETWORK_'+token,['docker','network','rm',token])
  cleanups.append(dict(status='PASS',task=token,removed=cleanup,networkRemoved=network));(directory/'CLEANUP.json').write_text(json.dumps(cleanups[-1],indent=2)+'\n','utf-8');(out/'CLEANUP.json').write_text(json.dumps(dict(status='PASS',runs=cleanups),indent=2)+'\n','utf-8')

try:
 for round in range(args.rounds):
  for mode in (['modified']if not original else(['baseline','modified']if round%2==0 else['modified','baseline'])):run_mode(round,mode)
 (out/'PERFORMANCE_RESULT.json').write_text(json.dumps(dict(status='MEASURED'if original else'CALIBRATION_ONLY',rounds=args.rounds,repeats=args.repeats,modes=2 if original else 1,original=original['source']if original else None,candidate=candidate['source']['commit'],samples=len(results),businessScope='320node labUI+realHTTP prepare/read;not provider execution/enqueue capacity',wholeGoal='ACTIVE',deployed=False,time=datetime.datetime.now(datetime.timezone.utc).isoformat()),indent=2)+'\n','utf-8')
 print('REFACTOR_PAIRED_PERFORMANCE=MEASURED ROUNDS='+str(args.rounds)+' STACKS='+str(len(results))+' REAL_HTTP=1 REAL_PG=1 PAID_SUBMITS=0',flush=True)
except Exception as error:
 (out/'PERFORMANCE_FAILURE.json').write_text(json.dumps(dict(status='FAIL',error=str(error),measuredStacks=len(results),cleanups=cleanups),indent=2)+'\n','utf-8');raise
