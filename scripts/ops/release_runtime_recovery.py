"""103 video-goal runtime policy and persistent Web startup admission.

Does not start/stop containers, alter image/env, submit work or restore data.
Unknown boots and partial policy operations require original-operation recovery.
"""
import hashlib
import hmac
import json
import os
import pathlib
import re
import stat
import tempfile

from release47_host import environment, public_identity, require, sha
from release47_controls import _atomic_private
import release47_maintenance as authorization

POLICY = {'Name': 'unless-stopped', 'MaximumRetryCount': 0}
NO_RESTART = {'Name': 'no', 'MaximumRetryCount': 0}
LAUNCHER = b'#!/bin/sh\nset -eu\nmode="$(NODE_OPTIONS= node /release-state/admission.cjs)"\nexport NAUMI_RELEASE_ADMISSION_START="$mode"\nexec "$@"\n'
ADMISSION = r"""'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
try{
 const context=JSON.parse(fs.readFileSync('/release-state/boot-context.json','utf8'));
 if(context.schemaVersion!==1||context.instanceId!==process.env.NAUMI_INSTANCE_ID||context.commit!==process.env.SOURCE_COMMIT||context.buildVersion!==process.env.BUILD_VERSION)throw Error();
 const file='/release-state/activation.json';
 if(!fs.existsSync(file)){process.stdout.write('draining');process.exit(0)}
 if(fs.lstatSync(file).isSymbolicLink())throw Error();
 const marker=JSON.parse(fs.readFileSync(file,'utf8')),secret=process.env.RELEASE_CONTROL_SECRET;
 if(!secret||secret.length<32||Object.keys(marker).sort().join(',')!=='buildVersion,commit,enabled,instanceId,releaseId,schemaVersion,signature'||typeof marker.enabled!=='boolean'||typeof marker.signature!=='string'||!/^[a-f0-9]{64}$/.test(marker.signature))throw Error();
 for(const key of ['schemaVersion','releaseId','instanceId','commit','buildVersion'])if(marker[key]!==context[key])throw Error();
 const text=[marker.schemaVersion,marker.releaseId,marker.instanceId,marker.commit,marker.buildVersion,marker.enabled?'open':'draining'].join('\n');
 const expected=crypto.createHmac('sha256',secret).update(text).digest(),actual=Buffer.from(marker.signature,'hex');
 if(actual.length!==32||!crypto.timingSafeEqual(expected,actual))throw Error();
 process.stdout.write(marker.enabled?'open':'draining');
}catch{console.error('RELEASE_STARTUP_ADMISSION_INVALID');process.exit(1)}
""".encode()


def context(release_id, commit, version, instance):
    require(re.fullmatch('(?:canvas-video-fusion-[A-Za-z0-9_.-]+|release103-refactor-[a-z0-9-]+|release(?:47|103)-site-control-[a-z0-9-]+)', release_id or '') and
            re.fullmatch('[a-f0-9]{40}', commit or '') and re.fullmatch('[0-9]{10,13}', str(version)) and
            re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', instance or ''), 'FIXED_RUNTIME_RECOVERY_CONTEXT_REQUIRED')
    return {'schemaVersion': 1, 'releaseId': release_id, 'instanceId': instance, 'commit': commit, 'buildVersion': str(version)}


def launcher_files(release_id, commit, version, instance):
    data = context(release_id, commit, version, instance)
    return {'launch.sh': LAUNCHER, 'admission.cjs': ADMISSION,
            'boot-context.json': (json.dumps(data, sort_keys=True) + '\n').encode()}


def reader_access(file, mode):
    value = file.stat()
    return stat.S_IMODE(value.st_mode) == mode and (os.name != 'posix' or (value.st_uid, value.st_gid) == (1001, 1001))


def install_launcher(state_dir, *, release_id, commit, version, instance):
    folder = pathlib.Path(state_dir)
    require(folder.is_dir() and not folder.is_symlink() and folder.resolve() == folder and
            reader_access(folder, 0o700), 'PRIVATE_EXISTING_STATE_DIRECTORY_REQUIRED')
    bodies = launcher_files(release_id, commit, version, instance)
    for name, raw in bodies.items():
        file = folder / name
        require(not file.is_symlink(), 'RECOVERY_LAUNCHER_SYMLINK')
        if file.exists():
            require(file.read_bytes() == raw and reader_access(file, 0o500 if name == 'launch.sh' else 0o400),
                    'RECOVERY_LAUNCHER_CHANGED')
        else:
            fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, 'O_NOFOLLOW', 0), 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            if os.name == 'posix': os.chown(file, 1001, 1001)
            file.chmod(0o500 if name == 'launch.sh' else 0o400)
    return {name: sha(raw) for name, raw in bodies.items()}


def verify_launcher(folder, *, release_id, commit, version, instance):
    folder = pathlib.Path(folder)
    require(folder.is_dir() and not folder.is_symlink() and folder.resolve() == folder and
            reader_access(folder, 0o700), 'PRIVATE_EXISTING_STATE_DIRECTORY_REQUIRED')
    for name, raw in launcher_files(release_id, commit, version, instance).items():
        file = folder / name
        require(file.is_file() and not file.is_symlink() and file.read_bytes() == raw and
                reader_access(file, 0o500 if name == 'launch.sh' else 0o400), 'RECOVERY_LAUNCHER_CHANGED')


def write_activation(file, value):
    """Set the reader's ownership before atomic publication, including on crash."""
    require(not file.is_symlink(), 'ACTIVATION_MARKER_SYMLINK')
    fd, temporary = tempfile.mkstemp(prefix='.activation-', dir=file.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            if os.name == 'posix': os.fchown(stream.fileno(), 1001, 1001)
            stream.write((json.dumps(value, sort_keys=True) + '\n').encode()); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, file)
        if os.name == 'posix':
            parent = os.open(file.parent, os.O_RDONLY)
            try: os.fsync(parent)
            finally: os.close(parent)
    finally: pathlib.Path(temporary).unlink(missing_ok=True)


def activation_marker(plan, web, enabled):
    require(type(enabled) is bool and isinstance(plan['releaseSecret'], str) and len(plan['releaseSecret']) >= 32,
            'PRIVATE_RUNTIME_MARKER_SECRET_REQUIRED')
    value = context(plan['releaseId'], plan['commit'], plan['buildVersion'], web['name'])
    text = '\n'.join(str(value[key]) for key in ['schemaVersion', 'releaseId', 'instanceId', 'commit', 'buildVersion'])
    text += '\n' + ('open' if enabled else 'draining')
    return {**value, 'enabled': enabled,
            'signature': hmac.new(plan['releaseSecret'].encode(), text.encode(), hashlib.sha256).hexdigest()}


def require_goal(tx, plan):
    authorization.authorize(plan['authorization'])
    require(authorization.canvas_video_hk(plan['authorization']) and tx.target == '103.30.76.93' and
            tx.stack is not None and tx.lock_fds, 'LOCKED_103_VIDEO_RECOVERY_ONLY')


def rows(tx, plan, state):
    result = []
    for web in plan['webs']:
        slot = state['webs'].get(web['variant'], {})
        if 'running' not in slot: continue
        expected = slot['running']; row = tx.inspect(expected['id']); env = environment(row)
        require(all(public_identity(row)[key] == expected[key] for key in expected if key != 'restartPolicy') and
                row['Image'] == web['image'] and row['Config']['Cmd'] == ['node', 'server.js'] and
                row['Config']['Entrypoint'] == ['/release-state/launch.sh'] and
                env.get('SOURCE_COMMIT') == plan['commit'] and env.get('BUILD_VERSION') == plan['buildVersion'] and
                env.get('NAUMI_INSTANCE_ID') == web['name'] and env.get('NAUMI_VIDEO_WORKER') == '0',
                'RECOVERY_WEB_IDENTITY_CHANGED')
        require(env.get('RELEASE_CONTROL_SECRET') == plan['releaseSecret'], 'RECOVERY_WEB_CONTROL_SECRET_CHANGED')
        mounts = [m for m in row['Mounts'] if m['Destination'] == '/release-state']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and mounts[0]['Source'] == web['stateDir'] and
                mounts[0]['RW'] is True, 'RECOVERY_WEB_STATE_MOUNT_CHANGED')
        verify_launcher(pathlib.Path(web['stateDir']), release_id=plan['releaseId'], commit=plan['commit'],
                        version=plan['buildVersion'], instance=web['name'])
        result.append(('web-' + web['variant'], row))
    if state.get('worker', {}).get('running'):
        expected = state['worker']['running']; row = tx.inspect(expected['id']); env = environment(row)
        require(all(public_identity(row)[key] == expected[key] for key in expected if key != 'restartPolicy') and
                row['Image'] == plan['webs'][0]['image'] and row['Config']['Cmd'] == ['node', 'scripts/video-worker.mjs'] and
                env.get('NAUMI_INSTANCE_ID') == plan['worker']['name'] and env.get('SOURCE_COMMIT') == plan['commit'] and
                env.get('NAUMI_WORKER_STATE_FILE') == '/release-state/worker.json' and
                env.get('NAUMI_APP_ORIGIN') == 'http://' + plan['webs'][0]['name'] + ':3000', 'RECOVERY_CALLER_IDENTITY_CHANGED')
        mounts = [m for m in row['Mounts'] if m['Destination'] == '/release-state']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and mounts[0]['Source'] == plan['worker']['stateDir'] and
                mounts[0]['RW'] is True, 'RECOVERY_CALLER_STATE_MOUNT_CHANGED')
        directory = pathlib.Path(plan['worker']['stateDir'])
        require(directory.is_dir() and not directory.is_symlink() and directory.resolve() == directory and
                reader_access(directory, 0o700), 'RECOVERY_CALLER_STATE_ACCESS_CHANGED')
        result.append(('worker', row))
    if plan.get('mediaWorker'):
        from release_video_media import MediaLifecycle
        media = MediaLifecycle(tx, plan)
        if media.intent.exists(): result.append(('media', media.owned()))
    return result


def set_runtime_policy(tx, plan, state, operation, *, enabled, before_update=None):
    require_goal(tx, plan)
    require(re.fullmatch('[a-f0-9-]{36}', operation or '') and type(enabled) is bool, 'BOUND_RUNTIME_OPERATION_REQUIRED')
    current = rows(tx, plan, state)
    if enabled:
        require(state.get('phase') == 'ACTIVE' and state.get('activation', {}).get('workerResumed') is True and
                state.get('openGateway') and callable(before_update), 'ACTIVE_RUNTIME_PREFLIGHT_REQUIRED')
        require({role for role, _ in current} == {'web-' + w['variant'] for w in plan['webs']} | {'worker', 'media'},
                'ALL_VIDEO_RUNTIME_ROLES_REQUIRED')
        require(all(row['State']['Running'] is True and not row['State'].get('Paused') and
                    not row['State'].get('Restarting') for _, row in current), 'STABLE_RUNNING_RUNTIME_REQUIRED')
        worker_state = pathlib.Path(plan['worker']['stateDir']) / 'worker.json'
        require(worker_state.is_file() and not worker_state.is_symlink() and reader_access(worker_state, 0o600),
                'DURABLE_CALLER_STATE_REQUIRED')
        saved = json.loads(worker_state.read_bytes())
        require(saved.get('paused') is False and saved.get('uncertain') is False and
                saved.get('identity', {}).get('instanceId') == plan['worker']['name'] and
                saved['identity'].get('commit') == plan['commit'] and
                saved['identity'].get('targetInstanceId') == plan['webs'][0]['name'], 'RUNNING_DURABLE_CALLER_STATE_REQUIRED')
    desired = POLICY if enabled else NO_RESTART
    for _, row in current:
        require(row['HostConfig']['RestartPolicy'] in (POLICY, NO_RESTART), 'UNEXPECTED_RUNTIME_RESTART_POLICY')
    journal = tx.folder / ('runtime-policy-' + operation + '.json')
    binding = {'releaseId': plan['releaseId'], 'enabled': enabled,
               'containers': {role: {key: value for key, value in public_identity(row).items() if key != 'restartPolicy'}
                              for role, row in current}}
    if journal.exists():
        require(not journal.is_symlink() and json.loads(journal.read_bytes())['binding'] == binding, 'RUNTIME_POLICY_OPERATION_CHANGED')
    else: _atomic_private(journal, {'binding': binding, 'phase': 'INTENT_RECORDED'})
    if enabled: before_update({role: public_identity(row) for role, row in current})
    # A restart after disarming must return draining, even if policy update loses its reply.
    for web in plan['webs']:
        if not state['webs'].get(web['variant'], {}).get('running'): continue
        file = pathlib.Path(web['stateDir']) / 'activation.json'
        if file.exists():
            require(not file.is_symlink() and json.loads(file.read_bytes()) in
                    [activation_marker(plan, web, True), activation_marker(plan, web, False)], 'ACTIVATION_MARKER_CHANGED')
        write_activation(file, activation_marker(plan, web, enabled))
    identities = {}
    for role, row in current:
        if row['HostConfig']['RestartPolicy'] != desired:
            tx.run(['docker', 'update', '--restart=' + desired['Name'], row['Id']])
        observed = tx.inspect(row['Id'])
        require(all(public_identity(observed)[key] == value for key, value in binding['containers'][role].items()) and
                observed['HostConfig']['RestartPolicy'] == desired, 'RUNTIME_POLICY_NOT_OBSERVED')
        identities[role] = public_identity(observed)
    _atomic_private(journal, {'binding': binding, 'phase': 'ACKNOWLEDGED', 'identities': identities})
    return {'enabled': enabled, 'identities': identities, 'restartPolicy': desired['Name'],
            'databaseRestored': False, 'tasksReplayed': False}


def update_identities(state, result):
    for role, identity in result['identities'].items():
        if role.startswith('web-'):
            slot = state['webs'][role[4:]]; slot['running'] = identity
            if slot.get('verified'): slot['verified']['identity'] = identity
        elif role == 'worker': state['worker']['running'] = identity


def verify_runtime_policy(tx, plan, state):
    require_goal(tx, plan)
    current = rows(tx, plan, state)
    require(len(current) == len(plan['webs']) + 2 and
            all(row['HostConfig']['RestartPolicy'] == POLICY for _, row in current), 'FINAL_RUNTIME_POLICY_MISSING')
    for web in plan['webs']:
        file = pathlib.Path(web['stateDir']) / 'activation.json'
        require(file.is_file() and not file.is_symlink() and json.loads(file.read_bytes()) == activation_marker(plan, web, True),
                'FINAL_STARTUP_ACTIVATION_MISSING')
        require(reader_access(file, 0o600), 'FINAL_STARTUP_ACTIVATION_ACCESS_CHANGED')
    return {'automaticRestartPolicy': 'unless-stopped', 'persistentWebStartupAdmission': 'open', 'roles': len(current)}
