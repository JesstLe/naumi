"""Provenance of timeline-rules outputs, not an aggregate release decision."""
from pathlib import Path
import hashlib
import json


def verified_timeline_vectors(vector_root: Path, image_source: dict) -> dict:
    vector_root = vector_root.resolve()

    def require(condition: bool, code: str) -> None:
        if not condition:
            raise ValueError('TIMELINE_VECTORS_' + code)

    report_path = vector_root.parent / 'REPORT.json'
    core = json.loads(report_path.read_text(encoding='utf8'))
    source = core.get('source', {})
    require(source.get('commit') == image_source['commit'] and
            source.get('digest') == image_source['digest'] and
            source.get('dirty') is False, 'SOURCE_MISMATCH')
    require(core.get('status') in ('PASS', 'PARTIAL', 'FAIL'), 'REPORT_NOT_TERMINAL')
    owners = [row for row in core.get('cases', []) if row.get('id') == 'timeline-rules']
    require(len(owners) == 1 and vector_root.name == 'timeline-rules', 'OWNER_REQUIRED')
    owner = owners[0]
    require(owner.get('status') == 'PASS' and owner.get('exit') == 0 and
            owner.get('marker') is True, 'OWNER_NOT_PASSED')
    log = Path(owner['log']).resolve()
    require(log.parent == vector_root.parent and log.is_file(), 'OWNER_LOG_REQUIRED')
    log_bytes = log.read_bytes()
    log_hash = hashlib.sha256(log_bytes).hexdigest()
    require(log_hash == owner.get('logSha256') and b'TIMELINE_CORE=PASS' in log_bytes,
            'OWNER_LOG_CHANGED')
    filenames = ('result.json', 'red.mp4', 'blue.mp4', 'music.wav', 'green.png')
    hashes = {}
    for name in filenames:
        file = vector_root / name
        require(file.is_file() and not file.is_symlink() and
                file.resolve().is_relative_to(vector_root) and file.stat().st_size > 0,
                'ARTIFACT_REQUIRED:' + name)
        hashes[name] = hashlib.sha256(file.read_bytes()).hexdigest()
    vector = json.loads((vector_root / 'result.json').read_text(encoding='utf8'))
    require(vector.get('realFfmpeg') is True and
            vector.get('existingEngineVirtualCommand') is True, 'REAL_VECTORS_REQUIRED')
    # Preserve aggregate failure. Passing this dependency never certifies core.
    return {'source': source['commit'], 'sourceDigest': source['digest'],
            'ownerCase': 'timeline-rules', 'ownerStatus': 'PASS',
            'parentStatus': core['status'], 'parentCompleteCore': core.get('completeCore', False),
            'reportSha256': hashlib.sha256(report_path.read_bytes()).hexdigest(),
            'logSha256': log_hash, 'fileHashes': hashes}
