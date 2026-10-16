#!/usr/bin/env python3
"""47-only authenticated Worker tick-loop control, never stops containers.

All mutation operations hold the same three host locks as release_lifecycle.
An UNKNOWN tick blocks resume. Tick quiescence does NOT attest App jobs/leases.
The operation request is fsynced before sending and reused across an uncertain
response. Secret stays inside docker exec's environment and is never printed.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse

import release_lifecycle as lifecycle

REMOTE = r"""
const action=JSON.parse(process.argv[1]);
const port=Number(process.env.NAUMI_WORKER_CONTROL_PORT||3001);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_CONTROL_PORT');
if(process.env.NAUMI_WORKER_RELEASE_CONTROL!=='1')throw Error('WORKER_CONTROL_NOT_ENABLED');
const response=await fetch(`http://127.0.0.1:${port}/${action?'control':'status'}`,{
 method:action?'POST':'GET',headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET||''},
 ...(action?{body:JSON.stringify(action)}:{}),signal:AbortSignal.timeout(10000)});
const result=await response.json();
if(!response.ok){console.error('CONTROL_HTTP_'+response.status+':'+String(result.error));process.exit(2);}
console.log(JSON.stringify(result));
"""


def require(ok, code):
    if not ok:
        raise lifecycle.Blocked(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def inspect_identity(args, command):
    rows = json.loads(command(['docker', 'inspect', args.container]))
    require(len(rows) == 1, 'WORKER_NOT_UNIQUE')
    row = rows[0]
    require(row['Id'] == args.expected_id and row['Image'] == args.expected_image and
            row['State']['Running'] is True, 'WORKER_IDENTITY_DRIFT')
    env = dict(item.split('=', 1) for item in row['Config'].get('Env', []) if '=' in item)
    require(env.get('SOURCE_COMMIT') == args.expected_commit and
            env.get('NAUMI_APP_ORIGIN', '').rstrip('/') == args.expected_origin.rstrip('/') and
            env.get('NAUMI_WORKER_RELEASE_CONTROL') == '1', 'WORKER_ORIGIN_OR_COMMIT_DRIFT')
    require(bool(env.get('NAUMI_INSTANCE_ID')), 'WORKER_INSTANCE_ID_REQUIRED')
    return row, env


def remote(command, container, request=None):
    raw = command(['docker', 'exec', '-e', 'NODE_OPTIONS=', container, 'node', '--input-type=module', '-e', REMOTE,
                   canonical(request)])
    return json.loads(raw)


def verify_status(status, args, instance_id):
    require(isinstance(status, dict) and status.get('schemaVersion') == 1 and
            status.get('instanceId') == instance_id and status.get('commit') == args.expected_commit and
            status.get('origin') == args.expected_origin.rstrip('/'), 'WORKER_CONTROL_STATUS_DRIFT')
    require(re.fullmatch(r'[0-9a-f-]{36}', status.get('bootId', '')) and
            type(status.get('revision')) is int and status['revision'] >= 0 and
            status.get('durableControl') is True, 'WORKER_STATUS_INCOMPLETE')
    lifecycle.freshness(status.get('observedAt'), lifecycle.time.time())
    require(status.get('phase') in ['IDLE', 'RUNNING', 'QUIESCENT', 'DRAINING', 'UNKNOWN'], 'WORKER_PHASE_INVALID')
    require(type(status.get('activeTicks')) is int and status['activeTicks'] in [0, 1] and
            type(status.get('unresolvedTicks')) is int and status['unresolvedTicks'] in [0, 1],
            'WORKER_TICK_COUNTS_UNKNOWN')
    return status


def authorize_release(args, state, plan):
    lifecycle.valid_plan(plan)
    require(plan['evidenceMode'] == 'live' and state.get('evidenceMode') == 'live' and
            plan['target'] == args.target and state.get('target') == args.target and
            plan['hostIdentitySha256'] == args.host_identity_sha256 and
            state.get('releaseId') == plan['releaseId'] and
            state.get('planSha256') == lifecycle.digest(plan), 'ACTIVE_RELEASE_PLAN_REQUIRED')
    require(state.get('status') in ['PREPARED', 'READY', 'DRAINING', 'CLEANUP_PENDING', 'UNKNOWN'],
            'ACTIVE_RELEASE_REQUIRED')
    baseline = {row['id']: row for row in plan['baseline'] if row['role'] == 'worker'}
    if args.expected_id == plan['worker']:
        require(args.expected_image == plan['image'] and args.expected_commit == plan['commit'],
                'CANDIDATE_WORKER_PLAN_MISMATCH')
    else:
        require(args.expected_id in baseline and args.expected_image == baseline[args.expected_id]['image'] and
                args.expected_commit == baseline[args.expected_id].get('commit'), 'LEGACY_WORKER_PLAN_MISMATCH')
    if args.action == 'resume':
        require(state['status'] in ['READY', 'DRAINING'] and args.expected_id == plan['worker'],
                'READY_CANDIDATE_WORKER_REQUIRED')


def execute(args, folder, command):
    row, env = inspect_identity(args, command)
    status = verify_status(remote(command, args.container), args, env['NAUMI_INSTANCE_ID'])
    if args.action == 'status':
        return {'result': 'OBSERVED', 'state': status, 'containerId': row['Id']}
    require(re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', args.operation_id or ''),
            'OPERATION_UUID_REQUIRED')
    operation = folder / (args.operation_id + '.json')
    for pending in folder.glob('*.json'):
        saved = json.loads(pending.read_text('utf-8'))
        require(saved.get('phase') in ['INTENT_RECORDED', 'ACKNOWLEDGED', 'UNKNOWN'], 'CORRUPT_HANDOFF_LOG')
        require(pending == operation or saved['phase'] == 'ACKNOWLEDGED', 'UNRESOLVED_HANDOFF_BLOCKS_NEXT')
    binding = {'containerId': row['Id'], 'image': args.expected_image,
               'commit': args.expected_commit, 'origin': args.expected_origin, 'action': args.action}
    if args.action == 'reconcile':
        tick_id = getattr(args, 'tick_id', None)
        require(re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', tick_id or ''),
                'EXACT_TICK_UUID_REQUIRED')
        binding['tickId'] = tick_id
    if operation.exists():
        record = json.loads(operation.read_text('utf-8'))
        require(record.get('binding') == binding, 'OPERATION_BINDING_CONFLICT')
        if record['phase'] == 'ACKNOWLEDGED':
            return {'result': 'ALREADY_ACKNOWLEDGED', 'operationId': args.operation_id,
                    'receipt': record['receipt'], 'state': status,
                    'warning': 'PAST_ACKNOWLEDGEMENT_NOT_CURRENT_MODE_ASSERTION'}
        # A previous uncertain request is retried with the same UUID/body only.
        request = record['request']
    else:
        require(args.action != 'resume' or status['phase'] != 'UNKNOWN', 'UNRESOLVED_TICK_BLOCKS_RESUME')
        if args.action == 'resume':
            parsed = urllib.parse.urlsplit(args.expected_origin)
            require(parsed.hostname not in ['127.0.0.1', 'localhost', '::1'] and parsed.port == 3000,
                    'DIRECT_DOCKER_WEB_ORIGIN_REQUIRED')
            web = json.loads(command(['docker', 'inspect', parsed.hostname]))
            require(len(web) == 1 and web[0]['State']['Running'] is True and
                    web[0]['Image'] == args.expected_image, 'WEB_WORKER_IMAGE_MISMATCH')
            web_env = dict(s.split('=', 1) for s in web[0]['Config'].get('Env', []) if '=' in s)
            require(web_env.get('SOURCE_COMMIT') == args.expected_commit and
                    web_env.get('INTERNAL_APP_ORIGIN', '').rstrip('/') == 'http://127.0.0.1:3000',
                    'SPLIT_WEB_RECOVERY_ORIGIN')
        request = {'action': args.action, 'operationId': args.operation_id,
                   'bootId': status['bootId'], 'expectedRevision': status['revision']}
        if args.action == 'reconcile':
            require(status.get('phase') == 'UNKNOWN' and status.get('lastTick', {}).get('id') == args.tick_id,
                    'EXACT_UNKNOWN_TICK_REQUIRED')
            request['tickId'] = args.tick_id
        record = {'binding': binding, 'request': request, 'phase': 'INTENT_RECORDED'}
        lifecycle.atomic(operation, record)
    try:
        result = remote(command, args.container, request)
        require(result.get('receipt', {}).get('action') == args.action, 'WORKER_RECEIPT_ACTION_MISMATCH')
        fresh = verify_status(remote(command, args.container), args, env['NAUMI_INSTANCE_ID'])
        require(fresh['bootId'] == result['state']['bootId'], 'WORKER_BOOT_CHANGED_AFTER_CONTROL')
        require(type(result['receipt'].get('revision')) is int and
                fresh['revision'] >= result['receipt']['revision'], 'WORKER_RECEIPT_REVISION_MISMATCH')
        require(fresh.get('paused') is (args.action != 'resume'), 'WORKER_CONTROL_NOT_OBSERVED')
        if args.action == 'reconcile':
            receipt = result['receipt']
            server_receipt = receipt.get('serverReceipt', {})
            require(fresh.get('phase') == 'QUIESCENT' and fresh.get('unresolvedTicks') == 0 and
                    fresh.get('lastTick', {}).get('id') == args.tick_id and
                    server_receipt.get('tickId') == args.tick_id and server_receipt.get('phase') == 'completed',
                    'TICK_RECONCILIATION_NOT_OBSERVED')
            require(server_receipt.get('web', {}).get('instanceId') == env.get('NAUMI_WORKER_TARGET_INSTANCE_ID') and
                    server_receipt.get('web', {}).get('commit') == args.expected_commit,
                    'TICK_RECONCILIATION_TARGET_DRIFT')
        record.update(phase='ACKNOWLEDGED', receipt=result['receipt'], observed=fresh)
        lifecycle.atomic(operation, record)
        return {'result': 'ACKNOWLEDGED', 'operationId': args.operation_id, 'state': fresh,
                'warning': 'TICK_STATE_ONLY_NOT_APP_DRAIN_PROOF'}
    except Exception:
        record['phase'] = 'UNKNOWN'
        lifecycle.atomic(operation, record)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'drain', 'resume', 'reconcile'])
    parser.add_argument('--target', required=True, choices=['47.105.59.142'])
    for name in ['container', 'expected-id', 'expected-image', 'expected-commit', 'expected-origin', 'host-identity-sha256']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--operation-id')
    parser.add_argument('--tick-id', help='Original UNKNOWN tick UUID; reconciliation is GET-only')
    parser.add_argument('--plan', type=pathlib.Path, help='Required for mutation: current live lifecycle plan')
    args = parser.parse_args()
    try:
        require(os.name == 'posix', 'LINUX_HOST_REQUIRED')
        require(re.fullmatch(r'[0-9a-f]{64}', args.expected_id) and
                re.fullmatch(r'sha256:[0-9a-f]{64}', args.expected_image) and
                re.fullmatch(r'[0-9a-f]{40}', args.expected_commit), 'FIXED_WORKER_IDENTITY_REQUIRED')
        parsed = urllib.parse.urlsplit(args.expected_origin)
        require(parsed.scheme in ['http', 'https'] and parsed.netloc and not parsed.username and
                not parsed.password and not parsed.path.strip('/') and not parsed.query and not parsed.fragment,
                'INVALID_WORKER_ORIGIN')
        args.expected_origin = args.expected_origin.rstrip('/')
        require(hashlib.sha256(pathlib.Path('/etc/machine-id').read_bytes().strip()).hexdigest() ==
                args.host_identity_sha256, 'HOST_IDENTITY_DRIFT')
        folder = pathlib.Path('/opt/naumi-staging/releases/worker-handoff')

        def command(cmd):
            # Do not echo docker env, authentication headers or provider output.
            result = subprocess.run(cmd, capture_output=True, timeout=20, check=True)
            return result.stdout.decode('utf-8')

        with lifecycle.live_locks():
            if args.action != 'status':
                require(args.plan is not None, 'ACTIVE_RELEASE_PLAN_REQUIRED')
                state_file = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle/current.json')
                require(state_file.is_file(), 'ACTIVE_RELEASE_PLAN_REQUIRED')
                authorize_release(args, json.loads(state_file.read_text('utf-8')),
                                  json.loads(args.plan.read_text('utf-8')))
            with lifecycle.file_lock(folder):
                result = execute(args, folder, command)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (lifecycle.Blocked, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        # subprocess error strings may contain tool source/argv. Avoid logging them.
        message = str(error) if isinstance(error, lifecycle.Blocked) else type(error).__name__
        print('WORKER_HANDOFF_BLOCKED=' + message, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
