"""Read-only verification of the already-completed 2026-10-18 successor.

This verifies an existing publication, not authorization for the next one.
Historical incident bodies, credentials and task payloads never leave the host.
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path('/opt/naumi-staging/evidence/all-dev-release47-20261018')
RELEASE = 'release47-alldev-20261018'
PREDECESSOR = 'release47-window-20261016-main7bd'


def encoded(v):
    return json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def digest(v):
    return hashlib.sha256(v).hexdigest()


def verify_successor(state, read_bytes, inspect, gateway_sha256):
    errors, artifacts = [], []
    successor = state.get('blueGreenSuccessor')
    if not isinstance(successor, dict):
        return {'present': False, 'verified': False, 'errors': ['SUCCESSOR_NOT_RECORDED']}

    def check(ok, code):
        if not ok and code not in errors:
            errors.append(code)

    def artifact(name):
        try:
            raw = read_bytes(ROOT / name)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError()
            value = json.loads(raw)
            artifacts.append({'name': name, 'sha256': digest(raw), 'bytes': len(raw)})
            return value
        except Exception:
            check(False, 'ARTIFACT_UNREADABLE_' + re.sub('[^A-Z0-9]', '_', name.upper()))
            return {}

    check(state.get('target') == '47.105.59.142' and state.get('releaseId') == PREDECESSOR and state.get('phase') == 'MIGRATED_CLEANUP_PENDING' and state.get('legacyDrainProven') is False, 'HISTORICAL_BOUNDARY_CHANGED')
    check(successor.get('releaseId') == RELEASE and successor.get('phase') == 'COMPLETE', 'SUCCESSOR_NOT_COMPLETE')
    check(bool(re.fullmatch('[a-f0-9]{40}', successor.get('commit') or '')) and bool(re.fullmatch('sha256:[a-f0-9]{64}', successor.get('image') or '')), 'SUCCESSOR_FIXED_VERSION_INVALID')
    check(successor.get('historicalDrainReclassified') is False and successor.get('paidOutputRecovered') is False, 'HISTORICAL_INCIDENT_RECLASSIFIED')
    check(len(successor.get('carriedActivityIds', [])) == 2 and len(set(successor.get('carriedActivityIds', []))) == 2, 'INCIDENT_SET_SIZE_CHANGED')
    auth = successor.get('authorization') or {}
    check(auth == {'target': '47.105.59.142', 'date': '2026-10-18', 'acknowledgement': '保留未结事件，继续新版蓝绿', 'restoreDatabase': False, 'replayAcceptedTasks': False, 'historicalDrainReclassified': False, 'paidOutputRecovered': False}, 'PRIOR_AUTHORIZATION_RECORD_MISMATCH')
    ops = successor.get('operations') or {}
    required = ['database-backup', 'gateway-switch', 'web-create', 'web-start', 'worker-create', 'worker-start', 'new-web-open', 'old-web-drain', 'old-worker-drain', 'new-worker-resume']
    check(all(name in ops for name in required) and all(o.get('phase') == 'ACKNOWLEDGED' for o in ops.values()), 'UNRESOLVED_SUCCESSOR_OPERATION')
    receipt = artifact('transaction/PUBLICATION_RECEIPT.json')
    check(receipt.get('phase') == 'COMPLETE' and receipt.get('commit') == successor.get('commit') and receipt.get('image') == successor.get('image') and receipt.get('version') == successor.get('buildVersion'), 'PUBLICATION_RECEIPT_MISMATCH')
    check(receipt.get('historicalDrainProven') is False and receipt.get('paidOutputRecovered') is False and receipt.get('databaseRestored') is False and type(receipt.get('supplierGenerationReplays')) is int and receipt['supplierGenerationReplays'] == 0 and receipt.get('carriedIncidents') == 2, 'PUBLICATION_BOUNDARY_MISMATCH')
    comparison = artifact('transaction/task-preservation-comparison.json')
    check(comparison.get('preservationVerified') is True and comparison.get('noMissingJobs') is True and comparison.get('noOriginalSupplierMutation') is True and comparison.get('unknownTables') == [] and comparison.get('violations') == [], 'TASK_PRESERVATION_NOT_VERIFIED')
    drain = artifact('transaction/current-execution-drain.json')
    check(drain.get('kind') == 'composite-current-execution-with-preserved-incidents' and drain.get('currentExecutableWorkDrained') is True and drain.get('historicalDrainProven') is False and drain.get('unknownObservationsPreserved') == 2 and drain.get('incidentSha256') == successor.get('incidentSha256'), 'CURRENT_DRAIN_RECEIPT_MISMATCH')
    # Recheck the raw evidence predicates; a top-level PASS is not enough.
    app, domain, worker = drain.get('rawApp') or {}, drain.get('rawDomain') or {}, drain.get('rawWorker') or {}
    transport, obs = (app.get('transport') or {}).get('transport') or {}, app.get('observations') or {}
    zero = lambda v: type(v) is int and v == 0
    check((app.get('transport') or {}).get('verified') is True and transport.get('completeFromProcessStart') is True and transport.get('accountingFault') is False and zero(transport.get('activeRequests')) and type(transport.get('startedRequests')) is int and transport['startedRequests'] == transport.get('finishedRequests') and (app.get('admission') or {}).get('mode') == 'draining' and all(zero(obs.get(k)) for k in ['activeRequests', 'trackedRequests', 'trackedAcceptedWork', 'agentRuns']) and obs.get('unknownLeases') == 2, 'RAW_HTTP_DRAIN_INVALID')
    check(domain.get('drained') is True and domain.get('absentTables') == [] and set((domain.get('counts') or {})) == {'imageJobs', 'canvasImages', 'videoPolls', 'supplierCosts', 'imagegenItems'} and all(zero(v) for v in domain['counts'].values()) and all(zero(domain.get(k)) for k in ['activeFences', 'activeTransactions', 'advisoryLocks']), 'RAW_DOMAIN_DRAIN_INVALID')
    check(worker.get('paused') is True and zero(worker.get('activeTicks')) and zero(worker.get('unresolvedTicks')) and worker.get('phase') == 'QUIESCENT' and (worker.get('lastTick') or {}).get('phase') not in ['unknown', 'dispatched'], 'RAW_WORKER_DRAIN_INVALID')
    check(isinstance(drain.get('rawOwners'), list) and all(x.get('state') == 'idle' for x in drain.get('rawOwners', [])), 'RAW_SESSION_OWNERS_INVALID')
    frozen = artifact('transaction/preserved-incidents.json')
    check(digest(encoded({'rows': frozen.get('rows'), 'held': frozen.get('held')})) == successor.get('incidentSha256') == frozen.get('sha256'), 'PRESERVED_INCIDENT_ARTIFACT_CHANGED')
    check(isinstance(frozen.get('rows'), list) and sorted(x.get('id', '') for x in frozen['rows']) == sorted(successor.get('carriedActivityIds', [])) and (frozen.get('held') or {}).get('id') == successor.get('heldJobId'), 'PRESERVED_INCIDENT_IDENTITIES_CHANGED')
    recovery = state.get('runtimeRecovery') or {}
    check(recovery.get('manifestPath') == str(ROOT / 'supervisor-manifest.json'), 'SUPERVISOR_PATH_CHANGED')
    manifest = artifact('supervisor-manifest.json')
    check(recovery.get('manifestSha256') == digest(encoded(manifest)) and recovery.get('successorReleaseId') == RELEASE and manifest.get('successorReleaseId') == RELEASE and manifest.get('image') == successor.get('image') and manifest.get('commit') == successor.get('commit'), 'SUPERVISOR_BINDING_MISMATCH')
    check(gateway_sha256 == manifest.get('gatewayDumpSha256') == ((ops.get('gateway-switch') or {}).get('receipt') or {}).get('afterDumpSha256'), 'GATEWAY_BINDING_CHANGED')
    identities = {}
    for role in ['web', 'worker']:
        expected = successor.get(role) or {}
        check(expected == receipt.get(role), 'PUBLICATION_' + role.upper() + '_IDENTITY_CHANGED')
        try:
            current = inspect(expected['id'])
            spec = manifest.get(role) or {}
            check(current['Id'] == expected['id'] == spec.get('id') and current['Image'] == successor.get('image') and current['Name'].lstrip('/') == expected['name'] and current['State']['Running'] is True, 'CURRENT_' + role.upper() + '_IDENTITY_CHANGED')
            pin = {k: current[k] for k in ['Id', 'Name', 'Image', 'Config', 'HostConfig', 'Mounts']}
            pin['Mounts'] = sorted(pin['Mounts'], key=lambda x: x['Destination'])
            pin['Networks'] = sorted(current.get('NetworkSettings', {}).get('Networks', {}))
            check(digest(encoded(pin)) == spec.get('staticSha256'), 'CURRENT_' + role.upper() + '_CONFIG_CHANGED')
            identities[role] = {'id': current['Id'], 'imageId': current['Image'], 'name': current['Name'].lstrip('/'), 'running': current['State']['Running']}
        except Exception:
            check(False, 'CURRENT_' + role.upper() + '_INSPECT_FAILED')
    retired = successor.get('retired') or []
    check(len(retired) == 2 and len(set(retired)) == 2, 'RETIRED_SET_MISMATCH')
    for ident in retired:
        try:
            current = inspect(ident)
            op = ops.get('retire-' + ident[:12]) or {}
            check(current['Id'] == ident and current['State']['Running'] is False and current['HostConfig']['RestartPolicy']['Name'] == 'no' and op.get('phase') == 'ACKNOWLEDGED' and (op.get('receipt') or {}).get('id') == ident and (op.get('receipt') or {}).get('running') is False, 'RETIRED_CONTAINER_NOT_STOPPED')
        except Exception:
            check(False, 'RETIRED_CONTAINER_INSPECT_FAILED')
    retired_names = {(ops.get('retire-' + ident[:12], {}).get('receipt') or {}).get('name') for ident in retired}
    check((app.get('identity') or {}).get('instanceId') in retired_names and worker.get('instanceId') in retired_names and (app.get('identity') or {}).get('instanceId') != worker.get('instanceId'), 'DRAIN_NOT_BOUND_TO_RETIRED_SLOTS')
    return {'present': True, 'verified': not errors, 'errors': errors, 'releaseId': successor.get('releaseId'), 'phase': successor.get('phase'), 'commit': successor.get('commit'), 'imageId': successor.get('image'), 'completedAt': successor.get('completedAt'), 'identities': identities, 'retiredCount': len(retired), 'artifacts': artifacts, 'historicalDrainProven': False, 'historicalIncidents': 2, 'liveIncidentReconciliation': False, 'nextReleaseAuthorized': False}
