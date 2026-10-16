#!/usr/bin/env python3
"""Generate clearly-labelled offline evidence and exercise the public CLI."""
import datetime as dt
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('fixtures', HERE / 'test_release_lifecycle.py')
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)
f.NOW = time.time()
f.AT = dt.datetime.now(dt.timezone.utc).isoformat()


def verify(folder):
    folder.mkdir(parents=True, exist_ok=True)
    p = f.plan()
    plan = folder / 'plan.json'
    plan.write_text(json.dumps(p, indent=2), encoding='utf-8')
    state = folder / 'fixture-state'

    def write_snapshot(stage, bad=False):
        s = f.snapshot(p, stage)
        if bad:
            s['containers'][0]['running'] = True
            f.bind(p, s)
        for kind, receipt in s['evidence'].items():
            artifact = folder / ('fixture-' + kind + '.txt')
            artifact.write_text('FIXTURE_ONLY; NO_LIVE_PROBE; KIND=' + kind + '\n', encoding='utf-8')
            receipt['artifact'] = artifact.name
            receipt['artifactSha256'] = hashlib.sha256(artifact.read_bytes()).hexdigest()
        out = folder / ('snapshot-' + stage + ('-old-running' if bad else '') + '.json')
        out.write_text(json.dumps(s, indent=2), encoding='utf-8')
        return out

    commands = []

    def call(action, stage, revision=None, bad=False, expected=0):
        args = [sys.executable, str(HERE/'release_lifecycle.py'), action, '--plan', str(plan),
                '--snapshot', str(write_snapshot(stage, bad)), '--state-dir', str(state)]
        if revision is not None:
            args += ['--revision', str(revision)]
        r = subprocess.run(args, capture_output=True, text=True)
        commands.append({'command': args, 'exit': r.returncode, 'stdout': r.stdout.strip(), 'stderr': r.stderr.strip()})
        assert r.returncode == expected, commands[-1]
        return r

    call('begin', 'preflight')
    call('ready', 'ready', 0)
    call('switched', 'switched', 1)
    call('finish', 'finish', 2, bad=True, expected=2)
    current = json.loads((state/'current.json').read_text('utf-8'))
    assert current['status'] == 'CLEANUP_PENDING' and current['revision'] == 3
    pending_copy = folder/'pending-state-copy.json'; pending_copy.write_bytes((state/'current.json').read_bytes())
    # A second release/process cannot declare the host idle while debt persists.
    original_id = p['releaseId']; p['releaseId'] = 'fixture-release-2'
    plan.write_text(json.dumps(p), encoding='utf-8')
    blocked = call('begin', 'preflight', expected=2)
    assert 'UNFINISHED_RELEASE_BLOCKS_NEXT' in blocked.stderr
    p['releaseId'] = original_id; plan.write_text(json.dumps(p, indent=2), encoding='utf-8')
    call('finish', 'finish', 3)
    assert json.loads((state/'current.json').read_text('utf-8'))['status'] == 'COMPLETE'
    # The next transaction has a different releaseId; validate explicit rollback
    # confirmation, never restoring any application/database file.
    p['releaseId'] = 'fixture-release-rollback'; plan.write_text(json.dumps(p, indent=2), encoding='utf-8')
    call('begin', 'preflight')
    call('ready', 'ready', 0)
    call('switched', 'switched', 1)
    call('rollback', 'rollback', 2)
    assert json.loads((state/'current.json').read_text('utf-8'))['status'] == 'ROLLED_BACK'
    (folder/'cli-results.json').write_text(json.dumps(commands, indent=2), encoding='utf-8')
    print('LIFECYCLE_CLI=PASS; OLD_RUNNING=CLEANUP_PENDING; NEXT_RELEASE=BLOCKED; RESUME=COMPLETE; ROLLBACK=CONFIRMED; MODE=fixture')


if __name__ == '__main__':
    if len(sys.argv) == 2:
        verify(pathlib.Path(sys.argv[1]))
    else:
        with tempfile.TemporaryDirectory() as folder:
            verify(pathlib.Path(folder))
