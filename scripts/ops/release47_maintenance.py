#!/usr/bin/env python3
"""One-time Oct16 maintenance configuration. No implicit publication or stop.

This records the user's explicit maintenance exception; it NEVER manufactures
legacy zero-drain receipts or weakens the normal blue/green acceptance engine.
"""
import datetime as dt
import json
import pathlib
import re

import release_client_compat as compat
from release47_host import Hold, environment, public_identity, require, sha

DATE = '2026-10-16'
ACK = '本次接受短维护迁移，保留任务和数据'
IMMEDIATE_HK_ACK = '现在就上线香港'
IMMEDIATE_HK_NOT_BEFORE = '2026-10-16T08:41:00Z'


def immediate_hk(spec):
    return spec.get('mode') == 'immediate-HK-only'


def authorize(spec, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    local = now.astimezone(dt.timezone(dt.timedelta(hours=8)))
    immediate = immediate_hk(spec)
    require(spec.get('mode') in ['one-time-maintenance', 'immediate-HK-only'] and spec.get('target') in ['47.105.59.142', '103.30.76.93'] and
            spec.get('date') == DATE and spec.get('userAcknowledgement') == ACK,
            'EXPLICIT_OCT16_MAINTENANCE_AUTHORIZATION_REQUIRED')
    if immediate:
        require(spec.get('target') == '103.30.76.93' and
                spec.get('userImmediateAcknowledgement') == IMMEDIATE_HK_ACK and
                spec.get('notBefore') == IMMEDIATE_HK_NOT_BEFORE, 'EXPLICIT_IMMEDIATE_HK_ONLY_AUTHORIZATION_REQUIRED')
        require(now.tzinfo is not None and local.date().isoformat() == DATE and
                now >= dt.datetime.fromisoformat(IMMEDIATE_HK_NOT_BEFORE.replace('Z', '+00:00')),
                'OUTSIDE_AUTHORIZED_IMMEDIATE_HK_WINDOW')
    else:
        require(local.date().isoformat() == DATE and local.time() >= dt.time(18, 30),
                'OUTSIDE_AUTHORIZED_EVENING_WINDOW')
    require(spec.get('restoreDatabase') is False and spec.get('replayAcceptedTasks') is False,
            'TASK_AND_DATA_PRESERVATION_REQUIRED')


def maintenance_gateway(unified_dump, candidate_origin, output, *, baseline_dump, source_files):
    """Replace only candidate-bound proxy dispatch; preserve 17847 conditional branches.

    Use the already strict, reviewed unified configuration from render_gateway.
    Immutable static assets remain available; no extra maintenance server process.
    """
    parsed = compat.Dump(unified_dump)
    original = compat.Dump(baseline_dump)
    maps = {}
    for name in parsed.files:
        for node in compat.walk(parsed.nodes[name]):
            if node.name == 'map' and node.args and node.args[-1].startswith('$naumi47_'):
                maps[node.args[-1]] = node
    edits, count = {}, 0
    for name in parsed.files:
        for node in compat.walk(parsed.nodes[name]):
            if node.name != 'proxy_pass': continue
            require(len(node.args) == 1, 'UNKNOWN_MAINTENANCE_PROXY')
            value = node.args[0]
            map_name = value.removesuffix('$request_uri')
            if value == candidate_origin or value.startswith(candidate_origin + '/'):
                replacement = 'return 503;'
            elif map_name in maps:
                outputs = [token.value for child in maps[map_name].children or [] for token in child.tokens]
                if not any(v == candidate_origin or v.startswith(candidate_origin + '/') for v in outputs):
                    continue
                # Safe nginx if-return: preserve original legacy map branches.
                require(map_name in ['$naumi47_compat_api', '$naumi47_compat_page', '$naumi47_auth_login_backend'],
                        'UNKNOWN_MAINTENANCE_MAP')
                replacement = 'if (' + map_name + ' = ' + candidate_origin + ') { return 503; }\n' + parsed.files[name][node.start:node.end]
            else: continue
            edits.setdefault(name, []).append((node.start, node.end, replacement)); count += 1
    require(count > 0, 'NO_NAUMI_MAINTENANCE_DISPATCH_FOUND')
    bodies = dict(parsed.files)
    for name, changes in edits.items():
        for begin, end, body in sorted(changes, reverse=True):
            bodies[name] = bodies[name][:begin] + body + bodies[name][end:]
    after = parsed.render({n:b for n,b in bodies.items() if b != parsed.files[n]})
    patches = {n:b for n,b in compat.Dump(after).files.items() if b != original.files[n]}
    report = {'schemaVersion': 1, 'kind': 'naumi47-one-time-maintenance',
              'configClosureValidated': True, 'beforeDumpSha256': sha(baseline_dump.encode()),
              'afterDumpSha256': sha(after.encode()), 'maintenanceDispatches': count,
              'continuousBlueGreen': False, 'legacyDrainProven': False, 'oldClientComplete': False,
              'candidateOrigin': candidate_origin, 'legacy17847Preserved': True}
    # This verifies exact original raw bytes and normalizes only nginx -T separators.
    compat.write_gateway_bundle(baseline_dump, patches, after, report, output, source_files)
    return report


def freeze_legacy_caller(tx, identity, *, expected_script_sha256):
    """Pause only the audited HTTP tick caller, never the App or supplier executor.

    A frozen caller can still have a tick response outstanding. Old App continues;
    this receipt deliberately says UNKNOWN and must not satisfy assert_drain().
    """
    row = tx.pin(identity)
    require(row['Name'].lstrip('/').startswith(tx.spec['prefix']) and row['State']['Running'] is True and
            row['State'].get('Paused') is False and row['Config']['Cmd'] in
            [['scripts/video-worker.mjs'], ['node', 'scripts/video-worker.mjs']], 'AUDITED_LEGACY_CALLER_REQUIRED')
    env = environment(row)
    require(env.get('NAUMI_WORKER_RELEASE_CONTROL') != '1', 'USE_CONTROLLED_WORKER_DRAIN_INSTEAD')
    actual = tx.run(['docker', 'exec', identity['id'], 'cat', '/app/scripts/video-worker.mjs'])
    require(re.fullmatch('[a-f0-9]{64}', expected_script_sha256 or '') and
            sha(actual) == expected_script_sha256, 'LEGACY_CALLER_SCRIPT_IDENTITY_CHANGED')
    tx.save('legacy-caller-freeze-intent-' + identity['id'][:12] + '.json',
            {'identity': identity, 'scriptSha256': expected_script_sha256, 'appRequestsMayContinue': True})
    tx.run(['docker', 'pause', identity['id']])
    result = tx.inspect(identity['id'])
    require(public_identity(result) == identity and result['State'].get('Paused') is True,
            'LEGACY_CALLER_FREEZE_UNKNOWN')
    receipt = {'identity': identity, 'frozen': True, 'coverage': 'legacy-unknown',
               'activeTicks': None, 'acceptedTasks': None, 'appRequestsMayContinue': True,
               'nextAction': 'preserve-and-audit-App-work-before-migration', 'replayedTasks': False}
    tx.save('legacy-caller-frozen-' + identity['id'][:12] + '.json', receipt)
    return receipt


def restore_frozen_caller(tx, identity, *, candidate_worker_quiescent):
    """Rollback only. Never unpause both old and new pollers concurrently."""
    row = tx.pin(identity)
    require(candidate_worker_quiescent is True and row['State'].get('Paused') is True,
            'PAUSED_NEW_WORKER_AND_FROZEN_OLD_REQUIRED')
    tx.save('legacy-caller-restore-intent-' + identity['id'][:12] + '.json', {'identity': identity})
    tx.run(['docker', 'unpause', identity['id']])
    require(tx.inspect(identity['id'])['State'].get('Paused') is False, 'CALLER_RESTORE_UNKNOWN')
    return {'restored': True, 'databaseRestored': False, 'taskPostReplayIssued': False}


def validate_preservation(before, after, result):
    require(before.get('databaseIdentitySha256') == after.get('databaseIdentitySha256') and
            re.fullmatch('[a-f0-9]{64}', before.get('databaseIdentitySha256', '')),
            'PRESERVATION_DATABASE_IDENTITY_CHANGED')
    require(result.get('noMissingJobs') is True and result.get('noOriginalSupplierMutation') is True,
            'ACCEPTED_TASK_PRESERVATION_NOT_VERIFIED')
    require(result.get('preservationVerified') is True and not result.get('violations') and
            not result.get('unknownTables') and before.get('preservationComplete') is True and
            after.get('preservationComplete') is True, 'TASK_SNAPSHOT_COVERAGE_UNKNOWN')
    return {'taskDataPreserved': True, 'legacyDrainProven': False, 'replayedTasks': False,
            'databaseRestored': False, 'maintenanceException': DATE}
