#!/usr/bin/env python3
"""Compare a clean source archive to hashes from an explicit git archive COMMIT."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

source, manifest = map(Path, sys.argv[1:])
expected = json.loads(manifest.read_text())
# Only these tracked historic output/audit fixtures were omitted by the clean
# build export. Application source/public/config/lockfiles must all match.
excluded = {k for k in expected if k.startswith(('output/', 'audit-artifacts/'))}
expected = {k: v for k, v in expected.items() if k not in excluded}
with tarfile.open(source) as t:
    actual = {m.name.removeprefix('./'): hashlib.sha256(t.extractfile(m).read()).hexdigest()
              for m in t if m.isfile()}
assert actual == expected, 'runtime source differs from explicit fixed git export'
print(f'RETURN_SOURCE_GIT=PASS TRACKED_FILES={len(actual)} EXCLUDED_TRACKED_ARTIFACTS={len(excluded)}')
