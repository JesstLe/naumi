#!/usr/bin/env python3
"""Isolated root/Linux preparation contract, simulated Docker/DB, no production host."""
import importlib.util,pathlib,tempfile,types,json,hashlib,tarfile,io,fcntl
spec=importlib.util.spec_from_file_location('prep',pathlib.Path(__file__).with_name('fleet-portal-prepare.py'));prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
source='1'*40;old='2'*40
config={'Env':['SOURCE_COMMIT='+source,'FLEET_PORTAL_ONLY=1'],'User':'node'}
calls=[]
image={'Id':'sha256:'+'3'*64,'Os':'linux','Architecture':'amd64','Config':config}
core={'Name':'/naumi-staging-app-1','Id':'core-id','Image':'old-image','Config':{'Env':['DATABASE_URL=postgres://fixture:fixture@db/fixture?sslmode=disable','SETTINGS_SECRET='+'x'*40]},'NetworkSettings':{'Networks':{'naumi-staging_default':{}}},'State':{'StartedAt':'original','Running':True}}
def command(args,timeout=120):
    calls.append(args)
    if args[:3]==['docker','ps','--format']:return b'naumi-staging-app-1\n'
    if args[:2]==['docker','inspect']:return json.dumps([core]).encode()
    if args[:3]==['docker','image','inspect']:return json.dumps([image]).encode()
    return b''
def request(port,path,method='GET'):
    if path=='/api/version':return 200,json.dumps({'commit':source if port==13062 else old,'version':'123'}).encode()
    return {'/api/admin/fleet':401,'/api/fleet/poll':400}.get(path,404),b'{}'
original_run=prep.subprocess.run
def run(args,**kw):
    calls.append(args)
    if 'pg_dump' in args:kw['stdout'].write(b'fixture-only-dump')
    return types.SimpleNamespace(returncode=0,stdout=b'')
prep.cmd=command;prep.request=request;prep.subprocess.run=run;prep.archive_ids=lambda *args:{image['Id']}
for file in ['/opt/naumi-staging/releases','/opt/naumi-reverse-hub/releases','/etc/nginx/sites-available']:pathlib.Path(file).mkdir(parents=True,exist_ok=True)
gateway=pathlib.Path('/etc/nginx/sites-available/default');gateway.write_text('ORIGINAL_GATEWAY')
with tempfile.TemporaryDirectory(prefix='portal-contract-',dir='/run') as tmp:
    root=pathlib.Path(tmp);archive=root/'image.tar';archive.write_bytes(b'fixture archive');args=types.SimpleNamespace(source=source,expected_site=old,archive=str(archive),archive_sha=prep.filehash(archive),image='naumi-fleet-portal:fixture',image_id=image['Id'],evidence=str(root/'success'))
    prep.main(args);result=json.loads((root/'success/prepared.json').read_text());assert result['publicChanged'] is False and result['adminAcceptance']=='pending';assert gateway.read_text()=='ORIGINAL_GATEWAY';assert (root/'success/portal.env').stat().st_mode&0o777==0o600
    assert not any('stop' in c or 'restart' in c or 'pg_restore' in c and '--list' not in c for c in calls)
    args.archive_sha='0'*64;calls.clear()
    try:prep.main(args);raise AssertionError('damaged archive accepted')
    except RuntimeError:pass
    assert not calls
    args.archive_sha=prep.filehash(archive);args.evidence=str(root/'busy');handle=open('/opt/naumi-staging/releases/deploy.lock','a');fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:prep.main(args);raise AssertionError('busy lock accepted')
    except BlockingIOError:pass
    handle.close();assert not calls
    args.evidence=str(root/'changed');args.expected_site='4'*40
    try:prep.main(args);raise AssertionError('baseline changed accepted')
    except RuntimeError:pass
    assert not any(c[:2]==['docker','load'] for c in calls)
print('FLEET_PORTAL_PREPARE_CONTRACT=PASS ROOT_ONLY=1 TWO_LOCKS=1 BAD_ARCHIVE_NO_DOCKER=1 BASELINE_GATE=1 READABLE_BACKUP=1 MINIMAL_ENV0600=1 LOOPBACK_ONLY=1 GENERATION_DENIED=1 OLD_SERVICES_RETAINED=1 PUBLIC_GATEWAY_UNCHANGED=1 SIMULATED_DOCKER_DB=1 PRODUCTION_WRITES=0')
