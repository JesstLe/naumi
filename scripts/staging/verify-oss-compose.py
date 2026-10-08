#!/usr/bin/env python3
"""Validate the opt-in overlay using baseline invariants without leaking secrets."""
import copy
import json
import re
import sys
import importlib.util
from pathlib import Path
from urllib.parse import urlsplit
spec = importlib.util.spec_from_file_location('staging_baseline', Path(__file__).with_name('verify-compose.py'))
baseline_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline_module)

def verify_storage(env):
    endpoint = urlsplit(env['S3_ENDPOINT'])
    assert endpoint.scheme == 'https', 'HTTPS endpoint'
    region = env['S3_REGION']
    assert re.fullmatch(r'[a-z]{2}-[a-z0-9-]+', region), 'region syntax'
    # Alibaba's documented S3 compatibility endpoint, not the native OSS API.
    assert endpoint.hostname in (f's3.oss-{region}.aliyuncs.com', f's3.oss-{region}-internal.aliyuncs.com'), 'S3 endpoint must match region'
    assert endpoint.port in (None, 443) and not endpoint.username and not endpoint.password, 'endpoint authority'
    assert endpoint.path in ('', '/') and not endpoint.query and not endpoint.fragment, 'endpoint has no bucket/path/query'
    for name in ('S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'):
        assert env.get(name) and not any(c in env[name] for c in '\r\n\x00'), 'required field: '+name
    assert re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', env['S3_BUCKET']), 'bucket syntax'

def verify(base, merged):
    baseline_module.verify(base)
    env = merged['services']['app']['environment']
    assert env['STORAGE_DRIVER'] == 's3', 'explicit S3 overlay'
    assert env['S3_FORCE_PATH_STYLE'] == 'false', 'virtual host addressing'
    assert not env['S3_PUBLIC_BASE_URL'], 'private media proxy URL retained'
    verify_storage(env)
    # Every other resolved value, including image, DB, Router, guard, Worker,
    # loopback port and retained local media mount, must remain unchanged.
    normalized = copy.deepcopy(merged)
    target_env = normalized['services']['app']['environment']
    original_env = base['services']['app']['environment']
    for key in ('STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID',
                'S3_SECRET_ACCESS_KEY', 'S3_BUCKET', 'S3_FORCE_PATH_STYLE', 'S3_PUBLIC_BASE_URL'):
        if key in original_env:
            target_env[key] = original_env[key]
        else:
            target_env.pop(key, None)
    assert normalized == base, 'overlay altered non-storage configuration'

if __name__ == '__main__':
    try:
        verify(*(json.loads(Path(p).read_text(encoding='utf-8')) for p in sys.argv[1:3]))
    except (AssertionError, KeyError, ValueError, IndexError, TypeError):
        print('OSS_COMPOSE=FAIL CONFIG_REDACTED=1')
        sys.exit(1)
    print('OSS_COMPOSE=PASS OVERLAY_ONLY=1 DATABASE_UNCHANGED=1 IMAGE_UNCHANGED=1 HISTORY_GUARD=1 MEDIA_URL=PRIVATE_PROXY')
