#!/usr/bin/env python3
"""Fixed Next + real Nginx + synthetic PG rollback-seal fixture, no suppliers."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
from unittest.mock import patch

import release47_controls as controls
from release47_host import HostTransaction, Hold, public_identity, sha
from release_maintenance_session import LiveAdapter, encoded
import release_rollback_ingress as ingress
import release_runtime_recovery as recovery
from verify_release_runtime_recovery_linux import wait


def run(argv, *, stdin=None):
    result=subprocess.run(argv,input=stdin,capture_output=True,timeout=120)
    if result.returncode:raise RuntimeError(result.stderr.decode()[-1600:])
    return result.stdout


def main():
    parser=argparse.ArgumentParser()
    for key in ('image','postgres-image','nginx-image','python-image','commit','version','output'):parser.add_argument('--'+key,required=True)
    a=parser.parse_args()
    assert all(re.fullmatch('sha256:[a-f0-9]{64}',v) for v in (a.image,a.postgres_image,a.nginx_image,a.python_image))
    root=Path(a.output).resolve();root.mkdir(mode=0o700,parents=True,exist_ok=False)
    token=uuid.uuid4().hex[:10]; prefix='video-ingress-'+token
    app=prefix+'-app'; pg=prefix+'-pg'; nginx=prefix+'-nginx'; helper=prefix+'-helper'; network=prefix+'-net'
    label='io.naumi.ingress-fixture='+token; created=[];network_created=False;slow=None
    state_dir=root/'state';state_dir.mkdir(mode=0o700);os.chown(state_dir,1001,1001)
    (root/'run').mkdir();config=root/'nginx.conf'
    spec={'releaseId':'canvas-video-fusion-ingress-'+token,'commit':a.commit,'buildVersion':a.version,
          'releaseSecret':'fixture-only-release-control-'+token}
    recovery.install_launcher(state_dir,release_id=spec['releaseId'],commit=a.commit,version=a.version,instance=app)
    def sql(value):return run(['docker','exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','fixture','-d','fixture'],stdin=value.encode())
    def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
    def status():return json.loads(run(['docker','exec','-e','NODE_OPTIONS=',app,'node','--input-type=module','-e',controls.APP_REMOTE,'null']))
    def curl(path):return run(['docker','exec',nginx,'curl','--noproxy','*','--insecure','--silent','--show-error','--max-time','5',
                              '--resolve','naumi.top:443:127.0.0.1','https://naumi.top'+path])
    class Tx:
        stack=True
        save=HostTransaction.save
        def __init__(self):self.folder=root
        def pin(self,identity):
            row=inspect(identity['id']);assert public_identity(row)==identity;return row
        def run(self,args,*,stdin=None,timeout=120):
            if args[:1]==['nginx']:return run(['docker','exec',nginx,'nginx','-c',str(config),*args[1:]])
            if args==['systemctl','reload','nginx']:return run(['docker','exec',nginx,'nginx','-c',str(config),'-s','reload'])
            if args[:2]==['python3','-c']:return run(['docker','exec',helper,*args])
            if args[:1]==['curl']:return run(['docker','exec',nginx,*args])
            result=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout)
            if result.returncode:raise RuntimeError(result.stderr.decode()[-1400:])
            return result.stdout
    tx=Tx()
    try:
        run(['docker','network','create','--internal',network]);network_created=True
        created.append(pg);run(['docker','run','-d','--name',pg,'--label',label,'--network',network,
             '--memory','192m','--memory-swap','192m','-e','POSTGRES_USER=fixture','-e','POSTGRES_DB=fixture',
             '-e','POSTGRES_PASSWORD=synthetic-only',a.postgres_image,'postgres','-c','shared_buffers=24MB'])
        wait(lambda:subprocess.run(['docker','exec',pg,'pg_isready','-U','fixture'],capture_output=True).returncode==0,'PG')
        env={'DATABASE_URL':'postgresql://fixture:synthetic-only@'+pg+':5432/fixture?sslmode=disable',
             'SETTINGS_SECRET':'fixture-only-settings-'+token,'VIDEO_WORKER_SECRET':'fixture-only-worker-'+token,
             'RELEASE_CONTROL_SECRET':spec['releaseSecret'],'SOURCE_COMMIT':a.commit,'BUILD_VERSION':a.version,
             'NAUMI_INSTANCE_ID':app,'NAUMI_RELEASE_RUNTIME':'1','NAUMI_RELEASE_ADMISSION_START':'draining','NAUMI_RELEASE_PEERS':'{}',
             'NODE_OPTIONS':'--max-old-space-size=512 --require=/app/scripts/release-http-observer.cjs',
             'NAUMI_VIDEO_WORKER':'0','HOSTNAME':'0.0.0.0','PORT':'3000','NAUMI_MULTI_USER':'1',
             'AGENT_API_KEY':'','OPENAI_API_KEY':'','NEW_API_IMAGE_API_KEY':'','VIDEO_API_KEY':'','NEXT_TELEMETRY_DISABLED':'1'}
        command=['docker','run','-d','--name',app,'--label',label,'--network',network,'--memory','896m','--memory-swap','896m',
                 '--cpus','1.5','--pids-limit','192','--mount','type=bind,src='+str(state_dir)+',dst=/release-state',
                 '--entrypoint','/release-state/launch.sh']
        for k,v in env.items():command+=['-e',k+'='+v]
        created.append(app);run(command+[a.image,'node','server.js']);first=wait(status,'NEXT_STATUS')
        # Execute the source's exact tick schema; no caller or supplier tick runs.
        source=(Path(__file__).parents[2]/'src/lib/release-runtime/worker-tick-receipts.ts').read_text()
        ddl=re.search(r'client.query\(`(CREATE TABLE IF NOT EXISTS app_worker_tick_receipts .*?)`\)',source,re.S).group(1)
        sql(ddl+'; CREATE TABLE app_fixture_business(id text primary key,quote jsonb); INSERT INTO app_fixture_business VALUES(\'old\',\'{"frozen":6}\');')
        run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=naumi.top','-keyout',str(root/'key.pem'),'-out',str(root/'cert.pem'),'-days','1'])
        base='pid /run/nginx.pid; worker_processes 1; error_log /dev/stderr notice; events { worker_connections 128; } http { access_log off; server { listen 443 ssl; server_name naumi.top; ssl_certificate '+str(root/'cert.pem')+'; ssl_certificate_key '+str(root/'key.pem')+'; '
        suffix='} }\n'
        maintenance=(base+'location / { return 503; }'+suffix).encode()
        candidate=(base+'location = /slow { proxy_pass http://127.0.0.1:9300; } location / { proxy_pass http://127.0.0.1:3000; }'+suffix).encode()
        original=(base+'location / { return 200 "old-fixture"; }'+suffix).encode()
        config.write_bytes(maintenance)
        created.append(nginx);run(['docker','run','-d','--name',nginx,'--label',label,'--network','container:'+app,
             '--memory','96m','--memory-swap','96m','--mount','type=bind,src='+str(root)+',dst='+str(root),
             '--mount','type=bind,src='+str(root/'run')+',dst=/run',a.nginx_image,'nginx','-c',str(config),'-g','daemon off;'])
        server='''import http.server,pathlib,time
root=pathlib.Path('''+repr(str(root))+''')
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  (root/'slow-started').touch()
  while not (root/'release-slow').exists():time.sleep(.05)
  self.send_response(200);self.end_headers();self.wfile.write(b'finished-original-request')
 def log_message(self,*args):pass
http.server.HTTPServer(('127.0.0.1',9300),Handler).serve_forever()
'''
        (root/'slow.py').write_text(server)
        created.append(helper);run(['docker','run','-d','--name',helper,'--label',label,'--network','container:'+app,
             '--pid','container:'+nginx,'--memory','96m','--memory-swap','96m',
             '--mount','type=bind,src='+str(root)+',dst='+str(root),'--mount','type=bind,src='+str(root/'run')+',dst=/run',
             a.python_image,'python3',str(root/'slow.py')])
        wait(lambda:ingress.maintenance_probes(tx),'NGINX_TLS')
        def dump(raw):config.write_bytes(raw);return tx.run(['nginx','-T'])
        maint_dump=dump(maintenance);candidate_dump=dump(candidate);original_dump=dump(original);config.write_bytes(maintenance)
        def artifact(name,value):
            raw=value if isinstance(value,bytes) else encoded(value);p=root/name;p.write_bytes(raw);return {'path':name,'sha256':sha(raw)}
        def transition(name,before,after,before_dump,after_dump):
            report={'configClosureValidated':True,'baselineFileCasVerified':True,'beforeDumpSha256':sha(before_dump),
                    'afterDumpSha256':sha(after_dump),'patches':[{'path':str(config),'beforeSha256':sha(before),'afterSha256':sha(after)}]}
            return {'report':artifact(name+'-report.json',report),'before':{str(config):artifact(name+'-before.conf',before)},
                    'after':{str(config):artifact(name+'-after.conf',after)}}
        plan={**spec,'authorization':{'mode':'canvas-video-fusion-103'},'database':public_identity(inspect(pg)),
              'webs':[{'variant':'main'}],'worker':{'name':'fixture-caller-not-running'},
              'gateways':{'open':transition('open',maintenance,candidate,maint_dump,candidate_dump),
                          'rollback-maintenance':transition('fallback',maintenance,original,maint_dump,original_dump)}}
        state={'webs':{'main':{'running':public_identity(inspect(app)),'verified':{'app':first}}},
               'worker':{'running':{'fixtureOnly':'no-live-caller'}}}
        adapter=LiveAdapter(tx,plan);state['rollbackBoundary']=adapter.rollback_boundary(state,str(uuid.uuid4()))
        controls.control_app(tx,state['webs']['main']['running'],'resume',str(uuid.uuid4()))
        with patch.object(controls,'NGINX_ROOT',root):
            adapter.gateway('open',str(uuid.uuid4()));assert json.loads(curl('/api/version'))['commit']==a.commit
            slow=subprocess.Popen(['docker','exec',nginx,'curl','--noproxy','*','--insecure','--silent','--max-time','25',
                 '--resolve','naumi.top:443:127.0.0.1','https://naumi.top/slow'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            wait(lambda:(root/'slow-started').exists(),'LONG_REQUEST_ACCEPTED')
            state['rollbackIngressIntent']=adapter.prepare_rollback_ingress(state);seal_op=str(uuid.uuid4())
            actual_wait=ingress.wait_drained
            with patch.object(ingress,'wait_drained',lambda t,b:actual_wait(t,b,timeout=.7)):
                try:adapter.seal_rollback_ingress(state,seal_op,False)
                except Hold as error:assert str(error)=='OLD_NGINX_WORKERS_NOT_DRAINED'
                else:raise AssertionError('LIVE_OLD_CONNECTION_FALSE_DRAIN')
            (root/'release-slow').touch();body,errors=slow.communicate(timeout=20)
            assert slow.returncode==0 and body==b'finished-original-request',errors
            state['rollbackIngress']=adapter.seal_rollback_ingress(state,seal_op,True)
            adapter.assert_rollback_ingress(state)
            controls.control_app(tx,state['webs']['main']['running'],'drain',str(uuid.uuid4()))
            state['rollbackBusinessProof']=adapter.rollback_business_proof(state,str(uuid.uuid4()))
            restore_op=str(uuid.uuid4());adapter.gateway('rollback-maintenance',restore_op)
            # Model a process exit after applied gateway/reload but before its
            # canonical ACK: recover only the original UUID and saved intent.
            state['rollbackGateway']=adapter.recover_rollback_gateway(state,restore_op)
            assert state['rollbackGateway'] and curl('/api/version')==b'old-fixture'
            adapter.rollback_business_proof(state,str(uuid.uuid4()))
        sql("INSERT INTO app_fixture_business VALUES('new-done','{\"frozen\":7}');")
        try:adapter.rollback_business_proof(state,str(uuid.uuid4()))
        except Hold as error:assert str(error)=='ROLLBACK_BUSINESS_OR_AGENT_STATE_CHANGED'
        else:raise AssertionError('NEW_BUSINESS_FALSE_UNCHANGED')
        assert json.loads(sql("SELECT quote FROM app_fixture_business WHERE id='old';"))=={'frozen':6}
        result={'status':'PASS','nextImage':a.image,'nextBoot':first['identity']['bootId'],'nginxImage':a.nginx_image,
                'oldConnectionBlockedSeal':True,'sameIntentSealReconciled':True,'oldResponseCompleted':True,
                'maintenanceProbes':4,'businessProofBeforeFallback':True,'appliedFallbackLostAckRecovered':True,
                'freshProofBeforeCaller':True,'newBusinessBlocksProof':True,'oldFrozenRowPreserved':True,
                'fixtureOnly':True,'productionConnections':0,'supplierCalls':0,'taskReplays':0,
                'liveCallerTested':False,'production51RoutePackageTested':False}
        (root/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
    finally:
        (root/'release-slow').touch()
        if slow and slow.poll() is None:slow.communicate(timeout=30)
        for name in reversed(created):
            row=inspect(name);assert row['Config']['Labels'].get('io.naumi.ingress-fixture')==token
            run(['docker','rm','-fv',row['Id']])
        if network_created:run(['docker','network','rm',network])


if __name__=='__main__':main()
