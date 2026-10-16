#!/usr/bin/env python3
"""Real limited Linux Nginx/TLS/HTTP, mock oldclass/newclass persisted save.

No production connections. This intentionally does NOT prove real old Next RSC
decoding or production canvas persistence. nginx=128MiB/0.5CPU, backend=96MiB.
"""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

import release_client_compat as compat
from test_release_client_compat import fixture_files, dump_files, OLD, ALIAS_URL, SITE


def run(args, raw=False):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(str(args[:3]) + ': ' + result.stderr[-3000:])
    return result.stdout if raw else result.stdout.strip()


def certificate(root):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, '47.105.59.142')])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=1)).not_valid_after(now + datetime.timedelta(days=1)).sign(key, hashes.SHA256())
    (root / 'key.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
    (root / 'cert.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))


BACKEND = r'''
const http=require('node:http'),fs=require('node:fs');
const store='/tmp/oldclass-save-fixture.json';fs.writeFileSync(store,'{}');
for(const port of [13070,13071,13068,13063,13052,13072,13073,13100,17847]){
 const build=port===17847?'legacy17847':port===13100?'newclass':'oldclass';
 http.createServer(async(req,res)=>{
  res.setHeader('x-fixture-build',build);
  if(req.url.startsWith('/api/canvas/history')){
   if(!String(req.headers.cookie).includes('fixture_owner=alice')){res.writeHead(401);res.end('unauthenticated');return;}
   const state=JSON.parse(fs.readFileSync(store));
   if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;let op=JSON.parse(body);if(!op.operationId||!Array.isArray(op.operations)){res.writeHead(400);res.end('bad oldclass payload');return;}
    if(state[op.operationId]&&JSON.stringify(state[op.operationId])!==JSON.stringify(op)){res.writeHead(409);res.end('idempotency mismatch');return;}
    state[op.operationId]=op;fs.writeFileSync(store,JSON.stringify(state));res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,persisted:true,operationId:op.operationId,build}));return;
   }
   res.setHeader('content-type','application/json');res.end(JSON.stringify(state));return;
  }
  if(req.headers.rsc==='1'){res.setHeader('content-type','text/x-component');res.end('0:'+JSON.stringify({fixture:true,build,chunk:build==='oldclass'?'old.js':'new.js'})+'\n');return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({build,path:req.url,method:req.method}));
 }).listen(port,'0.0.0.0');
}
'''


def check_captured_real_config(base, container, manifest):
    source = os.environ.get('NAUMI_COMPAT_REAL_DUMP')
    if not source:
        return None
    captured = Path(source).read_bytes().decode()
    _, after, report = compat.render_gateway(captured, SITE, 'http://127.0.0.1:13100', OLD, '/fixture/union', manifest)
    (base / 'real47.after.dump.txt').write_bytes(after.encode())
    (base / 'real47.render-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    for phase, text in [('baseline', captured), ('candidate', after)]:
        dump = compat.Dump(text)
        # Only the test copy relocates includes/certificates and Alpine's OS user.
        # Generator output above keeps real TLS/security/header bytes untouched.
        fixture_prefix = '/fixture/real47/' + phase
        for name, body in dump.files.items():
            changes = []
            for node in compat.walk(dump.nodes[name]):
                if node.name == 'include':
                    path = node.args[0]
                    absolute = path if path.startswith('/') else dump.prefix + '/' + path
                    changes.append((node.tokens[1].start, node.tokens[1].end, compat.quote(fixture_prefix + absolute)))
                elif node.name == 'user':
                    changes.append((node.start, node.end, 'user nginx;'))
                elif node.name in ('ssl_certificate', 'ssl_certificate_key'):
                    changes.append((node.tokens[1].start, node.tokens[1].end, '/fixture/' + ('cert.pem' if node.name == 'ssl_certificate' else 'key.pem')))
            for start, end, replacement in sorted(changes, reverse=True):
                body = body[:start] + replacement + body[end:]
            path = base / 'real47' / phase / name.lstrip('/')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body.encode())
        run(['docker', 'exec', container, 'nginx', '-t', '-c', fixture_prefix + dump.root])
    return {'baselineAndCandidateLinuxNginxSyntax': 'PASS', 'capturedDumpSha256': compat.sha(captured.encode()), 'files': len(compat.Dump(captured).files), 'changedEndpoints': len(report['changedEndpoints']), 'realServerActionsOrPersistenceTested': False}


def main():
    base = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/client-compat47-nginx-' + uuid.uuid4().hex[:8]).resolve()
    compat.require(not base.exists(), 'New integration output directory required')
    base.mkdir(parents=True)
    tag = uuid.uuid4().hex[:10]
    name, backend, network = 'compat-nginx-' + tag, 'compat-backend-' + tag, 'compat-isolated-' + tag
    names, created_network = [], False
    try:
        fixture = fixture_files()
        site = fixture[SITE]
        # Our fixture is explicit version ownership, not an actual Next runtime.
        (base / 'site.conf').write_bytes(site.encode())
        (base / 'other.conf').write_bytes(fixture['/etc/nginx/sites-enabled/other'].encode())
        (base / 'nginx.conf').write_bytes(b'worker_processes 1; pid /tmp/compat-nginx.pid; error_log stderr; events {worker_connections 128;} http {access_log off; types {application/javascript js; text/css css;} include /fixture/other.conf; include /fixture/site.conf;}\n')
        (base / 'backend.cjs').write_text(BACKEND, encoding='utf-8')
        certificate(base)
        (base / 'old/chunks').mkdir(parents=True)
        (base / 'new/chunks').mkdir(parents=True)
        (base / 'old/chunks/old.js').write_bytes(b'// oldclass original static bytes\n')
        (base / 'new/chunks/new.js').write_bytes(b'// newclass added bytes\n')
        (base / 'patched.js').write_bytes(b'// immutable overlay original bytes\n')
        manifest = compat.collect_assets([('oldclass', base / 'old'), ('newclass', base / 'new')], [(ALIAS_URL, base / 'patched.js')])
        compat.materialize_assets(manifest, base / 'union')
        # Docker 29's isolated/internal bridge suppresses published host ports.
        # The two fixture processes only contact their shared loopback namespace.
        run(['docker', 'network', 'create', network]); created_network = True
        run(['docker', 'run', '-d', '--name', name, '--label', 'io.naumi.compat-fixture=' + tag, '--network', network, '--memory', '128m', '--cpus', '0.5', '--pids-limit', '64', '-p', '127.0.0.1::443', '-p', '127.0.0.1::17848', '-v', str(base) + ':/fixture:ro', 'nginx:1.27-alpine', 'nginx', '-g', 'daemon off;', '-c', '/fixture/nginx.conf']); names.append(name)
        run(['docker', 'run', '-d', '--name', backend, '--label', 'io.naumi.compat-fixture=' + tag, '--network', 'container:' + name, '--memory', '96m', '--cpus', '0.5', '--pids-limit', '48', '-v', str(base / 'backend.cjs') + ':/fixture-backend.cjs:ro', 'node:24-bookworm-slim', 'node', '/fixture-backend.cjs']); names.append(backend)
        port = run(['docker', 'port', name, '443/tcp']).split(':')[-1]
        other_port = run(['docker', 'port', name, '17848/tcp']).split(':')[-1]
        origin = 'https://127.0.0.1:' + port
        context = ssl._create_unverified_context()

        def request(path, headers=None, body=None):
            headers = {'Host': '47.105.59.142', **(headers or {})}
            if body is not None:
                headers['Content-Type'] = 'application/json'; body = json.dumps(body).encode()
            with urllib.request.urlopen(urllib.request.Request(origin + path, headers=headers, data=body), context=context, timeout=8) as response:
                return response.status, response.read(), dict(response.headers)

        for attempt in range(50):
            try:
                if json.loads(request('/api/version')[1])['build'] == 'oldclass':
                    break
            except Exception:
                time.sleep(0.1)
        else:
            raise AssertionError('Fixture old backend not ready')
        captured = run(['docker', 'exec', name, 'nginx', '-T', '-c', '/fixture/nginx.conf'], raw=True)
        (base / 'nginx.before.txt').write_text(captured, encoding='utf-8')
        patches, after, report = compat.render_gateway(captured, '/fixture/site.conf', 'http://127.0.0.1:13100', OLD, '/fixture/union', manifest)
        compat.write_gateway_bundle(captured, patches, after, report, base / 'gateway', {'/fixture/site.conf': (base / 'site.conf').read_bytes()})
        before_hash = compat.file_sha(base / 'site.conf')
        # nginx -t validates both old and generated copies with actual TLS/regex/maps.
        run(['docker', 'exec', name, 'nginx', '-t', '-c', '/fixture/nginx.conf'])
        real_syntax = check_captured_real_config(base, name, manifest)
        assert json.loads(request('/canvas')[1])['build'] == 'oldclass'
        old_rsc = request('/canvas?_rsc=oldclass', {'RSC': '1'})
        assert old_rsc[2]['Content-Type'].startswith('text/x-component') and b'oldclass' in old_rsc[1]
        (base / 'oldclass-rsc.before.txt').write_bytes(old_rsc[1])
        payload = {'operationId': 'oldclass-open-document-1', 'operations': [{'type': 'fixture-position', 'x': 42, 'y': 87}]}
        owner = {'Cookie': 'fixture_owner=alice'}
        assert json.loads(request('/api/canvas/history', owner, payload)[1])['persisted'] is True
        print('BASELINE=PASS REAL_LINUX_NGINX=1 TLS=1 OLDCLASS_SAVE_READBACK=1', flush=True)
        shutil.copyfile(base / 'gateway/after/fixture/site.conf', base / 'site.conf')
        syntax = run(['docker', 'exec', name, 'nginx', '-t', '-c', '/fixture/nginx.conf'])
        real_after_dump = run(['docker', 'exec', name, 'nginx', '-T', '-c', '/fixture/nginx.conf'], raw=True)
        assert compat.sha(real_after_dump.encode()) == report['afterDumpSha256'], 'Generated full dump hash differs from actual nginx -T'
        run(['docker', 'exec', name, 'nginx', '-s', 'reload', '-c', '/fixture/nginx.conf'])
        for _ in range(50):
            if json.loads(request('/api/version')[1])['build'] == 'newclass':
                break
            time.sleep(0.05)
        else:
            raise AssertionError('New fixture gateway not observed')
        # Reload acknowledgement precedes old worker accept-loop shutdown.
        # Business assertions start after a bounded stabilization interval.
        time.sleep(0.35)
        cases = [('/api/auth/login', {}, 'newclass'), ('/api/auth/login', {'Cookie': 'wb_session=old', 'Referer': 'https://47.105.59.142/dashboard'}, 'newclass'), ('/api/auth/login', {'Cookie': 'wb_session=old', 'Referer': 'https://47.105.59.142/legacy-workbench/workbench'}, 'legacy17847'), ('/api/status', {'Cookie': 'wb_session=old'}, 'legacy17847'), ('/api/status', {'Cookie': 'nv_user=native; wb_session=old'}, 'newclass'), ('/api/reference-workbench/status', {}, 'newclass'), ('/api/internal/model-capacity', {}, 'newclass'), ('/canvas', {}, 'newclass'), ('/health', {}, 'newclass'), ('/workbench-history.js', {}, 'legacy17847'), ('/workbench-zip.js', {}, 'legacy17847'), ('/legacy-workbench/single', {}, 'legacy17847')]
        for path, headers, expected in cases:
            actual = json.loads(request(path, headers)[1])
            assert actual['build'] == expected, (path, actual, expected)
        with urllib.request.urlopen('http://127.0.0.1:' + other_port, timeout=5) as response:
            assert response.read() == b'infra'
        for entry in manifest['assets']:
            status, body, headers = request(entry['url'])
            assert status == 200 and compat.sha(body) == entry['sha256']
            assert 'immutable' in headers.get('Cache-Control', '')
            assert headers.get('Content-Type') == 'application/javascript'
        new_rsc = request('/canvas?_rsc=oldclass', {'RSC': '1'})
        assert new_rsc[2]['Content-Type'].startswith('text/x-component') and b'newclass' in new_rsc[1]
        (base / 'oldclass-rsc.after.txt').write_bytes(new_rsc[1])
        # Literal old payload is persisted once and read back, not just status 200.
        result = json.loads(request('/api/canvas/history', owner, payload)[1])
        readback = json.loads(request('/api/canvas/history', owner)[1])
        assert result['persisted'] is True and result['operationId'] == payload['operationId']
        assert readback == {payload['operationId']: payload}
        for bad_headers in ({}, {'Cookie': 'fixture_owner=mallory'}):
            try:
                request('/api/canvas/history', bad_headers, payload)
                raise AssertionError('Unauthenticated fixture save accepted')
            except urllib.error.HTTPError as error:
                assert error.code == 401
        result = {'fixtureOnly': True, 'routeCases': len(cases), 'staticAssetsExact': len(manifest['assets']), 'oldPayloadPersistedAndReadBack': True, 'oldOperationCount': len(readback), 'rscVersionAttribution': 'oldclass-before/newclass-after; mock wire format, not real Next decoder', 'realOldClientComplete': False, 'unrelated17848Preserved': True, 'legacy17847Preserved': True, 'nginxMemoryLimitMiB': 128, 'nginxCpuLimit': 0.5, 'productionConnections': 0, 'supplierCalls': 0}
        result['capturedReal47Syntax'] = real_syntax
        result['generatedDumpHashEqualsRealNginxT'] = True
        print('MODIFIED=PASS REAL_LINUX_NGINX=1 ROUTE_CASES=' + str(len(cases)) + ' STATIC_EXACT=3 OLDCLASS_SAVE_READBACK=1 MOCK_RSC_VERSION_ATTRIBUTION=1 REAL_OLD_CLIENT_COMPLETE=0', flush=True)
        # Restore an exact before copy and test actual serving after graceful rollback.
        shutil.copyfile(base / 'gateway/before/fixture/site.conf', base / 'site.conf')
        assert compat.file_sha(base / 'site.conf') == before_hash
        run(['docker', 'exec', name, 'nginx', '-t', '-c', '/fixture/nginx.conf'])
        run(['docker', 'exec', name, 'nginx', '-s', 'reload', '-c', '/fixture/nginx.conf'])
        for _ in range(50):
            if json.loads(request('/api/version')[1])['build'] == 'oldclass':
                break
            time.sleep(0.05)
        else:
            raise AssertionError('Old fixture gateway not restored')
        time.sleep(0.35)
        assert json.loads(request('/api/canvas/history', owner)[1]) == readback
        result['rollbackOriginalBytesAndBehavior'] = True
        (base / 'results.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print('ROLLBACK=PASS ORIGINAL_CONFIG_BYTES=EXACT OLDCLASS_ROUTING=RESTORED SAVED_OPERATION=RETAINED PRODUCTION_CHANGED=0', flush=True)
    finally:
        for container in reversed(names):
            try:
                info = json.loads(run(['docker', 'inspect', container]))[0]
                if info['Config']['Labels'].get('io.naumi.compat-fixture') == tag:
                    run(['docker', 'rm', '-f', container])
            except Exception as error:
                print('FIXTURE_CLEANUP_ERROR=' + str(error), file=sys.stderr)
        if created_network:
            run(['docker', 'network', 'rm', network])


if __name__ == '__main__':
    main()
