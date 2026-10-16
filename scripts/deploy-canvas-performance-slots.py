#!/usr/bin/env python3
"""103 canvas-performance read/UI cutover; existing creation/Agent/Worker stay routed.

Run under the existing Naumi/Hub lock keeper after backups. No DB restore,
old-container stop or configuration-secret printing is performed by this tool.
"""
import sys
if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] in ['start', 'cutover']:
    print('RELEASE_BLOCKED=LEGACY_PATH_SPLIT_ENTRY; USE=deploy-release.sh_--lifecycle; LIVE_MUTATIONS=0', file=sys.stderr)
    sys.exit(78)

import json,pathlib,sys,subprocess,hashlib,time,urllib.request,http.client,socket,re,threading,os,shutil
from nginx_syntax import check_gateway_syntax

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
 for fd,path in [('8','/opt/naumi-reverse-hub/releases/deploy.lock'),('9','/opt/naumi-staging/releases/deploy.lock')]:
  assert os.readlink('/proc/'+str(pid)+'/fd/'+fd)==path
  assert 'FLOCK  ADVISORY  WRITE' in pathlib.Path('/proc/'+str(pid)+'/fdinfo/'+fd).read_text()
def verify_protected():
 now=protected();baseline=json.loads((E/'protected.before.json').read_text())
 # Online users may add works or receive credits while a UI-only release runs.
 # Do not freeze traffic or restore those legitimate writes to an old fingerprint.
 for key in baseline:
  if key not in ['users','artworks']:assert now[key]==baseline[key],key+' changed; do not overwrite'
 if now['users']!=baseline['users'] or now['artworks']!=baseline['artworks']:
  def norm(v):return '\\N'if v is None else't'if v is True else'f'if v is False else str(v)
  for table,file,identity in [('app_users','baseline-user-control.json','email'),('app_artworks','baseline-artwork-control.json','id')]:
   controls=json.loads((E/file).read_text());rows={r[identity]:r for r in map(json.loads,query('SELECT row_to_json(s)::text FROM '+table+' s').splitlines())}
   for key,fields in controls.items():
    assert key in rows,'Existing '+table+' row removed'
    assert all(norm(rows[key][field])==expected for field,expected in fields.items()),'Existing '+table+' controls changed'
  print('ONLINE_ACTIVITY=PRESERVED EXISTING_ACCOUNT_CONTROLS_AND_ARTWORK_REFERENCES=EXACT DATABASE_RESTORE=NONE')
 (E/'protected.latest.json').write_text(json.dumps(now,indent=2))
 for old in json.loads((E/'containers.before.json').read_text()):
  current=json.loads(command(['docker','inspect',old['Id']]))[0]
  assert current['Id']==old['Id']and current['Image']==old['Image']and current['State']['Running'],old['Name']
 print('PROTECTED=PASS ACCOUNT_CONTROLS_GRANTS_SETTINGS_EXISTING_MEDIA_OLD_SERVICES=UNCHANGED CREDITS_AND_NEW_WORKS=PRESERVED')
def render_gateway(before):
 """Retarget current UI/cache slots only; existing creation APIs never move."""
 def location_block(location):
  found=re.search(r'location\s+'+re.escape(location)+r'\s*\{[^{}]*\}',before,re.S);assert found,location;return found.group(0)
 def port_of(location):return int(re.search(r'proxy_pass http://127\.0\.0\.1:(\d+)',location_block(location)).group(1))
 active={'ui':port_of('/'),'desktop':port_of('= /desktop'),'enterprise':port_of('= /enterprise')}
 target={'ui':13031,'desktop':13032,'enterprise':13033}
 assert len(set(active.values()))==3 and not set(active.values())&set(target.values())
 media_locations={'^~ /media/','= /api/media/image-cache','= /api/public-image-cache','= /api/team/media','= /api/enterprise/media','= /desktop/api/media/image-cache','= /desktop/api/public-image-cache','= /desktop/api/team/media','= /desktop/api/enterprise/media'}
 ui_locations={'/','^~ /_next/','= /api/version'}
 desktop_locations={'= /desktop','^~ /desktop/','^~ /desktop/_next/','= /desktop/api/version'}
 enterprise_locations={'= /enterprise','^~ /enterprise/','^~ /enterprise/_next/','= /team'}
 changed=before;changed_locations=[]
 for match in reversed(list(re.finditer(r'location\s+([^\n{]+)\s*\{[^{}]*\}',before,re.S))):
  location=match.group(1).strip();block=match.group(0)
  kind='ui'if location in ui_locations|media_locations else'desktop'if location in desktop_locations else'enterprise'if location in enterprise_locations else None
  if kind is None:continue
  assert '127.0.0.1:'+str(active[kind])in block or location in media_locations and'127.0.0.1:'+str(active['ui'])in block,location
  block=re.sub(r'proxy_pass http://127\.0\.0\.1:\d+', 'proxy_pass http://127.0.0.1:'+str(target[kind]),block)
  if '/_next/'in location:
   assert re.search(r'error_page 404 = @[\w]+;',block),location
   block=re.sub(r'error_page 404 = @[\w]+;',f'error_page 404 = @canvas_perf_previous_{kind};',block)
  changed=changed[:match.start()]+block+changed[match.end():];changed_locations.append(location)
 assert len(changed_locations)==len(ui_locations|desktop_locations|enterprise_locations|media_locations)
 extra='\n';opts='proxy_http_version 1.1;proxy_set_header Host $host;proxy_set_header X-Real-IP $remote_addr;proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;proxy_set_header X-Forwarded-Proto $scheme;proxy_set_header Connection "";proxy_buffering off;proxy_read_timeout 900s;'
 for kind,location in [('ui','^~ /_next/'),('desktop','^~ /desktop/_next/'),('enterprise','^~ /enterprise/_next/')]:
  old_block=location_block(location);fallback=re.search(r'error_page 404 = (@[\w]+);',old_block).group(1)
  extra+=f'location @canvas_perf_previous_{kind} {{proxy_pass http://127.0.0.1:{active[kind]};proxy_intercept_errors on;error_page 404 = {fallback};'+opts+'}\n'
 assert '@canvas_perf_previous_ui'not in before
 return changed.replace('location / {',extra+'location / {',1)

if PHASE=='render-test':
 print(render_gateway(pathlib.Path(sys.argv[3]).read_text()))
elif PHASE=='baseline':
 assert_lock();E.mkdir(parents=True,exist_ok=True);os.chmod(E,0o700)
 before=GATEWAY.read_bytes();(E/'nginx.before').write_bytes(before)
 rows=json.loads(command(['docker','inspect',*command(['docker','ps','--format','{{.Names}}']).splitlines()]))
 rows=[r for r in rows if r['Name'].startswith('/naumi')and'fixture'not in r['Name']and'entry'not in r['Name'] or r['Name'].startswith('/naumi-entry')]
 (E/'containers.before.json').write_text(json.dumps(rows));os.chmod(E/'containers.before.json',0o600)
 (E/'protected.before.json').write_text(json.dumps(protected(),indent=2))
 # Control-only snapshots exclude live credit counters and additive content.
 for table,file,identity,fields in [
  ('app_users','baseline-user-control.json','email',['name','role','password_hash','banned','account_expires_at','auth_revoked_before','management_version']),
  ('app_artworks','baseline-artwork-control.json','id',['email','image_url','source_url'])]:
  controls={}
  for row in map(json.loads,query('SELECT row_to_json(s)::text FROM '+table+' s').splitlines()):
   controls[row[identity]]={field:'\\N'if row[field]is None else't'if row[field]is True else'f'if row[field]is False else str(row[field])for field in fields}
  (E/file).write_text(json.dumps(controls));os.chmod(E/file,0o600)
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
 available=int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines()if line.startswith('MemAvailable:')))*1024
 assert available>2684354560,'Insufficient side-slot memory headroom; leave live gateway untouched'
 assert shutil.disk_usage(E).free>10*1024**3,'Insufficient release disk headroom'
 subprocess.run(['docker','load','-i',str(E/'release-images.tar')],check=True,stdout=(E/'images-load.log').open('w'))
 release=json.loads((E/'release.json').read_text());old=json.loads((E/'containers.before.json').read_text());base=next(r for r in old if r['Name']=='/naumi-staging-app-1');slots=[]
 for row,port in zip(release,[13031,13032,13033]):
  assert command(['ss','-H','-ltn','sport = :'+str(port)])==''
  env=dict(v.split('=',1)for v in base['Config']['Env']);env.update(NAUMI_VIDEO_WORKER='0',NAUMI_MEDIA_WORKER='0',HOSTNAME='0.0.0.0',PORT='3000',SOURCE_COMMIT=row['sha'],INTERNAL_APP_ORIGIN='http://127.0.0.1:3000')
  for name in ['PATH','YARN_VERSION','NODE_VERSION','BUILD_VERSION']:env.pop(name,None)
  networks=list(base['NetworkSettings']['Networks']);name='naumi-canvas-performance-'+row['kind']+'-'+row['sha'][:12]
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
  check_gateway_syntax(E,label,body)
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
 assert(E/'nginx.before').is_file();check_gateway_syntax(E,'rollback-check',(E/'nginx.before').read_text());print('ROLLBACK_GATEWAY=CHECKED DATABASE_RESTORE=NONE')
else:raise ValueError(PHASE)
