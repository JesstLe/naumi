"""Successive blue/green journal policy. Historical successor and incidents stay immutable."""
import copy
import datetime as dt
import re
from release47_host import require, sha
from release47_recovery_supervisor import encoded
from release47_authorized_successor import check_incidents


def begin(state, config, archive, incident_digest, at=None):
    at = at or dt.datetime.now(dt.timezone.utc)
    require(config.get('target') == '47.105.59.142' and config.get('authorization') ==
            '合并所有分支，然后上线服务器，退役旧容器', 'EXPLICIT_NORMAL_RELEASE_AUTHORIZATION_REQUIRED')
    require(config.get('date') == at.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat(), 'RELEASE_DATE_CHANGED')
    require(config.get('restoreDatabase') is False and config.get('replayAcceptedTasks') is False and
            config.get('activateDisabledModels') is False, 'NON_REPLAY_NON_ACTIVATION_REQUIRED')
    require(re.fullmatch(r'release47-[a-z0-9-]{6,80}', config.get('releaseId', '')), 'RELEASE_ID_REQUIRED')
    require(state.get('target') == config['target'] and state.get('revision') == config['expectedRevision'] and
            sha(encoded(state)) == config['expectedCanonicalDigest'], 'CANONICAL_REVIEW_CHANGED')
    require(state.get('phase') == 'MIGRATED_CLEANUP_PENDING' and state.get('legacyDrainProven') is False,
            'HISTORICAL_INCIDENT_BOUNDARY_CHANGED')
    prior = state.get('blueGreenSuccessor', {})
    require(prior.get('phase') == 'COMPLETE' and prior.get('releaseId') == 'release47-alldev-20261018', 'HISTORICAL_SUCCESSOR_CHANGED')
    require(state.get('runtimeRecovery', {}).get('phase') == 'ACKNOWLEDGED' and
            all(op.get('phase') == 'ACKNOWLEDGED' for op in state.get('operations', {}).values()), 'PENDING_PRIOR_OPERATION')
    journal = state.get('normalBlueGreenReleases', {})
    require(config['releaseId'] not in journal and all(r.get('phase') in ['COMPLETE', 'ROLLED_BACK'] and
            all(o.get('phase') == 'ACKNOWLEDGED' for o in r.get('operations', {}).values()) for r in journal.values()),
            'PREVIOUS_NORMAL_RELEASE_REQUIRES_RECONCILIATION')
    active = state.get('activeNormalBlueGreenReleaseId')
    predecessor = journal.get(active, {}) if active else prior
    require(predecessor.get('phase') == 'COMPLETE' and predecessor.get('releaseId') == config['predecessorReleaseId'] and
            state['runtimeRecovery'].get('successorReleaseId') == config['predecessorReleaseId'], 'ACTIVE_PREDECESSOR_CHANGED')
    require(archive.get('sha256') == sha(encoded(state)) and archive.get('path', '').startswith('/opt/naumi-staging/evidence/'),
            'EXACT_CANONICAL_ARCHIVE_REQUIRED')
    require(len(incident_digest) == 64, 'INCIDENT_DIGEST_REQUIRED')
    return {'releaseId': config['releaseId'], 'phase': 'BASELINED', 'predecessorReleaseId': predecessor['releaseId'],
            'predecessor': copy.deepcopy(archive), 'historicalSuccessorDigest': sha(encoded(prior)),
            'incidentSha256': incident_digest, 'historicalDrainReclassified': False, 'paidOutputRecovered': False,
            'authorization': config['authorization'], 'operations': {}, 'retired': []}


def current_drained(app, domain, worker, owners, rows, held, digest):
    check_incidents(rows, held, digest)
    transport = app.get('transport', {})
    t = transport.get('transport', {})
    require(transport.get('verified') is True and t.get('completeFromProcessStart') is True and
            t.get('accountingFault') is False and t.get('activeRequests') == 0 and
            t.get('startedRequests') == t.get('finishedRequests'), 'CURRENT_HTTP_NOT_DRAINED')
    obs = app.get('observations', {})
    require(app.get('admission', {}).get('mode') == 'draining' and all(type(obs.get(k)) is int and obs[k] == 0
            for k in ['activeRequests','trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases']) and
            all(o.get('state') == 'idle' for o in owners), 'CURRENT_WORK_OR_UNKNOWN_BLOCKS_RETIREMENT')
    require(domain.get('drained') is True and domain.get('absentTables') == [] and
            set(domain.get('counts', {})) == {'imageJobs','canvasImages','videoPolls','supplierCosts','imagegenItems'} and
            all(type(v) is int and v == 0 for v in domain['counts'].values()) and
            all(type(domain.get(k)) is int and domain[k] == 0 for k in ['activeFences','activeTransactions','advisoryLocks']),
            'CURRENT_DOMAIN_NOT_DRAINED')
    require(worker.get('paused') is True and worker.get('activeTicks') == 0 and worker.get('unresolvedTicks') == 0 and
            worker.get('phase') == 'QUIESCENT' and (worker.get('lastTick') or {}).get('phase') not in ['unknown','dispatched'],
            'CURRENT_WORKER_NOT_DRAINED')
    return {'kind':'normal-current-slot-drain', 'currentExecutableWorkDrained':True, 'historicalDrainProven':False,
            'historicalUnknownObservationsPreserved':2, 'currentUnknownObservations':0, 'paidOutputRecovered':False,
            'incidentSha256':digest, 'rawApp':app, 'rawDomain':domain, 'rawWorker':worker, 'rawOwners':owners}
