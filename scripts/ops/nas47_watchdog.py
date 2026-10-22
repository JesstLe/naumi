#!/usr/bin/env python3
"""47-only NAS read probe and fail-closed recovery of a proven stale SSH session.

No Docker/service restart, media replay, public endpoint, or credential mutation.
"""
import argparse
import contextlib
import dataclasses
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import math
import os
import pathlib
import re
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

LOCKS = ['/opt/naumi-staging/releases/deploy.lock',
         '/opt/naumi-reverse-hub/releases/deploy.lock', '/opt/reference-workbench/deploy.lock']
CONFIG = pathlib.Path('/etc/naumi/nas47-watchdog.json')
STATE = pathlib.Path('/var/lib/naumi-nas47-watchdog')


def private_json(path):
    path = pathlib.Path(path)
    info = path.lstat()
    if path.is_symlink() or info.st_uid != 0 or info.st_mode & 0o077 or info.st_size > 65536:
        raise ValueError('UNSAFE_PRIVATE_FILE')
    return json.loads(path.read_text())


def atomic(path, value):
    path = pathlib.Path(path)
    tmp = path.with_name(path.name + '.new')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(value, f, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def load_config():
    c = private_json(CONFIG)
    machine = hashlib.sha256(pathlib.Path('/etc/machine-id').read_bytes()).hexdigest()
    if (c.get('schemaVersion') != 1 or c.get('hostMachineSha256') != machine
            or c.get('endpoint') != 'http://127.0.0.1:13947'
            or c.get('bridgeEndpoint') != 'http://172.18.0.1:13947'
            or c.get('credentialPath') != '/root/.nas47-garage.json'
            or c.get('user') != 'naumi-nas47' or c.get('uid') != 1001
            or not re.fullmatch(r'[a-z0-9-]{3,63}', c.get('bucket', ''))
            or not re.fullmatch(r'\.naumi-ops/health/nas47-[a-f0-9]{32}\.txt', c.get('probeKey', ''))
            or not re.fullmatch(r'[a-f0-9]{64}', c.get('probeSha256', ''))
            or not re.fullmatch(r'[a-z0-9-]{1,30}', c.get('region', ''))):
        raise ValueError('CONFIG_PIN_MISMATCH')
    return c


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


@dataclasses.dataclass(frozen=True)
class Probe:
    code: str
    status: int = 0
    ms: int = 0

    @property
    def ok(self):
        return self.code == 'ok'


class S3Probe:
    def __init__(self, config, credentials):
        self.config = config
        self.access = credentials.get('accessKeyId') or credentials.get('access_key_id') or credentials.get('accessKey')
        self.secret = credentials.get('secretAccessKey') or credentials.get('secret_access_key') or credentials.get('secretKey')
        if not isinstance(self.access, str) or not isinstance(self.secret, str) or not self.access or not self.secret:
            raise ValueError('INVALID_CREDENTIAL_SHAPE')
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, endpoint, method='GET', data=None):
        c = self.config
        url = endpoint + '/' + c['bucket'] + '/' + urllib.parse.quote(c['probeKey'], safe='/')
        parsed = urllib.parse.urlsplit(url)
        now = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        digest = hashlib.sha256(data or b'').hexdigest()
        headers = {'host': parsed.netloc, 'x-amz-date': now, 'x-amz-content-sha256': digest, 'cache-control': 'no-store'}
        if method == 'PUT':
            headers['content-type'] = 'text/plain'
            headers['if-none-match'] = '*'
        keys = sorted(headers)
        canonical = '\n'.join([method, parsed.path, '', ''.join(k + ':' + headers[k] + '\n' for k in keys), ';'.join(keys), digest])
        scope = now[:8] + '/' + c['region'] + '/s3/aws4_request'
        key = ('AWS4' + self.secret).encode()
        for value in [now[:8], c['region'], 's3', 'aws4_request']:
            key = hmac.new(key, value.encode(), hashlib.sha256).digest()
        string = 'AWS4-HMAC-SHA256\n' + now + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
        signature = hmac.new(key, string.encode(), hashlib.sha256).hexdigest()
        headers['authorization'] = 'AWS4-HMAC-SHA256 Credential=' + self.access + '/' + scope + ', SignedHeaders=' + ';'.join(keys) + ', Signature=' + signature
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        return self.opener.open(request, timeout=3)

    def check(self, endpoint):
        start = time.monotonic()
        try:
            with self.request(endpoint) as response:
                data = response.read(2049)
                valid = response.status == 200 and len(data) <= 2048 and hashlib.sha256(data).hexdigest() == self.config['probeSha256']
                return Probe('ok' if valid else 'content_mismatch', response.status, int((time.monotonic() - start) * 1000))
        except urllib.error.HTTPError as e:
            return Probe('http_' + str(e.code), e.code)
        except (TimeoutError, socket.timeout):
            return Probe('timeout')
        except urllib.error.URLError as e:
            return Probe('timeout' if isinstance(e.reason, (TimeoutError, socket.timeout)) else 'transport_error')
        except OSError:
            return Probe('transport_error')


@dataclasses.dataclass(frozen=True)
class Session:
    pid: int
    start: str
    last_receive_ms: int

    @property
    def identity(self):
        return str(self.pid) + ':' + self.start


def command(args):
    return subprocess.check_output(args, text=True, timeout=4, stderr=subprocess.DEVNULL)


def process_identity(pid, user, uid):
    root = pathlib.Path('/proc') / str(pid)
    status = (root / 'status').read_text()
    cmd = (root / 'cmdline').read_bytes().replace(b'\0', b' ').strip().decode()
    stat = (root / 'stat').read_text().rsplit(')', 1)[1].split()
    exe = os.readlink(root / 'exe')
    if not re.search(r'^Uid:\s+' + str(uid) + r'\s', status, re.M) or cmd != 'sshd: ' + user or exe != '/usr/sbin/sshd':
        raise ValueError('SESSION_IDENTITY_MISMATCH')
    return stat[19]


def read_session(c):
    try:
        listeners = command(['ss', '-H', '-lntp']).splitlines()
        lines = [l for l in listeners if '127.0.0.1:13947 ' in l]
        if len(lines) != 1:
            return None
        pids = re.findall(r'\("sshd",pid=(\d+),', lines[0])
        if len(pids) != 1:
            return None
        pid = int(pids[0])
        start = process_identity(pid, c['user'], c['uid'])
        transport = command(['ss', '-H', '-tinp', 'state', 'established', '( sport = :22 )']).splitlines()
        stats = [transport[i + 1] for i, l in enumerate(transport[:-1]) if re.search(r'pid=' + str(pid) + r',', l)]
        if len(stats) != 1:
            return None
        last = re.search(r'lastrcv:(\d+)', stats[0])
        ack = re.search(r'lastack:(\d+)', stats[0])
        # A large upload can receive ACKs without response data for a while.
        # Either data OR ACK progress protects it from stale-session recovery.
        return Session(pid, start, min(int(last.group(1)), int(ack.group(1)))) if last and ack else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


@contextlib.contextmanager
def release_locks():
    with contextlib.ExitStack() as stack:
        for path in LOCKS:
            f = stack.enter_context(open(path, 'a+'))
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def terminate_session(c, expected):
    # pidfd prevents a recycled PID from ever receiving this signal.
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise ValueError('PIDFD_REQUIRED')
    fd = os.pidfd_open(expected.pid)
    try:
        current = read_session(c)
        if not current or current.identity != expected.identity or current.last_receive_ms < 180000:
            raise ValueError('SESSION_CHANGED_OR_ACTIVE')
        signal.pidfd_send_signal(fd, signal.SIGTERM)
    finally:
        os.close(fd)


def empty_state():
    return {'schemaVersion': 1, 'failures': 0, 'failureKey': '', 'attempts': [], 'lastAttempt': 0, 'lastGood': 0, 'alert': False}


def load_state(path):
    if not path.exists():
        return empty_state()
    s = private_json(path)
    if (s.get('schemaVersion') != 1 or type(s.get('failures')) is not int or not 0 <= s['failures'] <= 100000
            or not isinstance(s.get('attempts'), list) or len(s['attempts']) > 100
            or any(type(x) not in (int, float) or not math.isfinite(x) or x < 0 for x in s['attempts'])
            or any(type(s.get(k)) not in (int, float) or not math.isfinite(s[k]) or s[k] < 0 for k in ['lastAttempt', 'lastGood'])
            or not isinstance(s.get('failureKey'), str)):
        raise ValueError('STATE_INVALID_NO_RECOVERY')
    return s


class Watchdog:
    def __init__(self, config, probe, session=None, locks=release_locks, terminate=None, clock=time.time, sleep=time.sleep, save=lambda s: None):
        self.c, self.probe = config, probe
        self.session = session or (lambda: read_session(config))
        self.locks, self.terminate = locks, terminate or (lambda s: terminate_session(config, s))
        self.clock, self.sleep, self.save = clock, sleep, save

    def reads(self):
        return self.probe.check(self.c['endpoint']), self.probe.check(self.c['bridgeEndpoint'])

    def tick(self, state):
        now = self.clock()
        primary, bridge = self.reads()
        s = dict(state, checkedAt=now, primary=dataclasses.asdict(primary), bridge=dataclasses.asdict(bridge))
        if primary.ok and bridge.ok:
            s.update(failures=0, failureKey='', lastGood=now, alert=False, outcome='healthy')
            self.save(s)
            return s
        current = self.session()
        network = {'timeout', 'transport_error'}
        category = 'bridge_fault' if primary.ok else 'storage_or_credentials' if primary.code not in network else 'transport_unavailable'
        key = category + ':' + (current.identity if current else 'unverified')
        s.update(failures=min(100000, s['failures'] + 1) if s.get('failureKey') == key else 1, failureKey=key,
                 alert=True, outcome=category, session=dataclasses.asdict(current) if current else None)
        if (primary.code not in network or bridge.code not in network or not current
                or current.last_receive_ms < 180000 or s['failures'] < 3):
            self.save(s)
            return s
        # Backward clock or damaged history must not defeat cooldown/rate limits.
        if now < max([s['lastAttempt'], s['lastGood'], *s['attempts']]):
            s['outcome'] = 'clock_hold'
        elif s['lastAttempt'] and now - s['lastAttempt'] < 300:
            s['outcome'] = 'cooldown'
        elif len([t for t in s['attempts'] if now - t < 3600]) >= 2:
            s['outcome'] = 'recovery_limit'
        else:
            try:
                with self.locks():
                    a, b = self.reads()
                    latest = self.session()
                    if a.ok or b.ok or a.code not in network or b.code not in network:
                        s['outcome'] = 'recheck_cancelled'
                    elif not latest or latest.identity != current.identity or latest.last_receive_ms < 180000:
                        s['outcome'] = 'session_changed_or_active'
                    else:
                        s.update(lastAttempt=now, attempts=[t for t in s['attempts'] if now - t < 3600] + [now], outcome='reconnecting')
                        self.save(s)  # Durable budget BEFORE any signal, including interrupted runs.
                        self.terminate(latest)
                        for _ in range(5):
                            self.sleep(2)
                            a, b = self.reads()
                            if a.ok and b.ok:
                                s.update(failures=0, failureKey='', lastGood=self.clock(), alert=False, outcome='recovered')
                                break
                        else:
                            s['outcome'] = 'recovery_unconfirmed'
            except BlockingIOError:
                s['outcome'] = 'release_lock_busy'
            except (OSError, ValueError, subprocess.SubprocessError):
                s['outcome'] = 'recovery_guard_failed'
        self.save(s)
        return s


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--observe', action='store_true')
    args = parser.parse_args()
    c = load_config()
    probe = S3Probe(c, private_json(c['credentialPath']))
    if args.observe:
        a, b = Watchdog(c, probe).reads()
        session = read_session(c)
        print(json.dumps({'observe': True, 'primary': dataclasses.asdict(a), 'bridge': dataclasses.asdict(b), 'session': dataclasses.asdict(session) if session else None}))
        return
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(STATE / 'watchdog.lock', 'a+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        path = STATE / 'status.json'
        s = Watchdog(c, probe, save=lambda value: atomic(path, value)).tick(load_state(path))
        # Journal plus durable status, no secret, cookie, customer key, or remote IP.
        print(('<4>' if s['alert'] else '<6>') + json.dumps({'outcome': s['outcome'], 'alert': s['alert'], 'failures': s['failures'], 'primary': s['primary'], 'bridge': s['bridge']}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError):
        print('<3>{"outcome":"watchdog_configuration_or_state_invalid","alert":true}')
        raise SystemExit(1)
