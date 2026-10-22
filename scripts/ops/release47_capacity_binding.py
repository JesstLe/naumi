"""One reviewed loopback Router callback binding; no Web/Worker/Router restart.

The operation is NOT a Web publication. Pending/UNKNOWN journal records deliberately
remain visible to normal.begin. No replay, model call, lease command or rollback.
"""
import copy
import base64
import datetime as dt
import hmac
import json
import os
import pathlib
import re
import shlex
import shutil
import time
import urllib.error
import urllib.request
import uuid

import release47_controls as controls
import release47_normal_controller as ctl
import release47_normal_policy as normal
import release47_recovery_supervisor as recovery
import release_client_compat as compat
from release47_host import HostTransaction, Hold, environment, public_identity, require, sha, file_sha
from release47_preserved_unknown import Guard
from release47_saas_successor import syntax_check, CASE05_BASELINE, CASE05_SHA256
from saas_recovery_gateway import render, server_inventory

TARGET='47.105.59.142'
RELEASE='release47-saas-capacity-binding-20261023-r1'
R1='release47-saas-20261023-r1'
ROOT=pathlib.Path('/opt/naumi-staging/evidence')/RELEASE
CONF=pathlib.Path('/etc/nginx/conf.d/naumi47-model-capacity-current.conf')
SERVICE=pathlib.Path('/etc/systemd/system/naumi47-recovery.service')
CALLBACK='/api/internal/model-capacity'
APP_SOURCE='5b8489d9ec989ea803eb37280c65e2f18529babb'
IMAGE='sha256:db8004f1ba69c702ec2adb3f2045fb402e4f38b62ef9df63126b043fe2ea4166'
WEB='08c7751d0be8ad09638b16e23eb39177bcca9487dbc05819dd04ae54f83e958e'
WORKER='4bb56aa5f53b69a43d90652d316d4f7fcf91c6674512fdc9b3c263169952e07a'
AUTH='后台你觉得验收通过之后 合并所有分支然后上线47服务器做真实验收'


def validate_config(cfg):
    require(cfg.get('target')==TARGET and cfg.get('releaseId')==RELEASE and cfg.get('evidenceRoot')==str(ROOT), 'EXACT_CAPACITY_OPERATION_REQUIRED')
    require(cfg.get('expectedRevision')==728 and re.fullmatch('[a-f0-9]{64}',cfg.get('expectedCanonicalDigest','')) and re.fullmatch('[a-f0-9]{64}',cfg.get('expectedCanonicalFileSha256','')), 'EXACT_R1_REVISION_REQUIRED')
    require(re.fullmatch('[a-f0-9]{40}',cfg.get('operatorSource','')) and re.fullmatch('[0-9]+',str(cfg.get('routerStartTicks',''))) and re.fullmatch('[a-f0-9]{64}',cfg.get('routerCmdlineSha256','')), 'PINNED_OPERATOR_AND_ROUTER_REQUIRED')
    require(cfg.get('preservedUnknown')=={'baselinePath':CASE05_BASELINE,'baselineSha256':CASE05_SHA256,'allowedAdditiveColumns':{}}, 'ORIGINAL_UNKNOWN_BASELINE_REQUIRED')
    require(cfg.get('date')==dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(), 'OPERATION_DATE_CHANGED')
    # These must never be made configurable through this narrow operation.
    require(not any(k in cfg for k in ['port','upstream','configPath','routerPid','token','publicBind','manifestPath']), 'CAPACITY_SCOPE_OVERRIDE_FORBIDDEN')


def private_server(port):
    require(type(port) is int and port in (13052,13952),'FIXED_PRIVATE_PORT_REQUIRED')
    return f'''server {{
  listen 127.0.0.1:{port};
  server_name _;
  access_log off;
  location = {CALLBACK} {{
    proxy_pass http://127.0.0.1:13114;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header Connection "";
    proxy_connect_timeout 3s;
    proxy_read_timeout 15s;
    proxy_buffering off;
  }}
  location / {{ return 404; }}
}}
'''.encode()


def required_include(dump):
    parsed=compat.Dump(dump)
    http=[n for n in parsed.nodes[parsed.root] if n.name=='http'][0]
    require(any(n.name=='include' and n.args==['/etc/nginx/conf.d/*.conf'] for n in http.children or []), 'REAL_HTTP_CONF_D_INCLUDE_REQUIRED')
    require(str(CONF) not in parsed.files,'CALLBACK_CONF_ALREADY_LOADED')
    return parsed


def selected_public_servers(dump):
    rows=[r for r in server_inventory(dump) if pathlib.PurePosixPath(r['path']).name=='reference-workbench']
    require(len(rows)==2 and all(r['listen'] for r in rows),'EXACT_TWO_PUBLIC_SERVERS_REQUIRED')
    ports=[]
    for row in rows:
        for binding in row['listen']:
            require(binding and binding[0].split(':')[-1] in ('80','443') and not binding[0].startswith(('127.','[::1]')), 'PUBLIC_SERVER_BINDING_CHANGED')
            ports.append(binding[0].split(':')[-1])
    require(set(ports)=={'80','443'},'PUBLIC_HTTP_TLS_PAIR_REQUIRED')
    return rows


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise Hold('CAPACITY_REDIRECT_FORBIDDEN')


def protocol_probe(port,token):
    require(port in (13052,13952) and isinstance(token,str) and len(token)>=32,'FIXED_PROTOCOL_PROBE_REQUIRED')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    observed=[]
    for method,path,authenticated,expected in [('GET',CALLBACK,False,405),('POST',CALLBACK,False,404),('POST',CALLBACK,True,400),('GET','/admin',False,404),('GET',CALLBACK+'/',False,404)]:
        headers={'Content-Type':'application/json'}
        if authenticated:headers['Authorization']='Bearer '+token
        request=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=b'{}' if method=='POST' else None,headers=headers,method=method)
        try:
            response=opener.open(request,timeout=8)
        except urllib.error.HTTPError as error: response=error
        except Hold:raise
        except Exception:raise Hold('CAPACITY_HTTP_UNAVAILABLE') from None
        try:status=response.status
        finally:response.close()
        require(status==expected,'CAPACITY_PROTOCOL_STATUS_MISMATCH')
        observed.append({'method':method,'authenticated':authenticated,'status':status,'exactCallback':path==CALLBACK})
    return {'port':port,'checks':observed,'generationPosts':0,'leaseCommands':0,'probePostBody':'empty-object'}


class ReadOnlySupervisor(recovery.Supervisor):
    def __init__(self,manifest,adapter):
        self.manifest,self.adapter=manifest,adapter
        self.folder=pathlib.Path(manifest['journalDir'])
        require(self.folder.is_dir() and not self.folder.is_symlink(),'EXISTING_SUPERVISOR_JOURNAL_REQUIRED')
        self.observations={}
    def ensure_running(self,spec):
        row=self.adapter.inspect(spec);require(row['State']['Running'],'READONLY_SUPERVISOR_CANNOT_START');return row
    def admit(self,spec,status):
        require((status.get('admission',{}).get('mode')=='open' if spec['role']=='web' else status.get('paused') is False and status.get('unresolvedTicks')==0 and not status.get('controlFault')),'READONLY_SUPERVISOR_CANNOT_RESUME')
        return status
    def record(self,name,data):self.observations[name]=data


class CapacityBinding:
    def __init__(self,tx,cfg):
        validate_config(cfg);self.tx,self.cfg=tx,cfg
        require(tx.target==TARGET and tx.folder==ROOT and tx.stack is not None,'THREE_LOCKED_OPERATION_REQUIRED')
        self.original=ctl.CANON.read_bytes();self.disk=sha(self.original);self.state=json.loads(self.original)
        require(self.state['revision']==728 and self.disk==cfg['expectedCanonicalFileSha256'] and sha(recovery.encoded(self.state))==cfg['expectedCanonicalDigest'],'CAPACITY_CANONICAL_REVIEW_CHANGED')
        require(self.state.get('activeNormalBlueGreenReleaseId')==R1,'R1_NOT_ACTIVE')
        self.prior=copy.deepcopy(self.state.get('normalBlueGreenReleases',{}).get(R1,{}))
        require(self.prior.get('phase')=='COMPLETE' and len(set(self.prior.get('retired',[])))==2,'R1_NOT_COMPLETE_RETIRED')
        self.historical={k:copy.deepcopy(self.state.get(k)) for k in ('phase','legacyDrainProven','blueGreenSuccessor','operations','activeNormalBlueGreenReleaseId')}
        self.runtime=copy.deepcopy(self.state['runtimeRecovery']);self.manifest_path=pathlib.Path(self.runtime['manifestPath'])
        require(self.manifest_path.is_relative_to(ROOT.parent/R1) and self.manifest_path.name=='supervisor-manifest.json' and not self.manifest_path.is_symlink(),'EXISTING_R1_MANIFEST_PATH_REQUIRED')
        self.manifest_raw=self.manifest_path.read_bytes();self.manifest=json.loads(self.manifest_raw)
        recovery.recovery_binding(self.state,self.manifest)
        require(self.runtime.get('successorReleaseId')==self.manifest.get('successorReleaseId')==R1 and self.manifest.get('commit')==APP_SOURCE and self.manifest.get('image')==IMAGE and self.manifest.get('buildVersion')=='1792705393','R1_SUPERVISOR_PROGRAM_CHANGED')
        self.unit=SERVICE.read_bytes()
        starts=[shlex.split(line.split('=',1)[1])for line in self.unit.decode().splitlines()if line.startswith('ExecStart=')]
        require(len(starts)==1 and len(starts[0])>=4 and '--manifest' in starts[0] and starts[0][starts[0].index('--manifest')+1]==str(self.manifest_path),'SUPERVISOR_NOT_CURRENTLY_MANAGED')
        require(file_sha(starts[0][1])==self.runtime.get('supervisorProgramSha256'),'SUPERVISOR_PROGRAM_SHA_CHANGED')
        self.web=self.runtime['effectiveWeb'];self.worker=self.runtime['effectiveWorker'];self.pin_slots()
        self.db=tx.inspect('naumi-staging-db-1');self.de=environment(self.db)
        self.guard=Guard({**cfg['preservedUnknown'],'supplementalPath':str(ROOT/'CASE05_SUPPLEMENT.private.json')},self.sql,tx.save)
        self.sidecar=None;self.live_written=False;self.record=None

    def sql(self,query):
        raw=self.tx.run(['docker','exec','-i',self.db['Id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=("BEGIN READ ONLY; SET LOCAL statement_timeout='5s';"+query+'COMMIT;').encode(),timeout=30)
        return [json.loads(row)for row in raw.splitlines()if row.startswith(b'{')]

    def pin_slots(self):
        for role,identity,fixed,name,memory in [('web',self.web,WEB,'naumi47-web-saas-20261023-r1',2048),('worker',self.worker,WORKER,'naumi47-worker-video-family-saas-20261023-r1',1024)]:
            require(identity.get('id')==fixed and identity.get('name')==name and identity.get('image')==IMAGE and identity.get('running') is True,'FIXED_R1_SLOT_REQUIRED')
            row=self.tx.pin(identity);env=environment(row)
            require(row['HostConfig']['Memory']==memory*1024**2 and env.get('SOURCE_COMMIT')==APP_SOURCE and env.get('BUILD_VERSION')=='1792705393','R1_RAM_PROGRAM_CHANGED')
            require(self.manifest[role]['id']==fixed and self.manifest[role]['memoryMiB']==memory and recovery.static_pin(row)==self.manifest[role]['staticSha256'],'R1_MANIFEST_SLOT_CHANGED')
        require(environment(self.tx.inspect(WORKER)).get('NAUMI_APP_ORIGIN')=='http://naumi47-web-saas-20261023-r1:3000','WORKER_TARGET_CHANGED')
        for old in self.prior['retired']:
            row=self.tx.inspect(old);require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name']=='no','R1_OLD_SLOT_CHANGED')

    def router_identity(self):
        root=pathlib.Path('/proc/4420');stat=root.joinpath('stat').read_text();start=stat.rsplit(')',1)[1].split()[19]
        cmd=root.joinpath('cmdline').read_bytes();raw=root.joinpath('environ').read_bytes()
        require(start==str(self.cfg['routerStartTicks']) and sha(cmd)==self.cfg['routerCmdlineSha256'],'ROUTER_PROCESS_CHANGED')
        require(root.joinpath('ns/net').stat().st_ino==pathlib.Path('/proc/self/ns/net').stat().st_ino,'ROUTER_NETWORK_NAMESPACE_MISMATCH')
        env=dict(part.split('=',1)for part in raw.decode().split('\0')if '=' in part)
        require(env.get('NAUMI_MODEL_CAPACITY_URL')=='http://127.0.0.1:13052'+CALLBACK,'ROUTER_CALLBACK_SOURCE_CHANGED')
        token=env.get('NAUMI_ROUTER_MANAGEMENT_TOKEN','');other=environment(self.tx.inspect(WEB)).get('NAUMI_ROUTER_MANAGEMENT_TOKEN','')
        require(len(token)>=32 and hmac.compare_digest(token,other),'ROUTER_WEB_MANAGEMENT_AUTHORITY_MISMATCH')
        return token,{'pid':4420,'startTicks':start,'cmdlineSha256':sha(cmd),'environmentSha256':sha(raw),'sameHostNetworkNamespace':True,'tokenMatches':True}

    def persist(self):
        require(sha(ctl.CANON.read_bytes())==self.disk,'CAPACITY_CANONICAL_CAS_CHANGED')
        require(all(self.state.get(k)==v for k,v in self.historical.items()) and self.state['normalBlueGreenReleases'][R1]==self.prior,'R1_HISTORY_OR_ACTIVE_CHANGED')
        self.state['revision']+=1
        expected=json.dumps(self.state,sort_keys=True).encode()+b'\n'
        try:controls._atomic_private(ctl.CANON,self.state)
        except BaseException:
            # rename may have succeeded before directory fsync failed. Recognize
            # only our exact bytes, so failure handling can durably mark HOLD.
            try:
                observed=ctl.CANON.read_bytes()
                if observed==expected:self.disk=sha(observed)
            except OSError:pass
            raise
        observed=ctl.CANON.read_bytes();require(observed==expected,'CAPACITY_CANONICAL_REOPEN_CHANGED');self.disk=sha(observed)

    def phase(self,phase):
        self.record.update(phase=phase,updatedAt=dt.datetime.now(dt.timezone.utc).isoformat())
        if phase=='COMPLETE':self.record['completedAt']=self.record['updatedAt']
        self.persist()

    def op(self,name,action):
        require(name not in self.record['operations'],'CAPACITY_OPERATION_REPLAY_FORBIDDEN')
        op={'operationId':str(uuid.uuid4()),'phase':'INTENT_RECORDED'};self.record['operations'][name]=op
        self.tx.save('intent-'+name+'.json',op);self.persist()
        try:result=action()
        except BaseException:
            op['phase']='UNKNOWN'
            try:self.persist()
            except Exception:pass
            raise
        op['phase']='ACKNOWLEDGED';self.persist();return result

    def free_port(self,port):require(not self.tx.run(['ss','-H','-lntp','sport','=',':'+str(port)]).strip(),'CAPACITY_PRIVATE_PORT_NOT_FREE')

    def closure(self):
        dump=self.tx.run(['nginx','-T']).decode();parsed=compat.Dump(dump)
        return dump,{p:pathlib.Path(p).read_bytes()for p in parsed.files}

    def closure_cas(self):
        require(sha(self.tx.run(['nginx','-T']))==sha(self.dump.encode()),'CAPACITY_FULL_DUMP_CAS_CHANGED')
        for p,raw in self.before.items():
            require(pathlib.Path(p).resolve()==self.real[p] and pathlib.Path(p).read_bytes()==raw,'CAPACITY_FULL_FILE_CAS_CHANGED')

    def start_sidecar(self):
        folder=ROOT/'private-sidecar';folder.mkdir(mode=0o700,exist_ok=False)
        config=folder/'nginx.conf';prefix=str(folder)+'/'
        body=(f'daemon on;\npid "{folder}/nginx.pid";\nerror_log "{folder}/error.log";\nevents {{ worker_connections 32; }}\nhttp {{ access_log off; client_body_temp_path "{folder}/body"; proxy_temp_path "{folder}/proxy";\n').encode()+private_server(13952)+b'\n}\n'
        config.write_bytes(body);self.nginx=pathlib.Path(shutil.which('nginx')or'');require(self.nginx.is_file(),'NGINX_BINARY_UNKNOWN')
        self.tx.run([str(self.nginx),'-t','-p',prefix,'-c',str(config)])
        self.tx.run([str(self.nginx),'-p',prefix,'-c',str(config)])
        pid=int((folder/'nginx.pid').read_text());proc=pathlib.Path('/proc')/str(pid)
        require(str(folder).encode()in proc.joinpath('cmdline').read_bytes() and file_sha(proc/'exe')==file_sha(self.nginx),'SIDECAR_PROCESS_NOT_OWNED')
        self.sidecar={'folder':folder,'config':config,'pid':pid,'start':proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]}
        return {'ownNginxOnly':True,'port':13952}

    def stop_sidecar(self):
        if not self.sidecar:return {'alreadyStopped':True}
        s=self.sidecar;proc=pathlib.Path('/proc')/str(s['pid'])
        require(int((s['folder']/'nginx.pid').read_text())==s['pid'] and proc.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]==s['start'] and str(s['folder']).encode()in proc.joinpath('cmdline').read_bytes() and file_sha(proc/'exe')==file_sha(self.nginx),'SIDECAR_QUIT_IDENTITY_CHANGED')
        self.tx.run([str(self.nginx),'-p',str(s['folder'])+'/','-c',str(s['config']),'-s','quit'])
        for _ in range(40):
            if not (s['folder']/'nginx.pid').exists() and not self.tx.run(['ss','-H','-lntp','sport','=',':13952']).strip():self.sidecar=None;return {'ownNginxGracefullyQuit':True}
            time.sleep(.1)
        raise Hold('SIDECAR_QUIT_UNCONFIRMED')

    def install_private_config(self):
        self.closure_cas();self.free_port(13052)
        require(not CONF.exists() and not CONF.is_symlink() and CONF.parent.resolve()==CONF.parent,'CAPACITY_CONF_PATH_CHANGED')
        self.live_written=True  # A failed write/fsync may already have taken effect.
        fd=os.open(CONF,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
        with os.fdopen(fd,'wb')as out:out.write(private_server(13052));out.flush();os.fsync(out.fileno())
        directory=os.open(CONF.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(directory)
        finally:os.close(directory)
        self.tx.run(['nginx','-t'])
        after,files=self.closure();require(set(files)==set(self.before)|{str(CONF)} and files[str(CONF)]==private_server(13052),'CAPACITY_CLOSURE_ADDITION_MISMATCH')
        require(all(files[p]==raw for p,raw in self.before.items()),'EXISTING_PUBLIC_CONFIGURATION_CHANGED')
        self.after_dump,self.after_files=after,files
        self.tx.save('new-full-nginx.dump',after.encode())

    def regenerate_recovery(self):
        dump,files=self.closure();require(dump==self.after_dump and files==self.after_files,'POST_SWITCH_CLOSURE_CHANGED')
        selected=selected_public_servers(dump);folder=ROOT/'saas-emergency-gateway'
        spec={'kind':'saas-controlled-maintenance-recovery','expectedDumpSha256':sha(dump.encode()),'servers':selected,'restoreDatabase':False,'replayAcceptedTasks':False,'compatibleBusinessRollback':False}
        report=render(dump,spec,folder,source_files=files)
        patches={p['path']:(folder/p['after']).read_bytes()for p in report['patches']}
        require(str(CONF)not in patches,'INTERNAL_CALLBACK_MUST_SURVIVE_MAINTENANCE')
        syntax_check(self.tx,{**files,**patches},ROOT/'syntax-controlled-maintenance')
        old_path=pathlib.Path(self.runtime.get('controlledMaintenanceReport',{}).get('path',str(self.manifest_path.parent/'saas-emergency-gateway/report.json')))
        require(old_path.is_relative_to(ROOT.parent/R1) and old_path.is_file()and not old_path.is_symlink(),'EXISTING_R1_MAINTENANCE_REPORT_REQUIRED')
        old_raw=old_path.read_bytes();old=json.loads(old_raw);require(old['beforeDumpSha256']==self.manifest['gatewayDumpSha256'],'OLD_MAINTENANCE_REPORT_BINDING_CHANGED')
        self.tx.save('original-maintenance-report.json',old_raw)
        require(self.manifest_path.read_bytes()==self.manifest_raw,'CURRENT_MANIFEST_CAS_CHANGED')
        manifest={**self.manifest,'gatewayDumpSha256':sha(dump.encode())}
        controls._atomic_private(self.manifest_path,manifest)
        self.state['runtimeRecovery'].update(manifestSha256=sha(recovery.encoded(manifest)),controlledMaintenanceReport={'path':str(folder/'report.json'),'sha256':file_sha(folder/'report.json'),'gatewayDumpSha256':sha(dump.encode()),'supersedes':{'path':str(old_path),'sha256':sha(old_raw)},'compatibleBusinessRollback':False})
        self.manifest=manifest;self.persist()
        recovery.recovery_binding(self.state,manifest)
        require(SERVICE.read_bytes()==self.unit,'SUPERVISOR_UNIT_CHANGED')
        result=ReadOnlySupervisor(manifest,recovery.Adapter(self.tx,manifest)).once()
        self.tx.save('read-only-supervisor-check.json',{'passed':True,'web':result['web'],'worker':result['worker'],'restarted':False,'controlCommands':0})
        return {'maintenanceSyntaxPassed':True,'supervisorReadOnlyPassed':True}

    def run(self):
        try:
            self.guard.establish();self.guard.check('before-baseline')
            self.dump,self.before=self.closure();parsed=required_include(self.dump)
            require(sha(self.dump.encode())==self.manifest['gatewayDumpSha256'],'R1_FULL_GATEWAY_CHANGED')
            require(not CONF.exists()and not CONF.is_symlink(),'CAPACITY_CONF_ALREADY_EXISTS')
            self.free_port(13052);self.free_port(13952)
            self.real={p:pathlib.Path(p).resolve()for p in self.before}
            self.token,self.router=self.router_identity()
            configs=self.sql("SELECT json_build_object('model',(SELECT active_version::text FROM app_model_config_state WHERE singleton),'billing',(SELECT v FROM app_settings WHERE k='billing_config_version'));")
            require(configs==[{'model':'135','billing':'8'}],'R1_ACTIVE_CONFIGURATION_CHANGED')
            self.tx.save('original-canonical.private.json',self.original);self.tx.save('original-full-nginx.dump',self.dump.encode());self.tx.save('original-supervisor-manifest.private.json',self.manifest_raw);self.tx.save('original-supervisor.service',self.unit)
            self.tx.save('original-nginx-closure.private.json',{p:{'real':str(self.real[p]),'sha256':sha(raw),'bodyBase64':base64.b64encode(raw).decode()}for p,raw in self.before.items()})
            self.tx.save('router-source.json',self.router)
            cfg={**self.cfg,'authorization':AUTH,'predecessorReleaseId':R1,'recoveryMode':'saas-controlled-maintenance','restoreDatabase':False,'replayAcceptedTasks':False,'activateDisabledModels':False}
            self.record=normal.begin(self.state,cfg,{'path':str(ROOT/'original-canonical.private.json'),'sha256':sha(recovery.encoded(self.state)),'sha256Semantics':'logical-state-sha256','fileSha256':sha(self.original)},self.prior['incidentSha256'])
            self.record.update(kind='private-router-capacity-binding',operationId=str(uuid.uuid4()),
                appSource=APP_SOURCE,commit=APP_SOURCE,buildVersion='1792705393',operatorSource=self.cfg['operatorSource'],
                image=IMAGE,retired=[],newWebInstances=0,supervisorReinstalled=False,
                updatedAt=dt.datetime.now(dt.timezone.utc).isoformat())
            self.state.setdefault('normalBlueGreenReleases',{})[RELEASE]=self.record;self.persist()
            candidate={**self.before,str(CONF):private_server(13052)};syntax_check(self.tx,candidate,ROOT/'syntax-private-candidate')
            self.op('sidecar-start',self.start_sidecar)
            self.tx.save('sidecar-protocol.json',protocol_probe(13952,self.token));self.guard.check('sidecar-ready');self.phase('READY')
            self.guard.check('before-private-config');self.op('private-config-install',self.install_private_config)
            self.op('private-nginx-reload',lambda:self.tx.run(['systemctl','reload','nginx']))
            self.phase('SWITCHED');self.tx.save('live-protocol.json',protocol_probe(13052,self.token));self.guard.check('after-private-switch')
            listeners=self.tx.run(['ss','-H','-lntp','sport','=',':13052']).decode().splitlines()
            require(listeners and all(row.split()[3]=='127.0.0.1:13052'for row in listeners),'NON_LOOPBACK_CAPACITY_LISTENER')
            self.op('sidecar-graceful-quit',self.stop_sidecar)
            self.op('maintenance-and-current-manifest',self.regenerate_recovery)
            _,current_router=self.router_identity();require(current_router==self.router,'ROUTER_CHANGED_DURING_OPERATION')
            self.pin_slots();self.guard.check('final');self.phase('COMPLETE')
            receipt={'phase':'COMPLETE','kind':'private-router-capacity-binding','operationId':self.record['operationId'],
                'operations':{name:op['operationId']for name,op in self.record['operations'].items()},
                'appSource':APP_SOURCE,'operatorSource':self.cfg['operatorSource'],'newWebInstances':0,
                'routerRestarted':False,'supplierCalls':0,'leaseCommands':0,
                'revision':self.state['revision'],'canonicalFileSha256':self.disk,
                'callback':{'url':'http://127.0.0.1:13052'+CALLBACK,'upstream':'http://127.0.0.1:13114',
                    'configPath':str(CONF),'configSha256':file_sha(CONF)},
                'controlledMaintenanceReport':copy.deepcopy(self.state['runtimeRecovery']['controlledMaintenanceReport'])}
            self.tx.save('CAPACITY_BINDING_RECEIPT.json',receipt)
            return receipt
        except BaseException:
            if self.record is not None:
                self.record.update(phase='RECOVERY_REQUIRED',lastOperationResult='UNKNOWN',privateRouteMayBeEffective=self.live_written,
                    updatedAt=dt.datetime.now(dt.timezone.utc).isoformat())
                try:self.persist()
                except Exception:pass
            try:self.tx.save('CAPACITY_UNKNOWN.json',{'phase':'RECOVERY_REQUIRED','result':'UNKNOWN','privateRouteMayBeEffective':self.live_written,'rollbackAttempted':False})
            except Exception:pass
            try:self.guard.check('failure')
            except Exception:pass
            raise
        finally:
            if self.sidecar:
                try:self.stop_sidecar()
                except Exception:
                    try:self.tx.save('SIDECAR_CLEANUP_UNKNOWN.json',{'phase':'UNKNOWN','globalKill':False})
                    except Exception:pass


def main(path):
    cfg=json.loads(pathlib.Path(path).read_bytes());validate_config(cfg)
    with HostTransaction(TARGET,ctl.HOST,ROOT)as tx:
        result=CapacityBinding(tx,cfg).run();print(json.dumps(result))

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True,type=pathlib.Path)
    main(parser.parse_args().config)
