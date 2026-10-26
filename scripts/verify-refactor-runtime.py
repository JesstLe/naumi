"""Run the existing fixed full image as isolated Web + combined direct Worker.

No Docker build, host service, production database, or paid supplier is used.
The setup/check bundle's source hashes must match the application's saved image
manifest. Only new acceptance code is mounted; no runtime source is replaced.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess, sys, time, uuid

sys.stdout.reconfigure(encoding='utf8')
root = Path.cwd().resolve()
parser = argparse.ArgumentParser()
parser.add_argument('--image-manifest', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--suite', choices=['runtime', 'browser'], default='runtime')
parser.add_argument('--soak-seconds', type=int, default=180)
args = parser.parse_args()
out = Path(args.out).resolve()
assert root.joinpath('output').resolve() in out.parents, 'OUTPUT_MUST_BE_UNDER_WORKSPACE_OUTPUT'
out.mkdir(parents=True, exist_ok=False)
manifest = json.loads(Path(args.image_manifest).read_text(encoding='utf8'))
assert manifest['status'] == 'PASS'
identity = manifest['source']
image = manifest['imageId']
suffix = uuid.uuid4().hex[:10]
task = ('refactor-r6c-' if args.suite == 'browser' else 'refactor-r6b-') + suffix
network = task
schema = 'r6b_' + uuid.uuid4().hex
names = {key: task + '-' + key for key in ['db', 'provider', 'web', 'worker', 'setup']}
events, owned = [], []
network_owned = False
secret = 'r6b-local-worker-control-fixture-only-20261026'
release = 'r6b-local-release-control-fixture-only-20261026'


def write(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def run(cmd, name=None, required=True):
    p = subprocess.run(cmd, capture_output=True, encoding='utf8', errors='replace')
    event = {'command': cmd, 'exit': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr}
    events.append(event)
    write('EVENTS.json', events)
    if name:
        (out / (name + '.log')).write_text('COMMAND=' + json.dumps(cmd) + '\n' + p.stdout + p.stderr + '\nEXIT=' + str(p.returncode) + '\n', encoding='utf8')
    if required and p.returncode:
        raise RuntimeError('COMMAND_FAILED ' + json.dumps(cmd) + '\n' + p.stdout + p.stderr)
    return p


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]).stdout)[0]


def mount(source, target, readonly=False):
    return ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + (',readonly' if readonly else '')]


def start(role, image_id, env, command=None, extra=None):
    cmd = ['docker', 'run', '-d', '--name', names[role], '--label', 'naumi.task=' + task,
           '--network', network, '--network-alias', role]
    if extra:
        cmd += extra
    for key, value in env.items():
        cmd += ['--env', key + '=' + value]
    cmd += [image_id] + (command or [])
    run(cmd, 'START_' + role.upper())
    owned.append(names[role])
    return names[role]


def wait(role, probe, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = inspect(names[role])['State']
        if not state['Running']:
            log = run(['docker', 'logs', names[role]])
            raise RuntimeError(role + ' EXITED ' + log.stdout + log.stderr)
        p = run(['docker', 'exec', '--env', 'NODE_OPTIONS=', names[role], 'node', '-e', probe], required=False)
        if p.returncode == 0:
            return
        time.sleep(.5)
    raise RuntimeError(role + ' READINESS_TIMEOUT')


try:
    original = json.loads(run(['docker', 'image', 'inspect', image]).stdout)[0]
    assert original['Config']['Labels']['org.opencontainers.image.revision'] == identity['commit']
    assert original['Config']['Labels']['io.naumi.source.digest'] == identity['digest']
    # New fixture files do not alter the fixed application image. Every bundled
    # production import must be byte-identical to the source used for that image.
    for name, expected in identity['hashes'].items():
        if name.startswith(('src/', 'services/')) or name in ['scripts/direct-worker-pg-fixture.ts', 'scripts/model-config-unit-fixture.ts']:
            assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, 'SOURCE_CHANGED ' + name
    compile_js = """import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const out=process.argv[1],entry=process.argv[2];const result=await build({entryPoints:[entry],outfile:out+'/fixture.cjs',bundle:true,metafile:true,platform:'node',target:'node24',format:'cjs',external:['pg','sharp'],alias:{'server-only':path.resolve('scripts/fleet-server-only.cjs')}});
fs.writeFileSync(out+'/FIXTURE_SOURCE.json',JSON.stringify({hashes:Object.fromEntries(Object.keys(result.metafile.inputs).map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))},null,2)+'\\n');console.log('RUNTIME_FIXTURE_COMPILE=PASS INPUTS='+Object.keys(result.metafile.inputs).length);"""
    entry = 'scripts/verification/refactor-browser-fixture.ts' if args.suite == 'browser' else 'scripts/verification/refactor-runtime-fixture.ts'
    run(['node', '--input-type=module', '-e', compile_js, str(out), entry], 'COMPILE')
    inputs = json.loads((out / 'FIXTURE_SOURCE.json').read_text(encoding='utf8'))['hashes']
    for name, expected in inputs.items():
        if name.startswith('src/'):
            assert identity['hashes'][name] == expected, 'FIXTURE_SOURCE_NOT_IMAGE_SOURCE ' + name
    write('INPUT.json', {'source': {k: v for k, v in identity.items() if k != 'hashes'}, 'image': image, 'fixtureProductionInputs': sum(n.startswith('src/') for n in inputs), 'task': task, 'schema': schema, 'internalNetwork': args.suite == 'runtime', 'browserIngress': '127.0.0.1 ephemeral Web port' if args.suite == 'browser' else None})
    # Docker's internal bridge suppresses host port publication. Browser suite
    # uses an owned ordinary bridge with only Web published on loopback; PG,
    # provider and Worker ports remain unpublished, all credentials synthetic.
    run(['docker', 'network', 'create', *(['--internal'] if args.suite == 'runtime' else []), '--label', 'naumi.task=' + task, network], 'NETWORK')
    network_owned = True
    db = start('db', 'postgres:16-alpine', {'POSTGRES_USER': 'fixture', 'POSTGRES_PASSWORD': 'fixture-local-only', 'POSTGRES_DB': 'naumi_runtime_fixture_r6b'}, extra=['--memory', '384m', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m'])
    deadline = time.monotonic() + 40
    while True:
        p = run(['docker', 'exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'fixture', '-d', 'naumi_runtime_fixture_r6b'], required=False)
        if p.returncode == 0:
            break
        assert time.monotonic() < deadline, 'POSTGRES_READINESS_TIMEOUT'
        time.sleep(.5)
    run(['docker', 'exec', db, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'fixture', '-d', 'naumi_runtime_fixture_r6b', '-c', 'CREATE SCHEMA ' + schema], 'SCHEMA')
    (out / 'media').mkdir(); (out / 'state').mkdir()
    common = {'DATABASE_URL': 'postgresql://fixture:fixture-local-only@db:5432/naumi_runtime_fixture_r6b?sslmode=disable', 'PGOPTIONS': '-c search_path=' + schema,
              'NAUMI_VERIFY_ISOLATED_DB': '1', 'SETTINGS_SECRET': 'r6b-isolated-settings-fixture-only-20261026', 'MODEL_CONFIG_ENVELOPE_SECRET': 'r6b-isolated-envelope-fixture-only',
              'MODEL_CONFIG_TRUSTED_ORIGINS': 'http://provider:3300', 'NAUMI_ROUTER_MANAGEMENT_URL': 'http://provider:3300', 'NAUMI_ROUTER_MANAGEMENT_TOKEN': 'fixture-no-control-calls', 'NAUMI_MULTI_USER': '1', 'NAUMI_AUTH_LOGIN_ONLY': '0', 'NAUMI_AUTH_COOKIE_SECURE': '0',
              'FLEET_PORTAL_ONLY': '0', 'NAUMI_APPLICATION_TASK_EXECUTION': 'worker', 'NAUMI_VIDEO_WORKER': '0', 'STORAGE_DRIVER': 'local', 'MEDIA_DIR': '/fixture-media', 'MEDIA_PRIVATE': '0',
              'OPENAI_API_KEY': 'fixture-no-external', 'OPENAI_BASE_URL': 'http://provider:3300/v1', 'OPENAI_IMAGE_MODEL': 'image-a', 'OPENAI_IMAGE_MODELS': 'image-a,gpt-image-2',
              'VIDEO_WORKER_SECRET': secret, 'RELEASE_CONTROL_SECRET': release, 'INTERNAL_APP_ORIGIN': 'http://web:3000',
              'MEDIA_WORKER_SECRET': 'r6b-media-fixture-only-secret-20261026', 'MEDIA_WORKER_ORIGIN': 'http://worker:3002',
              'SOURCE_COMMIT': identity['commit'], 'R6B_IMAGE_ID': image}
    shared = mount(out, '/evidence') + mount(out / 'media', '/fixture-media')
    provider = start('provider', image, {}, ['node', '/verification/provider.mjs'], ['--read-only', '--memory', '192m', '--tmpfs', '/data:rw,size=8m'] + mount(root / 'scripts/verification/refactor-runtime-provider.mjs', '/verification/provider.mjs', True))
    wait('provider', "fetch('http://127.0.0.1:3300/fixture/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))")
    helper_args = ['--browser-helper'] if args.suite == 'browser' else []
    setup = start('setup', image, {**common, 'NODE_PATH': '/app/node_modules', 'NAUMI_RELEASE_RUNTIME': '0'}, ['node', '/evidence/fixture.cjs', *helper_args, '--setup'], shared)
    code = int(run(['docker', 'wait', setup], 'SETUP_WAIT').stdout.strip())
    log = run(['docker', 'logs', setup], 'SETUP')
    assert code == 0, log.stdout + log.stderr
    web_env = {**common, 'NAUMI_RELEASE_RUNTIME': '1', 'NAUMI_RELEASE_ADMISSION_START': 'open', 'NAUMI_INSTANCE_ID': 'r6b-web', 'NODE_OPTIONS': '--require=/app/scripts/release-http-observer.cjs'}
    web_extra = ['-p', '127.0.0.1::3000'] if args.suite == 'browser' else []
    start('web', image, web_env, extra=['--memory', '1536m', '--cpus', '2', '--read-only', '--tmpfs', '/tmp:rw,size=128m,mode=1777', '--tmpfs', '/data:rw,size=32m,mode=777'] + shared + web_extra)
    wait('web', "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const b=await r.json();process.exit(r.ok&&b.db.ok?0:1)}).catch(()=>process.exit(1))")
    worker_env = {**common, 'NAUMI_INSTANCE_ID': 'r6b-worker', 'NAUMI_WORKER_EXECUTION': 'direct', 'NAUMI_WORKER_RELEASE_CONTROL': '1', 'NAUMI_WORKER_STATE_FILE': '/release-state/worker.json', 'NAUMI_WORKER_START_PAUSED': '1', 'NAUMI_APP_ORIGIN': 'http://web:3000', 'NAUMI_WORKER_CONTROL_PORT': '3001', 'NAUMI_MEDIA_WORKER': '1', 'MEDIA_JOB_DIR': '/scratch', 'MEDIA_WORKER_ORIGIN': 'http://127.0.0.1:3002', 'VIDEO_WORKER_INTERVAL_MS': '5000'}
    start('worker', image, worker_env, ['node', 'scripts/video-worker-with-media.mjs'], ['--user', '0', '--memory', '1536m', '--cpus', '2', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777', '--tmpfs', '/tmp/naumi-media-sandbox:rw,exec,nosuid,nodev,size=2g,mode=755', '--tmpfs', '/data:rw,size=32m,mode=777', '--tmpfs', '/scratch:rw,size=192m,mode=700'] + shared + mount(out / 'state', '/release-state'))
    wait('worker', "fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))")
    before = {role: inspect(names[role]) for role in ['web', 'worker']}
    assert all(v['Image'] == image for v in before.values())
    write('CONTAINERS.json', {role: {'id': v['Id'], 'image': v['Image'], 'state': v['State']} for role, v in before.items()})
    if args.suite == 'browser':
        port = inspect(names['web'])['NetworkSettings']['Ports']['3000/tcp'][0]['HostPort']
        p = run(['node', 'scripts/verify-refactor-product-browser.mjs', '--base', 'http://127.0.0.1:' + port, '--worker', names['worker'], '--out', str(out), '--soak-seconds', str(args.soak_seconds)], 'BROWSER')
        marker = 'REFACTOR_PRODUCT_BROWSER=PASS'
    else:
        p = run(['docker', 'exec', '--env', 'NODE_OPTIONS=', '--env', 'NODE_PATH=/app/node_modules', '--env', 'NAUMI_RELEASE_RUNTIME=0', names['worker'], 'node', '/evidence/fixture.cjs'], 'RUNTIME')
        marker = 'REFACTOR_RUNTIME=PASS'
    print(p.stdout, flush=True)
    assert marker in p.stdout
    run(['docker', 'stop', '--timeout', '60', names['worker']], 'WORKER_STOP')
    stopped = inspect(names['worker'])['State']
    worker_log = run(['docker', 'logs', names['worker']], 'WORKER_TERMINAL')
    assert stopped['ExitCode'] == 0 and 'WORKER_TICK_DRAIN=COMPLETE' in worker_log.stdout and '"event":"combined-worker-stopped","code":0' in worker_log.stdout
    for name, expected in identity['hashes'].items():
        if name.startswith(('src/', 'services/')):
            assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, 'SOURCE_DRIFT ' + name
    write('RESULT.json', {'status': 'PASS', 'suite': args.suite, 'source': identity['commit'], 'image': image, 'actualFullImage': True, 'runtime': 'BROWSER_RESULT.json' if args.suite == 'browser' else 'RUNTIME_RESULT.json', 'posixDrainExit': stopped['ExitCode'], 'applicationSourceUnchanged': True, 'deploy': False})
    print('REFACTOR_RUNTIME_IMAGE=PASS SAME_FIXED_IMAGE=1 WEB=1 WORKER=1 MEDIA_SANDBOX=1 POSIX_DRAIN_EXIT=0 APPLICATION_SOURCE_UNCHANGED=1 DEPLOY=0', flush=True)
except Exception as error:
    write('FAILURE.json', {'status': 'FAIL', 'error': str(error)})
    raise
finally:
    cleanup = []
    # Release synthetic held responses first, even after a failed assertion.
    if names['provider'] in owned:
        run(['docker', 'exec', names['provider'], 'node', '-e', "fetch('http://127.0.0.1:3300/fixture/release',{method:'POST'}).then(()=>{}).catch(()=>{})"], required=False)
    for name in reversed(owned):
        state = inspect(name)['State']
        if state['Running']:
            run(['docker', 'stop', '--timeout', '60', name], required=False)
        run(['docker', 'logs', name], name.split('-')[-1].upper() + '_FINAL', required=False)
        final = inspect(name)
        assert final['Config']['Labels']['naumi.task'] == task
        p = run(['docker', 'rm', '-v', name], required=False)
        cleanup.append({'name': name, 'exit': p.returncode, 'processExit': final['State']['ExitCode']})
    if network_owned:
        p = run(['docker', 'network', 'rm', network], 'NETWORK_CLEANUP', required=False)
        cleanup.append({'network': network, 'exit': p.returncode})
    success = all(item['exit'] == 0 for item in cleanup)
    write('CLEANUP.json', {'status': 'PASS' if success else 'FAIL', 'ownedOnly': True, 'items': cleanup, 'pgTmpfsDiscarded': True})
    assert success, 'OWNED_RESOURCE_CLEANUP_FAILED'
    print('REFACTOR_RUNTIME_CLEANUP=PASS OWN_CONTAINERS_REMOVED=1 OWN_INTERNAL_NETWORK_REMOVED=1 PG_TMPFS_DISCARDED=1', flush=True)
