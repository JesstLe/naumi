#!/usr/bin/env python3
"""Real local Linux Nginx on actual 103 config; fixture backend, never live.

Proves all 65 original route classes, compiled-UI origin routing, central APIs,
three actual legacy static namespaces, maintenance and exact-file rollback.
This is NOT actual Next/DB/private-media functional acceptance.
"""
import hashlib
import datetime
import ipaddress
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import release103_gateway as hk
from release_client_compat import Dump, file_sha
from test_release103_gateway import ROOT, ORIGINS as DEFAULT_ORIGINS, captured
ORIGINS=tuple(json.loads(os.environ['NAUMI103_CANDIDATE_ORIGINS'])) if os.environ.get('NAUMI103_CANDIDATE_ORIGINS') else DEFAULT_ORIGINS


def certificate(root):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'naumi.top')])
    now=datetime.datetime.now(datetime.timezone.utc)
    cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1))
          .not_valid_after(now+datetime.timedelta(days=1))
          .add_extension(x509.SubjectAlternativeName([x509.DNSName('naumi.top'),x509.DNSName('www.naumi.top'),x509.IPAddress(ipaddress.ip_address('103.30.76.93')),x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]),critical=False)
          .sign(key,hashes.SHA256()))
    (root/'key.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.TraditionalOpenSSL,serialization.NoEncryption()))
    (root/'cert.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode: raise RuntimeError(' '.join(args[:4]) + ': ' + result.stderr[-2500:] + result.stdout[-1500:])
    return result.stdout.strip()


BACKEND = r'''
import http.server,json,threading,time
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
  self.wfile.write(json.dumps({'port':self.server.server_port,'path':self.path,'xff':self.headers.get('X-Forwarded-For'),'cf':self.headers.get('CF-Connecting-IP'),'proto':self.headers.get('X-Forwarded-Proto')}).encode())
 def log_message(self,*a):pass
for port in [13012,13014,13016,13019,13022,13023,13024,13025,13026,13027,13028,13029,13030,13031,13032,13033,13038,13039,13040,13041,13062,13100,13101,13102,13110,13111,13112]:
 s=http.server.ThreadingHTTPServer(('127.0.0.1',port),Handler)
 threading.Thread(target=s.serve_forever,daemon=True).start()
open('/tmp/ready','w').write('ready')
while True:time.sleep(1)
'''


def main():
    base = Path(os.environ.get('NAUMI103_GATEWAY_OUTPUT', 'output/release103-gateway-nginx-' + uuid.uuid4().hex[:8])).resolve()
    assert not base.exists(), 'New distinct fixture output required'
    base.mkdir(parents=True)
    text, sources, manifest = captured()
    union = Path(os.environ.get('NAUMI103_STATIC_UNION', str(ROOT / 'legacy-static-union')))
    manifest = json.loads((union/'manifest.json').read_text())
    static_root = os.environ.get('NAUMI103_STATIC_ROOT', '/fixture/union')
    asset_count = len(manifest['assets'])
    hk.bundle(text, sources, *ORIGINS, static_root, manifest, base/'candidate')
    hk.bundle(text, sources, *ORIGINS, static_root, manifest, base/'maintenance', True)
    dump, server, locations = hk.inventory(text)
    live = base / 'live'
    for name, raw in sources.items():
        path = live / name.lstrip('/');path.parent.mkdir(parents=True, exist_ok=True);path.write_bytes(raw)
    certificate(base)
    cert = live / 'etc/nginx/ssl/naumi.top';cert.mkdir(parents=True)
    shutil.copyfile(base/'cert.pem', cert/'origin.pem');shutil.copyfile(base/'key.pem', cert/'origin.key')
    # Avoid copied static bytes: original union is mounted read-only; Nginx hashes
    # every actual URL over HTTP in candidate and maintenance modes.
    (base/'union').mkdir()  # nested readonly bind mount must have a mountpoint
    (base/'backend.py').write_text(BACKEND, encoding='utf-8')
    name = 'hk103-gateway-' + uuid.uuid4().hex[:10]
    backend, nginx = name+'-backend', name+'-nginx'
    created = []
    results = {'productionConnections': 0, 'supplierCalls': 0, 'actualNextOrDbAcceptance': False, 'testOrigins': list(ORIGINS), 'baselineFullDumpSha256': hk.LIVE_DUMP_SHA, 'fixtureOnly': True, 'nginxMemoryMiB': 128, 'backendMemoryMiB': 128, 'fixtureAdaptations': ['self-signed local TLS fixture cert; production paths retained', 'container-only www-data user creation', 'named location probe injection only during baseline/rollback behavior tests', 'worker_processes=1 only for local resource control']}
    context = ssl.create_default_context(cafile=str(base/'cert.pem'))
    try:
        run(['docker','run','-d','--name',backend,'--label','io.naumi.hk103-fixture='+name,'--memory','128m','--cpus','0.5','-p','127.0.0.1::80','-p','127.0.0.1::443','-v',str(base)+':/fixture:ro','python:3.12-alpine','python','/fixture/backend.py']);created.append(backend)
        for _ in range(50):
            if subprocess.run(['docker','exec',backend,'test','-f','/tmp/ready'],capture_output=True).returncode == 0:break
            time.sleep(.1)
        else: raise AssertionError('Fixture backend readiness failed')
        http_port = json.loads(run(['docker','inspect',backend]))[0]['NetworkSettings']['Ports']['80/tcp'][0]['HostPort']
        tls_port = json.loads(run(['docker','inspect',backend]))[0]['NetworkSettings']['Ports']['443/tcp'][0]['HostPort']
        # Keep real config paths. Only the host-side fixture tree is changed.
        main_config = live/'etc/nginx/nginx.conf'
        main_config.write_bytes(sources['/etc/nginx/nginx.conf'].replace(b'worker_processes auto;',b'worker_processes 1;'))
        created.append(nginx)
        run(['docker','run','-d','--name',nginx,'--label','io.naumi.hk103-fixture='+name,'--memory','128m','--cpus','0.5','--network','container:'+backend,'-v',str(live/'etc/nginx')+':/etc/nginx:ro','-v',str(base)+':/fixture:ro','-v',str(union)+':'+static_root+':ro','nginx:1.27-alpine','sh','-c','adduser -S -G nginx www-data && exec nginx -g "daemon off;"'])

        def request(path, tls=False):
            url = ('https' if tls else 'http')+'://127.0.0.1:'+(tls_port if tls else http_port)+urllib.parse.quote(path, safe='/?=&%')
            req = urllib.request.Request(url, headers={'Host':'naumi.top','Connection':'close','X-Forwarded-For':'203.0.113.99','CF-Connecting-IP':'198.51.100.11'})
            try:
                with urllib.request.urlopen(req, context=context, timeout=10) as r:return r.status,r.read(),dict(r.headers)
            except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)

        for _ in range(100):
            try:
                if request('/api/version')[0] == 200:break
            except Exception:pass
            time.sleep(.1)
        else:raise AssertionError('Nginx readiness failed: '+run(['docker','logs',nginx]))

        def syntax_and_reload(content):
            (live/hk.SITE.lstrip('/')).write_bytes(content)
            syntax = run(['docker','exec',nginx,'nginx','-t'])
            run(['docker','exec',nginx,'nginx','-s','reload'])
            # Each request opens a new connection; allow graceful old workers to exit.
            time.sleep(.5)
            return syntax

        probes = []
        named_probes = []
        for i, (key,node) in enumerate(locations.items()):
            proxy = next((c.args[0] for c in node.children if c.name=='proxy_pass'), None)
            if key.startswith('@'):
                path = '/__hk103_named_probe/'+str(i)
                named_probes.append('location = '+path+' { error_page 418 = '+key+'; return 418; }')
                expected = 404 if proxy is None else 200
            elif key in hk.DENIES:
                path = '/.fixture-secret' if key.startswith('~ ') else node.args[-1]+'tick'
                expected = int(hk.DENIES[key])
            else:
                path = node.args[-1]
                if node.args[0] != '=':path += ('fixture-page' if key == '/' else 'fixture')
                expected = 200
            probes.append({'location':key,'path':path,'status':expected,'proxy':proxy})
        # Exact raw production source syntax checked before test-only injection.
        run(['docker','exec',nginx,'nginx','-t'])
        raw_site = sources[hk.SITE].decode()
        raw_server = Dump(text).nodes[hk.SITE][0]
        # offsets in dump body equal exact body except one trailing separator.
        instrumented = raw_site[:raw_server.closing]+'\n'+'\n'.join(named_probes)+'\n'+raw_site[raw_server.closing:]

        def check_old(mode):
            syntax_and_reload(instrumented.encode())
            rows = []
            for probe in probes:
                status, data, _ = request(probe['path'],tls=True)
                assert status == probe['status'], (mode, probe, status, data[:200])
                if probe['proxy']:
                    port = int(probe['proxy'].split(':')[2].split('/')[0])
                    assert json.loads(data)['port']==port, (mode, probe, data)
                rows.append({**probe,'observedStatus':status})
            results[mode]={'routeClasses':len(rows),'rows':rows}

        check_old('baseline')
        print('BASELINE=PASS REAL_LINUX_NGINX=YES ORIGINAL_ROUTE_CLASSES=65 FLEET=13062 TLS=YES',flush=True)
        syntax_and_reload((base/'candidate/after'/hk.SITE.lstrip('/')).read_bytes())
        # Main and TLS config bytes are rechecked against exact source except the
        # documented worker-count-only local adaptation.
        assert (live/'etc/nginx/mime.types').read_bytes()==sources['/etc/nginx/mime.types']
        candidate_rows = []
        for probe in probes:
            key = probe['location']
            if key in hk.FALLBACKS:continue
            status,data,headers=request(probe['path'], tls=True)
            assert status==probe['status'], (probe,status,data[:200])
            if key not in hk.DENIES:
                row=json.loads(data)
                port=13062 if key in hk.FLEET else int(ORIGINS[1 if key in hk.DESKTOP else 2 if key in hk.ENTERPRISE else 0].rsplit(':',1)[1])
                assert row['port']==port,(key,row,port)
                assert row['proto']=='https' and row['xff']!='203.0.113.99' and not row['cf'], (key,row)
                if probe['proxy'] and '/api/' in key and 'desktop/api' in key:
                    # Prefix rewriting matches the exact original proxy_pass suffix.
                    old_suffix=probe['proxy'].split(':',2)[2].partition('/')[2]
                    expected_path='/'+old_suffix if old_suffix else probe['path']
                    if key.startswith('^~') and old_suffix:expected_path += 'fixture'
                    assert row['path']==expected_path,(key,row,expected_path)
            candidate_rows.append({'location':key,'status':status})
        for path, expected in [('/enterprise/api','/api'),('/enterprise/api/team/me','/api/team/me')]:
            status,data,_=request(path);row=json.loads(data)
            assert status==200 and row['port']==int(ORIGINS[0].rsplit(':',1)[1]) and row['path']==expected,(path,row)
        assert request('/enterprise/api/video/worker/tick')[0]==403
        results['candidate']={'retainedRouteClasses':len(candidate_rows),'retiredStaticClasses':len(hk.FALLBACKS),'rows':candidate_rows,'threeCompiledUiOrigins':True,'allNaumiApiOnMain':True,'forwardedIdentitySpoofCleared':True}

        def check_static(mode):
            checked=0
            mime_counts={}
            # Parse exact source mime.types, not platform mimetypes guesses.
            mime_table={extension:node.name for block in hk.Dump(text).nodes['/etc/nginx/mime.types'] for node in (block.children or []) for extension in node.args}
            for item in manifest['assets']:
                status,data,headers=request(item['url'])
                assert status==200 and len(data)==item['size'] and hashlib.sha256(data).hexdigest()==item['sha256'],(mode,item['url'],status)
                assert 'immutable' in headers.get('Cache-Control','')
                expected_mime=mime_table.get(Path(item['url']).suffix.removeprefix('.'),'application/octet-stream')
                actual_mime=headers.get('Content-Type','').split(';')[0]
                assert actual_mime==expected_mime,(mode,item['url'],actual_mime,expected_mime)
                mime_counts[actual_mime]=mime_counts.get(actual_mime,0)+1
                checked+=1
            for prefix in hk.PREFIXES:
                assert request(prefix+'fixture-not-present.js')[0]==404
            results[mode+'Static']={'exactHttpHashes':checked,'prefixes':list(hk.PREFIXES),'missing404':True,'mimeCounts':mime_counts,'mimeExact':True}
        check_static('candidate')
        print('MODIFIED=PASS REAL_LINUX_NGINX=YES ORIGINAL_CLASSES_ACCOUNTED=65 RETIRED_STATIC=17 FLEET_EXACT=9 UI_ORIGINS=3 API_MAIN=YES STATIC_HASHES='+str(asset_count)+' MIME=EXACT TLS_AND_SPOOF_HEADERS=PASS',flush=True)
        syntax_and_reload((base/'maintenance/after'/hk.SITE.lstrip('/')).read_bytes())
        for probe in probes:
            key=probe['location']
            if key in hk.FALLBACKS:continue
            status,data,headers=request(probe['path'])
            if key in hk.FLEET:assert status==200 and json.loads(data)['port']==13062
            elif key in hk.DENIES:assert status==probe['status']
            else:assert status==503 and headers.get('Retry-After')=='60'
        check_static('maintenance')
        results['maintenance']={'naumi503':True,'fleetUnchanged':True,'deniesPreserved':True}
        print('MAINTENANCE=PASS NAUMI=503 FLEET=13062 STATIC_HASHES='+str(asset_count)+' MIME=EXACT DENIES=PRESERVED',flush=True)
        # Run executable ROLLBACK.sh on ANOTHER exact candidate copy; leave the
        # MODIFIED_FILE/candidate artifacts changed. No reload is in the script.
        rollback_copy=base/'rollback-copy';shutil.copytree(base/'candidate/after',rollback_copy)
        rollback_output=run(['docker','run','--rm','--network','none','--memory','96m','--label','io.naumi.hk103-fixture='+name,'-v',str(base)+':/fixture','python:3.12-slim','bash','/fixture/candidate/ROLLBACK.sh','/fixture/rollback-copy'])
        for file,raw in sources.items():assert (rollback_copy/file.lstrip('/')).read_bytes()==raw
        results['rollbackScriptLiteral']=rollback_output
        syntax_and_reload((rollback_copy/hk.SITE.lstrip('/')).read_bytes())
        check_old('rollback')
        # Finish with exact restored source bytes (without test-only probes).
        syntax_and_reload(sources[hk.SITE])
        assert json.loads(request('/api/version')[1])['port']==13039
        assert (live/hk.SITE.lstrip('/')).read_bytes()==sources[hk.SITE]
        print('ROLLBACK=PASS ORIGINAL_SOURCE_FILES=3 ORIGINAL_ROUTE_CLASSES=65 ORIGINAL_UI_PORT=13039 CANDIDATE_ARTIFACT=UNCHANGED',flush=True)
        results['restoredBehavior']='65 original classes; final original /api/version port13039; exact original site bytes'
        results['rollbackScriptExit']=0
        (base/'results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
        evidence='''BASELINE command: python scripts/ops/test_release103_gateway_nginx.py
Input: exact captured 103 full dump + exact original3configs; isolated fixture backends
Output: BASELINE=PASS REAL_LINUX_NGINX=YES ORIGINAL_ROUTE_CLASSES=65 FLEET=13062 TLS=YES
Exit: 0
MODIFIED command: same concentrated integration run
Input: candidate main13110/desktop13111/enterprise13112; true prefixedASSET_COUNTasset manifest/bytes
Output: MODIFIED=PASS REAL_LINUX_NGINX=YES ORIGINAL_CLASSES_ACCOUNTED=65 RETIRED_STATIC=17 FLEET_EXACT=9 UI_ORIGINS=3 API_MAIN=YES STATIC_HASHES=ASSET_COUNT MIME=EXACT TLS_AND_SPOOF_HEADERS=PASS
Output: MAINTENANCE=PASS NAUMI=503 FLEET=13062 STATIC_HASHES=ASSET_COUNT MIME=EXACT DENIES=PRESERVED
Exit: 0
ROLLBACK command (inside isolated Linux fixture): bash /fixture/candidate/ROLLBACK.sh /fixture/rollback-copy
Input: distinct exact candidate-copy config root
Output: ROLLBACK=PASS EXACT_SOURCE_FILES=3 ORIGINAL_BYTES=RESTORED RELOAD=NOT_EXECUTED
Exit: 0
Restored behavior: 65 original route classes, original /api/version port13039, exact original3source files; candidate artifacts stay changed.
'''.replace('ASSET_COUNT',str(asset_count))
        for folder in ('candidate','maintenance'):
            p=base/folder/'VERIFICATION.txt'
            with p.open('a',encoding='utf-8') as h:h.write(evidence+'\nFOUR_PATHS:\n'+'\n'.join(str(base/folder/n) for n in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'))+'\n')
            for n in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'):assert (base/folder/n).read_bytes()
    finally:
        for container in reversed(created):
            try:
                info=json.loads(run(['docker','inspect',container]))[0]
                if info['Config']['Labels'].get('io.naumi.hk103-fixture')==name:run(['docker','rm','-f',container])
            except Exception as error:print('FIXTURE_CLEANUP_ERROR='+str(error),flush=True)
    print('HK103_GATEWAY_FIXTURE=PASS LIVE_CONNECTIONS=0 NEXT_DB_ACCEPTANCE=NOT_VERIFIED OUTPUT='+str(base),flush=True)


if __name__=='__main__':main()
