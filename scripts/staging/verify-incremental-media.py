#!/usr/bin/env python3
"""Verify source objects and local references without changing any media."""
import hashlib
import json
import pathlib
import subprocess
import urllib.parse

D = pathlib.Path('/opt/naumi-staging/evidence/data-sync-20261012')
ROOT = pathlib.Path('/opt/naumi-staging/data/media')
source = json.loads((D / 'source-media-manifest.json').read_text())
known = {o['Path']: o for o in source}
missing = []; conflicts = []; checked = 0
for item in source:
    path = (ROOT / item['Path']).resolve()
    assert ROOT in path.parents
    if not path.is_file():
        missing.append(item['Path']); continue
    if path.stat().st_size != item['Size']:
        conflicts.append({'key': item['Path'], 'reason': 'size'}); continue
    md5 = item.get('Hashes', {}).get('md5')
    if not md5:
        conflicts.append({'key': item['Path'], 'reason': 'source-hash-unavailable'}); continue
    h = hashlib.md5()
    with path.open('rb') as f:
        while block := f.read(2 * 1024 * 1024): h.update(block)
    if h.hexdigest() != md5:
        conflicts.append({'key': item['Path'], 'reason': 'content'}); continue
    checked += 1

base = (D / 'source-public-base.txt').read_text().strip().rstrip('/')
refs = set()
def walk(x):
    if isinstance(x, str):
        if x.startswith('/media/'):
            key = x[len('/media/'):].split('?', 1)[0]
        elif base and x.startswith(base + '/'):
            key = x[len(base) + 1:].split('?', 1)[0]
        else: return
        key = urllib.parse.unquote(key)
        if key and ROOT in (ROOT / key).resolve().parents: refs.add(key)
    elif isinstance(x, list):
        for y in x: walk(y)
    elif isinstance(x, dict):
        for y in x.values(): walk(y)

query = "SELECT row_to_json(r) FROM app_artworks r UNION ALL SELECT row_to_json(r) FROM app_canvas_text_nodes r UNION ALL SELECT row_to_json(r) FROM app_agent_sessions r UNION ALL SELECT row_to_json(r) FROM app_image_jobs r UNION ALL SELECT row_to_json(r) FROM app_competitor_items r"
data = subprocess.check_output(['docker', 'exec', 'naumi-staging-db-1', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'naumi_staging', '-d', 'naumi_sync_source_20261012', '-c', query], text=True)
for row in data.splitlines(): walk(json.loads(row))
absent = sorted(k for k in refs if not (ROOT / k).is_file())
result = {'source_objects': len(source), 'size_md5_match': checked,
          'missing_objects': len(missing), 'conflicts': len(conflicts),
          'referenced_keys': len(refs), 'missing_references': len(absent),
          'missing_references_not_in_s3': sum(k not in known for k in absent)}
(D / 'media-verification.json').write_text(json.dumps({'summary': result, 'missing_objects': missing, 'conflicts': conflicts, 'missing_references': absent}, indent=2))
print('MEDIA_VERIFY=' + json.dumps(result, sort_keys=True))
assert not missing, 'SOURCE_OBJECTS_MISSING'
assert not conflicts, 'MEDIA_CONFLICTS_REQUIRE_REVIEW'
