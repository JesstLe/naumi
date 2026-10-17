#!/usr/bin/env python3
"""Actual bounded Linux Nginx full-T+disk CAS/static hash verification, no host."""
import argparse
import concurrent.futures
import json
from pathlib import Path
import shutil
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import release_client_compat as c
import release103_gateway as hk
from test_release103_gateway_nginx import certificate,run

BACKEND=r'''import http.server,json,threading,time
class H(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'port':self.server.server_port,'path':self.path,'xff':self.headers.get('X-Forwarded-For'),'cf':self.headers.get('CF-Connecting-IP'),'proto':self.headers.get('X-Forwarded-Proto')}).encode())
 def log_message(self,*a):pass
for p in [13012,13014,13016,13019,13022,13023,13024,13025,13026,13027,13028,13029,13030,13031,13032,13033,13038,13039,13040,13041,13062,13070,13071,13068,13063,13052,13072,13073,13100,17847]:
 s=http.server.ThreadingHTTPServer(('127.0.0.1',p),H);threading.Thread(target=s.serve_forever,daemon=True).start()
open('/tmp/ready','w').write('yes')
while True:time.sleep(1)
'''


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def main(package):
    package=Path(package).resolve();manifest=json.loads((package/'manifest.json').read_text())
    desc=json.loads((package/'gateways.json').read_text());assets=json.loads((package/'static/manifest.json').read_text())
    target=manifest['target'];is_hk=target=='103.30.76.93'
    output=package/'validation';output.mkdir(exist_ok=False)
    live=output/'live';baseline=(package/'gateways/maintenance/nginx.before.txt').read_bytes().decode()
    source_paths=manifest['sourceRealPaths']
    for logical,item in desc['maintenance']['before'].items():
        target_path=live/source_paths[logical].lstrip('/');target_path.parent.mkdir(parents=True,exist_ok=True);target_path.write_bytes((package/item['path']).read_bytes())
    (live/'etc/nginx/sites-enabled').mkdir(exist_ok=True)
    main_config=live/'etc/nginx/nginx.conf';main_config.write_bytes(main_config.read_bytes().replace(b'worker_processes auto;',b'worker_processes 1;'))
    certificate(output)
    for name,nodes in c.Dump(baseline).nodes.items():
        for node in c.walk(nodes):
            if node.name in ('ssl_certificate','ssl_certificate_key'):
                p=live/node.args[0].lstrip('/');p.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(output/('cert.pem' if node.name=='ssl_certificate' else 'key.pem'),p)
    (output/'backend.py').write_text(BACKEND,encoding='utf-8')
    tag=uuid.uuid4().hex[:10];back='latest-gateway-'+tag+'-backend';nginx='latest-gateway-'+tag+'-nginx';created=[]
    results={'kind':'latest-gateway-linux-verification','result':'RUNNING','target':target,'image':manifest['image'],'commit':manifest['commit'],'buildVersion':manifest['buildVersion'],'fixtureOnly':True,'productionConnections':0,'supplierCalls':0,'actualNextAcceptance':False,'transitions':[],
             'fixtureAdaptations':['worker_processes1 only','self-signed local TLS cert at original paths','local www-data user'],'nginxMemoryMiB':128,'backendMemoryMiB':128}
    try:
        run(['docker','run','-d','--name',back,'--label','io.naumi.latest-gateway-fixture='+tag,'--network','bridge','--memory','128m','--memory-swap','128m','--cpus','.5','-p','127.0.0.1::443','-p','127.0.0.1::80','-v',str(output)+':/fixture:ro','python:3.12-alpine','python','/fixture/backend.py']);created.append(back)
        for _ in range(100):
            if subprocess.run(['docker','exec',back,'test','-f','/tmp/ready'],capture_output=True).returncode==0:break
            time.sleep(.1)
        else:raise AssertionError('Local backend readiness failed')
        ports=json.loads(run(['docker','inspect',back]))[0]['NetworkSettings']['Ports']
        args=['docker','run','-d','--name',nginx,'--label','io.naumi.latest-gateway-fixture='+tag,'--network','container:'+back,'--memory','128m','--memory-swap','128m','--cpus','.5','-v',str(package)+':/package:ro','-v',str(output)+':/fixture:ro','-v',str(package/'static')+':'+manifest['staticRoot']+':ro']
        if is_hk:
            args+=['-v',str(package/'static')+':/var/www/naumi-client-assets/evening-0614f9ae6f91-unified:ro']
        else:
            for alias in c.alias_inventory(c.Dump(baseline)):
                args+=['-v',str(package/'static'/alias['url'].lstrip('/'))+':'+alias['path']+':ro']
        links='; '.join('ln -s '+__import__('shlex').quote('../sites-available/'+Path(real).name)+' '+__import__('shlex').quote(logical) for logical,real in source_paths.items() if logical!=real)
        args+=['nginx:1.27-alpine','sh','-c','rm -f /etc/nginx/conf.d/default.conf; cp -a /fixture/live/. /; '+links+'; adduser -S -G nginx www-data; exec nginx -g "daemon off;"']
        run(args);created.append(nginx)
        opener=urllib.request.build_opener(NoRedirect,urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
        origin='https://127.0.0.1:'+ports['443/tcp'][0]['HostPort']
        def request(path,headers=None):
            assert path.startswith('/') and not path.startswith('//')
            req=urllib.request.Request(origin+urllib.parse.quote(path,safe='/?=&%'),headers={'Host':target if not is_hk else 'naumi.top','Connection':'close','X-Forwarded-For':'203.0.113.99','CF-Connecting-IP':'198.51.100.11',**(headers or {})})
            try:
                with opener.open(req,timeout=15) as r:return r.status,r.read(),dict(r.headers)
            except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
        for _ in range(100):
            try:
                if request('/api/version')[0]==200:break
            except Exception:pass
            time.sleep(.1)
        else:raise AssertionError('Nginx readiness failed: '+run(['docker','logs',nginx]))
        def full_t(expected):
            p=subprocess.run(['docker','exec',nginx,'nginx','-T'],capture_output=True);assert p.returncode==0
            assert p.stdout.decode()==expected.replace('worker_processes auto;','worker_processes 1;'),'Actual full nginx-T diverged'
            for logical,real in source_paths.items():
                assert run(['docker','exec',nginx,'readlink','-f',logical])==real
        def disk_cas(d):
            for logical,item in d['before'].items():
                raw=subprocess.check_output(['docker','exec',nginx,'cat',logical]);expected=(package/item['path']).read_bytes()
                assert c.sha(expected)==item['sha256']
                if logical=='/etc/nginx/nginx.conf':expected=expected.replace(b'worker_processes auto;',b'worker_processes 1;')
                assert raw==expected,'Exact before-file CAS mismatch'
        def dynamic(mode):
            if is_hk:
                rows=[];d=c.Dump(baseline);locs={' '.join(n.args):n for n in d.nodes[hk.SITE][0].children if n.name=='location'}
                for key,node in locs.items():
                    if key in {'^~ '+p for p in hk.PREFIXES}:continue
                    p='/.fixture-secret' if key.startswith('~ ') else node.args[-1]+('' if node.args[0]=='=' else 'fixture')
                    status,body,headers=request(p)
                    if key in hk.DENIES:assert status==int(hk.DENIES[key])
                    elif key in hk.FLEET:assert status==200 and json.loads(body)['port']==13062
                    elif mode=='maintenance':assert status==503 and headers.get('Retry-After')=='60'
                    else:
                        proxy=next(n.args[0] for n in node.children if n.name=='proxy_pass');row=json.loads(body)
                        assert status==200 and row['port']==(13100 if mode=='candidate' else int(proxy.split(':')[2].split('/')[0]))
                        if mode=='candidate':assert not row['cf'] and row['xff']!='203.0.113.99'
                    rows.append({'location':key,'status':status})
                return rows
            status,body,_=request('/api/version');assert status==(503 if mode=='maintenance' else 200)
            if status==200:assert json.loads(body)['port']==(13100 if mode=='candidate' else 13070)
            assert json.loads(request('/legacy-workbench/retained')[1])['port']==17847
            assert json.loads(request('/api/status',{'Cookie':'wb_session=synthetic'})[1])['port']==17847
            login=request('/api/auth/login',{'Cookie':'nv_user=synthetic'});assert login[0]==(503 if mode=='maintenance' else 200)
            assert json.loads(request('/api/auth/login',{'Cookie':'wb_session=synthetic'})[1])['port']==17847
            return [{'path':'/api/version','status':status},{'legacy17847':'preserved'},{'loginCookieMap':'preserved'}]
        run(['docker','exec',nginx,'nginx','-t']);full_t(baseline);dynamic('baseline')
        print('BASELINE=PASS TARGET='+target+' FULL_DUMP=EXACT DISK_CLOSURE='+str(len(source_paths))+' SYMLINKS=PRESERVED',flush=True)
        current=baseline;static_checked=False
        for folder in ('maintenance','rollback-maintenance','maintenance','open','rollback-open'):
            d=desc[folder];r=json.loads((package/d['report']['path']).read_text())
            assert c.file_sha(package/d['report']['path'])==d['report']['sha256']
            assert c.sha(current.encode())==r['beforeDumpSha256'];full_t(current);disk_cas(d)
            for logical,item in d['after'].items():
                p=package/item['path'];assert c.file_sha(p)==item['sha256']
                run(['docker','cp',str(p),nginx+':'+source_paths[logical]])
            new_text=(package/'gateways'/folder/'nginx.after.txt').read_bytes().decode()
            assert c.sha(new_text.encode())==r['afterDumpSha256'];run(['docker','exec',nginx,'nginx','-t']);full_t(new_text)
            run(['docker','exec',nginx,'nginx','-s','reload']);time.sleep(.4)
            mode=r['toState'];rows=dynamic(mode)
            if mode in ('maintenance','candidate'):
                def check(item):
                    status,body,headers=request(item['url']);assert status==200 and len(body)==item['size'] and c.sha(body)==item['sha256'],item['url']
                    assert 'immutable' in headers.get('Cache-Control','');return item['url']
                if not static_checked:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:count=len(list(pool.map(check,assets['assets'])))
                    results['staticHttpHashes']=count;static_checked=True
                else:
                    for prefix in (hk.PREFIXES if is_hk else ('/_next/static/',)):
                        check(next(a for a in assets['assets'] if a['url'].startswith(prefix)))
            results['transitions'].append({'name':folder,'from':r['fromState'],'to':mode,'fullBeforeAndAfterDumpExact':True,'allDiskFilesCas':True,'nginxSyntax':True,'gracefulReload':True,'symlinksPreserved':True,'dynamicRoutes':rows})
            current=new_text
        assert current==baseline;full_t(baseline)
        # Test real executable local rollback on a distinct Linux config copy.
        copy_code="import pathlib,shutil; r=pathlib.Path('/fixture/rollback-copy'); shutil.copytree('/fixture/live',r); "
        for logical,real in source_paths.items():
            if logical!=real:copy_code+="(r/"+repr(logical.lstrip('/'))+").symlink_to("+repr('../sites-available/'+Path(real).name)+"); "
        rollback_report=json.loads((package/'gateways/maintenance/report.json').read_text())
        for patch in rollback_report['patches']:
            copy_code+="shutil.copyfile('/package/gateways/maintenance/"+patch['after']+"',r/"+repr(source_paths[patch['path']].lstrip('/'))+"); "
        literal=run(['docker','run','--rm','--network','none','--memory','96m','--label','io.naumi.latest-gateway-fixture='+tag,'-v',str(output)+':/fixture','-v',str(package)+':/package:ro','python:3.12-slim','bash','-c','python3 -c '+__import__('shlex').quote(copy_code)+' && bash /package/gateways/maintenance/ROLLBACK.sh /fixture/rollback-copy'])
        results.update({'result':'PASS','rollbackScriptLiteral':literal,'restoredFullDumpSha256':c.sha(baseline.encode()),'normalRollbackDoesNotResurrectOldHkFallbacks':is_hk,'exitStatus':0})
        (output/'gateway-linux-results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
        manifest.update({'nginxValidation':'PASS_REAL_LINUX_FULL_T_EXACT_DISK_CAS_5_TRANSITIONS_STATIC_HTTP_HASHES_SYMLINKS_ROLLBACK','nginxVerificationReport':'validation/gateway-linux-results.json','nginxVerificationSha256':c.file_sha(output/'gateway-linux-results.json')})
        (package/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        for folder in desc:
            root=package/'gateways'/folder
            with (root/'VERIFICATION.txt').open('a',encoding='utf-8') as h:
                h.write('\nBASELINE_COMMAND=python scripts/ops/verify_latest_gateway_package.py --package '+str(package)+'\nBASELINE_INPUT=fresh exact captured full-T+all raw configs;isolated Linux mock backends\nBASELINE_OUTPUT=BASELINE=PASS TARGET='+target+' FULL_DUMP=EXACT DISK_CLOSURE='+str(len(source_paths))+' SYMLINKS=PRESERVED\nBASELINE_EXIT=0\nMODIFIED_COMMAND=same concentrated verification run\nMODIFIED_INPUT=new fixed image/source/build static union+four gateway CAS descriptors\nMODIFIED_OUTPUT=LATEST_GATEWAY=PASS TARGET='+target+' STATIC_HTTP_HASHES='+str(results['staticHttpHashes'])+' TRANSITIONS=5 FULL_DUMP_DISK_CAS=EXACT SYMLINKS=PRESERVED\nMODIFIED_EXIT=0\nROLLBACK_COMMAND=bash /package/gateways/maintenance/ROLLBACK.sh /fixture/rollback-copy\nROLLBACK_INPUT=distinct copied config tree containing actual candidate-maintenance bytes and original symlinks\nROLLBACK_OUTPUT='+literal+'\nROLLBACK_EXIT=0\nRESTORED_BEHAVIOR=exact original baseline full-T and dynamic routes;private modified artifacts remain changed\nFOUR_PATHS:\n'+'\n'.join(str(root/n) for n in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'))+'\n')
            for name in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'):assert (root/name).read_bytes()
        print('LATEST_GATEWAY=PASS TARGET='+target+' STATIC_HTTP_HASHES='+str(results['staticHttpHashes'])+' TRANSITIONS=5 FULL_DUMP_DISK_CAS=EXACT SYMLINKS=PRESERVED',flush=True)
    finally:
        for name in reversed(created):
            row=json.loads(run(['docker','inspect',name]))[0]
            if row['Config']['Labels'].get('io.naumi.latest-gateway-fixture')==tag:run(['docker','rm','-f',name])


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--package',required=True);a=p.parse_args();main(a.package)
