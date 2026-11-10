"""Run original native application cases against an immutable full Linux App.

The SDK has no Docker socket or external network. PG shares its private network
namespace; cases borrow a verified loopback pool and retain their assertions.
"""
from pathlib import Path
import argparse,hashlib,json,os,shutil,subprocess,sys,time,uuid

sys.stdout.reconfigure(encoding='utf-8')
root=Path.cwd().resolve()
parser=argparse.ArgumentParser()
sub=parser.add_subparsers(dest='action',required=True)
prepare=sub.add_parser('prepare');prepare.add_argument('--image-manifest',required=True);prepare.add_argument('--out',required=True)
execute=sub.add_parser('run');execute.add_argument('--sdk-manifest',required=True);execute.add_argument('--case',choices=['audio','timeline','timeline-api','timeline-matrix','scene','character','director','storyboard','storyboard-flow','storyboard-recovery'],required=True);execute.add_argument('--out',required=True)
args=parser.parse_args();out=Path(args.out).resolve()
assert root/'output' in out.parents,'OUTPUT_MUST_BE_UNDER_WORKSPACE_OUTPUT'
out.mkdir(parents=True,exist_ok=True);assert not any(out.iterdir()),'OUTPUT_MUST_BE_NEW_OR_EMPTY'
events=[]
def write(name,value): (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n','utf-8')
def run(cmd,label=None,required=True):
 p=subprocess.run(cmd,cwd=root,capture_output=True,encoding='utf-8',errors='replace')
 row=dict(command=cmd,exit=p.returncode,stdout=p.stdout,stderr=p.stderr);events.append(row);write('EVENTS.json',events)
 if label:(out/(label+'.log')).write_text('COMMAND='+json.dumps(cmd)+'\n'+p.stdout+p.stderr+'\nEXIT='+str(p.returncode)+'\n','utf-8')
 if required:assert p.returncode==0,row
 return p
def identity():
 return json.loads(run(['node','--input-type=module','-e',"import{sourceIdentity}from'./scripts/verification/refactor-runner.mjs';console.log(JSON.stringify(await sourceIdentity(process.cwd())))"]).stdout)
def image(name):return json.loads(run(['docker','image','inspect',name]).stdout)[0]
def inspect(name):return json.loads(run(['docker','inspect',name]).stdout)[0]
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def source_unchanged(before):
 after=identity();assert before['commit']==after['commit'] and before['digest']==after['digest'] and not after['dirty'],'SOURCE_CHANGED'
def mount(p,target):return ['--mount','type=bind,src='+str(p)+',dst='+target]
def app_probe(prefix):
 return "const fs=require('node:fs'),c=require('node:crypto');const p="+json.dumps(prefix)+";const m=JSON.parse(fs.readFileSync(p+'/dist/worker/manifest.json'));const h=f=>c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(h(p+'/dist/worker/'+m.entry)!==m.sha256)throw Error('WORKER_BYTES');console.log(JSON.stringify({server:h(p+'/server.js'),buildId:fs.readFileSync(p+'/.next/BUILD_ID','utf8'),worker:m.sha256,node:process.version}));"

if args.action=='prepare':
 before=identity();assert not before['dirty'],'CLEAN_FIXED_SOURCE_REQUIRED'
 manifest=json.loads(Path(args.image_manifest).read_text('utf-8'))
 assert manifest['status']=='PASS' and manifest['source']['commit']==before['commit'] and manifest['source']['digest']==before['digest'],'CURRENT_FULL_IMAGE_REQUIRED'
 app=image(manifest['imageId']);assert app['Id']==manifest['imageId'] and app['Config']['Labels']['io.naumi.source.digest']==before['digest']
 assert image(manifest['tag'])['Id']==app['Id'],'FIXED_APP_TAG_CHANGED'
 context=out/'context';context.mkdir();source=context/'source';source.mkdir()
 for name,expected in before['hashes'].items():
  p=root/name;assert not p.is_symlink() and p.is_file() and digest(p)==expected,name
  target=source/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
 shutil.copyfile(root/'scripts/video-fusion/Dockerfile.native-application',context/'Dockerfile')
 write('SOURCE.json',before)
 tag='naumi-native-application:'+before['digest'][:20]
 write('SDK_RESULT.json',dict(status='RUNNING',source=before,fullApplication=manifest,tag=tag))
 try:
  run(['docker','build','--build-arg','FIXED_APP_IMAGE='+manifest['tag'],'--label','naumi.task=refactor-native-application','--label','io.naumi.source.digest='+before['digest'],'-t',tag,str(context)],'BUILD')
  sdk=image(tag);assert sdk['Config']['Labels']['io.naumi.source.digest']==before['digest']
  expected=json.loads(run(['docker','run','--rm','--network','none','--read-only','--entrypoint','node',app['Id'],'-e',app_probe('/app')],'APP_PROBE').stdout)
  observed=json.loads(run(['docker','run','--rm','--network','none','--read-only','--entrypoint','node',sdk['Id'],'-e',app_probe('/fixed-app')],'SDK_APP_PROBE').stdout);assert expected==observed,'SDK_ALTERED_FIXED_APPLICATION'
  probe="const fs=require('node:fs'),c=require('node:crypto');const m=JSON.parse(fs.readFileSync('/expected.json'));for(const[n,h]of Object.entries(m.hashes)){if(c.createHash('sha256').update(fs.readFileSync('/fixture/'+n)).digest('hex')!==h)throw Error('SDK_SOURCE_DRIFT:'+n)}console.log('NATIVE_SDK_SOURCE=PASS FILES='+m.files);"
  run(['docker','run','--rm','--network','none','--read-only',*mount(out/'SOURCE.json','/expected.json'), '--entrypoint','node',sdk['Id'],'-e',probe],'SDK_SOURCE_PROBE')
  assert image(manifest['tag'])['Id']==app['Id'];source_unchanged(before)
  result=dict(status='PASS',source=before,sdkImageId=sdk['Id'],tag=tag,applicationImageId=app['Id'],applicationVersion=manifest['version'],applicationProbe=observed,productionDockerfile=True,applicationUnmodified=True,networkAtRuntime='none',dockerSocketMounted=False)
  write('SDK_RESULT.json',result);print('NATIVE_APPLICATION_SDK=PASS SOURCE='+before['commit']+' APPLICATION_IMAGE='+app['Id']+' SDK_IMAGE='+sdk['Id']+' APP_BYTES=EXACT')
 except Exception as error:
  write('SDK_FAILURE.json',dict(status='FAIL',error=str(error)));raise
else:
 sdk=json.loads(Path(args.sdk_manifest).read_text('utf-8'));before=identity()
 assert sdk['status']=='PASS' and sdk['source']['commit']==before['commit'] and sdk['source']['digest']==before['digest'] and not before['dirty'],'EXACT_NATIVE_SDK_SOURCE_REQUIRED'
 assert image(sdk['sdkImageId'])['Id']==sdk['sdkImageId'] and image(sdk['sdkImageId'])['Config']['Labels']['io.naumi.source.digest']==before['digest']
 token='native-fixed-'+uuid.uuid4().hex[:12];names={key:token+'-'+key for key in ['sdk','pg']};owned=[];ids={};code=1
 database='naumi_video_fixture_storyboard_director' if args.case=='storyboard' else 'naumi_video_fixture_fixed_'+uuid.uuid4().hex;password=uuid.uuid4().hex+uuid.uuid4().hex
 def start(role,cmd):
  cid=run(cmd,'START_'+role.upper()).stdout.strip();owned.append(role);ids[role]=cid
  data=inspect(cid);assert data['Id']==cid and data['Config']['Labels']['naumi.task']==token
  return cid
 try:
  test_mounts=[];test_adapter=None
  if args.case=='storyboard':
   controller=Path(__file__).resolve().parent
   adapter=controller/'verify-storyboard-dialogue-application.ts';recordings=controller/'video-trials/fixtures'
   test_adapter=dict(path=str(adapter),sha256=digest(adapter),fixtures={p.name:digest(p) for p in sorted(recordings.iterdir()) if p.is_file()},reason='Portable imported speech fixtures; fixed App unchanged and original business assertions retained')
   test_mounts=mount(adapter,'/fixture/scripts/verify-storyboard-dialogue-application.ts')+mount(recordings,'/fixture/scripts/video-trials/fixtures')
   test_mounts=[part+',readonly' if part.startswith('type=bind,') else part for part in test_mounts]
  if args.case in ['storyboard-flow','storyboard-recovery']:
   adapter=Path(__file__).resolve().parent/'verify-storyboard-flow-native-application.ts'
   recordings=Path(__file__).resolve().parent/'video-trials/fixtures'
   test_adapter=dict(path=str(adapter),sha256=digest(adapter),fixtures={p.name:digest(p) for p in sorted(recordings.iterdir()) if p.is_file()},reason='Full native Canvas flow test only; fixed App bytes unchanged')
   test_mounts=mount(adapter,'/fixture/scripts/verify-storyboard-flow-native-application.ts')+mount(recordings,'/fixture/scripts/video-trials/fixtures')
   if args.case=='storyboard-recovery':
    companion=Path(__file__).resolve().parent/'verify-storyboard-recovery-native.ts'
    test_adapter['companionScripts']={companion.name:digest(companion)}
    test_mounts+=mount(companion,'/fixture/scripts/verify-storyboard-recovery-native.ts')
   test_mounts=[part+',readonly' if part.startswith('type=bind,') else part for part in test_mounts]
  start('sdk',['docker','run','-d','--init','--name',names['sdk'],'--label','naumi.task='+token,'--network','none','--read-only','--memory','3g','--cpus','2','--shm-size','256m','--tmpfs',('/tmp:rw,size=1536m,mode=1777' if args.case in ['storyboard','storyboard-flow','storyboard-recovery'] else '/tmp:rw,size=512m,mode=1777'),'--tmpfs','/fixed-app/.next/cache:rw,size=128m,mode=777',*mount(out,'/fixture/output'),*test_mounts,sdk['sdkImageId']])
  start('pg',['docker','run','-d','--name',names['pg'],'--label','naumi.task='+token,'--network','container:'+ids['sdk'],'--memory','768m','--cpus','2','--tmpfs','/var/lib/postgresql/data:rw,size=1g','-e','POSTGRES_USER=fixture','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_DB='+database,'postgres:16-alpine','-c','listen_addresses=127.0.0.1'])
  deadline=time.monotonic()+60
  while run(['docker','exec',ids['pg'],'pg_isready','-h','127.0.0.1','-U','fixture','-d',database],required=False).returncode:
   assert time.monotonic()<deadline,'PG_TCP_READINESS';time.sleep(.3)
  run(['docker','exec',ids['pg'],'psql','-X','-U','fixture','-d',database,'-v','ON_ERROR_STOP=1','-c',"CREATE TABLE public.naumi_video_fixture_guard(owner text NOT NULL);INSERT INTO public.naumi_video_fixture_guard VALUES('canvas-video-fusion-20261013');"],'GUARD')
  data=inspect(ids['sdk']);pg=inspect(ids['pg']);assert data['HostConfig']['NetworkMode']=='none' and pg['HostConfig']['NetworkMode']=='container:'+ids['sdk'];assert not data['HostConfig'].get('PortBindings') and not pg['HostConfig'].get('PortBindings')
  assert all(x['Destination'] not in ['/var/run/docker.sock','/run/docker.sock']for x in data['Mounts'])
  url='postgresql://fixture:'+password+'@127.0.0.1:5432/'+database
  env={'NATIVE_FIXTURE_DATABASE_URL':url,'NAUMI_VERIFY_ISOLATED_DB':'1','VIDEO_FIXTURE_BUILT_APP_ROOT':'/fixed-app','VIDEO_FIXTURE_BUILT_SOURCE_COMMIT':before['commit'],'VIDEO_FIXTURE_BUILT_VERSION':str(sdk['applicationVersion']),'NODE_OPTIONS':'','NODE_ENV':'development','LIBGL_ALWAYS_SOFTWARE':'1'}
  # The original storyboard suite accepts one guarded disposable database name.
  # It remains inside this runner's private namespace, with no published port.
  if args.case=='storyboard':env.update(STORYBOARD_NATIVE_FIXTURE_URL=url,VIDEO_FIXTURE_OUTPUT_ROOT='/tmp/storyboard-fixed-fixture')
  command=['docker','exec']
  for k,v in env.items():command+=['-e',k+'='+v]
  entry='timeline'if args.case.startswith('timeline')else args.case
  script='scripts/verify-storyboard-application.ts' if args.case=='storyboard' else 'scripts/verify-'+entry+'-native-application.ts'
  if args.case=='storyboard-recovery':script='scripts/verify-storyboard-flow-native-application.ts'
  command+=[ids['sdk'],'node','--conditions=react-server','--import','tsx',script,'/fixture/output/case']
  if args.case=='storyboard-recovery':command+=['--with-recovery']
  if args.case=='timeline':command+=['--ui-only']
  if args.case=='timeline-matrix':command+=['--matrix-only']
  if args.case=='audio':command+=['--with-matrix']
  write('INPUT.json',dict(source=before['commit'],sourceDigest=before['digest'],applicationImage=sdk['applicationImageId'],sdkImage=sdk['sdkImageId'],case=args.case,testAdapter=test_adapter,parentOwnsPG=True,sdkNetwork='none',pgNamespace=ids['sdk'],publishedPorts=0,dockerSocketMounted=False,ownedIds=ids))
  child=run(command,'NATIVE_CASE',required=False);code=child.returncode;print(child.stdout+child.stderr,flush=True)
  assert code==0,'ORIGINAL_NATIVE_CASE_FAILED'
  if args.case=='storyboard':
   result=json.loads((out/'case/RESULT.json').read_text('utf-8'))
   assert result['realApp'] and result['realPostgres'] and result['actualMediaWorker'] and result['realBilling'] and result['realSupplierCalls']==0
   assert 'STORYBOARD_APP_CLEANUP=OWN_FIXTURE_REMOVED' in child.stdout,'STORYBOARD_CHILD_CLEANUP_MISSING'
  else:
   cleanup=json.loads((out/'case/CLEANUP.json').read_text('utf-8'));assert cleanup['status']=='PASS'
  if args.case in ['storyboard-flow','storyboard-recovery']:
   flow_result=json.loads((out/'case/RESULT.json').read_text('utf-8'))
   assert flow_result['status']=='PASS' and len(flow_result['checks'])>=13 and flow_result['realBrowser'] and flow_result['realApp'] and flow_result['realPostgres'] and flow_result['realSupplierCalls']==0,'FULL_FLOW_RESULT_REQUIRED'
   assert digest(adapter)==test_adapter['sha256'] and {p.name:digest(p) for p in sorted(recordings.iterdir()) if p.is_file()}==test_adapter['fixtures'],'TEST_ADAPTER_CHANGED'
  elif test_adapter:
   assert digest(adapter)==test_adapter['sha256'] and {p.name:digest(p) for p in sorted(recordings.iterdir()) if p.is_file()}==test_adapter['fixtures'],'TEST_ADAPTER_CHANGED'
  if args.case=='storyboard-recovery':
   assert digest(companion)==test_adapter['companionScripts'][companion.name],'TEST_COMPANION_CHANGED'
   assert len(flow_result['checks'])>=19 and json.loads((out/'case/recovery/RESULT.json').read_text('utf-8'))['status']=='PASS','RECOVERY_MATRIX_REQUIRED'
  source_unchanged(before)
  write('RESULT.json',dict(status='PASS',case=args.case,source=before['commit'],sourceDigest=before['digest'],applicationImage=sdk['applicationImageId'],sdkImage=sdk['sdkImageId'],testAdapter=test_adapter,originalAssertions=args.case not in ['storyboard-flow','storyboard-recovery'],fullFlowAssertions=args.case in ['storyboard-flow','storyboard-recovery'],actualFullApplication=True,realPG=True,parentDatabaseRetainedUntilCaseExit=True,paidProviderCalls=0,externalNetwork=False))
  print('NATIVE_FIXED_APPLICATION=PASS CASE='+args.case+' SOURCE='+before['commit']+(' FULL_FLOW_ASSERTIONS=1' if args.case in ['storyboard-flow','storyboard-recovery'] else ' ORIGINAL_ASSERTIONS=1')+' FULL_APP=1 REAL_PG=1 EXTERNAL_NETWORK=0')
 except Exception as error:
  write('FAILURE.json',dict(status='FAIL',case=args.case,error=str(error)));raise
 finally:
  cleaned=[]
  for role in reversed(owned):
   data=inspect(ids[role]);assert data['Id']==ids[role] and data['Config']['Labels']['naumi.task']==token
   run(['docker','logs',ids[role]],'FINAL_LOG_'+role.upper(),required=False)
   if data['State']['Running']:run(['docker','stop','--timeout','15',ids[role]],'STOP_'+role.upper())
   final=inspect(ids[role]);run(['docker','rm','-v',ids[role]],'REMOVE_'+role.upper())
   assert not run(['docker','ps','-aq','--no-trunc','--filter','id='+ids[role]]).stdout.strip()
   cleaned.append(dict(role=role,id=ids[role],name=names[role],exit=final['State']['ExitCode'],absent=True))
  write('CLEANUP.json',dict(status='PASS',ownedOnly=True,resources=cleaned,pgTmpfsDiscarded=True,externalResourcesTouched=False))
  print('NATIVE_FIXED_CLEANUP=PASS OWN_CONTAINERS_REMOVED=1 PG_TMPFS_DISCARDED=1')
