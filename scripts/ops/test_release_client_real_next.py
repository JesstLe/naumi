#!/usr/bin/env python3
"""Local real Next old/new Docker fixture controller. No SSH or production data.

Run assets first into $NAUMI_REAL_COMPAT_OUTPUT/all-real-static-union. Then start,
run test_release_client_real_next.mjs, inspect memory, and cleanup. All containers
are fixture-labeled and isolated on their own network/database. No model keys.
"""
import json,pathlib,subprocess,time,urllib.request,urllib.error,uuid,sys,os,hashlib,datetime
ROOT=pathlib.Path(os.environ.get('NAUMI_REAL_COMPAT_OUTPUT','output/client-compat47-real-next-20261016')).resolve(); STATE=ROOT/'runtime.json'
def run(args):
 r=subprocess.run(args,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(str(args[:3])+': '+r.stderr[-1500:])
 return r.stdout.strip()
def read(url,data=None):
 req=urllib.request.Request(url,data=json.dumps(data).encode()if data is not None else None,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30)as r:return json.load(r)
def wait(fn,label):
 for _ in range(90):
  try:
   value=fn()
   if value:return value
  except Exception:pass
  time.sleep(.5)
 raise RuntimeError('Timeout '+label)
def write_config(s,phase):
 app=s[phase]
 body='''worker_processes 1;pid /tmp/compat-next.pid;error_log stderr;events {worker_connections 256;}http {access_log off;include /etc/nginx/mime.types;default_type application/octet-stream;server {listen 80;client_max_body_size 20m;location ^~ /_next/static/ {alias /fixture/all-real-static-union/_next/static/;add_header Cache-Control "public, max-age=31536000, immutable" always;}location ~ ^/api/(generate-image|imagegen|suite|aplus|video/worker|canvas/(text-generate|text-edit|assistant|image-tasks)) {return 418;}location / {proxy_pass http://APP:3000;proxy_http_version 1.1;proxy_set_header Host $host;proxy_set_header X-Forwarded-Proto $scheme;proxy_set_header X-Real-IP $remote_addr;proxy_set_header Connection "";proxy_buffering off;proxy_read_timeout 90s;add_header X-Compat-Upstream PHASE always;}}}'''.replace('APP',app).replace('PHASE',phase)
 (ROOT/'nginx.conf').write_bytes(body.encode())
def start_web(s,phase,image):
 env={'DATABASE_URL':'postgresql://fixture:fixture-local-only@'+s['pg']+':5432/compat?sslmode=disable','SETTINGS_SECRET':'compat-real-next-only-random-fixture-secret-20261016','VIDEO_WORKER_SECRET':'compat-real-next-only-worker-secret-20261016','NAUMI_VIDEO_WORKER':'0','NAUMI_MULTI_USER':'1','NAUMI_EDITION':'pro','NODE_OPTIONS':'--max-old-space-size='+os.environ.get('NAUMI_REAL_COMPAT_HEAP_MB','1024'),'NEXT_TELEMETRY_DISABLED':'1','HOSTNAME':'0.0.0.0','PORT':'3000','MEDIA_DIR':'/data/media','MEDIA_PRIVATE':'1','NAUMI_STAGING_HISTORY_GUARD':'0','AGENT_API_KEY':'','AGENT_BASE_URL':'','OPENAI_API_KEY':'','OPENAI_BASE_URL':'','NEW_API_IMAGE_API_KEY':'','NEW_API_IMAGE_BASE_URL':'','VIDEO_API_KEY':'','VIDEO_API_BASE_URL':'','REFERENCE_VISION_SOURCE':'','NAUMI_ROUTER_GENERATION_URL':'','NAUMI_ROUTER_GENERATION_TOKEN':'','INTERNAL_APP_ORIGIN':'http://127.0.0.1:3000'}
 if phase in ['new','variantunified'] and os.environ.get('NAUMI_REAL_COMPAT_CONTROLLED_NEW')=='1':
  env.update({'NAUMI_RELEASE_RUNTIME':'1','NAUMI_INSTANCE_ID':'compat-'+phase+'-'+s['tag'],'RELEASE_CONTROL_SECRET':'compat-release-'+s['tag']+'-only-independent-fixture-secret','NAUMI_RELEASE_ADMISSION_START':'open','NODE_OPTIONS':env['NODE_OPTIONS']+' --require=/app/scripts/release-http-observer.cjs'})
  s['controlledNew']=True;s['releaseInstanceId']=env['NAUMI_INSTANCE_ID'];s['releaseSecret']=env['RELEASE_CONTROL_SECRET']
 memory=os.environ.get('NAUMI_REAL_COMPAT_WEB_MEMORY','1536m')
 args=['docker','run','-d','--name',s[phase],'--label','io.naumi.real-next-compat='+s['tag'],'--network',s['network'],'--memory',memory,'--memory-swap',memory,'--cpus','1.5','--pids-limit','192','-p','127.0.0.1::3000','--tmpfs','/tmp:rw,size=64m']
 for k,v in env.items():args+=['-e',k+'='+v]
 args+=[image];run(args);s['created'].append(s[phase]);STATE.write_text(json.dumps(s,indent=2));port=run(['docker','port',s[phase],'3000/tcp']).split(':')[-1];s[phase+'Port']=int(port);STATE.write_text(json.dumps(s,indent=2));return wait(lambda:read('http://127.0.0.1:'+port+'/api/version'),'web '+phase)
mode=sys.argv[1]
ROOT.mkdir(parents=True,exist_ok=True)
if mode=='start':
 assert not STATE.exists(),'Runtime already exists'
 tag=uuid.uuid4().hex[:8];s={'tag':tag,'network':'real-next-compat-'+tag,'pg':'real-next-pg-'+tag,'old':'real-next-old-'+tag,'new':'real-next-new-'+tag,'gateway':'real-next-nginx-'+tag,'created':[],'candidateImage':os.environ.get('NAUMI_REAL_COMPAT_NEW_IMAGE','naumi:release47-5405d23fa37a'),'oldImage':os.environ.get('NAUMI_REAL_COMPAT_OLD_IMAGE','sha256:c952f4a407e0404e86c950003c905c1bf26f877b6b6a2558118d70dd534c9737')}
 s['candidateImageId']=run(['docker','image','inspect',s['candidateImage'],'--format','{{.Id}}']);s['oldImageId']=run(['docker','image','inspect',s['oldImage'],'--format','{{.Id}}']);assert (ROOT/'all-real-static-union/manifest.json').is_file(),'Prepare real static union first';STATE.write_text(json.dumps(s,indent=2));run(['docker','network','create',s['network']]);run(['docker','run','-d','--name',s['pg'],'--label','io.naumi.real-next-compat='+tag,'--network',s['network'],'--memory','192m','--memory-swap','192m','--cpus','.5','--pids-limit','96','-e','POSTGRES_USER=fixture','-e','POSTGRES_PASSWORD=fixture-local-only','-e','POSTGRES_DB=compat','postgres:16-alpine','postgres','-c','shared_buffers=24MB','-c','max_connections=32']);s['created'].append(s['pg']);STATE.write_text(json.dumps(s,indent=2));wait(lambda:subprocess.run(['docker','exec',s['pg'],'pg_isready','-U','fixture','-d','compat'],capture_output=True).returncode==0,'pg');version=start_web(s,'old',s['oldImage']);s['oldVersion']=version
 write_config(s,'old');run(['docker','run','-d','--name',s['gateway'],'--label','io.naumi.real-next-compat='+tag,'--network',s['network'],'--memory','128m','--memory-swap','128m','--cpus','.5','--pids-limit','64','-p','127.0.0.1::80','-v',str(ROOT)+':/fixture:ro','nginx:1.27-alpine','nginx','-c','/fixture/nginx.conf','-g','daemon off;']);s['created'].append(s['gateway']);s['origin']='http://127.0.0.1:'+run(['docker','port',s['gateway'],'80/tcp']).split(':')[-1];STATE.write_text(json.dumps(s,indent=2));wait(lambda:read(s['origin']+'/api/version'),'gateway');print('REAL_OLD_READY='+json.dumps({'origin':s['origin'],'version':version}))
elif mode=='switch':
 s=json.loads(STATE.read_text());version=read('http://127.0.0.1:'+str(s['newPort'])+'/api/version') if 'newPort' in s else start_web(s,'new',s['candidateImage']);s['newVersion']=version;write_config(s,'new');run(['docker','exec',s['gateway'],'nginx','-t','-c','/fixture/nginx.conf']);run(['docker','exec',s['gateway'],'nginx','-s','reload','-c','/fixture/nginx.conf']);wait(lambda:read(s['origin']+'/api/version').get('commit')==version.get('commit'),'switch');time.sleep(.4);s['phase']='new';STATE.write_text(json.dumps(s,indent=2));print('REAL_CUTOVER='+json.dumps(version))
elif mode=='rollback':
 s=json.loads(STATE.read_text());write_config(s,'old');run(['docker','exec',s['gateway'],'nginx','-t','-c','/fixture/nginx.conf']);run(['docker','exec',s['gateway'],'nginx','-s','reload','-c','/fixture/nginx.conf']);wait(lambda:read(s['origin']+'/api/version').get('commit')==s['oldVersion'].get('commit'),'rollback');time.sleep(.4);print('REAL_ROLLBACK=PASS')
elif mode=='bootstrap':
 s=json.loads(STATE.read_text());info=json.loads(run(['docker','inspect',s['pg']]))[0];assert info['Config']['Labels'].get('io.naumi.real-next-compat')==s['tag'];salt=b'compat-local-admin-hash-20261016';value='scrypt$'+salt.hex()+'$'+hashlib.scrypt(b'fixture-only-password',salt=salt,n=16384,r=8,p=1,dklen=32).hex();sql="INSERT INTO app_settings(k,v) VALUES('admin_password_hash','"+value+"') ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v; TRUNCATE app_canvas_text_nodes;";run(['docker','exec',s['pg'],'psql','-U','fixture','-d','compat','-c',sql]);print('ISOLATED_SETUP=CONFIGURED NO_SUPPLIER_CREDENTIALS=1')
elif mode=='memory':
 s=json.loads(STATE.read_text());result={}
 for role in ['old','new','pg','gateway','worker','varianthk','variantdesktop','variantenterprise','variantunified']:
  if role not in s:continue
  name=s[role]
  if name not in s['created']:continue
  info=json.loads(run(['docker','inspect',name]))[0];assert info['Config']['Labels'].get('io.naumi.real-next-compat')==s['tag']
  if not info['State']['Running']:continue
  raw=run(['docker','exec',name,'sh','-c','for f in memory.current memory.peak memory.events memory.stat; do echo FILE=$f; cat /sys/fs/cgroup/$f; done']);sections={};key=None
  for line in raw.splitlines():
   if line.startswith('FILE='):key=line[5:];sections[key]=[]
   elif key:sections[key].append(line)
  stat={k:int(v)for k,v in(line.split()for line in sections['memory.stat'])};events={k:int(v)for k,v in(line.split()for line in sections['memory.events'])};result[role]={'name':name,'image':info['Image'],'memoryLimitBytes':info['HostConfig']['Memory'],'memorySwapLimitBytes':info['HostConfig']['MemorySwap'],'currentBytes':int(sections['memory.current'][0]),'peakBytes':int(sections['memory.peak'][0]),'anonBytes':stat['anon'],'fileBytes':stat['file'],'events':events,'rawStat':stat}
 report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'components':result};(ROOT/'memory-final.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
elif mode=='sql':
 s=json.loads(STATE.read_text());print(run(['docker','exec',s['pg'],'psql','-U','fixture','-d','compat','-At','-c',sys.argv[2]]))
elif mode=='inspect':
 s=json.loads(STATE.read_text());rows=json.loads(run(['docker','inspect',*s['created']]));print(json.dumps([{'name':r['Name'],'image':r['Image'],'memoryLimit':r['HostConfig']['Memory'],'running':r['State']['Running'],'oomKilled':r['State']['OOMKilled']}for r in rows],indent=2))
elif mode=='variant-start':
 s=json.loads(STATE.read_text());variant=os.environ['NAUMI_REAL_COMPAT_VARIANT'];assert variant in ['hk','desktop','enterprise','unified'];phase='variant'+variant;s[phase]='real-next-'+variant+'-'+s['tag'];image=os.environ['NAUMI_REAL_COMPAT_VARIANT_IMAGE'];version=start_web(s,phase,image);s['variant']=phase;s['variantImage']=image;s['variantVersion']=version
 prefix={'hk':'','desktop':'/desktop','enterprise':'/enterprise','unified':''}[variant];config='worker_processes 1;pid /tmp/compat-next.pid;error_log stderr;events{worker_connections 256;}http{access_log off;include /etc/nginx/mime.types;server{listen 80;location /{proxy_pass http://'+s[phase]+':3000;proxy_set_header Host $host;proxy_set_header X-Forwarded-Proto $scheme;proxy_buffering off;}'
 if prefix:config+='location ^~ '+prefix+'/_next/{proxy_pass http://'+s[phase]+':3000/_next/;proxy_set_header Host $host;}'
 if variant=='unified':
  assert (ROOT/'unified-static/manifest.json').is_file(),'Captured three-prefix union required'
  for prefix in ['', '/desktop', '/enterprise']:
   config+='location ^~ '+prefix+'/_next/static/{alias /fixture/unified-static'+prefix+'/_next/static/;add_header Cache-Control "public,max-age=31536000,immutable" always;}'
 config+='}}';(ROOT/'nginx.conf').write_text(config);run(['docker','start',s['gateway']]);s['origin']='http://127.0.0.1:'+run(['docker','port',s['gateway'],'80/tcp']).split(':')[-1];STATE.write_text(json.dumps(s,indent=2));wait(lambda:read(s['origin']+'/api/version').get('commit')==version.get('commit'),'variant gateway');print('VARIANT_READY='+json.dumps({'variant':variant,'version':version,'origin':s['origin']}))
elif mode=='pause-webs':
 s=json.loads(STATE.read_text())
 for name in s['created']:
  if name==s['pg']:continue
  info=json.loads(run(['docker','inspect',name]))[0];assert info['Config']['Labels'].get('io.naumi.real-next-compat')==s['tag']
  if info['State']['Running']:run(['docker','stop','-t','10',name])
 print('OWN_WEB_FIXTURES_PAUSED=YES PG_PRESERVED=YES')
elif mode=='cleanup':
 s=json.loads(STATE.read_text());
 for name in reversed(s['created']):
  info=json.loads(run(['docker','inspect',name]))[0]
  assert info['Config']['Labels'].get('io.naumi.real-next-compat')==s['tag'];run(['docker','rm','-f','-v',name])
 run(['docker','network','rm',s['network']]);print('REAL_FIXTURE_CLEANUP=PASS')



