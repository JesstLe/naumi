"""Read-only, explicit recognition of a completed 103 direct-release predecessor.

This is not a replacement for task/lease collection or a claim of historical
drain. A direct release has no per-operation ACK journal: immutable final
receipts, its exact canonical transition and actual container identities are
the evidence. No journal is rewritten and no missing ACK is manufactured.
"""
import copy
import json
import pathlib
import re

from release47_host import require, public_identity, environment, sha, file_sha

FILES = ('FINAL_STATUS.json', 'FINAL_ACCEPTANCE.json', 'PROGRAM_DEPLOYED.json',
         'PROGRESS.json', 'BACKUP.json', 'DRAIN.json', 'web-baseline.private.json',
         'worker-baseline.private.json', 'canonical-before.private.json')
ROLES = {'web', 'worker'}
TERMINAL = {'COMPLETE', 'ABORTED', 'ROLLED_BACK', 'SUPERSEDED_BY_AUTHORIZED_REPLACEMENT'}
ACK = {'ACKNOWLEDGED', 'REJECTED_PRECONDITION'}


def validate_config(c):
    d = c.get('direct103Predecessor')
    if d is None:
        return
    require(c.get('target') == '103.30.76.93' and c.get('abortedPredecessor') is None,
            'DIRECT103_EXPLICIT_SUCCESSOR_ONLY')
    require(isinstance(d, dict) and set(d) == {'releaseId', 'canonicalSha256',
            'canonicalRevision', 'oldCommit', 'oldImage', 'oldPins', 'retiredPins',
            'evidenceSha256'}, 'DIRECT103_PREDECESSOR_SPEC_REQUIRED')
    require(isinstance(d['releaseId'], str) and re.fullmatch(r'release103-[a-z0-9-]{6,70}', d['releaseId'])
            and d['releaseId'] != c.get('releaseId'), 'DIRECT103_PREDECESSOR_ID_REQUIRED')
    require(all(d.get(k) == c.get(k) for k in ['canonicalSha256', 'canonicalRevision',
            'oldCommit', 'oldImage', 'oldPins']), 'DIRECT103_BASELINE_BINDING_CHANGED')
    require(isinstance(d['retiredPins'], dict) and set(d['retiredPins']) == ROLES
            and all(isinstance(p, dict) and set(p) == {'id', 'name', 'image', 'running',
                    'startedAt', 'restartPolicy'} and p['running'] is False and p['restartPolicy'] == 'no'
                    and isinstance(p.get('id'), str) and re.fullmatch('[a-f0-9]{64}', p['id'])
                    for p in d['retiredPins'].values()),
            'DIRECT103_RETIRED_PINS_REQUIRED')
    require(isinstance(d['evidenceSha256'], dict) and set(d['evidenceSha256']) == set(FILES)
            and all(isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v)
                    for v in d['evidenceSha256'].values()), 'DIRECT103_EVIDENCE_HASHES_REQUIRED')


def _known_operations(record):
    operations = record.get('operations', {})
    require(isinstance(operations, dict) and all(isinstance(op, dict) and
            op.get('phase') in ACK for op in operations.values()), 'DIRECT103_OPERATION_UNKNOWN')


def _no_unresolved_release(state):
    require(state.get('status') not in ['UNKNOWN', 'ROLLBACK_FAILED', 'CLEANUP_PENDING'],
            'DIRECT103_CANONICAL_UNRESOLVED')
    _known_operations(state)
    for key, records in state.items():
        if not key.endswith('Releases'):
            continue
        require(isinstance(records, dict), 'DIRECT103_RELEASE_MAP_INVALID')
        for record in records.values():
            require(isinstance(record, dict) and record.get('phase') in TERMINAL and
                    record.get('status') not in ['UNKNOWN', 'ROLLBACK_FAILED', 'CLEANUP_PENDING'],
                    'DIRECT103_RELEASE_UNRESOLVED')
            _known_operations(record)


def recognize(state, c, evidence_root, inspect):
    """All I/O is read-only. Caller has already checked canonical raw hash/CAS.

    `inspect(id)` is the existing transaction's pinned Docker read. Evidence is
    loaded only from the fixed predecessor directory, never a spec-supplied path.
    """
    validate_config(c)
    d = c['direct103Predecessor']; rid = d['releaseId']
    require(state.get('revision') == d['canonicalRevision'] and
            state.get('activeDirect103ReleaseId') == rid, 'DIRECT103_ACTIVE_PREDECESSOR_CHANGED')
    _no_unresolved_release(state)
    previous = state.get('direct103Releases', {}).get(rid)
    require(isinstance(previous, dict) and previous.get('phase') == 'COMPLETE' and
            previous.get('mode') == 'DIRECT_REPLACE_USER_AUTHORIZED' and
            previous.get('commit') == c['oldCommit'] and previous.get('image') == c['oldImage'] and
            previous.get('oldStopped') is True and previous.get('databaseRestored') is False and
            previous.get('tasksReplayed') is False and previous.get('modelConfigUnchanged') is True,
            'DIRECT103_PREDECESSOR_NOT_COMPLETE')
    folder = pathlib.Path(evidence_root) / rid
    require(folder.is_dir() and not folder.is_symlink(), 'DIRECT103_EVIDENCE_DIRECTORY_REQUIRED')
    require(not any((folder / name).exists() for name in ['UNKNOWN.json', 'ROLLBACK_FAILED.json', 'FAILURE.json']),
            'DIRECT103_PRIOR_FAILURE_RECONCILIATION_REQUIRED')
    docs = {}; raw = {}
    for name in FILES:
        path = folder / name
        require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 8 * 1024**2,
                'DIRECT103_EVIDENCE_FILE_REQUIRED')
        raw[name] = path.read_bytes()
        require(sha(raw[name]) == d['evidenceSha256'][name], 'DIRECT103_EVIDENCE_CHANGED')
        docs[name] = json.loads(raw[name])
        require(isinstance(docs[name], dict), 'DIRECT103_EVIDENCE_OBJECT_REQUIRED')
    final, program, accepted, progress, backup = (docs[n] for n in
        ['FINAL_STATUS.json', 'PROGRAM_DEPLOYED.json', 'FINAL_ACCEPTANCE.json', 'PROGRESS.json', 'BACKUP.json'])
    require(final.get('activeRelease') == rid and final.get('release') == previous and
            final.get('canonicalRevision') == state['revision'] and
            final.get('progress') == progress and progress.get('phase') == 'COMPLETE' and
            progress.get('canonicalRevision') == state['revision'], 'DIRECT103_FINAL_RECEIPT_MISMATCH')
    before = docs['canonical-before.private.json']
    require(type(before.get('revision')) is int and before['revision'] + 1 == state['revision'],
            'DIRECT103_CANONICAL_TRANSITION_CHANGED')
    expected = copy.deepcopy(before)
    expected['revision'] += 1
    expected.setdefault('direct103Releases', {})[rid] = previous
    expected['activeDirect103ReleaseId'] = rid
    require(expected == state, 'DIRECT103_CANONICAL_HISTORY_CHANGED')
    identity = {'commit': c['oldCommit'], 'version': previous.get('version')}
    require(isinstance(identity['version'], str) and re.fullmatch('[0-9]{10}', identity['version']) and
            all(program.get(k) == v and accepted.get(k) == v for k, v in identity.items()) and
            program.get('image') == c['oldImage'] and program.get('public') == identity and
            program.get('releaseMode') == previous['mode'] and program.get('oldStopped') is True and
            program.get('new') == previous.get('new') and program.get('modelConfigUnchanged') is True and
            program.get('originalOperationsUnchanged') is True and program.get('applicationDataRestored') is False and
            program.get('health', {}).get('db', {}).get('ok') is True and
            accepted.get('programVerified') is True and accepted.get('passed') is True and
            accepted.get('originalOperationsAndAccountingUnchanged') is True and
            accepted.get('originalUnknownPreserved') is True, 'DIRECT103_ACCEPTANCE_IDENTITY_MISMATCH')
    require(backup.get('canonicalSha256') == sha(raw['canonical-before.private.json']) and
            backup.get('tocVerified') is True and backup.get('databaseRestore') is False and
            backup.get('model') == program.get('model') and
            type(backup.get('dumpBytes')) is int and backup['dumpBytes'] > 0,
            'DIRECT103_BACKUP_RECEIPT_MISMATCH')
    dump = folder / 'database-before.dump'
    require(dump.is_file() and not dump.is_symlink() and dump.stat().st_size == backup['dumpBytes'] and
            file_sha(dump) == backup.get('dumpSha256'), 'DIRECT103_BACKUP_UNREADABLE_OR_CHANGED')
    require(set(program.get('old', {})) == set(program.get('new', {})) == set(final.get('containers', {})) == ROLES,
            'DIRECT103_EXACT_PAIR_REQUIRED')
    actual_pins = {}; retired_pins = {}
    for role in sorted(ROLES):
        new_ref = program['new'][role]; old_ref = program['old'][role]
        pin = c['oldPins'][role]; retired_pin = d['retiredPins'][role]
        require(new_ref == {'id': pin['id'], 'name': pin['name']} and
                old_ref == {'id': retired_pin['id']} and pin['name'] == c['oldNames'][role] and
                pin['image'] == c['oldImage'] and pin['running'] is True and
                pin['restartPolicy'] == 'unless-stopped' and pin['id'] != retired_pin['id'],
                'DIRECT103_PAIR_BINDING_CHANGED')
        live = inspect(pin['id']); retired = inspect(retired_pin['id'])
        require(public_identity(live) == pin and environment(live).get('SOURCE_COMMIT') == c['oldCommit'] and
                environment(live).get('BUILD_VERSION') == identity['version'] and not live['State'].get('OOMKilled'),
                'DIRECT103_LIVE_INSTANCE_CHANGED')
        baseline = docs[role + '-baseline.private.json']
        expected_retired = {**public_identity(baseline), 'running': False, 'restartPolicy': 'no'}
        require(expected_retired == retired_pin and public_identity(retired) == retired_pin and
                retired['State'].get('ExitCode') in [0, 143] and retired['State'].get('OOMKilled') is False,
                'DIRECT103_RETIRED_INSTANCE_CHANGED')
        row = final['containers'][role]
        require(row.get('newId') == pin['id'] and row.get('state') == 'running' and
                row.get('image') == c['oldImage'] and row.get('oldState') == 'exited' and
                row.get('oldRestart') == 'no', 'DIRECT103_FINAL_CONTAINER_MISMATCH')
        actual_pins[role] = public_identity(live); retired_pins[role] = public_identity(retired)
    require(len({p['id'] for p in [*actual_pins.values(), *retired_pins.values()]}) == 4,
            'DIRECT103_DISTINCT_INSTANCES_REQUIRED')
    drain = docs['DRAIN.json']; app = drain.get('app', {}); worker = drain.get('worker', {})
    require(app.get('identity', {}).get('instanceId') == retired_pins['web']['name'] and
            app.get('identity', {}).get('commit') == environment(docs['web-baseline.private.json']).get('SOURCE_COMMIT') and
            worker.get('instanceId') == retired_pins['worker']['name'] and
            worker.get('commit') == environment(docs['worker-baseline.private.json']).get('SOURCE_COMMIT') and
            worker.get('phase') == 'QUIESCENT' and worker.get('paused') is True and
            type(worker.get('activeTicks')) is int and worker['activeTicks'] == 0 and
            type(worker.get('unresolvedTicks')) is int and worker['unresolvedTicks'] == 0 and
            worker.get('controlFault') is None, 'DIRECT103_DRAIN_RECEIPT_MISMATCH')
    observed = app.get('observations', {})
    require(app.get('admission', {}).get('mode') == 'draining' and
            all(type(observed.get(k)) is int and observed[k] == 0 for k in
                ['activeRequests', 'trackedRequests', 'trackedAcceptedWork', 'agentRuns', 'unknownLeases']),
            'DIRECT103_RETIRED_WORK_STILL_ACTIVE_OR_UNKNOWN')
    media = worker.get('mediaWorker', {})
    require(media.get('ok') is True and media.get('draining') is True and
            all(type(media.get(k)) is int and media[k] == 0 for k in ['running', 'queued']),
            'DIRECT103_RETIRED_MEDIA_UNRESOLVED')
    # Preserve the exact partial coverage, never coerce null acceptedTasks to 0.
    proof = {'releaseId': rid, 'type': 'direct-release-final-evidence',
             'canonicalSha256': c['canonicalSha256'], 'canonicalRevision': state['revision'],
             'evidenceSha256': copy.deepcopy(d['evidenceSha256']), 'livePins': actual_pins,
             'retiredPins': retired_pins, 'operationJournalClaimed': False,
             'historicalDrainCoverage': copy.deepcopy(app.get('coverage')),
             'historicalObservations': copy.deepcopy(app.get('observations')),
             'historicalTaskClosureClaimed': False, 'currentTaskSnapshotStillRequired': True}
    return copy.deepcopy(previous), proof
