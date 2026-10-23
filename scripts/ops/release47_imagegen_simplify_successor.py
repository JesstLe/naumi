"""Fresh 47 imagegen successor; no old authorization/RAM/recovery transaction reuse.

Only main() enters the live three-lock transaction. validate_config()/--check-config
are offline. Existing controllers and historical journals are never patched.
Program cutback is deliberately not automatic: the SaaS maintenance closure is
the failure path until a separately pinned prior-program compatibility proof exists.
"""
import argparse
import copy
import datetime as dt
import json
import os
import pathlib
import re
import secrets
import subprocess
import time
import uuid

import release47_normal_controller as ctl
import release47_recovery_supervisor as recovery
import release47_task_snapshot as tasks
from release47_host import Hold, environment, file_sha, public_identity, require, sha
from release47_preserved_unknown import Guard
from release47_saas_successor import SaasController, CASE05_BASELINE, CASE05_SHA256
from release47_video_family_successor import VideoFamilyController, MIB
from saas_maintenance_probe import validate_ingress

AUTHORIZATION = '批准，然后合并并上线'
SCOPE = ['47-only', 'remove-imagegen-repeat-quote-version-gate',
         'remove-normal-creation-fixed-frequency-limit', 'consolidate-duplicate-concurrency']
PREFIX = 'release47-imagegen-simplify-'
EVIDENCE = pathlib.PurePosixPath('/opt/naumi-staging/evidence')
RELEASES = pathlib.PurePosixPath('/opt/naumi-staging/releases')
PERMISSION_CASES = {'anonymous-admin', 'platform-admin', 'tenant-owner',
                    'cross-tenant', 'revoked-membership', 'dual-cookie'}
QUOTE_COLUMNS = {'id': 'uuid', 'owner': 'text', 'operation_id': 'uuid',
                 'fingerprint': 'text', 'context_key': 'text', 'request': 'jsonb',
                 'plan': 'jsonb', 'expires_at': 'timestamp with time zone',
                 'created_at': 'timestamp with time zone'}
QUOTE_TABLES = {'app_imagegen_quotes': QUOTE_COLUMNS,
                'app_image_billing_quotes': {'id': 'uuid', 'owner': 'text', 'scope_key': 'text',
                    'quote': 'jsonb', 'expires_at': 'timestamp with time zone', 'created_at': 'timestamp with time zone'}}
QUOTE_DDL = """BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s';
CREATE TABLE IF NOT EXISTS app_imagegen_quotes(
 id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),operation_id uuid NOT NULL,
 fingerprint text NOT NULL,context_key text NOT NULL,request jsonb NOT NULL,plan jsonb NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS app_imagegen_quotes_owner ON app_imagegen_quotes(owner,operation_id);
CREATE INDEX IF NOT EXISTS app_imagegen_quotes_expiry ON app_imagegen_quotes(expires_at);
CREATE TABLE IF NOT EXISTS app_image_billing_quotes(
 id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),scope_key text NOT NULL,
 quote jsonb NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS app_image_billing_quotes_expiry ON app_image_billing_quotes(expires_at);
COMMIT;"""


def matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def validate_config(cfg):
    require(cfg.get('target') == '47.105.59.142' and cfg.get('authorization') == AUTHORIZATION
            and cfg.get('scope') == SCOPE and matches(PREFIX + '[a-z0-9-]{6,55}', cfg.get('releaseId')),
            'EXACT_IMAGEGEN_SUCCESSOR_AUTHORIZATION_AND_SCOPE_REQUIRED')
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
        allowed = [200] if row['name'] in ('platform-admin', 'tenant-owner') else [401, 403, 404]
        route = '/api/admin/' if row['name'] in ('anonymous-admin', 'platform-admin', 'dual-cookie') else '/api/enterprise/'
        require(matches('/api/[A-Za-z0-9_/?=&.%:-]+', row.get('path'))
                and row['path'].startswith(route)
                and type(row.get('status')) is int and row['status'] in allowed
                and (row.get('cookiePath') is None if row['name'] == 'anonymous-admin'
                     else pathlib.PurePosixPath(row.get('cookiePath', '')).is_absolute()),
                'EXACT_READ_ONLY_PERMISSION_CASE_REQUIRED')


def pinned_json(cfg, key):
    spec = cfg[key]
    path = pathlib.Path(spec['path'])
    require(path.is_file() and not path.is_symlink() and file_sha(path) == spec['sha256'], 'PINNED_REVIEW_CHANGED:' + key)
    return json.loads(path.read_bytes())


def prepare_config(baseline, live, candidate):
    """Offline assembly only; live pins are supplied by the sole parent operator.

    Never derive current slots from an old publication's oldWeb/oldWorker.
    No journal/current.json is written or repaired by this function.
    """
    live_keys = {'target', 'oldWeb', 'oldWorker', 'oldPort', 'oldWebStateDir',
                 'predecessorReleaseId', 'expectedRevision', 'expectedCanonicalDigest',
                 'expectedCanonicalFileSha256', 'expectedGatewayDigest', 'expectedConfigurationFacts'}
    candidate_keys = {'releaseId', 'date', 'evidenceRoot', 'stateDir', 'newWebName', 'newWorkerName',
                      'newPort', 'commit', 'image', 'version', 'imageArchive', 'imageArchiveSha256',
                      'webMemoryMiB', 'webFinalMemoryMiB', 'memoryReview', 'combinedMedia',
                      'cookiePath', 'localAcceptance', 'recoveryIngressAudit', 'predecessorRecoveryReview',
                      'permissionChecks', 'storageAcceptanceScript', 'storageAcceptanceSha256',
                      'mediaProbePath', 'mediaProbeSha256', 'imageAcceptanceOperations'}
    require(isinstance(live, dict) and live_keys.issubset(live)
            and isinstance(candidate, dict) and candidate_keys.issubset(candidate), 'FRESH_LIVE_AND_CANDIDATE_BINDINGS_REQUIRED')
    cfg = copy.deepcopy(baseline)
    # Remove old *configuration options*, never canonical/journal UNKNOWN data.
    for key in ('resumeReview', 'resumeReady', 'resumeCutback', 'finishPromoted', 'preservedWorkerTick',
                'nasRollbackManifestPath', 'reviewedNasSidecars', 'rollbackCompatibility'):
        cfg.pop(key, None)
    cfg.update({key: copy.deepcopy(live[key]) for key in live_keys})
    cfg.update({key: copy.deepcopy(candidate[key]) for key in candidate_keys})
    cfg.update(authorization=AUTHORIZATION, scope=list(SCOPE), recoveryMode='saas-controlled-maintenance',
               previousNormalReleaseId=cfg['predecessorReleaseId'], restoreDatabase=False,
               replayAcceptedTasks=False, activateDisabledModels=False, workerMemoryMiB=1024,
               reviewedCombinedMedia=True, videoReferencePublicOrigin='https://47.105.59.142',
               preservedUnknown={'baselinePath': CASE05_BASELINE, 'baselineSha256': CASE05_SHA256, 'allowedAdditiveColumns': {}})
    validate_config(cfg)
    return cfg


def begin(state, cfg, archive, incident_digest, at=None):
    """Same normal journal invariants, with this authorization kept verbatim."""
    validate_config(cfg)
    at = at or dt.datetime.now(dt.timezone.utc)
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
    tx.save('IMAGEGEN_PREDECESSOR_PUBLICATION.json', proof)
    return proof


def ram_budget(available_bytes, current_bytes, cfg):
    require(type(available_bytes) is int and available_bytes >= 0
            and type(current_bytes) is int and current_bytes >= 0, 'UNKNOWN_MEM_AVAILABLE_OR_CGROUP_USAGE')
    ram = cfg['memoryReview']
    available, current = available_bytes // MIB, current_bytes // MIB
    required = max(0, ram['webPeakMiB'] - current) + ram['workerPeakMiB'] + ram['hostReserveMiB']
    return {'passed': available >= required, 'availableMiB': available, 'newWebCurrentMiB': current,
            'requiredAvailableMiB': required, 'marginMiB': available - required,
            'oldAnonymousCreditMiB': 0, 'fileCacheCredited': False, 'swapIncluded': False,
            'webMiB': cfg['webMemoryMiB'], 'budget': copy.deepcopy(ram)}


def mem_available():
    rows = [line.split() for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')]
    require(len(rows) == 1 and len(rows[0]) == 3 and rows[0][1].isdecimal() and rows[0][2] == 'kB', 'HOST_MEM_AVAILABLE_UNKNOWN')
    return int(rows[0][1]) * 1024


class ImagegenSimplifyController(SaasController):
    def __init__(self, tx, cfg):
        validate_config(cfg)
        # Skip ONLY SaaS's old transaction-specific __init__/validate_config.
        # The real BI/image/video/normal constructor and all primitives remain.
        VideoFamilyController.__init__(self, tx, cfg)
        local = pinned_json(cfg, 'localAcceptance')
        require(local.get('kind') == 'imagegen-simplify-prerelease-review'
                and local.get('sourceCommit') == cfg['commit'] and local.get('linuxBuildImage') == cfg['image']
                and str(local.get('buildVersion')) == cfg['version'] and local.get('scope') == SCOPE
                and local.get('priorImage') == cfg['oldWeb']['image']
                and all(local.get(k) is True for k in ('localAcceptancePassed', 'noUnresolvedP1P2',
                    'saasPermissionParityPassed', 'frozenQuotePgPassed', 'legacyImageBillingQuotePgPassed', 'legacyReceiptRecoveryPassed',
                    'controlledRecoveryFixturePassed', 'combinedWorkerMediaPassed', 'additiveSchemaCompatibilityPassed')),
                'PINNED_IMAGEGEN_LOCAL_ACCEPTANCE_INCOMPLETE')
        self.ingress = pinned_json(cfg, 'recoveryIngressAudit')
        require(self.ingress.get('evidenceMode') == 'live' and self.ingress.get('target') == cfg['target']
                and self.ingress.get('dumpSha256') == cfg['expectedGatewayDigest']
                and self.ingress.get('unaccountedNaumiPublicEndpoints') == [] and self.ingress.get('servers'),
                'CURRENT_PUBLIC_INGRESS_AUDIT_REQUIRED')
        validate_ingress(self.ingress)
        self.preserved_unknown = Guard({**cfg['preservedUnknown'],
            'supplementalPath': str(tx.folder / 'CASE05_SUPPLEMENT.private.json')}, self.sql, tx.save)
        self.quote_before = None

    def quote_snapshot(self):
        limit = self.cfg.get('snapshotRowLimit', 5000)
        require(type(limit) is int and 1 <= limit <= 5000, 'BOUNDED_QUOTE_SNAPSHOT_REQUIRED')
        result = {}
        for table in QUOTE_TABLES:  # Identifiers are source-fixed, never config SQL.
            catalog = self.sql("SELECT json_build_object('exists',to_regclass('public." + table + "') IS NOT NULL);")[0]
            if not catalog['exists']:
                result[table] = {'exists': False, 'rows': {}}
                continue
            data = self.sql("SELECT json_build_object('count',(SELECT count(*) FROM " + table + "),"
                "'rows',COALESCE(json_object_agg(id,h),'{}'::json)) FROM (SELECT id::text,"
                "encode(sha256(convert_to(to_jsonb(q)::text,'UTF8')),'hex') h FROM " + table + " q ORDER BY id LIMIT " + str(limit) + ")s;")[0]
            require(data['count'] <= limit and len(data['rows']) == data['count'], 'QUOTE_SNAPSHOT_TRUNCATED:' + table)
            result[table] = {'exists': True, 'rows': data['rows']}
        return result

    def check_quotes(self, stage):
        if self.quote_before is None:
            return  # Failure before a quote baseline cannot claim quote verification.
        after = self.quote_snapshot()
        for table, before in self.quote_before.items():
            require((after[table]['exists'] or not before['exists'])
                    and all(after[table]['rows'].get(k) == v for k, v in before['rows'].items()),
                    'FROZEN_QUOTE_ROW_CHANGED_OR_MISSING:' + table)
        self.tx.save('QUOTE_PRESERVATION_' + stage + '.json', {'stage': stage,
            'tables': {table: {'originalRows': len(before['rows']), 'currentRows': len(after[table]['rows'])}
                       for table, before in self.quote_before.items()}, 'originalRowsUnchanged': True, 'rowsReplayed': 0})

    def install_quote_schema(self):
        require(self.succ['operations'].get('database-backup', {}).get('phase') == 'ACKNOWLEDGED', 'READABLE_BACKUP_BEFORE_QUOTE_DDL')
        backup = json.loads((self.tx.folder / 'backup-readable.json').read_bytes())
        require(file_sha(backup['path']) == backup['sha256'] and backup.get('restoreExecuted') is False, 'READABLE_DATABASE_BACKUP_CHANGED')
        if any(row['exists'] for row in self.quote_before.values()):
            # Stream the dump; loading an entire production backup into RAM
            # would undermine the post-OOM host-reserve gate.
            with pathlib.Path(backup['path']).open('rb') as source:
                listed = subprocess.run(['docker', 'exec', '-i', self.db['id'], 'pg_restore', '--list'],
                    stdin=source, capture_output=True, timeout=60)
            require(listed.returncode == 0, 'QUOTE_BACKUP_REOPEN_FAILED')
            raw = listed.stdout
            for table, row in self.quote_before.items():
                require(not row['exists'] or ('TABLE DATA public ' + table + ' ').encode() in raw, 'EXISTING_QUOTE_TABLE_NOT_IN_BACKUP:' + table)
        def install(_operation):
            raw = self.tx.run(['docker', 'exec', '-i', self.db['id'], 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
                '-U', self.de['POSTGRES_USER'], '-d', self.de['POSTGRES_DB']], stdin=QUOTE_DDL.encode(), timeout=40)
            return {'ddlSha256': sha(QUOTE_DDL.encode()), 'resultSha256': sha(raw), 'additiveOnly': True, 'rowsReplayed': 0}
        self.op('quote-additive-schema', install)
        self.quote_schema_proof('AFTER_SCHEMA')
        self.check_quotes('AFTER_SCHEMA')

    def quote_schema_proof(self, stage):
        proof = {}
        for table, expected_columns in QUOTE_TABLES.items():
            columns = self.sql("SELECT json_build_object('columns',json_object_agg(column_name,data_type),'allNotNull',bool_and(is_nullable='NO')) "
                "FROM information_schema.columns WHERE table_schema='public' AND table_name='" + table + "';")[0]
            require(columns == {'columns': expected_columns, 'allNotNull': True}, 'QUOTE_SCHEMA_NOT_READY:' + table)
            query = """SELECT json_build_object(
 'primary',EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.app_imagegen_quotes'::regclass
    AND c.contype='p' AND pg_get_constraintdef(c.oid)='PRIMARY KEY (id)'),
 'ownerForeignKey',EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.app_imagegen_quotes'::regclass
    AND c.contype='f' AND c.convalidated AND c.confrelid='public.app_users'::regclass
    AND pg_get_constraintdef(c.oid)='FOREIGN KEY (owner) REFERENCES app_users(email)'),
 'ownerIndex',EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.app_imagegen_quotes'::regclass
    AND i.indisvalid AND i.indisready AND i.indpred IS NULL
    AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o)=ARRAY['owner','operation_id']),
 'expiryIndex',EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.app_imagegen_quotes'::regclass
    AND i.indisvalid AND i.indisready AND i.indpred IS NULL
    AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o)=ARRAY['expires_at']));"""
            keys = self.sql(query.replace('public.app_imagegen_quotes', 'public.' + table))[0]
            expected_keys = {'primary', 'ownerForeignKey', 'expiryIndex'}
            if table == 'app_imagegen_quotes': expected_keys.add('ownerIndex')
            require(expected_keys.issubset(keys) and all(keys[k] is True for k in expected_keys), 'QUOTE_KEYS_OR_INDEXES_NOT_READY:' + table)
            proof[table] = {'columns': columns, 'keys': keys}
        self.tx.save('QUOTE_SCHEMA_' + stage + '.json', {'tables': proof, 'additiveOnly': True, 'rowsReplayed': 0})

    def maintenance_and_import(self):
        # Called only after the parent's readable full DB backup under three locks.
        self.install_quote_schema()
        return super().maintenance_and_import()

    def retirement_memory_proof(self, stage, include_old=True):
        require(stage in ('ready', 'retire', 'after-retirement') and include_old is (stage != 'after-retirement'), 'INVALID_RAM_STAGE')
        started = time.monotonic()
        row = self.tx.pin(self.newweb)
        require(row['State']['Running'] and not row['State'].get('OOMKilled', False)
                and row['HostConfig']['Memory'] == self.cfg['webMemoryMiB'] * MIB
                and row['HostConfig']['MemorySwap'] == self.cfg['webMemoryMiB'] * MIB, 'CANDIDATE_MEMORY_OR_OOM_CHANGED')
        require(matches('[a-f0-9]{64}', row['Id']), 'EXACT_CGROUP_ID_REQUIRED')
        group = pathlib.Path('/sys/fs/cgroup/system.slice') / ('docker-' + row['Id'] + '.scope')
        current = (group / 'memory.current').read_text().strip()
        events = dict(line.split() for line in (group / 'memory.events').read_text().splitlines())
        require(current.isdecimal() and all(events.get(k, '').isdecimal() and int(events[k]) == 0
                for k in ('oom', 'oom_kill', 'max')), 'CANDIDATE_MEMORY_PRESSURE_REQUIRES_REVIEW')
        for identity in (self.web, self.worker):
            old = self.tx.inspect(identity['id'])
            require(all(public_identity(old)[k] == identity[k] for k in ('id', 'name', 'image', 'startedAt')), 'OLD_SLOT_RAM_IDENTITY_CHANGED')
            require(old['State']['Running'] if include_old else
                    not old['State']['Running'] and old['HostConfig']['RestartPolicy']['Name'] == 'no', 'OLD_SLOT_RETIREMENT_STATE_CHANGED')
        proof = ram_budget(mem_available(), int(current), self.cfg)
        require(time.monotonic() - started <= 5, 'RAM_OBSERVATION_TOO_SLOW')
        self.tx.save('IMAGEGEN_RAM_' + stage.upper().replace('-', '_') + '-' + uuid.uuid4().hex + '.json', {**proof, 'stage': stage, 'events': events})
        require(proof['passed'], 'REVIEWED_RAM_RESERVE_INSUFFICIENT')
        return proof

    def after_retirement(self):
        proof = self.retirement_memory_proof('after-retirement', include_old=False)
        manifest = json.loads(pathlib.Path(self.state['runtimeRecovery']['manifestPath']).read_bytes())
        recovery.recovery_binding(self.state, manifest)
        for role, identity, memory in [('web', self.newweb, self.cfg['webMemoryMiB']), ('worker', self.newworker, 1024)]:
            require(manifest[role]['id'] == identity['id'] and manifest[role]['memoryMiB'] == memory
                    and manifest[role]['staticSha256'] == recovery.static_pin(self.tx.pin(identity)), 'SUPERVISOR_RESOURCE_PINS_CHANGED')
        self.tx.save('IMAGEGEN_FINAL_RAM.json', {**proof, 'memoryUpdatedInPlace': False, 'restartExecuted': False})

    def permission_readiness(self):
        script = """let s='';for await(const c of process.stdin)s+=c;const p=JSON.parse(s);
const r=await fetch('http://127.0.0.1:3000'+p.path,{headers:p.cookie?{cookie:p.cookie}:{},redirect:'manual',signal:AbortSignal.timeout(12000)});
await r.arrayBuffer();console.log(JSON.stringify({status:r.status,commit:process.env.SOURCE_COMMIT}));"""
        checked = []
        for case in self.cfg['permissionChecks']:
            cookie = pathlib.Path(case['cookiePath']).read_text().strip() if case.get('cookiePath') else None
            require(cookie or case['name'] == 'anonymous-admin', 'EXISTING_PERMISSION_PRINCIPAL_REQUIRED')
            result = json.loads(self.tx.run(['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', self.newweb['id'],
                'node', '--input-type=module', '-e', script], stdin=json.dumps({'path': case['path'], 'cookie': cookie}).encode(), timeout=20))
            require(result == {'status': case['status'], 'commit': self.cfg['commit']}, 'LIVE_PERMISSION_PARITY_FAILED:' + case['name'])
            checked.append({'name': case['name'], 'status': result['status']})
        self.tx.save('IMAGEGEN_PERMISSION_HTTP.json', {'cases': checked, 'method': 'GET', 'permissionMutations': 0, 'supplierCalls': 0})

    def ready(self):
        self.quote_schema_proof('CANDIDATE_READY')
        self.check_quotes('CANDIDATE_READY')
        result = super().ready()  # CASE05 + real image decode + media/storage + tenant HTTP.
        self.permission_readiness()
        return result

    def switch_forward_gateway(self):
        self.check_quotes('BEFORE_SWITCH')
        self.retirement_memory_proof('retire')
        return super().switch_forward_gateway()

    def stop_exact(self, identity):
        self.check_quotes('BEFORE_RETIRE_' + ('WORKER' if identity == self.worker else 'WEB'))
        return super().stop_exact(identity)

    def verify_recovery_materials(self):
        self.quote_schema_proof('FINAL')
        self.check_quotes('FINAL')
        return super().verify_recovery_materials()

    def install_supervisor(self):
        super().install_supervisor()
        path = ctl.ROOT / 'saas-emergency-gateway/report.json'
        previous = copy.deepcopy(self.runtime['controlledMaintenanceReport'])
        self.state['runtimeRecovery']['controlledMaintenanceReport'] = {
            'path': str(path), 'sha256': file_sha(path),
            'gatewayDumpSha256': sha(self.after_dump.encode()), 'supersedes': previous,
            'compatibleBusinessRollback': False}
        self.persist()

    def failure_preservation_check(self, outcome, stage):
        super().failure_preservation_check(outcome, stage)
        try:
            self.check_quotes(stage.upper().replace('-', '_'))
        except BaseException as error:
            outcome.update(preservationHold=True, reconciliationRequired=True)
            outcome.setdefault('preservationErrors', []).append({'stage': stage, 'error': str(error) if isinstance(error, Hold) else type(error).__name__})

    def run(self):
        # Fresh run only. This small normal.run orchestration copy differs at
        # begin/RAM hooks; finish_ready/retire_ready/control/CAS are inherited.
        self.preserved_unknown.establish()
        self.quote_before = self.quote_snapshot()
        self.tx.save('QUOTE_BASELINE.private.json', self.quote_before)
        budget = ram_budget(mem_available(), 0, self.cfg)
        self.tx.save('IMAGEGEN_DUAL_SLOT_RAM.json', budget)
        require(budget['passed'], 'REVIEWED_DUAL_SLOT_MEMORY_INSUFFICIENT')
        require(self.state['revision'] == self.cfg['expectedRevision'] and sha(recovery.encoded(self.state)) == self.cfg['expectedCanonicalDigest'], 'FRESH_PREDECESSOR_REVIEW_REQUIRED')
        recovery.recovery_binding(self.state, self.original_manifest)
        require(sha(self.tx.run(['nginx', '-T'])) == self.cfg['expectedGatewayDigest'], 'GATEWAY_CHANGED')
        rows, held = self.incidents()
        self.incident_digest = ctl.policy.check_incidents(rows, held)
        self.tx.save('preserved-incidents.json', {'rows': rows, 'held': held, 'sha256': self.incident_digest})
        descriptor = self.tx.save('original-canonical.json', recovery.encoded(self.state))
        self.tx.save('original-canonical-exact.json', self.original)
        self.succ = begin(self.state, self.cfg, descriptor, self.incident_digest)
        self.succ.update(commit=self.cfg['commit'], buildVersion=self.cfg['version'], image=self.cfg['image'], previousRuntimeRecovery=copy.deepcopy(self.runtime))
        self.check_running_slots()
        require(not self.tx.run(['ss', '-Hltn', 'sport = :' + str(self.cfg['newPort'])]).strip(), 'CANDIDATE_PORT_IN_USE')
        require(ctl.c.app_status(self.tx, self.web)['observations']['unknownLeases'] == 0, 'CURRENT_UNKNOWN_WORK_REQUIRES_RECONCILIATION')
        self.state.setdefault('normalBlueGreenReleases', {})[ctl.RELEASE] = self.succ
        self.persist()
        self.tx.save('original-supervisor.service', pathlib.Path('/etc/systemd/system/naumi47-recovery.service').read_bytes())
        self.tx.save('original-recovery-manifest.json', pathlib.Path(self.runtime['manifestPath']).read_bytes())
        require(ctl.c.app_status(self.tx, self.web)['observations']['unknownLeases'] == 0, 'CURRENT_UNKNOWN_WORK_REQUIRES_RECONCILIATION')
        self.config_before = self.configuration_facts()
        self.tx.save('configuration-before.json', self.config_before)
        require(self.config_before == self.cfg['expectedConfigurationFacts'], 'MODEL_OR_BILLING_BASELINE_CHANGED')
        self.op('database-backup', lambda _: self.tx.backup_database(self.db))
        self.maintenance_and_import()
        self.pre = tasks.collect_task_snapshot(self.tx.run, self.db, self.tx.save, projection='proof', row_limit=self.cfg.get('snapshotRowLimit', 5000), allow_absent_tables=tasks.ADDITIVE_TABLES, statement_timeout_ms=self.cfg.get('snapshotStatementTimeoutMs', 5000))
        require(self.pre.public.get('tables'), 'TASK_BASELINE_MISSING')
        self.phase('BACKED_UP')
        require(ram_budget(mem_available(), 0, self.cfg)['passed'], 'REVIEWED_DUAL_SLOT_MEMORY_INSUFFICIENT')
        require(json.loads(self.tx.run(['docker', 'image', 'inspect', self.cfg['image']]))[0]['Id'] == self.cfg['image'], 'FIXED_IMAGE_MISSING')
        self.newweb = self.op('web-create', lambda _: self.tx.clone_web(self.web, name=ctl.WEB, port=self.cfg['newPort'], image=self.cfg['image'], commit=self.cfg['commit'], memory_mib=self.cfg['webMemoryMiB'], cpu=1.5, release_secret=secrets.token_urlsafe(48), state_dir=ctl.STATE + '/web', build_version=self.cfg['version'], reviewed_prior_state_dir=self.cfg['oldWebStateDir'], reviewed_nas_credentials_sha256=self.cfg.get('nasCredentialsSha256'), reviewed_video_reference_origin=self.cfg['videoReferencePublicOrigin'], reviewed_combined_media=self.cfg['combinedMedia']))
        ram = self.cfg['memoryReview']
        self.newweb = self.op('web-start', lambda _: self.tx.start_candidate(self.newweb, {k: ram[k] for k in ('webPeakMiB', 'workerPeakMiB', 'hostReserveMiB')}, mem_available() // MIB))
        self.wait(lambda: self.request(self.newweb, '/api/health'), 'WEB_START')
        self.newworker = self.op('worker-create', lambda _: ctl.c.clone_worker(self.tx, self.newweb, name=ctl.WORKER, memory_mib=1024, cpu=1, state_dir=ctl.STATE + '/worker', reviewed_combined_media=True))
        self.newworker = self.op('worker-start', lambda _: ctl.c.start_worker(self.tx, self.newworker, mem_available() // MIB, reserve_mib=ram['hostReserveMiB'], reviewed_combined_media=True))
        self.wait(lambda: self.worker_control(self.newworker, 'status', str(uuid.uuid4())), 'WORKER_START')
        self.phase('CANDIDATE', web=self.newweb, worker=self.newworker)
        self.ready()
        self.build_gateway()
        self.tx.save('candidate-server-actions.json', {'old': self.server_actions(self.web), 'new': self.server_actions(self.newweb)})
        ctl.save(ctl.ROOT / 'browser-private.json', {'releaseId': ctl.RELEASE, 'cookie': self.cookie, 'candidateOrigin': 'http://127.0.0.1:' + str(self.cfg['newPort']), 'commit': self.cfg['commit'], 'version': self.cfg['version']})
        self.phase('READY')
        self.wait(lambda: self.marker('browser-before.json'), 'BROWSER_BEFORE', 600)
        self.finish_ready()


def rollback_proof_check(cfg):
    """Offline gate only, NOT a program rollback command or live acceptance."""
    validate_config(cfg)
    require(isinstance(cfg.get('rollbackCompatibility'), dict), 'PRIOR_SAAS_PROGRAM_NOT_PROVEN_COMPATIBLE')
    spec = cfg['rollbackCompatibility']
    require(set(spec) == {'path', 'sha256'} and pathlib.PurePosixPath(spec['path']).parent == pathlib.PurePosixPath(cfg['evidenceRoot'])
            and matches('[a-f0-9]{64}', spec['sha256']), 'PINNED_ROLLBACK_COMPATIBILITY_REQUIRED')
    proof = pinned_json(cfg, 'rollbackCompatibility')
    require(proof.get('kind') == 'isolated-prior-saas-program-compatibility'
            and proof.get('evidenceMode') == 'isolated' and proof.get('target') == cfg['target']
            and proof.get('priorImage') == cfg['oldWeb']['image']
            and proof.get('candidateCommit') == cfg['commit'] and proof.get('candidateImage') == cfg['image']
            and all(proof.get(k) is True for k in ('permissionParityPassed', 'additiveSchemaCompatible',
                    'frozenQuoteContractsCompatible', 'originalUnknownPreserved', 'noAcceptedTaskReplay')),
            'PRIOR_SAAS_ROLLBACK_COMPATIBILITY_NOT_PROVEN')
    return {'offlineProof': 'PASS', 'priorProgramCutbackExecuted': False,
            'liveDrainedContractGateStillRequired': True, 'automaticPriorProgramRollbackEnabled': False}


def main(config_path):
    cfg = json.loads(pathlib.Path(config_path).read_bytes())
    validate_config(cfg)
    require(os.name == 'posix', 'LIVE_LINUX_HOST_REQUIRED')
    configure(cfg)
    with ctl.transaction() as tx:
        print('THREE_LOCKS=ACQUIRED', flush=True)
        predecessor_proof(tx, json.loads(ctl.CANON.read_bytes()), cfg)
        operator = ImagegenSimplifyController(tx, cfg)
        try:
            operator.run()
        except BaseException as error:
            operator.recover_failure(error)
            raise
    print('THREE_LOCKS=RELEASED', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=pathlib.Path)
    parser.add_argument('--check-config', action='store_true')
    parser.add_argument('--check-rollback-proof', action='store_true')
    parser.add_argument('--prepare-config', action='store_true')
    parser.add_argument('--live-baseline', type=pathlib.Path)
    parser.add_argument('--candidate-binding', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_bytes())
        if args.prepare_config:
            require(args.live_baseline is not None and args.candidate_binding is not None and args.output is not None,
                    'OFFLINE_CONFIG_INPUT_AND_OUTPUT_PATHS_REQUIRED')
            prepared = prepare_config(config, json.loads(args.live_baseline.read_bytes()), json.loads(args.candidate_binding.read_bytes()))
            # New output only; private mode; never overwrite a config or state.
            fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
                json.dump(prepared, stream, ensure_ascii=False, indent=2); stream.write('\n')
                stream.flush(); os.fsync(stream.fileno())
            require(json.loads(args.output.read_bytes()) == prepared, 'PREPARED_CONFIG_READBACK_FAILED')
            print('CONFIG_PREPARED=YES HOST_CONNECTIONS=0 LIVE_MUTATIONS=0')
        elif args.check_rollback_proof:
            print(json.dumps(rollback_proof_check(config), sort_keys=True))
        elif args.check_config:
            validate_config(config)
            print('CONFIG=PASS HOST_CONNECTIONS=0 LIVE_MUTATIONS=0')
        else:
            main(args.config)
    except (Hold, KeyError, TypeError, ValueError, OSError) as error:
        print('IMAGEGEN_SUCCESSOR_HOLD=' + (str(error) if isinstance(error, Hold) else type(error).__name__))
        raise SystemExit(2)
