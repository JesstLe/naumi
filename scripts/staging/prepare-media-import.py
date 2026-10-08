#!/usr/bin/env python3
"""Build private GET/list-only import configuration from the frozen env copy."""
import os
from pathlib import Path
from dotenv import dotenv_values

root = Path('/opt/naumi-staging')
assert not Path('/opt/naumi/current').exists()
source = dotenv_values(root / 'snapshots/20261008-full/production.env', interpolate=False)
for key in ('S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION', 'S3_BUCKET'):
    assert source.get(key), 'Source storage setting missing: ' + key
target = root / 'config/media-import.conf'
assert not target.exists(), 'Existing import config must be inspected'
lines = {
    'type': 's3', 'provider': 'Other',
    'access_key_id': source['S3_ACCESS_KEY_ID'],
    'secret_access_key': source['S3_SECRET_ACCESS_KEY'],
    'region': source['S3_REGION'], 'endpoint': 'http://127.0.0.1:13900',
    'force_path_style': 'true', 'no_check_bucket': 'true',
}
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as file:
    file.write('[source]\n' + ''.join(f'{key} = {value}\n' for key, value in lines.items()))
(root / 'config/media-import.bucket').write_text(source['S3_BUCKET'])
os.chmod(root / 'config/media-import.bucket', 0o600)
print('MEDIA_IMPORT_CONFIG=PASS SOURCE=TEMP_LOOPBACK_READ_ONLY_DESTINATION=LOCAL')
