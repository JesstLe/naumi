#!/usr/bin/env python3
"""103 image-cache read/UI cutover; existing creation/Agent/Worker stay routed.

Run under the existing Naumi/Hub lock keeper after backups. No DB restore,
old-container stop or configuration-secret printing is performed by this tool.
"""
import json,pathlib,sys,subprocess,hashlib,time,urllib.request,http.client,socket,re,threading,os

E=pathlib.Path(sys.argv[1]).resolve();PHASE=sys.argv[2]
GATEWAY=pathlib.Path('/etc/nginx/sites-available/default')
def command(args):return subprocess.check_output(args).decode().strip()
def query(sql):return command(['docker','exec','naumi-staging-db-1','psql','-X','-At','-U','naumi_staging','-d','naumi_staging','-c',sql])
def protected():
 result={}
 for name,sql in {
  'users':'SELECT row_to_json(s)::text FROM (SELECT email,name,role,password_hash,credits_total,credits_used,banned,account_expires_at,auth_revoked_before,management_version FROM app_users)s ORDER BY row_to_json(s)::text',
  'settings':'SELECT row_to_json(s)::text FROM app_settings s ORDER BY row_to_json(s)::text',
  'grants':'SELECT row_to_json(s)::text FROM app_team_access_grants s ORDER BY row_to_json(s)::text',
  'enterprise_members':'SELECT row_to_json(s)::text FROM app_enterprise_members s ORDER BY row_to_json(s)::text',
  'enterprise_roles':'SELECT row_to_json(s)::text FROM app_enterprise_roles s ORDER BY row_to_json(s)::text',
  'artworks':'SELECT id,email,image_url,source_url,status FROM app_artworks ORDER BY id',
 }.items():result[name]=hashlib.sha256(query(sql).encode()).hexdigest()
 for name in ['.env','docker-compose.yml']:result[name]=hashlib.sha256((pathlib.Path('/opt/naumi-staging/config')/name).read_bytes()).hexdigest()
 return result
def read(path,port=80):return urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=30)
def assert_lock():
 owner=json.loads((E/'lock-owner.json').read_text());pid=owner['pid'];assert pathlib.Path('/proc/'+str(pid)).exists()
 assert command(['cat','/proc/'+str(pid)+'/comm'])=='bash'
 for fd in ['8','9']:assert pathlib.Path('/proc/'+str(pid)+'/fd/'+fd).exists()
def verify_protected():
 assert protected()==json.loads((E/'protected.before.json').read_text()),'Protected business data changed; do not overwrite'
 for old in json.loads((E/'containers.before.json').read_text()):
  current=json.loads(command(['docker','inspect',old['Id']]))[0]
  assert current['Id']==old['Id']and current['Image']==old['Image']and current['State']['Running'],old['Name']
 print('PROTECTED=PASS ACCOUNTS_PASSWORDS_CREDITS_GRANTS_SETTINGS_MEDIA_REFERENCES_OLD_SERVICES=UNCHANGED')
def render_gateway(before):
 modified=before
 # Only active slots, not fallback or existing creation APIs, change destination.
 def current_port(expression):
  block=re.search(expression,before,re.S);assert block,expression;return int(re.search(r'proxy_pass http://127\.0\.0\.1:(\d+)',block.group(0)).group(1))
 active={'ui':current_port(r'location / \{[^{}]*\}'),'desktop':current_port(r'location = /desktop \{[^{}]*\}'),'enterprise':current_port(r'location = /enterprise \{[^{}]*\}')};new={'ui':13028,'desktop':13029,'enterprise':13030}
 asset_ports={};asset_fallback={}
 for kind,prefix in [('ui','/_next/'),('desktop','/desktop/_next/'),('enterprise','/enterprise/_next/')]:
  asset=re.search(r'location\s+\^~\s+'+re.escape(prefix)+r'\s*\{[^{}]*\}',before,re.S)
  asset_ports[kind]=int(re.search(r'127\.0\.0\.1:(\d+)',asset.group(0)).group(1))if asset else active[kind]
  fallback=re.search(r'error_page 404 = (@[\w]+);',asset.group(0))if asset else None
  asset_fallback[kind]=fallback.group(1)if fallback else '@entry_original_ui_assets'
 blocks=list(re.finditer(r'location\s+([^\n{]+)\s*\{[^{}]*\}',before,re.S))
 for match in reversed(blocks):
  block=match.group(0);location=match.group(1).strip()
  if location.startswith('@'):continue
  if location=='= /api/version':
   block=re.sub(r'proxy_pass http://127\.0\.0\.1:\d+;', 'proxy_pass http://127.0.0.1:13028;',block)
   modified=modified[:match.start()]+block+modified[match.end():]
   continue
  kind='desktop'if'/desktop'in location else'enterprise'if'/enterprise'in location or location=='= /team'else'ui'
  port=active[kind]
  static='/_next/'in location
  if static or '127.0.0.1:'+str(port)in block:
    # Existing enterprise/team APIs stay on their original instance except read-only image bytes.
    if location.startswith(('= /api/','^~ /api/','= /desktop/api/','^~ /desktop/api/')):continue
    if static:block=re.sub(r'proxy_pass http://127\.0\.0\.1:\d+', 'proxy_pass http://127.0.0.1:'+str(new[kind]),block)
    else:block=block.replace('127.0.0.1:'+str(port),'127.0.0.1:'+str(new[kind]))
    if 'error_page 404 ='in block:block=re.sub(r'error_page 404 = @[\w]+;',f'error_page 404 = @image_cache_old_{kind};',block)
    elif not location.startswith('= /api/version'):block=block[:-1]+f'proxy_intercept_errors on;error_page 404 = @image_cache_old_{kind};'+'}'
  modified=modified[:match.start()]+block+modified[match.end():]
 opts='\nproxy_http_version 1.1;proxy_set_header Host $host;proxy_set_header X-Real-IP $remote_addr;proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;proxy_set_header X-Forwarded-Proto $scheme;proxy_set_header Connection "";proxy_buffering off;proxy_read_timeout 900s;\n'
 extra='\n'
 if not re.search(r'location\s+\^~\s+/desktop/api/\s*\{',before):extra+=f'location ^~ /desktop/api/ {{proxy_pass http://127.0.0.1:{active["desktop"]};'+opts+'}\n'
 for kind,port in asset_ports.items():
  previous=asset_fallback[kind]
  extra+=f'location @image_cache_old_{kind} {{proxy_pass http://127.0.0.1:{port};proxy_intercept_errors on;error_page 404 = {previous};'+opts+'}\n'
 extra+='location ^~ /media/ {proxy_pass http://127.0.0.1:13028;'+opts+'}\n'
 for route in ['/api/media/image-cache','/api/public-image-cache','/api/team/media','/api/enterprise/media']:
  extra+=f'location = {route} {{proxy_pass http://127.0.0.1:13028;'+opts+'}\n'
 for route in ['/desktop/api/media/image-cache','/desktop/api/public-image-cache','/desktop/api/team/media','/desktop/api/enterprise/media']:
  extra+=f'location = {route} {{proxy_pass http://127.0.0.1:13028{route[8:]};'+opts+'}\n'
 modified=modified.replace('location / {',extra+'location / {')
 return modified

if PHASE=='baseline':
 assert_lock();E.mkdir(parents=True,exist_ok=True);os.chmod(E,0o700)
 before=GATEWAY.read_bytes();(E/'nginx.before').write_bytes(before)
 rows=json.loads(command(['docker','inspect',*command(['docker','ps','--format','{{.Names}}']).splitlines()]))
 rows=[r for r in rows if r['Name'].startswith('/naumi')and'fixture'not in r['Name']and'entry'not in r['Name'] or r['Name'].startswith('/naumi-entry')]
 (E/'containers.before.json').write_text(json.dumps(rows));os.chmod(E/'containers.before.json',0o600)
 (E/'protected.before.json').write_text(json.dumps(protected(),indent=2))
 with(E/'database.before.dump').open('wb')as f:subprocess.run(['docker','exec','naumi-staging-db-1','pg_dump','-U','naumi_staging','-d','naumi_staging','-Fc'],stdout=f,check=True)
 with(E/'database.before.toc').open('wb')as f:subprocess.run(['docker','exec','-i','naumi-staging-db-1','pg_restore','--list'],stdin=(E/'database.before.dump').open('rb'),stdout=f,check=True)
 assert(E/'database.before.toc').stat().st_size>1000
 assets={}
 for page in ['/','/works','/canvas','/desktop','/enterprise']:
  html=read(page).read()
  for raw in re.findall(rb'(?:src|href)="((?:/_next/static/|/enterprise/_next/static/|/desktop/_next/static/)[^"]+)"',html):
   name=raw.decode();assets[name]=hashlib.sha256(read(name).read()).hexdigest()
 (E/'old-assets.json').write_text(json.dumps(assets,indent=2));(E/'BASELINE_READY').write_text('readable DB/gateway/protected baseline/old assets')
 print('BASELINE=PASS BACKUP=READABLE ASSETS='+str(len(assets))+' GATEWAY_SHA='+hashlib.sha256(before).hexdigest())
elif PHASE=='start':
 assert_lock();assert GATEWAY.read_bytes()==(E/'nginx.before').read_bytes();verify_protected()
 subprocess.run(['docker','load','-i',str(E/'release-images.tar')],check=True,stdout=(E/'images-load.log').open('w'))
 release=json.loads((E/'release.json').read_text());old=json.loads((E/'containers.before.json').read_text());base=next(r for r in old if r['Name']=='/naumi-staging-app-1');slots=[]
 for row,port in zip(release,[13028,13029,13030]):
  assert command(['ss','-H','-ltn','sport = :'+str(port)])==''
  env=dict(v.split('=',1)for v in base['Config']['Env']);env.update(NAUMI_VIDEO_WORKER='0',HOSTNAME='0.0.0.0',PORT='3000',SOURCE_COMMIT=row['sha'],INTERNAL_APP_ORIGIN='http://127.0.0.1:3000')
  for name in ['PATH','YARN_VERSION','NODE_VERSION','BUILD_VERSION']:env.pop(name,None)
  networks=list(base['NetworkSettings']['Networks']);name='naumi-image-cache-'+row['kind']+'-'+row['sha'][:12]
  config={'Image':row['image'],'Env':[k+'='+v for k,v in env.items()],'ExposedPorts':{'3000/tcp':{}},'HostConfig':{'RestartPolicy':{'Name':'unless-stopped'},'NetworkMode':networks[0],'Memory':805306368,'NanoCpus':1500000000,'PidsLimit':512,'PortBindings':{'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':str(port)}]},'Binds':[m['Source']+':'+m['Destination']+(''if m['RW']else':ro')for m in base['Mounts']]}}
  class Conn(http.client.HTTPConnection):
   def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')
  connection=Conn('localhost');connection.request('POST','/containers/create?name='+name,json.dumps(config),{'Content-Type':'application/json'});r=connection.getresponse();data=r.read();assert r.status==201,(r.status,data);cid=json.loads(data)['Id'];connection.close()
  for network in networks[1:]:subprocess.run(['docker','network','connect',network,cid],check=True)
  subprocess.run(['docker','start',cid],check=True,stdout=subprocess.DEVNULL)
  for attempt in range(90):
   try:
    version=json.loads(read('/api/version',port).read());assert version['commit']==row['sha'];health=json.loads(read('/api/health',port).read());assert health['db']['ok'];break
   except Exception:
    if attempt==89:raise
    time.sleep(1)
  row.update(port=port,name=name,cid=cid,imageId=command(['docker','inspect',name,'--format','{{.Image}}']));slots.append(row)
  print('NEW_SLOT='+row['kind']+' READY=DB_VERSION_WORKER_OFF PORT='+str(port))
 (E/'slots.json').write_text(json.dumps(slots,indent=2));verify_protected()
elif PHASE=='cutover':
 assert_lock();assert GATEWAY.read_bytes()==(E/'nginx.before').read_bytes();verify_protected();before=(E/'nginx.before').read_text();modified=before
 modified=render_gateway(before);(E/'nginx.modified').write_text(modified)
 for label,body in [('modified',modified),('rollback',before)]:
  file=E/('nginx-test-'+label+'.conf');file.write_text('events {}\nhttp {\n'+body+'\n}\n');subprocess.run(['nginx','-t','-c',str(file),'-p',str(E)],check=True)
 rows=[];done=threading.Event()
 def monitor():
  while not done.is_set():
   for route in ['/','/works','/canvas','/desktop','/enterprise','/api/health','/api/version']:
    try:
     with read(route)as r:r.read();rows.append({'path':route,'status':r.status})
    except Exception as e:rows.append({'path':route,'error':type(e).__name__})
   done.wait(.3)
 thread=threading.Thread(target=monitor);thread.start()
 try:
  GATEWAY.write_text(modified);subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
  slots=json.loads((E/'slots.json').read_text());expected=slots[0]['sha']
  for attempt in range(60):
   try:
    if json.loads(read('/api/version').read()).get('commit')==expected:break
   except Exception:pass
   time.sleep(.25)
  assert json.loads(read('/api/version').read())['commit']==expected
  for name,digest in json.loads((E/'old-assets.json').read_text()).items():assert hashlib.sha256(read(name).read()).hexdigest()==digest,name
  verify_protected();time.sleep(4);assert all(row.get('status')==200 for row in rows),rows
 except Exception:
  GATEWAY.write_text(before);subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True);(E/'AUTOMATIC_ROLLBACK').write_text('previous gateway restored, DB/media untouched');raise
 finally:done.set();thread.join();(E/'continuity.json').write_text(json.dumps(rows,indent=2))
 (E/'ACTIVATED').write_text(time.strftime('%Y-%m-%d %H:%M:%S UTC',time.gmtime()));print('CUTOVER=PASS CONTINUITY_REQUESTS='+str(len(rows))+' ERRORS=0 OLD_ASSETS=EXACT OLD_CREATION_RUNTIME=RUNNING')
elif PHASE=='verify':assert_lock();verify_protected()
elif PHASE=='rollback-check':
 assert(E/'nginx.before').is_file();file=E/'nginx-rollback-check.conf';file.write_text('events {}\nhttp {\n'+(E/'nginx.before').read_text()+'\n}\n');subprocess.run(['nginx','-t','-c',str(file),'-p',str(E)],check=True);print('ROLLBACK_GATEWAY=CHECKED DATABASE_RESTORE=NONE')
else:raise ValueError(PHASE)
