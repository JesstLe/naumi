#!/usr/bin/env python3
"""Actual bounded local Linux Nginx/TLS recovery; backend explicitly synthetic.

No production credentials, DB, media, connections, task dispatch, or acceptance.
"""
import json
import pathlib
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

import release_client_compat as compat
from saas_recovery_gateway import render, server_inventory
from saas_maintenance_probe import read_endpoint, probe_maintenance

BACKEND = r'''
const http=require('node:http');let accepts=0;
http.createServer((req,res)=>{
 if(req.url==='/internal-worker'){
  if(req.headers['x-fixture-worker']!=='isolated-fixture'){res.writeHead(401);res.end('denied');return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({fixture:true,image:'same-fixed-fixture',accepts}));return;
 }
 if(req.method==='POST')accepts++;
 res.setHeader('x-fixture-upstream','reached');res.end('fixture application');
}).listen(13100,'0.0.0.0');
'''


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('LOCAL_RECOVERY_FIXTURE_COMMAND_FAILED: ' + result.stderr[-1200:])
    return result.stdout.strip()


def main():
    root = pathlib.Path(sys.argv[1]).resolve()
    root.mkdir(parents=True, exist_ok=False, mode=0o700)
    tag = uuid.uuid4().hex[:10]
    nginx, backend, network = ['saas-recovery-' + role + '-' + tag for role in ('nginx', 'backend', 'net')]
    created = []
    try:
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
             '-subj', '/CN=isolated-saas-fixture', '-addext', 'subjectAltName=IP:47.105.59.142',
             '-keyout', str(root / 'key.pem'), '-out', str(root / 'cert.pem')])
        (root / 'backend.cjs').write_text(BACKEND)
        (root / 'nginx.conf').write_text('''worker_processes 1; pid /tmp/saas-recovery.pid;
error_log stderr; events { worker_connections 64; }
http { access_log off; include /fixture/site.conf; include /fixture/other.conf; }
''')
        baseline = '''server { listen 80; server_name 47.105.59.142;
location / { return 308 https://$host$request_uri; } }
server { listen 443 ssl; server_name 47.105.59.142;
ssl_certificate /fixture/cert.pem; ssl_certificate_key /fixture/key.pem;
ssl_protocols TLSv1.2 TLSv1.3;
recursive_error_pages on; error_page 503 =200 @unsafe;
location @unsafe { proxy_pass http://127.0.0.1:13100; }
location /legacy-workbench/ { proxy_pass http://127.0.0.1:13100; }
location /_next/static/ { return 200 "old static fixture"; }
location / { error_page 503 =302 https://untrusted.invalid/;
 proxy_pass http://127.0.0.1:13100; }
}
'''
        (root / 'site.conf').write_text(baseline)
        (root / 'other.conf').write_text('server { listen 17848; server_name unrelated; location / { return 200 "unrelated infrastructure"; } }')
        # Docker 29 internal/isolated bridges suppress published ports. A
        # dedicated bridge without IP masquerade permits loopback test ingress
        # without providing NAT egress; all configured upstreams are loopback.
        run(['docker', 'network', 'create', '--opt', 'com.docker.network.bridge.enable_ip_masquerade=false', network])
        run(['docker', 'run', '-d', '--name', nginx, '--label', 'io.naumi.saas-recovery-fixture=' + tag,
             '--network', network, '--memory', '128m', '--memory-swap', '128m', '--cpus', '.5', '--pids-limit', '48',
             '-p', '127.0.0.1::80', '-p', '127.0.0.1::443', '-p', '127.0.0.1::17848', '-p', '127.0.0.1::13100',
             '-v', str(root) + ':/fixture:ro', 'nginx:1.27-alpine', 'nginx', '-c', '/fixture/nginx.conf', '-g', 'daemon off;'])
        created.append(nginx)
        run(['docker', 'run', '-d', '--name', backend, '--label', 'io.naumi.saas-recovery-fixture=' + tag,
             '--network', 'container:' + nginx, '--memory', '96m', '--memory-swap', '96m', '--cpus', '.5', '--pids-limit', '48',
             '-v', str(root / 'backend.cjs') + ':/backend.cjs:ro', 'node:24-bookworm-slim', 'node', '/backend.cjs'])
        created.append(backend)
        origins = {port: ('https' if port == 443 else 'http') + '://127.0.0.1:' +
                   run(['docker', 'port', nginx, str(port) + '/tcp']).split(':')[-1]
                   for port in (80, 443, 17848, 13100)}
        # Only the generated local self-signed fixture cert is exempted here.
        context = ssl._create_unverified_context()

        def request(port, path, method='GET', headers=None):
            req = urllib.request.Request(origins[port] + path, method=method,
                    headers={'Host': '47.105.59.142', **(headers or {})},
                    data=b'{}' if method == 'POST' else None)
            try:
                response = urllib.request.urlopen(req, context=context, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return response.status, response.read(), dict(response.headers)

        def wait(status):
            for _ in range(80):
                try:
                    if request(443, '/api/version')[0] == status:
                        return
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(.1)
            raise AssertionError('LOCAL_RECOVERY_TRANSITION_NOT_OBSERVED')

        wait(200)
        original_dump = run(['docker', 'exec', nginx, 'nginx', '-T', '-c', '/fixture/nginx.conf']) + '\n'
        spec = {'kind': 'saas-controlled-maintenance-recovery',
                'expectedDumpSha256': compat.sha(original_dump.encode()),
                'servers': [row for row in server_inventory(original_dump) if row['path'] == '/fixture/site.conf'],
                'restoreDatabase': False, 'replayAcceptedTasks': False, 'compatibleBusinessRollback': False}
        report = render(original_dump, spec, root / 'recovery', source_files={'/fixture/site.conf': baseline.encode()})
        (root / 'site.conf').write_bytes((root / 'recovery/after/fixture/site.conf').read_bytes())
        run(['docker', 'exec', nginx, 'nginx', '-t', '-c', '/fixture/nginx.conf'])
        run(['docker', 'exec', nginx, 'nginx', '-s', 'reload', '-c', '/fixture/nginx.conf'])
        wait(503)
        # Exercise the exact production HTTP prover against actual HTTP+TLS
        # Nginx sockets. Trust only this disposable cert, with SNI/hostname
        # verification enabled; map audited ports to loopback Docker forwards.
        inventory = {'target':'47.105.59.142','servers':spec['servers'], 'httpEndpoints':[]}
        for server in spec['servers']:
            for listen in server['listen']:
                port = int(listen[0])
                inventory['httpEndpoints'].append({key:server[key] for key in ('path','serverOrdinal')})
                inventory['httpEndpoints'][-1].update(listen=listen, connectAddress='47.105.59.142',
                    origin=('https' if 'ssl' in listen else 'http')+'://47.105.59.142')
        tls_context = ssl.create_default_context(cafile=str(root / 'cert.pem'))
        def local_reader(endpoint, path, method):
            port = int(endpoint['listen'][0])
            actual_port = int(origins[port].rsplit(':',1)[1])
            return read_endpoint({**endpoint,'connectAddress':'127.0.0.1'},path,method,
                                 context=tls_context,port_override=actual_port)
        http_proof = probe_maintenance(inventory,reader=local_reader)
        (root / 'maintenance-http-proof.json').write_text(json.dumps(http_proof,indent=2))
        assert http_proof['passed'], 'ACTUAL_MAINTENANCE_HTTP_PROVER_FAILED'
        cases = []
        for path in ('/', '/admin/', '/enterprise', '/api/admin/tenants', '/api/enterprise/records',
                     '/api/imagegen', '/api/generate-image', '/api/video/worker/tick', '/api/auth/login',
                     '/legacy-workbench/admin', '/_next/static/old-client.js', '/media/private.png',
                     '/api/saas/creations/foreign/assets/private?token=fixture'):
            for method in ('GET', 'POST', 'HEAD', 'OPTIONS'):
                status, _, headers = request(443, path, method,
                    {'Cookie': 'nv_user=fixture; wb_session=fixture', 'RSC': '1', 'Range': 'bytes=0-99'})
                assert status == 503 and headers.get('Cache-Control') == 'no-store', (path, method, status)
                assert headers.get('Retry-After') == '60' and 'X-Fixture-Upstream' not in headers
                cases.append({'path': path, 'method': method, 'status': status})
        assert request(80, '/admin/')[0] == 503
        assert request(17848, '/')[0] == 200
        assert request(13100, '/internal-worker')[0] == 401
        internal = request(13100, '/internal-worker', headers={'x-fixture-worker': 'isolated-fixture'})
        assert internal[0] == 200 and json.loads(internal[1])['accepts'] == 0
        # Restore only this disposable synthetic fixture. This is NOT evidence
        # that a historical production program is compatible with new grants.
        (root / 'site.conf').write_bytes(baseline.encode())
        run(['docker', 'exec', nginx, 'nginx', '-t', '-c', '/fixture/nginx.conf'])
        run(['docker', 'exec', nginx, 'nginx', '-s', 'reload', '-c', '/fixture/nginx.conf'])
        wait(200)
        assert (root / 'site.conf').read_bytes() == baseline.encode()
        result = {'result': 'PASS', 'evidenceMode': 'fixture', 'actualLinuxNginx': True,
                  'publicCases': cases, 'httpEntrance503': True, 'errorPageCannotProxy': True,
                  'exactProductionHttpProverPassed':True,
                  'maintenanceHttpCaseCount':len(http_proof['rows']),
                  'maintenanceTlsCertificateAndHostnameVerified':True,
                  'internalWorker': 'authenticated-synthetic-route-only', 'upstreamPaidAccepts': 0,
                  'unrelatedServerUnchanged': True, 'syntheticRestoreExact': True,
                  'compatibleBusinessRollback': False, 'productionAcceptance': False,
                  'realWorkerDrainProven': False, 'supplierCalls': 0, 'productionConnections': 0,
                  'reportSha256': compat.file_sha(root / 'recovery/report.json')}
        (root / 'result.json').write_text(json.dumps(result, indent=2))
        print('SAAS_RECOVERY_NGINX=PASS CASES=' + str(len(cases)) + ' SUPPLIER_CALLS=0 PRODUCTION_CONNECTIONS=0')
    finally:
        for name in reversed(created):
            row = json.loads(run(['docker', 'inspect', name]))[0]
            if row['Config']['Labels'].get('io.naumi.saas-recovery-fixture') == tag:
                (root / (name + '-state.json')).write_text(json.dumps(row['State'], indent=2))
                logs = subprocess.run(['docker', 'logs', name], capture_output=True, text=True)
                (root / (name + '.log')).write_text(logs.stdout + logs.stderr)
                run(['docker', 'rm', '-f', name])
        try:
            run(['docker', 'network', 'rm', network])
        except RuntimeError:
            pass


if __name__ == '__main__':
    main()
