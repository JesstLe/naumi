#!/usr/bin/env python3
"""47 transaction primitives: fixed identities, memory gate, backups and blue/green.

No implicit discovery-based stop, legacy drain inference, model calls or DB restore.
The caller holds this object across the WHOLE transaction, not one lock per phase.
"""
import contextlib
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile

TARGET = '47.105.59.142'
LOCKS = ['/opt/naumi-staging/releases/deploy.lock',
         '/opt/naumi-reverse-hub/releases/deploy.lock', '/opt/reference-workbench/deploy.lock']
GATEWAY = '/etc/nginx/sites-available/reference-workbench'
TARGETS = {
    TARGET: {'locks': LOCKS, 'prefix': 'naumi47-'},
    '103.30.76.93': {'locks': LOCKS[:2], 'prefix': 'naumi-'},
}


class Hold(Exception):
    pass


def require(value, code):
    if not value:
        raise Hold(code)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def file_sha(path):
    digest = hashlib.sha256()
    with pathlib.Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def environment(row):
    return dict(value.split('=', 1) for value in row['Config'].get('Env', []) if '=' in value)


def public_identity(row):
    return {'id': row['Id'], 'name': row['Name'].lstrip('/'), 'image': row['Image'],
            'running': row['State']['Running'], 'startedAt': row['State']['StartedAt'],
            'restartPolicy': row['HostConfig']['RestartPolicy']['Name']}


def memory_gate(available_mib, spec):
    fields = ['webPeakMiB', 'workerPeakMiB', 'hostReserveMiB']
    require(all(type(spec.get(k)) is int and spec[k] > 0 for k in fields), 'UNKNOWN_MEMORY_BUDGET')
    require(type(available_mib) is int and available_mib >= 0, 'UNKNOWN_MEM_AVAILABLE')
    require(spec['hostReserveMiB'] >= 1024, 'HOST_RESERVE_TOO_SMALL')
    required = sum(spec[k] for k in fields)
    return {'ok': available_mib >= required, 'availableMiB': available_mib,
            'requiredMiB': required, 'budget': dict(spec), 'swapIncluded': False}


def assert_drain(receipt, identity, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    require(receipt.get('identity') == identity, 'DRAIN_IDENTITY_CHANGED')
    require(receipt.get('coverage') == 'complete', 'DRAIN_COVERAGE_INCOMPLETE')
    fields = ['connections', 'agentSessions', 'acceptedTasks', 'workerLeases', 'newAdmissions']
    require(all(type(receipt.get(k)) is int and receipt[k] == 0 for k in fields), 'DRAIN_NOT_PROVEN_ZERO')
    try:
        at = datetime.datetime.fromisoformat(receipt['observedAt'].replace('Z', '+00:00'))
        require(0 <= (now - at).total_seconds() <= 30, 'DRAIN_OBSERVATION_STALE')
    except (ValueError, TypeError, KeyError):
        raise Hold('DRAIN_OBSERVATION_INVALID') from None


class HostTransaction:
    def __init__(self, target, host_sha256, evidence_dir, *, command=None):
        require(target in TARGETS and re.fullmatch('[a-f0-9]{64}', host_sha256 or ''), 'FIXED_TARGET_REQUIRED')
        self.target = target
        self.spec = TARGETS[target]
        self.host_sha256 = host_sha256
        self.folder = pathlib.Path(evidence_dir)
        self._command = command
        self.stack = None
        self.lock_fds = []

    def run(self, args, *, stdin=None, timeout=120):
        require(self.stack is not None, 'WHOLE_TRANSACTION_LOCK_REQUIRED')
        if self._command:
            return self._command(args, stdin=stdin, timeout=timeout)
        try:
            result = subprocess.run(args, input=stdin, capture_output=True, timeout=timeout, check=True)
            return result.stdout
        except (OSError, subprocess.SubprocessError):
            # Never include argv/env/stdout/stderr: Docker inspect and pg_dump
            # can carry configuration or authentication values.
            raise Hold('HOST_COMMAND_FAILED') from None

    def __enter__(self):
        require(os.name == 'posix' and os.geteuid() == 0, 'ROOT_LINUX_REQUIRED')
        require(sha(pathlib.Path('/etc/machine-id').read_bytes().strip()) == self.host_sha256, 'HOST_IDENTITY_CHANGED')
        import fcntl
        stack = contextlib.ExitStack()
        try:
            for name in self.spec['locks']:
                require(not pathlib.Path(name).is_symlink(), 'LOCK_SYMLINK_FORBIDDEN')
                fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                stream = stack.enter_context(os.fdopen(fd, 'a'))
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.lock_fds.append(fd)
            require(self.folder.is_absolute() and not self.folder.is_symlink(), 'PRIVATE_EVIDENCE_PATH_REQUIRED')
            resolved = self.folder.resolve()
            require(resolved.is_relative_to(pathlib.Path('/opt/naumi-staging/evidence')), 'EVIDENCE_OUTSIDE_RELEASE_ROOT')
            self.folder.mkdir(mode=0o700, parents=True, exist_ok=True)
            require(not self.folder.stat().st_mode & 0o077, 'PRIVATE_EVIDENCE_MODE_REQUIRED')
            for directory in (self.folder, self.folder.parent):
                directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            self.stack = stack
            return self
        except BaseException:
            stack.close()
            self.lock_fds = []
            raise

    def __exit__(self, *exc):
        self.stack.close()
        self.stack = None
        self.lock_fds = []

    def inspect(self, name):
        result = json.loads(self.run(['docker', 'inspect', name]))
        require(len(result) == 1, 'AMBIGUOUS_CONTAINER')
        return result[0]

    def pin(self, identity):
        row = self.inspect(identity['id'])
        require(public_identity(row) == identity, 'CONTAINER_BASELINE_CHANGED')
        return row

    def save(self, name, value):
        require('/' not in name and '\\' not in name, 'INVALID_EVIDENCE_NAME')
        payload = value if isinstance(value, bytes) else json.dumps(value, sort_keys=True).encode() + b'\n'
        path = self.folder / name
        require(not path.is_symlink(), 'EVIDENCE_SYMLINK_FORBIDDEN')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        directory_fd = os.open(self.folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        require(path.read_bytes() == payload, 'EVIDENCE_REOPEN_FAILED')
        return {'path': str(path), 'sha256': sha(payload), 'bytes': len(payload)}

    def clone_web(self, identity, *, name, port, image, commit, memory_mib, cpu, release_secret,
                  state_dir, build_version, admission='draining', reviewed_omitted_mounts=None, media_binding=None,
                  before_create=None, runtime_recovery=None, reviewed_prior_state_dir=None,
                  reviewed_nas_credentials_sha256=None, reviewed_video_reference_origin=None,
                  reviewed_combined_media=None, reviewed_memory_environment=None, reviewed_deferred_nas_delivery=False):
        require(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', name), 'INVALID_NEW_SLOT_NAME')
        require(type(port) is int and 1024 <= port <= 65535, 'INVALID_LOOPBACK_PORT')
        require(re.fullmatch('sha256:[a-f0-9]{64}', image) and re.fullmatch('[a-f0-9]{40}', commit), 'FIXED_IMAGE_REQUIRED')
        require(re.fullmatch('[0-9]{10,13}', build_version), 'FIXED_BUILD_VERSION_REQUIRED')
        require(type(memory_mib) is int and memory_mib >= 512 and type(cpu) in [int, float] and 0 < cpu <= 2,
                'BOUNDED_CANDIDATE_RESOURCES_REQUIRED')
        require(len(release_secret) >= 32 and '\n' not in release_secret and admission == 'draining', 'PAUSED_ADMISSION_REQUIRED')
        old = self.pin(identity)
        if media_binding is not None:
            require(self.target == '103.30.76.93' and all(m['Destination'] != '/scratch' for m in old['Mounts']),
                    'MEDIA_BINDING_REQUIRES_REVIEWED_103_SOURCE')
        require(old['Config']['Cmd'] == ['node', 'server.js'], 'WEB_CLONE_SOURCE_NOT_STANDARD')
        networks = sorted(old['NetworkSettings']['Networks'])
        require(networks and len(networks) <= 4, 'REVIEW_NETWORKS_REQUIRED')
        env = environment(old)
        if reviewed_deferred_nas_delivery:
            require(self.target == TARGET and env.get('STORAGE_DRIVER') == 's3' and env.get('MEDIA_PRIVATE') == '1' and
                    env.get('MEDIA_REMOTE_ACCESS') == 'proxy', 'REVIEWED_PRIVATE_NAS_DELIVERY_REQUIRED')
            env['NAUMI_NAS_DEFER_UPLOAD'] = '1'
        if reviewed_nas_credentials_sha256 is not None:
            require(self.target == TARGET and re.fullmatch('[a-f0-9]{64}', reviewed_nas_credentials_sha256),
                    'EXACT_REVIEWED_NAS_BINDING_REQUIRED')
            credentials = pathlib.Path('/root/.nas47-garage.json')
            require(not credentials.is_symlink() and credentials.stat().st_uid == 0 and
                    not credentials.stat().st_mode & 0o077 and file_sha(credentials) == reviewed_nas_credentials_sha256,
                    'NAS_CREDENTIAL_FILE_CHANGED')
            nas = json.loads(credentials.read_bytes())
            require(nas.get('endpointContainersBridge') == 'http://172.18.0.1:13947' and
                    nas.get('bucket') == 'naumi47-media-20261020' and nas.get('accessKeyId') and nas.get('secretAccessKey'),
                    'REVIEWED_PRIVATE_NAS_ENDPOINT_REQUIRED')
            env.update(STORAGE_DRIVER='s3', MEDIA_PRIVATE='1', MEDIA_REMOTE_ACCESS='proxy',
                       S3_ENDPOINT=nas['endpointContainersBridge'], S3_BUCKET=nas['bucket'],
                       S3_REGION=nas.get('region') or 'garage', S3_FORCE_PATH_STYLE='true',
                       S3_ACCESS_KEY_ID=nas['accessKeyId'], S3_SECRET_ACCESS_KEY=nas['secretAccessKey'])
            self.save('reviewed-nas-binding-'+name+'.json', {'endpoint':nas['endpointContainersBridge'], 'bucket':nas['bucket'],
                      'credentialFileSha256':reviewed_nas_credentials_sha256, 'privateMedia':True, 'accessMode':'proxy'})
        if reviewed_video_reference_origin is not None:
            require(self.target == TARGET and reviewed_video_reference_origin == 'https://47.105.59.142',
                    'EXACT_REVIEWED_VIDEO_REFERENCE_ORIGIN_REQUIRED')
            env['VIDEO_REFERENCE_PUBLIC_BASE_URL'] = reviewed_video_reference_origin
            self.save('reviewed-video-reference-origin-'+name+'.json',
                      {'origin': reviewed_video_reference_origin, 'existingSlotChanged': False})
        scratch = None
        if reviewed_combined_media is not None:
            require(self.target == TARGET and set(reviewed_combined_media) == {'workerName','secret','scratchSource'},
                    'EXACT_COMBINED_MEDIA_REVIEW_REQUIRED')
            media = reviewed_combined_media
            require(re.fullmatch(r'naumi47-worker-video-family-[a-z0-9-]+', media['workerName']) and
                    isinstance(media['secret'], str) and 48 <= len(media['secret']) <= 128 and
                    media['secret'] not in [env.get('SETTINGS_SECRET'), env.get('VIDEO_WORKER_SECRET')],
                    'INDEPENDENT_COMBINED_MEDIA_SECRET_REQUIRED')
            scratch = pathlib.Path(media['scratchSource'])
            require(str(scratch) == '/opt/naumi-staging/data/video-media-jobs' and not scratch.is_symlink(),
                    'EXACT_COMBINED_MEDIA_SCRATCH_REQUIRED')
            if not scratch.exists():
                scratch.mkdir(mode=0o700)
                os.chown(scratch,1001,1001)
            require(scratch.is_dir() and scratch.stat().st_uid == 1001 and not scratch.stat().st_mode & 0o077,
                    'PRIVATE_COMBINED_MEDIA_SCRATCH_REQUIRED')
            env.update(NAUMI_MEDIA_WORKER='1',MEDIA_WORKER_ORIGIN='http://'+media['workerName']+':3002',
                       MEDIA_WORKER_SECRET=media['secret'],MEDIA_JOB_DIR='/scratch',
                       MEDIA_WORKER_START_PAUSED='1',MEDIA_WORKER_CONCURRENCY='1')
            self.save('reviewed-combined-media-'+name+'.json',{'workerName':media['workerName'],
                      'scratchSource':str(scratch),'secretSha256':sha(media['secret'].encode()),
                      'separateSecret':True,'existingSlotChanged':False})
        env.update(SOURCE_COMMIT=commit, BUILD_VERSION=build_version, NAUMI_INSTANCE_ID=name, NAUMI_RELEASE_RUNTIME='1',
                   NAUMI_RELEASE_ADMISSION_START='draining', RELEASE_CONTROL_SECRET=release_secret,
                   INTERNAL_APP_ORIGIN='http://127.0.0.1:3000', NAUMI_VIDEO_WORKER='0',
                   HOSTNAME='0.0.0.0', NAUMI_RELEASE_PEERS='{}',
                   NODE_OPTIONS='--max-old-space-size=' + str(max(256, memory_mib - 384)) + ' --require=/app/scripts/release-http-observer.cjs')
        if reviewed_memory_environment is not None:
            # Opt-in, new-slot-only budget. Old callers retain their exact default.
            review = reviewed_memory_environment
            require(isinstance(review, dict) and set(review) == {'memoryReview', 'environment'},
                    'EXPLICIT_REVIEWED_MEMORY_ENVIRONMENT_REQUIRED')
            budget, overrides = review['memoryReview'], review['environment']
            allowed = {'NODE_OPTIONS', 'MALLOC_ARENA_MAX', 'VIPS_CONCURRENCY',
                       'NAUMI_NATIVE_MEMORY_PROFILE', 'UV_THREADPOOL_SIZE',
                       'NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE', 'NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN',
                       'NAUMI_IMAGE_JOB_CONCURRENCY_SUITE', 'NAUMI_IMAGE_JOB_CONCURRENCY_APLUS'}
            require(self.target == TARGET and isinstance(budget, dict) and budget.get('reviewed') is True
                    and type(budget.get('webHeapMiB')) is int and budget['webHeapMiB'] >= 256
                    and type(budget.get('nativeReserveMiB')) is int and budget['nativeReserveMiB'] >= 768
                    and budget['webHeapMiB'] + budget['nativeReserveMiB'] <= memory_mib
                    and budget.get('webMinMiB', 0) > 2048
                    and budget['webMinMiB'] <= memory_mib <= budget.get('webMaxMiB', 0)
                    and budget.get('hostReserveMiB', 0) >= 1024,
                    'REVIEWED_HEAP_AND_NATIVE_MEMORY_BUDGET_REQUIRED')
            require(isinstance(overrides, dict) and 'NODE_OPTIONS' in overrides
                    and set(overrides).issubset(allowed)
                    and {'NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE', 'NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN',
                         'NAUMI_IMAGE_JOB_CONCURRENCY_SUITE', 'NAUMI_IMAGE_JOB_CONCURRENCY_APLUS'}.issubset(overrides)
                    and overrides == budget.get('environment')
                    and all(isinstance(v, str) and v and '\n' not in v and '\r' not in v for v in overrides.values())
                    and overrides['NODE_OPTIONS'] == '--max-old-space-size=' + str(budget['webHeapMiB'])
                        + ' --require=/app/scripts/runtime-memory.cjs --require=/app/scripts/release-http-observer.cjs'
                    and overrides.get('NAUMI_NATIVE_MEMORY_PROFILE') == 'bounded'
                    and overrides.get('MALLOC_ARENA_MAX') == '2' and overrides.get('UV_THREADPOOL_SIZE') == '2'
                    and overrides.get('VIPS_CONCURRENCY') == '1'
                    and all(k in ('NODE_OPTIONS', 'NAUMI_NATIVE_MEMORY_PROFILE') or re.fullmatch(r'[1-9][0-9]{0,2}', v)
                            for k, v in overrides.items())
                    and all(1 <= int(v) <= 256 for k, v in overrides.items()
                            if k.startswith('NAUMI_IMAGE_JOB_CONCURRENCY_')),
                    'MEMORY_ENVIRONMENT_NOT_BOUND_OR_ALLOWED')
            env.update(overrides)
        for key in ['NAUMI_RELEASE_BOOT_ID', 'NAUMI_RELEASE_BOOT_SOURCE', 'NAUMI_RELEASE_INSTANCE_ID', 'NAUMI_RELEASE_COMMIT']:
            env.pop(key, None)
        require(all('\n' not in k + v and '\r' not in k + v for k, v in env.items()), 'MULTILINE_ENV_NOT_SUPPORTED')
        args = ['docker', 'create', '--name', name, '--restart=no', '--memory=' + str(memory_mib) + 'm',
                '--memory-swap=' + str(memory_mib) + 'm', '--cpus=' + str(cpu), '--pids-limit=256',
                '--network', networks[0], '-p', '127.0.0.1:' + str(port) + ':3000']
        omitted = reviewed_omitted_mounts or {}
        require(set(omitted).issubset({m['Destination'] for m in old['Mounts']}), 'UNKNOWN_OMITTED_MOUNT')
        for mount in old['Mounts']:
            require(mount['Type'] in ['bind', 'volume'] and ',' not in mount['Source'] + mount['Destination'], 'REVIEW_MOUNTS_REQUIRED')
            if mount['Destination'] == '/release-state':
                require(mount['Type'] == 'bind' and mount['Source'] == reviewed_prior_state_dir and
                        pathlib.Path(reviewed_prior_state_dir).is_absolute() and
                        pathlib.Path(state_dir).resolve() != pathlib.Path(reviewed_prior_state_dir).resolve() and
                        pathlib.Path(reviewed_prior_state_dir).resolve().is_relative_to(
                            pathlib.Path('/opt/naumi-staging/releases')),
                        'EXACT_PRIOR_SLOT_STATE_REVIEW_REQUIRED')
                # A new slot must NEVER share the source boot/control state.
                continue
            if mount['Destination'] in omitted:
                require(mount['Type'] == 'bind' and not mount['RW'] and pathlib.Path(mount['Source']).is_file() and
                        sha(pathlib.Path(mount['Source']).read_bytes()) == omitted[mount['Destination']], 'OMITTED_OVERLAY_HASH_CHANGED')
                continue
            require(mount['Destination'] == '/data' or mount['Destination'].startswith('/data/') or
                    mount['Destination'] == '/scratch', 'LEGACY_PROGRAM_OVERLAY_REQUIRES_REVIEW')
            if scratch is not None and mount['Destination'] == '/scratch':
                require(mount['Type'] == 'bind' and mount['Source'] == str(scratch) and mount['RW'],
                        'COMBINED_MEDIA_SCRATCH_CHANGED')
            source = mount['Source'] if mount['Type'] == 'bind' else mount['Name']
            flag = 'type=' + mount['Type'] + ',src=' + source + ',dst=' + mount['Destination']
            args += ['--mount', flag + (',readonly' if not mount['RW'] else '')]
        if scratch is not None and not any(m['Destination'] == '/scratch' for m in old['Mounts']):
            args += ['--mount','type=bind,src='+str(scratch)+',dst=/scratch']
        state = pathlib.Path(state_dir)
        require(state.is_absolute() and not state.is_symlink() and state.resolve().is_relative_to(pathlib.Path('/opt/naumi-staging/releases')),
                'PRIVATE_SLOT_STATE_REQUIRED')
        state.mkdir(mode=0o700, parents=True, exist_ok=True)
        require(not state.stat().st_mode & 0o077, 'PRIVATE_SLOT_STATE_MODE_REQUIRED')
        os.chown(state, 1001, 1001)
        args += ['--mount', 'type=bind,src=' + str(state) + ',dst=/release-state']
        if runtime_recovery is not None:
            require(media_binding is not None and self.target == '103.30.76.93', 'RECOVERY_VIDEO_GOAL_ONLY')
            from release_runtime_recovery import install_launcher
            install_launcher(state, release_id=runtime_recovery, commit=commit, version=build_version, instance=name)
            args += ['--entrypoint', '/release-state/launch.sh']
        if media_binding is not None:
            from release_video_media import apply_binding
            apply_binding(env, args, media_binding, self.folder, commit)
        # Values are supplied only through an ACL/private tempfile, never argv.
        fd, raw = tempfile.mkstemp(prefix='.candidate-env-', dir=self.folder)
        try:
            with os.fdopen(fd, 'w') as output:
                output.write(''.join(k + '=' + v + '\n' for k, v in sorted(env.items())))
            args += ['--env-file', raw, image, 'node', 'server.js']
            if before_create is not None:
                before_create()
            created = self.run(args).decode().strip()
            require(re.fullmatch('[a-f0-9]{64}', created), 'CANDIDATE_CREATE_UNKNOWN')
            for network in networks[1:]:
                self.run(['docker', 'network', 'connect', network, created])
            row = self.inspect(created)
            require(not row['State']['Running'] and row['Image'] == image and environment(row)['NAUMI_VIDEO_WORKER'] == '0',
                    'CANDIDATE_CREATE_MISMATCH')
            self.save('candidate-created-' + created[:12] + '.json', public_identity(row))
            return public_identity(row)
        finally:
            pathlib.Path(raw).unlink(missing_ok=True)

    def start_candidate(self, identity, budget, available_mib):
        self.pin(identity)
        require(not identity['running'], 'CANDIDATE_ALREADY_RUNNING')
        require(memory_gate(available_mib, budget)['ok'], 'INSUFFICIENT_DUAL_SLOT_MEMORY')
        self.save('candidate-start-intent-' + identity['id'][:12] + '.json', identity)
        self.run(['docker', 'start', identity['id']])
        row = self.inspect(identity['id'])
        require(row['State']['Running'] is True and row['Image'] == identity['image'], 'CANDIDATE_START_UNKNOWN')
        return public_identity(row)

    def backup_database(self, db_identity):
        """Consistent, low-compression snapshot; validate listing, never restore."""
        row = self.pin(db_identity)
        env = environment(row)
        require(env.get('POSTGRES_USER') and env.get('POSTGRES_DB'), 'DATABASE_IDENTITY_REQUIRED')
        require(self._command is None, 'LIVE_BACKUP_REQUIRES_REAL_COMMAND')
        destination = self.folder / ('database-' + db_identity['id'][:12] + '.dump')
        require(not destination.exists(), 'BACKUP_ALREADY_EXISTS')
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, 'wb') as output:
                result = subprocess.run(['docker', 'exec', db_identity['id'], 'pg_dump', '-Fc', '-Z1',
                                         '--no-owner', '--no-acl', '--lock-wait-timeout=3s',
                                         '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB']],
                                        stdout=output, stderr=subprocess.PIPE, timeout=300)
                output.flush()
                os.fsync(output.fileno())
            require(result.returncode == 0 and destination.stat().st_size > 100, 'DATABASE_BACKUP_FAILED')
            with destination.open('rb') as stream:
                result = subprocess.run(['docker', 'exec', '-i', db_identity['id'], 'pg_restore', '--list'],
                                        stdin=stream, capture_output=True, timeout=60)
            require(result.returncode == 0 and b'TABLE DATA' in result.stdout, 'BACKUP_REOPEN_FAILED')
            return self.save('backup-readable.json', {'path': str(destination), 'bytes': destination.stat().st_size,
                             'sha256': file_sha(destination), 'listSha256': sha(result.stdout), 'restoreExecuted': False})
        except (OSError, subprocess.SubprocessError):
            raise Hold('DATABASE_BACKUP_COMMAND_FAILED') from None

    def retire(self, identity, receipt, *, now=None):
        row = self.pin(identity)
        require(row['Name'].lstrip('/').startswith(self.spec['prefix']) and row['Config']['Cmd'] in
                [['node', 'server.js'], ['scripts/video-worker.mjs'], ['node', 'scripts/video-worker.mjs']],
                'INFRA_OR_UNKNOWN_ROLE_RETIRE_FORBIDDEN')
        assert_drain(receipt, identity, now)
        require(receipt.get('routingReferences') == [] and receipt.get('internalReferences') == [], 'OLD_SLOT_STILL_REFERENCED')
        self.save('retire-intent-' + identity['id'][:12] + '.json', {'identity': identity, 'receipt': receipt})
        self.run(['docker', 'update', '--restart=no', identity['id']])
        # Never let docker stop escalate to SIGKILL. Already-proven zero work
        # gets unlimited graceful exit; an operator interruption stays pending.
        self.run(['docker', 'stop', '--time=-1', identity['id']], timeout=120)
        result = public_identity(self.inspect(identity['id']))
        require(not result['running'] and result['restartPolicy'] == 'no', 'RETIREMENT_NOT_OBSERVED')
        return result

    def switch_gateway(self, baseline_sha, new_bytes):
        path = pathlib.Path(GATEWAY)
        require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == baseline_sha, 'GATEWAY_BASELINE_CHANGED')
        original = path.read_bytes()
        backup = self.save('gateway-before-' + baseline_sha[:12] + '.conf', original)
        self.save('gateway-intent-' + sha(new_bytes)[:12] + '.json', {'before': backup, 'afterSha256': sha(new_bytes)})
        self._replace_gateway(new_bytes)
        try:
            self.run(['nginx', '-t'])
            self.run(['systemctl', 'reload', 'nginx'])
        except BaseException:
            self._replace_gateway(original)
            self.run(['nginx', '-t'])
            self.run(['systemctl', 'reload', 'nginx'])
            raise
        return {'beforeSha256': baseline_sha, 'afterSha256': sha(path.read_bytes()),
                'reloadIssued': True, 'publicAcceptance': 'required-not-implied'}

    def _replace_gateway(self, data):
        path = pathlib.Path(GATEWAY)
        fd, raw = tempfile.mkstemp(prefix='.naumi-release-', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as output:
                os.fchmod(output.fileno(), 0o644)
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            os.replace(raw, path)
            folder = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(folder)
            finally:
                os.close(folder)
        finally:
            pathlib.Path(raw).unlink(missing_ok=True)
