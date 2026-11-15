#!/usr/bin/env python3
"""Linux-only, fixture-scoped Docker adapter exercising the REAL release owner.

The fixture has the Docker socket, never the product. No site connections or
paid upstream. --tasks adds actual HTTP/Worker generation against a local peer.
Random PG schema, owned network/slots/state only.
"""
import argparse
import http.client
import json
import os
import pathlib
import socket
import time
import uuid
import threading
import hashlib
import urllib.request
import urllib.parse
import shutil
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler

import release47_controls as controls
from release47_host import environment, public_identity, Hold


class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.sock.settimeout(120);self.sock.connect('/var/run/docker.sock')


def api(method,path,body=None,raw=False):
    conn=UnixHTTP('localhost');data=json.dumps(body).encode() if body is not None else None
    conn.request(method,'/v1.47'+path,body=data,headers={'Content-Type':'application/json'})
    response=conn.getresponse();content=response.read();conn.close()
    if response.status>=400:raise RuntimeError('FIXTURE_DOCKER_HTTP_'+str(response.status)+' '+path+' '+content[:300].decode(errors='replace'))
    return content if raw else json.loads(content) if content else None


def exec_in(container,command,env=None,user=None):
    result=api('POST','/containers/'+container+'/exec',{'Cmd':command,'Env':env or ['NODE_OPTIONS='],'AttachStdout':True,'AttachStderr':True,
               **({'User':user} if user else {})})
    raw=api('POST','/exec/'+result['Id']+'/start',{'Detach':False,'Tty':False},raw=True)
    output=b'';offset=0
    while offset<len(raw):
        size=int.from_bytes(raw[offset+4:offset+8],'big');output+=raw[offset+8:offset+8+size];offset+=8+size
    status=api('GET','/exec/'+result['Id']+'/json')
    if status['ExitCode']!=0:raise RuntimeError('FIXTURE_EXEC_EXIT_'+str(status['ExitCode'])+' '+output[-1000:].decode(errors='replace'))
    return output


def main():
    p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--root',type=pathlib.Path,required=True)
    p.add_argument('--evidence',type=pathlib.Path,required=True)
    p.add_argument('--tasks',action='store_true');p.add_argument('--driver-container')
    p.add_argument('--prior-image');p.add_argument('--nginx-image')
    p.add_argument('--lifecycle',choices=['complete','rollback']);p.add_argument('--retained-image')
    p.add_argument('--browser-port',type=int);p.add_argument('--browser-observe-upgrades',action='store_true')
    args=p.parse_args()
    assert os.name=='posix' and args.root.is_relative_to('/opt/naumi-staging/releases')
    assert args.image.startswith('sha256:') and len(args.image)==71
    if args.prior_image:
        assert args.tasks and args.nginx_image and args.prior_image.startswith('sha256:') and len(args.prior_image)==71
    if args.lifecycle:
        assert args.prior_image and args.retained_image and args.retained_image.startswith('sha256:') and len(args.retained_image)==71
    if args.browser_observe_upgrades:assert args.browser_port is not None,'BROWSER_AUDIT_REQUIRES_EXPLICIT_PORT'
    if args.browser_port is not None:
        assert args.prior_image and args.lifecycle!='complete' and 1024<=args.browser_port<=65535,'BROWSER_REQUIRES_COMPATIBLE_GATEWAY_ROLLBACK_AND_LOOPBACK_PORT'
    args.evidence.mkdir(parents=True,exist_ok=True);args.root.mkdir(parents=True,exist_ok=True)
    suffix=uuid.uuid4().hex[:12];prefix='naumi-release-direct-fixture-'+suffix;schema='release_direct_'+suffix
    network=api('POST','/networks/create',{'Name':prefix,'Driver':'bridge'})['Id']
    slots=[];checks=[];events=[];peer=None;task_proof=None
    peer_state={'calls':[],'polls':[],'reads':[],'hold':True,'web':None}
    db='naumi-video-compiler-pg-20261114'
    def sql(text):return exec_in(db,['psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','video_compiler_fixture','-c',text]).decode().strip()
    def check(name,condition=True):
        assert condition,name
        checks.append(name)
        print('RELEASE_CHECK='+name+' PASS',flush=True)
    class Tx:
        folder=args.evidence
        def inspect(self,target):return api('GET','/containers/'+target+'/json')
        def pin(self,identity):
            row=self.inspect(identity['id']);assert public_identity(row)==identity;return row
        def save(self,name,value):
            (args.evidence/name).write_text(json.dumps(value,indent=2));return {}
        def run(self,argv,**kwargs):
            assert argv[0]=='docker'
            if argv[1]=='inspect':
                assert argv[2] in slots or argv[2].startswith(prefix)
                return json.dumps([self.inspect(argv[2])]).encode()
            if argv[1]=='exec':
                index=2;env=[]
                while argv[index]=='-e':env.append(argv[index+1]);index+=2
                target=argv[index];assert target in slots
                return exec_in(target,argv[index+1:],env)
            if argv[1]=='start':
                assert argv[2] in slots;api('POST','/containers/'+argv[2]+'/start');return b''
            if argv[1]=='network':
                api('POST','/networks/'+argv[3]+'/connect',{'Container':argv[4]});return b''
            if argv[1]=='run':
                # Only the existing rollback owner's passive fixed-package
                # reader. No credentials, scan factory or network are started.
                pinned=next((image for image in [args.prior_image,args.retained_image] if image and image in argv),None)
                assert pinned and '--network=none' in argv and '--read-only' in argv
                index=argv.index(pinned)
                probe=api('POST','/containers/create',{'Image':pinned,'Entrypoint':['node'],'Cmd':argv[index+1:],
                    'Env':['NODE_OPTIONS='],'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Memory':256*1024**2,
                        'PidsLimit':32,'CapDrop':['ALL'],'Tmpfs':{'/data':'rw,size=1m'}}})['Id']
                try:
                    api('POST','/containers/'+probe+'/start');result=api('POST','/containers/'+probe+'/wait');assert result['StatusCode']==0
                    raw=api('GET','/containers/'+probe+'/logs?stdout=1',raw=True);out=b'';pos=0
                    while pos<len(raw):n=int.from_bytes(raw[pos+4:pos+8],'big');out+=raw[pos+8:pos+8+n];pos+=8+n
                    return out
                finally:api('DELETE','/containers/'+probe)
            assert argv[1]=='create'
            config={'HostConfig':{},'NetworkingConfig':{'EndpointsConfig':{}}};host=config['HostConfig'];mounts=[];envfile=None
            index=2
            while index<len(argv) and argv[index] not in [args.image,args.prior_image]:
                flag=argv[index]
                if flag=='--name':name=argv[index+1];assert name.startswith(prefix);index+=2;continue
                if flag=='--network':config['NetworkingConfig']['EndpointsConfig'][argv[index+1]]={};host['NetworkMode']=argv[index+1];index+=2;continue
                if flag=='--env-file':envfile=pathlib.Path(argv[index+1]);index+=2;continue
                if flag=='--mount':
                    values=dict(item.split('=',1) for item in argv[index+1].split(','));mounts.append({'Type':values['type'],'Source':values['src'],'Target':values['dst']});index+=2;continue
                if flag=='--tmpfs':
                    dest,opts=argv[index+1].split(':',1);host.setdefault('Tmpfs',{})[dest]=opts;index+=2;continue
                if flag=='--read-only':host['ReadonlyRootfs']=True;index+=1;continue
                key,value=flag.split('=',1)
                if key=='--restart':host['RestartPolicy']={'Name':value}
                elif key in ['--memory','--memory-swap']:host['Memory' if key=='--memory' else 'MemorySwap']=int(value[:-1])*1024**2
                elif key=='--cpus':host['NanoCpus']=int(float(value)*1e9)
                elif key=='--pids-limit':host['PidsLimit']=int(value)
                elif key=='--user':config['User']=value
                elif key=='--cap-drop':host.setdefault('CapDrop',[]).append(value)
                elif key=='--cap-add':host.setdefault('CapAdd',[]).append(value)
                elif key=='--security-opt':host.setdefault('SecurityOpt',[]).append(value)
                else:raise AssertionError('UNREVIEWED_FIXTURE_FLAG '+key)
                index+=1
            config.update(Image=argv[index],Cmd=argv[index+1:],Env=envfile.read_text().splitlines());host['Mounts']=mounts
            container=api('POST','/containers/create?name='+name,config)['Id'];slots.append(container)
            events.append({'action':'actual-release-docker-create','id':container,'image':config['Image'],'name':name,
                           'environmentNames':sorted(environment({'Config':{'Env':config['Env']}}))})
            return container.encode()
    tx=Tx()
    try:
        sql('CREATE SCHEMA '+schema)
        if args.tasks:
            assert args.driver_container and args.driver_container.startswith('naumi-release-task-driver-')
            fixture_dir=args.root/'fixture';fixture_dir.mkdir();os.chmod(fixture_dir,0o755)
            shutil.copyfile(args.evidence.parent/'task-fixture.cjs',fixture_dir/'task-fixture.cjs')
            args.fixture_dir=str(fixture_dir)
            api('POST','/networks/'+network+'/connect',{'Container':args.driver_container,'EndpointConfig':{'Aliases':['release-peer']}})
            video=(args.evidence.parent/'fixture-result.mp4').read_bytes()
            class Peer(BaseHTTPRequestHandler):
                def log_message(self,*args):pass
                def send_json(self,value):
                    content=json.dumps(value).encode();self.send_response(200);self.send_header('content-type','application/json');self.send_header('content-length',str(len(content)));self.end_headers();self.wfile.write(content)
                def do_POST(self):
                    assert self.path=='/v1/videos/generations'
                    if self.headers.get('transfer-encoding','').lower()=='chunked':
                        chunks=[]
                        while True:
                            size=int(self.rfile.readline().split(b';',1)[0],16)
                            if not size:
                                while self.rfile.readline().strip():pass
                                break
                            chunks.append(self.rfile.read(size));assert self.rfile.read(2)==b'\r\n'
                        raw=b''.join(chunks)
                    else:raw=self.rfile.read(int(self.headers['content-length']))
                    body=json.loads(raw)
                    entry={'body':body,'key':self.headers.get('Idempotency-Key'),'authorization':self.headers.get('authorization')};peer_state['calls'].append(entry)
                    for url in body.get('image_urls',[])+body.get('video_urls',[]):
                        parsed=urllib.parse.urlsplit(url);assert parsed.scheme=='https' and parsed.hostname=='release-media.fixture.test'
                        with urllib.request.urlopen('http://'+peer_state['web']+':3000'+parsed.path) as response:data=response.read()
                        peer_state['reads'].append({'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
                    if body['prompt']=='RELEASE_UNKNOWN':
                        self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
                    self.send_json({'data':[{'task_id':'release-'+str(len(peer_state['calls'])),'status':'queued'}]})
                def do_GET(self):
                    if self.path.startswith('/v1/tasks/'):
                        peer_state['polls'].append(self.path)
                        self.send_json({'data':{'status':'processing','progress':20} if peer_state['hold'] else {'status':'completed','result':{'videos':[{'url':'http://release-peer:18080/result.mp4'}]}}});return
                    if self.path=='/result.mp4':
                        self.send_response(200);self.send_header('content-type','video/mp4');self.send_header('content-length',str(len(video)));self.end_headers();self.wfile.write(video);return
                    self.send_json({'data':[]})
            peer=ThreadingHTTPServer(('0.0.0.0',18080),Peer);threading.Thread(target=peer.serve_forever,daemon=True).start()
        image=api('GET','/images/'+args.image+'/json');source=environment(image)['SOURCE_COMMIT']
        for combined in [False,True]:
            name=prefix+('-combined' if combined else '-plain');web_name=name+'-web'
            folder=args.root/('combined' if combined else 'plain');folder.mkdir();os.chmod(folder,0o700)
            for child in ['media','scratch']:(folder/child).mkdir();os.chown(folder/child,1001,1001)
            values={'DATABASE_URL':'postgresql://postgres:video_compiler_local_fixture@host.docker.internal:15579/video_compiler_fixture',
                'PGOPTIONS':'-c search_path='+schema,'SETTINGS_SECRET':'release-direct-fixture-'+40*'s',
                'NAUMI_MULTI_USER':'1','STORAGE_DRIVER':'local','MEDIA_DIR':'/data/media','NAUMI_VIDEO_WORKER':'0',
                'SOURCE_COMMIT':source,'BUILD_VERSION':environment(image)['BUILD_VERSION'],'NAUMI_INSTANCE_ID':web_name,
                'NAUMI_RELEASE_RUNTIME':'1','NAUMI_RELEASE_ADMISSION_START':'draining','NAUMI_APPLICATION_TASK_EXECUTION':'worker',
                'RELEASE_CONTROL_SECRET':'fixture-web-only-'+40*'r','VIDEO_WORKER_SECRET':'fixture-worker-'+40*'w',
                'INTERNAL_APP_ORIGIN':'http://127.0.0.1:3000','OPENAI_API_KEY':'','VIDEO_API_KEY':'','VIDEO_PROVIDERS_JSON':'[]',
                'NODE_OPTIONS':'--max-old-space-size=512 --require=/app/scripts/release-http-observer.cjs'}
            mounts=[{'Type':'bind','Source':str(folder/'media'),'Target':'/data'}]
            if combined:
                values.update(NAUMI_MEDIA_WORKER='1',MEDIA_WORKER_ORIGIN='http://'+name+':3002',
                    MEDIA_WORKER_SECRET='fixture-media-'+40*'m',MEDIA_JOB_DIR='/scratch')
                mounts.append({'Type':'bind','Source':str(folder/'scratch'),'Target':'/scratch'})
            if args.tasks and combined:
                values.update(NAUMI_VERIFY_ISOLATED_DB='1',MODEL_CONFIG_TRUSTED_ORIGINS='http://release-peer:18080',
                    NAUMI_ROUTER_MANAGEMENT_URL='http://release-peer:18080',NAUMI_ROUTER_MANAGEMENT_TOKEN='fixture-router-not-called-'+32*'t',
                    MODEL_CONFIG_ENVELOPE_SECRET='fixture-router-envelope-'+40*'e',VIDEO_REFERENCE_PUBLIC_BASE_URL='https://release-media.fixture.test')
                mounts.append({'Type':'bind','Source':args.fixture_dir,'Target':'/fixture','ReadOnly':True})
                peer_state['web']=web_name
            web=api('POST','/containers/create?name='+web_name,{'Image':args.image,'Cmd':['node','server.js'],
                'Env':[k+'='+v for k,v in values.items()], 'HostConfig':{'Mounts':mounts,'NetworkMode':prefix},
                'NetworkingConfig':{'EndpointsConfig':{prefix:{}}}})['Id'];slots.append(web);api('POST','/containers/'+web+'/start')
            # Registration may create shared schema; wait for the actual package
            # to finish importing before creating the second persistence owner.
            def eventually(read,accept,timeout=120):
                end=time.monotonic()+timeout
                while time.monotonic()<end:
                    try:
                        result=read()
                        if accept(result):return result
                        if isinstance(result,dict) and result.get('status') in ['failed','needs_attention']:
                            raise AssertionError('FIXTURE_TERMINAL_TASK '+json.dumps(result))
                    except RuntimeError:pass
                    time.sleep(.3)
                raise RuntimeError('FIXTURE_DEADLINE')
            eventually(lambda:exec_in(web,['node','-e',"fetch('http://127.0.0.1:3000/api/version',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(console.log)"]),lambda _:True)
            tick=json.loads(exec_in(web,['node','-e',"fetch('http://127.0.0.1:3000/api/video/worker/tick',{method:'POST',headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET},signal:AbortSignal.timeout(3000)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))"]))
            check(name+'-web-does-not-execute-http-tick',tick['status']==409 and tick['body'].get('error')=='APPLICATION_TASKS_ASSIGNED_TO_WORKER')
            identity=controls.clone_worker(tx,public_identity(tx.inspect(web)),name=name,memory_mib=1024,cpu=1,
                state_dir=str(folder/'state'),reviewed_combined_media=combined)
            worker=identity['id'];controls.start_worker(tx,identity,4096,reviewed_combined_media=combined)
            def state():
                return json.loads(exec_in(worker,['node','-e',"fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}}).then(r=>r.json()).then(v=>console.log(JSON.stringify(v)))"]))
            status=eventually(state,lambda s:s.get('paused') is True and s.get('executionMode')=='direct')
            check(name+'-actual-paused-direct-self-target',status.get('targetInstanceId')==name and status.get('executorRole')=='worker')
            # Actual shared bytes written under Worker uid are visible to Web.
            exec_in(worker,['node','-e',"const f=require('node:fs');f.mkdirSync('/data/media',{recursive:true});f.writeFileSync('/data/media/release-shared.txt','exact-shared-bytes')"],user='1001:1001')
            check(name+'-shared-media',exec_in(web,['node','-e',"console.log(require('node:fs').readFileSync('/data/media/release-shared.txt','utf8'))"]).strip()==b'exact-shared-bytes')
            check(name+'-no-web-secret', 'RELEASE_CONTROL_SECRET' not in environment(tx.inspect(worker)))
            if combined:
                process_probe=r"""const f=require('node:fs');console.log(JSON.stringify(f.readdirSync('/proc').filter(x=>/^\d+$/.test(x)).flatMap(pid=>{try{const a=f.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0'),scanner=a.some(x=>x==='scripts/video-worker.mjs'||x==='/app/scripts/video-worker.mjs'),media=a.some(x=>x==='scripts/video-media-worker.mjs'||x==='/app/scripts/video-media-worker.mjs');if(!scanner&&!media)return [];const e=f.readFileSync('/proc/'+pid+'/environ','utf8').split('\0'),s=f.readFileSync('/proc/'+pid+'/status','utf8');return [{pid:Number(pid),scanner,uid:Number(s.match(/^Uid:\s+(\d+)/m)[1]),hasDB:e.some(v=>v.startsWith('DATABASE_URL=')),hasSettings:e.some(v=>v.startsWith('SETTINGS_SECRET='))}]}catch{return []}})));"""
                children=json.loads(exec_in(worker,['node','-e',process_probe]))+json.loads(exec_in(worker,['node','-e',process_probe],user='1001:1001'))
                (args.evidence/'ACTUAL_CHILD_IDENTITIES.json').write_text(json.dumps(children,indent=2))
                check(name+'-actual-child-separation',any(x['scanner'] and x['uid']==1001 and x['hasDB'] and x['hasSettings'] for x in children)
                      and any(not x['scanner'] and x['uid']==0 and not x['hasDB'] and not x['hasSettings'] for x in children))
            from types import SimpleNamespace
            import worker_handoff
            expected=SimpleNamespace(container=worker,expected_id=worker,expected_image=args.image,expected_commit=source,
                expected_origin='http://'+web_name+':3000',action='resume',operation_id=str(uuid.uuid4()),tick_id=None,
                require_media_worker=combined)
            control_folder=args.evidence/('controls-'+worker[:12]);control_folder.mkdir()
            result=worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
            check(name+'-actual-control-resume',result['state']['paused'] is False)
            eventually(state,lambda s:(s.get('lastTick') or {}).get('phase')=='complete',timeout=120)
            expected.action='drain';expected.operation_id=str(uuid.uuid4())
            result=worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
            eventually(state,lambda s:s.get('phase')=='QUIESCENT' and s.get('backgroundTasks')==0)
            check(name+'-actual-tick-drain-no-replay')
            if args.tasks and combined:
                gateway=None
                if args.prior_image:
                    from video_release_gateway_fixture import VideoReleaseGateway
                    gateway=VideoReleaseGateway(api=api,execute=exec_in,tx=tx,args=args,prefix=prefix,network=prefix,
                        slots=slots,web=web,worker=worker,values=values,mounts=mounts,wait=eventually,check=check)
                    peer_state['web']=gateway.old_web_name
                def fixture(action,**fields):
                    return json.loads(exec_in(web,['node','/fixture/task-fixture.cjs',json.dumps({'action':action,**fields})],env=['NODE_OPTIONS=','NODE_PATH=/app/node_modules']))
                seed=fixture('init',origin='http://release-peer:18080')
                if gateway and args.lifecycle:
                    gateway.start_lifecycle(lambda query:sql('SET search_path TO '+schema+';'+query))
                def http(route,body=None):
                    payload={'route':route,'body':body,'cookie':seed['cookie'],'origin':gateway.origin if gateway else 'http://127.0.0.1:3000'}
                    script="const x=JSON.parse(process.argv[1]);fetch(x.origin+x.route,{method:x.body===null?'GET':'POST',headers:{cookie:x.cookie,'content-type':'application/json'},...(x.body===null?{}:{body:JSON.stringify(x.body)}),signal:AbortSignal.timeout(60000)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json(),slot:r.headers.get('x-release-slot')})))"
                    return json.loads(exec_in(web,['node','-e',script,json.dumps(payload)]))
                # Open only this fixture Web through the actual admission owner.
                app=controls.app_status(tx,public_identity(tx.inspect(web)))
                if gateway:gateway.open_old()
                else:controls.control_app(tx,public_identity(tx.inspect(web)),'resume',str(uuid.uuid4()))
                base={'source':'workbench','modelId':seed['modelId'],'prompt':'RELEASE_ACCEPTED','mode':'text',
                    'parameters':{'durationSeconds':1,'resolution':'4K'},'references':[{'id':'ref','artworkId':seed['artworkId'],'kind':'image','role':'reference'}],
                    'idempotencyKey':str(uuid.uuid4())}
                if args.browser_port is not None:
                    assert fixture('browser-configure')['configured'] is True
                    draft=http('/api/canvas/video-nodes',{'id':'release-browser-node','title':'Release browser continuity','expectedRevision':0,'operationId':str(uuid.uuid4()),
                        'config':{'modelId':seed['modelId'],'prompt':'Old browser draft','parameters':{'durationSeconds':1,'resolution':'4K'}},'inputs':[]})
                    assert draft['status']==201,draft
                    gateway.browser_phase('old',{'cookie':seed['cookie'],'nodeId':draft['body']['node']['id'],'projectKey':draft['body']['node']['projectKey']},lambda:fixture('browser-counts'))
                preview=http('/api/video/compile-preview',{'modelId':seed['modelId'],'draftRevision':1,'draft':{'prompt':base['prompt'],'parameters':base['parameters'],
                    'inputs':[{'id':'ref','nodeId':seed['artworkId'],'kind':'image','role':'reference'}]}})
                check(name+'-task-preview-not-old-capability-gated',preview['status']==200 and preview['body']['value']['intent']=='single_image')
                accepted=http('/api/video/generate',base);assert accepted['status']==200,accepted
                task_id=accepted['body']['taskId'];row=fixture('task',id=task_id)
                check(name+'-http-accepts-frozen-v3-zero-supplier-post',row['version']==3 and row['submissionState']=='prepared' and len(peer_state['calls'])==0)
                check(name+'-preview-digest-equals-accepted-plan',row['planDigest']==preview['body']['value']['planDigest'])
                replay=http('/api/video/generate',base);check(name+'-exact-operation-replay',replay['body']['taskId']==task_id)
                fixture('change',origin='http://release-peer:18080')
                if gateway:gateway.control_old('resume')
                else:
                    expected.action='resume';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
                eventually(lambda:fixture('task',id=task_id),lambda r:bool(r.get('upstreamId')))
                if gateway:
                    gateway.control_old('drain');eventually(gateway.state,lambda s:s.get('phase')=='QUIESCENT')
                    controls.control_app(tx,public_identity(tx.inspect(gateway.old_web)),'drain',str(uuid.uuid4()))
                    controls.control_app(tx,public_identity(tx.inspect(web)),'resume',str(uuid.uuid4()))
                    gateway.switch('new');peer_state['web']=web_name
                else:
                    expected.action='drain';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
                    eventually(state,lambda s:s.get('phase')=='QUIESCENT')
                check(name+'-frozen-old-model-price-and-one-mapping',len(peer_state['calls'])==1 and peer_state['calls'][0]['body']['model']=='future-release-model'
                    and peer_state['calls'][0]['body']['resolution']=='2k' and row['quotedCredits']==7)
                check(name+'-supplier-retrieves-original-input',peer_state['reads'][0]['sha256']==seed['inputSha256'])
                peer_state['hold']=False
                api('POST','/containers/'+worker+'/stop?t=60');controls.start_worker(tx,public_identity(tx.inspect(worker)),4096,reviewed_combined_media=True)
                eventually(state,lambda s:s.get('paused') is True)
                fixture('due',id=task_id);expected.action='resume';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
                done=eventually(lambda:fixture('task',id=task_id),lambda r:r['status']=='completed')
                expected.action='drain';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode());eventually(state,lambda s:s.get('phase')=='QUIESCENT')
                check(name+'-restart-polls-original-no-paid-repost',len(peer_state['calls'])==1 and done['quotedCredits']==7)
                restored=http('/api/video/tasks/'+task_id);check(name+'-restores-requested-not-wire',restored['body']['snapshot']['config']['parameters']['resolution']=='4K')
                node_id='release-next-'+uuid.uuid4().hex
                node=http('/api/canvas/video-nodes',{'id':node_id,'expectedRevision':0,'operationId':str(uuid.uuid4()),'config':{'modelId':seed['modelId'],
                    'prompt':'RELEASE_DOWNSTREAM','parameters':base['parameters']},'inputs':[{'id':'source','nodeId':done['artworkId'],'kind':'video','role':'source_video','value':'forged.mp4'}]})
                assert node['status']==201,node
                second=http('/api/canvas/video-nodes/'+node_id+'/generate',{'expectedRevision':node['body']['node']['revision'],'idempotencyKey':str(uuid.uuid4())});assert second['status']==202,second
                second_id=second['body']['taskId'];expected.action='resume';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
                second_done=eventually(lambda:fixture('task',id=second_id),lambda r:r['status']=='completed')
                expected.action='drain';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode());eventually(state,lambda s:s.get('phase')=='QUIESCENT')
                check(name+'-result-feeds-next-canvas-task',len(peer_state['calls'])==2 and peer_state['calls'][1]['body']['model']=='changed-release-model'
                    and len(peer_state['calls'][1]['body']['video_urls'])==1 and 'forged.mp4' not in json.dumps(peer_state['calls']))
                unknown=http('/api/video/generate',{**base,'prompt':'RELEASE_UNKNOWN','references':[],'idempotencyKey':str(uuid.uuid4())});assert unknown['status']==200,unknown
                unknown_id=unknown['body']['taskId'];expected.action='resume';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
                eventually(lambda:fixture('task',id=unknown_id),lambda r:r['status']=='needs_attention')
                expected.action='drain';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode());eventually(state,lambda s:s.get('phase')=='QUIESCENT')
                retry=http('/api/video/tasks/'+unknown_id+'/retry',{'idempotencyKey':str(uuid.uuid4())})
                check(name+'-unknown-not-retryable-or-charged',retry['status']==409 and len([c for c in peer_state['calls'] if c['body']['prompt']=='RELEASE_UNKNOWN'])==1)
                ledger=fixture('ledger',ids=[task_id,second_id,unknown_id],artworks=[done['artworkId'],second_done['artworkId']])
                check(name+'-single-original-and-downstream-ledger',len(ledger['rows'])==2 and sorted(int(x['delta']) for x in ledger['rows'])==[-17,-7])
                check(name+'-stable-parent-asset',any(a['id']==second_done['artworkId'] and a['parent_id']==done['artworkId'] for a in ledger['artifacts']))
                for result in [done,second_done]:
                    probe="const x=JSON.parse(process.argv[1]);fetch('http://127.0.0.1:3000'+x.url,{headers:{cookie:x.cookie}}).then(async r=>{if(!r.ok)throw Error('ASSET_HTTP_'+r.status);console.log(require('node:crypto').createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'))})"
                    result_hash=exec_in(web,['node','-e',probe,json.dumps({'url':result['videoUrl'],'cookie':seed['cookie']})]).decode().strip()
                    check(name+'-result-bytes-'+result['id'],result_hash==hashlib.sha256(video).hexdigest())
                task_proof={'first':done,'second':second_done,'unknown':fixture('task',id=unknown_id),'ledger':ledger,'supplier':peer_state,
                    'resultSha256':hashlib.sha256(video).hexdigest()}
            boot=state()['bootId'];api('POST','/containers/'+worker+'/stop?t=60')
            controls.start_worker(tx,public_identity(tx.inspect(worker)),4096,reviewed_combined_media=combined)
            restarted=eventually(state,lambda s:s.get('paused') is True and s.get('phase')=='QUIESCENT')
            check(name+'-actual-restart-preserves-drain',restarted['bootId']!=boot and restarted['targetInstanceId']==name)
            if args.tasks and combined:
                original_unknown=fixture('task',id=unknown_id)
                expected.action='resume';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode())
                eventually(state,lambda s:(s.get('lastTick') or {}).get('phase')=='complete' and s.get('activeTicks')==0)
                expected.action='drain';expected.operation_id=str(uuid.uuid4());worker_handoff.execute(expected,control_folder,lambda argv:tx.run(argv).decode());eventually(state,lambda s:s.get('phase')=='QUIESCENT')
                check(name+'-unknown-survives-restart-without-repost',fixture('task',id=unknown_id)==original_unknown
                    and len([c for c in peer_state['calls'] if c['body']['prompt']=='RELEASE_UNKNOWN'])==1)
                if gateway:
                    before_ledger=fixture('ledger',ids=[task_id,second_id,unknown_id],artworks=[done['artworkId'],second_done['artworkId']])
                    rollback_done=None;rollback_ledger=before_ledger
                    if args.lifecycle=='complete':
                        gateway.lifecycle.complete()
                        check('lifecycle-complete-keeps-history-and-UNKNOWN',fixture('task',id=unknown_id)==original_unknown
                            and fixture('ledger',ids=[task_id,second_id,unknown_id],artworks=[done['artworkId'],second_done['artworkId']])==before_ledger)
                    else:
                        controls.control_app(tx,public_identity(tx.inspect(web)),'drain',str(uuid.uuid4()))
                        gateway.rollback(lambda query:sql('SET search_path TO '+schema+';'+query))
                        peer_state['web']=gateway.old_web_name
                        check('gateway-rollback-preserves-history-and-UNKNOWN',http('/api/video/tasks/'+task_id)['body']['task']['status']=='completed'
                            and fixture('task',id=unknown_id)==original_unknown)
                        check('gateway-rollback-does-not-rewind-billing-assets',fixture('ledger',ids=[task_id,second_id,unknown_id],artworks=[done['artworkId'],second_done['artworkId']])==before_ledger)
                        rollback_input={**base,'prompt':'RELEASE_AFTER_ROLLBACK','references':[],'idempotencyKey':str(uuid.uuid4())}
                        rollback_http=http('/api/video/generate',rollback_input);assert rollback_http['status']==200,rollback_http
                        rollback_id=rollback_http['body']['taskId'];gateway.control_old('resume')
                        rollback_done=eventually(lambda:fixture('task',id=rollback_id),lambda r:r['status']=='completed')
                        gateway.control_old('drain');eventually(gateway.state,lambda s:s.get('phase')=='QUIESCENT')
                        rollback_ledger=fixture('ledger',ids=[task_id,second_id,rollback_id,unknown_id],artworks=[])
                        check('gateway-old-build-accepts-new-operation-after-rollback',rollback_done['quotedCredits']==17 and len(rollback_ledger['rows'])==3
                            and sum(-int(x['delta']) for x in rollback_ledger['rows'])==41 and len(peer_state['calls'])==4)
                    task_proof['gateway']={'phases':gateway.phases,'oldImage':args.prior_image,'newImage':args.image,
                        'oldStaticAssets':len(gateway.assets_before),'rollbackTask':rollback_done,'ledger':rollback_ledger,
                        'browserContinuity':{'mode':'audit' if args.browser_observe_upgrades else 'strict','strictNoReload':all(row.get('noReload',True) for row in gateway.browser_observations),'observations':gateway.browser_observations} if args.browser_port is not None else None}
                    if gateway.lifecycle and args.lifecycle=='rollback':gateway.lifecycle.rolled_back()
            for target in [worker,web]:
                api('POST','/containers/'+target+'/stop?t=60')
                row=tx.inspect(target);check(name+'-stopped-'+target[:8],row['State']['ExitCode']==0)
                (args.evidence/(target[:12]+'.log')).write_bytes(api('GET','/containers/'+target+'/logs?stdout=1&stderr=1',raw=True))
        paid=json.loads(sql('SET search_path TO '+schema+";SELECT json_build_object('tasks',(SELECT count(*) FROM app_video_tasks),'ledger',(SELECT count(*) FROM app_ledger WHERE id LIKE 'led-video-%'));").splitlines()[-1])
        check('exact-generation-and-billing-counts',paid==({'tasks':4,'ledger':3} if args.prior_image and args.lifecycle!='complete' else {'tasks':3,'ledger':2} if args.tasks else {'tasks':0,'ledger':0}))
        (args.evidence/'RESULT.json').write_text(json.dumps({'ok':True,'checks':checks,'count':len(checks),'image':args.image,
            'schema':schema,'events':events,'tasks':task_proof,'paidCalls':0,'siteOperations':0},indent=2))
        roles=3 if args.prior_image else 2
        print('RELEASE_DIRECT_ACTUAL=PASS CHECKS='+str(len(checks))+' REAL_CREATORS='+str(roles)+' REAL_NEXT='+str(roles)+' REAL_WORKERS='+str(roles)+' REAL_PG=1 NGINX='+str(int(bool(args.prior_image)))+' PAID_CALLS=0 SITE_OPERATIONS=0')
    finally:
        for target in reversed(slots):
            row=tx.inspect(target)
            if row['State']['Running']:api('POST','/containers/'+target+'/stop?t=60')
            api('DELETE','/containers/'+target)
        sql('DROP SCHEMA IF EXISTS '+schema+' CASCADE')
        if args.tasks:
            api('POST','/networks/'+network+'/disconnect',{'Container':args.driver_container})
        api('DELETE','/networks/'+network)
        if peer:peer.shutdown();peer.server_close()
        print('RELEASE_DIRECT_ACTUAL_CLEANUP=PASS SLOTS='+str(len(slots))+' SCHEMA_DROPPED=1 NETWORK_REMOVED=1')


if __name__=='__main__':main()
