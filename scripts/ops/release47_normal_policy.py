"""Successive blue/green journal policy. Historical successor and incidents stay immutable."""
import copy
import datetime as dt
import re
from release47_host import require, sha
from release47_recovery_supervisor import encoded
from release47_authorized_successor import check_incidents


def begin(state, config, archive, incident_digest, at=None):
    at = at or dt.datetime.now(dt.timezone.utc)
    require(config.get('target') == '47.105.59.142' and config.get('authorization') in
            ['那你把上一轮发布未收尾的问题处理好，然后把这次修复上线，别影响正在使用的用户。','解决管理后台其他地方查询慢的问题，全部解决','这种问题解决了没有，如果没解决，就解决并上线','优化一下管理后台查询用户操作记录加载过慢的问题，优化好之后，合并所有分支进行一次上线','合并所有分支，然后上线服务器，退役旧容器','合并分支，上线服务器','你先上线一次服务器，然后再进行接下来的修复和优化',
             '你做个监控，迁移完之后，上线，我要最终结果，上线，明白吧，中间遇到的问题自己解决，不要询问我，我去睡觉了',
             '将seedance kling wan h3家族群为视频节点配置并启用'], 'EXPLICIT_NORMAL_RELEASE_AUTHORIZATION_REQUIRED')
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


def worker_media_healthy(worker):
    if not isinstance(worker,dict):
        return False
    if 'mediaWorker' not in worker:
        return True
    media=worker.get('mediaWorker')
    return bool(isinstance(media,dict) and media.get('ok') is True and
        isinstance(worker.get('commit'),str) and bool(re.fullmatch('[a-f0-9]{40}',worker['commit'])) and
        media.get('version')==worker['commit'] and media.get('sandbox') is True and
        type(media.get('draining')) is bool and all(type(media.get(k)) is int and
        0<=media[k]<=9007199254740991 for k in ['running','queued','terminal','maxActive']) and media['maxActive']>0 and
        type(media.get('concurrency')) is int and media['concurrency']==1)

def worker_quiescent(worker, preserved_tick=None):
    if not worker_media_healthy(worker):
        return False
    if 'mediaWorker' in worker and (worker['mediaWorker']['draining'] is not True or
            worker['mediaWorker']['running']!=0 or worker['mediaWorker']['queued']!=0):
        return False
    if worker.get('paused') is not True or worker.get('activeTicks') != 0 or worker.get('controlFault'):
        return False
    if worker.get('unresolvedTicks') == 0:
        return worker.get('phase') == 'QUIESCENT' and (worker.get('lastTick') or {}).get('phase') not in ['unknown','dispatched']
    tick=worker.get('lastTick') or {}
    old_authorized=bool(preserved_tick and preserved_tick.get('authorization')=='保留并隔离旧任务，继续切换'
                        and preserved_tick.get('domainJobsQuarantined')==43)
    new_authorized=bool(preserved_tick and preserved_tick.get('authorization')=='赶紧的切换，磨磨唧唧的，遵循指令好吗'
                        and preserved_tick.get('domainJobsQuarantined')==13
                        and len(set(preserved_tick.get('quarantinedJobIds',[])))==13
                        and re.fullmatch('[a-f0-9]{64}',preserved_tick.get('isolationReceiptSha256','')))
    nas_authorized=bool(preserved_tick and preserved_tick.get('authorization')=='那你把上一轮发布未收尾的问题处理好，然后把这次修复上线，别影响正在使用的用户。'
                       and preserved_tick.get('disposition')=='preserve-unknown-scanner-no-replay'
                       and preserved_tick.get('serverReceiptAbsent') is True
                       and re.fullmatch('[a-f0-9]{64}',preserved_tick.get('isolationReceiptSha256',''))
                       and preserved_tick.get('reviewedDomainJobs')==14)
    return bool(preserved_tick and (old_authorized or new_authorized or nas_authorized) and worker.get('unresolvedTicks')==1
        and worker.get('phase')=='UNKNOWN' and tick.get('phase')=='unknown'
        and all(tick.get(k)==preserved_tick.get(k) for k in ['id','workerBootId','workerInstanceId','workerCommit','targetWebInstanceId'])
        and tick.get('id') and preserved_tick.get('paidReplayAllowed') is False)

def current_drained(app, domain, worker, owners, rows, held, digest, preserved_tick=None):
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
    require(worker_quiescent(worker,preserved_tick),'CURRENT_WORKER_NOT_DRAINED')
    return {'kind':'normal-current-slot-drain', 'currentExecutableWorkDrained':True, 'historicalDrainProven':False,
            'historicalUnknownObservationsPreserved':2, 'currentUnknownObservations':0, 'paidOutputRecovered':False,
            'incidentSha256':digest, 'rawApp':app, 'rawDomain':domain, 'rawWorker':worker, 'rawOwners':owners,
            'preservedUnresolvedScannerTick':copy.deepcopy(preserved_tick), 'scannerReceiptCompleted':worker.get('unresolvedTicks')==0}


def worker_completed(status):
    return worker_media_healthy(status) and (status.get('lastTick') or {}).get('phase') == 'complete' and status.get('unresolvedTicks') == 0
