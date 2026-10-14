#!/usr/bin/env python3
"""Real Linux Nginx route isolation under continuous application traffic."""
import concurrent.futures,importlib.util,json,pathlib,subprocess,time,urllib.request,urllib.error,uuid
root=pathlib.Path.cwd();out=root/'output/fleet-routing';out.mkdir(exist_ok=True,parents=True)
tag='fleet-route-'+uuid.uuid4().hex[:8];names=[]
def command(args):return subprocess.check_output(args,stderr=subprocess.STDOUT).decode().strip()
server="""const http=require('http');http.createServer((q,s)=>{const serve=()=>{s.setHeader('content-type','application/json');s.end(JSON.stringify({backend:process.env.BACKEND,path:q.url}));};q.url.includes('slow=1')?setTimeout(serve,700):serve();}).listen(3000,'0.0.0.0');"""
try:
    command(['docker','network','create','--label','io.naumi.fixture='+tag,tag])
    for backend in ['business','portal']:
        name=tag+'-'+backend;names.append(name);command(['docker','run','-d','--name',name,'--network',tag,'--network-alias',backend,'--label','io.naumi.fixture='+tag,'-e','BACKEND='+backend,'node:24-bookworm-slim','node','-e',server])
    nginx=tag+'-nginx';names.append(nginx);command(['docker','run','-d','--name',nginx,'--network',tag,'--label','io.naumi.fixture='+tag,'-p','127.0.0.1::80','nginx:1.27-alpine']);port=command(['docker','port',nginx,'80/tcp']).split(':')[-1];origin='http://127.0.0.1:'+port
    # Render production insertion algorithm inside Linux Python; renderer imports root-local modules.
    before='server { listen 80; location / { proxy_pass http://business:3000; } }'
    (out/'before.conf').write_text(before)
    script="import sys,pathlib,importlib.util;sys.path.insert(0,'/source');spec=importlib.util.spec_from_file_location('cut','/source/fleet-portal-cutover.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);p=pathlib.Path('/out/before.conf');pathlib.Path('/out/after.conf').write_text(m.render_gateway(p.read_text(),13062).replace('http://127.0.0.1:13062','http://portal:3000'))"
    command(['docker','run','--rm','--network','none','--mount','type=bind,source='+str(root/'scripts')+',target=/source,readonly','--mount','type=bind,source='+str(out)+',target=/out','python:3.12-slim','python','-c',script])
    def install(name):command(['docker','cp',str(out/name),nginx+':/etc/nginx/conf.d/default.conf']);command(['docker','exec',nginx,'nginx','-t']);command(['docker','exec',nginx,'nginx','-s','reload']);time.sleep(.25)
    def read(path):
        with urllib.request.urlopen(origin+path,timeout=5) as response:return json.load(response)
    install('before.conf');assert read('/canvas')['backend']=='business';statuses=[]
    def traffic():
        for _ in range(100):
            try:statuses.append(read('/api/version')['backend'])
            except Exception:statuses.append('ERROR')
            time.sleep(.01)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        slow=pool.submit(read,'/canvas?slow=1');time.sleep(.1);poll=pool.submit(traffic);install('after.conf');poll.result();assert slow.result()['backend']=='business'
    for path in ['/admin/deployments','/api/admin/fleet','/api/admin/fleet/status','/api/admin/fleet/releases','/api/fleet/poll','/api/fleet/ack','/api/fleet/releases/poll','/api/fleet/releases/ack']:assert read(path)['backend']=='portal',path
    assert read('/fleet-assets/_next/static/test.js')=={'backend':'portal','path':'/_next/static/test.js'}
    for path in ['/api/version','/canvas','/api/generate-image','/api/imagegen','/api/canvas/assistant','/api/admin/users','/admin/center','/_next/static/existing.js','/media/existing.png','/desktop/api/version','/enterprise/api/version']:assert read(path)['backend']=='business',path
    assert 'ERROR' not in statuses;install('before.conf');assert read('/admin/deployments')['backend']=='business'
    (out/'results.json').write_text(json.dumps({'probes':len(statuses),'errors':0,'onlyFleetRoutesMoved':True,'existingBusinessPreserved':True,'oldInflightCompleted':True,'staticPrefixRewritten':True,'rollbackVerified':True,'productionWrites':0},indent=2))
    print('FLEET_ROUTING=PASS REAL_LINUX_NGINX=1 PROBES=100 ERRORS=0 LIMITED_ROUTES_ONLY=1 OLD_INFLIGHT_FINISHED=1 GENERATION_AGENT_MEDIA_UNCHANGED=1 STATIC_NAMESPACE_REWRITE=1 ROLLBACK=1 PRODUCTION_WRITES=0')
finally:
    for name in reversed(names):
        try:
            info=json.loads(command(['docker','inspect',name]))[0]
            if info['Config']['Labels'].get('io.naumi.fixture')==tag:command(['docker','rm','-f',name])
        except subprocess.CalledProcessError:pass
    subprocess.run(['docker','network','rm',tag],capture_output=True)
