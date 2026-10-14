#!/usr/bin/env python3
"""Isolated executor state/gate/rollback contract; no production host or Docker daemon."""
import hashlib,importlib.util,json,pathlib,tempfile,time,uuid,fcntl,subprocess,socket

spec=importlib.util.spec_from_file_location('executor',pathlib.Path(__file__).with_name('fleet-release-executor.py'))
executor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(executor)
source='1'*40
instance=str(uuid.uuid4())
manifest={'schemaVersion':1,'sourceCommit':source,'buildVersion':123,'platform':'linux/amd64','mediaVariants':True,'provenance':{'repository':'JesstLe/naumi','workflowCommit':'2'*40,'runId':'1','attempt':'1'},'images':{}}
for flavor,digit in [('ui','a'),('desktop','b'),('enterprise','c')]:
    manifest['images'][flavor]={'reference':'ghcr.io/jesstle/naumi@sha256:'+digit*64,'digest':'sha256:'+digit*64,'tag':'ghcr.io/jesstle/naumi:'+source+('' if flavor=='ui' else '-'+flavor),'imageId':'sha256:'+digit*64}

def fixture(root):
    root.mkdir()
    config={'enabled':True,'nasAccepted':True,'instanceId':instance,'inbox':str(root/'inbox'),'outbox':str(root/'outbox'),'statusFile':str(root/'outbox'/'active-status.json'),'stateDir':str(root/'evidence'),'publicKeyFile':str(root/'public.pem'),'activeState':str(root/'active.json'),'envFile':str(root/'env'),'gatewayFile':str(root/'gateway'),'gatewayTemplate':str(root/'template'),'locks':[str(root/'deploy.lock'),str(root/'hub.lock')],'network':'fixture-net','containerPrefix':'fixture-release','candidatePortRange':[13101,13200],'mounts':[],'hooks':{}}
    (root/'inbox').mkdir();(root/'outbox').mkdir();(root/'token').write_text('x'*43);(root/'env').write_text('SETTINGS_SECRET=fixture-not-production\n');(root/'gateway').write_text('ORIGINAL_GATEWAY');(root/'template').write_text(' '.join('{{'+f+'}} {{OLD_'+f+'}}' for f in ['UI','DESKTOP','ENTERPRISE']))
    state={'sourceCommit':'0'*40,'buildVersion':1,'slots':{f:{'container':'old-'+f,'containerId':'old-'+f+'-id','imageId':'sha256:'+'d'*64,'port':13001+i} for i,f in enumerate(['ui','desktop','enterprise'])}}
    executor.atomic_json(config['activeState'],state)
    for key in ['tokenFile','activeState','envFile','gatewayFile','gatewayTemplate']:
        if key in config:pathlib.Path(config[key]).chmod(0o600)
    subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(root/'private.pem')],check=True,capture_output=True)
    subprocess.run(['openssl','pkey','-in',str(root/'private.pem'),'-pubout','-out',str(root/'public.pem')],check=True,capture_output=True)
    job={'id':str(uuid.uuid4()),'instanceId':instance,'leaseId':str(uuid.uuid4()),'expiresAt':int(time.time()*1000)+300000,'baseSource':'0'*40,'baseVersion':'1','manifest':manifest}
    payload=json.dumps(job,separators=(',',':'));(root/'message').write_text(payload);subprocess.run(['openssl','pkeyutl','-sign','-rawin','-inkey',str(root/'private.pem'),'-in',str(root/'message'),'-out',str(root/'signature')],check=True,capture_output=True);envelope={'payload':payload,'signature':(root/'signature').read_bytes().hex()};executor.atomic_json(root/'inbox'/ (job['id']+'.json'),envelope);executor.atomic_json(root/'config.json',config)
    return config,state,job,envelope

calls=[]
def command(args,timeout=120):
    calls.append(args)
    if args[0]=='openssl':
        try:return subprocess.run(args,check=True,capture_output=True).stdout.decode()
        except subprocess.CalledProcessError:raise executor.GateError('CHECK_FAILED')
    if args[:2]==['docker','inspect']:
        name=args[2];return json.dumps([{'Id':name+'-id','Image':'sha256:'+'d'*64}])
    if args[:3]==['docker','image','inspect']:
        ref=args[3];flavor=next(f for f,row in manifest['images'].items() if row['reference']==ref);return json.dumps([{'Id':manifest['images'][flavor]['imageId'],'Os':'linux','Architecture':'amd64','RepoDigests':[ref],'Config':{'Env':['SOURCE_COMMIT='+source,'BUILD_VERSION=123'],'Labels':{'io.naumi.build.flavor':flavor,'org.opencontainers.image.revision':source}}}])
    if args[:2]==['docker','run']:
        assert '-e' in args and 'NAUMI_VIDEO_WORKER=0' in args
        return 'candidate-id'
    return ''

def hook(config,name,evidence,job_file):
    result={'ok':True,'backwardCompatible':True,'nasE2E':True,'nginxSyntax':True,'publicE2E':True,'inflightPreserved':True,'oldVersionServing':True}
    if 'storageDriver' in config:
        result.update(storageE2E=True, storageDriver=config['storageDriver'])
    result.update(config.get('preacceptOverride', {}) if name == 'preaccept' else {})
    if name=='backup':
        dump=evidence/'database.dump';dump.write_bytes(b'fixture-dump');result['databaseDump']=str(dump)
    if name==config.get('failAt'):
        raise executor.GateError('CHECK_FAILED')
    return result

executor.command=command
executor.hook=hook
executor.version=lambda *args,**kw: None
real_validate_hooks=executor.validate_hooks
executor.validate_hooks=lambda config: None

with tempfile.TemporaryDirectory(prefix='naumi-executor-',dir='/run') as directory:
    root=pathlib.Path(directory)
    c,state,job,envelope=fixture(root/'success');e=pathlib.Path(c['stateDir'])/job['id'];e.mkdir(parents=True);result=executor.execute(c,job,e);assert result['state']=='accepted';assert executor.read_json(c['activeState'])['sourceCommit']==source;assert pathlib.Path(c['envFile']).read_text().startswith('SETTINGS_SECRET=fixture');assert not any(a[:2] in [['docker','stop'],['docker','rm']] for a in calls)
    assert executor.verified_job(envelope,c['publicKeyFile'],instance)['id']==job['id']
    public=pathlib.Path(c['publicKeyFile']);public.chmod(0o666)
    try:executor.verified_job(envelope,c['publicKeyFile'],instance);raise AssertionError('writable public key accepted')
    except executor.GateError:pass
    public.chmod(0o600)
    try:real_validate_hooks(c);raise AssertionError('missing hooks accepted')
    except executor.GateError:pass
    script=root/'checked-hook';script.write_text('#!/bin/sh\necho checked\n');script.chmod(0o700)
    c['hooks']={name:{'path':str(script),'sha256':hashlib.sha256(script.read_bytes()).hexdigest()} for name in ['backup','compatibility','preaccept','gatewaytest','postaccept','workers','rollbackcheck']}
    real_validate_hooks(c);script.write_text('#!/bin/sh\necho changed\n')
    try:real_validate_hooks(c);raise AssertionError('changed hooks accepted')
    except executor.GateError:pass
    unsafe_parent=root/'unsafe-parent';unsafe_parent.mkdir();unsafe_parent.chmod(0o777);inside=unsafe_parent/'file';inside.write_text('fixture');inside.chmod(0o600)
    try:executor.protected_path(inside);raise AssertionError('writable parent accepted')
    except executor.GateError:pass
    try:executor.verified_job({**envelope,'signature':'0'*128},c['publicKeyFile'],instance);raise AssertionError('tamper accepted')
    except executor.GateError:pass
    try:executor.verified_job(envelope,c['publicKeyFile'],str(uuid.uuid4()));raise AssertionError('scope accepted')
    except executor.GateError:pass
    for stage in ['preaccept','gatewaytest','postaccept','workers']:
        c,state,job,_=fixture(root/stage);c['failAt']=stage;e=pathlib.Path(c['stateDir'])/job['id'];e.mkdir(parents=True)
        try:executor.execute(c,job,e);raise AssertionError(stage+' unexpectedly succeeded')
        except executor.GateError:pass
        assert pathlib.Path(c['gatewayFile']).read_text()=='ORIGINAL_GATEWAY',stage
        assert executor.read_json(c['activeState'])==state,stage
    c,state,job,_=fixture(root/'nas-missing');c['nasAccepted']=False;e=pathlib.Path(c['stateDir'])/job['id'];e.mkdir(parents=True)
    try:executor.execute(c,job,e);raise AssertionError('NAS accepted without evidence')
    except executor.GateError as error:assert error.code=='GATE_MISSING'
    def local_fixture(name):
        c,state,job,_=fixture(root/name)
        c.pop('nasAccepted');c.update(storageDriver='local',storageAccepted=True)
        media=root/name/'media';media.mkdir()
        c['mounts']=[{'source':str(media),'target':'/data/media','readOnly':False}]
        pathlib.Path(c['envFile']).write_text('STORAGE_DRIVER=local\nMEDIA_PRIVATE=1\nMEDIA_DIR=/data/media\n')
        e=pathlib.Path(c['stateDir'])/job['id'];e.mkdir(parents=True)
        return c,state,job,e
    c,state,job,e=local_fixture('local-success')
    assert executor.execute(c,job,e)['state']=='accepted'
    c,state,job,e=local_fixture('local-with-stale-remote')
    c['mounts'].append({'source':str(root/'local-with-stale-remote'),'target':'/data','readOnly':False})
    with open(c['envFile'],'a') as f:f.write('R2_ACCOUNT_ID=fixture\nR2_BUCKET=fixture\nR2_ACCESS_KEY_ID=fixture\nR2_SECRET_ACCESS_KEY=fixture\n')
    assert executor.execute(c,job,e)['state']=='accepted'
    def reject_storage(name,change):
        c,state,job,e=local_fixture(name);change(c)
        before=len(calls)
        try:executor.execute(c,job,e);raise AssertionError(name+' accepted')
        except executor.GateError as error:assert error.code=='GATE_MISSING'
        assert len(calls)==before and pathlib.Path(c['gatewayFile']).read_text()=='ORIGINAL_GATEWAY'
    reject_storage('unaccepted-local',lambda c:c.update(storageAccepted=False))
    reject_storage('string-accepted',lambda c:c.update(storageAccepted='true'))
    reject_storage('missing-driver',lambda c:c.pop('storageDriver'))
    reject_storage('unknown-driver',lambda c:c.update(storageDriver='nas'))
    reject_storage('driver-mismatch',lambda c:c.update(storageDriver='s3'))
    reject_storage('missing-media-bind',lambda c:c.update(mounts=[]))
    reject_storage('readonly-media-bind',lambda c:c['mounts'][0].update(readOnly=True))
    reject_storage('overlapping-media-bind',lambda c:c['mounts'].append({'source':c['mounts'][0]['source'],'target':'/data/media/sub','readOnly':False}))
    reject_storage('nonprivate-local',lambda c:pathlib.Path(c['envFile']).write_text('STORAGE_DRIVER=local\nMEDIA_PRIVATE=0\nMEDIA_DIR=/data/media\n'))
    reject_storage('duplicate-driver',lambda c:pathlib.Path(c['envFile']).write_text('STORAGE_DRIVER=local\nSTORAGE_DRIVER=s3\nMEDIA_PRIVATE=1\nMEDIA_DIR=/data/media\n'))
    for name,overrides in [('missing-proof',{'storageE2E':None}),('wrong-proof-driver',{'storageDriver':'s3'}),('nas-is-not-local-proof',{'storageE2E':False,'nasE2E':True})]:
        c,state,job,e=local_fixture(name);c['preacceptOverride']=overrides
        try:executor.execute(c,job,e);raise AssertionError(name+' accepted')
        except executor.GateError:pass
        assert pathlib.Path(c['gatewayFile']).read_text()=='ORIGINAL_GATEWAY'
    c,state,job,e=local_fixture('s3-explicit')
    c['storageDriver']='s3';pathlib.Path(c['envFile']).write_text('STORAGE_DRIVER=s3\nMEDIA_PRIVATE=1\nMEDIA_DIR=/data/media\n')
    assert executor.execute(c,job,e)['state']=='accepted'
    c,state,job,_=fixture(root/'busy');handle=open(c['locks'][0],'a');fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:
        with executor.locks(c['locks']):raise AssertionError('stole lock')
    except executor.GateError as error:assert error.code=='LOCK_BUSY'
    handle.close()
    ports=executor.candidate_ports(c,state)
    assert executor.ensure_gateway('{{UI}} {{OLD_UI}} {{DESKTOP}} {{OLD_DESKTOP}} {{ENTERPRISE}} {{OLD_ENTERPRISE}}',ports,{f:13000+i for i,f in enumerate(['ui','desktop','enterprise'])}).count('{{')==0
    with socket.socket() as busy:
        busy.bind(('127.0.0.1',ports['ui']))
        next_ports=executor.candidate_ports(c,{'slots':{f:{'port':p} for f,p in ports.items()}})
        assert set(next_ports.values()).isdisjoint(ports.values())
    c['candidatePortRange']=[13101,13103]
    try:executor.candidate_ports(c,{'slots':{f:{'port':13101+i} for i,f in enumerate(['ui','desktop','enterprise'])}});raise AssertionError('ports reused')
    except executor.GateError:pass
    c['candidatePortRange']=[13101,13200]
    unsafe=root/'unsafe.lock';unsafe.write_text('');unsafe.chmod(0o666)
    try:
        with executor.locks([str(unsafe)]):raise AssertionError('unsafe lock accepted')
    except executor.GateError:pass
    receipt_e=pathlib.Path(c['stateDir'])/job['id'];receipt_e.mkdir(parents=True);count=[0]
    previous_execute=executor.execute
    def accepted_once(config,job,evidence):
        count[0]+=1
        return {'planId':job['id'],'leaseId':job['leaseId'],'state':'accepted','code':'OK','source':source,'version':'123','evidenceSha':'a'*64}
    executor.execute=accepted_once
    executor.run_once(c,job,receipt_e);executor.run_once(c,job,receipt_e)
    assert count[0]==1 and pathlib.Path(c['outbox'],job['id']+'.json').stat().st_mode&0o777==0o640
    interrupted=root/'interrupted';interrupted.mkdir();executor.atomic_json(interrupted/'started.json',{})
    executor.run_once(c,job,interrupted);assert count[0]==1 and executor.read_json(interrupted/'result.json')['code']=='UNKNOWN'
    unknown=pathlib.Path(c['stateDir'])/str(uuid.uuid4());unknown.mkdir();executor.atomic_json(unknown/'started.json',{})
    newer={**job,'id':str(uuid.uuid4()),'leaseId':str(uuid.uuid4())};new_e=pathlib.Path(c['stateDir'])/newer['id'];new_e.mkdir()
    executor.run_once(c,newer,new_e);assert count[0]==1 and executor.read_json(new_e/'result.json')['code']=='UNKNOWN';assert not (new_e/'started.json').exists()
    executor.atomic_json(unknown/'result.json',{'state':'blocked','code':'UNKNOWN'})
    try:executor.assert_no_unconfirmed(c,newer['id']);raise AssertionError('unknown root receipt bypassed')
    except executor.GateError as error:assert error.code=='UNKNOWN'
    executor.atomic_json(unknown/'result.json',{'state':'failed','code':'CHECK_FAILED'})
    executor.assert_no_unconfirmed(c,newer['id'])
    executor.execute=previous_execute
print('FLEET_EXECUTOR_CONTRACT=PASS SIGNATURE_SCOPE=1 ROOT_PATHS=1 HOOK_HASH=1 NAS_GATE=1 LOCAL_STORAGE_GATE=1 PERSISTENT_PRIVATE_MEDIA=1 DRIVER_MATCH=1 TWO_LOCKS=1 BASELINE_PIN=1 BACKUP_GATE=1 PRE_POST_ACCEPT=1 WORKER_GATE=1 ROLLBACK_FILES=1 CONFIG_RETAINED=1 OLD_SLOTS_RETAINED=1 NEXT_RELEASE_PORTS=1 RECEIPT_ONCE=1 INTERRUPTED_UNKNOWN=1 ROOT_UNCONFIRMED_GATE=1 RELAY_ACK_CANNOT_CLEAR_ROOT=1 SIMULATED_DOCKER=1 PRODUCTION_WRITES=0')
