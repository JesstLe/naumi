#!/usr/bin/env python3
"""Actual fixed Next/PG startup recovery fixture; no suppliers or production."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import uuid

import release_runtime_recovery as recovery
from release47_controls import APP_REMOTE, _atomic_private


def run(argv):
    result = subprocess.run(argv, capture_output=True)
    if result.returncode:
        raise RuntimeError(str(argv[:3]) + ': ' + result.stderr.decode()[-1000:])
    return result.stdout


def wait(fn, label):
    for _ in range(90):
        try:
            result = fn()
            if result: return result
        except Exception: pass
        time.sleep(.5)
    raise RuntimeError('FIXTURE_TIMEOUT_' + label)


def main():
    parser = argparse.ArgumentParser()
    for name in ('image', 'postgres-image', 'commit', 'version', 'output'): parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    assert re.fullmatch('sha256:[a-f0-9]{64}', args.image) and re.fullmatch('sha256:[a-f0-9]{64}', args.postgres_image)
    assert re.fullmatch('[a-f0-9]{40}', args.commit) and re.fullmatch('[0-9]{10,13}', args.version)
    root = Path(args.output).resolve(); root.mkdir(mode=0o755, parents=True, exist_ok=False)
    state = root/'state'; state.mkdir(mode=0o700); os.chown(state,1001,1001)
    tag = uuid.uuid4().hex[:12]; app='video-recovery-app-'+tag; pg='video-recovery-pg-'+tag; network='video-recovery-'+tag
    label='io.naumi.recovery-fixture='+tag
    spec={'releaseId':'canvas-video-fusion-recovery-'+tag,'commit':args.commit,'buildVersion':args.version,'releaseSecret':'fixture-only-release-control-'+tag}
    web={'name':app}; recovery.install_launcher(state,release_id=spec['releaseId'],commit=args.commit,version=args.version,instance=app)
    created=[]; network_created=False
    def status():return json.loads(run(['docker','exec','-e','NODE_OPTIONS=',app,'node','--input-type=module','-e',APP_REMOTE,'null']))
    def marker(enabled):
        recovery.write_activation(state/'activation.json',recovery.activation_marker(spec,web,enabled))
    def restart():
        run(['docker','stop','-t','15',app]);run(['docker','start',app]);return wait(status,'STATUS')
    def crash_restart(previous):
        before=json.loads(run(['docker','inspect',app]))[0]
        assert before['Id']==cid and before['Image']==args.image and before['Config']['Labels'].get('io.naumi.recovery-fixture')==tag
        pid=before['State']['Pid'];assert pid>1 and Path('/proc/'+str(pid)+'/exe').resolve().name=='node'
        # pidfd binds this exact synthetic process; it cannot signal a reused PID.
        fd=os.pidfd_open(pid)
        try:
            observed=json.loads(run(['docker','inspect',app]))[0]
            assert observed['Id']==cid and observed['State']['Pid']==pid and observed['State']['Running']
            signal.pidfd_send_signal(fd,signal.SIGKILL)
        finally:os.close(fd)
        def next_boot():
            current=status()
            return current if current['identity']['bootId']!=previous['identity']['bootId'] else None
        current=wait(next_boot,'AUTOMATIC_NEXT_BOOT')
        after=json.loads(run(['docker','inspect',app]))[0]
        assert after['Id']==cid and after['RestartCount']>before['RestartCount'] and not after['State']['OOMKilled']
        return current
    try:
        run(['docker','network','create','--internal',network]);network_created=True
        created.append(pg)
        run(['docker','run','-d','--name',pg,'--label',label,'--network',network,'--memory','192m','--memory-swap','192m',
             '-e','POSTGRES_USER=fixture','-e','POSTGRES_PASSWORD=fixture-only-recovery','-e','POSTGRES_DB=recovery',args.postgres_image,
             'postgres','-c','shared_buffers=24MB','-c','max_connections=32'])
        wait(lambda:subprocess.run(['docker','exec',pg,'pg_isready','-U','fixture','-d','recovery'],capture_output=True).returncode==0,'PG')
        env={'DATABASE_URL':'postgresql://fixture:fixture-only-recovery@'+pg+':5432/recovery?sslmode=disable',
             'SETTINGS_SECRET':'fixture-only-settings-recovery-key-'+tag,'VIDEO_WORKER_SECRET':'fixture-only-worker-recovery-key-'+tag,
             'RELEASE_CONTROL_SECRET':spec['releaseSecret'],'SOURCE_COMMIT':args.commit,'BUILD_VERSION':args.version,
             'NAUMI_INSTANCE_ID':app,'NAUMI_RELEASE_RUNTIME':'1','NAUMI_RELEASE_ADMISSION_START':'draining','NAUMI_RELEASE_PEERS':'{}',
             'NODE_OPTIONS':'--max-old-space-size=512 --require=/app/scripts/release-http-observer.cjs','NAUMI_VIDEO_WORKER':'0',
             'HOSTNAME':'0.0.0.0','PORT':'3000','NAUMI_MULTI_USER':'1','INTERNAL_APP_ORIGIN':'http://127.0.0.1:3000',
             'AGENT_API_KEY':'','OPENAI_API_KEY':'','NEW_API_IMAGE_API_KEY':'','VIDEO_API_KEY':'','NEXT_TELEMETRY_DISABLED':'1'}
        command=['docker','run','-d','--name',app,'--label',label,'--network',network,'--memory','896m','--memory-swap','896m',
                 '--cpus','1.5','--pids-limit','192','--mount','type=bind,src='+str(state)+',dst=/release-state','--entrypoint','/release-state/launch.sh']
        for key,value in env.items():command += ['-e',key+'='+value]
        created.append(app);run(command+[args.image,'node','server.js'])
        first=wait(status,'FIRST_STATUS');assert first['admission']['mode']=='draining'
        assert first['identity']['commit']==args.commit and first['transport']['verified'] is True
        cid=json.loads(run(['docker','inspect',app]))[0]['Id']
        marker(True);run(['docker','update','--restart=unless-stopped',app])
        opened=crash_restart(first);assert opened['admission']['mode']=='open' and opened['identity']['bootId']!=first['identity']['bootId']
        # An old accepted-work lease remains unknown after a subsequent boot;
        # startup recovery must never clear it to obtain a healthy-looking zero.
        activity=str(uuid.uuid4());identity=opened['identity']
        sql="INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,state,work_scope,work_key,admission_key) VALUES('"+activity+"','"+app+"','"+identity['bootId']+"','"+str(uuid.uuid4())+"','accepted-work','active','media-job','fixture-only-original-work','fixture-only-original-work');"
        run(['docker','exec',pg,'psql','-v','ON_ERROR_STOP=1','-U','fixture','-d','recovery','-c',sql])
        recovered=crash_restart(opened);assert recovered['admission']['mode']=='open' and recovered['observations']['unknownLeases']==1
        marker(False);run(['docker','update','--restart=no',app]);disarmed=restart()
        assert disarmed['admission']['mode']=='draining' and disarmed['observations']['unknownLeases']==1
        # A malformed authenticated marker must fail before Next starts.
        broken=recovery.activation_marker(spec,web,True);broken['signature']='0'*64
        recovery.write_activation(state/'activation.json',broken)
        run(['docker','stop','-t','15',app]);run(['docker','start',app])
        wait(lambda:json.loads(run(['docker','inspect',app]))[0]['State']['Status']=='exited','INVALID_MARKER_EXIT')
        info=json.loads(run(['docker','inspect',app]))[0]
        assert info['Id']==cid and info['Image']==args.image and info['State']['ExitCode']!=0 and not info['State']['OOMKilled']
        logs=subprocess.run(['docker','logs',app],capture_output=True);assert b'RELEASE_STARTUP_ADMISSION_INVALID' in logs.stdout+logs.stderr
        retained=run(['docker','exec',pg,'psql','-U','fixture','-d','recovery','-At','-c',"SELECT state FROM app_release_activities WHERE id='"+activity+"';"]).decode().strip()
        assert retained=='active'
        result={'result':'PASS','image':args.image,'commit':args.commit,'version':args.version,'containerId':cid,
                'initialBoot':first['identity']['bootId'],'openBoot':opened['identity']['bootId'],'recoveredBoot':recovered['identity']['bootId'],
                'disarmedBoot':disarmed['identity']['bootId'],'initialDraining':True,'restartOpen':True,'restartDisarmed':True,
                'unknownLeasePreserved':True,'invalidSignatureRefusedBeforeNext':True,'productionConnections':0,'supplierCalls':0}
        result['unexpectedProcessExitsAutomaticallyRecovered']=2
        (root/'RESULT.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
    finally:
        for name in reversed(created):
            observed=subprocess.run(['docker','inspect',name],capture_output=True)
            if observed.returncode==0:
                row=json.loads(observed.stdout)[0];assert row['Config']['Labels'].get('io.naumi.recovery-fixture')==tag
                run(['docker','rm','-f','-v',row['Id']])
        if network_created:run(['docker','network','rm',network])


if __name__=='__main__':main()
