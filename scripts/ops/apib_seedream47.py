"""One locked 47 Seedream configuration publication; no program deployment.

Artifacts are private and immutable. Reuse original REQUEST/UUID after any
unknown reply. Public acceptance only calls GET and POST /api/imagegen/plan.
No submit, generation, provider discovery, process restart or gateway write.
"""
import argparse
import contextlib
import datetime
import hashlib
import json
import pathlib
import re
import time
import uuid

from release47_host import HostTransaction, environment, public_identity, require

HOST = 'eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
CANON = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
LOCKS = ['/opt/naumi-staging/releases/deploy.lock', '/opt/naumi-reverse-hub/releases/deploy.lock', '/opt/reference-workbench/deploy.lock']


def sha(raw): return hashlib.sha256(raw).hexdigest()
def load(path): return json.loads(pathlib.Path(path).read_bytes())


def lifecycle(raw, spec):
    s = json.loads(raw)
    require(sha(raw) == spec['canonicalSha256'] and s['revision'] == spec['revision'], 'CANONICAL_CAS_CHANGED')
    require(s['activeNormalBlueGreenReleaseId'] == spec['releaseId'] and s['normalBlueGreenReleases'][spec['releaseId']]['phase'] == 'COMPLETE', 'PROGRAM_RELEASE_NOT_COMPLETE')
    return s


def runtime_pin(tx, spec):
    for role in ('web', 'worker'):
        row = tx.pin(spec[role]); env = environment(row)
        require(env.get('SOURCE_COMMIT') == spec['sourceCommit'] and env.get('BUILD_VERSION') == spec['buildVersion'] and row['Image'] == spec['web']['image'], 'RUNTIME_VERSION_CHANGED')
        require(not any(m['Destination'] == '/app' or m['Destination'].startswith('/app/') for m in row['Mounts']), 'PROGRAM_OVERLAY_PRESENT')


@contextlib.contextmanager
def transaction(spec):
    tx = None
    for attempt in range(12):
        candidate = HostTransaction('47.105.59.142', HOST, spec['evidenceRoot'])
        try:
            tx = candidate.__enter__(); break
        except BlockingIOError:
            time.sleep(2)
    require(tx is not None, 'THREE_LOCK_WAIT_EXHAUSTED')
    try: yield tx
    finally: tx.__exit__(None, None, None)


def sql(tx, query):
    row = tx.inspect('naumi-staging-db-1'); env = environment(row)
    raw = tx.run(['docker', 'exec', '-i', row['Id'], 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB']], stdin=('BEGIN READ ONLY; SET LOCAL statement_timeout=\'5s\';' + query + ';COMMIT;').encode())
    return [json.loads(l) for l in raw.splitlines() if l.startswith(b'{')]


HTTP = r"""
let raw='';for await(const c of process.stdin)raw+=c;const i=JSON.parse(raw);
const u=new URL(i.path,'https://47.105.59.142');
if(u.origin!=='https://47.105.59.142'||!(i.method==='GET'||i.method==='POST'&&u.pathname==='/api/imagegen/plan'))throw Error('READ_ONLY_PLAN_ONLY');
const response=await fetch(u,{method:i.method,headers:{cookie:i.cookie,'content-type':'application/json',origin:u.origin},...(i.body?{body:JSON.stringify(i.body)}:{}),signal:AbortSignal.timeout(25000)});
const text=await response.text();let body;try{body=JSON.parse(text)}catch{body={notJson:true,bytes:text.length}}console.log(JSON.stringify({status:response.status,body}));
"""


def http(tx, spec, cookie, path, body=None):
    value = {'path': path, 'body': body, 'cookie': cookie, 'method': 'POST' if body is not None else 'GET'}
    raw = tx.run(['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', spec['web']['id'], 'node', '--input-type=module', '-e', HTTP], stdin=json.dumps(value).encode(), timeout=35)
    return json.loads(raw)


def phase(tx, spec, plan, support, mode):
    runtime_pin(tx, spec)
    proof = {'scope': 'host-three-lock-apib-config', 'target': '47.105.59.142', 'operationId': plan['operationId'], 'locks': LOCKS, 'lifecycle': {'phase': 'COMPLETE', 'releaseId': spec['releaseId']}, 'web': spec['web'], 'worker': spec['worker'], 'applicationSupport': support, 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    folder = '/tmp/apib-seedream-' + plan['operationId']
    tx.run(['docker', 'exec', '-i', spec['web']['id'], 'sh', '-c', 'umask 077; cat > "$1/LOCK_PROOF.json"', 'sh', folder], stdin=json.dumps(proof).encode())
    output = tx.run(['docker', 'exec', '-e', 'NODE_OPTIONS=--conditions=react-server --max-old-space-size=768', '-e', 'NODE_PATH=/app/node_modules', spec['web']['id'], 'node', folder + '/apib-activation.cjs', mode, folder], timeout=300)
    tx.save('result-' + mode.lower() + '.json', json.loads(output))
    export = tx.folder / ('container-' + mode.lower()); export.mkdir(mode=0o700)
    tx.run(['docker', 'cp', spec['web']['id'] + ':' + folder + '/.', str(export)])
    require(CANON.read_bytes() == pathlib.Path(spec['canonicalBackup']).read_bytes(), 'CANONICAL_CHANGED_DURING_CONFIG')
    return json.loads(output)


def install(tx, spec, plan, bundle):
    folder = '/tmp/apib-seedream-' + plan['operationId']
    marker = tx.run(['docker', 'exec', spec['web']['id'], 'sh', '-c', 'if [ -e "$1" ]; then echo EXISTS; else echo ABSENT; fi', 'sh', folder]).strip()
    require(marker == b'ABSENT', 'ORIGINAL_DIRECTORY_EXISTS_RECONCILE_REQUEST_NOT_REPLACE')
    tx.run(['docker', 'exec', spec['web']['id'], 'mkdir', '-m', '700', folder])
    for name, expected in load(bundle / 'BUNDLE_HASHES.json').items():
        require(pathlib.PurePosixPath(name).name == name and sha((bundle / name).read_bytes()) == expected, 'IMMUTABLE_BUNDLE_CHANGED')
        tx.run(['docker', 'cp', str(bundle / name), spec['web']['id'] + ':' + folder + '/' + name])
        tx.run(['docker', 'exec', '--user', '0', spec['web']['id'], 'chown', '1001:1001', folder + '/' + name])
        tx.run(['docker', 'exec', spec['web']['id'], 'chmod', '600', folder + '/' + name])


def execute(spec):
    require(spec['target'] == '47.105.59.142' and spec['sourceCommit'] == '56aa32336cfdd5ec37a133d02db67d25806c3a21', 'FIXED_TARGET_SOURCE_REQUIRED')
    bundle = pathlib.Path(spec['bundleRoot']); plan = load(bundle / 'PLAN.json'); support = load(bundle / 'APPLICATION_SUPPORT.json')
    require(re.fullmatch(r'[0-9a-f-]{36}', plan['operationId']) and support['sourceHashes'] == plan['requiredRuntimeHashes'], 'HASH_BOUND_PLAN_REQUIRED')
    with transaction(spec) as tx:
        tx.save('SPEC.json', spec)
        before = CANON.read_bytes(); state = lifecycle(before, spec); runtime_pin(tx, spec)
        tx.save('canonical-before.json', before)
        require(spec['canonicalBackup'] == str(tx.folder / 'canonical-before.json'), 'EXACT_CANONICAL_BACKUP_REQUIRED')
        for role in ('web', 'worker'):
            got = tx.run(['docker', 'exec', '-e', 'NODE_OPTIONS=', spec[role]['id'], 'node', '-e', spec['manifestCode']])
            require(json.loads(got) == load(bundle.parent / 'EXPECTED_PROGRAM_MANIFEST.json'), 'RUNNING_PROGRAM_BYTES_CHANGED')
        pending = sql(tx, "SELECT json_build_object('rows',COALESCE(json_agg(p),'[]')) FROM (SELECT id,version,phase FROM app_model_publications WHERE phase NOT IN ('applied','failed') OR id='" + plan['operationId'] + "')p")[0]['rows']
        require(not pending, 'INFLIGHT_OR_EXISTING_OPERATION_REQUIRES_RECONCILIATION')
        tx.save('pending-before.json', pending)
        manifest = load(state['runtimeRecovery']['manifestPath']); cookie = pathlib.Path(manifest['cookieFile']).read_text().strip()
        # Public GET through actual TLS gateway before any config write.
        auth = http(tx, spec, cookie, '/api/auth/session'); require(auth['status'] == 200 and auth['body'].get('user'), 'EXISTING_AUTH_FAILED')
        catalog_before = http(tx, spec, cookie, '/api/models?feature=image.generate'); require(catalog_before['status'] == 200, 'BASELINE_CATALOG_FAILED')
        tx.save('catalog-before.json', catalog_before)
        tx.backup_database(public_identity(tx.inspect('naumi-staging-db-1')))
        install(tx, spec, plan, bundle)
        local_plan = phase(tx, spec, plan, support, 'PLAN')
        tx.save('plan-approved.json', {'candidateDigest': plan['candidateDigest'], 'delta': len(plan['delta']), 'supplierCalls': 0})
        applied = phase(tx, spec, plan, support, 'APPLY')
        verified = phase(tx, spec, plan, support, 'VERIFY')
        # Genuine public plan requests: no submit or provider transport exists.
        catalog_after = http(tx, spec, cookie, '/api/models?feature=image.generate'); tx.save('catalog-after.json', catalog_after)
        require(catalog_after['status'] == 200, 'CATALOG_FAILED_AFTER_APPLY')
        new_ids = ['jimeng-image-4.0', 'jimeng-image-4.5', 'jimeng-image-5.0-flash', 'jimeng-image-5.0-lite']
        ids = {m['id'] for m in catalog_after['body']['models']}; require(set(new_ids) <= ids, 'NEW_PUBLIC_MODELS_MISSING')
        plans = []
        for model, resolution, ratio in [('jimeng-image-5.0-pro','4K','1:1'), ('jimeng-image-5.0-pro','2K','1:1'), ('jimeng-image-4.0','1K','1:1'), ('jimeng-image-4.5','2K','1:1'), ('jimeng-image-5.0-flash','4K','1:1'), ('jimeng-image-5.0-lite','2K','1:1')]:
            request = {'version':1,'operationId':str(uuid.uuid4()),'entry':'canvas','mode':'generate','modelId':model,'prompt':'Draw a product bottle. Configuration plan only.','inputs':[],'parameters':{'resolution':resolution,'quality':'medium','ratio':ratio},'output':{'format':'png'},'variants':1}
            response = http(tx, spec, cookie, '/api/imagegen/plan', request); plans.append({'input': request, **response})
            tx.save('http-plan-' + str(len(plans)) + '.json', plans[-1])
        require(all(p['status'] == 200 for p in plans), 'PUBLIC_PLAN_FAILED_AFTER_APPLY')
        owner = auth['body']['user']['email'].replace("'", "''")
        references = sql(tx, "SELECT json_build_object('id',id) FROM app_artworks WHERE email='" + owner + "' AND deleted_at IS NULL AND image_url<>'' AND COALESCE(video_url,'')='' ORDER BY COALESCE(image_width*image_height,99999999),created_at DESC LIMIT 1")
        require(references, 'NO_OWNED_REFERENCE_FOR_REQUIRED_NEGATIVE_ACCEPTANCE')
        negative = []
        for model in ['jimeng-image-5.0-pro', *new_ids]:
            request = {'version':1,'operationId':str(uuid.uuid4()),'entry':'canvas','mode':'edit','modelId':model,'prompt':'Change the label only.','inputs':[{'artworkId':references[0]['id'],'role':'edit-target'}]+[{'artworkId':references[0]['id'],'role':'reference'}]*10,'parameters':{'resolution':'2K','quality':'medium','ratio':'1:1'},'output':{'format':'png'},'variants':1}
            response = http(tx, spec, cookie, '/api/imagegen/plan', request)
            negative.append({'model':model,'references':11,**response})
        tx.save('negative-reference-http.json', negative)
        # A completed config publish can still fail feature acceptance. Never
        # label that original config preserved or silently reuse another UUID.
        require(all(p['status'] == 409 and p['body'].get('code') == 'IMAGEGEN_NO_CHANNEL' for p in negative), 'APPLIED_REFERENCE_ADMISSION_HOLD_REQUIRES_SELECTIVE_ROLLBACK')
        runtime_pin(tx, spec); require(CANON.read_bytes() == before, 'CANONICAL_CHANGED_AFTER_APPLY')
        require(sha(tx.run(['nginx','-T'])) == spec['nginxSha256'], 'GATEWAY_CHANGED_DURING_CONFIG')
        summary = {'status':'APPLIED_VERIFY_PASSED_PUBLIC_PLAN_PASSED','publication':applied['result']['publication'],'verification':verified['result'],'publicPlans':[{'model':p['input']['modelId'],'requested':p['input']['parameters'],'status':p['status'],'modelVersion':p['body'].get('modelVersion'),'steps':p['body'].get('steps'),'credits':p['body'].get('totalCredits'),'warnings':p['body'].get('warnings')}for p in plans],'sourceCommit':spec['sourceCommit'],'image':spec['web']['image'],'programDeployment':False,'supplierGenerationCalls':0,'paidAcceptance':'PAUSED_BY_USER','candidateDigest':plan['candidateDigest'],'runtimeHashes':plan['requiredRuntimeHashes'],'otherServersTouched':False}
        tx.save('FINAL_STATUS.json', summary)
        return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--spec', required=True); args = parser.parse_args()
    try: print(json.dumps(execute(load(args.spec))))
    except Exception as error:
        # A failure after APPLY is not "original configuration preserved".
        # Reconcile original UUID/REQUEST and choose verified selective rollback.
        raise SystemExit('SEEDREAM_CONFIG_REQUIRES_RECONCILIATION ' + type(error).__name__ + ' ' + str(error)) from None
