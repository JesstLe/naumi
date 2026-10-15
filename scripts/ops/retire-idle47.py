#!/usr/bin/env python3
"""Retire an explicit, audited set of idle 47 slots; never switch live traffic.

No deletion, database writes, gateway reload, worker restart or model submission.
The fixture exercises manifest change/rollback without touching live containers.
"""
import argparse
import contextlib
import datetime
import difflib
import fcntl
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path('/opt/naumi-staging/evidence/ssh47-optimization-20261015/retirement-v2')
LOCKS = ['/opt/naumi-staging/releases/deploy.lock',
         '/opt/naumi-reverse-hub/releases/deploy.lock',
         '/opt/reference-workbench/deploy.lock']
ALLOW = {
    'naumi47-blue-geeknowenv': '13056',
    'naumi47-model-family-4f20af1df696': '13057',
    'naumi47-skills-curation-f4b3df127f2f': '13055',
    'naumi47-enterprise-skills-183dff86a8a8': '13054',
    'naumi47-dashboard-87d23d2ccf7a': '13053',
    'naumi47-chat-plan-r4-20261015': '13066',
    'naumi47-r2-image-native-20261015': '13069',
}
PROTECTED = ['naumi47-green-5fc5efe79267', 'naumi47-public-worker-5fc5efe79267',
             'naumi47-geeknow-unlimited-main-20261015',
             'naumi47-geeknow-unlimited-native-20261015',
             'naumi47-r2-image-main-20261015', 'naumi47-auth-login-9f5ad4f05bc7',
             'naumi47-apib-async-main-20261015', 'naumi47-apib-async-native-20261015',
             'naumi-staging-db-1', 'naumi-new-api-postgres', 'naumi-new-api-redis',
             'naumi-new-api-app', 'reverse-hub-new-server']
GATEWAY = pathlib.Path('/etc/nginx/sites-available/reference-workbench')


def run(args, **kwargs):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=75, **kwargs)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def summary(d):
    return {'name': d['Name'].lstrip('/'), 'id': d['Id'], 'image': d['Image'],
            'running': d['State']['Running'], 'startedAt': d['State']['StartedAt'],
            'restartPolicy': d['HostConfig']['RestartPolicy']}


def proposed(original):
    result = json.loads(json.dumps(original))
    for row in result:
        if row['name'] not in ALLOW:
            raise ValueError('Unapproved slot')
        row['running'] = False
        row['restartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
    return result


def restore_copy(original, changed):
    if [(r['id'], r['image']) for r in original] != [(r['id'], r['image']) for r in changed]:
        raise ValueError('Identity changed')
    return json.loads(json.dumps(original))


def fixture(folder):
    folder.mkdir(parents=True, exist_ok=True)
    original = [{'name': n, 'id': 'fixture-' + str(i), 'image': 'fixture-image',
                 'running': True, 'startedAt': 'fixture-start',
                 'restartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}}
                for i, n in enumerate(ALLOW)]
    dump(folder / 'ORIGINAL_FILE.json', original)
    modified = proposed(original)
    dump(folder / 'MODIFIED_FILE.json', modified)
    assert all(not r['running'] and r['restartPolicy']['Name'] == 'no' for r in modified)
    restored = restore_copy(original, modified)
    dump(folder / 'ROLLBACK_COPY.json', restored)
    assert (folder / 'ORIGINAL_FILE.json').read_bytes() == (folder / 'ROLLBACK_COPY.json').read_bytes()
    for bad in [[dict(original[0], name=PROTECTED[0])]]:
        try:
            proposed(bad)
            raise AssertionError('Unapproved slot accepted')
        except ValueError:
            pass
    print('FIXTURE=PASS; MODIFIED=7_STOPPED_RESTART_NO; ROLLBACK=COPY_EXACT; PROTECTED=REJECTED')


@contextlib.contextmanager
def locks():
    with contextlib.ExitStack() as stack:
        for p in LOCKS:
            f = stack.enter_context(open(p, 'a'))
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def connections(d):
    text = run(['nsenter', '-t', str(d['State']['Pid']), '-n', 'ss', '-Hntp', 'state', 'all']).decode()
    return [line for line in text.splitlines()
            if line.split()[0] not in ['LISTEN', 'TIME-WAIT', 'CLOSE']]


def config_file(path):
    # Never scan PostgreSQL/SQLite/media payloads as configuration. Numeric bytes
    # inside database pages are not service dependencies (and reading them adds I/O).
    return not any(part in ['data', 'logs', 'backups', 'node_modules'] for part in path.parts) and (
        path.suffix in ['.json', '.yml', '.yaml', '.toml', '.conf', '.service', '.timer', '.sh', '.py']
        or path.name.endswith('.env') or path.parent == pathlib.Path('/etc/cron.d'))


def dependencies(d, config):
    name = d['Name'].lstrip('/')
    if name not in ALLOW:
        raise ValueError('Not allowlisted')
    env = dict(s.split('=', 1) for s in d['Config']['Env'] if '=' in s)
    assert env.get('NAUMI_VIDEO_WORKER') == '0', 'Worker not disabled'
    assert d['Config']['Cmd'] == ['node', 'server.js'], 'Nonstandard role'
    patterns = [re.escape(name), r'(?<!\d)' + ALLOW[name] + r'(?!\d)']
    for v in d['NetworkSettings']['Networks'].values():
        if v['IPAddress']:
            patterns.append(re.escape(v['IPAddress']) + r'(?!\d)')
    pattern = re.compile('|'.join(patterns))
    assert not pattern.search(config), 'Gateway references slot'
    hits = []
    for root in ['/opt/naumi-staging/config', '/opt/naumi-reverse-hub/config',
                 '/opt/naumi-new-api', '/etc/systemd/system', '/etc/cron.d']:
        for p in pathlib.Path(root).rglob('*'):
            if not p.is_file() or not config_file(p):
                continue
            try:
                if p.stat().st_size < 300000 and pattern.search(p.read_text(errors='replace')):
                    hits.append(str(p))
            except OSError:
                pass
    assert not hits, 'Config references slot: ' + repr(hits)
    data = json.loads(run(['docker', 'inspect', *run(['docker', 'ps', '-q']).decode().split()]))
    for other in data:
        for e in other['Config'].get('Env') or []:
            assert not pattern.search(e.partition('=')[2]), 'Container env references slot'
    assert not connections(d), 'Non-idle TCP connections'


def resources():
    mem = {line.split(':')[0]: int(line.split()[1]) for line in
           pathlib.Path('/proc/meminfo').read_text().splitlines()}
    return {'memAvailableKiB': mem['MemAvailable'], 'swapTotalKiB': mem['SwapTotal'],
            'swapFreeKiB': mem['SwapFree'], 'load': list(os.getloadavg()),
            'runningContainers': len(run(['docker', 'ps', '-q']).decode().split())}


def probe():
    rows = []
    # Read-only, no redirect loops or paid submissions. TLS verification stays on.
    for path in ['/api/health', '/api/version', '/dashboard', '/canvas',
                 '/batchshot/native/workbench']:
        started = time.monotonic()
        req = urllib.request.Request('https://47.105.59.142' + path,
                                     headers={'User-Agent': 'Naumi47-ResourceAudit/1.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read()
            assert response.status == 200, 'Endpoint failure'
            if path == '/api/health':
                assert json.loads(raw).get('db', {}).get('ok') is True
            rows.append({'path': path, 'status': response.status,
                         'seconds': round(time.monotonic() - started, 3), 'bytes': len(raw)})
    return rows


def rollback_execute():
    original = json.loads((ROOT / 'ORIGINAL_FILE.json').read_text())
    changed = json.loads((ROOT / 'MODIFIED_FILE.json').read_text())
    restore_copy(original, changed)
    assert resources()['memAvailableKiB'] > 2 * 1024 * 1024, 'Insufficient restart headroom'
    for row in original:
        d = inspect(row['name'])
        assert (d['Id'], d['Image']) == (row['id'], row['image']), 'Slot identity changed'
    for row in original:
        policy = row['restartPolicy']
        spec = policy['Name']
        if spec == 'on-failure' and policy['MaximumRetryCount']:
            spec += ':' + str(policy['MaximumRetryCount'])
        run(['docker', 'update', '--restart=' + spec, row['id']])
        if row['running'] and not inspect(row['id'])['State']['Running']:
            run(['docker', 'start', row['id']])
    print('ROLLBACK_LIVE=PASS; ORIGINAL_RESTART_POLICY_AND_RUNNING_STATE_RESTORED')


def apply():
    ROOT.mkdir(parents=True, exist_ok=True)
    ROOT.chmod(0o700)
    assert not (ROOT / 'ORIGINAL_FILE.json').exists(), 'Existing transaction: inspect rather than rerun'
    baseline_gateway = GATEWAY.read_bytes()
    config = run(['nginx', '-T']).decode()
    baseline_protected = [summary(inspect(n)) for n in PROTECTED]
    assert all(r['running'] for r in baseline_protected)
    original = [summary(inspect(n)) for n in ALLOW]
    assert all(r['running'] for r in original)
    dump(ROOT / 'ORIGINAL_FILE.json', original)
    dump(ROOT / 'MODIFIED_FILE.json', proposed(original))
    (ROOT / 'gateway.original.conf').write_bytes(baseline_gateway)
    (ROOT / 'NGINX_ORIGINAL_SHA256.txt').write_text(sha(baseline_gateway) + '\n')
    (ROOT / 'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(
        (ROOT / 'ORIGINAL_FILE.json').read_text().splitlines(True),
        (ROOT / 'MODIFIED_FILE.json').read_text().splitlines(True),
        fromfile='ORIGINAL_FILE.json', tofile='MODIFIED_FILE.json')))
    before = resources()
    probes = [{'stage': 'baseline', 'rows': probe()}]
    print('BASELINE=PASS; RUNNING=' + str(before['runningContainers']) +
          '; LIVE_ENDPOINTS=5/5; GATEWAY=' + sha(baseline_gateway), flush=True)
    for sample in range(4):
        for row in original:
            d = inspect(row['id'])
            assert d['Image'] == row['image'] and d['State']['Running']
            dependencies(d, config)
        assert GATEWAY.read_bytes() == baseline_gateway
        print('IDLE_SAMPLE=' + str(sample + 1) + '; CANDIDATES=7; CONNECTIONS=0', flush=True)
        if sample < 3:
            time.sleep(15)
    changed = []
    try:
        for row in original:
            assert GATEWAY.read_bytes() == baseline_gateway
            d = inspect(row['id'])
            dependencies(d, run(['nginx', '-T']).decode())
            run(['docker', 'update', '--restart=no', row['id']])
            changed.append(row)
            run(['docker', 'stop', '--time=45', row['id']])
            stopped = inspect(row['id'])
            assert not stopped['State']['Running'] and stopped['HostConfig']['RestartPolicy']['Name'] == 'no'
            assert stopped['State']['ExitCode'] != 137, 'Slot required force kill'
            probes.append({'stage': row['name'], 'rows': probe()})
            assert [summary(inspect(n)) for n in PROTECTED] == baseline_protected, 'Protected slot changed'
            print('RETIRED=' + row['name'] + '; ENDPOINTS=5/5; PROTECTED=EXACT', flush=True)
            time.sleep(3)
        actual = [summary(inspect(r['id'])) for r in original]
        # Stopped container preserves its original StartedAt; match all saved fields.
        assert actual == proposed(original)
        for i in range(6):
            probes.append({'stage': 'post-' + str(i), 'rows': probe()})
            assert GATEWAY.read_bytes() == baseline_gateway
            assert [summary(inspect(n)) for n in PROTECTED] == baseline_protected
            if i < 5:
                time.sleep(10)
        after = resources()
        result = {'timeUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'before': before, 'after': after, 'retired': actual,
                  'protected': baseline_protected, 'gatewaySHA256': sha(baseline_gateway),
                  'gatewayUnchanged': True, 'protectedUnchanged': True, 'probes': probes,
                  'databaseWrites': 0, 'deletions': 0, 'supplierSubmissions': 0}
        dump(ROOT / 'result.json', result)
        print('MODIFIED=PASS; STOPPED=7; RESTART=no; LIVE_ENDPOINTS=5/5; GATEWAY_AND_PROTECTED=EXACT; DELETIONS=0', flush=True)
        print('RESOURCE_BEFORE=' + json.dumps(before), flush=True)
        print('RESOURCE_AFTER=' + json.dumps(after), flush=True)
    except Exception:
        # Only this transaction's explicit slots are restored, never gateway/DB.
        dump(ROOT / 'failed-changes.json', changed)
        for row in reversed(changed):
            d = inspect(row['id'])
            assert d['Image'] == row['image']
            run(['docker', 'update', '--restart=' + row['restartPolicy']['Name'], row['id']])
            if row['running'] and not d['State']['Running']:
                run(['docker', 'start', row['id']])
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['fixture', 'apply', 'rollback-copy', 'rollback-execute'])
    parser.add_argument('--fixture-dir', type=pathlib.Path, default=ROOT / 'fixture')
    args = parser.parse_args()
    if args.mode == 'fixture':
        fixture(args.fixture_dir)
    elif args.mode == 'rollback-copy':
        original = json.loads((ROOT / 'ORIGINAL_FILE.json').read_text())
        changed = json.loads((ROOT / 'MODIFIED_FILE.json').read_text())
        dump(ROOT / 'ROLLBACK_COPY.json', restore_copy(original, changed))
        assert (ROOT / 'ROLLBACK_COPY.json').read_bytes() == (ROOT / 'ORIGINAL_FILE.json').read_bytes()
        print('ROLLBACK=PASS; COPY=EXACT; LIVE_RESTARTS=0; MODIFIED_FILE=UNCHANGED')
    else:
        with locks():
            if args.mode == 'apply':
                apply()
            else:
                rollback_execute()


if __name__ == '__main__':
    main()
