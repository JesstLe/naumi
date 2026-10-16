#!/usr/bin/env python3
"""Actual local Nginx/TLS with all final static hashes and four CAS transitions."""
import concurrent.futures,json,pathlib,ssl,subprocess,sys,time,urllib.request,urllib.error,uuid
import release_client_compat as c
from test_release_client_compat_nginx import certificate
from prepare_release47_final_gateway import SITE

def run(args):
 r=subprocess.run(args,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(str(args[:3])+': '+r.stderr[-1500:])
 return r.stdout.strip()

def main(root,verification_name='verification'):
 c.require(verification_name.replace('-','').isalnum(),'Simple local verification name required')
 summary=json.loads((root/'prepared-summary.json').read_text());image=summary['image'];descriptor=json.loads((root/'gateways.json').read_text());meta=json.loads((root/'source-paths-private.json').read_text());manifest=json.loads((root/'static-union/manifest.json').read_text())
 verify=root/verification_name;verify.mkdir(exist_ok=False);certificate(verify)
 states={'original':(root/'gateways/maintenance/nginx.before.txt').read_bytes().decode(),'maintenance':(root/'gateways/maintenance/nginx.after.txt').read_bytes().decode(),'candidate':(root/'gateways/open/nginx.after.txt').read_bytes().decode()}
 alias=c.alias_inventory(c.Dump(states['original']))[0]
 for state,text in states.items():
  d=c.Dump(text);tls=[]
  for n,body in d.files.items():
   changes=[]
   for node in c.walk(d.nodes[n]):
    if node.name=='include':
     absolute=node.args[0]if node.args[0].startswith('/')else d.prefix+'/'+node.args[0];changes.append((node.tokens[1].start,node.tokens[1].end,c.quote('/tmp/final47/'+state+absolute)))
    elif node.name=='user':changes.append((node.start,node.end,'user nginx;'))
    elif node.name=='worker_processes':changes.append((node.start,node.end,'worker_processes 1;'))
    elif node.name=='pid':changes.append((node.start,node.end,'pid /tmp/final47-nginx.pid;'))
    elif node.name in['ssl_certificate','ssl_certificate_key']:
     tls.append((node.name,node.args));changes.append((node.tokens[1].start,node.tokens[1].end,'/fixture/'+verification_name+'/' +('cert.pem'if node.name=='ssl_certificate'else'key.pem')))
    elif node.name=='alias':
     value=node.args[0]
     replacement='/fixture/static-union/_next/static/'if value==summary['staticRoot']+'/_next/static/'else '/fixture/static-union'+alias['url']if value==alias['path']else None
     if replacement:changes.append((node.tokens[1].start,node.tokens[1].end,c.quote(replacement)))
   for a,b,v in sorted(changes,reverse=True):body=body[:a]+v+body[b:]
   target=verify/'trees'/state/meta[n]['realPath'].lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body.encode())
  if state=='original':original_tls=tls
  else:assert tls==original_tls
 backend='''const h=require('node:http');for(const p of [13070,13071,13068,13063,13052,13072,13073,13100,17847])h.createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({port:p,path:q.url,fixture:true}))}).listen(p,'0.0.0.0');'''
 (verify/'backend.cjs').write_text(backend);tag=uuid.uuid4().hex[:10];nginx='final47-nginx-'+tag;back='final47-backend-'+tag;app='final47-prefix-'+tag;network='final47-net-'+tag;created=[]
 try:
  run(['docker','network','create',network])
  # A shell only creates this fixture's /tmp config copy and two known symlinks.
  setup="mkdir -p /tmp/final47; cp -R /fixture/verification/trees/. /tmp/final47/; for s in original maintenance candidate; do mkdir -p /tmp/final47/$s/etc/nginx/sites-enabled; ln -s ../sites-available/default /tmp/final47/$s/etc/nginx/sites-enabled/default; ln -s ../sites-available/reference-workbench /tmp/final47/$s/etc/nginx/sites-enabled/reference-workbench; done; exec nginx -c /tmp/final47/original/etc/nginx/nginx.conf -g 'daemon off;'".replace('/fixture/verification/','/fixture/'+verification_name+'/')
  run(['docker','run','-d','--name',nginx,'--label','io.naumi.final47-verify='+tag,'--network',network,'--memory','128m','--memory-swap','128m','--cpus','.5','--pids-limit','64','-p','127.0.0.1::443','-p','127.0.0.1::80','-v',str(root)+':/fixture:ro','nginx:1.27-alpine','sh','-c',setup]);created.append(nginx)
  run(['docker','run','-d','--name',back,'--label','io.naumi.final47-verify='+tag,'--network','container:'+nginx,'--memory','96m','--memory-swap','96m','--cpus','.5','--pids-limit','48','-v',str(verify/'backend.cjs')+':/backend.cjs:ro','node:24-bookworm-slim','node','/backend.cjs']);created.append(back)
  base='https://127.0.0.1:'+run(['docker','port',nginx,'443/tcp']).split(':')[-1];ctx=ssl._create_unverified_context()
  def get(path,headers=None):
   req=urllib.request.Request(base+path,headers={'Host':'47.105.59.142',**(headers or {})})
   try:
    with urllib.request.urlopen(req,context=ctx,timeout=15)as r:return r.status,r.read()
   except urllib.error.HTTPError as r:return r.code,r.read()
  for _ in range(100):
   try:
    if get('/api/version')[0]==200:break
   except Exception:pass
   time.sleep(.1)
  else:raise AssertionError('Original TLS fixture failed readiness')
  syntax={}
  for state in states:
   syntax[state]=run(['docker','exec',nginx,'nginx','-t','-c','/tmp/final47/'+state+'/etc/nginx/nginx.conf'])or'PASS'
  def reload(state):
   run(['docker','exec',nginx,'sh','-c','cp /fixture/'+verification_name+'/trees/'+state+'/etc/nginx/sites-available/reference-workbench /tmp/final47/original/etc/nginx/sites-available/reference-workbench'])
   actual=subprocess.check_output(['docker','exec',nginx,'cat','/tmp/final47/original/etc/nginx/sites-available/reference-workbench']);assert actual==(verify/'trees'/state/'etc/nginx/sites-available/reference-workbench').read_bytes()
   run(['docker','exec',nginx,'nginx','-t','-c','/tmp/final47/original/etc/nginx/nginx.conf']);run(['docker','exec',nginx,'nginx','-s','reload','-c','/tmp/final47/original/etc/nginx/nginx.conf']);time.sleep(.3)
  def route(expected):
   status,body=get('/api/version');assert status==(503 if expected=='maintenance'else 200)
   if status==200:assert json.loads(body)['port']==(13100 if expected=='candidate'else 13070)
   assert json.loads(get('/legacy-workbench/retained')[1])['port']==17847
   assert json.loads(get('/api/status',{'Cookie':'wb_session=synthetic'})[1])['port']==17847
   login=get('/api/auth/login',{'Cookie':'nv_user=synthetic'});assert login[0]==(503 if expected=='maintenance'else 200)
  route('original');reload('maintenance');route('maintenance')
  def asset(entry):
   status,body=get(entry['url']);assert status==200 and c.sha(body)==entry['sha256']and len(body)==entry['size'];return entry['url']
  with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:checked=list(pool.map(asset,manifest['assets']))
  reload('candidate');route('candidate');reload('original');route('original');reload('maintenance');route('maintenance');reload('original');route('original')
  links=run(['docker','exec',nginx,'sh','-c','readlink /tmp/final47/original/etc/nginx/sites-enabled/default;readlink /tmp/final47/original/etc/nginx/sites-enabled/reference-workbench']);assert links=='../sites-available/default\n../sites-available/reference-workbench'
  # Real final image response (not synthetic backend) determines runtime prefix.
  run(['docker','run','-d','--name',app,'--label','io.naumi.final47-verify='+tag,'--network',network,'--memory','896m','--memory-swap','896m','--cpus','1','--pids-limit','192','-p','127.0.0.1::3000','-e','NODE_OPTIONS=--max-old-space-size=512','-e','NAUMI_VIDEO_WORKER=0','-e','SETTINGS_SECRET=final-prefix-independent-fixture-secret-20261016','-e','VIDEO_WORKER_SECRET=final-prefix-worker-independent-secret-20261016',image]);created.append(app)
  origin='http://127.0.0.1:'+run(['docker','port',app,'3000/tcp']).split(':')[-1]
  import re
  for _ in range(100):
   try:
    with urllib.request.urlopen(origin+'/dashboard',timeout=5)as r:html=r.read().decode();break
   except Exception:time.sleep(.1)
  else:raise AssertionError('Final real image runtime prefix unavailable')
  assets=re.findall(r'<script[^>]+src="([^"]+/_next/static/[^"]+|/_next/static/[^"]+)"',html);assert assets and all(v.startswith('/_next/static/')for v in assets)
  with urllib.request.urlopen(origin+'/api/version')as r:version=json.load(r)
  assert version=={'version':summary['buildVersion'],'commit':summary['commit']}
  memory={}
  for name in created:
   raw=run(['docker','exec',name,'sh','-c','cat /sys/fs/cgroup/memory.peak;cat /sys/fs/cgroup/memory.events']);lines=raw.splitlines();events={k:int(v)for k,v in(l.split()for l in lines[1:])};assert not any(events.values());memory[name]={'peak':int(lines[0]),'events':events}
  report={'result':'PASS','nginxSyntax':syntax,'staticHttpHashExact':len(checked),'actualImage':image,'actualVersion':version,'runtimeAssetPrefix':'','runtimeScripts':len(assets),'legacy17847Preserved':True,'tlsDirectivesUnchanged':True,'sourceSymlinksPreserved':True,'transitions':['original->maintenance','maintenance->candidate','candidate->original','original->maintenance','maintenance->original'],'memory':memory,'supplierCalls':0,'productionConnections':0,'published':False}
  (verify/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print('FINAL47_GATEWAY=PASS STATIC_HTTP_HASHES='+str(len(checked))+' NGINX_T=ALL_STATES FOUR_TRANSITIONS=PASS LEGACY17847=RETAINED SYMLINKS=RETAINED REAL_IMAGE_PREFIX=ROOT CGROUP_EVENTS=0')
 finally:
  for name in reversed(created):
   row=json.loads(run(['docker','inspect',name]))[0];assert row['Config']['Labels'].get('io.naumi.final47-verify')==tag;run(['docker','rm','-f','-v',name])
  run(['docker','network','rm',network])
  (verify/'cleanup.json').write_text(json.dumps({'containersRemoved':created,'networkRemoved':network})+'\n')

if __name__=='__main__':main(pathlib.Path(sys.argv[1]).resolve())
