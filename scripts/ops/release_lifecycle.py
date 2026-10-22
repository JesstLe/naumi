#!/usr/bin/env python3
"""Fail-closed release acceptance and durable lifecycle; never controls workloads.

Host collectors/publishers supply a fresh, release-bound snapshot. This policy
engine validates it; it does not pretend that supplied evidence is a live probe.
All file updates use CAS + atomic replace under a local filesystem lock.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse

TERMINAL = {'COMPLETE', 'ROLLED_BACK', 'ABORTED'}
STAGES = {'ready': ('PREPARED', 'READY'), 'switched': ('READY', 'DRAINING'),
          'finish': ('DRAINING', 'COMPLETE'), 'rollback': (None, 'ROLLED_BACK'),
          'abort': ('PREPARED', 'ABORTED')}
ROUTES = {'main', 'login', 'canvas', 'reference-workbench', 'router-capacity'}
EXECUTION_PATHS = {'generate-image', 'imagegen-submit', 'imagegen-query', 'worker-image-recovery'}
DRAIN_FIELDS = ('connections', 'agentSessions', 'acceptedTasks', 'workerLeases', 'newAdmissions')
SHA = re.compile(r'^[0-9a-f]{40}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')


class Blocked(Exception):
    pass


def require(test, code):
    if not test:
        raise Blocked(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def timestamp(value):
    try:
        t = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(t.tzinfo is not None, 'TIMEZONE_REQUIRED')
        return t.timestamp()
    except (ValueError, TypeError, AttributeError):
        raise Blocked('INVALID_TIMESTAMP') from None


def integer(value):
    return type(value) is int and value >= 0


def freshness(value, now, minimum=None):
    at = timestamp(value)
    require(-5 <= now - at <= 120, 'STALE_OR_FUTURE_OBSERVATION')
    if minimum is not None:
        require(at >= minimum, 'EVIDENCE_PREDATES_TRANSITION')


def valid_plan(p):
    require(isinstance(p, dict), 'PLAN_OBJECT_REQUIRED')
    require(p.get('schemaVersion') == 1, 'UNKNOWN_SCHEMA')
    require(p.get('evidenceMode') in ['fixture', 'live'], 'EVIDENCE_MODE_REQUIRED')
    if p['evidenceMode'] == 'live':
        require(p.get('target') == '47.105.59.142', 'LIVE_HOST_ADAPTER_NOT_IMPLEMENTED')
    require(isinstance(p.get('releaseId'), str) and
            re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', p['releaseId']), 'INVALID_RELEASE_ID')
    require(isinstance(p.get('target'), str) and p['target'], 'TARGET_REQUIRED')
    require(re.fullmatch(r'[0-9a-f]{64}', p.get('hostIdentitySha256', '')), 'HOST_IDENTITY_REQUIRED')
    require(SHA.fullmatch(p.get('commit', '')), 'FIXED_COMMIT_REQUIRED')
    require(DIGEST.fullmatch(p.get('image', '')), 'FIXED_IMAGE_REQUIRED')
    require(isinstance(p.get('baseline'), list) and p['baseline'], 'BASELINE_REQUIRED')
    ids = [row['id'] for row in p['baseline']]
    require(len(ids) == len(set(ids)), 'DUPLICATE_BASELINE')
    require(all(DIGEST.fullmatch(row.get('image', '')) for row in p['baseline']), 'BASELINE_IMAGE_REQUIRED')
    require(all(row.get('role') in ['web', 'worker', 'infra'] for row in p['baseline']), 'UNKNOWN_BASELINE_ROLE')
    require(p.get('web') and p['web'] not in ids, 'NEW_WEB_ID_REQUIRED')
    require(p.get('worker') and p['worker'] != p['web'], 'WORKER_ID_REQUIRED')
    protected = {row['id'] for row in p['baseline'] if row['role'] == 'infra'}
    retired = p.get('retire', [])
    require(len(retired) == len(set(retired)) and set(retired).issubset(set(ids) - protected), 'INVALID_RETIRE_SET')
    for row in p['baseline']:
        if row['role'] != 'infra' and row['id'] not in [p['web'], p['worker']]:
            require(row['id'] in retired, 'UNACCOUNTED_LEGACY_INSTANCE')
    require(isinstance(p.get('baselineRoutes'), dict) and
            set(p['baselineRoutes']) == ROUTES and
            set(p['baselineRoutes'].values()).issubset(set(ids)), 'COMPLETE_BASELINE_ROUTES_REQUIRED')
    require(isinstance(p.get('baselineExecutionTargets'), dict) and
            set(p['baselineExecutionTargets']) == EXECUTION_PATHS and
            set(p['baselineExecutionTargets'].values()).issubset(set(ids)), 'EXECUTION_GRAPH_REQUIRED')
    budget = p.get('budget', {})
    require(all(integer(budget.get(k)) and budget[k] > 0
                for k in ['candidatePeakMiB', 'reservedMiB', 'minimumAvailableMiB']), 'MEMORY_BUDGET_REQUIRED')
    require(budget['reservedMiB'] >= 1024 and budget['minimumAvailableMiB'] >= 1024, 'HOST_RESERVE_TOO_SMALL')
    require(isinstance(p.get('affectedFeatures'), list) and p['affectedFeatures'] and
            'all-live-routes' in p['affectedFeatures'], 'FULL_APPLICATION_ACCEPTANCE_REQUIRED')
    require(all(re.fullmatch(r'[a-f0-9]{64}', p.get('routingConfigSha256', {}).get(k, ''))
                for k in ['baseline', 'unified']), 'REVIEWED_GATEWAY_HASHES_REQUIRED')


def evidence(p, s, kind, now, minimum=None):
    e = s.get('evidence', {}).get(kind, {})
    require(e.get('ok') is True and e.get('releaseId') == p['releaseId'] and
            e.get('planSha256') == digest(p) and e.get('target') == p['target'] and
            e.get('snapshotSha256') == digest({k: v for k, v in s.items() if k != 'evidence'}),
            'MISSING_OR_UNBOUND_EVIDENCE:' + kind)
    require(isinstance(e.get('artifact'), str) and e['artifact'], 'EVIDENCE_ARTIFACT_REQUIRED:' + kind)
    freshness(e.get('observedAt'), now, minimum)


def inspect_snapshot(p, s, now):
    valid_plan(p)
    require(isinstance(s, dict), 'SNAPSHOT_OBJECT_REQUIRED')
    require(s.get('target') == p['target'], 'TARGET_MISMATCH')
    require(s.get('evidenceMode') == p['evidenceMode'], 'EVIDENCE_MODE_MISMATCH')
    freshness(s.get('observedAt'), now)
    require(s.get('releaseId') == p['releaseId'], 'RELEASE_MISMATCH')
    require(s.get('planSha256') == digest(p), 'PLAN_CHANGED')
    slots = s.get('containers', [])
    require(isinstance(slots, list), 'CONTAINER_INVENTORY_REQUIRED')
    require(all(isinstance(row, dict) and isinstance(row.get('id'), str) for row in slots), 'INVALID_CONTAINER')
    current = {row['id']: row for row in slots}
    require(len(current) == len(slots), 'DUPLICATE_CONTAINER')
    known = {row['id'] for row in p['baseline']} | {p['web'], p['worker']}
    require(set(current).issubset(known), 'UNREGISTERED_INSTANCE')
    for row in p['baseline']:
        got = current.get(row['id'])
        require(got is not None and got.get('image') == row['image'], 'BASELINE_IDENTITY_CHANGED')
        if row['role'] == 'infra':
            require(got == row, 'PROTECTED_INFRA_CHANGED')
        require(got.get('role') == row['role'], 'ROLE_CHANGED')
    require(all(type(row.get('running')) is bool for row in slots), 'RUNNING_STATE_UNKNOWN')
    require(all(row.get('role') in ['web', 'worker', 'infra'] for row in slots), 'UNKNOWN_CONTAINER_ROLE')
    candidates = [r for r in slots if r['id'] not in {b['id'] for b in p['baseline']} and r['running']]
    require(sum(r.get('role') == 'web' for r in candidates) <= 1, 'TOO_MANY_CANDIDATE_WEB')
    require(s.get('locksHeld') == ['naumi', 'hub', 'reference-workbench'], 'THREE_LOCKS_REQUIRED')
    return current


def check(p, s, stage, now, switched_at=None):
    current = inspect_snapshot(p, s, now)
    budget = p['budget']
    available = s.get('memory', {}).get('availableMiB')
    require(integer(available), 'MEM_AVAILABLE_UNKNOWN')
    minimum = budget['minimumAvailableMiB']
    if stage in ['preflight', 'ready']:
        if not current.get(p['web'], {}).get('running'):
            minimum = max(minimum, budget['candidatePeakMiB'] + budget['reservedMiB'])
        else:
            minimum = max(minimum, budget['reservedMiB'])
    require(available >= minimum, 'INSUFFICIENT_HOST_MEMORY')
    # Swap capacity is intentionally never added to MemAvailable.
    if stage in ['preflight', 'ready', 'abort']:
        require(s.get('routingConfigSha256') == p['routingConfigSha256']['baseline'], 'BASELINE_GATEWAY_HASH_CHANGED')
        require(s.get('routes') == p['baselineRoutes'], 'BASELINE_ROUTING_CHANGED')
        require(s.get('executionTargets') == p['baselineExecutionTargets'], 'BASELINE_EXECUTION_CHANGED')
        for row in p['baseline']:
            require(current[row['id']] == row, 'BASELINE_RUNTIME_CHANGED')
    if stage == 'preflight':
        evidence(p, s, 'baseline', now)
        return
    if stage == 'abort':
        require(all(not current.get(i, {}).get('running', False) and
                    current.get(i, {}).get('restartPolicy', 'no') == 'no'
                    for i in [p['web'], p['worker']] if i not in {b['id'] for b in p['baseline']}),
                'CANDIDATE_STILL_RUNNING')
        evidence(p, s, 'abort', now)
        return
    if stage == 'rollback':
        require(s.get('routingConfigSha256') == p['routingConfigSha256']['baseline'], 'ROLLBACK_GATEWAY_HASH_NOT_RESTORED')
        require(s.get('routes') == p['baselineRoutes'], 'ROLLBACK_ROUTING_NOT_RESTORED')
        require(s.get('executionTargets') == p['baselineExecutionTargets'], 'ROLLBACK_EXECUTION_NOT_RESTORED')
        for row in p['baseline']:
            got = current[row['id']]
            # Restarted old application processes naturally have a new start
            # time. Infra remains exact; application identity/version/policy do not change.
            fields = set(row) - ({'startedAt'} if row['role'] != 'infra' else set())
            require(all(got.get(k) == row[k] for k in fields), 'ROLLBACK_BASELINE_NOT_RESTORED')
        require(all(not current.get(i, {}).get('running', False) and
                    current.get(i, {}).get('restartPolicy', 'no') == 'no'
                    for i in [p['web'], p['worker']] if i not in {b['id'] for b in p['baseline']}),
                'ROLLBACK_CANDIDATE_NOT_DRAINED')
        evidence(p, s, 'rollback', now)
        return
    web = current.get(p['web'], {})
    require(web.get('running') is True and web.get('role') == 'web' and
            web.get('image') == p['image'] and web.get('commit') == p['commit'], 'CANDIDATE_VERSION_MISMATCH')
    for kind in ['readiness', 'old-client-compatibility', 'backup-and-rollback', 'worker-handoff']:
        evidence(p, s, kind, now)
    if stage == 'ready':
        return
    require(s.get('routes') == {key: p['web'] for key in ROUTES}, 'SPLIT_APPLICATION_ROUTING')
    require(s.get('routingConfigSha256') == p['routingConfigSha256']['unified'], 'UNIFIED_GATEWAY_HASH_MISMATCH')
    require(s.get('executionTargets') == {key: p['web'] for key in EXECUTION_PATHS}, 'SPLIT_EXECUTION_PATHS')
    evidence(p, s, 'continuity', now, switched_at)
    if stage == 'switched':
        return
    worker = current.get(p['worker'], {})
    require(worker.get('running') is True and worker.get('role') == 'worker' and
            worker.get('image') == p['image'] and worker.get('commit') == p['commit'], 'WORKER_VERSION_MISMATCH')
    require(web.get('restartPolicy') == 'unless-stopped' and worker.get('restartPolicy') == 'unless-stopped',
            'ACTIVE_ROLE_RESTART_POLICY_REQUIRED')
    require({r['id'] for r in current.values() if r['running'] and r['role'] == 'web'} == {p['web']},
            'OLD_WEB_STILL_RUNNING')
    require({r['id'] for r in current.values() if r['running'] and r['role'] == 'worker'} == {p['worker']},
            'OLD_WORKER_STILL_RUNNING')
    for old in p['retire']:
        row = current[old]
        require(row['running'] is False and row.get('restartPolicy') == 'no', 'OLD_SLOT_NOT_RETIRED')
        drain = s.get('drain', {}).get(old, {})
        require(all(type(drain.get(k)) is int and drain[k] == 0 for k in DRAIN_FIELDS), 'DRAIN_UNKNOWN_OR_ACTIVE')
        freshness(drain.get('observedAt'), now, switched_at)
    retained = s.get('retainedReleases', [])
    require(len(retained) >= 2 and len({r.get('image') for r in retained} - {p['image']}) >= 2 and
            all(DIGEST.fullmatch(r.get('image', '')) and r.get('materialsReadable') is True for r in retained),
            'TWO_ROLLBACK_RELEASES_REQUIRED')
    evidence(p, s, 'retirement', now, switched_at)


@contextlib.contextmanager
def file_lock(folder):
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / '.lifecycle.lock'
    with path.open('a+b') as f:
        if os.name == 'nt':
            import msvcrt
            f.seek(0)
            if not f.read(1):
                f.write(b'0'); f.flush()
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)


def atomic(path, value):
    fd, tmp = tempfile.mkstemp(prefix='.state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(canonical(value) + b'\n'); f.flush(); os.fsync(f.fileno())
        os.replace(tmp, path)
        if os.name != 'nt':
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def change(folder, action, p, s, expected_revision=None, now=None):
    now = time.time() if now is None else now
    with file_lock(folder):
        path = folder / 'current.json'
        old = json.loads(path.read_text('utf-8')) if path.exists() else None
        if old is not None:
            require(isinstance(old.get('releaseId'), str) and
                    re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', old['releaseId']), 'CORRUPT_LOCAL_STATE')
            require(old.get('status') in TERMINAL | {'PREPARED', 'READY', 'DRAINING', 'CLEANUP_PENDING',
                                                    'UNKNOWN', 'ROLLBACK_FAILED'}, 'CORRUPT_LOCAL_STATE')
            require(old.get('target') == p['target'], 'STATE_TARGET_MISMATCH')
            require(old.get('status') in TERMINAL or old.get('releaseId') == p['releaseId'], 'UNFINISHED_RELEASE_BLOCKS_NEXT')
        if action == 'begin':
            require(old is None or old.get('status') in TERMINAL, 'UNFINISHED_RELEASE_BLOCKS_NEXT')
            require(old is None or old.get('releaseId') != p['releaseId'], 'RELEASE_ID_ALREADY_USED')
            require(not (folder / (p['releaseId'] + '.json')).exists(), 'RELEASE_ID_ALREADY_USED')
            check(p, s, 'preflight', now)
            state = {'releaseId': p['releaseId'], 'planSha256': digest(p), 'target': p['target'],
                     'evidenceMode': p['evidenceMode'], 'status': 'PREPARED', 'revision': 0,
                     'startedAt': s['observedAt'], 'history': []}
        else:
            require(old is not None and old.get('status') not in TERMINAL, 'NO_ACTIVE_RELEASE')
            require(old['releaseId'] == p['releaseId'] and old['planSha256'] == digest(p), 'ACTIVE_PLAN_MISMATCH')
            require(type(expected_revision) is int and old['revision'] == expected_revision, 'REVISION_CONFLICT')
            before, after = STAGES[action]
            require(before is None or old['status'] == before or
                    (action == 'finish' and old['status'] == 'CLEANUP_PENDING'), 'INVALID_TRANSITION')
            state = json.loads(json.dumps(old))
            try:
                check(p, s, action, now, timestamp(old['switchedAt']) if old.get('switchedAt') else None)
            except Blocked as e:
                # No rollback, stop or retries here. Persist uncertainty/debt.
                if action == 'finish':
                    state['status'] = 'CLEANUP_PENDING'
                elif action == 'rollback':
                    state['status'] = 'ROLLBACK_FAILED'
                elif action == 'switched':
                    state['status'] = 'UNKNOWN'
                else:
                    raise
                state['revision'] += 1
                state['lastError'] = str(e)
                state['history'].append({'action': action, 'result': state['status'], 'observedAt': s.get('observedAt')})
                atomic(path, state)
                raise
            state['status'] = after
            state['revision'] += 1
            if action == 'switched':
                state['switchedAt'] = s['observedAt']
            state.pop('lastError', None)
        state['history'].append({'action': action, 'result': state['status'], 'observedAt': s['observedAt']})
        state['lastSnapshotSha256'] = digest(s)
        if old is not None and old['status'] in TERMINAL:
            atomic(folder / (old['releaseId'] + '.json'), old)
        atomic(path, state)
        return state


def artifacts(snapshot, folder):
    # Supplied receipts are not probes. At minimum, bind every claimed receipt
    # to a real, immutable local artifact before accepting it through the CLI.
    require(isinstance(snapshot, dict), 'SNAPSHOT_OBJECT_REQUIRED')
    base = folder.resolve()
    for kind, receipt in snapshot.get('evidence', {}).items():
        path = (base / receipt.get('artifact', '')).resolve()
        require(path.is_relative_to(base) and path.is_file(), 'EVIDENCE_FILE_MISSING:' + kind)
        require(path.stat().st_size <= 16 * 1024 * 1024, 'EVIDENCE_FILE_TOO_LARGE:' + kind)
        require(hashlib.sha256(path.read_bytes()).hexdigest() == receipt.get('artifactSha256'),
                'EVIDENCE_FILE_HASH_MISMATCH:' + kind)


@contextlib.contextmanager
def live_locks():
    import fcntl
    paths = ['/opt/naumi-staging/releases/deploy.lock',
             '/opt/naumi-reverse-hub/releases/deploy.lock', '/opt/reference-workbench/deploy.lock']
    inherited = os.environ.get('NAUMI_LIFECYCLE_LOCK_FDS')
    if inherited:
        fds = inherited.split(',')
        require(len(fds) == 3 and len(set(fds)) == 3, 'INVALID_INHERITED_LOCK_FDS')
        for fd, path in zip(fds, paths):
            require(fd.isdigit() and os.readlink('/proc/self/fd/' + fd) == path and
                    'FLOCK  ADVISORY  WRITE' in pathlib.Path('/proc/self/fdinfo/' + fd).read_text(),
                    'INHERITED_HOST_LOCK_NOT_HELD')
        yield
    else:
        with contextlib.ExitStack() as stack:
            for path in paths:
                f = stack.enter_context(open(path, 'a'))
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield


def verify_live(p, s, stage):
    """Re-read host identity, inventory, images, RAM, gateway and worker origin.

    Probe/session/task receipts still need real adapters. Missing counters remain
    unknown and cannot pass finish; this function never manufactures them.
    """
    def command(args):
        return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=30)
    # Public ECS/EIP addresses need not appear in hostname -I. Bind the plan
    # to a reviewed hash of machine-id collected via the protected SSH target.
    machine = pathlib.Path('/etc/machine-id').read_bytes().strip()
    require(hashlib.sha256(machine).hexdigest() == p['hostIdentitySha256'], 'LOCAL_HOST_TARGET_NOT_VERIFIED')
    ids = command(['docker', 'ps', '-aq']).decode().split()
    require(ids, 'EMPTY_LIVE_INVENTORY')
    raw = json.loads(command(['docker', 'inspect', *ids]))
    declared = {r['id']: r for r in p['baseline']}
    roles = {i: r['role'] for i, r in declared.items()}
    roles.update({p['web']: 'web', p['worker']: 'worker'})
    # All running containers must be registered; retired baseline objects must
    # remain inspectable so recovery material cannot silently disappear.
    live = {r['Id']: r for r in raw if r['State']['Running'] or r['Id'] in roles}
    rows = {}
    names = {r['Name'].lstrip('/'): r['Id'] for r in raw}
    for id, row in live.items():
        require(id in roles, 'UNREGISTERED_LIVE_INSTANCE')
        env = dict(e.split('=', 1) for e in row['Config'].get('Env', []) if '=' in e)
        rows[id] = {'id': id, 'image': row['Image'], 'role': roles[id],
                    'commit': env.get('SOURCE_COMMIT', ''), 'running': row['State']['Running'],
                    'restartPolicy': row['HostConfig']['RestartPolicy']['Name'],
                    'startedAt': row['State']['StartedAt']}
    supplied = {r['id']: r for r in s['containers']}
    require(rows == supplied, 'LIVE_CONTAINER_SNAPSHOT_MISMATCH')
    memory = {x.split(':')[0]: int(x.split()[1]) for x in pathlib.Path('/proc/meminfo').read_text().splitlines()}
    available = memory['MemAvailable'] // 1024
    floor = max(p['budget']['minimumAvailableMiB'], p['budget']['reservedMiB'])
    if stage in ['preflight', 'ready'] and not rows.get(p['web'], {}).get('running'):
        floor = max(floor, p['budget']['candidatePeakMiB'] + p['budget']['reservedMiB'])
    require(available >= floor, 'LIVE_HOST_MEMORY_INSUFFICIENT')
    config = command(['nginx', '-T'])
    require(hashlib.sha256(config).hexdigest() == s.get('routingConfigSha256'), 'LIVE_GATEWAY_SNAPSHOT_MISMATCH')
    worker_id = p['worker'] if rows.get(p['worker'], {}).get('running') else next(
        (r['id'] for r in p['baseline'] if r['role'] == 'worker'), None)
    if worker_id:
        worker = live.get(worker_id)
        require(worker is not None, 'LIVE_WORKER_UNKNOWN')
        env = dict(e.split('=', 1) for e in worker['Config'].get('Env', []) if '=' in e)
        origin = urllib.parse.urlparse(env.get('NAUMI_APP_ORIGIN', ''))
        resolved = names.get(origin.hostname)
        require(resolved is not None and resolved == s['executionTargets']['worker-image-recovery'],
                'LIVE_WORKER_RECOVERY_TARGET_UNVERIFIED')


def record_failed_observation(folder, action, p, revision, reason):
    status = {'finish': 'CLEANUP_PENDING', 'switched': 'UNKNOWN', 'rollback': 'ROLLBACK_FAILED'}.get(action)
    if status is None or folder is None or p is None or not folder.is_dir():
        return
    with file_lock(folder):
        path = folder / 'current.json'
        if not path.is_file():
            return
        old = json.loads(path.read_text('utf-8'))
        if (old.get('status') in TERMINAL or old.get('releaseId') != p.get('releaseId') or
                old.get('planSha256') != digest(p) or old.get('revision') != revision):
            return
        old['status'] = status
        old['lastError'] = str(reason)
        old['revision'] += 1
        old['history'].append({'action': action, 'result': status,
                               'observedAt': dt.datetime.now(dt.timezone.utc).isoformat()})
        atomic(path, old)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'begin', *STAGES, 'status', 'publish47-nas'])
    parser.add_argument('--config', type=pathlib.Path)
    parser.add_argument('--plan', type=pathlib.Path)
    parser.add_argument('--snapshot', type=pathlib.Path)
    parser.add_argument('--state-dir', type=pathlib.Path)
    parser.add_argument('--revision', type=int)
    parser.add_argument('--stage', choices=['preflight', 'ready', *STAGES], default='preflight')
    a = parser.parse_args(argv)
    p = None
    state_verified = False
    try:
        if a.action == 'publish47-nas':
            require(os.name == 'posix' and a.config is not None,'LIVE_NAS_CONFIG_REQUIRED')
            # The established controller owns all three locks and the ORIGINAL
            # CAS journal, preserving the explicitly carried historical events.
            from release47_nas_successor import main as publish_nas
            publish_nas(a.config)
            return 0
        if a.action == 'status':
            require(a.state_dir is not None, 'STATE_DIR_REQUIRED')
            print((a.state_dir / 'current.json').read_text('utf-8').strip())
            return 0
        require(a.plan is not None and a.snapshot is not None, 'PLAN_AND_SNAPSHOT_REQUIRED')
        p = json.loads(a.plan.read_text('utf-8-sig')); s = json.loads(a.snapshot.read_text('utf-8-sig'))
        valid_plan(p)
        artifacts(s, a.snapshot.parent)
        if p['evidenceMode'] == 'live':
            require(os.name == 'posix', 'LIVE_LINUX_HOST_REQUIRED')
        if a.state_dir is not None:
            resolved = a.state_dir.resolve()
            if p['evidenceMode'] == 'live':
                require(os.name == 'posix' and resolved == pathlib.Path('/opt/naumi-staging/releases/release-lifecycle'),
                        'CANONICAL_HOST_STATE_REQUIRED')
            else:
                require(resolved.name == 'fixture-state', 'DEDICATED_FIXTURE_STATE_REQUIRED')
            state_verified = True
        with live_locks() if p['evidenceMode'] == 'live' else contextlib.nullcontext():
            if p['evidenceMode'] == 'live':
                verify_live(p, s, a.stage if a.action == 'check' else ('preflight' if a.action == 'begin' else a.action))
            if a.action == 'check':
                check(p, s, a.stage, time.time())
                print('RELEASE_CHECK=PASS; STAGE=' + a.stage + '; EVIDENCE_MODE=' + p['evidenceMode'])
            else:
                require(a.state_dir is not None, 'STATE_DIR_REQUIRED')
                state = change(a.state_dir, a.action, p, s, a.revision)
                print('RELEASE_STATE=' + state['status'] + '; REVISION=' + str(state['revision']) +
                      '; EVIDENCE_MODE=' + p['evidenceMode'])
        return 0
    except (Blocked, KeyError, TypeError, ValueError, AttributeError, OSError, subprocess.SubprocessError) as e:
        if state_verified:
            try:
                record_failed_observation(a.state_dir, a.action, p, a.revision, e)
            except (OSError, ValueError, TypeError, KeyError):
                print('RELEASE_STATE_WRITE_FAILED=INSPECT_LOCAL_STATE', file=sys.stderr)
        print('RELEASE_BLOCKED=' + str(e), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
