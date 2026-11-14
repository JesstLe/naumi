#!/usr/bin/env python3
"""Linux-only, fixture-scoped Docker adapter exercising the REAL release owner.

The fixture has the Docker socket, never the product. No site connections or
generation requests. Random PG schema, owned network/slots/state only.
"""
import argparse
import http.client
import json
import os
import pathlib
import socket
import time
import uuid

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
    p.add_argument('--evidence',type=pathlib.Path,required=True);args=p.parse_args()
    assert os.name=='posix' and args.root.is_relative_to('/opt/naumi-staging/releases')
    assert args.image.startswith('sha256:') and len(args.image)==71
    args.evidence.mkdir(parents=True,exist_ok=True);args.root.mkdir(parents=True,exist_ok=True)
    suffix=uuid.uuid4().hex[:12];prefix='naumi-release-direct-fixture-'+suffix;schema='release_direct_'+suffix
    network=api('POST','/networks/create',{'Name':prefix,'Driver':'bridge'})['Id']
    slots=[];checks=[];events=[]
    db='naumi-video-compiler-pg-20261114'
    def sql(text):return exec_in(db,['psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','video_compiler_fixture','-c',text]).decode().strip()
    def check(name,condition=True):assert condition,name;checks.append(name)
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
            assert argv[1]=='create'
            config={'HostConfig':{},'NetworkingConfig':{'EndpointsConfig':{}}};host=config['HostConfig'];mounts=[];envfile=None
            index=2
            while index<len(argv) and argv[index]!=args.image:
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
            config.update(Image=args.image,Cmd=argv[index+1:],Env=envfile.read_text().splitlines());host['Mounts']=mounts
            container=api('POST','/containers/create?name='+name,config)['Id'];slots.append(container)
            events.append({'action':'actual-release-docker-create','id':container,'image':args.image,'name':name,
                           'environmentNames':sorted(environment({'Config':{'Env':config['Env']}}))})
            return container.encode()
    tx=Tx()
    try:
        sql('CREATE SCHEMA '+schema)
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
            boot=state()['bootId'];api('POST','/containers/'+worker+'/stop?t=60')
            controls.start_worker(tx,public_identity(tx.inspect(worker)),4096,reviewed_combined_media=combined)
            restarted=eventually(state,lambda s:s.get('paused') is True and s.get('phase')=='QUIESCENT')
            check(name+'-actual-restart-preserves-drain',restarted['bootId']!=boot and restarted['targetInstanceId']==name)
            for target in [worker,web]:
                api('POST','/containers/'+target+'/stop?t=60')
                row=tx.inspect(target);check(name+'-stopped-'+target[:8],row['State']['ExitCode']==0)
                (args.evidence/(target[:12]+'.log')).write_bytes(api('GET','/containers/'+target+'/logs?stdout=1&stderr=1',raw=True))
        paid=json.loads(sql('SET search_path TO '+schema+";SELECT json_build_object('tasks',(SELECT count(*) FROM app_video_tasks),'ledger',(SELECT count(*) FROM app_ledger));").splitlines()[-1])
        check('empty-scans-no-generation-or-billing',paid=={'tasks':0,'ledger':0})
        (args.evidence/'RESULT.json').write_text(json.dumps({'ok':True,'checks':checks,'count':len(checks),'image':args.image,
            'schema':schema,'events':events,'paidCalls':0,'siteOperations':0},indent=2))
        print('RELEASE_DIRECT_ACTUAL=PASS CHECKS='+str(len(checks))+' REAL_CREATORS=2 REAL_NEXT=2 REAL_WORKERS=2 REAL_PG=1 PAID_CALLS=0 SITE_OPERATIONS=0')
    finally:
        for target in reversed(slots):
            row=tx.inspect(target)
            if row['State']['Running']:api('POST','/containers/'+target+'/stop?t=60')
            api('DELETE','/containers/'+target)
        sql('DROP SCHEMA IF EXISTS '+schema+' CASCADE')
        api('DELETE','/networks/'+network)
        print('RELEASE_DIRECT_ACTUAL_CLEANUP=PASS SLOTS='+str(len(slots))+' SCHEMA_DROPPED=1 NETWORK_REMOVED=1')


if __name__=='__main__':main()
