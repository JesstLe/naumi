#!/usr/bin/env python3
"""Prepare only independent DB startup settings; never start the application."""
import os
import secrets
from pathlib import Path

ROOT = Path('/opt/naumi-staging')
assert not Path('/opt/naumi/current').exists(), 'Production host rejected'
assert (ROOT / 'ENVIRONMENT').read_text().splitlines()[0] == 'ENVIRONMENT=staging'
target = ROOT / 'config/.env.db-restore'
assert not target.exists(), 'Existing protected DB config must be inspected, not regenerated'
values = {
    'NAUMI_STAGING_ENV_FILE': str(target),
    'NAUMI_IMAGE': 'ghcr.io/jesstle/naumi:84e1afdee61013f3d5320b00bf688ae125b98179',
    'POSTGRES_USER': 'naumi_staging',
    'POSTGRES_DB': 'naumi_staging',
    'POSTGRES_PASSWORD': secrets.token_hex(32),
    'SETTINGS_SECRET': secrets.token_hex(32),
    'VIDEO_WORKER_SECRET': secrets.token_hex(32),
    'NAUMI_ENVIRONMENT': 'staging',
}
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(''.join(f'{key}={value}\n' for key, value in values.items()))
print('STAGING_DB_CONFIG=PASS APP_CONFIG=NOT_ACTIVATED PASSWORD=INDEPENDENT')
