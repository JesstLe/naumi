"""Local Docker adapter for the EXISTING static/CAS/Worker release owners.

Not a deployer: only fixture containers on the caller's owned network. The
candidate/rollback images are immutable, and all DB/media remain shared in place.
"""
import copy
import hashlib
import io
import json
import pathlib
import tarfile
import uuid
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch

import release47_controls as controls
import release47_video_profile_guard as video_guard
import release_client_compat as static
import worker_handoff
from release47_host import environment, public_identity, Hold


class VideoReleaseGateway:
    def __init__(self, *, api, execute, tx, args, prefix, network, slots, web, worker,
                 values, mounts, wait, check):
        self.api,self.execute,self.tx,self.args=api,execute,tx,args
        self.prefix,self.network,self.slots=prefix,network,slots
        self.web,self.worker,self.wait,self.check=web,worker,wait,check
        self.folder=args.root/'gateway';self.folder.mkdir();self.phases=[];self.http=[];self.browser_seed=None;self.browser_observations=[]
        self.old_web_name=prefix+'-old-web';self.old_worker_name=prefix+'-old-worker'
        self.name=prefix+'-nginx';self.origin='http://'+self.name
        old_image=api('GET','/images/'+args.prior_image+'/json')
        self.old_commit=environment(old_image)['SOURCE_COMMIT']
        old_values=copy.deepcopy(values)
        old_values.update(SOURCE_COMMIT=self.old_commit,BUILD_VERSION=environment(old_image)['BUILD_VERSION'],
            NAUMI_INSTANCE_ID=self.old_web_name,MEDIA_WORKER_ORIGIN='http://'+self.old_worker_name+':3002')
        self.old_web=api('POST','/containers/create?name='+self.old_web_name,{'Image':args.prior_image,
            'Cmd':['node','server.js'],'Env':[k+'='+v for k,v in old_values.items()],
            'HostConfig':{'Mounts':mounts,'NetworkMode':network},
            'NetworkingConfig':{'EndpointsConfig':{network:{}}}})['Id'];slots.append(self.old_web)
        api('POST','/containers/'+self.old_web+'/start')
        wait(lambda:self.fetch(self.old_web,'http://127.0.0.1:3000/api/version'),lambda r:r['status']==200)
        self.old_worker=controls.clone_worker(tx,public_identity(tx.inspect(self.old_web)),name=self.old_worker_name,
            memory_mib=1024,cpu=1,state_dir=str(args.root/'old-worker-state'),reviewed_combined_media=True)
        controls.start_worker(tx,self.old_worker,4096,reviewed_combined_media=True)
        wait(lambda:self.state(),lambda s:s.get('paused') is True and s.get('executionMode')=='direct')
        self.prepare_assets()
        self.config=self.folder/'nginx.conf';self.config.write_bytes(self.render('old'))
        gateway=api('POST','/containers/create?name='+self.name,{'Image':args.nginx_image,
            'Entrypoint':['nginx'],'Cmd':['-c','/fixture/nginx.conf','-g','daemon off;'],
            'HostConfig':{'NetworkMode':network,'ReadonlyRootfs':True,'Memory':128*1024**2,
                'MemorySwap':128*1024**2,'NanoCpus':500_000_000,'PidsLimit':64,
                **({'PortBindings':{'80/tcp':[{'HostIp':'127.0.0.1','HostPort':str(args.browser_port)}]}} if getattr(args,'browser_port',None) else {}),
                'Tmpfs':{'/tmp':'rw,nosuid,size=64m'},'Mounts':[{'Type':'bind','Source':str(self.folder),'Target':'/fixture','ReadOnly':True}]},
            'NetworkingConfig':{'EndpointsConfig':{network:{}}}})['Id'];slots.append(gateway);self.gateway=gateway
        api('POST','/containers/'+gateway+'/start')
        wait(lambda:self.fetch(web,self.origin+'/api/version'),lambda r:r['status']==200 and json.loads(r['body'])['commit']==self.old_commit)
        check('actual-nginx-starts-on-distinct-prior-build',self.old_commit!=values['SOURCE_COMMIT'])
        self.assets_before=self.read_assets('old')
        self.lifecycle=None

    def browser_phase(self, phase, seed=None, observe=None):
        if not getattr(self.args,'browser_port',None):return
        if seed is not None:
            assert phase=='old' and self.browser_seed is None;self.browser_seed=seed;self.browser_observe=observe
        assert self.browser_seed is not None and phase in ['old','new','rollback']
        folder=self.args.evidence/'browser';folder.mkdir(exist_ok=True);token=uuid.uuid4().hex;before=self.browser_observe()
        command={'phase':phase,'token':token,**self.browser_seed,'origin':'http://127.0.0.1:'+str(self.args.browser_port),
                 'oldCommit':self.old_commit,'newCommit':environment(self.tx.inspect(self.web))['SOURCE_COMMIT']}
        temp=folder/('request-'+token+'.tmp');temp.write_text(json.dumps(command));temp.replace(folder/'request.json')
        deadline=time.time()+240;receipt=folder/('reply-'+token+'.json')
        while time.time()<deadline:
            if receipt.exists():
                value=json.loads(receipt.read_text());assert value['token']==token and value['phase']==phase and value['ok'] is True,value
                after=self.browser_observe();assert after==before,{'phase':phase,'before':before,'after':after};self.tx.save('browser-zero-generation-'+phase+'.json',{'before':before,'after':after});assert type(value.get('noReload',True)) is bool
                if not getattr(self.args,'browser_observe_upgrades',False):assert value.get('noReload',True) is True,'STRICT_BROWSER_DOCUMENT_UPGRADE'
                self.browser_observations.append(value);self.tx.save('browser-observations.json',self.browser_observations);self.check(('actual-browser-observed-' if getattr(self.args,'browser_observe_upgrades',False) else 'actual-browser-survives-')+phase,True);return
            time.sleep(.1)
        raise RuntimeError('ACTUAL_BROWSER_PHASE_TIMEOUT '+phase)

    def start_lifecycle(self, query):
        from video_release_lifecycle_fixture import VideoReleaseLifecycle
        self.lifecycle=VideoReleaseLifecycle(self,query)

    def fetch(self, container, url):
        script="const x=process.argv[1];fetch(x,{signal:AbortSignal.timeout(5000)}).then(async r=>{const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,body:b.toString(),sha256:require('node:crypto').createHash('sha256').update(b).digest('hex'),slot:r.headers.get('x-release-slot')}))})"
        return json.loads(self.execute(container,['node','-e',script,url]))

    def render(self, phase):
        target=self.old_web_name if phase=='old' else self.tx.inspect(self.web)['Name'].lstrip('/')
        # One-file closure: MIME types are inline, so no included mutable file
        # disappears from the original CAS owner's complete-closure inventory.
        return ("worker_processes 1;pid /tmp/nginx.pid;error_log stderr;events{worker_connections 256;}"
            "http{access_log off;types{application/javascript js;text/css css;}default_type application/octet-stream;"
            "client_body_temp_path /tmp/body;proxy_temp_path /tmp/proxy;fastcgi_temp_path /tmp/fcgi;uwsgi_temp_path /tmp/uwsgi;scgi_temp_path /tmp/scgi;"
            "server{listen 80;client_max_body_size 20m;location ^~ /_next/static/{alias /fixture/union/_next/static/;add_header Cache-Control 'public,max-age=31536000,immutable' always;}"
            "location /{proxy_pass http://"+target+":3000;proxy_http_version 1.1;proxy_set_header Host "+("$http_host" if getattr(self.args,"browser_port",None) else "$host")+";proxy_set_header X-Forwarded-Proto $scheme;proxy_set_header Connection '';proxy_buffering off;proxy_read_timeout 90s;add_header X-Release-Slot "+phase+" always;}}}").encode()

    def prepare_assets(self):
        sources=[]
        for phase,container in [('old',self.old_web),('new',self.web)]:
            root=self.folder/('static-'+phase);root.mkdir()
            raw=self.api('GET','/containers/'+container+'/archive?path=/app/.next/static',raw=True)
            with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
                for member in archive.getmembers():
                    assert (root/member.name).resolve().is_relative_to(root.resolve()) and not member.issym() and not member.islnk()
                archive.extractall(root,filter='data')
            sources.append((phase,root/'static'))
        manifest=static.collect_assets(sources);static.materialize_assets(manifest,self.folder/'union')
        (self.folder/'union').chmod(0o755)
        self.manifest=manifest
        self.tx.save('actual-static-union.json',manifest)
        self.check('actual-old-new-static-union',static.verify_assets(manifest,self.folder/'union')==len(manifest['assets']))

    def read_assets(self, phase):
        # Check the entire captured old set through the real gateway, not only
        # filenames found in one page. This is HTTP/static proof, not hydration.
        assets=[e for e in self.manifest['assets'] if 'old' in e['sources']]
        script="const x=JSON.parse(process.argv[1]);(async()=>{const rows=[];for(const a of x.assets){const r=await fetch(x.origin+a.url),b=Buffer.from(await r.arrayBuffer());rows.push({url:a.url,status:r.status,sha256:require('node:crypto').createHash('sha256').update(b).digest('hex')});}console.log(JSON.stringify(rows));})()"
        got=json.loads(self.execute(self.web,['node','-e',script,json.dumps({'origin':self.origin,'assets':[{'url':e['url']} for e in assets]})]))
        rows=[]
        for entry,value in zip(assets,got):
            assert value['status']==200 and value['sha256']==entry['sha256'],entry['url']
            rows.append({'url':entry['url'],'sha256':value['sha256']})
        assert len(rows)==len(assets)==len(got)
        self.tx.save('old-assets-'+phase+'-'+str(len(self.phases))+'.json',rows)
        self.check('all-old-static-hashes-'+phase,bool(rows))
        return rows

    def state(self):
        script="fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}}).then(r=>r.json()).then(v=>console.log(JSON.stringify(v)))"
        return json.loads(self.execute(self.old_worker['id'],['node','-e',script]))

    def control_old(self, action):
        row=self.tx.inspect(self.old_worker['id']);env=environment(row)
        folder=self.args.evidence/'old-worker-controls';folder.mkdir(exist_ok=True)
        args=SimpleNamespace(container=row['Id'],expected_id=row['Id'],expected_image=row['Image'],expected_commit=self.old_commit,
            expected_origin=env['NAUMI_APP_ORIGIN'],action=action,operation_id=str(uuid.uuid4()),tick_id=None,require_media_worker=True)
        return worker_handoff.execute(args,folder,lambda argv:self.tx.run(argv).decode())

    def open_old(self):
        controls.control_app(self.tx,public_identity(self.tx.inspect(self.old_web)),'resume',str(uuid.uuid4()))

    def expected_dump(self, phase):
        folder=self.folder/('validate-'+uuid.uuid4().hex[:8]);folder.mkdir();(folder/'nginx.conf').write_bytes(self.render(phase))
        spec={'Image':self.args.nginx_image,'Entrypoint':['sh'],'Cmd':['-c',"nginx -T -c /fixture/nginx.conf 2>/tmp/check-error || { cat /tmp/check-error >&2; exit 1; }"],
            'HostConfig':{'NetworkMode':self.network,'ReadonlyRootfs':True,'Tmpfs':{'/tmp':'rw,nosuid,size=16m'},
                'Memory':128*1024**2,'Mounts':[{'Type':'bind','Source':str(folder),'Target':'/fixture','ReadOnly':True}]},
            'NetworkingConfig':{'EndpointsConfig':{self.network:{}}}}
        validation=self.api('POST','/containers/create',spec)['Id']
        try:
            self.api('POST','/containers/'+validation+'/start')
            result=self.api('POST','/containers/'+validation+'/wait');assert result['StatusCode']==0,result
            raw=self.api('GET','/containers/'+validation+'/logs?stdout=1',raw=True);out=b'';pos=0
            while pos<len(raw):n=int.from_bytes(raw[pos+4:pos+8],'big');out+=raw[pos+8:pos+8+n];pos+=8+n
            return out
        finally:self.api('DELETE','/containers/'+validation)

    def switch(self, phase):
        if self.lifecycle and phase=='new':self.lifecycle.ready()
        current=self.execute(self.gateway,['sh','-c',"nginx -T -c /fixture/nginx.conf 2>/tmp/check-error || { cat /tmp/check-error >&2; exit 1; }"])
        parsed=static.Dump(current.decode());assert set(parsed.files)=={'/fixture/nginx.conf'}
        before=self.config.read_bytes();after=self.render(phase);expected=self.expected_dump(phase)
        sha=lambda b:hashlib.sha256(b).hexdigest()
        report={'configClosureValidated':True,'baselineFileCasVerified':True,'beforeDumpSha256':sha(current),
            'afterDumpSha256':sha(expected),'patches':[{'path':str(self.config),'beforeSha256':sha(before),'afterSha256':sha(after)}]}
        owner=self
        class GatewayTx:
            def __init__(self,attempt):self.attempt=attempt
            def save(self,name,value):return owner.tx.save(phase+'-'+self.attempt+'-'+name,value.decode() if isinstance(value,bytes) else value)
            def run(self, argv, **options):
                if argv==['nginx','-t']:return owner.execute(owner.gateway,['nginx','-t','-c','/fixture/nginx.conf'])
                if argv==['nginx','-T']:return owner.execute(owner.gateway,['sh','-c',"nginx -T -c /fixture/nginx.conf 2>/tmp/check-error || { cat /tmp/check-error >&2; exit 1; }"])
                assert argv==['systemctl','reload','nginx'];return owner.execute(owner.gateway,['nginx','-s','reload','-c','/fixture/nginx.conf'])
        # Filesystem-root mapping only. The real original CAS/atomic write,
        # nginx syntax/dump and reload implementation is not replaced.
        def apply(attempt,description,payload):
            with patch.object(controls,'NGINX_ROOT',self.folder):
                return controls.switch_gateway_bundle(GatewayTx(attempt),description,{str(self.config):before},{str(self.config):payload},
                    expected_dump_sha=sha(current),logical_to_real={str(self.config):str(self.config.resolve())})
        stale={**report,'beforeDumpSha256':'0'*64}
        try:apply('stale-negative',stale,after)
        except Hold as error:
            assert 'FULL_GATEWAY_BASELINE_CHANGED' in str(error)
            self.tx.save('stale-CAS-refusal-'+phase+'.json',{'error':str(error),'changed':False})
        else:raise AssertionError('STALE_GATEWAY_BASELINE_WAS_ACCEPTED')
        self.check('actual-stale-CAS-refused-'+phase,self.config.read_bytes()==before)
        invalid=b'events{} http{ invalid_release_fixture_directive; }'
        bad={**report,'afterDumpSha256':'f'*64,'patches':[{'path':str(self.config),'beforeSha256':sha(before),'afterSha256':sha(invalid)}]}
        try:apply('syntax-negative',bad,invalid)
        except RuntimeError as error:
            self.tx.save('syntax-refusal-'+phase+'.json',{'error':str(error),'restoredPreimage':self.config.read_bytes()==before})
        else:raise AssertionError('BAD_NGINX_SYNTAX_WAS_ACCEPTED')
        self.check('actual-syntax-failure-restores-exact-preimage-'+phase,self.config.read_bytes()==before)
        def traffic():
            observations=[]
            for _ in range(60):
                with urllib.request.urlopen(self.origin+'/api/version',timeout=5) as response:
                    observations.append({'status':response.status,'commit':json.load(response)['commit']})
                time.sleep(.02)
            return observations
        master=self.execute(self.gateway,['sh','-c',"cat /proc/1/stat | cut -d' ' -f22"]).strip()
        with ThreadPoolExecutor(max_workers=1) as executor:
            pending=executor.submit(traffic)
            apply('switch',report,after)
            observations=pending.result()
        self.check('nginx-master-not-restarted-'+phase,self.execute(self.gateway,['sh','-c',"cat /proc/1/stat | cut -d' ' -f22"]).strip()==master)
        self.tx.save('concurrent-http-'+phase+'.json',observations)
        commits={self.old_commit,environment(self.tx.inspect(self.web))['SOURCE_COMMIT']}
        self.check('concurrent-HTTP-no-errors-'+phase,len(observations)==60 and all(r['status']==200 and r['commit'] in commits for r in observations))
        want=self.old_commit if phase=='old' else environment(self.tx.inspect(self.web))['SOURCE_COMMIT']
        observed=self.wait(lambda:self.fetch(self.web,self.origin+'/api/version'),lambda r:r['status']==200 and json.loads(r['body'])['commit']==want)
        self.phases.append({'phase':phase,'version':json.loads(observed['body']),'beforeDump':sha(current),'afterDump':sha(expected),'reload':'smooth'})
        self.check('actual-nginx-CAS-reload-'+phase,observed['slot']==phase)
        assert self.read_assets(phase)==self.assets_before
        if self.lifecycle and phase=='new':self.lifecycle.switched()
        if self.browser_seed is not None:self.browser_phase('new' if phase=='new' else 'rollback')

    def rollback(self, query):
        # Stop the drained prior slots, then run the actual pinned-image format
        # guard before restart. No metadata is fabricated for a legacy image.
        self.control_old('drain');self.wait(self.state,lambda s:s.get('phase')=='QUIESCENT')
        controls.control_app(self.tx,public_identity(self.tx.inspect(self.old_web)),'drain',str(uuid.uuid4()))
        for slot in [self.old_worker['id'],self.old_web]:self.api('POST','/containers/'+slot+'/stop?t=60')
        prior=public_identity(self.tx.inspect(self.old_web))
        formats=video_guard.read_runtime_formats(self.tx,prior)
        self.check('actual-prior-image-format-reader-verified',formats is not None and formats['compiledPlanVersions']==[1,2,3,4,5])
        snapshot=json.loads(query(video_guard.build_readonly_sql(dict.fromkeys(video_guard.SCHEMA_KEYS,True))))
        proof=video_guard.evaluate(snapshot,runtime_formats=formats)
        self.tx.save('actual-prior-durable-format-proof.json',proof);video_guard.enforce(proof)
        self.check('actual-prior-reader-matches-fresh-durable-tasks',proof['safe'])
        for slot in [self.old_web,self.old_worker['id']]:self.api('POST','/containers/'+slot+'/start')
        self.wait(self.state,lambda s:s.get('paused') is True)
        self.open_old();self.switch('old');self.control_old('resume')
        self.wait(self.state,lambda s:(s.get('lastTick') or {}).get('phase')=='complete' and s.get('activeTicks')==0)
        self.control_old('drain');self.wait(self.state,lambda s:s.get('phase')=='QUIESCENT')
        self.tx.save('NGINX_PHASES.json',self.phases)
