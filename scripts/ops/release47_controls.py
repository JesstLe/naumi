#!/usr/bin/env python3
"""47 transaction controls; caller retains HostTransaction for every phase.

No legacy pause inference, force stops, task replay, DB restore or secret output.
"""
import datetime
import json
import os
import pathlib
import re
import tempfile

from release47_host import Hold, environment, public_identity, require, sha

NGINX_ROOT = pathlib.Path('/etc/nginx')


APP_REMOTE = r"""
const input=JSON.parse(process.argv[1]);
const response=await fetch('http://127.0.0.1:3000/api/internal/release/'+(input?'control':'status'),{
 method:input?'POST':'GET',headers:{'x-release-control-secret':process.env.RELEASE_CONTROL_SECRET||'',
 'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(10000)});
if(!response.ok)throw Error('RELEASE_CONTROL_HTTP_'+response.status);
console.log(JSON.stringify(await response.json()));
"""


def fresh(value, maximum=30):
    try:
        at = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        delta = (datetime.datetime.now(datetime.timezone.utc) - at).total_seconds()
        require(0 <= delta <= maximum, 'STALE_CONTROL_OBSERVATION')
    except (AttributeError, TypeError, ValueError):
        raise Hold('INVALID_CONTROL_OBSERVATION_TIME') from None


def app_status(tx, identity):
    row = tx.pin(identity)
    env = environment(row)
    require(env.get('NAUMI_RELEASE_RUNTIME') == '1', 'LEGACY_APP_CONTROL_UNKNOWN')
    status = json.loads(tx.run(['docker', 'exec', '-e', 'NODE_OPTIONS=', identity['id'], 'node', '--input-type=module',
                              '-e', APP_REMOTE, 'null']))
    got = status.get('identity', {})
    require(status.get('schemaVersion') == 1 and got.get('instanceId') == env.get('NAUMI_INSTANCE_ID') and
            got.get('commit') == env.get('SOURCE_COMMIT') and
            re.fullmatch(r'[a-f0-9-]{36}', got.get('bootId', '')), 'APP_STATUS_IDENTITY_DRIFT')
    require(got.get('bootSource') == 'preload' and status.get('transport', {}).get('verified') is True,
            'PROCESS_START_HTTP_COVERAGE_REQUIRED')
    fresh(status.get('observedAt'))
    return status


def control_app(tx, identity, action, operation_id):
    """Record original CAS body before I/O; retry only that operation after loss."""
    require(action in ['drain', 'resume'] and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', operation_id or ''),
            'APP_CONTROL_ACTION_OR_UUID_INVALID')
    status = app_status(tx, identity)
    folder = tx.folder / 'app-controls'
    folder.mkdir(mode=0o700, exist_ok=True)
    require(not folder.is_symlink() and not folder.stat().st_mode & 0o077, 'PRIVATE_CONTROL_LOG_REQUIRED')
    path = folder / (operation_id + '.json')
    binding = {'container': identity, 'action': action}
    for pending in folder.glob('*.json'):
        old = json.loads(pending.read_text())
        require(pending == path or old.get('phase') == 'ACKNOWLEDGED', 'UNRESOLVED_APP_CONTROL')
    if path.exists():
        record = json.loads(path.read_text())
        require(record.get('binding') == binding, 'APP_OPERATION_BINDING_CONFLICT')
        request = record['request']
        require(request['bootId'] == status['identity']['bootId'], 'APP_CONTROL_BOOT_CHANGED')
        if record.get('phase') == 'ACKNOWLEDGED':
            return {'pastReceipt': record['receipt'], 'current': status, 'result': 'ALREADY_ACKNOWLEDGED'}
    else:
        request = {'instanceId': status['identity']['instanceId'], 'bootId': status['identity']['bootId'],
                   'expectedRevision': status['admission']['revision'], 'operationId': operation_id, 'action': action}
        record = {'binding': binding, 'request': request, 'phase': 'INTENT_RECORDED'}
        _atomic_private(path, record)
    try:
        receipt = json.loads(tx.run(['docker', 'exec', '-e', 'NODE_OPTIONS=', identity['id'], 'node', '--input-type=module',
                                    '-e', APP_REMOTE, json.dumps(request, sort_keys=True, separators=(',', ':'))]))
        require(receipt.get('operationId') == operation_id and
                receipt.get('identity', {}).get('bootId') == request['bootId'] and
                receipt.get('admission', {}).get('revision') == request['expectedRevision'] + 1,
                'APP_CONTROL_RECEIPT_MISMATCH')
        observed = app_status(tx, identity)
        mode = 'draining' if action == 'drain' else 'open'
        require(observed['identity']['bootId'] == request['bootId'] and
                observed['admission']['mode'] == mode and
                observed['admission']['revision'] >= receipt['admission']['revision'],
                'APP_CONTROL_NOT_OBSERVED')
        record.update(phase='ACKNOWLEDGED', receipt=receipt, observed=observed)
        _atomic_private(path, record)
        return {'receipt': receipt, 'current': observed, 'result': 'ACKNOWLEDGED'}
    except BaseException:
        record['phase'] = 'UNKNOWN'
        _atomic_private(path, record)
        raise


def _atomic_private(path, value):
    require(not path.is_symlink(), 'CONTROL_LOG_SYMLINK_FORBIDDEN')
    fd, name = tempfile.mkstemp(prefix='.control-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(json.dumps(value, sort_keys=True).encode() + b'\n')
            stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
        if os.name == 'posix':
            fd = os.open(path.parent, os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)
    finally:
        pathlib.Path(name).unlink(missing_ok=True)


def clone_worker(tx, web, *, name, memory_mib, cpu, state_dir):
    row = tx.pin(web)
    env = environment(row)
    require(row['State']['Running'] and row['Config']['Cmd'] == ['node', 'server.js'], 'RUNNING_CANDIDATE_WEB_REQUIRED')
    require(env.get('NAUMI_RELEASE_RUNTIME') == '1' and env.get('INTERNAL_APP_ORIGIN') == 'http://127.0.0.1:3000' and
            re.fullmatch('[a-f0-9]{40}', env.get('SOURCE_COMMIT', '')), 'CONTROLLED_DIRECT_WEB_REQUIRED')
    require(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', name) and name != web['name'], 'INVALID_WORKER_NAME')
    require(type(memory_mib) is int and 96 <= memory_mib <= 512 and type(cpu) in [int, float] and 0 < cpu <= 1,
            'BOUNDED_WORKER_RESOURCES_REQUIRED')
    require(len(env.get('VIDEO_WORKER_SECRET', '').strip()) >= 32, 'WORKER_SECRET_REQUIRED')
    state = pathlib.Path(state_dir)
    require(state.is_absolute() and not state.is_symlink() and state.resolve().is_relative_to(
            pathlib.Path('/opt/naumi-staging/releases')), 'PRIVATE_WORKER_STATE_REQUIRED')
    state.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.chown(state, 1001, 1001)
    networks = sorted(row['NetworkSettings']['Networks'])
    require(0 < len(networks) <= 4, 'WORKER_NETWORK_REVIEW_REQUIRED')
    # Only the tick caller's necessary settings. Do not copy DB/upstream credentials.
    settings = {'NAUMI_APP_ORIGIN': 'http://' + web['name'] + ':3000',
                'VIDEO_WORKER_SECRET': env['VIDEO_WORKER_SECRET'], 'SOURCE_COMMIT': env['SOURCE_COMMIT'],
                'BUILD_VERSION': env['BUILD_VERSION'], 'NAUMI_INSTANCE_ID': name,
                'NAUMI_WORKER_TARGET_INSTANCE_ID': env['NAUMI_INSTANCE_ID'], 'NAUMI_WORKER_RELEASE_CONTROL': '1',
                'NAUMI_WORKER_START_PAUSED': '1', 'NAUMI_WORKER_CONTROL_PORT': '3001',
                'NAUMI_WORKER_STATE_FILE': '/release-state/worker.json', 'NAUMI_VIDEO_WORKER': '0',
                'NODE_OPTIONS': '--max-old-space-size=' + str(max(48, memory_mib - 64))}
    require(all('\n' not in k + v and '\r' not in k + v for k, v in settings.items()), 'INVALID_WORKER_ENV')
    fd, filename = tempfile.mkstemp(prefix='.worker-env-', dir=tx.folder)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(''.join(k + '=' + v + '\n' for k, v in sorted(settings.items())))
        args = ['docker', 'create', '--name', name, '--restart=no', '--memory=' + str(memory_mib) + 'm',
                '--memory-swap=' + str(memory_mib) + 'm', '--cpus=' + str(cpu), '--pids-limit=64',
                '--network', networks[0], '--mount', 'type=bind,src=' + str(state) + ',dst=/release-state',
                '--env-file', filename, row['Image'], 'node', 'scripts/video-worker.mjs']
        created = tx.run(args).decode().strip()
        require(re.fullmatch('[a-f0-9]{64}', created), 'WORKER_CREATE_UNKNOWN')
        for network in networks[1:]: tx.run(['docker', 'network', 'connect', network, created])
        result = tx.inspect(created)
        require(result['Image'] == web['image'] and not result['State']['Running'] and
                environment(result).get('NAUMI_WORKER_START_PAUSED') == '1', 'WORKER_CREATE_MISMATCH')
        tx.save('worker-created-' + created[:12] + '.json', public_identity(result))
        return public_identity(result)
    finally:
        pathlib.Path(filename).unlink(missing_ok=True)


def start_worker(tx, identity, available_mib, *, reserve_mib=1024):
    row = tx.pin(identity)
    env = environment(row)
    cap = row['HostConfig'].get('Memory', 0)
    require(not row['State']['Running'] and row['Config']['Cmd'] == ['node', 'scripts/video-worker.mjs'] and
            env.get('NAUMI_WORKER_RELEASE_CONTROL') == '1' and env.get('NAUMI_WORKER_START_PAUSED') == '1',
            'PAUSED_CONTROLLED_WORKER_REQUIRED')
    require(type(available_mib) is int and type(reserve_mib) is int and reserve_mib >= 1024 and
            96 * 1024**2 <= cap <= 512 * 1024**2 and available_mib >= cap // 1024**2 + reserve_mib,
            'INSUFFICIENT_WORKER_MEMORY')
    tx.save('worker-start-intent-' + identity['id'][:12] + '.json', identity)
    tx.run(['docker', 'start', identity['id']])
    result = tx.inspect(identity['id'])
    require(result['State']['Running'] is True and result['Image'] == identity['image'], 'WORKER_START_UNKNOWN')
    return public_identity(result)


def switch_gateway_bundle(tx, report, before_files, after_files, *, expected_dump_sha, logical_to_real,
                          failure_policy='restore-preimage'):
    """Exact multi-file CAS + syntax + full closure SHA + reload.

    before_files contains EVERY file in nginx -T, not merely edited files.
    logical_to_real is freshly inspected by the caller; this method re-resolves it.
    SaaS callers preserve written configuration on uncertain IO: restoring its
    preimage could expose a program that ignores new permission semantics.
    """
    require(failure_policy in ('restore-preimage', 'preserve-written'), 'UNKNOWN_GATEWAY_FAILURE_POLICY')
    require(report.get('configClosureValidated') is True and report.get('baselineFileCasVerified') is True,
            'REVIEWED_COMPLETE_GATEWAY_BUNDLE_REQUIRED')
    require(report.get('beforeDumpSha256') == expected_dump_sha and
            sha(tx.run(['nginx', '-T'])) == expected_dump_sha, 'FULL_GATEWAY_BASELINE_CHANGED')
    patches = report.get('patches', [])
    require(patches and set(before_files) == set(logical_to_real) and
            set(after_files) == {p['path'] for p in patches}, 'COMPLETE_GATEWAY_CLOSURE_REQUIRED')
    paths = {}
    for logical, raw in before_files.items():
        path = pathlib.Path(logical)
        real = path.resolve(strict=True)
        require(str(real) == logical_to_real[logical] and real.is_file() and
                real.is_relative_to(NGINX_ROOT) and real.read_bytes() == raw,
                'GATEWAY_EXACT_FILE_CAS_CHANGED')
        paths[logical] = real
    require(len(set(paths.values())) == len(paths), 'DUPLICATE_REAL_GATEWAY_FILE')
    for patch in patches:
        logical = patch['path']
        require(logical in paths and sha(before_files[logical]) == patch['beforeSha256'] and
                sha(after_files[logical]) == patch['afterSha256'], 'GATEWAY_PATCH_HASH_MISMATCH')
    tx.save('gateway-transaction-intent.json', {'beforeDumpSha256': expected_dump_sha,
            'afterDumpSha256': report['afterDumpSha256'], 'patches': patches, 'logicalToReal': logical_to_real,
            'failurePolicy': failure_policy})
    for index, patch in enumerate(patches):
        tx.save('gateway-before-' + str(index) + '.conf', before_files[patch['path']])
    changed = []
    try:
        for patch in patches:
            logical = patch['path']
            require(paths[logical].read_bytes() == before_files[logical], 'GATEWAY_CAS_CHANGED_BEFORE_WRITE')
            _replace_config(paths[logical], after_files[logical]); changed.append(logical)
        tx.run(['nginx', '-t'])
        require(sha(tx.run(['nginx', '-T'])) == report['afterDumpSha256'], 'GENERATED_GATEWAY_CLOSURE_MISMATCH')
        tx.run(['systemctl', 'reload', 'nginx'])
    except BaseException:
        if failure_policy == 'preserve-written':
            tx.save('gateway-uncertain-preserved.json', {'failurePolicy': failure_policy,
                    'acknowledgedWritePaths': changed, 'possibleWritePaths': [patch['path'] for patch in patches],
                    'originalDumpSha256': expected_dump_sha,
                    'intendedDumpSha256': report['afterDumpSha256'], 'reloadOutcome': 'UNKNOWN',
                    'preimageRestored': False, 'reconciliationRequired': True})
            raise
        try:
            for logical in reversed(changed):
                require(paths[logical].read_bytes() == after_files[logical], 'GATEWAY_ROLLBACK_EXTERNAL_CHANGE')
                _replace_config(paths[logical], before_files[logical])
            tx.run(['nginx', '-t'])
            require(sha(tx.run(['nginx', '-T'])) == expected_dump_sha, 'GATEWAY_ROLLBACK_CLOSURE_MISMATCH')
            tx.run(['systemctl', 'reload', 'nginx'])
        except BaseException:
            raise Hold('GATEWAY_ROLLBACK_UNKNOWN_INSPECT_PRIVATE_EVIDENCE') from None
        raise
    return {'reloadIssued': True, 'afterDumpSha256': report['afterDumpSha256'],
            'acceptance': 'NOT_IMPLIED_BY_RELOAD', 'databaseRestored': False, 'tasksReplayed': False}


def _replace_config(path, data):
    stat = path.stat()
    require(path.is_file() and not path.is_symlink(), 'REAL_GATEWAY_PATH_REQUIRED')
    fd, name = tempfile.mkstemp(prefix='.release-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), stat.st_mode & 0o777)
            os.fchown(stream.fileno(), stat.st_uid, stat.st_gid)
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
        fd = os.open(path.parent, os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally: pathlib.Path(name).unlink(missing_ok=True)
