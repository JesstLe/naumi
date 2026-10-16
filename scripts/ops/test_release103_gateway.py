#!/usr/bin/env python3
"""Concentrated 103 offline negative/CAS tests using the actual capture."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import release103_gateway as hk
from release_client_compat import CompatError, Dump, parse, walk

ROOT = Path(os.environ.get('NAUMI103_GATEWAY_CAPTURE', 'E:/Workspace/naumi/output/release103-evening-20261016'))
ORIGINS = ('http://127.0.0.1:13110', 'http://127.0.0.1:13111', 'http://127.0.0.1:13112')


def captured():
    configs = ROOT / 'legacy-assets' / 'exact-configs'
    # Exact stdout captured by the read-only inventory, not reconstructed source.
    dump_path = Path(os.environ.get('NAUMI103_FULL_DUMP', 'output/release103-evening-20261016/nginx-full.txt'))
    text = dump_path.read_bytes().decode()
    sources = {name: (configs / name.lstrip('/')).read_bytes() for name in Dump(text).files}
    manifest = json.loads((ROOT / 'legacy-static-union' / 'manifest.json').read_text())
    return text, sources, manifest


class Gateway(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text, cls.sources, cls.manifest = captured()

    def render(self, **kw):
        return hk.render(self.text, *ORIGINS, '/fixture/union', self.manifest, **kw)

    def test_actual_65_classes_fleet_exact_three_ui_main_api(self):
        patches, after, report = self.render()
        self.assertEqual(report['originalRouteClassesCount'], 65)
        self.assertEqual(report['staticAssets'], 2684)
        nodes = { ' '.join(n.args): n for n in walk(parse(patches[hk.SITE])) if n.name == 'location'}
        self.assertFalse(set(nodes) & hk.FALLBACKS)
        self.assertEqual(sum('static/' in key for key in nodes), 3)
        for key in hk.MAIN | hk.DESKTOP | hk.ENTERPRISE:
            proxy = next(c.args[0] for c in nodes[key].children if c.name == 'proxy_pass')
            expected = ORIGINS[1] if key in hk.DESKTOP else ORIGINS[2] if key in hk.ENTERPRISE else ORIGINS[0]
            self.assertTrue(proxy == expected or proxy.startswith(expected + '/'))
            self.assertFalse(any(c.name in ('error_page', 'proxy_intercept_errors') for c in nodes[key].children))
        # Everything except existing location spans and inserted new locations is
        # byte-identical, including TLS/domain/global safety configuration.
        old, server, locations = hk.inventory(self.text)
        stripped_old, stripped_new = old.files[hk.SITE], patches[hk.SITE]
        for dct, which in [(locations, 'old'), (nodes, 'new')]:
            body = stripped_old if which == 'old' else stripped_new
            for node in sorted(dct.values(), key=lambda n:n.start, reverse=True):
                body = body[:node.start] + body[node.end:]
            if which == 'old': stripped_old = body
            else: stripped_new = body
        # Comments inserted in place of retired chains are allowed; compare all
        # remaining directive tokens rather than whitespace/comment presentation.
        self.assertEqual([(n.name,n.args) for n in walk(parse(stripped_old))], [(n.name,n.args) for n in walk(parse(stripped_new))])

    def test_actual_maintenance_only_fleet_static_and_denies_survive(self):
        patches, _, report = self.render(maintenance=True)
        nodes = {' '.join(n.args): n for n in walk(parse(patches[hk.SITE])) if n.name == 'location'}
        for key in hk.MAIN | hk.DESKTOP | hk.ENTERPRISE:
            self.assertEqual([c.args for c in nodes[key].children if c.name == 'return'], [['503']])
        self.assertEqual(report['fleetRouteBytesPreserved'], 9)

    def test_changed_baseline_unknown_routes_are_fail_closed(self):
        for changed in (self.text + '\n', self.text.replace('location / {', 'location /unknown {'), self.text.replace(':13062;', ':13063;', 1)):
            with self.assertRaisesRegex(CompatError, 'baseline changed'):
                hk.render(changed, *ORIGINS, '/fixture/union', self.manifest)

    def test_invalid_origin_manifest_prefix_conflict(self):
        for origins in [(ORIGINS[0],)*3, ('http://8.8.8.8:13110', *ORIGINS[1:]), ('http://127.0.0.1:13062', *ORIGINS[1:])]:
            with self.assertRaises(CompatError): hk.render(self.text, *origins, '/fixture/union', self.manifest)
        for patch in [{'fleetIncluded': True}, {'conflicts': ['x']}, {'assets': self.manifest['assets'][:1]}]:
            with self.assertRaises(CompatError): hk.render(self.text, *ORIGINS, '/fixture/union', {**self.manifest, **patch})

    def test_exact_source_mismatch_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'bundle'
            sources = {**self.sources, hk.SITE: self.sources[hk.SITE] + b'\n\n'}
            with self.assertRaisesRegex(CompatError, 'source mismatch'):
                hk.bundle(self.text, sources, *ORIGINS, '/fixture/union', self.manifest, output)
            self.assertFalse(output.exists())

    def test_bundle_exact_all_source_cas_and_executable_local_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'bundle'
            report = hk.bundle(self.text, self.sources, *ORIGINS, '/fixture/union', self.manifest, output)
            self.assertEqual(len(report['patches']), 3)
            for patch in report['patches']:
                self.assertEqual((output / patch['before']).read_bytes(), self.sources[patch['path']])
                self.assertEqual(hk.sha((output / patch['after']).read_bytes()), patch['afterSha256'])
            for name in ('MODIFIED_FILE', 'DIFF_FILE.patch', 'VERIFICATION.txt', 'ROLLBACK.sh'):
                self.assertGreater((output/name).stat().st_size, 0)
            # Execute Python payload extracted from executable bash on Windows;
            # the Linux Nginx integration executes the real bash file as well.
            code = hk.ROLLBACK.split("<<'PY'\n", 1)[1].rsplit('\nPY\n', 1)[0]
            target = Path(temp) / 'rollback-copy'
            shutil.copytree(output/'after', target)
            env = os.environ.copy()
            import sys
            result = subprocess.run([sys.executable, '-c', code, str(output/'ROLLBACK.sh'), str(target)], capture_output=True, text=True, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('ORIGINAL_BYTES=RESTORED', result.stdout)
            for name, raw in self.sources.items(): self.assertEqual((target/name.lstrip('/')).read_bytes(), raw)
            # CAS rejects before touching any other source file.
            shutil.rmtree(target); shutil.copytree(output/'after', target)
            (target/hk.SITE.lstrip('/')).write_bytes(b'concurrent change')
            result = subprocess.run([sys.executable, '-c', code, str(output/'ROLLBACK.sh'), str(target)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((target/hk.SITE.lstrip('/')).read_bytes(), b'concurrent change')
            self.assertEqual((output/'MODIFIED_FILE').read_bytes(), (output/'after'/hk.SITE.lstrip('/')).read_bytes())


if __name__ == '__main__': unittest.main()
