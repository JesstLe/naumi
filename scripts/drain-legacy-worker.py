#!/usr/bin/env python3
"""Bootstrap drain for an old HTTP tick caller without a drain endpoint.

Run under the target's Naumi AND Hub deployment locks. Freeze ONLY the exact
legacy Worker, never its App; wait for its TCP exchanges and the authenticated
candidate's shared-DB fences. Leave Worker paused/recoverable on success.
On failed verification unpause it. This tool never kills an App/Worker, resumes
a replacement Worker, switches the gateway, clears a lease or restores a DB.
"""
import argparse, http.client, json, os, pathlib, re, socket, time, urllib.parse, urllib.request


class UnixConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')


class Docker:
    def call(self, method, path):
        connection = UnixConnection('localhost', timeout=20)
        try:
            connection.request(method, '/v1.45' + path)
            response = connection.getresponse(); raw = response.read()
            if response.status >= 400: raise RuntimeError('Docker operation rejected: ' + str(response.status))
            return json.loads(raw) if raw else None
        finally: connection.close()

    def inspect(self, cid): return self.call('GET', '/containers/' + cid + '/json')


def socket_snapshot(pid):
    # Match only this process' socket inode FDs, not every socket in its namespace.
    proc = pathlib.Path('/proc') / str(pid)
    inodes = set()
    for fd in (proc / 'fd').iterdir():
        try: target = os.readlink(fd)
        except FileNotFoundError: continue
        match = re.fullmatch(r'socket:\[(\d+)\]', target)
        if match: inodes.add(match[1])
    result = []
    for family in ['tcp', 'tcp6']:
        for line in (proc / 'net' / family).read_text().splitlines()[1:]:
            fields = line.split()
            if fields[9] in inodes and fields[3] not in ['06', '07', '08', '09', '0A']:
                # Only aggregate states/inodes, no peer addresses or payloads.
                result.append({'inode': fields[9], 'state': fields[3]})
    return result


def held_lock(pid, fd, path):
    proc = pathlib.Path('/proc') / str(pid)
    return os.readlink(proc / 'fd' / str(fd)) == path and 'FLOCK  ADVISORY  WRITE' in (proc / 'fdinfo' / str(fd)).read_text()


def drain(docker, worker_id, app_id, expected_image, status_url, evidence, deadline=180, verify_locks=True):
    if not re.fullmatch(r'[0-9a-f]{64}', worker_id) or not re.fullmatch(r'[0-9a-f]{64}', app_id) or worker_id == app_id:
        raise ValueError('Require two distinct exact container IDs')
    parsed = urllib.parse.urlsplit(status_url)
    if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != '/api/video/worker/drain-status':
        raise ValueError('Require fixed loopback candidate drain-status endpoint')
    evidence = pathlib.Path(evidence)
    if verify_locks:
        owner = json.loads((evidence / 'lock-owner.json').read_text())
        for fd, path in [(8, '/opt/naumi-reverse-hub/releases/deploy.lock'), (9, '/opt/naumi-staging/releases/deploy.lock')]:
            if not held_lock(owner['pid'], fd, path): raise RuntimeError('Deployment locks not held')
    original = docker.inspect(worker_id); app = docker.inspect(app_id)
    if not original['State']['Running'] or original['State']['Paused'] or not app['State']['Running'] or app['State']['Paused']:
        raise RuntimeError('Old worker/app baseline is not active')
    if original['Image'] != expected_image or app['Image'] != expected_image:
        raise RuntimeError('Legacy image changed')
    if original['Config']['Cmd'] != ['node', 'scripts/video-worker.mjs']:
        raise RuntimeError('Container is not the legacy HTTP tick worker')
    app_env = dict(value.split('=', 1) for value in app['Config']['Env'])
    if app_env.get('NAUMI_VIDEO_WORKER') != '0': raise RuntimeError('Old App internal worker must already be off')
    env = dict(value.split('=', 1) for value in original['Config']['Env']); secret = env.get('VIDEO_WORKER_SECRET', '')
    if len(secret.strip()) < 32: raise RuntimeError('Missing existing worker authentication')
    if env.get('NAUMI_APP_ORIGIN', 'http://app:3000').rstrip('/') not in ['http://app:3000', 'http://naumi-staging-app-1:3000']:
        raise RuntimeError('Unexpected legacy worker origin')
    pid = original['State']['Pid']; samples = []; owned_pause = False; successful = False
    try:
        # An API observation failure after acceptance is ambiguous. Record intent
        # before sending, then inspect the exact original process in cleanup.
        owned_pause = True
        docker.call('POST', '/containers/' + worker_id + '/pause')
        until = time.monotonic() + deadline
        while True:
            if verify_locks:
                for fd, path in [(8, '/opt/naumi-reverse-hub/releases/deploy.lock'), (9, '/opt/naumi-staging/releases/deploy.lock')]:
                    if not held_lock(owner['pid'], fd, path): raise RuntimeError('Deployment lock lost')
            current = docker.inspect(worker_id); current_app = docker.inspect(app_id)
            if current['Image'] != expected_image or not current['State']['Paused'] or current['State']['Pid'] != pid:
                raise RuntimeError('Paused worker baseline changed')
            if not current_app['State']['Running'] or current_app['State']['Paused'] or current_app['Image'] != expected_image:
                raise RuntimeError('Old App must stay active')
            connections = socket_snapshot(pid)
            request = urllib.request.Request(status_url, headers={'x-video-worker-secret': secret})
            with urllib.request.urlopen(request, timeout=5) as response:
                if response.status != 200 or 'application/json' not in response.headers.get('content-type', ''): raise RuntimeError('Unknown drain status')
                state = json.load(response)
            if state.get('schema') != 1 or state.get('scope') != 'shared-database' or not isinstance(state.get('counts'), dict): raise RuntimeError('Invalid drain status')
            if set(state['counts']) != {'imageJobs', 'canvasImages', 'videoPolls', 'supplierCosts', 'imagegenItems'}:
                raise RuntimeError('Incomplete drain fence coverage')
            values = [state.get(key) for key in ['activeFences', 'activeTransactions', 'advisoryLocks']]
            if any(type(value) is not int or value < 0 for value in values) or type(state.get('drained')) is not bool:
                raise RuntimeError('Invalid drain counters')
            if any(type(value) is not int or value < 0 for value in state['counts'].values()) or sum(state['counts'].values()) != state['activeFences']:
                raise RuntimeError('Invalid drain fence aggregate')
            if state['drained'] != (sum(values) == 0): raise RuntimeError('Contradictory drain status')
            samples.append({'at': time.time(), 'activeTcp': len(connections), 'state': state})
            if not connections and state['drained']:
                successful = True; break
            if time.monotonic() >= until: raise TimeoutError('Legacy worker drain not verified before deadline')
            time.sleep(0.5)
    finally:
        if owned_pause and not successful:
            latest = docker.inspect(worker_id)
            if latest['Image'] == expected_image and latest['State']['Pid'] == pid and latest['State']['Running'] and latest['State']['Paused']:
                docker.call('POST', '/containers/' + worker_id + '/unpause')
        evidence.mkdir(parents=True, exist_ok=True)
        report = {'schema': 1, 'workerId': worker_id, 'appId': app_id, 'imageId': expected_image,
                  'pausedForHandoff': successful, 'appStopped': False, 'databaseRestored': False, 'samples': samples}
        path = evidence / 'legacy-worker-drain.json'
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as file: json.dump(report, file, indent=2)
    print('LEGACY_WORKER_DRAIN=PASS PAUSED_NO_NEW_TICKS APP_RETAINED TCP_AND_SHARED_DB_FENCES_DRAINED NO_KILL_NO_DB_RESTORE')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for option in ['worker-id', 'app-id', 'expected-image', 'status-url', 'evidence']: parser.add_argument('--' + option, required=True)
    parser.add_argument('--timeout', type=int, default=180); args = parser.parse_args()
    if not 1 <= args.timeout <= 3600: parser.error('timeout must be 1..3600 seconds')
    drain(Docker(), args.worker_id, args.app_id, args.expected_image, args.status_url, args.evidence, args.timeout)
