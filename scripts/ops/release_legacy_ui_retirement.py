#!/usr/bin/env python3
"""Bounded explicit maintenance retirement, not ordinary complete-drain.

CLI is OFFLINE audit only. A lock-owning HostTransaction caller may explicitly
invoke retire_one for one pinned CID. No discovery-based stop, batch execution,
SIGKILL fallback, DB restore, gateway switch or synthetic drain receipt exists.
Current six historical UI documents alone produce UNPROVEN_VOLATILE_WORK.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import time


class RetirementHold(ValueError): pass


def require(value, reason):
    if not value: raise RetirementHold(reason)


def digest(data):return hashlib.sha256(data).hexdigest()


def encoded(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


def artifact(root, descriptor):
    root=Path(root).resolve();relative=descriptor['path']
    require(not Path(relative).is_absolute() and '..' not in Path(relative).parts,'ARTIFACT_PATH')
    path=root/relative
    require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),'ARTIFACT_MISSING')
    raw=path.read_bytes();require(digest(raw)==descriptor['sha256'],'ARTIFACT_HASH_CHANGED')
    return raw


def identity(row):
    return {'id':row['Id'],'name':row['Name'].lstrip('/'),'image':row['Image'],'startedAt':row['State']['StartedAt']}


def immutable(row):
    # No secret values are emitted: env/network/mount/Cmd bindings use hashes.
    return digest(encoded({key:row.get(key) for key in ('Id','Image','Config','Mounts')}))


def network_binding(row):
    return digest(encoded(row['NetworkSettings']['Networks']))


def audit(manifest, observations, root):
    """No booleans called 'drain complete': every failure preserves the process.

    Historical role proof is an immutable route+network-policy lifetime chain,
    not prose saying the operator believes no Agent ever ran.
    """
    reasons=[]
    def check(condition, reason):
        if not condition:reasons.append(reason)
    check(manifest.get('schemaVersion')==1 and manifest.get('target') in ('47.105.59.142','103.30.76.93'),'FIXED_HOST_REQUIRED')
    pin=manifest.get('identity',{})
    check(bool(re.fullmatch('[a-f0-9]{64}',pin.get('id',''))) and bool(re.fullmatch('sha256:[a-f0-9]{64}',pin.get('image',''))),'FIXED_CID_IMAGE_REQUIRED')
    authorization=manifest.get('authorization',{})
    check(authorization.get('kind')=='explicit-one-time-maintenance-retirement' and authorization.get('containerId')==pin.get('id') and bool(authorization.get('userRequestSha256')),'EXPLICIT_SINGLE_CID_AUTHORIZATION_REQUIRED')
    try:
        expires=datetime.datetime.fromisoformat(authorization['expiresAt'].replace('Z','+00:00'))
        check(datetime.datetime.now(datetime.timezone.utc)<=expires,'MAINTENANCE_AUTHORIZATION_EXPIRED')
    except (KeyError,ValueError,TypeError):reasons.append('MAINTENANCE_AUTHORIZATION_EXPIRED')
    check(manifest.get('legacyCoverage')=='partial-nonpersisted-observation' and manifest.get('ordinaryDrainReceipt') is None,'DO_NOT_SYNTHESIZE_COMPLETE_DRAIN')
    try:
        gateway=json.loads(artifact(root,manifest['maintenance']['report']))
        check(gateway.get('runtimeTopology') in ('unified-web-three-ui','three-web-three-ui') and gateway.get('kind') in ('103-maintenance-gateway','47-maintenance-gateway'),'FILE_STATIC_MAINTENANCE_REPORT_REQUIRED')
        check(len(manifest['maintenance'].get('staticAssets',[]))>0,'FULL_STATIC_COVERAGE_REQUIRED')
        check(manifest['maintenance'].get('allOriginalUrls')==sorted(row['url'] for row in manifest['maintenance'].get('staticAssets',[])),'FULL_STATIC_COVERAGE_REQUIRED')
        original_static=json.loads(artifact(root,manifest['maintenance']['originalStaticManifest']))
        provided={row['url']:row['file']['sha256'] for row in manifest['maintenance'].get('staticAssets',[])}
        check(provided=={row['url']:row['sha256'] for row in original_static['assets']},'FULL_STATIC_COVERAGE_REQUIRED')
        for row in manifest['maintenance'].get('staticAssets',[]):artifact(root,row['file'])
        route_evidence=json.loads(artifact(root,manifest['roleEvidence']))
        # These are data artifacts for external review, NOT a caller boolean
        # such as role=ui_only. Every network/route epoch must begin at creation.
        check(route_evidence.get('containerId')==pin.get('id') and route_evidence.get('image')==pin.get('image'),'ROLE_EVIDENCE_IDENTITY')
        epochs=route_evidence.get('epochs',[])
        check(bool(epochs) and epochs[0].get('from')==pin.get('startedAt'),'UNPROVEN_VOLATILE_WORK')
        previous=None
        for epoch in epochs:
            check(previous is None or epoch.get('from')==previous,'UNPROVEN_VOLATILE_WORK')
            previous=epoch.get('to')
            routes=json.loads(artifact(root,epoch['routeAllowlist']))
            network=json.loads(artifact(root,epoch['ingressPolicy']))
            source=json.loads(artifact(root,epoch['sourceTimerAudit']))
            check(routes.get('containerId')==pin.get('id') and routes.get('onlyReviewedReadMethods') is True and routes.get('unsafeApiRoutes')==[],'UNPROVEN_VOLATILE_WORK')
            check(network.get('defaultDeny') is True and network.get('onlyIngress')==['reviewed-nginx'] and network.get('otherNetworkCallers')==[] and network.get('directHostAccess')=='enforced-deny','UNPROVEN_VOLATILE_WORK')
            check(source.get('image')==pin.get('image') and source.get('videoTimerDisabled') is True and source.get('otherAutonomousTimers')==[] and source.get('agentOrTaskStartupPaths')==[],'UNPROVEN_VOLATILE_WORK')
            app_paths=json.loads(artifact(root,source['actualAppPathsManifest']))
            actions=json.loads(artifact(root,source['actualServerActionsManifest']))
            readonly={'/api/health/route','/api/version/route'}
            check(all(not key.startswith('/api/') or key in readonly for key in app_paths),'UNPROVEN_VOLATILE_WORK')
            check(actions.get('node')=={} and actions.get('edge')=={},'UNPROVEN_VOLATILE_WORK')
            check(source.get('moduleGraphCoverage')=='entire-executable-startup-and-route-closure' and source.get('unresolvedDynamicImports')==[] and bool(source.get('moduleFiles')),'UNPROVEN_VOLATILE_WORK')
            for descriptor in source.get('moduleFiles',[]):
                code=artifact(root,descriptor).decode('utf-8')
                check(re.search(r'\b(setInterval|setTimeout|startVideoWorker|startWorker|runAgent|spawn|fork|execFile)\b',code) is None,'UNPROVEN_VOLATILE_WORK')
            policy_raw=artifact(root,network['enforcedPolicyBytes']).decode('utf-8')
            check(all(token in policy_raw for token in ('default-deny','GET','HEAD')) and bool(routes.get('originalDeploymentRecords')),'UNPROVEN_VOLATILE_WORK')
            for descriptor in routes.get('originalDeploymentRecords',[]):artifact(root,descriptor)
        check(previous==route_evidence.get('observedThrough') and len(observations)==2 and previous==observations[-1].get('observedAt'),'UNPROVEN_VOLATILE_WORK')
    except (KeyError,ValueError,TypeError,OSError):reasons.append('UNPROVEN_VOLATILE_WORK')
    if len(observations)!=2:reasons.append('TWO_REAL_OBSERVATIONS_REQUIRED')
    else:
        first,second=observations
        check(type(first.get('monotonicNs')) is int and type(second.get('monotonicNs')) is int and second['monotonicNs']-first['monotonicNs']>=30_000_000_000,'OBSERVATION_INTERVAL_UNDER_30S')
        for obs in observations:
            check(obs.get('identity')==pin and obs.get('immutableSha256')==manifest.get('immutableSha256'),'CONTAINER_BASELINE_CHANGED')
            check(obs.get('networkSha256')==manifest.get('networkSha256'),'NETWORK_BINDING_CHANGED')
            check(obs.get('maintenanceDumpSha256')==manifest['maintenance'].get('dumpSha256'),'MAINTENANCE_NOT_CURRENT')
            check(obs.get('staticHashesVerified') is True,'STATIC_COVERAGE_NOT_VERIFIED')
            check(obs.get('cmd')==['node','server.js'] and obs.get('videoWorker')=='0' and obs.get('sourceTimersMatch') is True,'WEB_ROLE_NOT_PROVEN')
            check(obs.get('processTree')==['node server.js'],'UNPROVEN_VOLATILE_WORK')
            check(obs.get('socketNonIdle')==[] and obs.get('socketCoverage')=='all-target-network-namespace','NONIDLE_OR_UNKNOWN_SOCKET')
            check(obs.get('databaseCoverage')=='all-target-container-ips-and-application-identities' and obs.get('databaseActiveOrTransactions')==[],'ACTIVE_OR_UNATTRIBUTED_DATABASE_WORK')
            check(obs.get('referenceCoverage')=='all-docker-effective-systemd-internal-configs' and obs.get('references')==[],'REFERENCES_NOT_CLOSED')
            check(bool(obs.get('rawEvidence')),'RAW_OBSERVATION_EVIDENCE_REQUIRED')
            for descriptor in obs.get('rawEvidence',[]):
                try:artifact(root,descriptor)
                except (ValueError,KeyError,OSError):reasons.append('RAW_OBSERVATION_EVIDENCE_REQUIRED')
            proof=obs.get('taskProof',{})
            check(proof.get('coverage')=='complete-persisted-ownership' and proof.get('targetOwnedAcceptedTasks')==[] and proof.get('targetOwnedAgentSessions')==[] and proof.get('unknownOwnership')==[],'UNPROVEN_VOLATILE_WORK')
        check(first.get('taskProof',{}).get('preservationSha256')==second.get('taskProof',{}).get('preservationSha256') and bool(first.get('taskProof',{}).get('preservationSha256')),'TASK_PROOF_CHANGED')
    return {'status':'ELIGIBLE_FOR_EXPLICIT_MAINTENANCE_RETIREMENT' if not reasons else 'HOLD','reasons':sorted(set(reasons)),'identity':pin,'legacyCoverage':'partial-nonpersisted-observation','ordinaryDrainReceipt':None,'acceptedTasksInferredFromSockets':False,'automaticStop':False,'productionWrites':0}


def require_lock(tx, manifest):
    require(getattr(tx,'stack',None) is not None and getattr(tx,'target',None)==manifest['target'] and bool(getattr(tx,'lock_fds',[])),'ORIGINAL_HOST_TRANSACTION_LOCK_REQUIRED')
    require(os.name=='posix' and tx.host_sha256==manifest['hostIdentitySha256'],'HOST_TRANSACTION_IDENTITY_REQUIRED')
    expected=tx.spec['locks'];require(len(tx.lock_fds)==len(expected),'WHOLE_TRANSACTION_LOCK_SET_REQUIRED')
    for fd,path in zip(tx.lock_fds,expected):
        require(str(Path('/proc/self/fd/'+str(fd)).resolve())==path,'LOCK_FD_IDENTITY_CHANGED')
        text=Path('/proc/self/fdinfo/'+str(fd)).read_text()
        require(any('FLOCK' in line and 'WRITE' in line for line in text.splitlines() if line.startswith('lock:')),'KERNEL_FLOCK_NOT_HELD')


def fresh_gateway_and_static(tx,manifest,root):
    require(digest(tx.run(['nginx','-T']))==manifest['maintenance']['dumpSha256'],'MAINTENANCE_NOT_CURRENT')
    checks=[]
    for item in manifest['maintenance']['staticAssets']:
        expected=artifact(root,item['file'])
        # Exact explicit final mounted path; no shell expression or wildcards.
        path=item['installedPath']
        require(path.startswith('/var/www/') and '..' not in Path(path).parts,'STATIC_INSTALLED_PATH')
        checks.append({'path':path,'sha256':digest(expected),'size':len(expected)})
    require(0<len(checks)<=100000,'BOUNDED_STATIC_INVENTORY_REQUIRED')
    code="""import sys,json,pathlib,hashlib
rows=json.load(sys.stdin)
for row in rows:
 p=pathlib.Path(row['path']);assert p.is_file() and not p.is_symlink()
 assert p.stat().st_size==row['size'] and hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
print('INSTALLED_STATIC=PASS COUNT='+str(len(rows)))
"""
    output=tx.run(['python3','-c',code],stdin=json.dumps(checks).encode(),timeout=120)
    require(output.strip()==('INSTALLED_STATIC=PASS COUNT='+str(len(checks))).encode(),'INSTALLED_STATIC_CHANGED')


def retire_one(tx,manifest,root,observe,task_proof):
    """Explicit library call only, one CID, finite reads, infinite graceful wait.

    observe is the lock owner's actual audited collector, not a supplied JSON
    drain receipt. It must collect raw socket/pg_stat_activity/process/reference
    evidence and persist hashes. No implementation means HOLD, not false zero.
    """
    require_lock(tx,manifest)
    require(callable(observe) and callable(task_proof),'REAL_COLLECTORS_REQUIRED')
    require(type(manifest.get('maximumClientWaitSeconds',120)) is int and 30<=manifest.get('maximumClientWaitSeconds',120)<=300,'BOUNDED_CLIENT_WAIT_REQUIRED')
    cid=manifest['identity']['id'];require(re.fullmatch('[a-f0-9]{64}',cid),'FIXED_CID')
    require(not (tx.folder/('legacy-retire-intent-'+cid[:12]+'.json')).exists(),'EXPLICIT_RECONCILIATION_REQUIRED')
    fresh_gateway_and_static(tx,manifest,root)
    observations=[]
    for index in range(2):
        before=time.monotonic_ns();row=tx.inspect(cid)
        require(identity(row)==manifest['identity'] and row['State']['Running'] and not row['State'].get('Paused'),'CONTAINER_BASELINE_CHANGED')
        obs=observe(tx,manifest,index)
        # These cannot be forged by caller observation JSON.
        obs.update(identity=identity(row),immutableSha256=immutable(row),networkSha256=network_binding(row),cmd=row['Config']['Cmd'],videoWorker=dict(x.split('=',1) for x in row['Config'].get('Env',[]) if '=' in x).get('NAUMI_VIDEO_WORKER'),monotonicNs=before,maintenanceDumpSha256=digest(tx.run(['nginx','-T'])),taskProof=task_proof(tx,manifest,'before-'+str(index)))
        observations.append(obs)
        tx.save('legacy-ui-observation-'+cid[:12]+'-'+str(index)+'.json',obs)
        if index==0:time.sleep(30)
    result=audit(manifest,observations,root)
    tx.save('legacy-ui-audit-'+cid[:12]+'.json',result)
    require(result['status']=='ELIGIBLE_FOR_EXPLICIT_MAINTENANCE_RETIREMENT',','.join(result['reasons']))
    fresh_gateway_and_static(tx,manifest,root)
    original=tx.inspect(cid);require(immutable(original)==manifest['immutableSha256'] and identity(original)==manifest['identity'],'CONCURRENT_IDENTITY_CHANGE')
    intent={'identity':manifest['identity'],'immutableSha256':manifest['immutableSha256'],'networkSha256':manifest['networkSha256'],'originalRestartPolicy':original['HostConfig']['RestartPolicy'],'originalPortBindings':original['HostConfig']['PortBindings'],'authorization':manifest['authorization'],'legacyCoverage':'partial-nonpersisted-observation','ordinaryDrainReceipt':None,'tasksBefore':observations[-1]['taskProof'],'resourcesBefore':resources(tx)}
    tx.save('legacy-retire-intent-'+cid[:12]+'.json',intent)
    tx.run(['docker','update','--restart=no',cid])
    # timeout=-1 disables Docker's SIGKILL escalation. Adapter subprocess timeout
    # can abandon waiting, never kill/stop the container by another mechanism.
    tx.run(['docker','stop','--time=-1',cid],timeout=manifest.get('maximumClientWaitSeconds',120))
    stopped=tx.inspect(cid)
    require(not stopped['State']['Running'] and not stopped['State'].get('OOMKilled') and stopped['State'].get('ExitCode') not in (137,),'GRACEFUL_STOP_NOT_CONFIRMED')
    require(immutable(stopped)==manifest['immutableSha256'] and stopped['HostConfig']['PortBindings']==intent['originalPortBindings'] and stopped['HostConfig']['RestartPolicy']['Name']=='no','PRESERVED_CONTAINER_BINDING_CHANGED')
    after=task_proof(tx,manifest,'after-stop')
    require(after.get('preservationSha256')==intent['tasksBefore'].get('preservationSha256') and after.get('unknownOwnership')==[],'POST_STOP_TASK_PROOF_CHANGED_KEEP_MAINTENANCE')
    result={'identity':identity(stopped),'stopped':True,'restartPolicy':'no','containerDeleted':False,'legacyCoverage':'partial-nonpersisted-observation','ordinaryDrainReceipt':None,'resourcesAfter':resources(tx),'taskProofAfter':after,'restoreRequiredOnFailure':True}
    tx.save('legacy-retired-'+cid[:12]+'.json',result)
    return result


def resources(tx):
    data=tx.run(['cat','/proc/meminfo']).decode()
    rows={line.split(':')[0]:int(line.split()[1]) for line in data.splitlines() if ':' in line and len(line.split())>=2 and line.split()[1].isdigit()}
    return {key+'KiB':rows[key] for key in ('MemAvailable','SwapFree','SwapTotal')}|{'swapIsRamBudget':False}


def restore_one(tx,manifest,intent,probe,*,required_available_mib):
    """Never stops candidates automatically. Caller must first prove their empty
    ownership, stop only this release's candidates, then call this single-CID op.
    """
    require_lock(tx,manifest);cid=manifest['identity']['id']
    require(intent['identity']==manifest['identity'] and callable(probe),'PINNED_INTENT_AND_REAL_PROBE_REQUIRED')
    require(type(required_available_mib) is int and required_available_mib>=1024,'RESTORE_MEMORY_BUDGET_REQUIRED')
    require(resources(tx)['MemAvailableKiB']//1024>=required_available_mib,'RESTORE_MEMORY_SHORTFALL_KEEP_MAINTENANCE')
    row=tx.inspect(cid);require(not row['State']['Running'] and immutable(row)==intent['immutableSha256'],'ORIGINAL_RETAINED_CID_CHANGED')
    tx.save('legacy-restore-intent-'+cid[:12]+'.json',intent)
    tx.run(['docker','start',cid])
    row=tx.inspect(cid);require(row['State']['Running'] and row['Image']==manifest['identity']['image'] and immutable(row)==intent['immutableSha256'] and network_binding(row)==intent['networkSha256'] and row['HostConfig']['PortBindings']==intent['originalPortBindings'],'ORIGINAL_CID_RESTART_UNKNOWN')
    check=probe(tx,manifest)
    require(check.get('version')==manifest['expectedVersion'] and check.get('commit')==manifest['expectedCommit'] and check.get('health') is True and check.get('staticHashVerified') is True,'RESTORED_HEALTH_VERSION_HASH_NOT_PROVEN')
    policy=intent['originalRestartPolicy'];require(policy['Name'] in ('no','always','unless-stopped','on-failure'),'UNKNOWN_ORIGINAL_RESTART_POLICY')
    flag=policy['Name']+(':'+str(policy['MaximumRetryCount']) if policy['Name']=='on-failure' and policy.get('MaximumRetryCount') else '')
    tx.run(['docker','update','--restart='+flag,cid])
    result={'id':cid,'originalImage':row['Image'],'restored':True,'probe':check,'resourcesAfter':resources(tx),'originalGatewayReloaded':False,'fullFallbackRestorationStillRequired':True,'databaseRestored':False}
    tx.save('legacy-restored-'+cid[:12]+'.json',result)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True);p.add_argument('--observations',required=True);p.add_argument('--artifact-root',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();out=Path(a.output);require(not out.exists(),'NEW_REPORT_PATH_REQUIRED')
    result=audit(json.loads(Path(a.manifest).read_text()),json.loads(Path(a.observations).read_text()),a.artifact_root)
    out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('LEGACY_UI_AUDIT='+result['status']+' REASONS='+','.join(result['reasons'])+' AUTO_STOP=0 COVERAGE=PARTIAL_NONPERSISTED')
