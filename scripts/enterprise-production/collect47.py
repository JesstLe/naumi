"""Read-only host observation; run over existing protected SSH, JSON to stdout.

No credentials, account names, task payloads or unfiltered Docker Env enter output.
No lifecycle mutation, Docker start/stop, lock acquisition, DB connection or cleanup.
"""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import time

LOCKS = ['/opt/naumi-staging/releases/deploy.lock', '/opt/naumi-reverse-hub/releases/deploy.lock', '/opt/reference-workbench/deploy.lock']


def command(*args):
    return subprocess.check_output(args, text=True, timeout=30).strip()


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def collect():
    root = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
    raw = root.read_bytes()
    state = json.loads(raw)
    if state.get('target') != '47.105.59.142':
        raise ValueError('LIVE_TARGET_MISMATCH')
    docker_root = command('docker', 'info', '--format', '{{.DockerRootDir}}')
    def sample():
        mem = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        free = lambda p: os.statvfs(p).f_bavail * os.statvfs(p).f_frsize // 1048576
        return {'at': stamp(), 'availableMiB': int(mem['MemAvailable'].split()[0]) // 1024, 'totalMiB': int(mem['MemTotal'].split()[0]) // 1024, 'rootFreeMiB': free('/'), 'dockerFreeMiB': free(docker_root), 'load1': os.getloadavg()[0], 'cpus': os.cpu_count()}
    samples = [sample()]
    ids = command('docker', 'ps', '-aq', '--no-trunc').split()
    containers = []
    image_ids = set()
    for ident in ids:
        d = json.loads(command('docker', 'inspect', ident))[0]
        name = d['Name'].lstrip('/')
        if d['State']['Running'] or name.startswith('naumi-enterprise-'):
            role = 'worker' if name.startswith('naumi47-worker-') else 'web' if name.startswith('naumi47-unified-') else 'other'
            containers.append({'name': name, 'id': d['Id'], 'imageId': d['Image'], 'role': role, 'running': d['State']['Running'], 'networkMode': d['HostConfig']['NetworkMode'], 'networkNames': sorted(d['NetworkSettings']['Networks']), 'memoryLimitMiB': d['HostConfig']['Memory'] // 1048576, 'mountRoots': sorted(m['Source'] for m in d['Mounts']), 'ports': d['HostConfig'].get('PortBindings') or {}})
    for ident in command('docker', 'image', 'ls', '-q', '--no-trunc').split():
        image_ids.add(ident)
    images = []
    for ident in sorted(image_ids):
        d = json.loads(command('docker', 'image', 'inspect', ident))[0]
        labels = d['Config'].get('Labels') or {}
        images.append({'id': d['Id'], 'gitRevision': labels.get('org.naumi.web.git-revision') or labels.get('org.opencontainers.image.revision'), 'releaseId': labels.get('org.naumi.workflow.release'), 'productSha256': labels.get('org.naumi.web.product-sha256')})
    lock_data = json.loads(command('lslocks', '--json', '-o', 'PID,PATH')).get('locks', [])
    time.sleep(5)
    samples.append(sample())
    if root.read_bytes() != raw:
        raise ValueError('LIFECYCLE_CHANGED_DURING_OBSERVATION')
    return {'version': 1, 'target': '47.105.59.142', 'evidenceMode': 'live', 'machineIdSha256': hashlib.sha256(pathlib.Path('/etc/machine-id').read_bytes()).hexdigest(), 'observedAt': stamp(), 'lifecycle': {k: state.get(k) for k in ['status', 'phase', 'revision', 'releaseId']}, 'lifecycleSha256': hashlib.sha256(raw).hexdigest(), 'closureFacts': {k: state.get(k) for k in ['legacyDrainProven', 'acceptedTasks', 'agentSessions', 'legacyActiveTicks']}, 'deploymentLocks': [{'path': path, 'held': any(x.get('path') == path for x in lock_data)} for path in LOCKS], 'samples': samples, 'containers': containers, 'images': images, 'volumes': command('docker', 'volume', 'ls', '--format', '{{.Name}}').splitlines(), 'networks': command('docker', 'network', 'ls', '--format', '{{.Name}}').splitlines(), 'candidateComparison': None}


if __name__ == '__main__':
    try:
        print(json.dumps(collect(), sort_keys=True))
    except Exception as exc:
        # Do not forward stderr, command arguments, environment or raw server data.
        print(json.dumps({'error': 'COLLECTION_FAILED', 'type': type(exc).__name__}))
        raise SystemExit(1)
