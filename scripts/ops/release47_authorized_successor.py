"""Explicit incident-carrying continuation in the ORIGINAL canonical journal.

This does not close the historical release, erase unknown activities, or allow
paid retries. Only the exact user-accepted incident set may be carried; fresh
live work still prevents current-slot retirement. No host I/O in this policy.
"""
import copy
import datetime as dt
from release47_host import require, sha
from release47_recovery_supervisor import encoded

ACK = '保留未结事件，继续新版蓝绿'
TARGET = '47.105.59.142'
HISTORICAL_RELEASE = 'release47-window-20261016-main7bd'
PAID_JOB = 'job-d2c9a9c0-533a-40ef-bd11-135048f8946d'
PAID_ACTIVITY = 'dab0be23-1283-46d6-a929-64ab18832af4'
SCAN_ACTIVITY = '36c9a74d-bba1-4c36-82bf-f2b83bc074de'


def authorization(spec, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    require(spec == {'target': TARGET, 'date': '2026-10-18', 'acknowledgement': ACK,
                     'restoreDatabase': False, 'replayAcceptedTasks': False,
                     'historicalDrainReclassified': False, 'paidOutputRecovered': False},
            'EXACT_INCIDENT_CARRY_FORWARD_AUTHORIZATION_REQUIRED')
    require(now.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat() == spec['date'],
            'INCIDENT_AUTHORIZATION_DATE_CHANGED')


def begin(state, spec, *, successor_id, incident_digest, archive):
    authorization(spec)
    require(state.get('target') == TARGET and state.get('releaseId') == HISTORICAL_RELEASE and
            state.get('phase') == 'MIGRATED_CLEANUP_PENDING' and state.get('legacyDrainProven') is False and
            state.get('blueGreenSuccessor') is None and len(incident_digest) == 64 and
            all(o.get('phase') == 'ACKNOWLEDGED' for o in state.get('operations', {}).values()) and
            state.get('runtimeRecovery', {}).get('phase') == 'ACKNOWLEDGED',
            'EXACT_ACKNOWLEDGED_PREDECESSOR_REQUIRED')
    require(archive.get('sha256') == sha(encoded(state)) and archive.get('path', '').startswith('/opt/naumi-staging/evidence/'),
            'ORIGINAL_CANONICAL_ARCHIVE_REQUIRED')
    return {'releaseId': successor_id, 'phase': 'BASELINED', 'authorization': copy.deepcopy(spec),
            'predecessor': copy.deepcopy(archive), 'predecessorPhase': state['phase'],
            'historicalDrainReclassified': False, 'paidOutputRecovered': False,
            'incidentSha256': incident_digest, 'carriedActivityIds': sorted([PAID_ACTIVITY, SCAN_ACTIVITY]),
            'heldJobId': PAID_JOB, 'retired': [], 'operations': {}}


def check_incidents(rows, held, expected_digest=None):
    require(len(rows) == 2 and {r['id'] for r in rows} == {PAID_ACTIVITY, SCAN_ACTIVITY},
            'INCIDENT_SET_CHANGED')
    rows = sorted(rows, key=lambda r: r['id'])
    for row in rows:
        require(row['state'] == 'unknown' and row['activity_kind'] == 'accepted-work', 'INCIDENT_NOT_FROZEN')
        if row['id'] == PAID_ACTIVITY:
            require(row['work_scope'] == 'durable-image' and row['work_key'] == 'generate:' + PAID_JOB and
                    row['outcome'] == 'owner-terminated:paid-output-not-durable-held', 'PAID_FENCE_CHANGED')
        else:
            require(row['work_scope'] == 'supplier-scan' and row['work_key'] == 'supplier-cost-scan' and
                    row['claim_token'] is None and row['outcome'] == 'background-promise-unconfirmed',
                    'SCANNER_NOT_UNCLAIMED_REJECTED_PROMISE')
    require(held['id'] == PAID_JOB and held['status'] == 'needs_attention' and held['paid_state'] == 'started' and
            held['billing_state'] == 'hold' and held['billing_settled'] is False and held['ledger_count'] == 0 and
            held['images_count'] == 0 and held['live_lease'] is False, 'PAID_INCIDENT_NOT_DURABLY_HELD')
    digest = sha(encoded({'rows': rows, 'held': held}))
    require(expected_digest is None or digest == expected_digest, 'HELD_INCIDENT_BYTES_CHANGED')
    return digest


def current_execution_drained(app, domain, worker, owners, rows, held, incident_digest):
    check_incidents(rows, held, incident_digest)
    t = app.get('transport', {}).get('transport', {})
    obs = app.get('observations', {})
    require(app.get('transport', {}).get('verified') is True and t.get('completeFromProcessStart') is True and
            t.get('accountingFault') is False and t.get('activeRequests') == 0 and
            t.get('startedRequests') == t.get('finishedRequests'), 'HTTP_PROCESS_NOT_DRAINED')
    require(app.get('admission', {}).get('mode') == 'draining' and
            all(type(obs.get(k)) is int and obs[k] == 0 for k in ['activeRequests','trackedRequests','trackedAcceptedWork','agentRuns']) and
            obs.get('unknownLeases') == 2 and all(r.get('state') == 'idle' for r in owners),
            'CURRENT_AGENT_OR_BACKGROUND_WORK_NOT_DRAINED')
    require(domain.get('drained') is True and domain.get('absentTables') == [] and
            set(domain.get('counts', {})) == {'imageJobs','canvasImages','videoPolls','supplierCosts','imagegenItems'} and
            all(type(v) is int and v == 0 for v in domain['counts'].values()) and
            all(type(domain.get(k)) is int and domain[k] == 0 for k in ['activeFences','activeTransactions','advisoryLocks']),
            'DOMAIN_EXECUTION_NOT_DRAINED')
    require(worker.get('paused') is True and worker.get('activeTicks') == 0 and worker.get('unresolvedTicks') == 0 and
            worker.get('phase') == 'QUIESCENT' and (worker.get('lastTick') or {}).get('phase') not in ['unknown','dispatched'],
            'WORKER_NOT_DRAINED')
    return {'kind':'composite-current-execution-with-preserved-incidents', 'currentExecutableWorkDrained':True,
            'historicalDrainProven':False, 'unknownObservationsPreserved':2, 'paidOutputRecovered':False,
            'incidentSha256':incident_digest, 'rawApp':app, 'rawDomain':domain, 'rawWorker':worker,
            'rawOwners':owners}
