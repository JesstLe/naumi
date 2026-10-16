"""Actual local bounded nginx maintenance/recovery; backends explicitly synthetic."""
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
from release47_maintenance import maintenance_gateway
from test_release_client_compat import fixture_files, OLD, ALIAS_URL
from test_release_client_compat_nginx import BACKEND, certificate


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode: raise RuntimeError('FIXTURE_COMMAND_FAILED:' + result.stderr[-1000:])
    return result.stdout.strip()


def main():
    root = pathlib.Path(sys.argv[1]).resolve(); root.mkdir(exist_ok=False, parents=True)
    tag = uuid.uuid4().hex[:10]; nginx='maintenance-nginx-'+tag; backend='maintenance-backend-'+tag
    network='maintenance-net-'+tag; created=[]
    try:
        files = fixture_files()
        site=files['/etc/nginx/sites-enabled/reference-workbench']
        (root/'site.conf').write_bytes(site.encode())
        (root/'other.conf').write_bytes(files['/etc/nginx/sites-enabled/other'].encode())
        (root/'nginx.conf').write_bytes(b'worker_processes 1;pid /tmp/maintenance-nginx.pid;error_log stderr;events {worker_connections 64;}http {access_log off;include /etc/nginx/mime.types;include /fixture/other.conf;include /fixture/site.conf;}\n')
        (root/'backend.cjs').write_text(BACKEND,encoding='utf-8');certificate(root)
        (root/'patched.js').write_bytes(b'// original immutable fixture\n')
        (root/'static').mkdir();(root/'static/fixture.js').write_bytes(b'// fixture static\n')
        manifest=compat.collect_assets([('fixture',root/'static')],[(ALIAS_URL,root/'patched.js')])
        compat.materialize_assets(manifest,root/'union')
        run(['docker','network','create',network])
        run(['docker','run','-d','--name',nginx,'--label','io.naumi.maintenance-fixture='+tag,'--network',network,
             '--memory','128m','--memory-swap','128m','--cpus','.5','--pids-limit','48','-p','127.0.0.1::443',
             '-p','127.0.0.1::17848','-v',str(root)+':/fixture:ro','nginx:1.27-alpine','nginx','-c','/fixture/nginx.conf','-g','daemon off;']);created.append(nginx)
        run(['docker','run','-d','--name',backend,'--label','io.naumi.maintenance-fixture='+tag,'--network','container:'+nginx,
             '--memory','96m','--memory-swap','96m','--cpus','.5','--pids-limit','48','-v',str(root/'backend.cjs')+':/backend.cjs:ro',
             'node:24-bookworm-slim','node','/backend.cjs']);created.append(backend)
        origin='https://127.0.0.1:'+run(['docker','port',nginx,'443/tcp']).split(':')[-1]
        context=ssl._create_unverified_context()
        def get(path,headers=None):
            req=urllib.request.Request(origin+path,headers={'Host':'47.105.59.142',**(headers or {})})
            try:
                with urllib.request.urlopen(req,context=context,timeout=5) as r:return r.status,r.read()
            except urllib.error.HTTPError as r:return r.code,r.read()
        def wait(status):
            for _ in range(80):
                try:
                    if get('/api/version')[0]==status:return
                except Exception:pass
                time.sleep(.1)
            raise AssertionError('MAINTENANCE_HTTP_TRANSITION_NOT_OBSERVED')
        wait(200)
        before=run(['docker','exec',nginx,'nginx','-T','-c','/fixture/nginx.conf'])+'\n'
        # subprocess newline stripping is undone exactly once, validated against disk bytes.
        patches,unified,_=compat.render_gateway(before,'/fixture/site.conf','http://127.0.0.1:13100',OLD,'/fixture/union',manifest)
        report=maintenance_gateway(unified,'http://127.0.0.1:13100',root/'maintenance',baseline_dump=before,
                    source_files={'/fixture/site.conf':(root/'site.conf').read_bytes()})
        baseline=(root/'site.conf').read_bytes()
        after=(root/'maintenance/after/fixture/site.conf').read_bytes();(root/'site.conf').write_bytes(after)
        run(['docker','exec',nginx,'nginx','-t','-c','/fixture/nginx.conf']);run(['docker','exec',nginx,'nginx','-s','reload','-c','/fixture/nginx.conf'])
        wait(503);time.sleep(.3)
        paths=['/dashboard','/canvas','/api/imagegen','/api/video/worker/tick','/api/reference-workbench/test','/batchshot/native/workbench']
        for path in paths:assert get(path)[0]==503,path
        assert get('/api/auth/login',{'Cookie':'nv_user=synthetic'})[0]==503
        assert get('/api/auth/login',{'Cookie':'wb_session=synthetic'})[0]==200
        assert get('/legacy-workbench/retained')[0]==200
        assert get(ALIAS_URL)[0]==200 and get('/_next/static/fixture.js')[0]==200
        assert get('/api/status',{'Cookie':'wb_session=synthetic'})[0]==200
        (root/'site.conf').write_bytes(baseline)
        run(['docker','exec',nginx,'nginx','-t','-c','/fixture/nginx.conf']);run(['docker','exec',nginx,'nginx','-s','reload','-c','/fixture/nginx.conf'])
        wait(200);assert (root/'site.conf').read_bytes()==baseline
        result={'maintenanceNaumi503':True,'legacy17847Preserved':True,'staticOriginalBytesPreserved':True,
                'rollbackOriginalBytes':True,'actualLinuxNginx':True,'supplierCalls':0,'productionConnections':0,
                'realTaskDrainProven':False,'reportSha256':compat.file_sha(root/'maintenance/report.json')}
        (root/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print('MAINTENANCE_NGINX=PASS NAUMI=503 LEGACY17847=200 STATIC=200 ROLLBACK=EXACT SUPPLIER_CALLS=0')
    finally:
        for name in reversed(created):
            row=json.loads(run(['docker','inspect',name]))[0]
            if row['Config']['Labels'].get('io.naumi.maintenance-fixture')==tag:run(['docker','rm','-f',name])
        try:run(['docker','network','rm',network])
        except RuntimeError:pass


if __name__=='__main__':main()
