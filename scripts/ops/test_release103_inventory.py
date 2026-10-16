#!/usr/bin/env python3
"""Offline 103 inventory tests; no Docker, SSH or production writes."""
import copy
import json
import os
from pathlib import Path
import unittest

from inspect_release103_readonly import container_summary, safe_origin
from release103_inventory import inspect_routes, CompatError


def fixture():
    locations = '''
location / {proxy_pass http://127.0.0.1:13039;}
location = /desktop {proxy_pass http://127.0.0.1:13040;}
location = /enterprise {proxy_pass http://127.0.0.1:13041;}
location ^~ /_next/ {proxy_pass http://127.0.0.1:13039;error_page 404 = @old_assets;}
location @old_assets {root /var/www/old-assets;try_files $uri =404;}
location ^~ /api/ {proxy_pass http://127.0.0.1:13012;}
location ^~ /fleet-assets/_next/ {proxy_pass http://127.0.0.1:13062/_next/;}
'''
    text = '# configuration file /etc/nginx/nginx.conf:\nevents {} http {include /etc/nginx/sites-enabled/*;}\n\n# configuration file /etc/nginx/sites-enabled/default:\nserver {listen 80;server_name 103.30.76.93 naumi.top www.naumi.top;' + locations + '}\n\n'
    containers = []
    for name, port, prefix in [('ui', 13039, ''), ('desktop', 13040, '/desktop'), ('enterprise', 13041, '/enterprise'), ('core', 13012, ''), ('fleet', 13062, '/fleet-assets'), ('unreferenced', 13035, '')]:
        containers.append({'id': name + '-fixed-id', 'name': name, 'image': 'sha256:' + 'a' * 64, 'running': True, 'roleHint': 'web', 'portBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(port)}]}, 'build': {'id': name + '-build', 'assetPrefix': prefix}, 'publicEnv': {'STORAGE_DRIVER': 'r2', 'MEDIA_PRIVATE': '1'}, 'storagePresence': {'R2_BUCKET': True, 'R2_SECRET_ACCESS_KEY': True}, 'networks': ['fixture-network'], 'networkAliases': {'fixture-network': ['app'] if name == 'core' else [name]}})
    containers.append({'id': 'worker-id', 'name': 'worker', 'image': 'sha256:' + 'a' * 64, 'running': True, 'roleHint': 'worker', 'networks': ['fixture-network'], 'origins': {'NAUMI_APP_ORIGIN': {'value': 'http://app:3000'}}})
    return text, containers


class InventoryTests(unittest.TestCase):
    def test_three_flavors_r2_fleet_and_alias_ownership(self):
        text, containers = fixture()
        before = copy.deepcopy(containers)
        result = inspect_routes(text, containers)
        self.assertEqual(containers, before)
        self.assertEqual(set(result['activeUiFlavors']), {'ui', 'desktop', 'enterprise'})
        self.assertEqual(result['workers'][0]['resolvedContainerIds'], ['core-fixed-id'])
        self.assertEqual(result['staticFallbackChains']['^~ /_next/'], [13039, None])
        self.assertTrue(all(row['canStop'] is False for row in result['containers']))
        self.assertFalse(result['readyToDeploy'])
        self.assertEqual(next(row for row in result['containers'] if row['name'] == 'fleet')['role'], 'independent-fleet-portal-preserve')

    def test_wrong_site_rejected_not_47_identity(self):
        text, rows = fixture()
        with self.assertRaises(CompatError):
            inspect_routes(text.replace('103.30.76.93', '47.105.59.142'), rows)

    def test_runtime_env_null_cannot_replace_real_build_flavor(self):
        text, rows = fixture()
        rows[1]['build']['assetPrefix'] = ''
        rows[1]['publicEnv']['DESKTOP_UI_BUILD'] = '1'
        with self.assertRaisesRegex(CompatError, 'assetPrefix mismatch'):
            inspect_routes(text, rows)

    def test_missing_r2_or_crossed_port_rejected(self):
        text, rows = fixture()
        rows[0]['storagePresence']['R2_SECRET_ACCESS_KEY'] = False
        with self.assertRaises(CompatError):
            inspect_routes(text, rows)
        _, rows = fixture()
        rows[0]['portBindings']['3000/tcp'][0]['HostPort'] = '13040'
        with self.assertRaises(CompatError):
            inspect_routes(text, rows)

    def test_named_fallback_cycle_rejected(self):
        text, rows = fixture()
        text = text.replace('root /var/www/old-assets;', 'proxy_pass http://127.0.0.1:13012;error_page 404 = @old_assets;')
        with self.assertRaisesRegex(CompatError, 'cycle'):
            inspect_routes(text, rows)

    def test_secret_environment_and_command_not_echoed(self):
        secret = 'sensitive-fixture-never-emit'
        row = {'Id': 'fixture', 'Image': 'sha256:' + 'a' * 64, 'Name': '/fixture', 'Config': {'Env': ['R2_SECRET_ACCESS_KEY=' + secret, 'STORAGE_DRIVER=r2', 'MEDIA_PRIVATE=1'], 'Cmd': ['node', '--password=' + secret]}, 'HostConfig': {}, 'State': {'Running': True}}
        output = container_summary(row)
        self.assertNotIn(secret, json.dumps(output))
        self.assertTrue(output['storagePresence']['R2_SECRET_ACCESS_KEY'])
        other = copy.deepcopy(row); other['Config']['Env'][0] += '-changed'
        self.assertNotEqual(output['storageBindingSha256'], container_summary(other)['storageBindingSha256'])

    def test_origin_userinfo_query_hidden(self):
        for value in ['https://user:secret@host/path', 'https://host/path?token=secret']:
            self.assertNotIn('value', safe_origin(value))
        self.assertEqual(safe_origin('http://app:3000')['value'], 'http://app:3000')

    def test_actual_captured_103_if_supplied(self):
        root = os.environ.get('NAUMI103_CAPTURE_ROOT')
        if not root:
            self.skipTest('Actual local capture not supplied')
        root = Path(root)
        captured = json.loads((root / 'detail-sanitized.json').read_text(encoding='utf-8'))
        result = inspect_routes((root / 'nginx-full.txt').read_bytes().decode(), captured['containers'])
        self.assertEqual(result['fullDumpSha256'], '10cda9f769a1696f237d4beb9e1ecc141168ffc9d9612fac9b59039b177193d9')
        self.assertEqual(len(result['locations']), 65)
        self.assertEqual(len(result['referencedPorts']), 21)
        self.assertEqual(result['workers'][0]['ownershipStatus'], 'EXACT_ALIAS_IN_SHARED_NETWORK')


if __name__ == '__main__':
    unittest.main()
