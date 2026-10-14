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
    receipt_e=root/'receipt';receipt_e.mkdir();count=[0]
    previous_execute=executor.execute
    def accepted_once(config,job,evidence):
        count[0]+=1
        return {'planId':job['id'],'leaseId':job['leaseId'],'state':'accepted','code':'OK','source':source,'version':'123','evidenceSha':'a'*64}
    executor.execute=accepted_once
    executor.run_once(c,job,receipt_e);executor.run_once(c,job,receipt_e)
    assert count[0]==1 and pathlib.Path(c['outbox'],job['id']+'.json').stat().st_mode&0o777==0o640
    interrupted=root/'interrupted';interrupted.mkdir();executor.atomic_json(interrupted/'started.json',{})
    executor.run_once(c,job,interrupted);assert count[0]==1 and executor.read_json(interrupted/'result.json')['code']=='UNKNOWN'
    executor.execute=previous_execute
print('FLEET_EXECUTOR_CONTRACT=PASS SIGNATURE_SCOPE=1 ROOT_PATHS=1 HOOK_HASH=1 NAS_GATE=1 TWO_LOCKS=1 BASELINE_PIN=1 BACKUP_GATE=1 PRE_POST_ACCEPT=1 WORKER_GATE=1 ROLLBACK_FILES=1 CONFIG_RETAINED=1 OLD_SLOTS_RETAINED=1 NEXT_RELEASE_PORTS=1 RECEIPT_ONCE=1 INTERRUPTED_UNKNOWN=1 SIMULATED_DOCKER=1 PRODUCTION_WRITES=0')
