"""Fixture-state tests; real FFmpeg/App/Worker acceptance remains separate."""
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib
import json
from verification.runtime_vectors import verified_timeline_vectors

source = {'commit': 'a' * 40, 'digest': 'b' * 64, 'dirty': False}
checks = 0


def case(label, change=None, expected=None, parent='FAIL'):
    global checks
    with TemporaryDirectory(prefix='naumi-vector-contract-') as folder:
        root = Path(folder)
        vectors = root / 'timeline-rules'
        vectors.mkdir()
        log = root / 'timeline-rules.log'
        log.write_text('TIMELINE_CORE=PASS CASES=108\n', encoding='utf8')
        for filename in ('red.mp4', 'blue.mp4', 'music.wav', 'green.png'):
            (vectors / filename).write_bytes(b'fixture-state-not-real-media')
        (vectors / 'result.json').write_text(json.dumps({'realFfmpeg': True, 'existingEngineVirtualCommand': True}), encoding='utf8')
        report = {'source': dict(source), 'status': parent, 'completeCore': parent == 'PASS',
                  'cases': [{'id': 'timeline-rules', 'status': 'PASS', 'exit': 0, 'marker': True,
                             'log': str(log), 'logSha256': hashlib.sha256(log.read_bytes()).hexdigest()}]}
        if change:
            change(report, vectors, log)
        (root / 'REPORT.json').write_text(json.dumps(report), encoding='utf8')
        try:
            proof = verified_timeline_vectors(vectors, source)
            assert expected is None, label + ': expected rejection'
            assert proof['parentStatus'] == parent and proof['parentCompleteCore'] == (parent == 'PASS')
            assert proof['ownerStatus'] == 'PASS' and len(proof['fileHashes']) == 5
        except ValueError as error:
            assert expected and expected in str(error), (label, str(error))
        checks += 1


for status in ('PASS', 'PARTIAL', 'FAIL'):
    case('passed owner preserves parent ' + status, parent=status)
case('wrong commit', lambda r, v, l: r['source'].update(commit='c' * 40), 'SOURCE_MISMATCH')
case('wrong digest', lambda r, v, l: r['source'].update(digest='c' * 64), 'SOURCE_MISMATCH')
case('dirty source', lambda r, v, l: r['source'].update(dirty=True), 'SOURCE_MISMATCH')
case('running parent', lambda r, v, l: r.update(status='RUNNING'), 'REPORT_NOT_TERMINAL')
case('missing owner', lambda r, v, l: r.update(cases=[]), 'OWNER_REQUIRED')
case('duplicate owner', lambda r, v, l: r['cases'].append(dict(r['cases'][0])), 'OWNER_REQUIRED')
for status in ('FAIL', 'NOT_RUN', 'RUNNING'):
    case('owner ' + status, lambda r, v, l, status=status: r['cases'][0].update(status=status), 'OWNER_NOT_PASSED')
case('nonzero exit', lambda r, v, l: r['cases'][0].update(exit=1), 'OWNER_NOT_PASSED')
case('missing marker', lambda r, v, l: r['cases'][0].update(marker=False), 'OWNER_NOT_PASSED')
case('changed log', lambda r, v, l: l.write_text('TIMELINE_CORE=PASS changed', encoding='utf8'), 'OWNER_LOG_CHANGED')
case('foreign log', lambda r, v, l: r['cases'][0].update(log=str(v / 'other.log')), 'OWNER_LOG_REQUIRED')
case('missing media', lambda r, v, l: (v / 'red.mp4').unlink(), 'ARTIFACT_REQUIRED')
case('empty media', lambda r, v, l: (v / 'red.mp4').write_bytes(b''), 'ARTIFACT_REQUIRED')
case('not real vectors', lambda r, v, l: (v / 'result.json').write_text('{}', encoding='utf8'), 'REAL_VECTORS_REQUIRED')
print(f'RUNTIME_VECTOR_CONTRACT=PASS CASES={checks} PARENT_FAILURE=PRESERVED SOURCE_LOG_OWNER=CHECKED NETWORK=0 PG=0')
