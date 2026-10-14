#!/usr/bin/env python3
"""Real isolated Linux Nginx + six HTTP containers; not enterprise/production E2E."""
import concurrent.futures,json,pathlib,subprocess,time,urllib.request,uuid

root=pathlib.Path(__file__).resolve().parents[1]
out=root/'output'/'fleet-executor'
out.mkdir(parents=True,exist_ok=True)
tag=uuid.uuid4().hex[:10]
network='naumi-fleet-gateway-'+tag
names=[]
def command(args):return subprocess.check_output(args,text=True).strip()
server=r'''const http=require('http');http.createServer((req,res)=>{const isOld=process.env.PHASE==='old';if(req.url.includes('old-hash')&&!isOld){res.writeHead(404);res.end();return;}setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({phase:process.env.PHASE,flavor:process.env.FLAVOR,version:process.env.PHASE==='old'?1:2,path:req.url}));},req.url.includes('delay')?1200:0);}).listen(3000,'0.0.0.0');'''
def config(phase):
    result='server {listen 80;\n'
    for flavor,prefix in [('ui','/'),('desktop','/desktop/'),('enterprise','/enterprise/')]:
        current=network+'-'+phase+'-'+flavor;old=network+'-old-'+flavor
        result+='location '+prefix+' {proxy_pass http://'+current+':3000;proxy_intercept_errors on;error_page 404 = @old_'+flavor+';proxy_read_timeout 60s;}\n'
        result+='location @old_'+flavor+' {proxy_pass http://'+old+':3000;}\n'
    return result+'}\n'
try:
    command(['docker','network','create',network])
    for phase in ['old','new']:
        for flavor in ['ui','desktop','enterprise']:
            name=network+'-'+phase+'-'+flavor;names.append(name)
            command(['docker','run','-d','--name',name,'--network',network,'--label','io.naumi.fixture='+tag,'-e','PHASE='+phase,'-e','FLAVOR='+flavor,'node:24-bookworm-slim','node','-e',server])
    gateway=network+'-nginx';names.append(gateway);command(['docker','run','-d','--name',gateway,'--network',network,'--label','io.naumi.fixture='+tag,'-p','127.0.0.1::80','nginx:1.27-alpine']);port=command(['docker','port',gateway,'80/tcp']).split(':')[-1];origin='http://127.0.0.1:'+port
    def install(phase):
        file=out/('gateway-'+phase+'-'+tag+'.conf');file.write_text(config(phase),encoding='utf-8');command(['docker','cp',str(file),gateway+':/etc/nginx/conf.d/default.conf']);command(['docker','exec',gateway,'nginx','-t']);command(['docker','exec',gateway,'nginx','-s','reload']);time.sleep(0.25)
    def read(path='/api/version'):
        with urllib.request.urlopen(origin+path,timeout=10) as response:return json.load(response)
    install('old');assert read()['phase']=='old';assert read('/desktop/api/version')['flavor']=='desktop';assert read('/enterprise/api/version')['flavor']=='enterprise'
    statuses=[]
    def traffic():
        for i in range(100):
            try:statuses.append(read('/api/version')['phase'])
            except Exception:statuses.append('ERROR')
            time.sleep(0.015)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        ongoing=pool.submit(read,'/api/version?delay=1');time.sleep(0.2);polling=pool.submit(traffic);install('new');assert ongoing.result()['phase']=='old';polling.result()
    assert read()['phase']=='new';assert read('/desktop/api/version')['phase']=='new';assert read('/enterprise/api/version')['phase']=='new';assert read('/_next/static/old-hash.js')['phase']=='old';assert read('/desktop/_next/static/old-hash.js')['phase']=='old'
    assert 'ERROR' not in statuses;assert 'old' in statuses and 'new' in statuses
    install('old');assert read()['phase']=='old';assert read('/enterprise/api/version')['phase']=='old'
    for name in names:assert json.loads(command(['docker','inspect',name]))[0]['State']['Running']
    result={'httpRequests':len(statuses),'errors':statuses.count('ERROR'),'inflightOldCompleted':True,'threeFlavorsNew':True,'oldStaticFallback':True,'rollbackOld':True,'retainedContainers':len(names),'productionWrites':0};(out/'nginx-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('FLEET_NGINX=PASS REAL_LINUX=1 OLD_NEW_SLOTS=6 PROBES='+str(len(statuses))+' ERRORS=0 INFLIGHT_OLD_FINISHED=1 STATIC_FALLBACK=1 ROLLBACK=1 PRODUCTION_WRITES=0')
finally:
    for name in reversed(names):
        try:
            info=json.loads(command(['docker','inspect',name]))[0]
            if info['Config']['Labels'].get('io.naumi.fixture')==tag:command(['docker','rm','-f',name])
        except subprocess.CalledProcessError:pass
    subprocess.run(['docker','network','rm',network],capture_output=True)
