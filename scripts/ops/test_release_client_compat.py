#!/usr/bin/env python3
"""Pure unit tests. Optional real -T input is read-only, never a remote command."""
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest

import release_client_compat as compat


SITE = '/etc/nginx/sites-enabled/reference-workbench'
OLD = ['http://127.0.0.1:' + str(port) for port in (13070, 13071, 13068, 13063, 13052, 13072, 13073)]
ALIAS_URL = '/_next/static/chunks/1528-73f862c260cda885.js'
MAPS = r'''
map "$http_referer|$cookie_nv_user|$cookie_wb_session" $naumi47_compat_api {
 default http://127.0.0.1:13070;
 ~^https?://47\.105\.59\.142/(legacy-workbench/[^|]*|(workbench|single|chat-image|login|admin)(\?[^|]*)?)\| http://127.0.0.1:17847;
 ~^https?://47\.105\.59\.142/[^|]*\| http://127.0.0.1:13070;
 ~^[^|]*\|[^|]+\| http://127.0.0.1:13070;
 ~^[^|]*\|\|.+$ http://127.0.0.1:17847;
}
map "$cookie_nv_user|$cookie_wb_session" $naumi47_compat_page { default 0; ~^[^|]+\| 0; ~^\|.+$ 1; }
map $naumi47_compat_api $naumi47_auth_login_backend {
 default http://127.0.0.1:13063;
 http://127.0.0.1:17847 http://127.0.0.1:17847;
}
'''


def fixture_files():
    return {
        '/etc/nginx/nginx.conf': 'worker_processes 1; events {} http { include /etc/nginx/sites-enabled/*; }\n',
        '/etc/nginx/sites-enabled/other': 'server {listen 17848; server_name unrelated; location / {return 200 "infra";} }\n',
        SITE: MAPS + '''
server {listen 80; server_name 47.105.59.142; location /.well-known/acme-challenge/ {root /fixture/acme;} location / {return 308 https://$host$request_uri;} }
server {
 listen 443 ssl; server_name 47.105.59.142;
 ssl_certificate /fixture/cert.pem; ssl_certificate_key /fixture/key.pem;
 ssl_protocols TLSv1.2 TLSv1.3; client_max_body_size 310m;
 add_header X-Content-Type-Options nosniff always;
 location = /api/auth/login {proxy_pass $naumi47_auth_login_backend$request_uri; proxy_set_header CF-Connecting-IP ""; proxy_set_header X-Real-IP $remote_addr; proxy_cookie_flags nv_user secure;}
 location = /workbench {if ($naumi47_compat_page = 1) {return 418;} error_page 418 = @old_workbench_page; return 302 /batchshot/native/workbench;}
 location = /login {if ($naumi47_compat_page = 1) {return 418;} error_page 418 = @old_workbench_page; return 302 /sign-in;}
 location @old_workbench_page {proxy_pass http://127.0.0.1:17847;}
 location ^~ /legacy-workbench/ {rewrite ^/legacy-workbench/(.*)$ /$1 break; proxy_pass http://127.0.0.1:17847;}
 location = /workbench-history.js {proxy_pass http://127.0.0.1:17847;}
 location = /workbench-zip.js {proxy_pass http://127.0.0.1:17847;}
 location ^~ /api/reference-workbench/ {proxy_pass http://127.0.0.1:13071;}
 location ~ ^/api/(auth/(login|logout|status)|heartbeat|settings|image|images-zip|status|workbench/|single/|chat-image/) {proxy_pass $naumi47_compat_api$request_uri;}
 location = /canvas {proxy_pass http://127.0.0.1:13068; proxy_set_header Accept-Encoding ""; sub_filter_once off; sub_filter_types text/x-component; sub_filter "1528-265e3cc8e4673727.js" "1528-73f862c260cda885.js"; add_header X-Naumi-Canvas-Credits "73f862c260cda885" always;}
 location = /_next/static/chunks/1528-73f862c260cda885.js {alias /fixture/patched.js; default_type application/javascript; add_header Cache-Control "public, max-age=31536000, immutable";}
 location = /health {proxy_pass http://127.0.0.1:13070/api/health;}
 location = / {return 302 /dashboard$is_args$args;}
 location / {proxy_pass http://127.0.0.1:13070; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme;}
'''+ ''.join(' location = /fixture/' + str(port) + ' {proxy_pass http://127.0.0.1:' + str(port) + ';}\n' for port in (13070, 13071, 13068, 13063, 13052, 13072, 13073)) + '}\n',
    }


def dump_files(files):
    return ''.join('# configuration file ' + name + ':\n' + body + '\n' for name, body in files.items())


class CompatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='naumi-client-compat-unit-')
        self.root = Path(self.temp.name)
        self.old, self.new = self.root / 'old', self.root / 'new'
        for directory in (self.old, self.new):
            (directory / 'chunks').mkdir(parents=True)
            (directory / 'chunks/shared.js').write_bytes(b'shared-original-bytes\n')
        (self.old / 'chunks/old.js').write_bytes(b'old-client-original\n')
        (self.new / 'chunks/new.js').write_bytes(b'new-client\n')
        self.alias = self.root / 'patched.js'; self.alias.write_bytes(b'patched-original-bytes\n')
        self.manifest = compat.collect_assets([('old', self.old), ('candidate', self.new)], [(ALIAS_URL, self.alias)])
        self.files = fixture_files(); self.dump = dump_files(self.files)

    def tearDown(self):
        self.temp.cleanup()

    def render(self, text=None):
        return compat.render_gateway(text or self.dump, SITE, 'http://127.0.0.1:13100', OLD, '/fixture/union', self.manifest)

    def test_parse_roundtrip_and_includes(self):
        dump = compat.Dump(self.dump)
        self.assertEqual(dump.render({}), self.dump)
        self.assertEqual(set(dump.files), set(self.files))
        self.assertEqual(len(compat.alias_inventory(dump)), 1)

    def test_real_47_capture_if_supplied(self):
        path = os.environ.get('NAUMI_COMPAT_REAL_DUMP')
        if not path:
            self.skipTest('No captured real config supplied')
        patches, after, report = self.render(Path(path).read_bytes().decode())
        self.assertEqual(len(compat.Dump(after).files), 4)
        self.assertEqual(len(report['changedEndpoints']), 8)
        self.assertEqual(len(report['removedOverrides']), 1)
        self.assertEqual(list(patches), [SITE])
        self.assertFalse(report['oldClientComplete'])

    def test_unified_dynamic_maps_and_all_explicit_old_origins(self):
        patches, after, report = self.render()
        for old in OLD:
            self.assertNotIn(old, after)
        self.assertIn('proxy_pass $naumi47_auth_login_backend$request_uri', after)
        self.assertIn('proxy_pass $naumi47_compat_api$request_uri', after)
        self.assertEqual(compat.Dump(after).files['/etc/nginx/sites-enabled/other'], compat.Dump(self.dump).files['/etc/nginx/sites-enabled/other'])
        self.assertEqual(after.count('http://127.0.0.1:17847'), self.dump.count('http://127.0.0.1:17847'))
        self.assertFalse(report['oldClientComplete'])
        self.assertTrue(report['legacy17847Preserved'])

    def test_exact_canvas_filter_removed_alias_tls_and_headers_retained(self):
        _, after, report = self.render()
        self.assertFalse(any(node.name == 'sub_filter' for nodes in compat.Dump(after).nodes.values() for node in compat.walk(nodes)))
        self.assertNotIn('location = /canvas {', after)
        for needle in ['ssl_certificate /fixture/cert.pem', 'ssl_protocols TLSv1.2 TLSv1.3', 'CF-Connecting-IP ""', 'proxy_cookie_flags nv_user secure', 'alias /fixture/patched.js']:
            self.assertIn(needle, after)
        self.assertEqual(after.count('add_header X-Content-Type-Options nosniff always;'), 2)
        self.assertEqual(len(report['retainedAliases']), 1)

    def test_include_map_is_rewritten_in_its_own_file(self):
        files = dict(self.files)
        files[SITE] = files[SITE].replace(MAPS, '')
        files['/etc/nginx/nginx.conf'] = files['/etc/nginx/nginx.conf'].replace('include /etc/nginx/sites-enabled/*;', 'include /etc/nginx/maps/*.conf; include /etc/nginx/sites-enabled/*;')
        files['/etc/nginx/maps/compat.conf'] = MAPS
        patches, after, _ = self.render(dump_files(files))
        self.assertEqual(set(patches), {SITE, '/etc/nginx/maps/compat.conf'})
        self.assertNotIn('http://127.0.0.1:13063', after)

    def test_reject_incomplete_and_ambiguous_config(self):
        variants = [self.files[SITE], self.dump + '# configuration file /etc/nginx/missing.conf:\nserver {}\n', self.dump.replace('include /etc/nginx/sites-enabled/*;', 'include /etc/nginx/not-captured.conf;'), self.dump.replace('default http://127.0.0.1:13070;', 'default http://127.0.0.1:13070;\n}\nmap $a $naumi47_compat_api {default 0;'), self.dump.replace('proxy_pass http://127.0.0.1:13071;', 'proxy_pass http://127.0.0.1:19999;'), self.dump.replace('proxy_pass $naumi47_compat_api$request_uri;', 'proxy_pass $unknown$request_uri;'), self.dump.replace('sub_filter_once off;', 'set $unknown 1; sub_filter_once off;')]
        for variant in variants:
            with self.subTest(variant=compat.sha(variant.encode())), self.assertRaises(compat.CompatError):
                self.render(variant)

    def test_protected_origin_and_new_output_only(self):
        with self.assertRaises(compat.CompatError):
            compat.render_gateway(self.dump, SITE, 'http://127.0.0.1:13100', OLD + ['http://127.0.0.1:17847'], '/fixture/union', self.manifest)
        for candidate in ['https://evil.test', 'http://127.0.0.1:65536', 'http://127.0.0.1:13070']:
            with self.assertRaises(compat.CompatError):
                compat.render_gateway(self.dump, SITE, candidate, OLD, '/fixture/union', self.manifest)

    def test_asset_append_dedup_and_exact_materialization(self):
        self.assertEqual(len(self.manifest['assets']), 4)
        union = self.root / 'union'
        compat.materialize_assets(self.manifest, union)
        self.assertEqual(compat.verify_assets(self.manifest, union), 4)
        self.assertEqual((union / '_next/static/chunks/old.js').read_bytes(), b'old-client-original\n')
        with self.assertRaises(compat.CompatError):
            compat.materialize_assets(self.manifest, union)

    def test_asset_conflict_rejected_before_output(self):
        (self.new / 'chunks/shared.js').write_bytes(b'different')
        with self.assertRaisesRegex(compat.CompatError, 'STATIC_URL_CONFLICT'):
            compat.collect_assets([('old', self.old), ('candidate', self.new)])

    def test_asset_changed_after_inventory_and_tamper_detected(self):
        (self.old / 'chunks/old.js').write_bytes(b'changed')
        with self.assertRaises(compat.CompatError):
            compat.materialize_assets(self.manifest, self.root / 'union')
        self.assertFalse((self.root / 'union').exists())
        (self.old / 'chunks/old.js').write_bytes(b'old-client-original\n')
        compat.materialize_assets(self.manifest, self.root / 'union')
        (self.root / 'union/_next/static/chunks/old.js').write_bytes(b'tampered')
        with self.assertRaises(compat.CompatError):
            compat.verify_assets(self.manifest, self.root / 'union')

    def test_canonical_url_and_lexer(self):
        for url in ['/_next/static/../secret', '/_next/static/a%2fb', '/_next/static//x', '/etc/passwd', '/_next/static/a?b']:
            with self.assertRaises(compat.CompatError):
                compat.public_url(url)
        self.assertEqual(compat.parse('set $v "quoted ; { # \\""; #comment\n')[0].args, ['$v', 'quoted ; { # "'])
        for text in ['http {', 'set $x "oops;', '}', 'set $x 1']:
            with self.assertRaises(compat.CompatError):
                compat.parse(text)

    def test_exact_source_cas_and_rollback_copies(self):
        patches, after, report = self.render()
        output = self.root / 'gateway'
        originals = {key: value.encode() for key, value in self.files.items()}
        compat.write_gateway_bundle(self.dump, patches, after, report, output, originals)
        row = report['patches'][0]
        self.assertEqual(row['beforeSha256'], compat.sha(originals[SITE]))
        self.assertEqual((output / row['before']).read_bytes(), originals[SITE])
        self.assertNotEqual((output / row['after']).read_bytes(), originals[SITE])
        # A rollback copy restores the exact original file, not the extra dump separator.
        rollback = self.root / 'rollback.conf'
        rollback.write_bytes((output / row['after']).read_bytes())
        rollback.write_bytes((output / row['before']).read_bytes())
        self.assertEqual(compat.file_sha(rollback), row['beforeSha256'])
        with self.assertRaises(compat.CompatError):
            compat.write_gateway_bundle(self.dump, patches, after, report, self.root / 'bad', {SITE: b'peer edit'})
        self.assertFalse((self.root / 'bad').exists())

    def test_parser_include_cycle(self):
        files = dict(self.files)
        files[SITE] += 'include /etc/nginx/nginx.conf;\n'
        with self.assertRaises(compat.CompatError):
            compat.Dump(dump_files(files))

    def test_include_glob_does_not_cross_directory_boundary(self):
        files = dict(self.files)
        files['/etc/nginx/sites-enabled/sub/hidden'] = 'server {}'
        with self.assertRaisesRegex(compat.CompatError, 'Unreachable'):
            compat.Dump(dump_files(files))

    def test_unknown_map_backend_and_missing_alias_are_rejected(self):
        with self.assertRaisesRegex(compat.CompatError, 'Unclassified compatibility map backend'):
            self.render(self.dump.replace('default http://127.0.0.1:13063;', 'default http://127.0.0.1:17777;'))
        with self.assertRaisesRegex(compat.CompatError, 'alias not included'):
            compat.render_gateway(self.dump, SITE, 'http://127.0.0.1:13100', OLD, '/fixture/union', compat.collect_assets([('new', self.new)]))

    def test_server_action_manifest_summary_never_echoes_secrets(self):
        candidate = self.root / 'candidate-next'
        (candidate / 'server').mkdir(parents=True)
        records = []
        for path, data in {'.next/BUILD_ID': b'old-build-1', '.next/server/server-reference-manifest.json': b'{"node":{},"edge":{},"encryptionKey":"do-not-copy-this"}', '.next/app-build-manifest.json': b'{"pages":{"/canvas/page":["static/chunks/old.js"]}}'}.items():
            records.append(json.dumps({'path': path, 'bytes': len(data), 'sha256': compat.sha(data), 'base64': base64.b64encode(data).decode()}))
            output = candidate / path.removeprefix('.next/')
            output.write_bytes(data if path != '.next/BUILD_ID' else b'candidate-build-2')
        report = compat.compare_builds([{'container': 'fixture-old', 'data': '\n'.join(records)}], candidate)
        self.assertEqual(report['serverActionStatus'], 'NO_SERVER_ACTIONS_IN_BOTH_MANIFESTS')
        self.assertFalse(report['oldClientComplete'])
        self.assertNotIn('do-not-copy-this', json.dumps(report))
        self.assertNotIn('encryptionKey', json.dumps(report))
        (candidate / 'server/server-reference-manifest.json').write_bytes(b'{"node":{"action1":{}},"edge":{},"encryptionKey":"private"}')
        report = compat.compare_builds([{'container': 'fixture-old', 'data': '\n'.join(records)}], candidate)
        self.assertEqual(report['serverActionStatus'], 'CROSS_BUILD_ACTION_EXECUTION_OR_OWNERSHIP_REQUIRED')


if __name__ == '__main__':
    unittest.main()
