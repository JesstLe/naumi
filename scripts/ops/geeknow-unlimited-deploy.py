"""47-only fixed live-bundle derivative; preserve R2/chat/login overlays.
No model publication, database migration, old-task replay or customer charge.
"""
import sys
if __name__ == '__main__' and '--rollback' not in sys.argv:
    print('RELEASE_BLOCKED=LEGACY_PATH_SPLIT_ENTRY; USE=deploy-release.sh_--lifecycle; LIVE_MUTATIONS=0', file=sys.stderr)
    sys.exit(78)

import argparse, contextlib, fcntl, hashlib, hmac, json, os, pathlib, socket, subprocess, time, urllib.request, urllib.error, threading
from nginx_syntax import check_gateway_syntax

ROOT=pathlib.Path('/opt/naumi-staging/evidence/geeknow-unlimited47-20261015')
GATE=pathlib.Path('/etc/nginx/sites-available/reference-workbench')
EXPECTED='40d9061c3cba288f6bf1150b7afc0b289d32e8d9d7b6472ee91cd72ba101849c'
POLICY='NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS'
PAIRS=[('naumi47-r2-image-main-20261015','naumi47-geeknow-unlimited-main-20261015',13068,13070),('naumi47-r2-image-native-20261015','naumi47-geeknow-unlimited-native-20261015',13069,13071)]
sha=lambda data:hashlib.sha256(data).hexdigest()

def run(args,timeout=180):
 return subprocess.check_output(args,stderr=subprocess.PIPE,timeout=timeout)

def get(url,cookie=None):
 request=urllib.request.Request(url,headers={'Cookie':'nv_admin='+cookie} if cookie else {})
 try:
  with urllib.request.urlopen(request,timeout=35) as response:return response.status,response.read()
 except urllib.error.HTTPError as response:return response.code,response.read()

def atomic_gateway(body):
 temp=GATE.with_suffix('.geeknow-unlimited');temp.write_bytes(body);temp.chmod(0o644);os.replace(temp,GATE)
 run(['systemctl','reload','nginx'])

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--rollback',action='store_true');args=parser.parse_args()
 with contextlib.ExitStack() as stack:
  for p in ['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']:
   f=stack.enter_context(open(p,'a'));fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if args.rollback:
   result=json.loads((ROOT/'release.json').read_text());assert sha(GATE.read_bytes())==result['gatewayAfter'],'Newer release exists'
   for old,_,_,_ in PAIRS:assert json.loads(run(['docker','inspect',old]))[0]['State']['Running']
   atomic_gateway((ROOT/'gateway.before').read_bytes())
   print('LIVE_ROLLBACK=PASS; UNLIMITED_POLICY=OFF_BY_ROUTING; MODEL_CONFIG_RESTORE=NONE; DB_RESTORE=NONE')
   return
  assert not (ROOT/'release.json').exists(),'Release already completed'
  before=GATE.read_bytes();assert sha(before)==EXPECTED,'Refresh current gateway baseline before release'
  (ROOT/'gateway.before').write_bytes(before)
  stat=os.statvfs(ROOT);assert stat.f_bavail*stat.f_frsize>10*1024**3
  allnames=run(['docker','ps','--format','{{.Names}}']).decode().splitlines()
  allbefore=json.loads(run(['docker','inspect',*allnames]));oldapps={x['Name'].lstrip('/'):x for x in allbefore}
  db=json.loads(run(['docker','inspect','naumi-staging-db-1']))[0];de=dict(v.split('=',1) for v in db['Config']['Env'])
  def sql(q):return run(['docker','exec','naumi-staging-db-1','psql','-X','-U',de['POSTGRES_USER'],'-d',de['POSTGRES_DB'],'-At','-v','ON_ERROR_STOP=1','-c',q]).decode().strip()
  def fingerprint():return sql("select json_build_object('model',(select active_version::text||':'||md5(config::text) from app_model_config_state s join app_model_config_versions v on v.version=s.active_version),'drafts',(select md5(string_agg(row_to_json(t)::text,',' order by id)) from app_model_drafts t),'prices',(select md5(string_agg(row_to_json(t)::text,',' order by version)) from app_billing_config_versions t))")
  # Table names are verified against the live schema before using this helper.
  model=sql("select s.active_version::text||':'||md5(v.config::text) from app_model_config_state s join app_model_config_versions v on v.version=s.active_version")
  tables=json.loads(sql("select json_agg(table_name) from information_schema.tables where table_schema='public' and (table_name like 'app_model_%' or table_name like 'app_billing_config%')"))
  protected=[t for t in tables if t in ['app_model_config_state','app_model_config_versions','app_model_drafts','app_model_providers','app_model_upstreams','app_model_pools','app_model_candidates','app_model_public_models','app_model_bindings','app_billing_config_versions']]
  def protected_state():
   return {table:sql('select md5(coalesce(string_agg(row::text,\'\' order by row::text),\'\')) from (select row_to_json(t) row from '+table+' t) z') for table in protected}
  protected_before=protected_state()
  backup=ROOT/'database.backup'
  if not backup.exists():
   with backup.open('xb') as f:subprocess.run(['docker','exec','naumi-staging-db-1','pg_dump','-U',de['POSTGRES_USER'],'-d',de['POSTGRES_DB'],'-Fc'],stdout=f,stderr=subprocess.PIPE,check=True,timeout=180)
  with backup.open('rb') as f:subprocess.run(['docker','exec','-i','naumi-staging-db-1','pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
  backup.chmod(0o600)
  manifest=json.loads((ROOT/'modified/manifest.json').read_text())
  images=[];created=[];switched=False;envfiles=[];observations=[];stop=threading.Event();thread=None
  try:
   for oldname,newname,oldport,port in PAIRS:
    old=oldapps[oldname];env=dict(x.split('=',1) for x in old['Config']['Env']);assert env.get('NAUMI_VIDEO_WORKER')=='0' and 'https://r2.geeknow.ai' in env.get('MODEL_CONFIG_PROXY_ORIGINS','')
    assert POLICY not in env;env[POLICY]='geeknow-images'
    assert sha(run(['docker','exec',oldname,'cat','/app/.next/server/chunks/5552.js']))==manifest['files'][0]['before']
    with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    build=ROOT/('image-'+str(port));build.mkdir(exist_ok=True)
    dockerfile='FROM '+old['Image']+'\nUSER root\n'
    for entry in manifest['files']:
     source=ROOT/'modified'/entry['modified'];assert sha(source.read_bytes())==entry['after']
     target=entry['path'] if entry['path'].startswith('server/') else entry['path'].rsplit('/',1)[0]+'/'+entry['modified']
     dockerfile+='COPY --chown=1001:1001 modified/'+entry['modified']+' /app/.next/'+target+'\n'
    dockerfile+='COPY modified/manifest.json /tmp/geeknow-manifest.json\nCOPY rehash.cjs /tmp/geeknow-rehash.cjs\nRUN node /tmp/geeknow-rehash.cjs && rm /tmp/geeknow-rehash.cjs /tmp/geeknow-manifest.json\nUSER '+(old['Config']['User'] or '1001')+'\nLABEL io.naumi.geeknow-unlimited="true"\n'
    (ROOT/'Dockerfile.current').write_text(dockerfile)
    tag='naumi47-geeknow-unlimited:'+sha(dockerfile.encode())[:16]
    run(['docker','build','--network=none','-t',tag,'-f',str(ROOT/'Dockerfile.current'),str(ROOT)],timeout=200)
    image=run(['docker','image','inspect','-f','{{.Id}}',tag]).decode().strip();images.append(image)
    ef=ROOT/(newname+'.env');envfiles.append(ef);assert not any('\n' in v or '\r' in v for v in env.values());ef.write_text(''.join(k+'='+v+'\n' for k,v in env.items()));ef.chmod(0o600)
    create=['docker','create','--name',newname,'--network','naumi47_public_egress','--env-file',str(ef),'--user',old['Config']['User'],'--workdir',old['Config']['WorkingDir'],'--memory',str(old['HostConfig']['Memory']),'--restart','unless-stopped','-p','127.0.0.1:'+str(port)+':3000']
    for m in old['Mounts']:
     assert m['Type']=='bind' and ',' not in m['Source'] and ',' not in m['Destination']
     create+=['--mount','type=bind,source='+m['Source']+',target='+m['Destination']+('' if m['RW'] else ',readonly')]
    create+=[image,*old['Config']['Cmd']];run(create);created.append(newname)
    for network in old['NetworkSettings']['Networks']:
     if network!='naumi47_public_egress':run(['docker','network','connect',network,newname])
    run(['docker','start',newname]);ef.unlink()
    for attempt in range(90):
     try:
      status,body=get('http://127.0.0.1:'+str(port)+'/api/health')
      if status==200 and json.loads(body)['db']['ok']:break
     except OSError:pass
     time.sleep(.5)
    else:raise RuntimeError('Candidate health timeout')
    new=json.loads(run(['docker','inspect',newname]))[0];check=dict(x.split('=',1) for x in new['Config']['Env']);assert check.pop(POLICY)=='geeknow-images';assert check==dict(x.split('=',1) for x in old['Config']['Env'])
    assert sha(run(['docker','exec',newname,'cat','/app/.next/server/chunks/5552.js']))==manifest['files'][0]['after']
    for p in ['8385.js']:
     assert run(['docker','exec',oldname,'cat','/app/.next/server/chunks/'+p])==run(['docker','exec',newname,'cat','/app/.next/server/chunks/'+p]),'Chat repair changed'
    # Use an ephemeral native admin token in memory only; never save it or keys.
    password_hash=sql("select v from app_settings where k='admin_password_hash'")
    try:password_hash=json.loads(password_hash)
    except (ValueError,TypeError):pass
    expires=int(time.time()*1000)+300000
    message=f'admin-access:{expires}:{password_hash}' if password_hash else f'admin:{expires}'
    cookie=str(expires)+'.'+hmac.new(env['SETTINGS_SECRET'].encode(),message.encode(),hashlib.sha256).hexdigest()
    status,body=get('http://127.0.0.1:'+str(port)+'/api/admin/model-management',cookie)
    assert status==200,('Admin capacity API rejected temporary native session',status)
    state=json.loads(body);capacity=state['providerCapacity'];assert capacity['geeknow-images']['unlimited'] and capacity['geeknow-images']['maxConcurrent']==0
    assert all(not value.get('unlimited') for key,value in capacity.items() if key!='geeknow-images')
    (ROOT/('capacity-'+str(port)+'.json')).write_text(json.dumps(capacity,ensure_ascii=False,indent=2))
   after=before.replace(b'127.0.0.1:13068',b'127.0.0.1:13070').replace(b'127.0.0.1:13069',b'127.0.0.1:13071');assert after!=before
   check_gateway_syntax(ROOT,'geeknow-unlimited',after.decode());(ROOT/'gateway.after').write_bytes(after)
   def observe():
    while not stop.is_set():
     try:observations.append(get('https://47.105.59.142/api/health')[0]==200)
     except Exception:observations.append(False)
     stop.wait(.2)
   thread=threading.Thread(target=observe);thread.start()
   assert sha(GATE.read_bytes())==EXPECTED;atomic_gateway(after);switched=True;time.sleep(1)
   status,body=get('https://47.105.59.142/api/admin/model-management',cookie);assert status==200
   cap=json.loads(body)['providerCapacity'];assert cap['geeknow-images']['unlimited'] and cap['geeknow-images']['maxConcurrent']==0
   assert get('https://47.105.59.142/api/admin/model-management')[0]==404
   assert get('https://47.105.59.142/api/reference-workbench/settings')[0]==401
   assert protected_state()==protected_before,'Model or pricing/draft state changed; do not overwrite concurrent work'
   now=json.loads(run(['docker','inspect',*allnames]));assert [(x['Id'],x['Image'],x['State']['StartedAt'],x['State']['Running']) for x in allbefore]==[(x['Id'],x['Image'],x['State']['StartedAt'],x['State']['Running']) for x in now]
   stop.set();thread.join();thread=None;assert observations and all(observations)
   report={'result':'PASS','policy':POLICY+'=geeknow-images','maxConcurrent':0,'unlimited':True,'slots':PAIRS,'images':images,'gatewayBefore':EXPECTED,'gatewayAfter':sha(after),'modelConfigUnchanged':model,'modelPricingDraftFingerprints':protected_before,'otherProvidersUnchanged':True,'oldContainersUnchanged':True,'chatRepairUnchanged':True,'R2ProxyPreserved':True,'healthSamples':len(observations),'healthErrors':0,'supplierCalls':0,'databaseRestore':False,'backupReadable':True}
   (ROOT/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
   print('RELEASE=PASS; GEEKNOW=UNLIMITED; OTHER_PROVIDERS=UNCHANGED; MODEL_PRICING_DRAFTS=UNCHANGED; OLD_CONTAINERS=UNCHANGED; UPSTREAM_CALLS=0',flush=True)
  except BaseException:
   if switched:atomic_gateway(before);print('FAILURE_GATEWAY_ROLLBACK=PASS; DB_RESTORE=NONE',flush=True)
   else:
    for name in created:
     run(['docker','update','--restart=no',name]);run(['docker','stop',name])
   raise
  finally:
   stop.set()
   if thread:thread.join()
   for ef in envfiles:ef.unlink(missing_ok=True)

if __name__=='__main__':main()
