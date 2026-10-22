#!/usr/bin/env python3
"""One host-local, three-lock video configuration phase. No deployment or SSH.

Run PLAN, inspect its durable PLAN_REVIEW.json, then explicitly pin its SHA256 as
reviewedPlanSha256 in the private host config before APPLY. All later attempts
reuse the original operation IDs, SPEC and bundle. Unknown outcomes are exported
for reconciliation; no automatic retry, publication replacement or DB restore.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import stat
import uuid

from release47_host import HostTransaction, Hold, LOCKS, environment, require

TARGET = '47.105.59.142'
HOST = 'eb32806db06dfe9ec55f17a3be5c59476ca0a45fec8ce442e0437530212cb3df'
CANON = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
EVIDENCE = pathlib.Path('/opt/naumi-staging/evidence')
MODES = ('PLAN', 'APPLY', 'VERIFY', 'ROLLBACK')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def load(path):
    return json.loads(pathlib.Path(path).read_bytes())


def private_file(path, *, root_owned=True):
    path = pathlib.Path(path)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not path.is_symlink() and
            not info.st_mode & 0o077 and (not root_owned or info.st_uid == 0),
            'PRIVATE_REGULAR_FILE_REQUIRED')
    return path


def validate_spec(spec):
    require(spec.get('target') == TARGET, 'EXPLICIT_47_TARGET_REQUIRED')
    for key in ('operationId', 'rollbackOperationId'):
        value = spec.get(key, '')
        require(isinstance(value, str) and str(uuid.UUID(value)) == value, 'ORIGINAL_UUID_REQUIRED')
    require(spec['operationId'] != spec['rollbackOperationId'], 'DISTINCT_ROLLBACK_UUID_REQUIRED')
    require(re.fullmatch(r'[0-9a-f]{40}', spec.get('sourceCommit', '')) and
            re.fullmatch(r'[0-9]{10,13}', str(spec.get('buildVersion', ''))), 'FIXED_PROGRAM_VERSION_REQUIRED')
    require(re.fullmatch(r'release47-[a-z0-9-]{6,80}', spec.get('releaseId', '')), 'FIXED_NORMAL_RELEASE_REQUIRED')
    require(type(spec.get('expectedVersion')) is int and spec['expectedVersion'] > 0 and
            type(spec.get('canonicalRevision')) is int and spec['canonicalRevision'] >= 0,
            'FIXED_CONFIG_AND_CANONICAL_VERSION_REQUIRED')
    for key in ('canonicalSha256', 'opsSha256'):
        require(re.fullmatch(r'[0-9a-f]{64}', spec.get(key, '')), 'FIXED_DIGEST_REQUIRED')
    identity_keys = {'id', 'name', 'image', 'running', 'startedAt', 'restartPolicy'}
    for role in ('web', 'worker'):
        identity = spec.get(role, {})
        require(set(identity) == identity_keys and re.fullmatch(r'[0-9a-f]{64}', identity.get('id', '')) and
                re.fullmatch(r'sha256:[0-9a-f]{64}', identity.get('image', '')) and identity.get('running') is True and
                re.fullmatch(r'naumi47-[A-Za-z0-9_.-]{1,80}', identity.get('name', '')),
                'FULL_RUNNING_RUNTIME_IDENTITIES_REQUIRED')
    require(spec['web']['id'] != spec['worker']['id'] and spec['web']['image'] == spec['worker']['image'],
            'DISTINCT_SAME_IMAGE_WEB_WORKER_REQUIRED')
    folder = pathlib.Path(spec['evidenceRoot'])
    require(folder.is_absolute() and not folder.is_symlink() and folder.resolve().is_relative_to(EVIDENCE) and
            folder.resolve() != EVIDENCE, 'PRIVATE_OPERATION_EVIDENCE_REQUIRED')
    bundle = pathlib.Path(spec['bundleRoot'])
    require(bundle.is_absolute() and bundle.is_dir() and not bundle.is_symlink() and
            bundle.resolve().is_relative_to(EVIDENCE) and bundle.stat().st_uid == 0 and
            not bundle.stat().st_mode & 0o077, 'PRIVATE_REVIEWED_BUNDLE_REQUIRED')
    ops = private_file(bundle / 'ops.cjs')
    require(sha(ops.read_bytes()) == spec['opsSha256'], 'LOCAL_OPS_BUNDLE_CHANGED')
    return folder, ops


def check_canonical(raw, spec):
    state = json.loads(raw)
    require(sha(raw) == spec['canonicalSha256'] and state.get('revision') == spec['canonicalRevision'] and
            state.get('target') == TARGET, 'CANONICAL_CAS_CHANGED')
    journal = state.get('normalBlueGreenReleases', {})
    release = journal.get(spec['releaseId'], {})
    require(state.get('activeNormalBlueGreenReleaseId') == spec['releaseId'] and
            release.get('phase') == 'COMPLETE', 'PROGRAM_RELEASE_NOT_COMPLETE')
    require(all(row.get('phase') in ('COMPLETE', 'ROLLED_BACK') and
                all(op.get('phase') == 'ACKNOWLEDGED' for op in row.get('operations', {}).values())
                for row in journal.values()) and
            all(op.get('phase') == 'ACKNOWLEDGED' for op in state.get('operations', {}).values()),
            'PENDING_RELEASE_OPERATION_OR_CLEANUP_DEBT')
    recovery = state.get('runtimeRecovery', {})
    require(recovery.get('phase') == 'ACKNOWLEDGED' and recovery.get('successorReleaseId') == spec['releaseId'] and
            recovery.get('effectiveWeb') == spec['web'] and recovery.get('effectiveWorker') == spec['worker'],
            'EFFECTIVE_RUNTIME_RECOVERY_CHANGED')
    require(release.get('commit') == spec['sourceCommit'] and str(release.get('buildVersion')) == str(spec['buildVersion']) and
            release.get('image') == spec['web']['image'], 'COMPLETED_RELEASE_VERSION_CHANGED')
    return {'phase': 'COMPLETE', 'releaseId': spec['releaseId'], 'revision': state['revision'], 'canonicalSha256': sha(raw)}


def runtime_pin(tx, spec):
    for role in ('web', 'worker'):
        row = tx.pin(spec[role])
        env = environment(row)
        require(env.get('SOURCE_COMMIT') == spec['sourceCommit'] and
                env.get('BUILD_VERSION') == str(spec['buildVersion']) and row['Image'] == spec['web']['image'],
                'RUNTIME_VERSION_CHANGED')
        require(not any(m['Destination'] == '/app' or m['Destination'].startswith('/app/') for m in row['Mounts']),
                'PROGRAM_OVERLAY_PRESENT')


def container_spec(spec):
    # No host configuration, cookie or credential is copied into the app.
    return {key: spec[key] for key in ('target', 'operationId', 'rollbackOperationId', 'expectedVersion',
                                      'sourceCommit', 'buildVersion')}


INSTALL = r"""
const fs=require('node:fs'),path=require('node:path');let raw='';
process.stdin.on('data',v=>raw+=v);process.stdin.on('end',()=>{
const i=JSON.parse(raw),root=i.root,parent=path.dirname(root);
for(const p of ['/data',parent]){if(!fs.existsSync(p))fs.mkdirSync(p,{mode:0o700});if(fs.lstatSync(p).isSymbolicLink()||!fs.statSync(p).isDirectory())throw Error('PRIVATE_DIRECTORY_REQUIRED');}
if(fs.existsSync(root))throw Error('ORIGINAL_DIRECTORY_EXISTS');
fs.mkdirSync(root,{mode:0o700});const fd=fs.openSync(path.join(root,'SPEC.json'),'wx',0o600);
try{fs.writeFileSync(fd,i.spec);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
const d=fs.openSync(root,'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}
});
"""
VERIFY_PRIVATE = r"""
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=process.argv[1];if(fs.lstatSync(root).isSymbolicLink())throw Error('PRIVATE_ROOT_REQUIRED');
const d=fs.statSync(root);if(!d.isDirectory()||(d.mode&63)||d.uid!==1001)throw Error('PRIVATE_ROOT_MODE_REQUIRED');
for(const name of fs.readdirSync(root)){
if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('UNEXPECTED_ARTIFACT_NAME');
const file=path.join(root,name),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&63)||s.uid!==1001)throw Error('PRIVATE_ARTIFACT_REQUIRED');
}
for(const name of ['SPEC.json','ops.cjs'])process.stdout.write(JSON.stringify({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')})+'\n');
"""
WRITE_PROOF = r"""
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');let raw='';
process.stdin.on('data',v=>raw+=v);process.stdin.on('end',()=>{
const root=process.argv[1],temp=path.join(root,'.proof-'+crypto.randomUUID());
const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
fs.renameSync(temp,path.join(root,'LOCK_PROOF.json'));const d=fs.openSync(root,'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}
});
"""


def node(tx, spec, code, *args, stdin=None):
    return tx.run(['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', '--user', '1001:1001', spec['web']['id'],
                   'node', '-e', code, *args], stdin=stdin)


def install_or_verify(tx, spec, ops, mode, root):
    marker = tx.run(['docker', 'exec', spec['web']['id'], 'sh', '-c',
                     'if [ -e "$1" ] || [ -L "$1" ]; then echo EXISTS; else echo ABSENT; fi', 'sh', root]).strip()
    raw_spec = encoded(container_spec(spec))
    if marker == b'ABSENT':
        require(mode == 'PLAN', 'RUN_PLAN_FIRST')
        node(tx, spec, INSTALL, stdin=encoded({'root': root, 'spec': raw_spec.decode()}))
        tx.run(['docker', 'cp', str(ops), spec['web']['id'] + ':' + root + '/ops.cjs'])
        tx.run(['docker', 'exec', '--user', '0', spec['web']['id'], 'chown', '1001:1001', root + '/ops.cjs'])
        tx.run(['docker', 'exec', '--user', '1001:1001', spec['web']['id'], 'chmod', '600', root + '/ops.cjs'])
    else:
        require(marker == b'EXISTS', 'PRIVATE_ROOT_OBSERVATION_UNKNOWN')
    observed = {row['name']: row['sha256'] for row in map(json.loads, node(tx, spec, VERIFY_PRIVATE, root).splitlines())}
    require(observed == {'SPEC.json': sha(raw_spec), 'ops.cjs': spec['opsSha256']}, 'EXISTING_IMMUTABLE_BUNDLE_CHANGED')
    return sha(raw_spec)


def durable_export(tx, spec, root, mode, attempt):
    destination = tx.folder / ('container-' + mode.lower() + '-' + attempt)
    destination.mkdir(mode=0o700)
    tx.run(['docker', 'cp', spec['web']['id'] + ':' + root + '/.', str(destination)])
    manifest = {}
    for path in sorted(destination.iterdir()):
        require(path.is_file() and not path.is_symlink(), 'EXPORTED_ARTIFACT_NOT_REGULAR')
        path.chmod(0o600)
        with path.open('rb') as stream:
            os.fsync(stream.fileno())
        manifest[path.name] = {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size}
    fd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    tx.save('export-manifest-' + attempt + '.json', {'mode': mode, 'operationId': spec['operationId'], 'directory': str(destination), 'files': manifest})
    return manifest


def run(mode, spec):
    require(mode in MODES, 'EXPLICIT_SINGLE_MODE_REQUIRED')
    folder, ops = validate_spec(spec)
    root = '/data/isolated-provider-config/video-family-' + spec['operationId']
    attempt = str(uuid.uuid4())
    with HostTransaction(TARGET, HOST, folder) as tx:
        require(len(tx.lock_fds) == 3, 'WHOLE_TRANSACTION_THREE_LOCKS_REQUIRED')
        before = CANON.read_bytes()
        lifecycle = check_canonical(before, spec)
        runtime_pin(tx, spec)
        tx.save('canonical-before-' + attempt + '.json', before)
        tx.save('host-config-' + attempt + '.json', spec)
        spec_sha = install_or_verify(tx, spec, ops, mode, root)
        plan_sha = None
        if mode == 'APPLY':
            require(re.fullmatch(r'[0-9a-f]{64}', spec.get('reviewedPlanSha256', '')), 'EXPLICIT_PLAN_REVIEW_REQUIRED')
            receipt = load(private_file(folder / 'PLAN_RECEIPT.json'))
            require(receipt.get('operationId') == spec['operationId'] and receipt.get('opsSha256') == spec['opsSha256'] and
                    receipt.get('specSha256') == spec_sha and receipt.get('planReviewSha256') == spec['reviewedPlanSha256'],
                    'PLAN_REVIEW_OR_BUNDLE_CHANGED')
            plan_raw = tx.run(['docker', 'exec', spec['web']['id'], 'cat', root + '/PLAN_REVIEW.json'])
            plan = json.loads(plan_raw)
            require(sha(plan_raw) == spec['reviewedPlanSha256'] and plan.get('operationId') == spec['operationId'] and
                    plan.get('baselineVersion') == spec['expectedVersion'] and len(plan.get('skus', [])) == 32 and
                    plan.get('credentialPlaceholdersOnly') is True and plan.get('notPublishable') is True,
                    'REVIEWED_PLAN_BASELINE_CHANGED')
            plan_sha = sha(plan_raw)
        # Refresh after setup/review, immediately before the single operation.
        require(CANON.read_bytes() == before, 'CANONICAL_CHANGED_BEFORE_CONFIGURATION')
        runtime_pin(tx, spec)
        proof = {'scope': 'host-three-lock-video-family-config', 'target': TARGET, 'operationId': spec['operationId'],
                 'locks': LOCKS, 'lifecycle': lifecycle, 'web': spec['web'], 'worker': spec['worker'],
                 'opsSha256': spec['opsSha256'], 'specSha256': spec_sha,
                 'observedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
        node(tx, spec, WRITE_PROOF, root, stdin=encoded(proof))
        output = None
        try:
            output = tx.run(['docker', 'exec', '-e', 'NODE_OPTIONS=--conditions=react-server', '-e', 'NODE_PATH=/app/node_modules',
                             '--user', '1001:1001', spec['web']['id'], 'node', root + '/ops.cjs', mode, root], timeout=300)
            result = json.loads(output)
            require(result.get('mode') == mode and result.get('passed') is True, 'CONFIGURATION_RECEIPT_NOT_SUCCESSFUL')
        finally:
            # Preserve failed/unknown paid-publication boundaries before locks exit.
            # No credentials are decrypted by this host wrapper.
            try:
                require(CANON.read_bytes() == before, 'CANONICAL_CHANGED_DURING_CONFIGURATION')
                check_canonical(CANON.read_bytes(), spec)
                runtime_pin(tx, spec)
            finally:
                exported = durable_export(tx, spec, root, mode, attempt)
                if output is not None:
                    tx.save('operation-output-' + attempt + '.json', output)
        if mode == 'PLAN':
            require('BASELINE_MODEL.json' in exported and 'BASELINE_BILLING.json' in exported and 'PLAN_REVIEW.json' in exported,
                    'DURABLE_CONFIGURATION_BACKUPS_REQUIRED')
            plan_sha = exported['PLAN_REVIEW.json']['sha256']
            review_receipt = {'operationId': spec['operationId'], 'opsSha256': spec['opsSha256'], 'specSha256': spec_sha,
                              'planReviewSha256': plan_sha, 'baselineVersion': spec['expectedVersion'], 'phase': 'PLAN_REVIEW_REQUIRED'}
            existing = folder / 'PLAN_RECEIPT.json'
            if existing.exists():
                require(load(private_file(existing)) == review_receipt, 'ORIGINAL_PLAN_REVIEW_CHANGED')
            else:
                tx.save('PLAN_RECEIPT.json', review_receipt)
        summary = {'mode': mode, 'passed': True, 'operationId': spec['operationId'], 'releaseId': spec['releaseId'],
                   'sourceCommit': spec['sourceCommit'], 'opsSha256': spec['opsSha256'], 'planReviewSha256': plan_sha,
                   'supplierCalls': 0, 'programDeployment': False, 'databaseRestored': False}
        for key in ('version', 'billingVersion', 'skuCount', 'defaultModelId'):
            if key in result:
                summary[key] = result[key]
        tx.save('result-' + mode.lower() + '-' + attempt + '.json', summary)
        return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', required=True, choices=MODES)
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        config = load(private_file(args.config))
        print(json.dumps(run(args.mode, config), sort_keys=True))
    except Exception as error:
        # Never print process output, configuration, cookie or exception text.
        code = str(error) if isinstance(error, Hold) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,99}', str(error)) else type(error).__name__
        raise SystemExit('VIDEO_FAMILY_CONFIG_HOLD ' + code + '; retain original UUID and reconcile private evidence') from None


if __name__ == '__main__':
    main()
