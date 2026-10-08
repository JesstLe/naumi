#!/usr/bin/env python3
"""Read-only Router handshake; no supplier generation or source management writes."""
import json
import urllib.error
import urllib.request
from pathlib import Path
from dotenv import dotenv_values

root = Path('/opt/naumi-staging')
env = dotenv_values(root / 'config/router.env', interpolate=False)
source = dotenv_values(root / 'snapshots/20261008-full/router/router.env', interpolate=False)
assert env['NAUMI_ROUTER_TOKEN'] != source['NAUMI_ROUTER_TOKEN']
assert env['NAUMI_ROUTER_MANAGEMENT_TOKEN'] != source['NAUMI_ROUTER_MANAGEMENT_TOKEN']
assert env['NAUMI_MODEL_CAPACITY_URL'] == 'http://127.0.0.1:13012/api/internal/model-capacity'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(url, token=None):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer '+token} if token else {})
    try:
        with opener.open(req, timeout=10) as r:
            return r.status, r.read(1024*1024)
    except urllib.error.HTTPError as e:
        return e.code, b''
base = 'http://172.18.0.1:18082'
code, _ = request(base+'/internal/config/state')
assert code in (401,403)
code, _ = request(base+'/internal/config/state', source['NAUMI_ROUTER_MANAGEMENT_TOKEN'])
assert code in (401,403)
code, body = request(base+'/internal/config/state', env['NAUMI_ROUTER_MANAGEMENT_TOKEN'])
assert code == 200
state = json.loads(body)
assert isinstance(state.get('digest'), str)
code, _ = request('http://172.18.0.1:18081/v1/models', env['NAUMI_ROUTER_TOKEN'])
assert code == 200
print('STAGING_ROUTER_VERIFY=PASS MANAGEMENT=200 GENERATION_MODELS=200 ORIGINAL_TOKEN=REJECTED UNAUTHENTICATED=REJECTED PROVIDER_CALLS=0')
