#!/usr/bin/env python3
"""Prepare independent Router from private snapshot; never print credentials."""
import hashlib
import os
import secrets
import shutil
from pathlib import Path
from dotenv import dotenv_values

root = Path('/opt/naumi-staging')
assert not Path('/opt/naumi/current').exists()
assert 'ENVIRONMENT=staging' in (root / 'ENVIRONMENT').read_text().splitlines()
snapshot = root / 'snapshots/20261008-full/router'
work = root / 'router'
envfile = root / 'config/router.env'
assert not envfile.exists(), 'Inspect existing Router setup before replacement'
source = dotenv_values(snapshot / 'router.env', interpolate=False)
assert len(source.get('MODEL_CONFIG_ENVELOPE_SECRET', '')) >= 32
work.mkdir(mode=0o700, exist_ok=False)
(work / 'bin').mkdir(mode=0o700)
(work / 'config').mkdir(mode=0o700)
(work / 'state/configurations').mkdir(mode=0o700, parents=True)
shutil.copy2(snapshot / 'bin/naumi-router', work / 'bin/naumi-router')
os.chmod(work / 'bin/naumi-router', 0o750)
shutil.copy2(snapshot / 'config/routes.apimart.server.json', work / 'config/routes.json')
shutil.copy2(snapshot / 'configurations/configurations.db', work / 'state/configurations/configurations.db')
assert hashlib.sha256((snapshot / 'configurations/configurations.db').read_bytes()).digest() == hashlib.sha256((work / 'state/configurations/configurations.db').read_bytes()).digest()
values = {k: v for k, v in source.items() if v is not None}
values.update({
    'NAUMI_ROUTER_TOKEN': secrets.token_urlsafe(48),
    'NAUMI_ROUTER_MANAGEMENT_TOKEN': secrets.token_urlsafe(48),
    'NAUMI_HTTP_ADDR': '172.18.0.1:18081',
    'NAUMI_ROUTER_MANAGEMENT_ADDR': '172.18.0.1:18082',
    'NAUMI_ROUTES_CONFIG': str(work / 'config/routes.json'),
    'NAUMI_STATE_DIR': str(work / 'state'),
    'NAUMI_CONFIG_STATE_DIR': str(work / 'state/configurations'),
    'NAUMI_MODEL_CAPACITY_URL': 'http://127.0.0.1:13012/api/internal/model-capacity',
    'NAUMI_ALLOW_LEGACY_REQUESTS': 'false',
    'NAUMI_EXPOSE_ROUTE_DEBUG': 'false',
})
# The config remains private. Reject newlines so systemd cannot parse injected fields.
for v in values.values():
    assert not any(c in v for c in '\r\n\x00')
fd = os.open(envfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    for k, v in values.items():
        f.write(k + '="' + v.replace('\\', '\\\\').replace('"', '\\"') + '"\n')
print('STAGING_ROUTER_PREPARED=PASS TOKENS=INDEPENDENT EXECUTION_STORE=EMPTY CONFIG_STORE=BOLT_COPY')
