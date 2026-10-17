#!/usr/bin/env python3
"""Single-process, locked, journalled Oct16 maintenance RPC. No SSH or arbitrary shell."""
import argparse
import copy
import datetime as dt
import json
import http.client
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import uuid
import urllib.parse
from types import SimpleNamespace

import release47_controls as controls
import release47_maintenance as maintenance
import release47_task_snapshot as tasks
import worker_handoff
from release47_host import HostTransaction, Hold, environment, public_identity, require, sha, file_sha
from release47_inventory import collect_inventory

ROOT = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle')
TERMINAL = {'COMPLETE', 'ROLLED_BACK'}
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
HASH = re.compile(r'[a-f0-9]{64}')
PHASES = ['NEW', 'BASELINED', 'BACKED_UP', 'MAINTENANCE', 'FROZEN', 'CANDIDATES',
          'ACCEPTED', 'PRESERVED', 'ACTIVE', 'MIGRATED_CLEANUP_PENDING', 'COMPLETE', 'ROLLED_BACK']


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def check_path(name, path):
    parsed = urllib.parse.urlsplit(path)
    require(not parsed.scheme and not parsed.netloc and path.startswith('/') and '\r' not in path and '\n' not in path,
            'CANDIDATE_RELATIVE_URL_REQUIRED')
    routes = {'login': ('/api/auth/session',), 'canvas': ('/api/projects', '/canvas'),
              'private-media': ('/api/media/',), 'old-client': ('/_next/static/', '/desktop/_next/static/', '/enterprise/_next/static/'),
              'skills': ('/api/agent/skills',), 'packaging': ('/api/packaging-strategy', '/tools/packaging-strategy'),
              'desktop-ui': ('/desktop', '/desktop/'), 'enterprise-ui': ('/enterprise', '/enterprise/'),
              'health': ('/api/health',), 'version': ('/api/version',)}
    require(name in routes and any(parsed.path == prefix or prefix.endswith('/') and parsed.path.startswith(prefix)
                                   for prefix in routes[name]), 'FEATURE_SPECIFIC_NONBILLABLE_GET_REQUIRED')


def assertion_value(assertion, body, status):
    kind = assertion.get('kind')
    if kind == 'status': return status
    if kind == 'bodySha256': return sha(body)
    if kind == 'bodyContains': return assertion['needle'].encode() in body
    if kind == 'json':
        require(isinstance(assertion.get('path'), list) and assertion['path'], 'TYPED_JSON_ASSERTION_REQUIRED')
        value = json.loads(body)
        for field in assertion['path']: value = value[field]
        return value
    raise Hold('CONCRETE_RESPONSE_ASSERTION_REQUIRED')


def load_json(path, limit=16 * 1024 * 1024):
    require(not path.is_symlink() and path.is_file() and path.stat().st_size <= limit,
            'PRIVATE_ARTIFACT_UNREADABLE')
    try:
        return json.loads(path.read_bytes())
    except (ValueError, UnicodeError):
        raise Hold('PRIVATE_JSON_ARTIFACT_INVALID') from None


def relative_artifact(folder, descriptor):
    require(isinstance(descriptor, dict) and set(descriptor) == {'path', 'sha256'} and
            HASH.fullmatch(descriptor.get('sha256', '')), 'HASH_BOUND_ARTIFACT_REQUIRED')
    relative = pathlib.PurePosixPath(descriptor['path'])
    require(not relative.is_absolute() and relative.parts and '..' not in relative.parts and
            '\\' not in descriptor['path'], 'RELATIVE_PRIVATE_ARTIFACT_REQUIRED')
    path = folder.joinpath(*relative.parts)
    require(not any(p.is_symlink() for p in [path, *path.parents] if p != folder.parent) and
            path.resolve().is_relative_to(folder.resolve()) and path.is_file() and
            path.stat().st_size <= 16 * 1024 * 1024 and sha(path.read_bytes()) == descriptor['sha256'],
            'PRIVATE_ARTIFACT_HASH_OR_PATH_CHANGED')
    return path


def valid_plan(plan):
    require(isinstance(plan, dict) and plan.get('schemaVersion') == 1 and
            plan.get('target') in ['47.105.59.142', '103.30.76.93'] and
            re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', plan.get('releaseId', '')) and
            HASH.fullmatch(plan.get('hostIdentitySha256', '')) and
            re.fullmatch('[a-f0-9]{40}', plan.get('commit', '')) and
            re.fullmatch('[0-9]{10,13}', plan.get('buildVersion', '')), 'FIXED_SESSION_PLAN_REQUIRED')
    require(plan.get('authorization', {}).get('target') == plan['target'], 'AUTHORIZATION_TARGET_MISMATCH')
    require(not plan.get('mediaWorker') or maintenance.canvas_video_hk(plan['authorization']), 'MEDIA_VIDEO_GOAL_ONLY')
    if 'supersedesUnpublished' in plan:
        descriptor = plan['supersedesUnpublished']
        require(maintenance.canvas_video_hk(plan['authorization']) and isinstance(descriptor, dict) and
                set(descriptor) == {'releaseId', 'stateSha256'} and
                re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', descriptor.get('releaseId', '')) and
                HASH.fullmatch(descriptor.get('stateSha256', '')), 'PINNED_UNPUBLISHED_BASELINE_DESCRIPTOR_REQUIRED')
    topology = plan.get('runtimeTopology', 'separate-compiled-variants')
    require(topology in ['separate-compiled-variants', 'unified-web-three-ui'] and
            (topology != 'unified-web-three-ui' or plan['target'] == '103.30.76.93'), 'EXPLICIT_HOST_RUNTIME_TOPOLOGY_REQUIRED')
    names = [v.get('variant') for v in plan.get('webs', [])]
    unified = topology == 'unified-web-three-ui'
    require(names == (['main'] if plan['target'] == '47.105.59.142' or unified else ['main', 'desktop', 'enterprise']),
            'HOST_SPECIFIC_ORDERED_VARIANTS_REQUIRED')
    ports, slots = set(), set()
    for web in plan['webs']:
        require(re.fullmatch('sha256:[a-f0-9]{64}', web.get('image', '')) and
                web.get('assetPrefix') == {'main': '', 'desktop': '/desktop', 'enterprise': '/enterprise'}[web['variant']],
                'COMPILED_VARIANT_IMAGE_REQUIRED')
        require(type(web.get('port')) is int and web['port'] not in ports and web.get('name') not in slots,
                'UNIQUE_CANDIDATE_PORT_AND_NAME_REQUIRED')
        ports.add(web['port']); slots.add(web['name'])
        require(web.get('requiredChecks') and set(web['requiredChecks']) >= {'login', 'canvas', 'private-media', 'old-client'},
                'USER_FUNCTION_ACCEPTANCE_CHECKS_REQUIRED')
        if unified:
            require(set(web['requiredChecks']) >= {'desktop-ui', 'enterprise-ui'}, 'THREE_REAL_UI_ACCEPTANCE_CHECKS_REQUIRED')
    require(plan.get('restoreDatabase') is False and plan.get('replayAcceptedTasks') is False and
            plan.get('legacyCaller') and plan.get('database') and plan.get('baseline'), 'PRESERVATION_SCOPE_REQUIRED')
    if maintenance.canvas_video_hk(plan['authorization']):
        maintenance.authorize(plan['authorization'])
        require(plan['releaseId'].startswith('canvas-video-fusion-') and plan.get('mediaWorker') is not None and
                topology == 'unified-web-three-ui',
                'VIDEO_GOAL_MEDIA_RELEASE_PLAN_REQUIRED')
        from release_video_media import validate_spec
        validate_spec(plan)
    elif maintenance.immediate_hk(plan['authorization']):
        require(plan['target'] == '103.30.76.93' and
                plan['authorization'].get('userImmediateAcknowledgement') == maintenance.IMMEDIATE_HK_ACK and
                plan['authorization'].get('notBefore') == maintenance.IMMEDIATE_HK_NOT_BEFORE,
                'EXPLICIT_IMMEDIATE_HK_ONLY_AUTHORIZATION_REQUIRED')
    elif plan['target'] == '103.30.76.93':
        require(plan.get('predecessor47') and HASH.fullmatch(plan['predecessor47'].get('sha256', '')),
                '47_BEFORE_103_RECEIPT_REQUIRED')
    return plan


def supersede_unpublished_baseline(root, old, old_raw, plan):
    """Archive only an explicitly SHA-bound, acknowledged read-only baseline.

    Called with the current goal's HostTransaction locks held. No workload,
    gateway, database, backup, or accepted operation is modified here.
    """
    descriptor = plan.get('supersedesUnpublished')
    allowed_fields = {'schemaVersion', 'releaseId', 'target', 'planSha256', 'phase', 'revision', 'operations', 'webs',
                      'startedAt', 'legacyDrainProven', 'legacyActiveTicks', 'acceptedTasks', 'agentSessions',
                      'databaseRestored', 'tasksReplayed', 'retired', 'history', 'status', 'baselineInventory', 'before'}
    require(type(old.get('schemaVersion')) is int and old['schemaVersion'] == 1 and set(old) <= allowed_fields,
            'UNKNOWN_BASELINE_JOURNAL_SCHEMA')
    require(maintenance.canvas_video_hk(plan['authorization']) and plan['target'] == '103.30.76.93' and
            isinstance(descriptor, dict) and set(descriptor) == {'releaseId', 'stateSha256'},
            'EXPLICIT_UNPUBLISHED_BASELINE_SUPERSESSION_REQUIRED')
    require(descriptor['releaseId'] == old['releaseId'] and descriptor['stateSha256'] == sha(old_raw) and
            old.get('target') == plan['target'] and old.get('phase') == 'BASELINED' and
            re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', old['releaseId']) and
            old.get('status') == 'PREPARED' and type(old.get('revision')) is int and old['revision'] == 2,
            'UNPUBLISHED_BASELINE_IDENTITY_CHANGED')
    operations = old.get('operations'); history = old.get('history')
    require(isinstance(operations, dict) and len(operations) == 1 and isinstance(history, list) and len(history) == 1,
            'ONLY_ONE_READONLY_BASELINE_MAY_BE_SUPERSEDED')
    operation_id, operation = next(iter(operations.items()))
    require(operation.get('phase') == 'ACKNOWLEDGED' and operation.get('request', {}).get('action') == 'baseline' and
            history[0].get('operationId') == operation_id and history[0].get('action') == 'baseline' and
            history[0].get('result') == 'ACKNOWLEDGED' and old.get('webs') == {} and old.get('retired') == [] and
            old.get('databaseRestored') is False and old.get('tasksReplayed') is False and
            not any(key in old for key in ['backup', 'maintenance', 'freeze', 'worker', 'openGateway', 'lastError',
                                          'capacityPreflight', 'activation', 'after', 'rollbackGateway', 'rollbackCaller']),
            'MUTATING_OR_UNKNOWN_RELEASE_CANNOT_BE_SUPERSEDED')
    def preserve(path, raw):
        require(not path.is_symlink(), 'SUPERSESSION_ARCHIVE_SYMLINK')
        if path.exists():
            require(path.read_bytes() == raw, 'SUPERSESSION_ARCHIVE_CONFLICT')
            return
        fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as output:
                output.write(raw); output.flush(); os.fsync(output.fileno())
            try:
                os.link(temporary, path)
            except FileExistsError:
                require(not path.is_symlink() and path.read_bytes() == raw, 'SUPERSESSION_ARCHIVE_CONFLICT')
            if os.name == 'posix':
                parent = os.open(path.parent, os.O_RDONLY)
                try: os.fsync(parent)
                finally: os.close(parent)
        finally:
            pathlib.Path(temporary).unlink(missing_ok=True)
        require(path.read_bytes() == raw, 'SUPERSESSION_ARCHIVE_REOPEN_FAILED')
    require((root / 'current.json').read_bytes() == old_raw, 'SUPERSESSION_CURRENT_CAS_CHANGED')
    preserve(root / (old['releaseId'] + '.baseline-original.json'), old_raw)
    aborted = {**old, 'phase': 'ABORTED', 'status': 'ABORTED', 'supersededBy': plan['releaseId'],
               'supersededStateSha256': sha(old_raw), 'abortReason': 'UNPUBLISHED_READONLY_BASELINE_REPLACED'}
    preserve(root / (old['releaseId'] + '.json'), encoded(aborted) + b'\n')
    return {'releaseId': old['releaseId'], 'stateSha256': sha(old_raw), 'onlyReadOnlyBaseline': True,
            'originalPreserved': True, 'workloadsChanged': False}


PROBE = r"""
const [wantedCommit,wantedBuild,wantedPrefix]=process.argv.slice(1);
const fs=await import('node:fs');
const cfg=JSON.parse(fs.readFileSync('/app/.next/required-server-files.json','utf8')).config;
if((cfg.assetPrefix||'')!==wantedPrefix)throw Error('COMPILED_VARIANT_MISMATCH');
const results={};
for(const path of ['/api/health','/api/version']){
const r=await fetch('http://127.0.0.1:3000'+path,{signal:AbortSignal.timeout(10000)});
if(!r.ok)throw Error('PROBE_HTTP_'+r.status);results[path]=await r.json();}
const version=results['/api/version'];
if(version.commit!==wantedCommit||String(version.version)!==wantedBuild)throw Error('PROBE_VERSION_MISMATCH');
console.log(JSON.stringify({health:results['/api/health'],version,assetPrefix:cfg.assetPrefix||''}));
"""


class LiveAdapter:
    """Only these finite operations can reach the host. Steps cannot supply argv."""
    def __init__(self, tx, plan):
        self.tx, self.plan = tx, plan

    def media(self):
        if not self.plan.get('mediaWorker'):
            return None
        from release_video_media import MediaLifecycle
        return MediaLifecycle(self.tx, self.plan)

    def private_save(self, operation):
        def save(name, value):
            raw = value if isinstance(value, bytes) else encoded(value)
            name = operation + '-' + sha(raw)[:16] + '-' + name
            path = self.tx.folder / name
            if path.exists():
                require(not path.is_symlink() and path.read_bytes() == (raw if isinstance(value, bytes) else json.dumps(value, sort_keys=True).encode() + b'\n'),
                        'PRIVATE_CAPTURE_CAS_CHANGED')
                return {'path': str(path), 'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size}
            return self.tx.save(name, value)
        return save

    def inventory(self, operation):
        result = collect_inventory(command=self.tx.run, private_save=self.private_save(operation),
                                   expected_host_sha256=self.plan['hostIdentitySha256'])
        errors = result.get('errors')
        require(isinstance(errors, list), 'FRESH_BASELINE_INCOMPLETE')
        if errors:
            # Only this explicitly authorized Oct16 103 maintenance baseline can
            # retain these catalog observation gaps. They remain real errors,
            # never systemd-reference completeness, task drain or stop evidence.
            allowed = {('systemd-unit-list', 'SERVICE_LIMIT_EXCEEDED'),
                       ('systemd-unit-cat', 'OBSERVATION_UNAVAILABLE'),
                       ('systemd-unit-show', 'OBSERVATION_UNAVAILABLE')}
            require(self.plan.get('target') == '103.30.76.93' and
                    getattr(self.tx, 'target', None) == '103.30.76.93' and
                    self.plan.get('authorization', {}).get('target') == '103.30.76.93' and
                    all(isinstance(error, dict) and
                        (error.get('source'), error.get('code')) in allowed for error in errors),
                    'FRESH_BASELINE_INCOMPLETE')
            maintenance.authorize(self.plan['authorization'])
        require(result.get('hostIdentityMatches') is True and
                result.get('dockerInventory', {}).get('complete') is True and
                result.get('dockerInventory', {}).get('stable') is True and
                result.get('nginx', {}).get('stable') is True and
                HASH.fullmatch(result.get('nginx', {}).get('fullDumpSha256', '')),
                'FRESH_BASELINE_INCOMPLETE')
        containers = result.get('containers', [])
        baseline = self.plan['baseline']
        require(len({row.get('id') for row in containers}) == len(containers) and
                len({row['id'] for row in baseline}) == len(baseline), 'FRESH_BASELINE_IDENTITY_INCOMPLETE')
        for identity in baseline:
            matches = [row for row in containers if row.get('id') == identity['id']]
            require(len(matches) == 1 and all(matches[0].get(key) == value for key, value in identity.items()),
                    'FRESH_BASELINE_IDENTITY_INCOMPLETE')
            self.tx.pin(identity)
        result['baselineCoverage'] = {
            'kind': 'layered-maintenance-baseline-not-retirement-evidence',
            'coreComplete': True,
            'systemdReferenceCoverage': 'partial' if errors else result.get('systemdCoverage', 'unknown'),
            'retainedSystemdErrors': copy.deepcopy(errors),
            'retirementEvidence': False, 'taskDrainEvidence': False}
        return result

    def snapshot(self, operation, previous=None):
        result = tasks.collect_task_snapshot(self.tx.run, self.plan['database'], self.private_save(operation), previous=previous,
                    row_limit=5000, projection='proof', allow_absent_tables=tasks.ADDITIVE_TABLES)
        return {'public': result.public, 'private': result.private}

    def legacy_safety(self, *, frozen, retired=(), restored=False, restore_reconcile=False):
        """A paused external caller does not stop App-internal timers."""
        caller = self.plan['legacyCaller']['identity']
        required = {web['source']['id'] for web in self.plan['webs']}
        require(required <= {identity['id'] for identity in self.plan['baseline']}, 'ALL_SOURCE_WEBS_REQUIRE_RUNTIME_BASELINE')
        checked = set()
        caller_frozen = False
        for identity in [*self.plan['baseline'], caller]:
            if identity['id'] in checked: continue
            checked.add(identity['id'])
            row = self.tx.inspect(identity['id']) if identity['id'] in retired else self.tx.pin(identity)
            if identity['id'] in retired:
                require(row['Id'] == identity['id'] and row['Image'] == identity['image'] and
                        row['State']['Running'] is False, 'RETIRED_RUNTIME_RESTARTED')
                continue
            cmd = row['Config'].get('Cmd')
            if identity['id'] == caller['id']:
                paused = row['State'].get('Paused')
                expected = frozen and not restored
                if paused is False and expected and restore_reconcile:
                    intent = load_json(self.tx.folder / ('legacy-caller-restore-intent-' + caller['id'][:12] + '.json'))
                    require(intent.get('identity') == caller, 'ORIGINAL_CALLER_RESTORE_INTENT_CHANGED')
                    expected = False
                require(cmd in [['scripts/video-worker.mjs'], ['node', 'scripts/video-worker.mjs']] and
                        row['State']['Running'] is True and paused is expected,
                        'LEGACY_CALLER_FROZEN_STATE_CHANGED')
                require(environment(row).get('NAUMI_WORKER_RELEASE_CONTROL') != '1', 'LEGACY_CALLER_ROLE_CHANGED')
                caller_frozen = paused
            else:
                require(cmd == ['node', 'server.js'], 'BASELINE_NON_WEB_OR_INFRA_FORBIDDEN')
                require(environment(row).get('NAUMI_VIDEO_WORKER') == '0', 'OLD_WEB_INTERNAL_CLAIM_TIMER_NOT_DISABLED')
        return {'legacyCallerFrozen': caller_frozen, 'oldWebTimersExplicitlyDisabled': True,
                'legacyDrainProven': False}

    def preflight(self, operation):
        """All candidate variants fit concurrently BEFORE any maintenance503."""
        self.legacy_safety(frozen=False)
        available = self.available()
        worker = self.plan['worker']
        require(type(worker.get('memoryMiB')) is int and 96 <= worker['memoryMiB'] <= 512, 'BOUNDED_WORKER_RESOURCES_REQUIRED')
        peaks, reserves, worker_peaks = [], [], [worker['memoryMiB']]
        for web in self.plan['webs']:
            budget = web.get('budget', {})
            require(type(web.get('memoryMiB')) is int and web['memoryMiB'] >= 512 and
                    all(type(budget.get(field)) is int and budget[field] > 0 for field in
                        ['webPeakMiB', 'workerPeakMiB', 'hostReserveMiB']) and budget['hostReserveMiB'] >= 1024,
                    'ALL_VARIANT_MEASURED_RAM_BUDGETS_REQUIRED')
            peaks.append(max(web['memoryMiB'], budget['webPeakMiB']))
            worker_peaks.append(budget['workerPeakMiB']); reserves.append(budget['hostReserveMiB'])
        media = self.plan.get('mediaWorker', {}).get('memoryMiB', 0)
        required = sum(peaks) + max(worker_peaks) + max(reserves) + media
        require(available >= required, 'INSUFFICIENT_ALL_VARIANT_PRE_MAINTENANCE_MEMORY')
        return {'availableMiB': available, 'requiredMiB': required, 'webVariantBudgetsMiB': peaks,
                'workerBudgetMiB': max(worker_peaks), 'mediaBudgetMiB': media, 'reserveMiB': max(reserves), 'swapIncluded': False,
                'observedAt': timestamp(), 'legacyDrainProven': False}

    def backup(self, operation, reconcile=False):
        root = self.tx.folder
        journal = root / ('backup-operation-' + operation + '.json')
        binding = {'database': self.plan['database'], 'restoreExecuted': False}
        if journal.exists():
            saved = load_json(journal)
            require(saved.get('binding') == binding, 'BACKUP_OPERATION_BINDING_CHANGED')
        else:
            saved = {'binding': binding, 'attempts': []}
        candidates = [pathlib.Path(attempt['folder']) / 'backup-readable.json' for attempt in saved['attempts']]
        # Older session versions wrote directly under the same private release
        # folder. Only re-observe; never assume a past read failure was success.
        if reconcile: candidates.append(root / 'backup-readable.json')
        errors = []
        for path in reversed(candidates):
            if not path.exists(): continue
            try:
                record = self.verify_backup(path)
                saved['verifiedRecord'] = str(path); saved['phase'] = 'READABLE'
                controls._atomic_private(journal, saved)
                return record
            except (Hold, OSError, ValueError, KeyError, subprocess.SubprocessError):
                errors.append(sha(str(path).encode()))
        # pg_dump is read-only. A fresh isolated attempt is safe after a failed
        # dump/list/hash read; retain every old/partial artifact, never overwrite.
        self.tx.pin(self.plan['database'])
        folder = root / ('backup-' + operation + '-attempt-' + str(uuid.uuid4()))
        folder.mkdir(mode=0o700, exist_ok=False)
        saved['attempts'].append({'folder': str(folder), 'phase': 'READ_INTENT', 'at': timestamp()})
        saved['failedEvidenceHashes'] = errors
        controls._atomic_private(journal, saved)
        try:
            self.tx.folder = folder
            descriptor = self.tx.backup_database(self.plan['database'])
        finally:
            self.tx.folder = root
        record = self.verify_backup(pathlib.Path(descriptor['path']))
        saved['phase'] = 'READABLE'; saved['verifiedRecord'] = descriptor['path']
        controls._atomic_private(journal, saved)
        return record

    def verify_backup(self, path):
        require(path.resolve().is_relative_to(self.tx.folder.resolve()) and not path.is_symlink(), 'PRIVATE_BACKUP_RECORD_PATH_REQUIRED')
        record = load_json(path)
        dump = pathlib.Path(record['path'])
        require(path.resolve().is_relative_to(self.tx.folder.resolve()) and dump.resolve().is_relative_to(self.tx.folder.resolve()) and
                not any(p.is_symlink() for p in [path, dump, *dump.parents] if p.is_relative_to(self.tx.folder)) and dump.is_file() and
                dump.stat().st_size == record['bytes'] and file_sha(dump) == record['sha256'] and
                record.get('restoreExecuted') is False, 'READABLE_BACKUP_IDENTITY_CHANGED')
        self.tx.pin(self.plan['database'])
        with dump.open('rb') as stream:
            require(self.tx._command is None, 'LIVE_BACKUP_REOPEN_REQUIRES_REAL_COMMAND')
            result = subprocess.run(['docker', 'exec', '-i', self.plan['database']['id'], 'pg_restore', '--list'],
                                    stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            require(result.returncode == 0, 'BACKUP_REOPEN_FAILED')
            listing = result.stdout
        require(b'TABLE DATA' in listing and sha(listing) == record['listSha256'], 'BACKUP_REOPEN_FAILED')
        with dump.open('rb') as stream:
            # Decode the entire archive to discarded SQL; no -d/--dbname, no
            # connection and no restore. A valid TOC alone misses corrupt data.
            result = subprocess.run(['docker', 'exec', '-i', self.plan['database']['id'], 'pg_restore',
                                     '--file=/dev/null', '--no-owner', '--no-acl'],
                                    stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
        require(result.returncode == 0, 'BACKUP_DATA_UNREADABLE')
        self.tx.pin(self.plan['database'])
        return record

    def gateway(self, kind, operation, reconcile=False):
        descriptor = self.plan['gateways'][kind]
        folder = self.tx.folder
        report = load_json(relative_artifact(folder, descriptor['report']))
        before = {name: relative_artifact(folder, item).read_bytes() for name, item in descriptor['before'].items()}
        after = {name: relative_artifact(folder, item).read_bytes() for name, item in descriptor['after'].items()}
        logical = {name: str(pathlib.Path(name).resolve(strict=True)) for name in before}
        journal = folder / ('gateway-operation-' + operation + '.json')
        binding = {'kind': kind, 'descriptorSha256': sha(encoded(descriptor)), 'logicalToReal': logical}
        if journal.exists():
            saved = load_json(journal)
            require(saved.get('binding') == binding, 'GATEWAY_ORIGINAL_OPERATION_CHANGED')
        else:
            saved = {'binding': binding, 'attempts': []}
        current = sha(self.tx.run(['nginx', '-T']))
        if reconcile and current == report['afterDumpSha256']:
            intents = [pathlib.Path(attempt['folder']) / 'gateway-transaction-intent.json' for attempt in saved['attempts']]
            # Compatibility with a previous session version's original evidence.
            intents.append(folder / ('gateway-' + operation) / 'gateway-transaction-intent.json')
            known = False
            for intent in intents:
                if not intent.exists(): continue
                original_intent = load_json(intent)
                known |= original_intent.get('beforeDumpSha256') == report['beforeDumpSha256'] and \
                         original_intent.get('afterDumpSha256') == report['afterDumpSha256'] and \
                         original_intent.get('patches') == report['patches']
            require(known, 'EXACT_GATEWAY_WRITE_INTENT_REQUIRED_FOR_RECONCILIATION')
            require(all(pathlib.Path(logical[name]).read_bytes() == after.get(name, raw) for name, raw in before.items()),
                    'GATEWAY_RECONCILE_CLOSURE_CHANGED')
            self.tx.run(['nginx', '-t']); self.tx.run(['systemctl', 'reload', 'nginx'])
            return {'afterDumpSha256': current, 'reloadIssued': True, 'result': 'EXPLICIT_SAME_INTENT_RECONCILED'}
        require(current == report['beforeDumpSha256'], 'GATEWAY_BASELINE_CHANGED')
        require(all(pathlib.Path(logical[name]).read_bytes() == raw for name, raw in before.items()),
                'GATEWAY_BEFORE_REOBSERVATION_CHANGED')
        # The underlying function uses fixed evidence names. Isolate per operation;
        # retain the same HostTransaction and all its locks, never nested transactions.
        original = self.tx.folder
        evidence = original / ('gateway-' + operation + '-attempt-' + str(uuid.uuid4()))
        evidence.mkdir(mode=0o700, exist_ok=False)
        saved['attempts'].append({'folder': str(evidence), 'phase': 'EXACT_BEFORE_OBSERVED', 'at': timestamp()})
        controls._atomic_private(journal, saved)
        try:
            self.tx.folder = evidence
            return controls.switch_gateway_bundle(self.tx, report, before, after,
                         expected_dump_sha=current, logical_to_real=logical)
        finally:
            self.tx.folder = original

    def freeze(self, operation, reconcile=False):
        caller = self.plan['legacyCaller']
        if reconcile and self.tx.pin(caller['identity'])['State'].get('Paused') is True:
            intent = load_json(self.tx.folder / ('legacy-caller-freeze-intent-' + caller['identity']['id'][:12] + '.json'))
            require(intent.get('identity') == caller['identity'] and intent.get('scriptSha256') == caller['scriptSha256'],
                    'AUDITED_ORIGINAL_FREEZE_INTENT_REQUIRED')
            return {'identity': caller['identity'], 'frozen': True, 'coverage': 'legacy-unknown',
                    'activeTicks': None, 'acceptedTasks': None, 'reconciledFromExactIntent': operation}
        return maintenance.freeze_legacy_caller(self.tx, caller['identity'], expected_script_sha256=caller['scriptSha256'])

    def web_create(self, web, operation, reconcile=False):
        media = self.media()
        phase_file = self.tx.folder / ('media-web-create-' + operation + '.json')
        binding = {'operationId': operation, 'variant': web['variant'], 'name': web['name'], 'image': web['image']}
        if media:
            if phase_file.exists():
                phase = load_json(phase_file)
                require(phase.get('binding') == binding, 'MEDIA_WEB_OPERATION_CHANGED')
            else:
                require(not reconcile, 'MEDIA_WEB_PHASE_JOURNAL_REQUIRED')
                phase = {'binding': binding, 'phase': 'MEDIA_PREPARING'}
                controls._atomic_private(phase_file, phase)
            media.prepare()
            if phase['phase'] == 'MEDIA_PREPARING':
                phase['phase'] = 'MEDIA_READY'; controls._atomic_private(phase_file, phase)
            if reconcile and phase['phase'] == 'MEDIA_READY':
                require(not self.tx.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + web['name'] + '$']).decode().strip(),
                        'APP_PRESENT_WITHOUT_CREATE_INTENT')
                # The marker is set by clone_web immediately before Docker
                # create, so a preceding media/validation failure is unissued.
                reconcile = False
        if reconcile:
            row = self.tx.inspect(web['name']); env = environment(row)
            receipt = load_json(self.tx.folder / ('candidate-created-' + row['Id'][:12] + '.json'))
            require(row['Image'] == web['image'] and env.get('SOURCE_COMMIT') == self.plan['commit'] and
                    env.get('BUILD_VERSION') == self.plan['buildVersion'] and env.get('NAUMI_INSTANCE_ID') == web['name'] and
                    env.get('NAUMI_VIDEO_WORKER') == '0' and env.get('NAUMI_RELEASE_ADMISSION_START') == 'draining' and
                    receipt == public_identity(row),
                    'UNKNOWN_CREATED_WEB_REQUIRES_PRIVATE_REVIEW')
            if media:
                media.verify_app(row)
                phase['phase'] = 'APP_CREATED'; controls._atomic_private(phase_file, phase)
            return public_identity(row)
        require(web['name'] not in [r.get('name') for r in self.inventory(operation)['containers']], 'CANDIDATE_NAME_ALREADY_EXISTS')
        def mark_create():
            phase['phase'] = 'APP_CREATING'; controls._atomic_private(phase_file, phase)
        created = self.tx.clone_web(web['source'], name=web['name'], port=web['port'], image=web['image'],
            commit=self.plan['commit'], memory_mib=web['memoryMiB'], cpu=web['cpu'],
            release_secret=self.plan['releaseSecret'], state_dir=web['stateDir'], build_version=self.plan['buildVersion'],
            reviewed_omitted_mounts=web.get('reviewedOmittedMounts'),
            **({'media_binding': media.binding(), 'before_create': mark_create,
                'runtime_recovery': self.plan['releaseId']} if media else {}))
        if media:
            phase['phase'] = 'APP_CREATED'; controls._atomic_private(phase_file, phase)
        return created

    def available(self):
        text = self.tx.run(['cat', '/proc/meminfo']).decode()
        match = re.search(r'^MemAvailable:\s+(\d+)\s+kB$', text, re.M)
        require(match is not None, 'MEMAVAILABLE_UNKNOWN')
        return int(match.group(1)) // 1024

    def web_start(self, web, identity, operation, reconcile=False):
        if reconcile:
            row = self.tx.inspect(identity['id'])
            path = self.tx.folder / ('candidate-start-intent-' + identity['id'][:12] + '.json')
            require(not path.is_symlink(), 'START_INTENT_SYMLINK_FORBIDDEN')
            if not path.exists():
                # start_candidate writes this intent only AFTER pin+memory gate
                # and BEFORE docker start. Its absence plus exact stopped
                # original identity proves this operation issued no start.
                require(public_identity(row) == identity and identity['running'] is False and
                        not row['State'].get('Paused', False), 'START_WITHOUT_INTENT_NOT_PROVEN_UNEXECUTED')
                return self.tx.start_candidate(identity, web['budget'], self.available())
            receipt = load_json(path)
            actual = public_identity(row)
            require(receipt == identity and actual['running'] is True and
                    all(actual[field] == identity[field] for field in ['id', 'name', 'image', 'restartPolicy']),
                    'UNKNOWN_WEB_START_NOT_OBSERVED')
            return public_identity(row)
        return self.tx.start_candidate(identity, web['budget'], self.available())

    def verify(self, web, identity, operation):
        row = self.tx.pin(identity)
        if self.media():
            self.media().verify_app(row)
            require(self.media().health()['draining'] is True, 'CANDIDATE_MEDIA_MUST_STAY_DRAINING')
        actual = json.loads(self.tx.run(['docker', 'exec', identity['id'], 'node', '--input-type=module', '-e', PROBE,
                                        self.plan['commit'], self.plan['buildVersion'], web['assetPrefix']]))
        status = controls.app_status(self.tx, identity)
        require(actual.get('health', {}).get('db', {}).get('ok') is True, 'CANDIDATE_DATABASE_HEALTH_REQUIRED')
        require(status['admission']['mode'] in ['draining', 'open'], 'CANDIDATE_ADMISSION_UNKNOWN')
        return {'identity': identity, 'app': status, 'probe': actual, 'observedAt': timestamp()}

    def worker_create(self, web, operation, reconcile=False):
        spec = self.plan['worker']
        if reconcile:
            row = self.tx.inspect(spec['name']); env = environment(row)
            receipt = load_json(self.tx.folder / ('worker-created-' + row['Id'][:12] + '.json'))
            require(row['Image'] == web['image'] and env.get('SOURCE_COMMIT') == self.plan['commit'] and
                    env.get('NAUMI_APP_ORIGIN') == 'http://' + web['name'] + ':3000' and
                    env.get('NAUMI_WORKER_START_PAUSED') == '1' and receipt == public_identity(row), 'UNKNOWN_CREATED_WORKER_REQUIRES_PRIVATE_REVIEW')
            return public_identity(row)
        return controls.clone_worker(self.tx, web, name=spec['name'], memory_mib=spec['memoryMiB'],
                                     cpu=spec['cpu'], state_dir=spec['stateDir'])

    def worker_start(self, identity, operation, reconcile=False):
        if reconcile:
            row = self.tx.inspect(identity['id'])
            path = self.tx.folder / ('worker-start-intent-' + identity['id'][:12] + '.json')
            require(not path.is_symlink(), 'START_INTENT_SYMLINK_FORBIDDEN')
            if not path.exists():
                require(public_identity(row) == identity and identity['running'] is False and
                        not row['State'].get('Paused', False), 'START_WITHOUT_INTENT_NOT_PROVEN_UNEXECUTED')
                return controls.start_worker(self.tx, identity, self.available())
            receipt = load_json(path)
            actual = public_identity(row)
            require(receipt == identity and actual['running'] is True and
                    all(actual[field] == identity[field] for field in ['id', 'name', 'image', 'restartPolicy']),
                    'UNKNOWN_WORKER_START_NOT_OBSERVED')
            return public_identity(row)
        return controls.start_worker(self.tx, identity, self.available())

    def observed_started_identity(self, identity):
        self.tx.pin(identity)
        require(identity['running'] is True, 'KNOWN_STARTED_PROCESS_REQUIRED')
        return identity

    def worker_control(self, identity, web, action, operation):
        self.tx.pin(identity)
        args = SimpleNamespace(container=identity['id'], expected_id=identity['id'], expected_image=identity['image'],
            expected_commit=self.plan['commit'], expected_origin='http://' + web['name'] + ':3000',
            action=action, operation_id=operation, tick_id=None)
        folder = self.tx.folder / 'worker-operations'; folder.mkdir(mode=0o700, exist_ok=True)
        require(not folder.is_symlink() and not folder.stat().st_mode & 0o077, 'PRIVATE_WORKER_JOURNAL_REQUIRED')
        return worker_handoff.execute(args, folder, lambda argv: self.tx.run(argv).decode())

    def app_control(self, identity, action, operation):
        if self.media() and action == 'resume':
            self.media().mode('resume')
        result = controls.control_app(self.tx, identity, action, operation)
        if self.media() and action == 'drain':
            self.media().mode('drain')
        return result

    def rollback_media(self):
        return self.media().rollback() if self.media() else None

    def acceptance(self, state, descriptor, operation):
        report = load_json(relative_artifact(self.tx.folder, descriptor))
        require(report.get('kind') == 'naumi-candidate-acceptance-v1' and
                report.get('releaseId') == self.plan['releaseId'] and report.get('target') == self.plan['target'] and
                report.get('commit') == self.plan['commit'] and report.get('buildVersion') == self.plan['buildVersion'],
                'CURRENT_CANDIDATE_ACCEPTANCE_REPORT_REQUIRED')
        for web in self.plan['webs']:
            variant = web['variant']; verified = self.verify(web, state['webs'][variant]['running'], operation)
            require(verified['app']['admission']['mode'] == ('open' if state.get('app-open-' + variant) else 'draining'),
                    'ACCEPTANCE_ADMISSION_CHANGED')
            binding = report.get('bindings', {}).get(variant)
            require(binding == {'container': verified['identity'], 'appIdentity': verified['app']['identity'],
                                'assetPrefix': web['assetPrefix']}, 'ACCEPTANCE_CANDIDATE_BOOT_OR_VARIANT_CHANGED')
            checks = [item for item in report.get('checks', []) if item.get('variant') == variant]
            require(set(web['requiredChecks']) <= {item.get('name') for item in checks}, 'REQUIRED_FEATURE_ACCEPTANCE_MISSING')
            for item in checks:
                require(item.get('passed') is True and item.get('runner') in ['playwright', 'cua', 'http-integration'] and
                        item.get('startedAt') >= state['webs'][variant]['verified']['observedAt'], 'FEATURE_TEST_NOT_CURRENT')
                controls.fresh(item.get('startedAt'), maximum=900)
                response = load_json(relative_artifact(self.tx.folder, item['response']))
                require(response.get('containerId') == binding['container']['id'] and
                        response.get('bootId') == binding['appIdentity']['bootId'] and
                        response.get('status') == item.get('expectedStatus', 200) and response.get('status') in [200, 201, 204, 401, 403] and response.get('assertions') and
                        all(assertion.get('actual') == assertion.get('expected') for assertion in response['assertions']) and
                        response.get('request', {}).get('method') in ['GET', 'POST', 'PATCH'] and
                        isinstance(response.get('request', {}).get('url'), str) and
                        response['request']['url'].startswith('http://127.0.0.1:' + str(web['port']) + '/') and
                        response.get('responseBodySha256') and HASH.fullmatch(response['responseBodySha256']),
                        'REAL_RESPONSE_AND_ASSERTIONS_REQUIRED')
                check_path(item['name'], urllib.parse.urlsplit(response['request']['url']).path)
                body = relative_artifact(self.tx.folder, response['body']).read_bytes()
                require(body and sha(body) == response['responseBodySha256'], 'ACTUAL_RESPONSE_BODY_CHANGED')
                require(any(a.get('kind') in ['json', 'bodyContains', 'bodySha256'] for a in response['assertions']) and
                        all(assertion_value(a, body, response['status']) == a['expected'] for a in response['assertions']),
                        'FEATURE_BODY_ASSERTIONS_REQUIRED')
                if item['runner'] in ['playwright', 'cua']:
                    screenshot = relative_artifact(self.tx.folder, item['screenshot']).read_bytes()
                    require(screenshot.startswith(b'\x89PNG\r\n\x1a\n') and len(screenshot) > 128, 'REAL_BROWSER_SCREENSHOT_REQUIRED')
                if item['name'] in ['desktop-ui', 'enterprise-ui']:
                    require(item['runner'] in ['playwright', 'cua'], 'REAL_HYDRATED_UI_BROWSER_CHECK_REQUIRED')
                    dom = load_json(relative_artifact(self.tx.folder, item.get('dom')))
                    path = '/desktop' if item['name'] == 'desktop-ui' else '/enterprise'
                    url = urllib.parse.urlsplit(response['request']['url'])
                    require((url.path == path or url.path.startswith(path + '/')) and
                            dom.get('kind') == 'hydrated-role-snapshot-v1' and dom.get('containerId') == binding['container']['id'] and
                            dom.get('bootId') == binding['appIdentity']['bootId'] and dom.get('url') == response['request']['url'] and
                            dom.get('hydrated') is True and dom.get('errors') == [], 'HYDRATED_UI_DOM_IDENTITY_REQUIRED')
                    controls.fresh(dom.get('observedAt'), maximum=900)
                    required_roles = ['tablist', 'heading'] if item['name'] == 'desktop-ui' else ['button', 'heading']
                    assertions = item.get('roleAssertions', [])
                    require(set(required_roles) <= {a.get('role') for a in assertions} and
                            all(a.get('name') and any(element.get('role') == a['role'] and element.get('name') == a['name'] and
                                element.get('visible') is True for element in dom.get('elements', [])) for a in assertions),
                            'CONCRETE_VISIBLE_UI_ROLE_ASSERTIONS_REQUIRED')
        return {'reportSha256': descriptor['sha256'], 'checks': len(report['checks']), 'candidateBindingsVerified': True}

    def capture_acceptance(self, state, descriptor, operation):
        """Executable GET collector; browser reports can additionally bind real PNGs.

        This makes no supplier POST and does not claim generation/save coverage.
        JSON assertions are collected from actual HTTP bytes, never hand-written PASS.
        """
        spec = load_json(relative_artifact(self.tx.folder, descriptor))
        require(isinstance(spec.get('checks'), list) and 1 <= len(spec['checks']) <= 64, 'BOUNDED_HTTP_CHECKS_REQUIRED')
        report = {'kind': 'naumi-candidate-acceptance-v1', 'releaseId': self.plan['releaseId'], 'target': self.plan['target'],
                  'commit': self.plan['commit'], 'buildVersion': self.plan['buildVersion'], 'bindings': {}, 'checks': []}
        for web in self.plan['webs']:
            verified = self.verify(web, state['webs'][web['variant']]['running'], operation)
            report['bindings'][web['variant']] = {'container': verified['identity'], 'appIdentity': verified['app']['identity'],
                                                 'assetPrefix': web['assetPrefix']}
        for index, item in enumerate(spec['checks']):
            web = next((w for w in self.plan['webs'] if w['variant'] == item.get('variant')), None)
            require(web is not None and item.get('expectedStatus') in [200, 401, 403], 'TYPED_HTTP_GET_CHECK_REQUIRED')
            check_path(item['name'], item['path'])
            require(item['name'] not in ['desktop-ui', 'enterprise-ui'], 'UI_ACCEPTANCE_REQUIRES_EXTERNAL_BROWSER_DOM_CAPTURE')
            headers = {}
            if item.get('cookie'):
                cookie = relative_artifact(self.tx.folder, item['cookie']).read_text().strip()
                require('\r' not in cookie and '\n' not in cookie and len(cookie) <= 16384, 'PRIVATE_COOKIE_FILE_INVALID')
                headers['Cookie'] = cookie
            started = timestamp()
            connection = http.client.HTTPConnection('127.0.0.1', web['port'], timeout=15)
            try:
                connection.request('GET', item['path'], headers=headers)
                response = connection.getresponse(); body = response.read(2 * 1024 * 1024 + 1)
                require(0 < len(body) <= 2 * 1024 * 1024 and response.status == item['expectedStatus'], 'HTTP_FEATURE_RESPONSE_FAILED')
                assertions = [{'kind': 'status', 'actual': response.status, 'expected': item['expectedStatus']}]
                for assertion in item.get('jsonAssertions', []):
                    require(isinstance(assertion.get('path'), list) and assertion['path'], 'TYPED_JSON_ASSERTION_REQUIRED')
                    actual = json.loads(body)
                    for field in assertion['path']: actual = actual[field]
                    require(actual == assertion['expected'], 'HTTP_FEATURE_ASSERTION_FAILED')
                    assertions.append({'kind': 'json', 'path': assertion['path'], 'actual': actual, 'expected': assertion['expected']})
                if item.get('expectedBodySha256'):
                    require(HASH.fullmatch(item['expectedBodySha256']) and sha(body) == item['expectedBodySha256'], 'HTTP_FEATURE_BODY_HASH_FAILED')
                    assertions.append({'kind': 'bodySha256', 'actual': sha(body), 'expected': item['expectedBodySha256']})
                if item.get('bodyContains'):
                    require(isinstance(item['bodyContains'], str) and item['bodyContains'].encode() in body, 'HTTP_FEATURE_BODY_CONTENT_FAILED')
                    assertions.append({'kind': 'bodyContains', 'needle': item['bodyContains'], 'actual': True, 'expected': True})
                require(len(assertions) > 1, 'FEATURE_BODY_ASSERTIONS_REQUIRED')
            finally:
                connection.close()
            stem = operation + '-feature-' + str(index)
            def save(name, raw):
                saved = self.private_save(operation)(name, raw)
                return {'path': pathlib.Path(saved['path']).name, 'sha256': saved['sha256']}
            body_descriptor = save(stem + '.body', body)
            binding = report['bindings'][web['variant']]
            receipt = {'containerId': binding['container']['id'], 'bootId': binding['appIdentity']['bootId'],
                       'request': {'method': 'GET', 'url': 'http://127.0.0.1:' + str(web['port']) + item['path']},
                       'status': response.status, 'body': body_descriptor, 'responseBodySha256': sha(body), 'assertions': assertions,
                       'startedAt': started, 'completedAt': timestamp()}
            check = {'variant': web['variant'], 'name': item['name'], 'runner': 'http-integration', 'passed': True,
                     'startedAt': started, 'expectedStatus': item['expectedStatus'], 'response': save(stem + '.response.json', encoded(receipt))}
            if item.get('screenshot'):
                raw = relative_artifact(self.tx.folder, item['screenshot']).read_bytes()
                require(raw.startswith(b'\x89PNG\r\n\x1a\n') and len(raw) > 128, 'REAL_BROWSER_SCREENSHOT_REQUIRED')
                check.update(runner='cua', screenshot=item['screenshot'])
            report['checks'].append(check)
        saved = self.private_save(operation)('acceptance-report.json', encoded(report))
        return {'path': pathlib.Path(saved['path']).name, 'sha256': saved['sha256']}

    def restore_caller(self, operation):
        identity = self.plan['legacyCaller']['identity']
        intent = self.tx.folder / ('legacy-caller-restore-intent-' + identity['id'][:12] + '.json')
        row = self.tx.pin(identity)
        if intent.exists():
            require(load_json(intent).get('identity') == identity, 'ORIGINAL_CALLER_RESTORE_INTENT_CHANGED')
            if row['State'].get('Paused') is False:
                return {'restored': True, 'reconciled': True}
            require(row['State'].get('Paused') is True, 'CALLER_RESTORE_UNKNOWN')
            self.tx.run(['docker', 'unpause', identity['id']])
            require(self.tx.inspect(identity['id'])['State'].get('Paused') is False, 'CALLER_RESTORE_UNKNOWN')
            return {'restored': True, 'reconciled': True}
        return maintenance.restore_frozen_caller(self.tx, self.plan['legacyCaller']['identity'], candidate_worker_quiescent=True)

    def assert_activation(self, state, operation):
        if self.media():
            require(self.media().health()['draining'] is False, 'ACTIVE_MEDIA_NOT_RESUMED')
        report = load_json(relative_artifact(self.tx.folder, self.plan['gateways']['open']['report']))
        require(sha(self.tx.run(['nginx', '-T'])) == report['afterDumpSha256'], 'ACTIVE_GATEWAY_CLOSURE_CHANGED')
        for web in self.plan['webs']:
            slot = state['webs'][web['variant']]
            status = controls.app_status(self.tx, slot['running'])
            require(status['identity'] == slot['verified']['app']['identity'] and status['admission']['mode'] == 'open',
                    'ACTIVE_APP_BOOT_OR_ADMISSION_CHANGED')
        return {'gatewayAndAppIdentitiesVerified': True}

    def retire(self, identity, descriptor, operation):
        receipt = load_json(relative_artifact(self.tx.folder, descriptor))
        return self.tx.retire(identity, receipt)

    def runtime_policy(self, state, operation, *, enabled):
        from release_runtime_recovery import set_runtime_policy, update_identities
        def preflight(identities):
            # Observe original-journal identities before strict pins. A Docker
            # update may already have succeeded while the session kept old no.
            update_identities(state, {'identities': identities})
            self.assert_activation(state, operation)
            worker = self.worker_control(state['worker']['running'], state['webs'][self.plan['webs'][0]['variant']]['running'],
                                         'status', operation)['state']
            require(worker.get('paused') is False and worker.get('phase') != 'UNKNOWN' and
                    worker.get('unresolvedTicks') == 0, 'FINALIZE_WORKER_STATE_UNKNOWN')
        result = set_runtime_policy(self.tx, self.plan, state, operation, enabled=enabled,
                                    before_update=preflight if enabled else None)
        update_identities(state, result)
        return result

    def verify_runtime_policy(self, state):
        from release_runtime_recovery import verify_runtime_policy
        return verify_runtime_policy(self.tx, self.plan, state)


class MaintenanceSession:
    def __init__(self, tx, plan, *, adapter=None, state_root=ROOT, now=None):
        self.tx, self.plan = tx, valid_plan(copy.deepcopy(plan))
        require(tx.stack is not None, 'WHOLE_TRANSACTION_LOCK_REQUIRED')
        maintenance.authorize(self.plan['authorization'], now=now)
        self.root = pathlib.Path(state_root)
        require(self.root.is_absolute() and not self.root.is_symlink(), 'PRIVATE_CANONICAL_STATE_REQUIRED')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if os.name == 'posix':
            require(not self.root.stat().st_mode & 0o077, 'PRIVATE_CANONICAL_STATE_MODE_REQUIRED')
        self.path = self.root / 'current.json'
        self.disk_sha = sha(self.path.read_bytes()) if self.path.exists() else None
        self.plan_hash = sha(encoded(self.plan))
        self.adapter = adapter or LiveAdapter(tx, self.plan)
        if self.path.exists():
            self.state = load_json(self.path)
            require(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', self.state.get('releaseId', '')),
                    'CORRUPT_CANONICAL_RELEASE_ID')
            require(self.state.get('target') == self.plan['target'], 'CANONICAL_TARGET_MISMATCH')
            if self.state.get('releaseId') != self.plan['releaseId']:
                superseded = None
                if self.state.get('phase', self.state.get('status')) not in TERMINAL | {'ABORTED'}:
                    require(self.plan.get('supersedesUnpublished') is not None, 'UNFINISHED_RELEASE_BLOCKS_NEXT')
                    superseded = supersede_unpublished_baseline(self.root, self.state, self.path.read_bytes(), self.plan)
                else:
                    controls._atomic_private(self.root / (self.state['releaseId'] + '.json'), self.state)
                self.state = self.new_state()
                if superseded:
                    self.state['supersededUnpublished'] = superseded
            else:
                require(self.state.get('planSha256') == self.plan_hash and isinstance(self.state.get('operations'), dict), 'ACTIVE_PLAN_CHANGED')
        else:
            self.state = self.new_state()
        if self.plan['target'] == '103.30.76.93' and not maintenance.independent_hk(self.plan['authorization']):
            receipt = load_json(relative_artifact(self.tx.folder, self.plan['predecessor47']))
            require(receipt.get('target') == '47.105.59.142' and
                    receipt.get('phase') in ['COMPLETE', 'MIGRATED_CLEANUP_PENDING'] and
                    receipt.get('preservation', {}).get('taskDataPreserved') is True and
                    receipt.get('activation', {}).get('workerResumed') is True,
                    '47_MUST_BE_MIGRATED_BEFORE_103')
        self.persist()

    def new_state(self):
        return {'schemaVersion': 1, 'releaseId': self.plan['releaseId'], 'target': self.plan['target'],
            'planSha256': self.plan_hash, 'phase': 'NEW', 'revision': 0, 'operations': {}, 'webs': {},
            'startedAt': timestamp(), 'legacyDrainProven': False, 'legacyActiveTicks': None,
            'acceptedTasks': None, 'agentSessions': None, 'databaseRestored': False, 'tasksReplayed': False,
            'retired': [], 'history': []}

    def persist(self):
        require((sha(self.path.read_bytes()) if self.path.exists() else None) == self.disk_sha, 'CANONICAL_STATE_CAS_CHANGED')
        self.state['status'] = {'NEW': 'PREPARED', 'BASELINED': 'PREPARED', 'BACKED_UP': 'PREPARED',
            'MAINTENANCE': 'DRAINING', 'FROZEN': 'DRAINING', 'CANDIDATES': 'DRAINING', 'ACCEPTED': 'READY',
            'PRESERVED': 'READY', 'ACTIVE': 'DRAINING', 'MIGRATED_CLEANUP_PENDING': 'CLEANUP_PENDING',
            'COMPLETE': 'COMPLETE', 'ROLLED_BACK': 'ROLLED_BACK'}[self.state['phase']]
        if any(item['phase'] != 'ACKNOWLEDGED' for item in self.state['operations'].values()):
            self.state['status'] = 'UNKNOWN'
        controls._atomic_private(self.path, self.state)
        require(load_json(self.path) == self.state, 'CANONICAL_STATE_REOPEN_FAILED')
        self.disk_sha = sha(self.path.read_bytes())

    def public(self):
        return {key: self.state.get(key) for key in ['releaseId', 'target', 'phase', 'revision', 'legacyDrainProven',
            'legacyActiveTicks', 'acceptedTasks', 'agentSessions', 'databaseRestored', 'tasksReplayed', 'lastError', 'collectedAcceptance']}

    def step(self, request):
        maintenance.authorize(self.plan['authorization'])
        require(isinstance(request, dict) and set(request) <= {'action', 'operationId', 'expectedRevision', 'variant', 'reconcile', 'artifact'} and
                UUID.fullmatch(request.get('operationId', '')) and type(request.get('expectedRevision')) is int,
                'TYPED_STEP_UUID_AND_REVISION_REQUIRED')
        action, operation = request['action'], request['operationId']
        clean = {key: value for key, value in request.items() if key != 'reconcile'}
        binding = sha(encoded(clean)); old = self.state['operations'].get(operation)
        if old:
            require(old['requestSha256'] == binding, 'OPERATION_UUID_BINDING_CONFLICT')
            if old['phase'] == 'ACKNOWLEDGED':
                return {'result': 'ALREADY_ACKNOWLEDGED', 'operationId': operation, **self.public()}
            require(request.get('reconcile') is True and old['phase'] in ['INTENT_RECORDED', 'UNKNOWN'],
                    'EXPLICIT_ORIGINAL_UUID_RECONCILIATION_REQUIRED')
        else:
            require(request.get('reconcile') is not True and request['expectedRevision'] == self.state['revision'], 'REVISION_CONFLICT')
            require(not any(r['phase'] != 'ACKNOWLEDGED' for r in self.state['operations'].values()), 'UNKNOWN_OPERATION_BLOCKS_NEXT')
            require(self.state['phase'] not in TERMINAL, 'SESSION_ALREADY_TERMINAL')
            self.validate_action(action, request)
            self.state['operations'][operation] = {'requestSha256': binding, 'request': clean, 'phase': 'INTENT_RECORDED', 'recordedAt': timestamp()}
            self.state['revision'] += 1
            self.persist()  # Before the first possible host mutation.
        try:
            result = self.dispatch(action, request, operation, bool(old))
            self.state['operations'][operation].update(phase='ACKNOWLEDGED', resultSha256=sha(encoded(result)))
            self.state['history'].append({'action': action, 'operationId': operation, 'result': 'ACKNOWLEDGED', 'at': timestamp()})
            self.state.pop('lastError', None)
            self.state['revision'] += 1; self.persist()
            return {'result': 'ACKNOWLEDGED', 'operationId': operation, **self.public()}
        except BaseException as error:
            self.state['operations'][operation]['phase'] = 'UNKNOWN'
            self.state['history'].append({'action': action, 'operationId': operation, 'result': 'UNKNOWN', 'at': timestamp()})
            self.state['lastError'] = str(error) if isinstance(error, Hold) and re.fullmatch('[A-Z0-9_]+', str(error)) else 'STEP_RESULT_UNKNOWN'
            self.state['revision'] += 1; self.persist()
            raise Hold(self.state['lastError']) from None

    def validate_action(self, action, request):
        phase = self.state['phase']
        allowed = {'baseline': ['NEW'], 'backup': ['BASELINED'], 'maintenance': ['BACKED_UP'], 'freeze': ['MAINTENANCE'],
            'web-create': ['FROZEN', 'CANDIDATES'], 'web-start': ['CANDIDATES'], 'web-verify': ['CANDIDATES'],
            'worker-create': ['CANDIDATES'], 'worker-start': ['CANDIDATES'], 'capture-acceptance': ['CANDIDATES'], 'acceptance': ['CANDIDATES'],
            'preservation': ['ACCEPTED'], 'activate': ['PRESERVED'], 'finish': ['ACTIVE', 'MIGRATED_CLEANUP_PENDING'],
            'retire': ['ACTIVE', 'MIGRATED_CLEANUP_PENDING'], 'runtime-finalize': ['ACTIVE'], 'rollback': PHASES[3:-2]}
        require(action in allowed and phase in allowed[action], 'INVALID_MAINTENANCE_PHASE')
        if action == 'runtime-finalize':
            require(maintenance.canvas_video_hk(self.plan['authorization']), 'VIDEO_GOAL_RUNTIME_FINALIZE_ONLY')
        if action.startswith('web-'):
            name = request.get('variant'); names = [w['variant'] for w in self.plan['webs']]
            require(name in names, 'KNOWN_VARIANT_REQUIRED')
            current = self.state['webs'].get(name, {})
            if action == 'web-create':
                require(not current and all('verified' in self.state['webs'].get(v, {}) for v in names[:names.index(name)]),
                        'SEQUENTIAL_VARIANT_CREATE_REQUIRED')
            else:
                require(('created' if action == 'web-start' else 'running') in current and
                        ('running' if action == 'web-start' else 'verified') not in current, 'WEB_STEP_ORDER_REQUIRED')
        if action in ['worker-create', 'worker-start', 'capture-acceptance', 'acceptance']:
            require(all('verified' in self.state['webs'].get(w['variant'], {}) for w in self.plan['webs']), 'ALL_COMPILED_VARIANTS_REQUIRED')
            require((action != 'worker-create' or 'worker' not in self.state) and
                    (action != 'worker-start' or 'created' in self.state.get('worker', {}) and 'running' not in self.state['worker']) and
                    (action not in ['acceptance', 'capture-acceptance'] or 'running' in self.state.get('worker', {})), 'WORKER_STEP_ORDER_REQUIRED')

    def op(self, operation, name):
        return str(uuid.uuid5(uuid.UUID(operation), name))

    def main_web(self):
        return self.state['webs']['main']['running']

    def worker_state(self, action, operation):
        return self.adapter.worker_control(self.state['worker']['running'], self.main_web(), action, operation)['state']

    def quiescent_worker(self, operation):
        state = self.worker_state('status', operation)
        require(state.get('paused') is True and state.get('phase') == 'QUIESCENT' and
                state.get('activeTicks') == 0 and state.get('unresolvedTicks') == 0, 'NEW_WORKER_NOT_QUIESCENT')
        return state

    def dispatch(self, action, request, operation, reconcile):
        state, adapter = self.state, self.adapter
        if action == 'baseline':
            require(not reconcile, 'UNKNOWN_BASELINE_REQUIRES_ORIGINAL_PRIVATE_SNAPSHOT_REVIEW')
            state['baselineInventory'] = adapter.inventory(operation)
            state['before'] = adapter.snapshot(operation)
            state['phase'] = 'BASELINED'; return state['before']['public']
        if action == 'backup':
            state['backup'] = adapter.backup(operation, reconcile); state['phase'] = 'BACKED_UP'; return state['backup']
        if action == 'maintenance':
            maintenance.authorize(self.plan['authorization'])
            state['capacityPreflight'] = adapter.preflight(operation)
            self.persist()
            state['maintenance'] = adapter.gateway('maintenance', operation, reconcile)
            state['phase'] = 'MAINTENANCE'; return state['maintenance']
        if action == 'freeze':
            state['freeze'] = adapter.freeze(operation, reconcile); state['phase'] = 'FROZEN'; return state['freeze']
        if action.startswith('web-'):
            web = next(w for w in self.plan['webs'] if w['variant'] == request['variant'])
            slot = state['webs'].setdefault(web['variant'], {})
            if action == 'web-create': slot['created'] = adapter.web_create(web, operation, reconcile)
            if action == 'web-start': slot['running'] = adapter.web_start(web, slot['created'], operation, reconcile)
            if action == 'web-verify':
                slot['verified'] = adapter.verify(web, slot['running'], operation)
                require(slot['verified']['app']['admission']['mode'] == 'draining', 'CANDIDATE_MUST_STAY_DRAINING')
            state['phase'] = 'CANDIDATES'; return slot
        if action == 'worker-create':
            state['worker'] = {'created': adapter.worker_create(self.main_web(), operation, reconcile)}; return state['worker']
        if action == 'worker-start':
            if reconcile and state['worker'].get('running'):
                adapter.observed_started_identity(state['worker']['running'])
            else:
                state['worker']['running'] = adapter.worker_start(state['worker']['created'], operation, reconcile)
            state['worker']['initial'] = self.quiescent_worker(operation); return state['worker']['initial']
        if action == 'capture-acceptance':
            self.quiescent_worker(operation)
            state['collectedAcceptance'] = adapter.capture_acceptance(state, request.get('artifact', self.plan.get('acceptanceSpec')), operation)
            return state['collectedAcceptance']
        if action == 'acceptance':
            self.quiescent_worker(operation)
            descriptor = request.get('artifact', state.get('collectedAcceptance', self.plan.get('acceptance')))
            state['acceptance'] = adapter.acceptance(state, descriptor, operation)
            state['acceptedDescriptor'] = descriptor
            state['phase'] = 'ACCEPTED'; return state['acceptance']
        if action == 'preservation':
            state['after'] = adapter.snapshot(operation, state['before']['private'])
            comparison = tasks.compare_task_snapshots(state['before']['private'], state['after']['private'])
            state['preservation'] = maintenance.validate_preservation(state['before']['public'], state['after']['public'], comparison)
            state['comparison'] = comparison; state['phase'] = 'PRESERVED'; return state['preservation']
        if action == 'activate':
            adapter.legacy_safety(frozen=True, retired=state['retired'])
            # Revalidate unchanged candidate boot, artifacts and functional receipts.
            if not state.get('activationAcceptance'):
                self.quiescent_worker(operation)
                state['activationAcceptance'] = adapter.acceptance(state, state['acceptedDescriptor'], operation)
                self.persist()
            for web in self.plan['webs']:
                adapter.legacy_safety(frozen=True, retired=state['retired'])
                variant = web['variant']; name = 'app-open-' + variant
                if not state.get(name):
                    state[name] = adapter.app_control(state['webs'][variant]['running'], 'resume', self.op(operation, name))
                    self.persist()
            if not state.get('openGateway'):
                adapter.legacy_safety(frozen=True, retired=state['retired'])
                state['openGateway'] = adapter.gateway('open', self.op(operation, 'open-gateway'), reconcile)
                self.persist()
            adapter.assert_activation(state, operation)
            adapter.legacy_safety(frozen=True, retired=state['retired'])
            resumed = self.worker_state('resume', self.op(operation, 'worker-resume'))
            require(resumed.get('paused') is False and resumed.get('phase') != 'UNKNOWN' and resumed.get('unresolvedTicks') == 0,
                    'NEW_WORKER_RESUME_UNKNOWN')
            state['activation'] = {'workerResumed': True, 'gateway': state['openGateway'], 'at': timestamp()}
            state['phase'] = 'ACTIVE'; return state['activation']
        if action == 'retire':
            require(not reconcile, 'UNKNOWN_RETIREMENT_REQUIRES_PRIVATE_PROCESS_REVIEW')
            identifier = request.get('variant')
            require(identifier in self.plan.get('retirements', {}), 'EXPLICIT_BOUND_RETIREMENT_REQUIRED')
            item = self.plan['retirements'][identifier]
            result = adapter.retire(item['identity'], item['receipt'], operation)
            if item['identity']['id'] not in state['retired']: state['retired'].append(item['identity']['id'])
            return result
        if action == 'runtime-finalize':
            state['runtimeRecovery'] = adapter.runtime_policy(state, operation, enabled=True)
            adapter.assert_activation(state, operation)
            return state['runtimeRecovery']
        if action == 'finish':
            if maintenance.canvas_video_hk(self.plan['authorization']):
                require(state.get('runtimeRecovery', {}).get('enabled') is True, 'RUNTIME_FINALIZATION_REQUIRED')
                state['runtimeRecoveryVerified'] = adapter.verify_runtime_policy(state)
            adapter.legacy_safety(frozen=True, retired=state['retired'])
            adapter.assert_activation(state, operation)
            current_worker = self.worker_state('status', operation)
            require(current_worker.get('paused') is False and current_worker.get('phase') != 'UNKNOWN' and
                    current_worker.get('unresolvedTicks') == 0, 'FINAL_WORKER_STATE_UNKNOWN')
            required = {identity['id'] for identity in self.plan['baseline']}
            state['phase'] = 'COMPLETE' if required <= set(state['retired']) else 'MIGRATED_CLEANUP_PENDING'
            return {'phase': state['phase'], 'legacyDrainProven': False, 'unretired': len(required - set(state['retired']))}
        if action == 'rollback':
            if maintenance.canvas_video_hk(self.plan['authorization']) and not state.get('rollbackRuntimeDisarmed') and (
                    state.get('runtimeRecovery') or any(slot.get('running') for slot in state['webs'].values())):
                state['rollbackRuntimeDisarmed'] = adapter.runtime_policy(state, self.op(operation, 'runtime-disarm'), enabled=False)
                self.persist()
            if state.get('worker', {}).get('running') and not state.get('rollbackWorkerPaused'):
                self.worker_state('drain', self.op(operation, 'worker-drain'))
                self.quiescent_worker(operation)
                state['rollbackWorkerPaused'] = True; self.persist()
            if state.get('worker', {}).get('running'): self.quiescent_worker(operation)
            rollback_legacy = {'frozen': bool(state.get('freeze')), 'retired': state['retired'],
                'restored': bool(state.get('rollbackCaller')), 'restore_reconcile': reconcile and bool(state.get('rollbackGateway'))}
            adapter.legacy_safety(**rollback_legacy)
            for variant, web in state['webs'].items():
                if web.get('running') and not state.get('rollback-app-' + variant):
                    state['rollback-app-' + variant] = adapter.app_control(web['running'], 'drain', self.op(operation, 'app-drain-' + variant))
                    self.persist()
            if maintenance.canvas_video_hk(self.plan['authorization']):
                require(not state.get('openGateway'), 'POST_ACTIVATION_ACCEPTED_WORK_AUDIT_REQUIRED')
            kind = 'rollback-open' if state.get('openGateway') else 'rollback-maintenance'
            if not state.get('rollbackGateway'):
                adapter.legacy_safety(**rollback_legacy)
                state['rollbackGateway'] = adapter.gateway(kind, self.op(operation, 'rollback-gateway'), reconcile)
                self.persist()
            if state.get('freeze') and not state.get('rollbackCaller'):
                adapter.legacy_safety(**rollback_legacy)
                state['rollbackCaller'] = adapter.restore_caller(self.op(operation, 'restore-caller'))
                self.persist()
            if self.plan.get('mediaWorker'):
                state['rollbackMedia'] = adapter.rollback_media()
                self.persist()
            adapter.legacy_safety(frozen=bool(state.get('freeze')), retired=state['retired'], restored=bool(state.get('rollbackCaller')))
            after = adapter.snapshot(operation, state['before']['private'])
            comparison = tasks.compare_task_snapshots(state['before']['private'], after['private'])
            state['rollbackPreservation'] = maintenance.validate_preservation(state['before']['public'], after['public'], comparison)
            state['phase'] = 'ROLLED_BACK'; return {'phase': 'ROLLED_BACK', 'databaseRestored': False, 'tasksReplayed': False}
        raise Hold('UNKNOWN_STEP_ACTION')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=pathlib.Path)
    parser.add_argument('--steps', type=pathlib.Path, help='JSON array; otherwise stdin NDJSON, one response per line')
    args = parser.parse_args(argv)
    try:
        plan = valid_plan(load_json(args.manifest))
        maintenance.authorize(plan['authorization'])
        with HostTransaction(plan['target'], plan['hostIdentitySha256'], args.manifest.parent) as tx:
            session = MaintenanceSession(tx, plan)
            steps = load_json(args.steps) if args.steps else None
            require(steps is None or isinstance(steps, list) and len(steps) <= 128, 'BOUNDED_STEPS_ARRAY_REQUIRED')
            if steps is not None:
                for step in steps: print(json.dumps(session.step(step), ensure_ascii=False), flush=True)
            else:
                for line in sys.stdin:
                    require(len(line) <= 65536, 'STEP_LINE_TOO_LARGE')
                    request = json.loads(line)
                    if request == {'action': 'status'}:
                        print(json.dumps(session.public(), ensure_ascii=False), flush=True); continue
                    try:
                        print(json.dumps(session.step(request), ensure_ascii=False), flush=True)
                    except Hold as error:
                        print(json.dumps({'error': str(error), **session.public()}, ensure_ascii=False), flush=True)
            return 0
    except (Hold, OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'error': 'MAINTENANCE_SESSION_HELD', 'databaseRestored': False, 'tasksReplayed': False}), flush=True)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
