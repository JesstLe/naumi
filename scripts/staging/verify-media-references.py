#!/usr/bin/env python3
"""Read frozen DB references; report missing files without rewriting history."""
import json,subprocess,sys
from pathlib import Path
from urllib.parse import unquote
from dotenv import dotenv_values
root=Path('/opt/naumi-staging'); media=root/'data/media'
assert not Path('/opt/naumi/current').exists(), 'staging host required'
source=dotenv_values(root/'snapshots/20261008-full/production.env',interpolate=False)
base=(source.get('S3_PUBLIC_BASE_URL') or '').rstrip('/')
refs=set()
def walk(x):
 if isinstance(x,str):
  if x.startswith('/media/'): key=x[len('/media/'):].split('?',1)[0]
  elif base and x.startswith(base+'/'):key=x[len(base)+1:].split('?',1)[0]
  else:return
  key=unquote(key)
  if key and media.resolve() in (media/key).resolve().parents:refs.add(key)
 elif isinstance(x,list):
  for y in x:walk(y)
 elif isinstance(x,dict):
  for y in x.values():walk(y)
sql="SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
args=['docker','exec','naumi-staging-db-1','psql','-X','-U','naumi_staging','-d','naumi_snapshot_reference','-v','ON_ERROR_STOP=1','-Atc']
tables=subprocess.check_output(args+[sql],text=True).splitlines()
for t in tables:
 data=subprocess.check_output(args+['SELECT row_to_json(r) FROM public."'+t.replace('"', '""')+'" r'],text=True)
 for line in data.splitlines():walk(json.loads(line))
missing=sorted(k for k in refs if not (media/k).is_file())
source_keys={x['Path'] for x in json.loads((root/'snapshots/20261008-full/s3-source-manifest.json').read_text())}
result={'missing_in_source_manifest':sum(k not in source_keys for k in missing),'managed_reference_keys':len(refs),'present':len(refs)-len(missing),'missing':len(missing)}
out=root/'evidence/media-references.json';out.write_text(json.dumps({'summary':result,'missing_keys':missing},indent=2));out.chmod(0o600)
print('MEDIA_REFERENCES='+json.dumps(result,sort_keys=True))

sys.exit(2 if missing else 0)
