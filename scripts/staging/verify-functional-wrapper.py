#!/usr/bin/env python3
"""Exercise receipt recovery using a disposable fake Docker; no supplier calls."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile

commit = '65adfe8742e7a1fe120e7ce7a94409c50c76eb44'
image = 'sha256:' + 'a' * 64
script = Path(__file__).with_name('run-functional-receipt.sh').read_text()
with tempfile.TemporaryDirectory(prefix='naumi-receipt-fixture-') as temp:
    root = Path(temp)
    for folder in ('evidence', 'config', 'bin', 'container', f'releases/{commit}'):
        (root / folder).mkdir(parents=True, exist_ok=True)
    (root / 'ENVIRONMENT').write_text('ENVIRONMENT=staging\n')
    (root / f'releases/{commit}/IMAGE_ID').write_text(image + '\n')
    (root / 'config/verify-functional-runtime.mjs').write_text('// fixture only\n')
    receipt = root / 'evidence/functional-receipt-20261009.json'
    initial = {'version': 1, 'sourceJob': 'job-234bb140-6937-45ae-ba2d-4e50711a27f3',
               'edit': {'operationId': 'existing-edit'}, 'video': {'taskId': 'existing-video'}}
    wrapper = root / 'wrapper.sh'
    wrapper.write_text(script.replace('ROOT=/opt/naumi-staging', f'ROOT={root}'))
    fake = root / 'bin/docker'
    fake.write_text('''#!/usr/bin/env python3
import sys, os, pathlib, shutil, json
a=sys.argv[1:]; root=pathlib.Path(os.environ['FIXTURE_ROOT'])
if a[0]=='inspect':
 print(os.environ['FIXTURE_IMAGE'] if a[-1]=='{{.Image}}' else os.environ['FIXTURE_COMMIT'])
elif a[0]=='cp':
 def p(v): return root/'container'/v.split(':',1)[1].split('/')[-1] if ':' in v else pathlib.Path(v)
 shutil.copyfile(p(a[1]), p(a[2]))
elif a[0]=='exec':
 if 'node' in a:
  p=root/'container/naumi-staging-functional-20261009.json'
  r=json.loads(p.read_text()); r['fixture_run']=True; p.write_text(json.dumps(r))
  print('FIXTURE_NODE=EXECUTED EXISTING_TASKS=1')
  sys.exit(int(os.environ.get('FIXTURE_NODE_EXIT','0')))
else: raise RuntimeError(a)
''')
    fake.chmod(0o700)
    env = dict(os.environ, PATH=str(root/'bin')+os.pathsep+os.environ['PATH'],
               FIXTURE_ROOT=str(root), FIXTURE_IMAGE=image, FIXTURE_COMMIT=commit)

    def run(expected, **overrides):
        result = subprocess.run(['bash', str(wrapper), commit, '--verify'],
                                env=dict(env, **overrides), text=True, capture_output=True)
        assert result.returncode == expected, result.stdout + result.stderr
        return result.stdout

    receipt.write_text(json.dumps(initial))
    run(0)
    assert json.loads(receipt.read_text())['fixture_run']
    assert (root/'container/naumi-staging-functional-20261009.json').read_bytes() == receipt.read_bytes()
    receipt.write_text(json.dumps(initial))
    run(2, FIXTURE_NODE_EXIT='2')
    assert json.loads(receipt.read_text())['fixture_run'], 'failure must still persist receipt'
    receipt.unlink()
    assert 'MISSING NO_EXECUTION=1' in run(66)
    receipt.write_text(json.dumps(initial))
    run(1, FIXTURE_IMAGE='sha256:wrong')
    receipt.write_text(json.dumps({'version': 1, 'sourceJob': initial['sourceJob']}))
    run(1)
    receipt.write_text(json.dumps(initial))
    with (root/'evidence/functional-wrapper.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert 'BUSY' in run(75)
print('FUNCTIONAL_WRAPPER_FIXTURE=PASS RESTORE=1 FAILURE_PERSIST=1 MISSING_BLOCK=1 IMAGE_BLOCK=1 INCOMPLETE_BLOCK=1 LOCK_BLOCK=1 SUPPLIER_CALLS=0')
