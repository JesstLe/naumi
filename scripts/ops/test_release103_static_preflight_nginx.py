#!/usr/bin/env python3
"""Concentrated actual Linux Nginx baseline/static-only/rollback test; no live host."""
import hashlib
import json
import os
from pathlib import Path
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import release103_gateway as hk
import release103_static_preflight as pre
from release_client_compat import CompatError, Dump, sha
from test_release103_gateway_nginx import BACKEND, certificate, run

ROOT=Path(os.environ.get('NAUMI103_PREFLIGHT_SOURCE','E:/Workspace/naumi/output/release103-evening-20261016'))
SOURCE=ROOT/'final-prepared-0614-unified'


def main():
    base=Path(os.environ.get('NAUMI103_PREFLIGHT_OUTPUT','output/release103-static-preflight-'+uuid.uuid4().hex[:8])).resolve()
    assert not base.exists()
    base.mkdir(parents=True)
    text=(SOURCE/'package/gateways/maintenance/nginx.before.txt').read_bytes().decode()
    sources={name:(ROOT/'legacy-assets/exact-configs'/name.lstrip('/')).read_bytes() for name in Dump(text).files}
    manifest=json.loads((SOURCE/'static-union/manifest.json').read_text())
    assert len(manifest['assets'])==3027
    pre.prepare(text,sources,manifest,base/'package')
    package=base/'package'
    forward=package/'gateways/static-preflight'
    # Concentrated negative validation: no stale baseline, wrong disk CAS,
    # conflicting static namespace or descriptor hash accepted.
    for changed in (text+'\n',text.replace(':13062;',':13063;',1)):
        try: pre.render(changed,manifest)
        except CompatError: pass
        else: raise AssertionError('Stale/unreviewed baseline accepted')
    try: pre.prepare(text,{**sources,hk.SITE:sources[hk.SITE]+b'\n'},manifest,base/'bad')
    except CompatError: pass
    else: raise AssertionError('Changed disk CAS accepted')
    descriptors=json.loads((package/'gateways.json').read_text())
    for descriptor in descriptors.values():
        for item in [descriptor['report'],*descriptor['before'].values(),*descriptor['after'].values()]:
            assert sha((package/item['path']).read_bytes())==item['sha256']
        assert len(descriptor['before'])==3 and len(descriptor['after'])==1
    live=base/'live'
    for name,raw in sources.items():
        target=live/name.lstrip('/')
        if name==hk.SITE:target=live/'etc/nginx/sites-available/default'
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(raw)
    (live/'etc/nginx/sites-enabled').mkdir()
    # Only fixture worker count differs; test compares real nginx-T to exact
    # expected dump with this single documented substitution.
    main_config=live/'etc/nginx/nginx.conf'
    main_config.write_bytes(sources['/etc/nginx/nginx.conf'].replace(b'worker_processes auto;',b'worker_processes 1;'))
    certificate(base)
    cert=live/'etc/nginx/ssl/naumi.top';cert.mkdir(parents=True)
    (cert/'origin.pem').write_bytes((base/'cert.pem').read_bytes())
    (cert/'origin.key').write_bytes((base/'key.pem').read_bytes())
    (base/'backend.py').write_text(BACKEND,encoding='utf-8')
    name='hk103-static-'+uuid.uuid4().hex[:10]
    backend,nginx=name+'-backend',name+'-nginx'
    created=[]
    results={'fixtureOnly':True,'productionConnections':0,'supplierCalls':0,'actualNextOrDbAcceptance':False,
             'fixtureAdaptations':['self-signed TLS cert at original paths','www-data local user','worker_processes1'],
             'beforeDumpSha256':hk.LIVE_DUMP_SHA,'afterDumpSha256':json.loads((forward/'report.json').read_text())['afterDumpSha256']}
    context=ssl.create_default_context(cafile=str(base/'cert.pem'))
    try:
        run(['docker','run','-d','--name',backend,'--label','io.naumi.hk103-fixture='+name,'--memory','128m','--cpus','0.5','-p','127.0.0.1::80','-p','127.0.0.1::443','-v',str(base)+':/fixture:ro','python:3.12-alpine','python','/fixture/backend.py']);created.append(backend)
        for _ in range(60):
            if subprocess.run(['docker','exec',backend,'test','-f','/tmp/ready'],capture_output=True).returncode==0:break
            time.sleep(.1)
        else:raise AssertionError('Backend readiness failed')
        ports=json.loads(run(['docker','inspect',backend]))[0]['NetworkSettings']['Ports']
        created.append(nginx)
        run(['docker','run','-d','--name',nginx,'--label','io.naumi.hk103-fixture='+name,'--memory','128m','--cpus','0.5','--network','container:'+backend,'-v',str(base)+':/fixture:ro','-v',str(SOURCE/'static-union')+':'+pre.STATIC_ROOT+':ro','nginx:1.27-alpine','sh','-c','rm -rf /etc/nginx/conf.d /etc/nginx/sites-enabled; cp -a /fixture/live/etc/nginx/. /etc/nginx/; ln -s ../sites-available/default /etc/nginx/sites-enabled/default; adduser -S -G nginx www-data; exec nginx -g "daemon off;"'])

        def request(path,tls=False):
            port=ports['443/tcp' if tls else '80/tcp'][0]['HostPort']
            url=('https' if tls else 'http')+'://127.0.0.1:'+port+urllib.parse.quote(path,safe='/?=&%')
            req=urllib.request.Request(url,headers={'Host':'naumi.top','Connection':'close','X-Forwarded-For':'203.0.113.99','CF-Connecting-IP':'198.51.100.11'})
            try:
                with urllib.request.urlopen(req,context=context,timeout=15) as r:return r.status,r.read(),dict(r.headers)
            except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
        for _ in range(100):
            try:
                if request('/api/version')[0]==200:break
            except Exception:pass
            time.sleep(.1)
        else:raise AssertionError('Nginx readiness failed: '+run(['docker','logs',nginx]))

        def verify_dump(expected):
            observed=run(['docker','exec',nginx,'nginx','-T'])+'\n'
            # run strips final newline; raw subprocess preserves exact-T stdout.
            p=subprocess.run(['docker','exec',nginx,'nginx','-T'],capture_output=True)
            assert p.returncode==0
            assert p.stdout.decode()==expected.replace('worker_processes auto;','worker_processes 1;'), 'Full actual nginx-T diverged'
            assert run(['docker','exec',nginx,'readlink','/etc/nginx/sites-enabled/default'])=='../sites-available/default'
        def install(path,expected):
            run(['docker','cp',str(path),nginx+':/etc/nginx/sites-available/default'])
            run(['docker','exec',nginx,'nginx','-t'])
            verify_dump(expected)
            run(['docker','exec',nginx,'nginx','-s','reload']);time.sleep(.4)
        _,_,locations=hk.inventory(text)
        probes=[]
        for key,node in locations.items():
            if key in hk.FALLBACKS:continue
            path='/.fixture-secret' if key.startswith('~ ') else node.args[-1]
            if key not in hk.DENIES and node.args[0]!='=':path+='fixture'
            if key in hk.DENIES and not key.startswith('~ '):path+='tick'
            proxy=next((c.args[0] for c in node.children if c.name=='proxy_pass'),None)
            probes.append((key,path,proxy))
        def dynamic():
            rows=[]
            for tls in (False,True):
                for key,path,proxy in probes:
                    status,data,_=request(path,tls)
                    assert status==(int(hk.DENIES[key]) if key in hk.DENIES else 200),(key,status)
                    if proxy:
                        row=json.loads(data)
                        assert row['port']==int(proxy.split(':')[2].split('/')[0]),(key,row)
                        suffix=proxy.partition('://')[2].partition('/')[2]
                        expected_path=('/'+suffix+('fixture' if key.startswith('^~') else '')) if suffix else path
                        assert row['path']==expected_path,(key,row,expected_path)
                        assert row['proto']==('https' if tls else 'http')
                    else:row={'status':status}
                    rows.append({'location':key,'tls':tls,'response':row})
            return rows
        run(['docker','exec',nginx,'nginx','-t']);verify_dump(text)
        baseline=dynamic();results['baseline']=baseline
        print('BASELINE=PASS REAL_LINUX_NGINX=YES DYNAMIC_CLASSES=48 HTTP_TLS_PROBES=96 FULL_DUMP=EXACT SYMLINK=PRESERVED',flush=True)
        after=(forward/'nginx.after.txt').read_bytes().decode()
        install(forward/'after'/hk.SITE.lstrip('/'),after)
        modified=dynamic();assert modified==baseline,'Dynamic upstream/path/header semantics changed'
        results['modified']=modified
        checked=0
        for asset in manifest['assets']:
            status,data,headers=request(asset['url'])
            assert status==200 and len(data)==asset['size'] and hashlib.sha256(data).hexdigest()==asset['sha256'],asset['url']
            assert 'immutable' in headers.get('Cache-Control','')
            checked+=1
        for prefix in hk.PREFIXES:
            assert request(prefix+'not-present-fixture.js')[0]==404
            assert request(prefix)[0]==403
        results['staticHttpHashes']=checked
        print('MODIFIED=PASS STATIC_HTTP_HASHES=3027 DYNAMIC_CLASSES=48 HTTP_TLS_PROBES=96 ORIGINAL_HEADERS_PATHS_PORTS=EXACT FALLBACKS_REMOVED=17 REFERENCES_REMOVED=9',flush=True)
        # Execute actual rollback on ANOTHER copied Linux tree, including symlink.
        setup="import pathlib,shutil; r=pathlib.Path('/fixture/rollback-copy'); shutil.copytree('/fixture/live',r); shutil.copyfile('/fixture/package/gateways/static-preflight/MODIFIED_FILE',r/'etc/nginx/sites-available/default'); (r/'etc/nginx/sites-enabled/default').symlink_to('../sites-available/default')"
        rollback_cmd=['docker','run','--rm','--network','none','--memory','96m','--label','io.naumi.hk103-fixture='+name,'-v',str(base)+':/fixture','python:3.12-slim','bash','-c','python3 -c '+__import__('shlex').quote(setup)+' && bash /fixture/package/gateways/static-preflight/ROLLBACK.sh /fixture/rollback-copy']
        literal=run(rollback_cmd)
        assert (base/'rollback-copy/etc/nginx/sites-available/default').read_bytes()==sources[hk.SITE]
        install(base/'rollback-copy/etc/nginx/sites-available/default',text)
        assert dynamic()==baseline
        assert (forward/'MODIFIED_FILE').read_bytes()!=sources[hk.SITE]
        results['rollbackScriptLiteral']=literal
        results['restoredBehavior']='48 dynamic classes/96 HTTP+TLS upstream,path,header responses identical; full original dump restored;sites-enabled symlink preserved'
        print(literal,flush=True)
        print('ROLLBACK=PASS DYNAMIC_CLASSES=48 HTTP_TLS_PROBES=96 ORIGINAL_FULL_DUMP=EXACT SYMLINK=PRESERVED MODIFIED_ARTIFACT=CHANGED',flush=True)
        results['exitStatus']=0
        (base/'results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
        evidence='\nCOMMAND=python scripts/ops/test_release103_static_preflight_nginx.py\nINPUT=exact captured original3 configs + final0614 union3027 files; isolated Linux mock backends\nBASELINE=PASS REAL_LINUX_NGINX=YES DYNAMIC_CLASSES=48 HTTP_TLS_PROBES=96 FULL_DUMP=EXACT SYMLINK=PRESERVED\nBASELINE_EXIT=0\nMODIFIED=PASS STATIC_HTTP_HASHES=3027 DYNAMIC_CLASSES=48 HTTP_TLS_PROBES=96 ORIGINAL_HEADERS_PATHS_PORTS=EXACT FALLBACKS_REMOVED=17 REFERENCES_REMOVED=9\nMODIFIED_EXIT=0\nROLLBACK_COMMAND=bash /fixture/package/gateways/static-preflight/ROLLBACK.sh /fixture/rollback-copy\nROLLBACK_INPUT=another copied tree with candidate bytes and real sites-enabled symlink\nROLLBACK_OUTPUT='+literal+'\nROLLBACK_EXIT=0\nRESTORED_BEHAVIOR='+results['restoredBehavior']+'\nNO_LIVE_CONNECTIONS=YES\n'
        for folder in ('static-preflight','rollback-static-preflight'):
            root=package/'gateways'/folder
            paths=[root/n for n in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh')]
            with (root/'VERIFICATION.txt').open('a',encoding='utf-8') as h:h.write(evidence+'FOUR_PATHS:\n'+'\n'.join(str(p) for p in paths)+'\n')
            for p in paths:assert p.read_bytes()
    finally:
        for container in reversed(created):
            try:
                info=json.loads(run(['docker','inspect',container]))[0]
                if info['Config']['Labels'].get('io.naumi.hk103-fixture')==name:run(['docker','rm','-f',container])
            except Exception as e:print('FIXTURE_CLEANUP_ERROR='+str(e),flush=True)
    print('STATIC_PREFLIGHT_FIXTURE=PASS LIVE_CONNECTIONS=0 OUTPUT='+str(base),flush=True)


if __name__=='__main__':main()
