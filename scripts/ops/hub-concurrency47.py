"""47-only, configuration-only capacity release; no App or engine replacement.

Hold both deployment locks. Reject new admissions briefly, drain all accepted
work, update the file in-place (a Docker bind mount), then restart only the Hub
Node child under Supervisor. Never change task digests or replay old work.
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
import signal
import sqlite3
import struct
import subprocess
import time
import urllib.error
import urllib.request
import urllib.parse
import uuid

ROOT = pathlib.Path('/opt/naumi-staging/evidence/jimeng-concurrency47-20261015')
CONFIG = pathlib.Path('/opt/naumi-reverse-hub/config/hub.json')
CONTAINER = 'reverse-hub-new-server'
URL = 'http://127.0.0.1:39133'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def db():
    c = sqlite3.connect('file:/opt/naumi-reverse-hub/data/hub.sqlite?mode=ro', uri=True)
    c.row_factory = sqlite3.Row
    return c


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def api(path, body=None, key=None, method=None):
    request = urllib.request.Request(URL + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + (key or ADMIN), 'Content-Type': 'application/json'},
        method=method)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def inflight():
    with contextlib.closing(db()) as c:
        return [dict(r) for r in c.execute("SELECT id,engine,state,attempts,upstream_id FROM tasks WHERE state NOT IN ('succeeded','failed','cancelled')")]


def processes():
    # Only executable names and start ticks, never /proc/environ or full args.
    code = '''import pathlib,json
rows=[]
for p in pathlib.Path('/proc').glob('[0-9]*'):
 try:
  args=(p/'cmdline').read_bytes().split(b'\\0')
  if len(args)>1 and args[0].endswith(b'/node') and args[1] in [b'dist/src/main.js',b'dist/index.js']:
   rows.append({'pid':int(p.name),'entry':args[1].decode(),'ticks':(p/'stat').read_text().rsplit(')',1)[1].split()[19]})
 except (FileNotFoundError,ProcessLookupError,PermissionError): pass
print(json.dumps(rows))'''
    return json.loads(run(['docker', 'exec', CONTAINER, 'python3', '-c', code]))


def fixture(mode, raw):
    command = ['docker', 'exec', '-e', 'FIXTURE_CONFIG=' + raw.decode(), CONTAINER,
               'node', '/tmp/hub-concurrency-fixture.mjs', mode]
    result = subprocess.run(command, text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    print(result.stdout.strip(), flush=True)
    return {'command': 'node /tmp/hub-concurrency-fixture.mjs ' + mode,
            'input': json.loads(raw), 'output': result.stdout.strip(), 'exit_status': result.returncode}


def write_bound(raw):
    # Retain inode, mode and owner so the existing read-only container mount sees
    # exactly the same bytes. The scheduler is paused while this is performed.
    with CONFIG.open('r+b') as f:
        f.write(raw)
        f.truncate()
        f.flush()
        os.fsync(f.fileno())
    mounted = run(['docker', 'exec', CONTAINER, 'cat', '/etc/reverse-hub/hub.json']).encode()
    assert json.loads(mounted) == json.loads(raw)


def drain_restart(target, expected):
    assert sha(CONFIG.read_bytes()) == expected, 'Configuration changed; refresh baseline'
    before = processes()
    hubs = [p for p in before if p['entry'] == 'dist/src/main.js']
    assert len(hubs) == 1
    with contextlib.closing(db()) as c:
        previous = dict(c.execute("SELECT key,value FROM settings WHERE key LIKE 'disabled:%'").fetchall())
    enabled = [e['id'] for e in json.loads(CONFIG.read_bytes())['engines']
               if e['enabled'] and previous.get('disabled:' + e['id']) != '1']
    paused = []
    try:
        # A config-only restart changes the legacy spec digest. Therefore every
        # accepted task (including queued and reconciling) must finish first.
        for attempt in range(25):
            if any(t['state'] == 'queued' for t in inflight()):
                time.sleep(3)
                continue
            for engine in enabled:
                api('/admin/api/engines/' + engine + '/enabled', {'enabled': False})
                paused.append(engine)
            if any(t['state'] == 'queued' for t in inflight()):
                for engine in paused:
                    api('/admin/api/engines/' + engine + '/enabled', {'enabled': True})
                paused.clear()
                time.sleep(3)
                continue
            break
        else:
            raise RuntimeError('Queue did not reach a zero-queued admission boundary')
        deadline = time.monotonic() + 180
        while inflight() or api('/admin/api/scheduling')['global']['active']:
            if time.monotonic() > deadline:
                raise RuntimeError('Drain timed out; original capacity retained')
            time.sleep(2)
        assert not inflight()
        assert sha(CONFIG.read_bytes()) == expected
        write_bound(target)
        # Supervisor restarts an unexpected SIGHUP exit. Only the drained Hub
        # process is signalled; Jimeng/Flow/Buddy/browser children stay alive.
        subprocess.check_call(['docker', 'exec', CONTAINER, 'kill', '-HUP', str(hubs[0]['pid'])])
        deadline = time.monotonic() + 50
        while True:
            try:
                after = processes()
                newhub = [p for p in after if p['entry'] == 'dist/src/main.js']
                if len(newhub) == 1 and newhub[0] != hubs[0]:
                    scheduling = api('/admin/api/scheduling')
                    assert scheduling['global']['active'] == 0
                    break
            except (OSError, urllib.error.URLError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('Hub child restart did not become healthy')
            time.sleep(1)
        assert [p for p in before if p['entry'] != 'dist/src/main.js'] == [p for p in after if p['entry'] != 'dist/src/main.js']
        assert not inflight()
        return {'before_processes': before, 'after_processes': after, 'drained': True,
                'engine_processes_unchanged': True, 'scheduling_before_resume': scheduling}
    finally:
        for engine in paused:
            api('/admin/api/engines/' + engine + '/enabled', {'enabled': True})


def probes():
    key = api('/admin/api/keys', {'name': 'capacity47-three-live-probes', 'providers': ['jimeng']})
    ids = []
    peak_running = peak_slots = 0
    try:
        for i in range(3):
            response = api('/v1/tasks', {'operation': 'image.generate', 'provider': 'jimeng',
                'model': 'jimeng-image-5.0-pro', 'operation_id': 'capacity47-' + str(uuid.uuid4()),
                'parameters': {'prompt': 'A plain white ceramic mug on a light gray studio background. No text.',
                               'resolution': '1.5k', 'ratio': '1:1', 'n': 1}}, key=key['key'])
            ids.append(response['id'])
        deadline = time.monotonic() + 420
        observations = []
        while True:
            tasks = [api('/v1/tasks/' + task, key=key['key']) for task in ids]
            running = sum(t['state'] == 'running' and bool(t['upstream_task_id']) for t in tasks)
            slots = api('/admin/api/scheduling')['engines']
            active = next(e['active'] for e in slots if e['id'] == 'jimeng')
            peak_running = max(peak_running, running)
            peak_slots = max(peak_slots, active)
            observations.append({'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                 'states': [t['state'] for t in tasks], 'running': running, 'active_slots': active})
            if all(t['state'] in ['succeeded', 'failed', 'cancelled'] for t in tasks):
                break
            if time.monotonic() > deadline:
                raise RuntimeError('Live probe deadline; accepted IDs retained, no resubmit')
            time.sleep(3)
        records = []
        for task in tasks:
            assert task['state'] == 'succeeded', {'id': task['id'], 'state': task['state'], 'error': task['error']}
            assert task['attempts'] == 1
            items = task['result']['data']
            assert len(items) == 1
            artifact = pathlib.Path(items[0]['artifact'])
            assert len(artifact.parts) == 1
            image = pathlib.Path('/opt/naumi-reverse-hub/data/media') / artifact
            raw = image.read_bytes()
            meta = json.loads(run(['docker', 'exec', CONTAINER, 'node', '--input-type=module', '-e',
                "import sharp from 'sharp';const m=await sharp(process.argv[1]).metadata();console.log(JSON.stringify({width:m.width,height:m.height,format:m.format}));",
                '/var/lib/reverse-hub/media/' + artifact.name]))
            width, height = meta['width'], meta['height']
            signed = urllib.parse.urlsplit(items[0]['url'])
            with urllib.request.urlopen(URL + signed.path + '?' + signed.query, timeout=30) as response:
                assert sha(response.read()) == sha(raw)
            records.append({'id': task['id'], 'state': task['state'], 'attempts': task['attempts'],
                            'bytes': len(raw), 'width': width, 'height': height, 'sha256': sha(raw)})
        assert peak_running >= 2, 'No real upstream execution overlap observed'
        dump(ROOT / 'live-probes.json', {'peak_running': peak_running, 'peak_slots': peak_slots,
                                         'tasks': records, 'observations': observations})
        print(f'LIVE=PASS; PROBES=3; SUCCEEDED=3; PEAK_RUNNING={peak_running}; ATTEMPTS_EACH=1; MEDIA=PASS', flush=True)
        return records
    finally:
        dump(ROOT / 'probe-ids.json', {'ids': ids, 'key_id': key['id'], 'resubmit': False})
        api('/admin/api/keys/' + key['id'] + '/enabled', {'enabled': False})


def main():
    global ADMIN
    parser = argparse.ArgumentParser()
    parser.add_argument('--rollback', action='store_true')
    parser.add_argument('--no-probes', action='store_true')
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with contextlib.ExitStack() as stack:
        for name in ['/opt/naumi-staging/releases/deploy.lock', '/opt/naumi-reverse-hub/releases/deploy.lock']:
            file = stack.enter_context(open(name, 'a'))
            fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        ADMIN = run(['docker', 'exec', CONTAINER, 'node', '--input-type=module', '-e',
                     "import {readFileSync} from 'node:fs';process.stdout.write(readFileSync(process.env.HUB_ADMIN_TOKEN_FILE,'utf8').trim())"])
        original_path = ROOT / 'ORIGINAL_FILE.json'
        if args.rollback:
            expected = sha((ROOT / 'MODIFIED_FILE.json').read_bytes())
            result = drain_restart(original_path.read_bytes(), expected)
            dump(ROOT / 'rollback-live.json', result)
            print('ROLLBACK_LIVE=PASS; CAPACITY=1; DATA_RESTORE=NONE')
            return
        assert not (ROOT / 'baseline.json').exists(), 'Release already started; inspect evidence, do not overwrite baseline'
        original = CONFIG.read_bytes()
        assert sha(original) == '3a22137325462ebf4e5b32957c02d6f54db34bad9c5f341f43fa600fe6be9f04'
        if original_path.exists():
            assert original_path.read_bytes() == original, 'Prepared baseline differs'
        else:
            original_path.write_bytes(original)
            original_path.chmod(0o600)
        config = json.loads(original)
        config['scheduling']['maxConcurrentJobs'] = 12
        config['scheduling']['maxBrowserJobs'] = 8
        next(e for e in config['engines'] if e['id'] == 'jimeng')['concurrency'] = 8
        modified = (json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode()
        (ROOT / 'MODIFIED_FILE.json').write_bytes(modified)
        (ROOT / 'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(original.decode().splitlines(True), modified.decode().splitlines(True), fromfile='ORIGINAL_FILE.json', tofile='MODIFIED_FILE.json')))
        subprocess.check_call(['docker', 'cp', str(ROOT / 'hub-concurrency-fixture.mjs'), CONTAINER + ':/tmp/hub-concurrency-fixture.mjs'])
        subprocess.check_call(['docker', 'exec', '-u', '0', CONTAINER, 'chmod', '644', '/tmp/hub-concurrency-fixture.mjs'])
        results = {mode: fixture(mode, raw) for mode, raw in [('BASELINE', original), ('MODIFIED', modified)]}
        restored = ROOT / 'rollback-copy.json'
        restored.write_bytes(modified)
        subprocess.check_call(['bash', str(ROOT / 'ROLLBACK.sh'), '--copy', str(restored)])
        assert sha(restored.read_bytes()) == sha(original)
        results['ROLLBACK'] = fixture('ROLLBACK', restored.read_bytes())
        with contextlib.closing(db()) as source, sqlite3.connect(ROOT / 'hub-before.sqlite') as destination:
            source.backup(destination)
        (ROOT / 'hub-before.sqlite').chmod(0o600)
        baseline = {'config_sha256': sha(original), 'scheduling': api('/admin/api/scheduling'),
                    'accepted_tasks': inflight(), 'container_id': run(['docker', 'inspect', '-f', '{{.Id}}', CONTAINER])}
        dump(ROOT / 'baseline.json', baseline)
        restart = drain_restart(modified, sha(original))
        scheduling = api('/admin/api/scheduling')
        assert scheduling['global']['limit'] == 12 and scheduling['browser']['limit'] == 8
        assert next(e['limit'] for e in scheduling['engines'] if e['id'] == 'jimeng') == 8
        assert baseline['container_id'] == run(['docker', 'inspect', '-f', '{{.Id}}', CONTAINER])
        dump(ROOT / 'release.json', {'restart': restart, 'scheduling': scheduling,
                                     'fixture_results': results, 'config_sha256': sha(modified)})
        print('RELEASE=PASS; JIMENG=8; BROWSER_JOBS=8; GLOBAL_JOBS=12; CONTAINER_UNCHANGED=TRUE; ENGINES_UNCHANGED=TRUE', flush=True)
        if not args.no_probes:
            probes()
        dump(ROOT / 'final.json', {'scheduling': api('/admin/api/scheduling'), 'accepted_tasks': inflight(),
                                   'config_sha256': sha(CONFIG.read_bytes()), 'observed_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        print('FINAL=PASS; LOCKS_RELEASE_ON_EXIT=TRUE', flush=True)


if __name__ == '__main__':
    main()
