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
COMBINED_WORKER_COMMAND = ['node', 'scripts/video-worker-with-media.mjs']
COMBINED_WORKER_CAPS = {'SYS_CHROOT', 'SETUID', 'SETGID', 'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL'}
COMBINED_WORKER_TMPFS = {
    '/tmp': 'rw,noexec,nosuid,nodev,size=16m,mode=1777',
    '/tmp/naumi-media-sandbox': 'rw,exec,nosuid,nodev,size=512m,mode=755',
    '/data': 'ro,noexec,nosuid,nodev,size=1m,mode=755',
}
WORKER_SETTINGS = {'NAUMI_APP_ORIGIN', 'VIDEO_WORKER_SECRET', 'SOURCE_COMMIT', 'BUILD_VERSION',
    'NAUMI_INSTANCE_ID', 'NAUMI_WORKER_TARGET_INSTANCE_ID', 'NAUMI_WORKER_RELEASE_CONTROL',
    'NAUMI_WORKER_START_PAUSED', 'NAUMI_WORKER_CONTROL_PORT', 'NAUMI_WORKER_STATE_FILE',
    'NAUMI_VIDEO_WORKER', 'NODE_OPTIONS'}
COMBINED_WORKER_SETTINGS = {'NAUMI_MEDIA_WORKER', 'MEDIA_WORKER_ORIGIN', 'MEDIA_WORKER_SECRET',
    'MEDIA_JOB_DIR', 'MEDIA_WORKER_HOST', 'MEDIA_WORKER_PORT', 'MEDIA_WORKER_START_PAUSED',
    'MEDIA_WORKER_CONCURRENCY', 'NODE_ENV'}
IMAGE_ENVIRONMENT = {'PATH', 'NODE_VERSION', 'YARN_VERSION', 'NODE_ENV', 'NEXT_TELEMETRY_DISABLED',
    'PORT', 'HOSTNAME', 'MEDIA_DIR'}


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


def _combined_media_binding(web_row, name):
    env = environment(web_row)
    require(env.get('NAUMI_MEDIA_WORKER') == '1' and env.get('MEDIA_JOB_DIR') == '/scratch' and
            env.get('MEDIA_WORKER_ORIGIN') == 'http://' + name + ':3002' and
            len(env.get('MEDIA_WORKER_SECRET', '').strip()) >= 32 and
            env['MEDIA_WORKER_SECRET'] != env.get('VIDEO_WORKER_SECRET'), 'REVIEWED_COMBINED_MEDIA_BINDING_REQUIRED')
    scratch = [m for m in web_row.get('Mounts', []) if m['Destination'] == '/scratch']
    require(len(scratch) == 1 and scratch[0]['Type'] == 'bind' and scratch[0]['RW'] is True and
            pathlib.PurePosixPath(scratch[0]['Source']).is_absolute(), 'EXACT_COMBINED_SCRATCH_BIND_REQUIRED')
    return scratch[0]


def _validate_combined_worker(row, web_row):
    env, web_env, host = environment(row), environment(web_row), row['HostConfig']
    name = row['Name'].lstrip('/')
    scratch = _combined_media_binding(web_row, name)
    require(row['Config']['Cmd'] == COMBINED_WORKER_COMMAND and row['Config'].get('User') == '0:0' and
            row['Image'] == web_row['Image'] and web_row['State']['Running'] is True and
            web_row['Config']['Cmd'] == ['node', 'server.js'] and
            web_env.get('NAUMI_RELEASE_RUNTIME') == '1' and
            web_env.get('INTERNAL_APP_ORIGIN') == 'http://127.0.0.1:3000' and
            web_env.get('NAUMI_INSTANCE_ID') == web_row['Name'].lstrip('/') and
            re.fullmatch('[a-f0-9]{40}', web_env.get('SOURCE_COMMIT', '')) and
            re.fullmatch('[0-9]{10,13}', web_env.get('BUILD_VERSION', '')) and
            env.get('NAUMI_APP_ORIGIN') == 'http://' + web_row['Name'].lstrip('/') + ':3000' and
            env.get('NAUMI_INSTANCE_ID') == name and
            env.get('NAUMI_WORKER_TARGET_INSTANCE_ID') == web_env.get('NAUMI_INSTANCE_ID') and
            env.get('SOURCE_COMMIT') == web_env.get('SOURCE_COMMIT') and
            env.get('BUILD_VERSION') == web_env.get('BUILD_VERSION') and
            env.get('VIDEO_WORKER_SECRET') == web_env.get('VIDEO_WORKER_SECRET') and
            len(env.get('VIDEO_WORKER_SECRET', '').strip()) >= 32,
            'COMBINED_WORKER_IDENTITY_OR_SOURCE_CHANGED')
    expected = {'NAUMI_MEDIA_WORKER': '1', 'MEDIA_WORKER_HOST': '0.0.0.0', 'MEDIA_WORKER_PORT': '3002',
        'MEDIA_WORKER_START_PAUSED': '1', 'MEDIA_WORKER_CONCURRENCY': '1', 'MEDIA_JOB_DIR': '/scratch',
        'NAUMI_WORKER_RELEASE_CONTROL': '1', 'NAUMI_WORKER_START_PAUSED': '1',
        'NAUMI_WORKER_CONTROL_PORT': '3001', 'NAUMI_WORKER_STATE_FILE': '/release-state/worker.json',
        'NAUMI_VIDEO_WORKER': '0', 'NODE_OPTIONS': '--max-old-space-size=64', 'NODE_ENV': 'production',
        'MEDIA_WORKER_ORIGIN': web_env['MEDIA_WORKER_ORIGIN'], 'MEDIA_WORKER_SECRET': web_env['MEDIA_WORKER_SECRET']}
    require(all(env.get(key) == value for key, value in expected.items()) and
            set(env).issubset(WORKER_SETTINGS | COMBINED_WORKER_SETTINGS | IMAGE_ENVIRONMENT),
            'COMBINED_WORKER_ENVIRONMENT_NOT_REVIEWED')
    normalize = lambda values: {v.upper().removeprefix('CAP_') for v in values or []}
    require(host.get('Memory') == 1024 * 1024**2 and host.get('MemorySwap') == 1024 * 1024**2 and
            host.get('PidsLimit') == 160 and host.get('NanoCpus') == 1_000_000_000 and
            host.get('ReadonlyRootfs') is True and host.get('Privileged') is False and
            normalize(host.get('CapDrop')) == {'ALL'} and normalize(host.get('CapAdd')) == COMBINED_WORKER_CAPS and
            set(host.get('SecurityOpt') or []) in [{'no-new-privileges:true'}, {'no-new-privileges'}] and
            host.get('Tmpfs') == COMBINED_WORKER_TMPFS and not host.get('PortBindings') and
            not host.get('PublishAllPorts') and not host.get('Devices') and not host.get('DeviceRequests') and
            not host.get('VolumesFrom') and not host.get('Links') and not host.get('PidMode') and
            host.get('IpcMode') in ['private', ''] and not host.get('UTSMode') and
            set(row['NetworkSettings']['Networks']) == set(web_row['NetworkSettings']['Networks']) and
            host.get('NetworkMode') not in ['host', 'none'], 'COMBINED_WORKER_SECURITY_CHANGED')
    mounts = row.get('Mounts', [])
    bindings = {m['Destination']: m for m in mounts if m['Type'] == 'bind'}
    require(len(bindings) == 2 and set(bindings) == {'/scratch', '/release-state'} and
            bindings['/scratch']['Source'] == scratch['Source'] and bindings['/scratch']['RW'] is True and
            bindings['/release-state']['RW'] is True and
            pathlib.PurePosixPath(bindings['/release-state']['Source']).is_relative_to('/opt/naumi-staging/releases') and
            all(m['Type'] == 'bind' or m['Type'] == 'tmpfs' and m['Destination'] in COMBINED_WORKER_TMPFS for m in mounts),
            'COMBINED_WORKER_MOUNTS_CHANGED')


def clone_worker(tx, web, *, name, memory_mib, cpu, state_dir, reviewed_combined_media=False):
    row = tx.pin(web)
    env = environment(row)
    require(row['State']['Running'] and row['Config']['Cmd'] == ['node', 'server.js'], 'RUNNING_CANDIDATE_WEB_REQUIRED')
    require(env.get('NAUMI_RELEASE_RUNTIME') == '1' and env.get('INTERNAL_APP_ORIGIN') == 'http://127.0.0.1:3000' and
            re.fullmatch('[a-f0-9]{40}', env.get('SOURCE_COMMIT', '')), 'CONTROLLED_DIRECT_WEB_REQUIRED')
    require(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', name) and name != web['name'], 'INVALID_WORKER_NAME')
    require(type(reviewed_combined_media) is bool, 'EXPLICIT_COMBINED_MEDIA_REVIEW_REQUIRED')
    require(reviewed_combined_media or env.get('NAUMI_MEDIA_WORKER') != '1',
            'COMBINED_MEDIA_EXPLICIT_REVIEW_REQUIRED')
    require(type(memory_mib) is int and type(cpu) in [int, float] and
            (memory_mib == 1024 and cpu == 1 if reviewed_combined_media else 96 <= memory_mib <= 512 and 0 < cpu <= 1),
            'BOUNDED_WORKER_RESOURCES_REQUIRED')
    require(len(env.get('VIDEO_WORKER_SECRET', '').strip()) >= 32, 'WORKER_SECRET_REQUIRED')
    scratch = _combined_media_binding(row, name) if reviewed_combined_media else None
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
    if reviewed_combined_media:
        settings.update(NAUMI_MEDIA_WORKER='1', MEDIA_WORKER_ORIGIN=env['MEDIA_WORKER_ORIGIN'],
            MEDIA_WORKER_SECRET=env['MEDIA_WORKER_SECRET'], MEDIA_JOB_DIR='/scratch',
            MEDIA_WORKER_HOST='0.0.0.0', MEDIA_WORKER_PORT='3002', MEDIA_WORKER_START_PAUSED='1',
            MEDIA_WORKER_CONCURRENCY='1', NODE_OPTIONS='--max-old-space-size=64', NODE_ENV='production')
    require(all('\n' not in k + v and '\r' not in k + v for k, v in settings.items()), 'INVALID_WORKER_ENV')
    fd, filename = tempfile.mkstemp(prefix='.worker-env-', dir=tx.folder)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(''.join(k + '=' + v + '\n' for k, v in sorted(settings.items())))
        args = ['docker', 'create', '--name', name, '--restart=no', '--memory=' + str(memory_mib) + 'm',
                '--memory-swap=' + str(memory_mib) + 'm', '--cpus=' + str(cpu), '--pids-limit=' + ('160' if reviewed_combined_media else '64'),
                '--network', networks[0], '--mount', 'type=bind,src=' + str(state) + ',dst=/release-state',
                '--env-file', filename]
        if reviewed_combined_media:
            args += ['--user=0:0', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true']
            for capability in sorted(COMBINED_WORKER_CAPS): args += ['--cap-add=' + capability]
            for destination, options in COMBINED_WORKER_TMPFS.items(): args += ['--tmpfs', destination + ':' + options]
            args += ['--mount', 'type=bind,src=' + scratch['Source'] + ',dst=/scratch']
        args += [row['Image'], *(COMBINED_WORKER_COMMAND if reviewed_combined_media else ['node', 'scripts/video-worker.mjs'])]
        created = tx.run(args).decode().strip()
        require(re.fullmatch('[a-f0-9]{64}', created), 'WORKER_CREATE_UNKNOWN')
        for network in networks[1:]: tx.run(['docker', 'network', 'connect', network, created])
        result = tx.inspect(created)
        require(result['Image'] == web['image'] and not result['State']['Running'] and
                environment(result).get('NAUMI_WORKER_START_PAUSED') == '1', 'WORKER_CREATE_MISMATCH')
        if reviewed_combined_media: _validate_combined_worker(result, row)
        tx.save('worker-created-' + created[:12] + '.json', public_identity(result))
        return public_identity(result)
    finally:
        pathlib.Path(filename).unlink(missing_ok=True)


def start_worker(tx, identity, available_mib, *, reserve_mib=1024, reviewed_combined_media=False):
    row = tx.pin(identity)
    env = environment(row)
    cap = row['HostConfig'].get('Memory', 0)
    require(type(reviewed_combined_media) is bool, 'EXPLICIT_COMBINED_MEDIA_REVIEW_REQUIRED')
    command = COMBINED_WORKER_COMMAND if reviewed_combined_media else ['node', 'scripts/video-worker.mjs']
    require(not row['State']['Running'] and row['Config']['Cmd'] == command and
            env.get('NAUMI_WORKER_RELEASE_CONTROL') == '1' and env.get('NAUMI_WORKER_START_PAUSED') == '1',
            'PAUSED_CONTROLLED_WORKER_REQUIRED')
    if reviewed_combined_media:
        origin = re.fullmatch(r'http://([A-Za-z0-9][A-Za-z0-9_.-]{0,95}):3000', env.get('NAUMI_APP_ORIGIN', ''))
        require(origin, 'COMBINED_WORKER_WEB_ORIGIN_CHANGED')
        _validate_combined_worker(row, tx.inspect(origin.group(1)))
    require(type(available_mib) is int and type(reserve_mib) is int and reserve_mib >= 1024 and
            (cap == 1024 * 1024**2 if reviewed_combined_media else 96 * 1024**2 <= cap <= 512 * 1024**2) and
            available_mib >= cap // 1024**2 + reserve_mib,
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
