#!/usr/bin/env python3
"""One exact historical 103 UI, runtime evidence, retained CID, no kill fallback.

Library only. No CLI, network transport, discovery-stop, DB restore or ordinary
complete-drain receipt. Existing lifetime-static retirement library is unchanged.
"""
import datetime as dt
import json
from pathlib import Path
import re
import time

try:
    from . import release_legacy_ui_retirement as old
except ImportError:
    import release_legacy_ui_retirement as old

Hold = old.RetirementHold
require, digest, encoded = old.require, old.digest, old.encoded
identity, immutable, network_binding = old.identity, old.immutable, old.network_binding
artifact, require_lock = old.artifact, old.require_lock
fresh_gateway_and_static, resources = old.fresh_gateway_and_static, old.resources
PINS = {
13028: ('6a9b0067cfdf985342ec8d178e00ff515a2d3a0f3079db2603b1206b32e8be3d','26ee9e4ea71aacae67d8f3ee2d5848e677732af2364ba790f4ceae7d51c76e22','2026-10-13T18:10:30.157674451Z'),
13029: ('fd6ef62af84ff2e12c702b2369eab5c9953a2c0523aaad1dc90dcf392732d6f1','735b84512d43d46ad63de9179780a968b516d5469f46b9d3bcf0cce0f483d5c9','2026-10-13T18:10:32.982293975Z'),
13030: ('b90581dc4bda4b6883b2f8d43ec8cc60a2a7743901ecbc28ba051640bd18811e','e606038ea3a24fa984ed51ef995205f21850226a5b7eb86a9de15a7c0dcc0bd1','2026-10-13T18:10:35.958860299Z'),
13031: ('3efa7ef869be711d84efa9c6c3a2d3a386b55c03ddeecbe98b01698896b8bbb2','1814bf6dc109121a697ebecad9be4606ce29f7d0edeaabbdc6aea1174c775d75','2026-10-14T06:05:42.698621481Z'),
13032: ('40eeda84f6fb8969f375b6dcb59357e63808bb6ea0cbe5d622620a9d2df55ada','18943fddbe3c9fe71da1d4be38951eb47f30e50670786400d5063e2b5947510e','2026-10-14T06:05:47.298166223Z'),
13033: ('0b8ff61f47f23d781f3d156e0c84685854d02551bdd17138b07616a8968e4685','8f6d2dc56ef6dc92a666108311a35081ef13ebbe69cc3f0b5d902e9b0f1f8b03','2026-10-14T06:05:51.849157632Z'),
}
ZERO_FIELDS = ('running','canvasExecuting','creatingPromises','pendingCreating',
               'promiseStateUnknown','pendingPersist','pendingToolResults','unknownSessionLike')


def check_manifest(m):
    old.require_binding_format(m)
    require(m.get('schemaVersion') == 1 and m.get('target') == '103.30.76.93', 'FIXED_103_ONLY')
    port = m.get('port'); require(type(port) is int and port in PINS, 'FIXED_HISTORICAL_UI_PORT_ONLY')
    cid, image, started = PINS[port]; p = m.get('identity', {})
    require((p.get('id'), p.get('image'), p.get('startedAt')) == (cid, 'sha256:'+image, started), 'FIXED_HISTORICAL_BOOT_ONLY')
    require(m.get('ordinaryDrainReceipt') is None and m.get('policy') == 'legacy-ui-runtime-maintenance-v1', 'EXPLICIT_RUNTIME_MAINTENANCE_ONLY')
    a = m.get('authorization', {})
    require(a.get('kind') == 'explicit-one-time-maintenance-retirement' and a.get('containerId') == cid and re.fullmatch('[a-f0-9]{64}', a.get('userRequestSha256','')), 'EXPLICIT_SINGLE_CID_AUTHORIZATION_REQUIRED')
    try:
        expiry = dt.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00'))
        require(expiry.tzinfo is not None and dt.datetime.now(dt.timezone.utc) <= expiry, 'AUTHORIZATION_EXPIRED')
    except (KeyError, TypeError, ValueError):
        raise Hold('AUTHORIZATION_EXPIRED') from None
    require(type(m.get('maximumClientWaitSeconds',120)) is int and 30 <= m.get('maximumClientWaitSeconds',120) <= 300, 'BOUNDED_CLIENT_WAIT_REQUIRED')


def check_row(row, m, *, running=True, original=True):
    old.require_binding_format(m)
    p = m['identity']
    require(row['Id'] == p['id'] and row['Image'] == p['image'] and row['Name'].lstrip('/') == p['name'], 'CONCURRENT_CONTAINER_IDENTITY')
    if original: require(identity(row) == p, 'CONCURRENT_BOOT_IDENTITY')
    require(immutable(row) == m['immutableSha256'], 'IMMUTABLE_BINDING_CHANGED')
    require(row['State']['Running'] is running and not row['State'].get('Paused') and not row['State'].get('Restarting'), 'RUNNING_STATE_UNKNOWN')
    require(row['Config']['Cmd'] == ['node','server.js'], 'NOT_STANDARD_WEB')
    env = dict(x.split('=',1) for x in row['Config'].get('Env',[]) if '=' in x)
    require(env.get('NAUMI_VIDEO_WORKER') == '0', 'VIDEO_WORKER_NOT_EXPLICIT_ZERO')
    ports = row['HostConfig']['PortBindings']
    require(ports == {'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':str(m['port'])}]}, 'UNEXPECTED_PORT_BINDING')
    if running and original: require(network_binding(row) == m['networkSha256'], 'NETWORK_BINDING_CHANGED')


def network_configuration(row):
    # EndpointID, assigned IP/MAC and DNS gateway are runtime allocations and
    # demonstrably change on a real retained-CID stop/start. Preserve network
    # identity plus original declared aliases/static-IP request/driver options.
    fields=('NetworkID','Aliases','Links','IPAMConfig','DriverOpts','GwPriority')
    return {name:{key:network.get(key) for key in fields} for name,network in old.canonical_networks(row['NetworkSettings']['Networks']).items()}


def source_check(m, root):
    """Reviewed executable graph is evidence, not a regex claiming no timers.

    Every autonomous site must be enumerated with actual module bytes + exact
    branch text and disposition. Unknown/dynamic/active sites hold.
    """
    s = json.loads(artifact(root,m['sourceAudit']))
    require(s.get('image') == m['identity']['image'] and s.get('containerId') == m['identity']['id'], 'SOURCE_IDENTITY')
    require(s.get('coverage') == 'entire-executable-startup-and-route-closure' and s.get('unresolvedDynamicImports') == [] and s.get('unreviewedExecutableFiles') == [], 'SOURCE_GRAPH_INCOMPLETE')
    modules = s.get('moduleFiles',[]); require(bool(modules), 'SOURCE_BYTES_REQUIRED')
    by_path = {x['path']:artifact(root,x).decode('utf-8') for x in modules}
    require(len(by_path) == len(modules), 'DUPLICATE_SOURCE_PATH')
    native = s.get('nativeMapConstruction',{})
    require(native.get('globalMapUnmodified') is True and native.get('prototypeUnmodified') is True and native.get('coverage') == 'all-runtime-map-construction-and-global-writes', 'NATIVE_MAP_SOURCE_NOT_PROVEN')
    code = by_path.get(native.get('modulePath'),'')
    require('const SESSIONS = new Map' in code and 'const CREATING = new Map' in code, 'ACTUAL_CLOSURE_MAP_SOURCE_REQUIRED')
    require(s.get('autonomousAuditComplete') is True and s.get('unknownAutonomousSites') == [], 'SOURCE_BACKGROUND_AUDIT_INCOMPLETE')
    sites = s.get('autonomousSites',[]); require(bool(sites), 'AUTONOMOUS_SITES_INVENTORY_REQUIRED')
    worker = False
    for site in sites:
        body = by_path.get(site.get('modulePath'),''); excerpt = site.get('exactSource','')
        require(bool(excerpt) and excerpt in body, 'SOURCE_SITE_NOT_BOUND')
        disposition = site.get('disposition')
        require(disposition in ('disabled-by-explicit-env','request-owned-observed-by-runtime','non-work-readonly'), 'AUTONOMOUS_SITE_ACTIVE_OR_UNKNOWN')
        if site.get('kind') == 'video-worker':
            require(disposition == 'disabled-by-explicit-env' and site.get('environment') == {'NAUMI_VIDEO_WORKER':'0'}, 'VIDEO_TIMER_SOURCE_GATE_NOT_BOUND')
            worker = True
    require(worker, 'VIDEO_TIMER_SOURCE_AUDIT_REQUIRED')
    return s



def maintenance_check(m, root):
    gateway=json.loads(artifact(root,m['maintenance']['report']))
    require(gateway.get('kind')=='103-maintenance-gateway' and gateway.get('runtimeTopology') in ('unified-web-three-ui','three-web-three-ui'), 'STATIC_MAINTENANCE_REPORT_REQUIRED')
    original=json.loads(artifact(root,m['maintenance']['originalStaticManifest']))
    assets=m['maintenance'].get('staticAssets',[])
    require(bool(assets) and len({x['url'] for x in assets})==len(assets), 'FULL_STATIC_COVERAGE_REQUIRED')
    require(m['maintenance'].get('allOriginalUrls')==sorted(x['url'] for x in assets), 'FULL_STATIC_COVERAGE_REQUIRED')
    require({x['url']:x['file']['sha256'] for x in assets}=={x['url']:x['sha256'] for x in original['assets']}, 'FULL_STATIC_COVERAGE_REQUIRED')
    for item in assets: artifact(root,item['file'])


def inspector_check(report, *, pid):
    require(report.get('schemaVersion') == 1 and report.get('kind') == 'legacy-node-inspector-map-observation', 'INSPECTOR_SCHEMA')
    require(report.get('targetPid') == pid and report.get('status') == 'OBSERVED_MAPS_IDLE', 'INSPECTOR_IDENTITY_OR_ACTIVE')
    require(report.get('coverage') == 'all-enumerated-context-native-map-prototypes' and report.get('contextMapEnumerationComplete') is True, 'INSPECTOR_ENUMERATION_INCOMPLETE')
    require(report.get('sourceConfirmedNativeMapConstructionRequired') is True and report.get('countsSemantics') == 'per-context-sum-upper-bound', 'INSPECTOR_NATIVE_MAP_ASSUMPTION')
    require(report.get('workerDiscoveryAvailable') is True and report.get('workerTargets') == 0, 'INSPECTOR_WORKER_ISOLATES_UNKNOWN')
    require(report.get('inspectorOpenedByAudit') is True and report.get('inspectorClosedConfirmed') is True, 'INSPECTOR_NOT_CLOSED')
    require(report.get('ordinaryDrainReceipt') is None and report.get('applicationMethodsCalled') is False and report.get('heapSnapshotTaken') is False and report.get('debuggerPausedByAudit') is False, 'INSPECTOR_UNREVIEWED_SIDE_EFFECT')
    require(not report.get('holdReason') and bool(report.get('contexts')), 'INSPECTOR_SCAN_UNKNOWN')
    c = report.get('counts',{})
    require(all(type(c.get(k)) is int and c[k] == 0 for k in ZERO_FIELDS), 'ACTIVE_OR_UNKNOWN_RUNTIME_WORK')
    # Current real collector has no content projection. Idle nonzero is not lost
    # merely because flags are false; nonpersisted tmp-* must remain preserved.
    require(type(c.get('sessions')) is int and c['sessions'] == 0 and type(c.get('tmp')) is int and c['tmp'] == 0 and report.get('sessionObservations') == [] and report.get('identityHashes') == [], 'IDLE_SESSION_CONTENT_NOT_PRESERVED')
    require(report.get('creatingObservations') == [], 'CREATING_MAP_NOT_EMPTY')
    for context in report['contexts']:
        require(type(context.get('contextId')) is int and all(type(context.get(k)) is int and context[k] >= 0 for k in ('maps','emptyMaps','scannedEntries','sessions','creatingPromises')), 'INSPECTOR_CONTEXT_INCOMPLETE')
        require(context['emptyMaps'] <= context['maps'] and context['sessions'] == 0 and context['creatingPromises'] == 0, 'INSPECTOR_CONTEXT_ACTIVE')


def task_check(proof):
    require(proof.get('coverage') == 'complete-persisted-ownership' and proof.get('targetOwnedAcceptedTasks') == [] and proof.get('unknownOwnership') == [], 'TASK_OWNERSHIP_NOT_CLOSED')
    require(re.fullmatch('[a-f0-9]{64}',proof.get('preservationSha256','')) is not None, 'TASK_PRESERVATION_REQUIRED')


def observation_check(obs, m, root):
    require(obs.get('processTree') == ['node server.js'], 'UNKNOWN_CHILD_PROCESS')
    require(obs.get('socketCoverage') == 'all-target-network-namespace' and obs.get('socketNonIdle') == [], 'ACTIVE_OR_UNKNOWN_SOCKET')
    require(obs.get('databaseCoverage') == 'all-target-container-ips-and-application-identities' and obs.get('databaseActiveOrTransactions') == [], 'ACTIVE_OR_UNATTRIBUTED_DATABASE_WORK')
    require(obs.get('referenceCoverage') == 'all-docker-effective-systemd-internal-configs' and obs.get('references') == [], 'REFERENCES_NOT_CLOSED')
    require(obs.get('staticHashesVerified') is True, 'STATIC_COVERAGE_NOT_VERIFIED')
    require(bool(obs.get('rawEvidence')), 'RAW_EVIDENCE_REQUIRED')
    for d in obs['rawEvidence']: artifact(root,d)
    task_check(obs['taskProof'])


def journal_name(m, phase): return 'runtime-ui-'+phase+'-'+m['identity']['id'][:12]+'.json'


def retire_one(tx,m,root,observe,task_proof,inspect_maps,final_references):
    """One operation. All callbacks are lock-owner real collectors, not booleans.

    Original host transaction must remain held through stop and post-task proof.
    A saved intent blocks all repeated stops, including unknown command outcomes.
    """
    check_manifest(m); require_lock(tx,m)
    require(all(callable(x) for x in (observe,task_proof,inspect_maps,final_references)), 'REAL_COLLECTORS_REQUIRED')
    require(not (tx.folder/journal_name(m,'intent')).exists(), 'EXPLICIT_RECONCILIATION_REQUIRED')
    source_check(m,root); maintenance_check(m,root); fresh_gateway_and_static(tx,m,root)
    observations=[]
    for i in range(2):
        row=tx.inspect(m['identity']['id']); check_row(row,m)
        tick=time.monotonic_ns(); obs=observe(tx,m,i)
        obs['taskProof']=task_proof(tx,m,'before-'+str(i)); observation_check(obs,m,root)
        obs.update(monotonicNs=tick,identity=identity(row),pid=row['State']['Pid'])
        tx.save(journal_name(m,'observe-'+str(i)),obs); observations.append(obs)
        if i==0: time.sleep(30)
    require(observations[1]['monotonicNs']-observations[0]['monotonicNs']>=30_000_000_000, 'OBSERVATION_INTERVAL_UNDER_30S')
    require(observations[0]['taskProof']['preservationSha256']==observations[1]['taskProof']['preservationSha256'], 'PRE_STOP_TASK_PROOF_CHANGED')
    require(observations[0]['pid']==observations[1]['pid'], 'RUNTIME_PID_CHANGED')
    descriptor=inspect_maps(tx,m); report=json.loads(artifact(root,descriptor))
    envelope=report.get('containerIdentity',{})
    require(all(envelope.get(k)==v for k,v in m['identity'].items()) and envelope.get('running') is True, 'INSPECTOR_CONTAINER_BINDING')
    require(report.get('hostPid')==observations[-1]['pid'] and report.get('namespaceTargetPid')==1, 'INSPECTOR_PID_NAMESPACE_BINDING')
    require(report.get('auditorSha256')==m.get('inspectorAuditorSha256') and re.fullmatch('[a-f0-9]{64}',report.get('auditorSha256','')), 'INSPECTOR_AUDITOR_HASH_BINDING')
    inspector_check(report,pid=1)
    fresh_gateway_and_static(tx,m,root)
    final=final_references(tx,m); require(final.get('referenceCoverage')=='all-docker-effective-systemd-internal-configs' and final.get('references')==[] and bool(final.get('rawEvidence')), 'FINAL_REFERENCES_UNKNOWN')
    for d in final['rawEvidence']: artifact(root,d)
    original=tx.inspect(m['identity']['id']);check_row(original,m)
    require(original['State']['Pid']==observations[-1]['pid'], 'RUNTIME_PID_CHANGED')
    intent={'bindingHashFormat':old.BINDING_HASH_FORMAT,'schemaVersion':1,'policy':m['policy'],'identity':m['identity'],'immutableSha256':immutable(original),'networkSha256':network_binding(original),'originalNetworkSettings':original['NetworkSettings']['Networks'],'networkConfigurationSha256':digest(encoded(network_configuration(original))),'originalRestartPolicy':original['HostConfig']['RestartPolicy'],'originalPortBindings':original['HostConfig']['PortBindings'],'inspector':descriptor,'tasksBefore':observations[-1]['taskProof'],'resourcesBefore':resources(tx),'ordinaryDrainReceipt':None,'restoreDatabase':False,'replayAcceptedTasks':False}
    tx.save(journal_name(m,'intent'),intent)
    try:
        tx.run(['docker','update','--restart=no',original['Id']])
        tx.save(journal_name(m,'stop-request'),{'id':original['Id'],'command':['docker','stop','--time=-1',original['Id']]})
        tx.run(['docker','stop','--time=-1',original['Id']],timeout=m.get('maximumClientWaitSeconds',120))
    except Exception:
        tx.save(journal_name(m,'stop-unknown'),{'id':original['Id'],'retryAllowed':False,'killFallback':False})
        raise Hold('STOP_OUTCOME_UNKNOWN_OBSERVE_ORIGINAL_CID_NO_RETRY') from None
    row=tx.inspect(original['Id']);check_row(row,m,running=False)
    require(not row['State'].get('OOMKilled') and type(row['State'].get('ExitCode')) is int and row['State']['ExitCode'] not in (137,), 'GRACEFUL_STOP_NOT_CONFIRMED')
    require(row['HostConfig']['RestartPolicy']=={'Name':'no','MaximumRetryCount':0}, 'RESTART_NO_NOT_CONFIRMED')
    after=task_proof(tx,m,'after-stop');task_check(after)
    require(after['preservationSha256']==intent['tasksBefore']['preservationSha256'], 'POST_STOP_TASK_PROOF_CHANGED_KEEP_MAINTENANCE')
    result={'id':row['Id'],'stopped':True,'resourcesAfter':resources(tx),'tasksAfter':after,'ordinaryDrainReceipt':None,'containerDeleted':False,'restoreRequiredOnFailure':True}
    tx.save(journal_name(m,'stopped'),result);return result


def restore_one(tx,m,intent,probe,*,required_available_mib):
    check_manifest(m);old.require_binding_format(intent);require_lock(tx,m)
    require(intent.get('identity')==m['identity'] and intent.get('immutableSha256')==m['immutableSha256'] and intent.get('networkSha256')==m['networkSha256'] and callable(probe), 'PINNED_RESTORE_INTENT_REQUIRED')
    require(not (tx.folder/journal_name(m,'restore-intent')).exists(), 'EXPLICIT_RECONCILIATION_REQUIRED')
    require(type(required_available_mib) is int and required_available_mib>=1024 and resources(tx)['MemAvailableKiB']//1024>=required_available_mib, 'RESTORE_MEMORY_SHORTFALL_KEEP_MAINTENANCE')
    row=tx.inspect(m['identity']['id']);check_row(row,m,running=False)
    require(row['HostConfig']['PortBindings']==intent['originalPortBindings'], 'ORIGINAL_PORTS_CHANGED')
    policy=intent['originalRestartPolicy']; require(policy.get('Name') in ('no','always','unless-stopped','on-failure') and type(policy.get('MaximumRetryCount',0)) is int and policy.get('MaximumRetryCount',0)>=0, 'UNKNOWN_ORIGINAL_POLICY')
    tx.save(journal_name(m,'restore-intent'),intent)
    try: tx.run(['docker','start',row['Id']])
    except Exception:
        tx.save(journal_name(m,'restore-unknown'),{'id':row['Id'],'retryAllowed':False})
        raise Hold('RESTORE_OUTCOME_UNKNOWN_OBSERVE_ORIGINAL_CID_NO_RETRY') from None
    row=tx.inspect(row['Id']);check_row(row,m,original=False)
    require(digest(encoded(network_configuration(row)))==intent.get('networkConfigurationSha256'), 'RESTORED_NETWORK_CONFIGURATION_CHANGED')
    checked=probe(tx,m)
    require(checked.get('health') is True and checked.get('staticHashVerified') is True and checked.get('version')==m['expectedVersion'] and checked.get('commit')==m['expectedCommit'], 'RESTORED_PROBE_NOT_PROVEN')
    flag=policy['Name']+(':'+str(policy['MaximumRetryCount']) if policy['Name']=='on-failure' and policy.get('MaximumRetryCount') else '')
    tx.run(['docker','update','--restart='+flag,row['Id']])
    verified=tx.inspect(row['Id']);require(verified['HostConfig']['RestartPolicy']==policy, 'ORIGINAL_RESTART_POLICY_NOT_RESTORED')
    result={'id':row['Id'],'restored':True,'originalRestartPolicy':policy,'resourcesAfter':resources(tx),'probe':checked,'originalGatewayReloaded':False,'networkRuntimeAllocationsChanged':row['NetworkSettings']['Networks']!=intent['originalNetworkSettings'],'databaseRestored':False,'ordinaryDrainReceipt':None}
    tx.save(journal_name(m,'restored'),result);return result
