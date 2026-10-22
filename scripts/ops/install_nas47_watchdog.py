#!/usr/bin/env python3
"""Install an independent NAS observer without replacing any application slot.

Run the reviewed fixed source in its evidence directory on 47, under three locks.
The first source transaction creates one small health object, never user media.
"""
import dataclasses
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import uuid

import nas47_watchdog as w

ROOT = pathlib.Path('/opt/naumi-staging/evidence/nas47-watchdog-20261022')
SSH = pathlib.Path('/etc/ssh/sshd_config')
LIB = pathlib.Path('/usr/local/lib/naumi-nas47-watchdog')
UNIT = pathlib.Path('/etc/systemd/system')
NAMES = ['naumi-nas47-watchdog.service', 'naumi-nas47-watchdog.timer']
BEGIN = '# BEGIN NAUMI NAS47 LIVENESS 20261022'
BLOCK = '\n' + BEGIN + '\nMatch User naumi-nas47\n    ClientAliveInterval 30\n    ClientAliveCountMax 3\n# END NAUMI NAS47 LIVENESS 20261022\n'


def run(args, timeout=15):
    return subprocess.check_output(args, stderr=subprocess.PIPE, text=True, timeout=timeout)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def runtime():
    ids = run(['docker', 'ps', '-q']).split()
    rows = json.loads(run(['docker', 'inspect', *ids]))
    return sorted([{'id': r['Id'], 'name': r['Name'], 'image': r['Image'], 'started': r['State']['StartedAt']} for r in rows], key=lambda r: r['id'])


def effective(path, user):
    return run(['/usr/sbin/sshd', '-T', '-f', str(path), '-C', 'user=' + user + ',host=localhost,addr=127.0.0.1'])


def changed_keys(before, after):
    a, b = dict(l.split(' ', 1) for l in before.splitlines()), dict(l.split(' ', 1) for l in after.splitlines())
    return {k for k in set(a) | set(b) if a.get(k) != b.get(k)}


def file(path, data, mode):
    temp = path.with_name(path.name + '.nas47-new')
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def prepare():
    assert pathlib.Path('/etc/machine-id').read_text().strip(), 'MACHINE_REQUIRED'
    assert ROOT.resolve() == pathlib.Path(__file__).resolve().parent.parent, 'FIXED_EVIDENCE_ROOT_REQUIRED'
    assert not (ROOT / 'PREPARED.json').exists(), 'ALREADY_PREPARED_USE_REVIEWED_RESUME'
    assert not SSH.is_symlink() and BEGIN.encode() not in SSH.read_bytes(), 'EXISTING_SSH_LIVENESS_REVIEW_REQUIRED'
    assert not w.CONFIG.exists() and not LIB.exists() and not w.STATE.exists(), 'EXISTING_INSTALLATION_REVIEW_REQUIRED'
    assert not any((UNIT / n).exists() for n in NAMES), 'EXISTING_UNIT_REVIEW_REQUIRED'
    before = runtime()
    nginx = sha(run(['nginx', '-T']).encode())
    original = SSH.read_bytes()
    candidate = original.rstrip(b'\n') + BLOCK.encode()
    file(ROOT / 'sshd.before', original, 0o600)
    file(ROOT / 'sshd.candidate', candidate, 0o600)
    run(['/usr/sbin/sshd', '-t', '-f', str(ROOT / 'sshd.candidate')])
    root_before = effective(SSH, 'root')
    nas_before = effective(SSH, 'naumi-nas47')
    root_after = effective(ROOT / 'sshd.candidate', 'root')
    nas_after = effective(ROOT / 'sshd.candidate', 'naumi-nas47')
    assert root_before == root_after, 'ROOT_SSH_CHANGED'
    assert changed_keys(nas_before, nas_after) <= {'clientaliveinterval', 'clientalivecountmax', 'tcpkeepalive'}, 'NAS_PERMISSIONS_CHANGED'
    assert 'clientaliveinterval 30\n' in nas_after and 'clientalivecountmax 3\n' in nas_after, 'KEEPALIVE_NOT_EFFECTIVE'
    creds = w.private_json('/root/.nas47-garage.json')
    probe_id = uuid.uuid4().hex
    body = ('naumi47 storage health v1\n' + probe_id + '\n').encode()
    config = {'schemaVersion': 1, 'hostMachineSha256': sha(pathlib.Path('/etc/machine-id').read_bytes()),
              'endpoint': 'http://127.0.0.1:13947', 'bridgeEndpoint': 'http://172.18.0.1:13947',
              'credentialPath': '/root/.nas47-garage.json', 'bucket': creds['bucket'], 'region': creds['region'],
              'user': 'naumi-nas47', 'uid': 1001, 'probeKey': '.naumi-ops/health/nas47-' + probe_id + '.txt', 'probeSha256': sha(body)}
    probe = w.S3Probe(config, creds)
    assert probe.check(config['endpoint']).status == 404, 'PROBE_KEY_NOT_FRESH'
    with probe.request(config['endpoint'], method='PUT', data=body) as response:
        assert response.status in [200, 201, 204], 'PROBE_CREATE_FAILED'
    a, b = probe.check(config['endpoint']), probe.check(config['bridgeEndpoint'])
    assert a.ok and b.ok, 'SIGNED_NAS_SHADOW_FAILED'
    session = w.read_session(config)
    assert session, 'CANNOT_PIN_LIVE_NAS_SESSION'
    w.atomic(ROOT / 'config.candidate.json', config)
    record = {'at': time.time(), 'runtime': before, 'nginx': nginx, 'sshBefore': sha(original), 'sshCandidate': sha(candidate),
              'sshMode': SSH.stat().st_mode & 0o777, 'rootEffective': root_before, 'nasEffectiveBefore': nas_before, 'nasEffectiveAfter': nas_after,
              'session': dataclasses.asdict(session), 'credentialSha256': sha(pathlib.Path(config['credentialPath']).read_bytes()),
              'sourceCommit': (ROOT / 'candidate/SOURCE_COMMIT').read_text().strip(),
              'sourceHashes': {n: sha((ROOT / 'candidate' / n).read_bytes()) for n in ['nas47_watchdog.py', 'install_nas47_watchdog.py', *NAMES]},
              'primary': dataclasses.asdict(a), 'bridge': dataclasses.asdict(b)}
    assert re.fullmatch(r'[a-f0-9]{40}', record['sourceCommit']), 'FIXED_SOURCE_REQUIRED'
    w.atomic(ROOT / 'PREPARED.json', record)
    assert runtime() == before and sha(run(['nginx', '-T']).encode()) == nginx, 'BASELINE_MOVED_DURING_PREPARE'
    print(json.dumps({'prepared': True, 'signedNasReads': [a.status, b.status], 'liveSessionPinned': session.pid, 'noBusinessRestart': True}))


def activate():
    assert not (ROOT / 'ACTIVATED.json').exists(), 'ALREADY_ACTIVATED_NO_REPEAT'
    record = w.private_json(ROOT / 'PREPARED.json')
    assert runtime() == record['runtime'] and sha(run(['nginx', '-T']).encode()) == record['nginx'], 'BASELINE_CHANGED'
    assert sha(SSH.read_bytes()) == record['sshBefore'], 'SSH_BASELINE_CHANGED'
    for name, digest in record['sourceHashes'].items():
        assert sha((ROOT / 'candidate' / name).read_bytes()) == digest, 'CANDIDATE_CHANGED'
    c = w.private_json(ROOT / 'config.candidate.json')
    assert sha(pathlib.Path(c['credentialPath']).read_bytes()) == record['credentialSha256'], 'CREDENTIAL_CHANGED'
    assert w.read_session(c).identity == w.Session(**record['session']).identity, 'HEALTHY_SESSION_CHANGED'
    p = w.S3Probe(c, w.private_json(c['credentialPath']))
    assert p.check(c['endpoint']).ok and p.check(c['bridgeEndpoint']).ok, 'STORAGE_UNHEALTHY'
    assert not LIB.exists() and not w.CONFIG.exists() and not w.STATE.exists() and not any((UNIT / n).exists() for n in NAMES), 'INSTALL_DESTINATION_CHANGED'
    LIB.mkdir(mode=0o700)
    w.CONFIG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    w.STATE.mkdir(mode=0o700)
    installed = {}
    try:
        for dest, source, mode in [(LIB / 'nas47_watchdog.py', ROOT / 'candidate/nas47_watchdog.py', 0o700),
                                  (w.CONFIG, ROOT / 'config.candidate.json', 0o600),
                                  *[(UNIT / n, ROOT / 'candidate' / n, 0o644) for n in NAMES]]:
            file(dest, source.read_bytes(), mode)
            installed[str(dest)] = sha(dest.read_bytes())
        # Never retire or reconnect the healthy active session. New sshd children
        # inherit keepalive; the observer also covers the pre-reload old session.
        file(SSH, (ROOT / 'sshd.candidate').read_bytes(), record['sshMode'])
        run(['/usr/sbin/sshd', '-t'])
        assert effective(SSH, 'root') == record['rootEffective'], 'ROOT_SSH_CHANGED'
        assert effective(SSH, 'naumi-nas47') == record['nasEffectiveAfter'], 'NAS_SSH_CHANGED'
        run(['systemctl', 'reload', 'ssh'])
        run(['systemctl', 'daemon-reload'])
        run(['systemd-analyze', 'verify', *[str(UNIT / n) for n in NAMES]])
        run(['systemctl', 'start', 'naumi-nas47-watchdog.service'], timeout=30)
        state = w.private_json(w.STATE / 'status.json')
        assert state['outcome'] == 'healthy' and not state['attempts'], 'FIRST_SHADOW_FAILED'
        assert w.read_session(c).identity == w.Session(**record['session']).identity, 'LIVE_TUNNEL_INTERRUPTED'
        assert runtime() == record['runtime'] and sha(run(['nginx', '-T']).encode()) == record['nginx'], 'BUSINESS_BASELINE_CHANGED'
        run(['systemctl', 'enable', '--now', 'naumi-nas47-watchdog.timer'])
        w.atomic(ROOT / 'ACTIVATED.json', {'at': time.time(), 'installedHashes': installed, 'runtimeUnchanged': True,
                                         'liveSessionUnchanged': True, 'initialState': state, 'heartbeatForNewConnections': True})
        print(json.dumps({'activated': True, 'firstHealth': state['outcome'], 'businessUnchanged': True, 'healthyTunnelUnchanged': True}))
    except BaseException:
        # Program/config rollback only. No DB/media restoration or task replay.
        subprocess.run(['systemctl', 'disable', '--now', 'naumi-nas47-watchdog.timer'], capture_output=True)
        subprocess.run(['systemctl', 'stop', 'naumi-nas47-watchdog.service'], capture_output=True)
        if sha(SSH.read_bytes()) == record['sshCandidate']:
            file(SSH, (ROOT / 'sshd.before').read_bytes(), record['sshMode'])
            run(['/usr/sbin/sshd', '-t'])
            run(['systemctl', 'reload', 'ssh'])
        for dest, digest in installed.items():
            path = pathlib.Path(dest)
            if path.exists() and sha(path.read_bytes()) == digest:
                path.rename(ROOT / ('retired-' + path.name))
        subprocess.run(['systemctl', 'daemon-reload'], capture_output=True)
        w.atomic(ROOT / 'INSTALL_FAILED.json', {'at': time.time(), 'businessUnchanged': runtime() == record['runtime'], 'sshRestored': sha(SSH.read_bytes()) == record['sshBefore']})
        raise


def rollback_check():
    record = w.private_json(ROOT / 'PREPARED.json')
    active = w.private_json(ROOT / 'ACTIVATED.json')
    if (ROOT / 'PROGRAM_UPDATED.json').exists():
        update = w.private_json(ROOT / 'PROGRAM_UPDATED.json')
        path = str(LIB / 'nas47_watchdog.py')
        assert update['previousSha256'] == active['installedHashes'][path], 'UPDATE_PREDECESSOR_MISMATCH'
        active['installedHashes'][path] = update['sha256']
    assert sha(SSH.read_bytes()) == record['sshCandidate'], 'SSH_MODIFIED_SINCE_INSTALL'
    assert sha((ROOT / 'sshd.before').read_bytes()) == record['sshBefore'], 'BACKUP_CHANGED'
    for name, digest in active['installedHashes'].items():
        assert sha(pathlib.Path(name).read_bytes()) == digest, 'INSTALLED_FILE_CHANGED'
    run(['/usr/sbin/sshd', '-t', '-f', str(ROOT / 'sshd.before')])
    assert effective(ROOT / 'sshd.before', 'root') == record['rootEffective'], 'BASELINE_ROOT_CHANGED'
    assert effective(ROOT / 'sshd.before', 'naumi-nas47') == record['nasEffectiveBefore'], 'BASELINE_NAS_CHANGED'
    return record, active


def upgrade_program():
    record, active = rollback_check()
    assert not (ROOT / 'PROGRAM_UPDATE_INTENT.json').exists(), 'PREVIOUS_UPDATE_REVIEW_REQUIRED'
    source = pathlib.Path(__file__).with_name('nas47_watchdog.py')
    commit = pathlib.Path(__file__).with_name('SOURCE_COMMIT').read_text().strip()
    assert re.fullmatch(r'[a-f0-9]{40}', commit), 'FIXED_UPGRADE_SOURCE_REQUIRED'
    before = runtime()
    gateway = sha(run(['nginx', '-T']).encode())
    config = w.load_config()
    session = w.read_session(config)
    assert session, 'NAS_SESSION_NOT_IDENTIFIED'
    target = LIB / 'nas47_watchdog.py'
    previous = target.read_bytes()
    intent = {'at': time.time(), 'sourceCommit': commit, 'previousSha256': sha(previous), 'sha256': sha(source.read_bytes())}
    w.atomic(ROOT / 'PROGRAM_UPDATE_INTENT.json', intent)
    file(ROOT / 'watchdog.before-update.py', previous, 0o600)
    run(['systemctl', 'stop', 'naumi-nas47-watchdog.timer'])
    run(['systemctl', 'stop', 'naumi-nas47-watchdog.service'])
    try:
        assert sha(target.read_bytes()) == intent['previousSha256'], 'WATCHDOG_PROGRAM_CHANGED'
        file(target, source.read_bytes(), 0o700)
        run(['systemctl', 'start', 'naumi-nas47-watchdog.service'], timeout=30)
        state = w.private_json(w.STATE / 'status.json')
        assert state['outcome'] == 'healthy' and not state['attempts'], 'UPDATE_HEALTH_FAILED'
        assert w.read_session(config).identity == session.identity, 'LIVE_NAS_SESSION_CHANGED'
        assert runtime() == before and sha(run(['nginx', '-T']).encode()) == gateway, 'BUSINESS_CHANGED'
        w.atomic(ROOT / 'PROGRAM_UPDATED.json', dict(intent, stateBudgetsRetained=True, healthyTunnelUnchanged=True))
    except BaseException:
        if sha(target.read_bytes()) == intent['sha256']:
            file(target, previous, 0o700)
        w.atomic(ROOT / 'PROGRAM_UPDATE_FAILED.json', dict(intent, reverted=sha(target.read_bytes()) == intent['previousSha256']))
        raise
    finally:
        run(['systemctl', 'start', 'naumi-nas47-watchdog.timer'])
    print(json.dumps({'watchdogProgramUpdated': True, 'businessUnchanged': True, 'healthyTunnelUnchanged': True, 'stateBudgetsRetained': True}))


def rollback():
    record, active = rollback_check()
    assert not (ROOT / 'ROLLED_BACK.json').exists(), 'ROLLBACK_ALREADY_RECORDED'
    before = runtime()
    gateway = sha(run(['nginx', '-T']).encode())
    run(['systemctl', 'disable', '--now', 'naumi-nas47-watchdog.timer'])
    run(['systemctl', 'stop', 'naumi-nas47-watchdog.service'])
    file(SSH, (ROOT / 'sshd.before').read_bytes(), record['sshMode'])
    run(['/usr/sbin/sshd', '-t'])
    run(['systemctl', 'reload', 'ssh'])
    retired = ROOT / ('retired-' + uuid.uuid4().hex)
    retired.mkdir(mode=0o700)
    for name in active['installedHashes']:
        path = pathlib.Path(name)
        path.rename(retired / path.name)
    run(['systemctl', 'daemon-reload'])
    assert runtime() == before and sha(run(['nginx', '-T']).encode()) == gateway, 'BUSINESS_CHANGED'
    # Keep state budgets, private health object, backups, and credentials intact.
    w.atomic(ROOT / 'ROLLED_BACK.json', {'at': time.time(), 'businessUnchanged': True, 'stateRetained': True})
    print(json.dumps({'rolledBack': True, 'businessUnchanged': True}))


def main():
    assert os.geteuid() == 0
    assert len(sys.argv) == 2 and sys.argv[1] in ['prepare', 'activate', 'check-rollback', 'rollback', 'upgrade-program']
    with w.release_locks():
        if sys.argv[1] == 'check-rollback':
            rollback_check()
            print('ROLLBACK_READY_SYNTAX_AND_HASH_CHECK_ONLY')
        else:
            {'prepare': prepare, 'activate': activate, 'rollback': rollback, 'upgrade-program': upgrade_program}[sys.argv[1]]()
    print('THREE_LOCKS_RELEASED')


if __name__ == '__main__':
    main()
