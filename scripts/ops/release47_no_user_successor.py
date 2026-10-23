#!/usr/bin/env python3
"""One explicitly authorized 47 no-user maintenance-window successor.

Offline: validate_config / --check-config. Live: main owns ONE existing three-lock
transaction and canonical CAS throughout. No policy constants or old authorization
are rewritten. Candidate creation/static extraction uses no running candidate RAM;
public maintenance and genuine current-work drain precede old-slot retirement.
Failure keeps permission-preserving HTTP 503; prior-program recovery needs a
separate compatibility/drain review, never a DB restore or accepted-task replay.
"""
from __future__ import annotations
import argparse
import copy
import datetime as dt
import json
import os
import pathlib
import re
import secrets
import time
import uuid

import release47_normal_controller as ctl
import release47_recovery_supervisor as recovery
import release47_task_snapshot as tasks
import release_client_compat as compat
import release47_imagegen_simplify_successor as imagegen
from release47_host import Hold, LOCKS, environment, file_sha, public_identity, require, sha
from release47_imagegen_simplify_successor import ImagegenSimplifyController, pinned_json, matches, mem_available
from release47_saas_successor import SaasController, CASE05_BASELINE, CASE05_SHA256, syntax_check
from release47_video_family_successor import VideoFamilyController, MIB
from saas_recovery_gateway import render
from saas_maintenance_probe import validate_ingress, probe_maintenance
from release47_preserved_unknown import Guard, exact_json, literal

AUTHORIZATION = '合并所有分支然后上线发布新服务器，明确要求旧容器可以直接退役，当前无用户使用，同时给新版加内存预算，防止被系统杀死'
SCOPE = ['47-only', 'all-completed-branches', 'authorized-no-user-maintenance', 'post-oom-memory-budget']
PREFIX = 'release47-no-user-'
EVIDENCE, RELEASES = imagegen.EVIDENCE, imagegen.RELEASES
PERMISSION_CASES = {'anonymous-admin', 'platform-admin', 'tenant-owner', 'cross-tenant', 'dual-cookie'}

def validate_config(cfg):
    require(cfg.get('target') == '47.105.59.142' and cfg.get('authorization') == AUTHORIZATION
            and cfg.get('scope') == SCOPE and matches(PREFIX + '[a-z0-9-]{6,55}', cfg.get('releaseId')),
            'EXACT_NO_USER_SUCCESSOR_AUTHORIZATION_AND_SCOPE_REQUIRED')
    require(cfg.get('recoveryMode') == 'saas-controlled-maintenance'
            and all(cfg.get(k) is False for k in ('restoreDatabase', 'replayAcceptedTasks', 'activateDisabledModels')),
            'PERMISSION_PRESERVING_NON_REPLAY_RECOVERY_REQUIRED')
    require(cfg.get('preservedUnknown') == {'baselinePath': CASE05_BASELINE,
            'baselineSha256': CASE05_SHA256, 'allowedAdditiveColumns': {}}, 'EXACT_ORIGINAL_CASE05_BASELINE_REQUIRED')
    require(not any(cfg.get(k) for k in ('resumeReview', 'resumeReady', 'resumeCutback', 'finishPromoted',
            'preservedWorkerTick', 'nasRollbackManifestPath', 'reviewedNasSidecars')),
            'NO_OLD_TRANSACTION_OR_UNKNOWN_EXCEPTION')
    root = pathlib.PurePosixPath(cfg.get('evidenceRoot', ''))
    state = pathlib.PurePosixPath(cfg.get('stateDir', ''))
    require(root.parent == EVIDENCE and root.name == cfg['releaseId'] and state.parent == RELEASES
            and state.name == cfg['releaseId'], 'FRESH_RELEASE_OWNED_PATHS_REQUIRED')
    require(cfg.get('previousNormalReleaseId') == cfg.get('predecessorReleaseId')
            and matches('release47-[a-z0-9-]+', cfg.get('predecessorReleaseId'))
            and cfg['predecessorReleaseId'] != cfg['releaseId'], 'EXACT_FRESH_PREDECESSOR_REQUIRED')
    require(type(cfg.get('expectedRevision')) is int and cfg['expectedRevision'] >= 0
            and all(matches('[a-f0-9]{64}', cfg.get(k)) for k in
                    ('expectedCanonicalDigest', 'expectedCanonicalFileSha256', 'expectedGatewayDigest')),
            'FRESH_CANONICAL_AND_GATEWAY_PINS_REQUIRED')
    require(matches('[a-f0-9]{40}', cfg.get('commit')) and matches('sha256:[a-f0-9]{64}', cfg.get('image'))
            and matches('[0-9]{10,13}', cfg.get('version'))
            and matches('[a-f0-9]{64}', cfg.get('imageArchiveSha256')),
            'FIXED_COMMIT_IMAGE_BUILD_ARCHIVE_REQUIRED')
    require(pathlib.PurePosixPath(cfg.get('imageArchive', '')).is_absolute()
            and pathlib.PurePosixPath(cfg.get('cookiePath', '')).is_absolute()
            and pathlib.PurePosixPath(cfg.get('oldWebStateDir', '')).is_relative_to(RELEASES)
            and isinstance(cfg.get('expectedConfigurationFacts'), list) and cfg['expectedConfigurationFacts'],
            'CURRENT_RUNTIME_CONFIG_AND_PRIVATE_PATHS_REQUIRED')
    names = [cfg.get(k, {}).get('name') for k in ('oldWeb', 'oldWorker')] + [cfg.get('newWebName'), cfg.get('newWorkerName')]
    require(all(matches('naumi47-[A-Za-z0-9_.-]{1,80}', v) for v in names)
            and len(set(names)) == 4, 'DISTINCT_PINNED_SLOT_NAMES_REQUIRED')
    for key in ('oldWeb', 'oldWorker'):
        pin = cfg[key]
        require(set(pin) == {'id', 'name', 'image', 'running', 'startedAt', 'restartPolicy'}
                and matches('[a-f0-9]{64}', pin['id']) and matches('sha256:[a-f0-9]{64}', pin['image'])
                and pin['running'] is True and isinstance(pin['startedAt'], str) and pin['startedAt']
                and isinstance(pin['restartPolicy'], str), 'FULL_CURRENT_SLOT_IDENTITY_REQUIRED')
    require(all(type(cfg.get(k)) is int and 13000 <= cfg[k] <= 13999 for k in ('oldPort', 'newPort'))
            and cfg['oldPort'] != cfg['newPort'], 'DISTINCT_LOOPBACK_PORTS_REQUIRED')
    ram = cfg.get('memoryReview', {})
    integers = ('webMinMiB', 'webMaxMiB', 'webPeakMiB', 'workerPeakMiB', 'hostReserveMiB',
                'predecessorWebMiB', 'predecessorWorkerMiB')
    require(all(type(ram.get(k)) is int and ram[k] > 0 for k in integers)
            and ram.get('observedWebOomMiB') == 2048 and ram.get('reviewed') is True
            and isinstance(ram.get('rationale'), str) and bool(ram['rationale'].strip())
            and 2048 < ram['webMinMiB'] <= cfg.get('webMemoryMiB', 0) <= ram['webMaxMiB']
            and type(cfg.get('webMemoryMiB')) is int and cfg.get('webFinalMemoryMiB') == cfg['webMemoryMiB']
            and ram['webPeakMiB'] >= cfg['webMemoryMiB'] and ram['workerPeakMiB'] >= 1024
            and ram['hostReserveMiB'] >= 1024 and ram['predecessorWorkerMiB'] == 1024
            and cfg.get('workerMemoryMiB') == 1024 and cfg.get('reviewedCombinedMedia') is True,
            'EXPLICIT_POST_2G_OOM_REVIEWED_RAM_RANGE_REQUIRED')
    media = cfg.get('combinedMedia', {})
    require(isinstance(media, dict) and set(media) == {'workerName', 'secret', 'scratchSource'}
            and media['workerName'] == cfg['newWorkerName']
            and matches('naumi47-worker-video-family-[a-z0-9-]+', media['workerName'])
            and isinstance(media['secret'], str) and 48 <= len(media['secret']) <= 128
            and media['scratchSource'] == '/opt/naumi-staging/data/video-media-jobs'
            and cfg.get('videoReferencePublicOrigin') == 'https://47.105.59.142', 'COMBINED_MEDIA_BINDING_REQUIRED')
    require(pathlib.PurePosixPath(cfg.get('storageAcceptanceScript', '')).parent == root / 'tools'
            and matches('[a-f0-9]{64}', cfg.get('storageAcceptanceSha256'))
            and matches('/data/isolated-provider-probes/provider-video-probe-20261023/[A-Za-z0-9_.-]+\\.mp4', cfg.get('mediaProbePath'))
            and matches('[a-f0-9]{64}', cfg.get('mediaProbeSha256')), 'PINNED_REAL_STORAGE_ACCEPTANCE_REQUIRED')
    operations = cfg.get('imageAcceptanceOperations')
    require(isinstance(operations, list) and operations and all(matches('[a-fA-F0-9-]{36}', v) for v in operations)
            and len(set(operations)) == len(operations), 'EXISTING_REAL_IMAGE_OPERATIONS_REQUIRED')
    for key in ('localAcceptance', 'recoveryIngressAudit', 'predecessorRecoveryReview'):
        spec = cfg.get(key, {})
        require(isinstance(spec, dict) and set(spec) == {'path', 'sha256'}
                and pathlib.PurePosixPath(spec['path']).parent == root
                and matches('[a-f0-9]{64}', spec['sha256']), 'PINNED_SUCCESSOR_REVIEW_REQUIRED:' + key)
    cases = cfg.get('permissionChecks', [])
    require(isinstance(cases, list) and len(cases) == len(PERMISSION_CASES)
            and {r.get('name') for r in cases} == PERMISSION_CASES, 'LIVE_PERMISSION_MATRIX_REQUIRED')
    for row in cases:
        allowed = ([200] if row['name'] in ('platform-admin', 'tenant-owner') else
                   [403, 404] if row['name'] == 'dual-cookie' else [401, 403, 404])
        route = '/api/admin/' if row['name'] in ('anonymous-admin', 'platform-admin') else '/api/enterprise/'
        require(matches('/api/[A-Za-z0-9_/?=&.%:-]+', row.get('path'))
                and row['path'].startswith(route)
                and type(row.get('status')) is int and row['status'] in allowed
                and (row.get('cookiePath') is None if row['name'] == 'anonymous-admin'
                     else pathlib.PurePosixPath(row.get('cookiePath', '')).is_absolute()),
                'EXACT_READ_ONLY_PERMISSION_CASE_REQUIRED')
        if row['name'] == 'dual-cookie':
            require(matches('/api/enterprise/saas-overview\\?tenantId=[a-fA-F0-9-]{36}', row['path']),
                    'DUAL_COOKIE_FOREIGN_ENTERPRISE_SCOPE_REQUIRED')
    require(cfg.get('date') == '2026-10-23', 'EXPLICIT_OCT23_NO_USER_WINDOW_REQUIRED')
    window = cfg.get('maintenanceWindow', {})
    require(isinstance(window, dict) and set(window) == {'noUsersConfirmed', 'retireOldBeforeCandidate',
            'preserveAcceptedTasks', 'confirmedAt', 'expiresAt'} and all(window.get(k) is True for k in
            ('noUsersConfirmed', 'retireOldBeforeCandidate', 'preserveAcceptedTasks')),
            'EXPLICIT_NO_USER_RETIREMENT_WINDOW_REQUIRED')
    try:
        confirmed, expires = [dt.datetime.fromisoformat(window[k].replace('Z', '+00:00'))
                              for k in ('confirmedAt', 'expiresAt')]
        require(confirmed.tzinfo is not None and expires.tzinfo is not None
                and 0 < (expires-confirmed).total_seconds() <= 24*3600
                and all(v.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat() == cfg['date']
                        for v in (confirmed, expires)), 'BOUNDED_NO_USER_WINDOW_REQUIRED')
    except (ValueError, TypeError, AttributeError):
        raise Hold('BOUNDED_NO_USER_WINDOW_REQUIRED') from None
    require(type(ram.get('webHeapMiB')) is int and ram['webHeapMiB'] >= 256
            and type(ram.get('nativeReserveMiB')) is int and ram['nativeReserveMiB'] >= 768
            and ram['webHeapMiB'] + ram['nativeReserveMiB'] <= cfg['webMemoryMiB'],
            'EXPLICIT_HEAP_AND_SHARP_NATIVE_RESERVE_REQUIRED')
    env = cfg.get('reviewedMemoryEnvironment', {})
    allowed = {'NODE_OPTIONS', 'MALLOC_ARENA_MAX', 'VIPS_CONCURRENCY',
        'NAUMI_NATIVE_MEMORY_PROFILE', 'UV_THREADPOOL_SIZE',
        'NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE', 'NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN',
        'NAUMI_IMAGE_JOB_CONCURRENCY_SUITE', 'NAUMI_IMAGE_JOB_CONCURRENCY_APLUS'}
    require(isinstance(env, dict) and env == ram.get('environment') and 'NODE_OPTIONS' in env
            and set(env).issubset(allowed)
            and {'NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE', 'NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN',
                 'NAUMI_IMAGE_JOB_CONCURRENCY_SUITE', 'NAUMI_IMAGE_JOB_CONCURRENCY_APLUS'}.issubset(env)
            and env['NODE_OPTIONS'] == '--max-old-space-size=' + str(ram['webHeapMiB'])
                + ' --require=/app/scripts/runtime-memory.cjs --require=/app/scripts/release-http-observer.cjs'
            and env.get('NAUMI_NATIVE_MEMORY_PROFILE') == 'bounded'
            and env.get('MALLOC_ARENA_MAX') == '2' and env.get('UV_THREADPOOL_SIZE') == '2'
            and env.get('VIPS_CONCURRENCY') == '1'
            and all(isinstance(v, str) and (k in ('NODE_OPTIONS', 'NAUMI_NATIVE_MEMORY_PROFILE') or matches('[1-9][0-9]{0,2}', v))
                    for k, v in env.items())
            and all(1 <= int(v) <= 256 for k, v in env.items() if k.startswith('NAUMI_IMAGE_JOB_CONCURRENCY_')),
            'EXPLICIT_BOUND_MEMORY_ENVIRONMENT_REQUIRED')
    validate_dead_boot_config(cfg)


def check_window(cfg, at=None):
    at = at or dt.datetime.now(dt.timezone.utc)
    window = cfg['maintenanceWindow']
    start, end = [dt.datetime.fromisoformat(window[k].replace('Z', '+00:00'))
                  for k in ('confirmedAt', 'expiresAt')]
    require(at.tzinfo is not None and start <= at <= end, 'NO_USER_WINDOW_EXPIRED_OR_NOT_STARTED')


def validate_dead_boot_config(cfg):
    """Optional, exact NoUser manifest; never broadens the global tick policy."""
    pin = cfg.get('deadBootPreservation')
    if not pin:
        return
    import release47_dead_boot_preservation as deadboot
    require(isinstance(pin, dict) and set(pin) == {'oldWeb', 'currentBoot', 'physicalStartedAt',
            'environment', 'expectedReviewSha256', 'expectedActivities', 'expectedJobs',
            'jobIds', 'extraRows', 'workerTick'}, 'NO_USER_DEAD_BOOT_FULL_BINDING_REQUIRED')
    require(pin['oldWeb'] == cfg['oldWeb'] and pin['physicalStartedAt'] == cfg['oldWeb']['startedAt']
            and matches('[0-9a-f-]{36}', pin['currentBoot']), 'NO_USER_DEAD_BOOT_IDENTITY_REQUIRED')
    # Guard validates its staging environment and external review hash too.
    deadboot.Guard(pin, None, None)
    for key, count in (('expectedActivities', 24), ('expectedJobs', 21)):
        pins = pin[key]
        require(isinstance(pins, dict) and len(pins) == count
                and all(isinstance(k, str) and deadboot.IDENT.fullmatch(k)
                        and isinstance(v, str) and deadboot.SHA.fullmatch(v) for k,v in pins.items()),
                'NO_USER_DEAD_BOOT_EXACT_ROW_PINS_REQUIRED')
    deadboot.ids(pin['jobIds'])
    jobs, batches, refs, _ = deadboot._parts(pin['oldWeb'],
        {'identity': {'instanceId': pin['oldWeb']['name'], 'bootId': pin['currentBoot']}},
        pin['jobIds'], pin['extraRows'])
    require(set(jobs) == set(pin['expectedJobs']) and len(batches) == 2 and len(refs) == 2
            and len(jobs) + len(batches) + len(refs) == 25, 'NO_USER_DEAD_BOOT_EXACT_FENCE_MANIFEST_REQUIRED')
    for row in pin['extraRows']:
        require(set(row).issubset({'table', 'keyColumn', 'rowKey', 'sha256', 'linkProofSha256'})
                and matches('[a-f0-9]{64}', row.get('sha256'))
                and (row['table'] != 'app_image_jobs' or
                     row['sha256'] == pin['expectedJobs'][row['rowKey']]
                     and matches('[a-f0-9]{64}', row.get('linkProofSha256'))),
                'NO_USER_DEAD_BOOT_EXTRA_ROW_PIN_REQUIRED')
    tick = pin['workerTick']
    require(isinstance(tick, dict) and set(tick) == {'worker', 'physicalStartedAt', 'identity', 'lastTick'}
            and tick['worker'] == cfg['oldWorker']
            and tick['physicalStartedAt'] == cfg['oldWorker']['startedAt'], 'NO_USER_WORKER_PHYSICAL_PIN_REQUIRED')
    identity, last = tick['identity'], tick['lastTick']
    require(isinstance(identity, dict) and set(identity) == {'instanceId', 'bootId', 'commit', 'origin', 'targetInstanceId'}
            and identity['instanceId'] == cfg['oldWorker']['name']
            and matches('[0-9a-f-]{36}', identity['bootId']) and matches('[a-f0-9]{40}', identity['commit'])
            and identity['origin'] == 'http://' + cfg['oldWeb']['name'] + ':3000'
            and identity['targetInstanceId'] == cfg['oldWeb']['name']
            and isinstance(last, dict) and last.get('phase') == 'unknown'
            and matches('[0-9a-f-]{36}', last.get('id'))
            and matches('[0-9a-f-]{36}', last.get('workerBootId'))
            and last['workerBootId'] == identity['bootId']
            and last.get('workerInstanceId') == identity['instanceId']
            and last.get('workerCommit') == identity['commit']
            and last.get('targetWebInstanceId') == identity['targetInstanceId'],
            'NO_USER_COMPLETE_HISTORICAL_WORKER_TICK_REQUIRED')
    try:
        start, finish = deadboot.timestamp(last['startedAt']), deadboot.timestamp(last['finishedAt'])
        require(deadboot.timestamp(tick['physicalStartedAt']) <= start <= finish
                < deadboot.timestamp(pin['physicalStartedAt'])
                and (dt.datetime.now(dt.timezone.utc)-finish).total_seconds() > 600,
                'NO_USER_WORKER_TICK_NOT_HISTORICAL')
    except (KeyError, ValueError, TypeError, AttributeError):
        raise Hold('NO_USER_WORKER_TICK_NOT_HISTORICAL') from None


def begin(state, cfg, archive, incident_digest, at=None):
    """Same normal journal invariants, with this authorization kept verbatim."""
    validate_config(cfg)
    at = at or dt.datetime.now(dt.timezone.utc)
    check_window(cfg, at)
    require(cfg.get('date') == at.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat(), 'RELEASE_DATE_CHANGED')
    require(state.get('target') == cfg['target'] and state.get('revision') == cfg['expectedRevision']
            and sha(recovery.encoded(state)) == cfg['expectedCanonicalDigest'], 'CANONICAL_REVIEW_CHANGED')
    require(state.get('phase') == 'MIGRATED_CLEANUP_PENDING' and state.get('legacyDrainProven') is False,
            'HISTORICAL_INCIDENT_BOUNDARY_CHANGED')
    prior = state.get('blueGreenSuccessor', {})
    require(prior.get('phase') == 'COMPLETE' and prior.get('releaseId') == 'release47-alldev-20261018', 'HISTORICAL_SUCCESSOR_CHANGED')
    require(state.get('runtimeRecovery', {}).get('phase') == 'ACKNOWLEDGED'
            and all(o.get('phase') == 'ACKNOWLEDGED' for o in state.get('operations', {}).values()), 'PENDING_PRIOR_OPERATION')
    journal = state.get('normalBlueGreenReleases', {})
    require(cfg['releaseId'] not in journal and all(r.get('phase') in ('COMPLETE', 'ROLLED_BACK')
            and all(o.get('phase') == 'ACKNOWLEDGED' for o in r.get('operations', {}).values())
            for r in journal.values()), 'PREVIOUS_NORMAL_RELEASE_REQUIRES_RECONCILIATION')
    active = state.get('activeNormalBlueGreenReleaseId')
    require(active == cfg['predecessorReleaseId'] and journal.get(active, {}).get('phase') == 'COMPLETE'
            and state['runtimeRecovery'].get('successorReleaseId') == active, 'ACTIVE_PREDECESSOR_CHANGED')
    require(archive.get('sha256') == sha(recovery.encoded(state))
            and archive.get('path', '').startswith(str(EVIDENCE) + '/')
            and matches('[a-f0-9]{64}', incident_digest), 'EXACT_CANONICAL_ARCHIVE_AND_INCIDENT_REQUIRED')
    return {'releaseId': cfg['releaseId'], 'phase': 'BASELINED', 'predecessorReleaseId': active,
            'predecessor': copy.deepcopy(archive), 'historicalSuccessorDigest': sha(recovery.encoded(prior)),
            'incidentSha256': incident_digest, 'historicalDrainReclassified': False, 'paidOutputRecovered': False,
            'authorization': AUTHORIZATION, 'scope': list(SCOPE), 'operations': {}, 'retired': []}

def configure(cfg):
    # Deliberately not ctl.configure(neutralized-old-values): that would conceal
    # the reviewed post-OOM RAM from the old <=2GiB gate.
    validate_config(cfg)
    ctl.ROOT = pathlib.Path(cfg['evidenceRoot'])
    ctl.OLDWEB, ctl.OLDWORKER = cfg['oldWeb']['name'], cfg['oldWorker']['name']
    ctl.WEB, ctl.WORKER, ctl.RELEASE = cfg['newWebName'], cfg['newWorkerName'], cfg['releaseId']
    ctl.STATE, ctl.COOKIE = cfg['stateDir'], pathlib.Path(cfg['cookiePath'])

def predecessor_proof(tx, state, cfg):
    require(sha(ctl.CANON.read_bytes()) == cfg['expectedCanonicalFileSha256'], 'CANONICAL_FILE_CAS_CHANGED')
    # begin is read-only; it also refuses every pending/UNKNOWN historical op.
    begin(state, cfg, {'path': cfg['evidenceRoot'] + '/preflight.json',
                      'sha256': sha(recovery.encoded(state))}, '0' * 64)
    prior = state['normalBlueGreenReleases'][cfg['predecessorReleaseId']]
    retired = prior.get('retired', [])
    require(len(retired) == 2 and len(set(retired)) == 2, 'PREDECESSOR_RETIREMENT_INCOMPLETE')
    for identifier in retired:
        row = tx.inspect(identifier)
        require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name'] == 'no', 'PRIOR_SLOT_NOT_RETIRED')
    for role, key, field in [('web', 'oldWeb', 'predecessorWebMiB'), ('worker', 'oldWorker', 'predecessorWorkerMiB')]:
        require(all(prior.get(role, {}).get(k) == cfg[key][k] for k in ('id', 'name', 'image')),
                'PREDECESSOR_SLOT_IDENTITY_CHANGED')
        row = tx.pin(cfg[key])
        require(row['State']['Running'] and row['HostConfig']['Memory'] == cfg['memoryReview'][field] * MIB,
                'PREDECESSOR_REVIEWED_MEMORY_CHANGED')
    runtime = state['runtimeRecovery']
    review = pinned_json(cfg, 'predecessorRecoveryReview')
    manifest_path = pathlib.Path(runtime['manifestPath'])
    require(review.get('kind') == 'current-saas-recovery-review' and review.get('evidenceMode') == 'live'
            and review.get('target') == cfg['target'] and review.get('releaseId') == cfg['predecessorReleaseId']
            and review.get('canonicalFileSha256') == cfg['expectedCanonicalFileSha256']
            and review.get('manifestPath') == str(manifest_path) and review.get('manifestSha256') == file_sha(manifest_path)
            and review.get('gatewayDumpSha256') == cfg['expectedGatewayDigest'], 'LATEST_MANAGED_RECOVERY_REVIEW_REQUIRED')
    manifest = json.loads(manifest_path.read_bytes())
    recovery.recovery_binding(state, manifest)
    require(manifest.get('gatewayDumpSha256') == cfg['expectedGatewayDigest']
            and manifest.get('image') == cfg['oldWeb']['image'] == cfg['oldWorker']['image']
            and review.get('priorCommit') == manifest.get('commit')
            and review.get('priorBuildVersion') == manifest.get('buildVersion'), 'LATEST_MANAGED_MANIFEST_GATEWAY_CHANGED')
    for role, key in [('web', 'oldWeb'), ('worker', 'oldWorker')]:
        row = tx.pin(cfg[key])
        env = environment(row)
        require(manifest[role]['id'] == cfg[key]['id']
                and manifest[role]['staticSha256'] == recovery.static_pin(row)
                and env.get('SOURCE_COMMIT') == manifest['commit'] and env.get('BUILD_VERSION') == manifest['buildVersion'],
                'PREDECESSOR_MANAGED_PROGRAM_CHANGED')
    maintenance = review.get('maintenanceReport', {})
    managed = runtime.get('controlledMaintenanceReport', {})
    require(all(managed.get(k) == maintenance.get(k) for k in ('path', 'sha256'))
            and managed.get('gatewayDumpSha256') == cfg['expectedGatewayDigest'], 'LATEST_MANAGED_MAINTENANCE_POINTER_REQUIRED')
    path = pathlib.Path(maintenance.get('path', ''))
    require(path.is_file() and not path.is_symlink() and file_sha(path) == maintenance.get('sha256'), 'CURRENT_MAINTENANCE_CLOSURE_CHANGED')
    report = json.loads(path.read_bytes())
    require(report.get('beforeDumpSha256') == cfg['expectedGatewayDigest'], 'STALE_R1_MAINTENANCE_CLOSURE')
    proof = {'releaseId': cfg['predecessorReleaseId'], 'phase': 'COMPLETE', 'retiredIds': retired,
             'manifestSha256': review['manifestSha256'], 'maintenanceReport': maintenance,
             'historicalUnknownsCleared': False, 'memoryReview': cfg['memoryReview']}
    tx.save('NO_USER_PREDECESSOR_PUBLICATION.json', proof)
    return proof

def ram_budget(available_bytes, web_current_bytes, worker_current_bytes, cfg):
    require(all(type(v) is int and v >= 0 for v in
                (available_bytes, web_current_bytes, worker_current_bytes)), 'UNKNOWN_FRESH_MEMORY_OBSERVATION')
    ram = cfg['memoryReview']
    required = (max(0, ram['webPeakMiB'] * MIB-web_current_bytes)
                + max(0, ram['workerPeakMiB'] * MIB-worker_current_bytes)
                + ram['hostReserveMiB'] * MIB)
    return {'passed': available_bytes >= required, 'availableBytes': available_bytes,
            'requiredAvailableBytes': required, 'availableMiB': available_bytes//MIB,
            'requiredAvailableMiB': (required+MIB-1)//MIB,
            'webCurrentBytes': web_current_bytes, 'workerCurrentBytes': worker_current_bytes,
            'oldRetirementCreditBytes': 0, 'swapIncluded': False, 'fileCacheCredited': False,
            'budget': copy.deepcopy(ram)}


class FrozenConfigurationGuard(Guard):
    """Keep the skipped task's immutable versions, not an obsolete active pointer.

    The original baseline, eight core rowsets, leases and activities stay exact.
    Separately bind the current site config to the fresh reviewed release facts.
    Never change the old Guard or relabel any original task/operation.
    """
    def __init__(self, *args, current_facts, expected_facts, **kwargs):
        super().__init__(*args, **kwargs)
        self.current_facts, self.expected_facts = current_facts, copy.deepcopy(expected_facts)

    def _invariants(self):
        d = self.original
        if d.get('generationPosts') != 0:
            raise ValueError('POST_DECLARATION_INVALID')
        task = literal(d['taskId'])
        predicates = self._predicates()
        expected = {k: d[k] for k in ('model', 'billing', 'leases', 'activity')}
        query = """SELECT jsonb_build_object(
          'model',(SELECT jsonb_build_object('version',v.version::text,'digest',v.digest,'config_md5',md5(v.config::text))
                   FROM app_model_config_versions v WHERE v.version::text=MODEL_VERSION),
          'billing',(SELECT jsonb_build_object('version',v.version::text,'config_md5',md5(v.config::text))
                     FROM app_billing_config_versions v WHERE v.version::text=BILLING_VERSION),
          'leases',(SELECT jsonb_build_object('pollLockPresent',poll_lock_until IS NOT NULL,
                     'pollLockFuture',COALESCE(poll_lock_until>now(),false),'nextPollPresent',next_poll_at IS NOT NULL)
                     FROM app_video_tasks WHERE id=TASK_ID),
          'activity',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb)
                      FROM app_release_activities t WHERE state<>'finished' AND ACTIVITY_PREDICATE))
           = EXPECTED_VALUE::jsonb AS match"""
        query = (query.replace('MODEL_VERSION', literal(d['model']['version']))
                 .replace('BILLING_VERSION', literal(d['billing']['version']))
                 .replace('TASK_ID', task).replace('ACTIVITY_PREDICATE', predicates['app_release_activities'])
                 .replace('EXPECTED_VALUE', literal(exact_json(expected))))
        result = self._one("SELECT json_build_object('match',q.match) FROM (" + query + ') q;')
        if result.get('match') is not True:
            raise ValueError('ORIGINAL_FROZEN_CONFIGURATION_OR_INVARIANT_CHANGED')
        if self.current_facts() != self.expected_facts:
            raise ValueError('CURRENT_REVIEWED_CONFIGURATION_CHANGED')


class NoUserController(ImagegenSimplifyController):
    def __init__(self, tx, cfg):
        validate_config(cfg)
        require(tx.stack is not None and len(tx.lock_fds) == 3 and tx.spec['locks'] == LOCKS,
                'WHOLE_THREE_LOCK_TRANSACTION_REQUIRED')
        # The inherited constructor below is the unchanged real BI/normal one.
        # Only old authorization-specific constructors are not entered.
        VideoFamilyController.__init__(self, tx, cfg)
        local = pinned_json(cfg, 'localAcceptance')
        require(local.get('kind') == 'no-user-successor-prerelease-review'
                and local.get('sourceCommit') == cfg['commit'] and local.get('linuxBuildImage') == cfg['image']
                and str(local.get('buildVersion')) == cfg['version'] and local.get('scope') == SCOPE
                and local.get('priorImage') == cfg['oldWeb']['image']
                and local.get('memoryReview') == cfg['memoryReview']
                and all(local.get(k) is True for k in ('localAcceptancePassed', 'noUnresolvedP1P2',
                    'saasPermissionParityPassed', 'frozenQuotePgPassed', 'legacyImageBillingQuotePgPassed',
                    'legacyReceiptRecoveryPassed', 'controlledRecoveryFixturePassed', 'combinedWorkerMediaPassed',
                    'additiveSchemaCompatibilityPassed', 'nativeMemoryProfilePassed', 'memoryPressurePassed',
                    'revokedMembershipPgPassed')),
                'PINNED_NO_USER_LOCAL_ACCEPTANCE_INCOMPLETE')
        self.ingress = pinned_json(cfg, 'recoveryIngressAudit')
        require(self.ingress.get('evidenceMode') == 'live' and self.ingress.get('target') == cfg['target']
                and self.ingress.get('dumpSha256') == cfg['expectedGatewayDigest']
                and self.ingress.get('unaccountedNaumiPublicEndpoints') == [] and self.ingress.get('servers'),
                'CURRENT_PUBLIC_INGRESS_AUDIT_REQUIRED')
        validate_ingress(self.ingress)
        self.preserved_unknown = FrozenConfigurationGuard({**cfg['preservedUnknown'],
            'supplementalPath': str(tx.folder / 'CASE05_SUPPLEMENT.private.json')}, self.sql, tx.save,
            current_facts=self.configuration_facts, expected_facts=cfg['expectedConfigurationFacts'])
        self.quote_before = None
        self.old_retired = False
        self.entry_maintenance_proven = False
        self.retirement_drain = None
        self.dead_boot = None
        if cfg.get('deadBootPreservation'):
            import release47_dead_boot_preservation as deadboot
            self.dead_boot = deadboot.Guard(cfg['deadBootPreservation'], self.dead_boot_sql,
                tx.save, write_sql=self.dead_boot_write_sql)

    def dead_boot_sql(self, statement):
        # Helper owns its read transaction. self.sql would nest BEGIN READ ONLY
        # and prevent the separately authorized fence transaction from writing.
        env = environment(self.tx.pin(self.db))
        require(all(env.get(k) == self.de[k] for k in ('POSTGRES_USER', 'POSTGRES_DB')),
                'DEAD_BOOT_DATABASE_CREDENTIALS_CHANGED')
        raw = self.tx.run(['docker', 'exec', '-i', self.db['id'], 'psql', '-XqAt',
            '-v', 'ON_ERROR_STOP=1', '-U', self.de['POSTGRES_USER'], '-d', self.de['POSTGRES_DB']],
            stdin=statement.encode(), timeout=60)
        decoder, text, rows = json.JSONDecoder(), raw.decode(), []
        while text.strip():
            value, end = decoder.raw_decode(text.lstrip())
            rows.append(value)
            text = text.lstrip()[end:]
        return rows

    def dead_boot_write_sql(self, statement):
        require(self.succ.get('operations', {}).get('database-backup', {}).get('phase') == 'ACKNOWLEDGED',
                'FULL_DATABASE_BACKUP_BEFORE_DEAD_BOOT_FENCE_REQUIRED')
        return self.dead_boot_sql(statement)

    def dead_boot_app(self):
        guard = self.dead_boot
        env = environment(self.tx.pin(self.web))
        require(all(env.get(k) == v for k,v in guard.cfg['environment'].items()),
                'DEAD_BOOT_PHYSICAL_ENVIRONMENT_CHANGED')
        if self.web['running']:
            return ctl.c.app_status(self.tx, self.web)
        require(self.retirement_drain and self.retirement_drain.get('rawApp'),
                'DEAD_BOOT_ORIGINAL_APP_RECEIPT_REQUIRED')
        # Original HTTP identity only; exact DB rows are freshly checked below.
        return copy.deepcopy(self.retirement_drain['rawApp'])

    def check_dead_boot_unknown(self, app):
        require(type(app.get('observations', {}).get('unknownLeases')) is int
                and app['observations']['unknownLeases'] == len(self.dead_boot.review['app_release_activities']),
                'NO_USER_CURRENT_OR_EXTRA_UNKNOWN_WORK')

    def establish_dead_boot(self):
        if not self.cfg.get('deadBootPreservation'):
            return
        def exact_review():
            app = self.dead_boot_app()
            require(type(app.get('observations', {}).get('unknownLeases')) is int
                    and app['observations']['unknownLeases'] == 24, 'NO_USER_CURRENT_OR_EXTRA_UNKNOWN_WORK')
            # Failed exact validation saves nothing; successful establish runs once.
            return self.dead_boot.establish(self.cfg['oldWeb'], app)
        self.wait(exact_review, 'EXACT_DEAD_BOOT_PREFLIGHT', 120)
        self.wait(lambda: self.check_dead_boot('preflight'), 'EXACT_DEAD_BOOT_PREFLIGHT_CHECK', 120)

    def check_dead_boot(self, stage, app=None):
        if not self.cfg.get('deadBootPreservation'):
            return
        app = self.dead_boot_app() if app is None else app
        result = self.dead_boot.check(self.cfg['oldWeb'], app)
        self.check_dead_boot_unknown(app)
        if self.worker['running']:
            status = self.worker_control(self.worker, 'status', str(uuid.uuid4()))['state']
        else:
            require(self.retirement_drain is not None, 'DEAD_BOOT_ORIGINAL_WORKER_RECEIPT_REQUIRED')
            status = self.retirement_drain['rawWorker']
        require(self.old_worker_quiescent(status), 'NO_USER_HISTORICAL_WORKER_NOT_QUIESCENT')
        self.tx.save('NO_USER_DEAD_BOOT_CHECK-'+uuid.uuid4().hex+'.json', {
            'stage': stage, **result, 'freshOldHttpObservationClaimed': self.web['running']})
        return result

    def apply_dead_boot_fence(self, _operation):
        require(self.entry_maintenance_proven is True and self.old_drained is True
                and self.worker_paused is True, 'MAINTENANCE_AND_DRAIN_BEFORE_DEAD_BOOT_FENCE_REQUIRED')
        self.check_dead_boot('before-fence')
        receipt = self.dead_boot.apply(self.cfg['oldWeb'], self.dead_boot_app())
        require(receipt['fencedRows'] == 25 and receipt['carriedOldBootObservations'] == 24,
                'NO_USER_DEAD_BOOT_EXACT_FENCE_RECEIPT_REQUIRED')
        return receipt

    def old_worker_quiescent(self, status):
        if not self.cfg.get('deadBootPreservation'):
            return ctl.normal.worker_quiescent(status)
        pin = self.cfg['deadBootPreservation']['workerTick']
        observed = public_identity(self.tx.pin(self.worker))
        original = pin['worker']
        # stopped identities retain the physical start/image/name; no stopped
        # process receives a new HTTP query or synthetic status.
        require(all(observed[k] == original[k] for k in ('id', 'name', 'image', 'startedAt'))
                and observed['startedAt'] == pin['physicalStartedAt'], 'NO_USER_WORKER_PHYSICAL_IDENTITY_CHANGED')
        return bool(isinstance(status, dict)
            and all(status.get(k) == v for k,v in pin['identity'].items())
            and exact_json(status.get('lastTick')) == exact_json(pin['lastTick'])
            and status.get('phase') == 'UNKNOWN' and status.get('paused') is True
            and type(status.get('activeTicks')) is int and status['activeTicks'] == 0
            and type(status.get('unresolvedTicks')) is int and status['unresolvedTicks'] == 1
            and (status.get('controlFault') is None or status.get('controlFault') is False) and 'controlFault' in status
            and ctl.normal.worker_media_healthy(status) and isinstance(status.get('mediaWorker'), dict)
            and status['mediaWorker'].get('draining') is True
            and status['mediaWorker'].get('running') == 0 and status['mediaWorker'].get('queued') == 0)

    def failure_preservation_check(self, outcome, stage):
        super().failure_preservation_check(outcome, stage)
        try:
            self.check_dead_boot(stage)
        except BaseException as error:
            outcome.update(preservationHold=True, reconciliationRequired=True)
            outcome.setdefault('preservationErrors', []).append({
                'stage': stage, 'error': str(error) if isinstance(error, Hold) else type(error).__name__})

    def build_gateway(self):
        # Called while the CREATED candidate is stopped, before old slots stop.
        # docker cp supports a stopped container. No candidate process/RAM is
        # started, and no old Web docker exec is required by this builder.
        super().build_gateway()
        root = ctl.ROOT / 'no-user-entry-maintenance'
        render(self.dump, {'kind': 'saas-controlled-maintenance-recovery',
            'expectedDumpSha256': self.cfg['expectedGatewayDigest'], 'servers': self.ingress['servers'],
            'restoreDatabase': False, 'replayAcceptedTasks': False, 'compatibleBusinessRollback': False},
            root, source_files=self.before)
        self.entry_report = json.loads((root / 'report.json').read_bytes())
        self.entry_after = {p['path']: (root / p['after']).read_bytes() for p in self.entry_report['patches']}
        self.entry_closure = {**self.before, **self.entry_after}
        syntax_check(self.tx, self.entry_closure, ctl.ROOT / 'syntax-no-user-entry')
        # Actual cutover is maintenance -> candidate, NOT old baseline -> candidate.
        # Exact bytes/full closure stay CAS-bound to the applied maintenance.
        changes = {name: raw for name, raw in self.candidate_closure.items()
                   if raw != self.entry_closure[name]}
        parsed = compat.Dump((root / 'nginx.after.txt').read_text())
        patches = {name: raw.decode() + ('\n' if parsed.files[name] == self.entry_closure[name].decode()+'\n' else '')
                   for name, raw in changes.items()}
        after = parsed.render(patches)
        require(sha(after.encode()) == sha(self.after_dump.encode()), 'MAINTENANCE_TO_CANDIDATE_DUMP_CHANGED')
        output = ctl.ROOT / 'no-user-open-gateway'
        compat.write_gateway_bundle((root/'nginx.after.txt').read_text(), patches, after,
            {'configClosureValidated': True, 'beforeDumpSha256': self.entry_report['afterDumpSha256'],
             'afterDumpSha256': sha(after.encode()), 'kind': 'authorized-no-user-maintenance-exit'},
            output, self.entry_closure)
        self.open_report = json.loads((output/'report.json').read_bytes())
        self.open_after = {p['path']: (output/p['after']).read_bytes() for p in self.open_report['patches']}
        self.tx.save('NO_USER_GATEWAYS_PREPARED.json', {
            'baselineDumpSha256': self.cfg['expectedGatewayDigest'],
            'maintenanceDumpSha256': self.entry_report['afterDumpSha256'],
            'candidateDumpSha256': sha(self.after_dump.encode()),
            'candidateProcessStarted': False, 'actualNginxSyntaxPassed': True})

    def switch_entry_maintenance(self, _operation):
        prior = self.tx.folder
        folder = prior / 'no-user-entry-switch'
        folder.mkdir(mode=0o700, exist_ok=False)
        try:
            self.tx.folder = folder
            return ctl.c.switch_gateway_bundle(self.tx, self.entry_report, self.before, self.entry_after,
                expected_dump_sha=self.cfg['expectedGatewayDigest'], logical_to_real=self.real,
                failure_policy='preserve-written')
        finally:
            self.tx.folder = prior

    def maintenance_http_proof(self):
        current = sha(self.tx.run(['nginx', '-T']))
        known = {self.entry_report['afterDumpSha256'], self.emergency['afterDumpSha256']}
        require(current in known, 'NO_USER_MAINTENANCE_PHYSICAL_CAS_CHANGED')
        proof = probe_maintenance(self.ingress)
        self.tx.save('NO_USER_MAINTENANCE_HTTP-'+uuid.uuid4().hex+'.json',
                     {**proof, 'gatewayDumpSha256': current})
        require(proof['passed'] is True, 'NO_USER_MAINTENANCE_HTTP_NOT_PROVEN')
        return proof

    def suspend_old_supervisor(self, _operation):
        # Prevent the old, correctly pinned recovery supervisor restarting a
        # retired old slot while this same transaction owns all three locks.
        self.tx.run(['systemctl', 'stop', 'naumi47-recovery.timer'])
        timer = self.tx.run(['systemctl', 'show', '-p', 'ActiveState', '--value', 'naumi47-recovery.timer']).strip()
        service = self.tx.run(['systemctl', 'show', '-p', 'ActiveState', '--value', 'naumi47-recovery.service']).strip()
        require(timer == b'inactive' and service in (b'inactive', b'failed'), 'OLD_SUPERVISOR_NOT_QUIESCENT')
        return {'timer': timer.decode(), 'service': service.decode(), 'oldRestartPrevented': True}

    def pre_retirement_drain(self):
        # Every application/domain observation remains live until Web stop.
        # Once Worker is physically stopped its last genuine server receipt is
        # carried explicitly, never replaced with synthetic zero counters.
        app = ctl.c.app_status(self.tx, self.web)
        domain = self.request(self.web, '/api/video/worker/drain-status')
        if self.worker['running']:
            ws = self.worker_control(self.worker, 'status', str(uuid.uuid4()))['state']
        else:
            self.tx.pin(self.worker)
            require(self.retirement_drain is not None, 'ORIGINAL_WORKER_DRAIN_REQUIRED')
            ws = self.retirement_drain['rawWorker']
        rows, held = self.incidents()
        if self.cfg.get('deadBootPreservation'):
            import release47_dead_boot_preservation as deadboot
            ctl.policy.check_incidents(rows, held, self.incident_digest)
            self.check_dead_boot('pre-retirement-drain', app)
            require(self.dead_boot.receipt is not None, 'DEAD_BOOT_FENCE_BEFORE_RETIREMENT_REQUIRED')
            require(self.old_worker_quiescent(ws), 'NO_USER_HISTORICAL_WORKER_NOT_QUIESCENT')
            proof = deadboot.current_drained(app, domain, ws, self.owners(), self.dead_boot.review,
                self.dead_boot.receipt, worker_preserved=True)
            return {**proof, 'incidentSha256': self.incident_digest,
                    'scannerReceiptCompleted': False,
                    'preservedUnresolvedScannerTick': copy.deepcopy(self.cfg['deadBootPreservation']['workerTick'])}
        return ctl.normal.current_drained(app, domain, ws, self.owners(), rows, held,
                                           self.incident_digest, self.cfg.get('preservedWorkerTick'))

    def retire_old_slots(self):
        check_window(self.cfg)
        require(self.entry_maintenance_proven is True, 'HTTP_MAINTENANCE_BEFORE_OLD_RETIREMENT_REQUIRED')
        require(sha(self.tx.run(['nginx', '-T'])) == self.entry_report['afterDumpSha256'],
                'MAINTENANCE_CHANGED_BEFORE_RETIREMENT')
        if self.cfg.get('deadBootPreservation'):
            self.wait(lambda: self.check_dead_boot('before-old-drain'), 'EXACT_DEAD_BOOT_BEFORE_DRAIN', 120)
        self.op('old-worker-drain', lambda op: self.worker_control(self.worker, 'drain', op))
        self.worker_paused = True
        self.wait(lambda: (lambda s: s if self.old_worker_quiescent(s) else None)(
            self.worker_control(self.worker, 'status', str(uuid.uuid4()))['state']), 'OLD_WORKER_DRAIN', 120)
        self.op('old-web-drain', lambda op: ctl.c.control_app(self.tx, self.web, 'drain', op))
        self.old_drained = True
        if self.cfg.get('deadBootPreservation'):
            self.op('dead-boot-exact-fence', self.apply_dead_boot_fence)
        self.retirement_drain = self.wait(self.pre_retirement_drain, 'OLD_CURRENT_EXECUTION_DRAIN', 120)
        self.tx.save('current-execution-drain.json', self.retirement_drain)
        self.wait(self.pre_retirement_drain, 'REPEATED_OLD_CURRENT_EXECUTION_DRAIN', 60)
        for role in ('worker', 'web'):
            check_window(self.cfg)
            identity = getattr(self, role)
            self.retirement_drain = self.wait(self.pre_retirement_drain, 'RETIRE_'+role.upper(), 120)
            drain_descriptor = self.tx.save('NO_USER_PRE_STOP_DRAIN-'+role+'.json', {
                'at': ctl.now(), 'roleAboutToStop': role, 'originalIdentity': identity,
                'workerHttpReceiptCarriedFromBeforeWorkerStop': role == 'web',
                'workerCurrentlyStopped': not self.worker['running'],
                'originalDrain': self.retirement_drain})
            self.wait(lambda: self.pre_retirement_reference_proof(role), 'OLD_REFERENCES_'+role.upper(), 120)
            result = self.op('retire-'+identity['id'][:12], lambda _, identity=identity: self.stop_exact(identity))
            # All later pin/clone operations use the observed STOPPED identity.
            setattr(self, role, result)
            self.succ['retired'].append(result['id'])
            self.succ.setdefault('retiredIdentities', {})[role] = result
            self.succ.setdefault('retiredEvidence', {})[role] = {
                'originalIdentity': identity, 'stoppedIdentity': result,
                'originalDrainProof': drain_descriptor, 'freshOldProcessStatusAfterStopClaimed': False}
            if role == 'web': self.state['webs']['main']['running'] = result
            else: self.state['worker']['running'] = result
            self.state['runtimeRecovery']['phase'] = 'MAINTENANCE_OLD_SLOTS_RETIRED'
            self.persist()
        self.old_retired = True
        self.assert_old_retired()
        self.phase('OLD_RETIRED_MAINTENANCE', historicalDrainReclassified=False,
                   currentDrainProof='current-execution-drain.json', acceptedTasksCleared=False)

    def pre_retirement_reference_proof(self, role):
        # Candidate is not running; do not call inherited reference_proof,
        # which requires new-Web HTTP health. Preserve raw evidence separately.
        old = (self.web['id'], self.worker['id'])
        observed = []
        for identifier in self.tx.run(['docker', 'ps', '-q', '--no-trunc']).decode().splitlines():
            if identifier in old: continue
            row = self.tx.inspect(identifier)
            text = json.dumps({'env': row['Config'].get('Env', []),
                               'links': row['HostConfig'].get('Links')})
            require(not any(v in text for v in (ctl.OLDWEB, ctl.OLDWORKER, ':'+str(self.cfg['oldPort']))),
                    'RUNNING_INTERNAL_CALLER_STILL_REFERENCES_OLD_SLOT')
            observed.append(public_identity(row))
        connections = self.tx.run(['ss', '-Htn', 'state', 'established',
            '( sport = :'+str(self.cfg['oldPort'])+' or dport = :'+str(self.cfg['oldPort'])+' )'])
        require(not connections.strip(), 'OLD_LOOPBACK_CONNECTIONS_STILL_ACTIVE')
        proof = {
            'at': ctl.now(), 'observedRunningCallers': observed, 'oldLoopbackEstablishedRaw': connections.decode(),
            'runningInternalReferences': 0, 'candidateStarted': False, 'roleAboutToStop': role}
        self.tx.save('NO_USER_BEFORE_RETIRE_REFERENCES-'+role+'-'+uuid.uuid4().hex+'.json', proof)
        return proof

    def permission_readiness(self):
        # A valid nv_admin is ALLOWED on /api/admin. The dual-cookie case
        # instead proves it cannot widen the nv_user's enterprise identity.
        script = """let s='';for await(const c of process.stdin)s+=c;const p=JSON.parse(s);
const r=await fetch('http://127.0.0.1:3000'+p.path,{headers:p.cookie?{cookie:p.cookie}:{},redirect:'manual',signal:AbortSignal.timeout(12000)});
const raw=await r.text();let user=false;if(p.session){try{user=!!JSON.parse(raw).user}catch{}}
console.log(JSON.stringify({status:r.status,commit:process.env.SOURCE_COMMIT,...(p.session?{user}: {})}));"""
        def read(path, cookie, session=False):
            result = json.loads(self.tx.run(['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', self.newweb['id'],
                'node', '--input-type=module', '-e', script],
                stdin=json.dumps({'path': path, 'cookie': cookie, 'session': session}).encode(), timeout=20))
            require(result.get('commit') == self.cfg['commit'], 'PERMISSION_CANDIDATE_COMMIT_CHANGED')
            return result
        checked = []
        for case in self.cfg['permissionChecks']:
            cookie = pathlib.Path(case['cookiePath']).read_text().strip() if case.get('cookiePath') else None
            require(cookie or case['name'] == 'anonymous-admin', 'EXISTING_PERMISSION_PRINCIPAL_REQUIRED')
            if case['name'] == 'dual-cookie':
                pairs = [p.strip().split('=', 1) for p in cookie.split(';') if p.strip()]
                require(all(len(p) == 2 and p[1] for p in pairs)
                        and len({p[0] for p in pairs}) == len(pairs), 'UNAMBIGUOUS_DUAL_COOKIE_REQUIRED')
                values = dict(pairs)
                require(values.get('nv_admin') and values.get('nv_user') and '\n' not in cookie and '\r' not in cookie,
                        'REAL_ADMIN_AND_NATIVE_USER_DUAL_COOKIE_REQUIRED')
                require(read('/api/admin/tenants?page=1&size=1', cookie)['status'] == 200,
                        'DUAL_COOKIE_ADMIN_TOKEN_NOT_VALID')
                native = 'nv_user='+values['nv_user']
                require(read('/api/auth/session', native, True).get('user') is True,
                        'DUAL_COOKIE_NATIVE_SESSION_NOT_VALID')
                require(read('/api/admin/tenants?page=1&size=1', native)['status'] in (401,403,404),
                        'DUAL_COOKIE_NATIVE_USER_MUST_BE_NONADMIN')
                require(read(case['path'], native)['status'] in (403,404),
                        'DUAL_COOKIE_NATIVE_USER_FOREIGN_SCOPE_NOT_DENIED')
            require(read(case['path'], cookie)['status'] == case['status'],
                    'LIVE_PERMISSION_PARITY_FAILED:'+case['name'])
            checked.append({'name': case['name'], 'status': case['status']})
        self.tx.save('NO_USER_PERMISSION_HTTP.json', {'cases': checked, 'method': 'GET',
            'dualCookieAdminSessionValid': True, 'dualCookieNativeNonAdminSessionValid': True,
            'enterpriseIdentityNotElevated': True, 'permissionMutations': 0, 'supplierCalls': 0,
            'revokedMembershipProductionExercised': False,
            'revokedMembershipIsolatedPgPassed': True, 'localAcceptance': copy.deepcopy(self.cfg['localAcceptance'])})

    def assert_old_retired(self):
        for identity in (self.web, self.worker):
            row = self.tx.pin(identity)
            require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name'] == 'no',
                    'OLD_SLOT_NOT_ACTUALLY_RETIRED')

    def memory_proof(self, stage):
        # No future old-slot/anonymous/file-cache credit. Inspection precedes
        # /proc/meminfo, so only actually released memory is eligible.
        started = time.monotonic()
        self.assert_old_retired()
        currents, events = {}, {}
        for role in ('web', 'worker'):
            identity = getattr(self, 'new'+role, None)
            currents[role] = 0
            if identity is None or not identity['running']:
                continue
            row = self.tx.pin(identity)
            cap = self.cfg['webMemoryMiB'] if role == 'web' else 1024
            require(row['State']['Running'] and not row['State'].get('OOMKilled', False)
                    and row['Image'] == self.cfg['image']
                    and row['HostConfig']['Memory'] == cap*MIB and row['HostConfig']['MemorySwap'] == cap*MIB
                    and not row['HostConfig'].get('OomKillDisable', False), 'CANDIDATE_MEMORY_OR_OOM_CHANGED')
            if role == 'web':
                env = environment(row)
                require(all(env.get(k) == v for k,v in self.cfg['reviewedMemoryEnvironment'].items()),
                        'CANDIDATE_MEMORY_ENVIRONMENT_CHANGED')
            require(matches('[a-f0-9]{64}', row['Id']), 'EXACT_CGROUP_ID_REQUIRED')
            group = pathlib.Path('/sys/fs/cgroup/system.slice') / ('docker-'+row['Id']+'.scope')
            current = (group/'memory.current').read_text().strip()
            pressure = dict(line.split() for line in (group/'memory.events').read_text().splitlines())
            require(current.isdecimal() and all(pressure.get(k, '').isdecimal() and int(pressure[k]) == 0
                    for k in ('oom', 'oom_kill', 'max')), 'CANDIDATE_MEMORY_PRESSURE_REQUIRES_REVIEW')
            currents[role], events[role] = int(current), pressure
        proof = ram_budget(mem_available(), currents['web'], currents['worker'], self.cfg)
        require(time.monotonic()-started <= 5, 'RAM_OBSERVATION_TOO_SLOW')
        self.tx.save('NO_USER_RAM_'+stage.upper().replace('-', '_')+'-'+uuid.uuid4().hex+'.json',
                     {**proof, 'stage': stage, 'events': events, 'oldSlotsObservedStopped': True})
        require(proof['passed'], 'FRESH_POST_RETIREMENT_RAM_INSUFFICIENT')
        return proof

    def retirement_memory_proof(self, stage, include_old=True):
        # Legacy ready/retire hooks name old slots, but this mode intentionally
        # requires both old slots already STOPPED at every candidate stage.
        require(stage in ('ready', 'retire', 'after-retirement'), 'INVALID_RAM_STAGE')
        return self.memory_proof(stage)

    def switch_forward_gateway(self):
        self.check_quotes('BEFORE_SWITCH')
        self.preserved_unknown.check('before-switch')
        self.check_dead_boot('before-switch')
        self.memory_proof('retire')
        self.verify_internal_authority()
        return ctl.c.switch_gateway_bundle(self.tx, self.open_report, self.entry_closure, self.open_after,
            expected_dump_sha=self.entry_report['afterDumpSha256'], logical_to_real=self.real,
            failure_policy='preserve-written')

    def drain_proof(self):
        # After retirement there is no old process to query. Returning the
        # original proof as a fresh drain would erase the observation boundary.
        require(not self.old_retired, 'OLD_RETIRED_USE_ORIGINAL_DRAIN_AND_PHYSICAL_PROOF')
        return self.pre_retirement_drain()

    def verify_retired_preservation(self, stage):
        self.assert_old_retired()
        require(self.retirement_drain and self.retirement_drain.get('currentExecutableWorkDrained') is True
                and set(self.succ['retired']) == {self.web['id'], self.worker['id']}, 'GENUINE_EARLY_RETIREMENT_PROOF_REQUIRED')
        self.preserved_unknown.check(stage)
        self.check_dead_boot(stage)
        self.check_quotes(stage.upper().replace('-', '_'))
        rows, held = self.incidents()
        ctl.policy.check_incidents(rows, held, self.incident_digest)
        self.tx.save('NO_USER_RETIRED_PRESERVATION-'+uuid.uuid4().hex+'.json', {
            'stage': stage, 'oldSlotsObservedStopped': True, 'originalCurrentDrainCarried': True,
            'freshOldHttpObservationClaimed': False, 'historicalDrainProven': False})

    def finish_ready(self):
        # Old Worker/Web drain and retirement happened before RAM admission.
        # Never invoke inherited finish_ready's stopped-old docker exec paths.
        self.verify_retired_preservation('before-open')
        self.op('new-web-open', lambda op: ctl.c.control_app(self.tx, self.newweb, 'resume', op))
        self.op('gateway-switch', lambda _: self.switch_forward_gateway())
        self.switched = True
        self.phase('SWITCHED')
        ctl.save(ctl.ROOT/'cutover.json', {'releaseId': ctl.RELEASE, 'version': self.cfg['version'], 'at': ctl.now()})
        self.wait(lambda: self.marker('browser-after.json'), 'BROWSER_AFTER', 600)
        self.op('new-worker-resume', lambda op: self.worker_control(self.newworker, 'resume', op))
        self.wait(lambda: (lambda s: s if ctl.normal.worker_completed(s) else None)(
            self.worker_control(self.newworker, 'status', str(uuid.uuid4()))['state']), 'NEW_WORKER_SERVER_RECEIPT', 90)
        self.phase('WORKER_ACTIVE')
        self.post = tasks.collect_task_snapshot(self.tx.run, self.db, self.tx.save, previous=self.pre.private,
            projection='proof', row_limit=self.pre.private.get('rowLimit', 1000), allow_absent_tables=tasks.ADDITIVE_TABLES,
            statement_timeout_ms=self.cfg.get('snapshotStatementTimeoutMs', 5000))
        comparison = tasks.compare_task_snapshots(self.pre, self.post)
        self.tx.save('task-preservation-comparison.json', comparison)
        require(comparison['preservationVerified'], 'TASK_PRESERVATION_NOT_VERIFIED')
        self.retire_ready()

    def retire_ready(self):
        self.op('new-worker-retirement-barrier', lambda op: self.worker_control(self.newworker, 'drain', op))
        self.wait(lambda: (lambda s: s if ctl.normal.worker_quiescent(s) else None)(
            self.worker_control(self.newworker, 'status', str(uuid.uuid4()))['state']), 'NEW_WORKER_RETIREMENT_BARRIER', 120)
        self.verify_retired_preservation('final-retirement-barrier')
        require(('http://127.0.0.1:'+str(self.cfg['oldPort'])) not in self.tx.run(['nginx','-T']).decode(),
                'OLD_ROUTE_STILL_REFERENCED')
        self.reference_proof()
        self.install_supervisor()  # unchanged canonical enrollment and controlled recovery manifest
        self.after_retirement()    # inherited resource/static-pin proof, no in-place memory growth
        self.op('new-worker-after-retirement', lambda op: self.worker_control(self.newworker, 'resume', op))
        self.wait(lambda: (lambda s: s if ctl.normal.worker_completed(s) else None)(
            self.worker_control(self.newworker, 'status', str(uuid.uuid4()))['state']), 'NEW_WORKER_FINAL_COMPLETION', 90)
        self.verify_recovery_materials()
        require(all(op.get('phase') == 'ACKNOWLEDGED' for op in self.succ['operations'].values()),
                'UNKNOWN_OPERATION_PREVENTS_COMPLETE')
        self.state['activeNormalBlueGreenReleaseId'] = ctl.RELEASE
        require(self.configuration_facts() == self.config_before, 'MODEL_OR_BILLING_CONFIGURATION_CHANGED')
        if not self.cfg.get('deadBootPreservation'):
            self.phase('COMPLETE', completedAt=ctl.now(), paidOutputRecovered=False, historicalDrainReclassified=False)
        for identity in self.infra: self.tx.pin(identity)
        rows, held = self.incidents()
        ctl.policy.check_incidents(rows, held, self.incident_digest)
        self.check_running_slots(extra=(self.newweb['id'], self.newworker['id']))
        self.check_dead_boot('final-publication')
        if self.cfg.get('deadBootPreservation'):
            self.phase('COMPLETE', completedAt=ctl.now(), paidOutputRecovered=False, historicalDrainReclassified=False)
        self.tx.run(['systemctl', 'start', 'naumi47-recovery.timer'])
        result = {'phase': 'COMPLETE', 'historicalReleasePhase': self.state['phase'], 'historicalDrainProven': False,
            'paidOutputRecovered': False, 'version': self.cfg['version'], 'commit': self.cfg['commit'],
            'image': self.cfg['image'], 'web': self.newweb, 'worker': self.newworker, 'at': ctl.now(),
            'supplierGenerationReplays': 0, 'databaseRestored': False, 'oldSlotsRetiredBeforeCandidateStart': True,
            'memoryReview': self.cfg['memoryReview']}
        self.tx.save('PUBLICATION_RECEIPT.json', result)
        print('PUBLICATION_RESULT='+json.dumps(result), flush=True)

    def check_running_slots(self, extra=()):
        if not self.old_retired:
            return super().check_running_slots(extra)
        self.assert_old_retired()
        running = set(self.tx.run(['docker', 'ps', '-q', '--no-trunc']).decode().splitlines())
        required = {r['id'] for r in self.infra} | set(extra)
        require(running == required, 'UNREGISTERED_RUNNING_CANDIDATE')

    def record_failure_controls(self, outcome):
        # No HTTP/exec status request is sent to a stopped old Worker.
        outcome['existingControls'] = copy.deepcopy(getattr(self, 'succ', {}).get('operations', {}))
        outcome['degradedPending'] = bool(outcome['existingControls'])
        outcome['fullBaselineServicePreserved'] = False
        outcome['oldSlotsObserved'] = {}
        for role in ('web', 'worker'):
            try: outcome['oldSlotsObserved'][role] = public_identity(self.tx.inspect(getattr(self, role)['id']))
            except BaseException: outcome['oldSlotsObserved'][role] = {'result': 'UNKNOWN'}

    def recover_failure(self, error):
        # No automatic restart/cutback of a SaaS/quote-incompatible old program.
        # No candidate stop/kill: its accepted work or UNKNOWN mutation can exist.
        outcome = {'at': ctl.now(), 'error': str(error) if isinstance(error, Hold) else type(error).__name__,
            'priorProgramResumed': False, 'databaseRestored': False, 'tasksReplayed': False,
            'workerStateChanged': False, 'maintenanceApplied': False,
            'restoreDecision': 'KEEP_503_PINNED_PRIOR_PROGRAM_COMPATIBILITY_AND_DRAIN_REVIEW_REQUIRED'}
        self.failure_preservation_check(outcome, 'failure-before')
        self.record_failure_controls(outcome)
        try:
            current = sha(self.tx.run(['nginx', '-T']))
            if hasattr(self, 'emergency') and current == self.emergency['beforeDumpSha256']:
                self.seal_candidate_ingress(current)  # inherited durable independent UUID/CAS sealing
                self.maintenance_http_proof()
                outcome['maintenanceApplied'] = True
            elif current in {getattr(self, 'entry_report', {}).get('afterDumpSha256'),
                             getattr(self, 'emergency', {}).get('afterDumpSha256')}:
                self.maintenance_http_proof()
                outcome['maintenanceApplied'] = True
            elif current == self.cfg['expectedGatewayDigest']:
                observed = outcome['oldSlotsObserved']
                require(all(observed.get(r, {}).get('running') is True for r in ('web', 'worker')),
                        'BASELINE_ENTRY_WITH_RETIRED_OLD_SLOT_REQUIRES_RECONCILIATION')
                outcome['baselinePublicEntryPreserved'] = True
                outcome['restoreDecision'] = 'BASELINE_RUNNING_NO_RESTART_OR_TASK_REPLAY'
            else:
                raise Hold('UNKNOWN_INGRESS_REQUIRES_RECONCILIATION')
        except BaseException as recovery_error:
            outcome['recoveryError'] = str(recovery_error) if isinstance(recovery_error, Hold) else type(recovery_error).__name__
            outcome['reconciliationRequired'] = True
        self.failure_preservation_check(outcome, 'failure-after')
        if hasattr(self, 'succ'):
            try:
                self.phase('RECOVERY_REQUIRED', recoveryMode='saas-controlled-maintenance',
                    lastError=outcome['error'], failedAt=outcome['at'],
                    degradedPending=outcome['degradedPending'], preservationHold=outcome.get('preservationHold', False),
                    maintenanceHttpProven=outcome['maintenanceApplied'])
            except BaseException as persist_error:
                outcome['canonicalPersistenceError'] = type(persist_error).__name__
                outcome['reconciliationRequired'] = True
        self.tx.save('NO_USER_FAILURE_RECOVERY.json', outcome)
        print('NO_USER_RECOVERY_REQUIRED='+json.dumps(outcome), flush=True)

    def run(self):
        check_window(self.cfg)
        self.preserved_unknown.establish()
        self.establish_dead_boot()
        self.quote_before = self.quote_snapshot()
        self.tx.save('QUOTE_BASELINE.private.json', self.quote_before)
        require(self.state['revision'] == self.cfg['expectedRevision']
                and sha(recovery.encoded(self.state)) == self.cfg['expectedCanonicalDigest'], 'FRESH_PREDECESSOR_REVIEW_REQUIRED')
        recovery.recovery_binding(self.state, self.original_manifest)
        require(sha(self.tx.run(['nginx', '-T'])) == self.cfg['expectedGatewayDigest'], 'GATEWAY_CHANGED')
        rows, held = self.incidents()
        self.incident_digest = ctl.policy.check_incidents(rows, held)
        self.tx.save('preserved-incidents.json', {'rows': rows, 'held': held, 'sha256': self.incident_digest})
        descriptor = self.tx.save('original-canonical.json', recovery.encoded(self.state))
        self.tx.save('original-canonical-exact.json', self.original)
        self.succ = begin(self.state, self.cfg, descriptor, self.incident_digest)
        self.succ.update(commit=self.cfg['commit'], buildVersion=self.cfg['version'], image=self.cfg['image'],
                         previousRuntimeRecovery=copy.deepcopy(self.runtime))
        self.check_running_slots()
        require(not self.tx.run(['ss', '-Hltn', 'sport = :'+str(self.cfg['newPort'])]).strip(), 'CANDIDATE_PORT_IN_USE')
        if self.cfg.get('deadBootPreservation'):
            self.wait(lambda: self.check_dead_boot('before-backup'), 'EXACT_DEAD_BOOT_BEFORE_BACKUP', 120)
        else:
            require(ctl.c.app_status(self.tx, self.web)['observations']['unknownLeases'] == 0,
                    'CURRENT_UNKNOWN_WORK_REQUIRES_RECONCILIATION')
        self.state.setdefault('normalBlueGreenReleases', {})[ctl.RELEASE] = self.succ
        self.persist()
        self.tx.save('original-supervisor.service', pathlib.Path('/etc/systemd/system/naumi47-recovery.service').read_bytes())
        self.tx.save('original-recovery-manifest.json', pathlib.Path(self.runtime['manifestPath']).read_bytes())
        self.config_before = self.configuration_facts()
        self.tx.save('configuration-before.json', self.config_before)
        require(self.config_before == self.cfg['expectedConfigurationFacts'], 'MODEL_OR_BILLING_BASELINE_CHANGED')
        self.op('database-backup', lambda _: self.tx.backup_database(self.db))
        self.maintenance_and_import()
        return self.continue_after_import()

    def continue_after_import(self):
        """Original post-import flow; a resume wrapper must restore/check pins first.

        This entry point never establishes a new preservation baseline and never
        replays database-backup, quote-additive-schema or image-import operations.
        """
        self.pre = tasks.collect_task_snapshot(self.tx.run, self.db, self.tx.save, projection='proof',
            row_limit=self.cfg.get('snapshotRowLimit', 5000), allow_absent_tables=tasks.ADDITIVE_TABLES,
            statement_timeout_ms=self.cfg.get('snapshotStatementTimeoutMs', 5000))
        require(self.pre.public.get('tables'), 'TASK_BASELINE_MISSING')
        require(self.pre.public.get('preservationComplete') is True, 'TASK_BASELINE_INCOMPLETE')
        self.phase('BACKED_UP')
        require(json.loads(self.tx.run(['docker', 'image', 'inspect', self.cfg['image']]))[0]['Id'] == self.cfg['image'],
                'FIXED_IMAGE_MISSING')
        # CREATE is non-running. Its exact image/static files let us prepare and
        # syntax-test ALL gateways while the old baseline still serves.
        self.newweb = self.op('web-create', lambda _: self.tx.clone_web(self.web, name=ctl.WEB,
            port=self.cfg['newPort'], image=self.cfg['image'], commit=self.cfg['commit'],
            memory_mib=self.cfg['webMemoryMiB'], cpu=1.5, release_secret=secrets.token_urlsafe(48),
            state_dir=ctl.STATE+'/web', build_version=self.cfg['version'],
            reviewed_prior_state_dir=self.cfg['oldWebStateDir'],
            reviewed_nas_credentials_sha256=self.cfg.get('nasCredentialsSha256'),
            reviewed_video_reference_origin=self.cfg['videoReferencePublicOrigin'],
            reviewed_combined_media=self.cfg['combinedMedia'],
            reviewed_memory_environment={'memoryReview': self.cfg['memoryReview'],
                                         'environment': self.cfg['reviewedMemoryEnvironment']}))
        self.old_server_actions = self.server_actions(self.web)
        self.build_gateway()
        self.op('suspend-old-supervisor', self.suspend_old_supervisor)
        self.op('no-user-entry-maintenance', self.switch_entry_maintenance)
        self.maintenance_http_proof()
        self.entry_maintenance_proven = True
        self.retire_old_slots()
        self.memory_proof('before-candidate-start')
        ram = self.cfg['memoryReview']
        self.newweb = self.op('web-start', lambda _: self.tx.start_candidate(self.newweb,
            {k: ram[k] for k in ('webPeakMiB','workerPeakMiB','hostReserveMiB')}, mem_available()//MIB))
        self.wait(lambda: self.request(self.newweb, '/api/health'), 'WEB_START')
        self.newworker = self.op('worker-create', lambda _: ctl.c.clone_worker(self.tx, self.newweb,
            name=ctl.WORKER, memory_mib=1024, cpu=1, state_dir=ctl.STATE+'/worker', reviewed_combined_media=True,
            reviewed_runtime_memory=True))
        self.memory_proof('before-worker-start')
        self.newworker = self.op('worker-start', lambda _: ctl.c.start_worker(self.tx, self.newworker,
            mem_available()//MIB, reserve_mib=ram['hostReserveMiB'], reviewed_combined_media=True,
            reviewed_runtime_memory=True))
        self.wait(lambda: self.worker_control(self.newworker, 'status', str(uuid.uuid4())), 'WORKER_START')
        self.phase('CANDIDATE', web=self.newweb, worker=self.newworker)
        self.ready()
        self.tx.save('candidate-server-actions.json', {'old': self.old_server_actions, 'new': self.server_actions(self.newweb)})
        ctl.save(ctl.ROOT/'browser-private.json', {'releaseId': ctl.RELEASE, 'cookie': self.cookie,
            'candidateOrigin': 'http://127.0.0.1:'+str(self.cfg['newPort']), 'commit': self.cfg['commit'], 'version': self.cfg['version']})
        self.phase('READY')
        self.wait(lambda: self.marker('browser-before.json'), 'BROWSER_BEFORE', 600)
        self.finish_ready()


def main(config_path):
    cfg = json.loads(pathlib.Path(config_path).read_bytes())
    validate_config(cfg)
    check_window(cfg)
    require(os.name == 'posix', 'LIVE_LINUX_HOST_REQUIRED')
    configure(cfg)
    with ctl.transaction() as tx:
        require(tx.stack is not None and len(tx.lock_fds) == 3 and tx.spec['locks'] == LOCKS,
                'WHOLE_THREE_LOCK_TRANSACTION_REQUIRED')
        print('THREE_LOCKS=ACQUIRED', flush=True)
        predecessor_proof(tx, json.loads(ctl.CANON.read_bytes()), cfg)
        operator = NoUserController(tx, cfg)
        try: operator.run()
        except BaseException as error:
            operator.recover_failure(error)
            raise
    print('THREE_LOCKS=RELEASED', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=pathlib.Path)
    parser.add_argument('--check-config', action='store_true')
    args = parser.parse_args()
    try:
        if args.check_config:
            validate_config(json.loads(args.config.read_bytes()))
            print('CONFIG=PASS HOST_CONNECTIONS=0 LIVE_MUTATIONS=0')
        else: main(args.config)
    except (Hold, KeyError, TypeError, ValueError, OSError) as error:
        print('NO_USER_SUCCESSOR_HOLD='+(str(error) if isinstance(error, Hold) else type(error).__name__))
        raise SystemExit(2)
