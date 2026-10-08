#!/usr/bin/env python3
"""Whitelist source settings into a private staging file, without logging values."""
import os
import re
import secrets
import sys
from pathlib import Path
from dotenv import dotenv_values

root = Path('/opt/naumi-staging')
assert not Path('/opt/naumi/current').exists()
assert 'ENVIRONMENT=staging' in (root/'ENVIRONMENT').read_text().splitlines()
assert len(sys.argv) == 2 and re.fullmatch('[0-9a-f]{40}', sys.argv[1])
target = root/'config/.env'
assert not target.exists(), 'Inspect existing app config before replacement'
production = dotenv_values(root/'snapshots/20261008-full/production.env', interpolate=False)
restore = dotenv_values(root/'config/.env.db-restore', interpolate=False)
router = dotenv_values(root/'config/router.env', interpolate=False)
assert len(production.get('SETTINGS_SECRET', '')) >= 32
allowed = '''SETTINGS_SECRET OPENAI_API_KEY OPENAI_BASE_URL OPENAI_IMAGE_MODEL OPENAI_IMAGE_MODELS OPENAI_TEXT_MODEL
OPENAI_CUTOUT_MODEL REPLICATE_API_TOKEN REPLICATE_CUTOUT_MODEL
AGENT_API_KEY AGENT_BASE_URL AGENT_MODEL AGENT_VISION_MODEL AGENT_BACKEND
NEW_API_IMAGE_API_KEY NEW_API_IMAGE_BASE_URL NEW_API_IMAGE_MODELS
REFERENCE_VISION_SOURCE REFERENCE_VISION_MODEL PADDLE_OCR_REQUIRED PADDLE_OCR_FALLBACK_MODEL
PRO_LICENSE_KEY NAUMI_EDITION NAUMI_MULTI_USER NAUMI_BETA_PREVIEW NAUMI_IMAGE_QUALITY_SUPPORTED
VIDEO_API_BASE_URL VIDEO_API_KEY VIDEO_API_MODEL VIDEO_TASK_COST TEXT_MODEL_WHITELIST TEXT_MODEL_ALIASES'''.split()
values = {k: production[k] for k in allowed if production.get(k) is not None}
values.update({
    'NAUMI_STAGING_ENV_FILE': str(target),
    'NAUMI_IMAGE': 'ghcr.io/jesstle/naumi:'+sys.argv[1],
    'POSTGRES_USER': 'naumi_staging', 'POSTGRES_DB': 'naumi_staging',
    'POSTGRES_PASSWORD': restore['POSTGRES_PASSWORD'],
    'DATABASE_URL': 'postgres://naumi_staging:'+restore['POSTGRES_PASSWORD']+'@db:5432/naumi_staging?sslmode=disable',
    'VIDEO_WORKER_SECRET': secrets.token_urlsafe(48),
    'NAUMI_ROUTER_STATE_DOMAIN': 'naumi-staging-'+secrets.token_hex(8),
    'NAUMI_ROUTER_GENERATION_URL': 'http://172.18.0.1:18081/v1',
    'NAUMI_ROUTER_GENERATION_TOKEN': router['NAUMI_ROUTER_TOKEN'],
    'NAUMI_ROUTER_MANAGEMENT_URL': 'http://172.18.0.1:18082',
    'NAUMI_ROUTER_MANAGEMENT_TOKEN': router['NAUMI_ROUTER_MANAGEMENT_TOKEN'],
    'NAUMI_ROUTER_COST_URL': 'http://172.18.0.1:18081',
    'NAUMI_ROUTER_COST_TOKEN': router['NAUMI_ROUTER_TOKEN'],
    'MODEL_CONFIG_ENVELOPE_SECRET': router['MODEL_CONFIG_ENVELOPE_SECRET'],
    'MODEL_CONFIG_TRUSTED_ORIGINS': 'http://172.18.0.1:18081,http://172.18.0.1:18082',
    'STORAGE_DRIVER': 'local', 'MEDIA_DIR': '/data/media',
    'INTERNAL_APP_ORIGIN': 'http://127.0.0.1:3000',
    'NAUMI_ENVIRONMENT': 'staging', 'NAUMI_STAGING_HISTORY_GUARD': '1',
    'NAUMI_VIDEO_WORKER': '0', 'NAUMI_PUBLIC_COMMERCE': '0',
    'NEXT_PUBLIC_RECHARGE_ENABLED': 'false',
    # The source-only NAS credentials, notifications and old internal dependencies are excluded.
    'YUTANG_API_BASE': '', 'YUTANG_USER': '', 'YUTANG_PASS': '',
    'PADDLE_OCR_BASE_URL': '', 'PADDLE_OCR_API_KEY': '',
})
for k,v in values.items():
    assert v is not None and not any(x in v for x in '\r\n\x00'), k
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    for k,v in values.items():
        f.write(k+'="'+v.replace('\\','\\\\').replace('"','\\"').replace('$','$$')+'"\n')
print('STAGING_APP_CONFIG=PASS SOURCE=WHITELIST DB=INDEPENDENT ROUTER=INDEPENDENT MEDIA=LOCAL SOURCE_STORAGE_CREDENTIALS=ABSENT APP_STARTED=0')
