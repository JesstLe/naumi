#!/usr/bin/env python3
"""Verify local media against the frozen source listing; never delete media."""
import hashlib
import json
import sys
from pathlib import Path

root = Path('/opt/naumi-staging')
assert not Path('/opt/naumi/current').exists()
snap = root/'snapshots/20261008-full'
source = json.loads((snap/'s3-source-manifest.json').read_text())
media = root/'data/media'
missing = wrong_size = wrong_hash = hashed = 0
for obj in source:
    key = obj['Path']
    p = media/key
    assert media.resolve() in p.resolve().parents and not p.is_symlink(), 'invalid media path'
    if not p.is_file(): missing += 1; continue
    if p.stat().st_size != obj['Size']: wrong_size += 1; continue
    hashes = {k.lower(): v for k,v in obj.get('Hashes',{}).items()}
    expected = hashes.get('md5')
    if expected:
        h = hashlib.md5()
        with p.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
        hashed += 1
        if h.hexdigest().lower() != expected.lower(): wrong_hash += 1
result = {'source_objects':len(source), 'source_bytes':sum(x['Size'] for x in source),
          'missing':missing,'wrong_size':wrong_size,'md5_checked':hashed,'wrong_hash':wrong_hash,
          'copy_finished':(snap/'MEDIA_S3_IMPORTED').exists()}
out = root/'evidence/media-verification.json'
out.write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
out.chmod(0o600)
print('MEDIA_VERIFY='+json.dumps(result,sort_keys=True))
if missing or wrong_size or wrong_hash or not result['copy_finished']: sys.exit(2)
if hashed != len(source):
    print('MEDIA_CONTENT_VERIFICATION=REQUIRED_DOWNLOAD_CHECK');sys.exit(3)
print('MEDIA_CONTENT_VERIFICATION=PASS FULL_MANIFEST_MD5=1')
