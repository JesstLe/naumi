"""Locked media-sidecar lifecycle for the canvas-video 103 release only.

No DB credentials, business media mounts, public ports, or implicit deletion.
An uncertain create/start is re-observed by exact intent and container identity.
"""
import json
import os
import pathlib
import re
import secrets
import time

from release47_host import environment, public_identity, require, sha
from release47_controls import _atomic_private
import release47_maintenance as authorization

CAPS = {'SYS_CHROOT', 'SETUID', 'SETGID', 'CHOWN', 'DAC_OVERRIDE', 'FOWNER'}
FORBIDDEN = {'DATABASE_URL', 'SETTINGS_SECRET', 'VIDEO_WORKER_SECRET', 'R2_SECRET_ACCESS_KEY',
             'S3_SECRET_ACCESS_KEY', 'OPENAI_API_KEY', 'VIDEO_API_KEY'}
REMOTE = r"""
const action=process.argv[1];
if(!['health','drain','resume'].includes(action))throw Error('CONTROL_ACTION');
const r=await fetch('http://127.0.0.1:3001/'+action,{method:action==='health'?'GET':'POST',
 headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET},signal:AbortSignal.timeout(5000)});
if(!r.ok)throw Error('MEDIA_CONTROL_HTTP_'+r.status);
console.log(JSON.stringify(await r.json()));
"""


def validate_spec(plan):
    require(authorization.canvas_video_hk(plan.get('authorization', {})) and plan['target'] == '103.30.76.93',
            'MEDIA_VIDEO_GOAL_ONLY')
    authorization.authorize(plan['authorization'])
    spec = plan.get('mediaWorker', {})
    require(set(spec) == {'name', 'image', 'memoryMiB', 'cpu'} and
            spec['name'] == 'naumi-video-media-' + plan['commit'][:12] and
            spec['image'] == plan['webs'][0]['image'] and plan['webs'][0]['variant'] == 'main',
            'FIXED_MAIN_MEDIA_IDENTITY_REQUIRED')
    require(type(spec['memoryMiB']) is int and 3072 <= spec['memoryMiB'] <= 4096 and
            type(spec['cpu']) in (int, float) and 0 < spec['cpu'] <= 2, 'BOUNDED_MEDIA_RESOURCES_REQUIRED')
    require(spec['name'] not in [web['name'] for web in plan['webs']] and
            spec['name'] != plan['worker']['name'], 'DISTINCT_MEDIA_CONTAINER_REQUIRED')
    return spec


def apply_binding(env, args, binding, folder, commit):
    require(set(binding) == {'name', 'commit', 'secret', 'scratch'} and binding['commit'] == commit and
            binding['name'] == 'naumi-video-media-' + commit[:12] and
            re.fullmatch('[a-f0-9]{64}', binding['secret']), 'PINNED_PRIVATE_MEDIA_BINDING_REQUIRED')
    scratch = pathlib.Path(binding['scratch'])
    require(scratch.is_dir() and not scratch.is_symlink() and scratch.resolve() == folder.resolve() / 'media-scratch',
            'PRIVATE_RELEASE_MEDIA_SCRATCH_REQUIRED')
    env.update(MEDIA_WORKER_ORIGIN='http://' + binding['name'] + ':3001',
               MEDIA_WORKER_SECRET=binding['secret'], MEDIA_JOB_DIR='/scratch')
    args += ['--mount', 'type=bind,src=' + str(scratch) + ',dst=/scratch']


class MediaLifecycle:
    def __init__(self, tx, plan):
        self.tx, self.plan, self.spec = tx, plan, validate_spec(plan)
        require(tx.stack is not None and tx.target == '103.30.76.93', 'MEDIA_WHOLE_RELEASE_LOCK_REQUIRED')
        self.intent = tx.folder / 'media-intent.json'
        self.scratch = tx.folder / 'media-scratch'
        self.env_file = tx.folder / 'media-worker.env'

    def load(self):
        require(self.intent.is_file() and not self.intent.is_symlink(), 'MEDIA_CREATE_INTENT_REQUIRED')
        require(not self.intent.stat().st_mode & 0o077, 'PRIVATE_MEDIA_INTENT_REQUIRED')
        value = json.loads(self.intent.read_bytes())
        require(value['owner'] == self.plan['releaseId'] and value['spec'] == self.spec and
                value['commit'] == self.plan['commit'] and value['scratch'] == str(self.scratch),
                'MEDIA_INTENT_IDENTITY_CHANGED')
        require(self.env_file.is_file() and not self.env_file.is_symlink() and
                not self.env_file.stat().st_mode & 0o077 and sha(self.env_file.read_bytes()) == value['envSha256'],
                'MEDIA_PRIVATE_ENV_CHANGED')
        return value

    def owned(self):
        intent = self.load()
        row = self.tx.inspect(self.spec['name'])
        labels, host = row['Config'].get('Labels', {}), row['HostConfig']
        require(row['Image'] == self.spec['image'] and row['Name'].lstrip('/') == self.spec['name'] and
                labels.get('naumi.media.release') == self.plan['releaseId'] and
                labels.get('naumi.media.evidence') == str(self.tx.folder), 'MEDIA_CONTAINER_OWNER_CHANGED')
        require(row['Config']['Entrypoint'] == ['node'] and row['Config']['Cmd'] == ['scripts/video-media-worker.mjs'] and
                row['Config']['User'] == '0:0', 'MEDIA_ENTRYPOINT_CHANGED')
        require(host['ReadonlyRootfs'] is True and host['Privileged'] is False and not host.get('PortBindings') and
                set(host['CapDrop']) == {'ALL'} and
                {value.removeprefix('CAP_') for value in host['CapAdd']} == CAPS and
                'no-new-privileges' in {value.split(':')[0] for value in host['SecurityOpt']} and host['Memory'] == self.spec['memoryMiB'] * 1048576 and
                host['MemorySwap'] == host['Memory'] and host['PidsLimit'] == 160,
                'MEDIA_ISOLATION_OR_RESOURCE_BINDING_CHANGED')
        require(sorted(row['NetworkSettings']['Networks']) == [intent['network']], 'MEDIA_NETWORK_CHANGED')
        mounts = [m for m in row['Mounts'] if m['Type'] == 'bind']
        require(len(mounts) == 1 and mounts[0]['Source'] == str(self.scratch) and
                mounts[0]['Destination'] == '/scratch' and mounts[0]['RW'] is True,
                'MEDIA_MOUNTS_CHANGED')
        require(all(m['Destination'] in {'/scratch', '/tmp', '/tmp/naumi-media-sandbox', '/data'} for m in row['Mounts']),
                'MEDIA_UNEXPECTED_VOLUME')
        require(set(host['Tmpfs']) == {'/tmp', '/tmp/naumi-media-sandbox', '/data'} and
                'noexec' in host['Tmpfs']['/tmp'].split(',') and
                'exec' in host['Tmpfs']['/tmp/naumi-media-sandbox'].split(','), 'MEDIA_TMPFS_CHANGED')
        env = environment(row)
        require(not FORBIDDEN.intersection(env) and 'MEDIA_WORKER_FIXTURE_OWNER' not in env and
                env.get('SOURCE_COMMIT') == self.plan['commit'] and env.get('NODE_ENV') == 'production' and
                env.get('MEDIA_JOB_DIR') == '/scratch' and
                sha(env.get('MEDIA_WORKER_SECRET', '').encode()) == intent['secretSha256'], 'MEDIA_ENV_CHANGED')
        if intent.get('id'):
            require(row['Id'] == intent['id'], 'MEDIA_CONTAINER_REPLACED')
        return row

    def health(self):
        row = self.owned()
        require(row['State']['Running'] and not row['State'].get('Paused') and not row['State'].get('Restarting'),
                'MEDIA_RUNNING_STATE_UNKNOWN')
        value = json.loads(self.tx.run(['docker', 'exec', row['Id'], 'node', '--input-type=module', '-e', REMOTE, 'health']))
        require(value.get('ok') is True and value.get('sandbox') is True and
                value.get('version') == self.plan['commit'] and type(value.get('draining')) is bool and
                all(type(value.get(key)) is int and value[key] >= 0 for key in ('running', 'queued', 'terminal')),
                'REAL_MEDIA_HEALTH_REQUIRED')
        return value

    def mode(self, action):
        require(action in ('drain', 'resume'), 'MEDIA_CONTROL_ACTION_REQUIRED')
        desired = action == 'drain'
        value = self.health()
        if value['draining'] != desired:
            row = self.owned()
            self.tx.run(['docker', 'exec', row['Id'], 'node', '--input-type=module', '-e', REMOTE, action])
            value = self.health()
        require(value['draining'] is desired, 'MEDIA_CONTROL_NOT_OBSERVED')
        if desired:
            require(value['running'] == value['queued'] == value['terminal'] == 0, 'MEDIA_JOBS_NOT_DRAINED')
        return value

    def prepare(self):
        if self.intent.exists():
            row = self.owned()
            value = self.load()
            if not value.get('id'):
                value['id'] = row['Id']; _atomic_private(self.intent, value)
            # Never restart an exited or previously running worker after an
            # ambiguous operation: its job ownership needs a separate audit.
            if not row['State']['Running']:
                require(row['State']['Status'] == 'created', 'MEDIA_START_NOT_PROVEN_UNEXECUTED')
                self.tx.run(['docker', 'start', row['Id']])
        else:
            existing = self.tx.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + self.spec['name'] + '$']).decode().strip()
            require(not existing and not self.env_file.exists() and not self.scratch.exists(), 'MEDIA_NAME_OR_PATH_ALREADY_EXISTS')
            old = self.tx.pin(self.plan['webs'][0]['source'])
            networks = sorted(old['NetworkSettings']['Networks']); require(networks, 'MEDIA_SOURCE_NETWORK_REQUIRED')
            info = json.loads(self.tx.run(['docker', 'image', 'inspect', self.spec['image']]))[0]
            require(environment(info).get('SOURCE_COMMIT') == self.plan['commit'], 'MEDIA_IMAGE_SOURCE_MISMATCH')
            self.scratch.mkdir(mode=0o700); os.chown(self.scratch, 1001, 1001)
            secret = secrets.token_hex(32)
            descriptor = os.open(self.env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'w') as output:
                output.write('MEDIA_WORKER_SECRET=' + secret + '\nMEDIA_JOB_DIR=/scratch\n')
            value = {'owner': self.plan['releaseId'], 'spec': self.spec, 'commit': self.plan['commit'],
                     'network': networks[0], 'scratch': str(self.scratch),
                     'envSha256': sha(self.env_file.read_bytes()), 'secretSha256': sha(secret.encode())}
            _atomic_private(self.intent, value)
            args = ['docker', 'create', '--name', self.spec['name'], '--restart=no',
                    '--label', 'naumi.media.release=' + self.plan['releaseId'],
                    '--label', 'naumi.media.evidence=' + str(self.tx.folder),
                    '--network', networks[0], '--user', '0:0', '--read-only', '--cap-drop', 'ALL']
            for cap in sorted(CAPS): args += ['--cap-add', cap]
            args += ['--security-opt', 'no-new-privileges', '--pids-limit=160',
                     '--memory=' + str(self.spec['memoryMiB']) + 'm', '--memory-swap=' + str(self.spec['memoryMiB']) + 'm',
                     '--cpus=' + str(self.spec['cpu']), '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777',
                     '--tmpfs', '/tmp/naumi-media-sandbox:rw,exec,nosuid,nodev,size=2g,mode=755',
                     '--tmpfs', '/data:rw,size=1m,mode=755', '--mount', 'type=bind,src=' + str(self.scratch) + ',dst=/scratch',
                     '--env-file', str(self.env_file), '--entrypoint', 'node', self.spec['image'], 'scripts/video-media-worker.mjs']
            identifier = self.tx.run(args).decode().strip(); require(re.fullmatch('[a-f0-9]{64}', identifier), 'MEDIA_CREATE_UNKNOWN')
            value['id'] = identifier; _atomic_private(self.intent, value)
            self.owned(); self.tx.run(['docker', 'start', identifier])
        deadline = time.monotonic() + 30
        while True:
            try:
                self.health(); break
            except Exception:
                if time.monotonic() >= deadline: raise
                time.sleep(.5)
        self.mode('drain')
        return public_identity(self.owned())

    def binding(self):
        self.health()
        env = environment(self.owned())
        return {'name': self.spec['name'], 'commit': self.plan['commit'],
                'secret': env['MEDIA_WORKER_SECRET'], 'scratch': str(self.scratch)}

    def verify_app(self, row):
        binding = self.binding(); env = environment(row)
        require(env.get('MEDIA_WORKER_ORIGIN') == 'http://' + binding['name'] + ':3001' and
                env.get('MEDIA_WORKER_SECRET') == binding['secret'] and env.get('MEDIA_JOB_DIR') == '/scratch',
                'APP_MEDIA_BINDING_CHANGED')
        mounts = [m for m in row['Mounts'] if m['Destination'] == '/scratch']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and mounts[0]['Source'] == binding['scratch'] and
                mounts[0]['RW'] is True, 'APP_MEDIA_SCRATCH_CHANGED')

    def rollback(self):
        if not self.intent.exists():
            require(not self.tx.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + self.spec['name'] + '$']).decode().strip(),
                    'MEDIA_WITHOUT_CREATE_INTENT')
            return {'mediaNotCreated': True, 'scratchDeleted': False}
        row = self.owned()
        if not row['State']['Running']:
            require(row['State']['Status'] == 'created', 'MEDIA_STOPPED_STATE_UNKNOWN')
            return {'mediaNeverStarted': True, 'retainedForCandidateCleanup': True,
                    'identity': public_identity(row), 'scratchDeleted': False}
        self.mode('drain')
        # Keep the worker and scratch while retained candidate Apps still point
        # to them. No teardown can erase a later accepted job or retained output.
        return {'mediaDrained': True, 'retainedForCandidateCleanup': True,
                'identity': public_identity(self.owned()), 'scratchDeleted': False}
