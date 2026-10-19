"""Bounded 120-second read-only host/cgroup window. No test traffic or DB query."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import time


def observe(duration=120, interval=10):
    if not (10 <= duration <= 120 and 5 <= interval <= 30):
        raise ValueError('BOUNDED_WINDOW_REQUIRED')
    command = lambda *a: subprocess.check_output(a, text=True, stderr=subprocess.PIPE, timeout=15).strip()
    canonical = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
    before = canonical.read_bytes()
    if json.loads(before).get('target') != '47.105.59.142':
        raise ValueError('TARGET_MISMATCH')
    containers = []
    for ident in command('docker', 'ps', '-q', '--no-trunc').split():
        c = json.loads(command('docker', 'inspect', ident))[0]
        pid = c['State']['Pid']
        group = next(line.split(':', 2)[2] for line in pathlib.Path('/proc/' + str(pid) + '/cgroup').read_text().splitlines() if line.startswith('0::'))
        path = pathlib.Path('/sys/fs/cgroup') / group.lstrip('/')
        if not path.resolve().is_relative_to(pathlib.Path('/sys/fs/cgroup')):
            raise ValueError('CGROUP_PATH_INVALID')
        containers.append({'id': c['Id'], 'image': c['Image'], 'name': c['Name'].lstrip('/'), 'pid': pid, 'cgroup': str(path)})
    samples = []
    start = time.monotonic()
    while True:
        mem = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        sample = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'availableMiB': int(mem['MemAvailable'].split()[0]) // 1024, 'totalMiB': int(mem['MemTotal'].split()[0]) // 1024, 'swapUsedMiB': (int(mem['SwapTotal'].split()[0]) - int(mem['SwapFree'].split()[0])) // 1024, 'load1': os.getloadavg()[0], 'memoryPressure': pathlib.Path('/proc/pressure/memory').read_text().strip(), 'containers': [], 'errors': []}
        for c in containers:
            try:
                path = pathlib.Path(c['cgroup'])
                values = {name: int((path / name).read_text().strip()) for name in ['memory.current', 'memory.peak', 'pids.current']}
                values['memory.events'] = dict(line.split() for line in (path / 'memory.events').read_text().splitlines())
                sample['containers'].append({'id': c['id'], **values})
            except Exception:
                sample['errors'].append({'containerId': c['id'], 'code': 'CGROUP_SAMPLE_UNAVAILABLE'})
        samples.append(sample)
        elapsed = time.monotonic() - start
        if elapsed >= duration:
            break
        time.sleep(min(interval, duration - elapsed))
    changed = []
    for c in containers:
        try:
            actual = json.loads(command('docker', 'inspect', c['id']))[0]
            if actual['State']['Pid'] != c['pid'] or not actual['State']['Running'] or actual['Image'] != c['image']:
                changed.append(c['id'])
        except Exception:
            changed.append(c['id'])
    inventory_changed = set(command('docker', 'ps', '-q', '--no-trunc').split()) != {c['id'] for c in containers}
    minimum = min(s['availableMiB'] for s in samples)
    return {'version': 1, 'target': '47.105.59.142', 'durationSeconds': time.monotonic() - start, 'sampleCount': len(samples), 'machineIdSha256': hashlib.sha256(pathlib.Path('/etc/machine-id').read_bytes()).hexdigest(), 'canonicalBeforeSha256': hashlib.sha256(before).hexdigest(), 'canonicalAfterSha256': hashlib.sha256(canonical.read_bytes()).hexdigest(), 'containerIdentityChanged': changed, 'runningInventoryChanged': inventory_changed, 'containers': [{k: v for k, v in c.items() if k != 'cgroup'} for c in containers], 'samples': samples, 'minimumAvailableMiB': minimum, 'availableSwingMiB': max(s['availableMiB'] for s in samples) - minimum, 'windowRepresentativeOfPeak': False, 'injectedTraffic': 0, 'sourceWrites': 0, 'decision': 'observation-only; not whole-site capacity clearance'}


if __name__ == '__main__':
    try:
        print(json.dumps(observe(), sort_keys=True))
    except Exception as exc:
        print(json.dumps({'error': 'WINDOW_COLLECTION_FAILED', 'type': type(exc).__name__}))
        raise SystemExit(1)
