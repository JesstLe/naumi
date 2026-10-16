#!/usr/bin/env python3
"""Pure local prefixed URL inventory tests, optional actual captured bytes."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest

from release_client_compat import CompatError, sha
from release103_assets import canonical_url, verified_union, materialize


class HKAssetsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hk-assets-unit-')
        self.root = Path(self.temp.name)
        self.sources = []
        for name, prefix, data in [('old-ui', '', b'ui bytes'), ('old-desktop', '/desktop', b'desktop bytes'), ('old-enterprise', '/enterprise', b'enterprise bytes')]:
            baseline = {'name': name, 'assetPrefix': prefix, 'id': name + '-id', 'image': 'sha256:' + 'a' * 64, 'startedAt': '2026-10-16T00:00:00Z'}
            identity = {key: value for key, value in baseline.items() if key in ('id', 'image', 'startedAt')}; identity['running'] = True
            archive = b'fixture archive ' + name.encode()
            (self.root / (name + '.tar.gz')).write_bytes(archive)
            file = self.root / name / '.next/static/chunks/shared.js'
            file.parent.mkdir(parents=True); file.write_bytes(data)
            self.sources.append({'kind': 'container-static', 'source': baseline, 'before': identity, 'after': dict(identity), 'archiveBytes': len(archive), 'archiveSha256': sha(archive), 'files': [{'path': '.next/static/chunks/shared.js', 'size': len(data), 'sha256': sha(data)}]})
        disk = b'disk original'; archive = b'fixture disk archive'
        (self.root / 'disk-static-root.tar.gz').write_bytes(archive)
        file = self.root / 'disk-static-root/_next/static/chunks/ancient.js'; file.parent.mkdir(parents=True); file.write_bytes(disk)
        self.sources.append({'kind': 'disk-static-root', 'fullNginxSha256Before': 'fixed', 'fullNginxSha256After': 'fixed', 'archiveBytes': len(archive), 'archiveSha256': sha(archive), 'files': [{'path': '_next/static/chunks/ancient.js', 'size': len(disk), 'sha256': sha(disk)}]})
        self.capture = {'schemaVersion': 1, 'kind': '103-prefixed-old-static-inventory', 'sources': self.sources, 'fleetIncluded': False}

    def tearDown(self):
        self.temp.cleanup()

    def test_same_filename_distinct_prefixes_not_conflict(self):
        result = verified_union(self.capture, self.root)
        self.assertEqual(len(result['assets']), 4)
        self.assertFalse(result['conflicts'])
        self.assertEqual(len({row['sha256'] for row in result['assets'] if row['url'].endswith('/shared.js')}), 3)
        materialize(result, self.root / 'union')
        self.assertEqual((self.root / 'union/desktop/_next/static/chunks/shared.js').read_bytes(), b'desktop bytes')

    def test_actual_same_url_different_bytes_conflict(self):
        data = copy.deepcopy(self.capture); data['sources'][1]['source']['assetPrefix'] = ''
        result = verified_union(data, self.root)
        self.assertEqual(len(result['conflicts']), 1)
        with self.assertRaises(CompatError):
            materialize(result, self.root / 'bad-union')
        self.assertFalse((self.root / 'bad-union').exists())

    def test_dynamic_filename_ellipsis_allowed_traversal_rejected(self):
        self.assertEqual(canonical_url('/desktop/_next/static/chunks/app/[[...segments]]/page-hash.js'), '/desktop/_next/static/chunks/app/[[...segments]]/page-hash.js')
        for url in ['/_next/static/../secret', '/fleet-assets/_next/static/chunks/a.js', '/desktop/_next/static/a%2fb', '/_next/static//a']:
            with self.assertRaises(CompatError):
                canonical_url(url)

    def test_identity_archive_and_file_changes_rejected(self):
        data = copy.deepcopy(self.capture); data['sources'][0]['after']['image'] = 'changed'
        with self.assertRaises(CompatError):
            verified_union(data, self.root)
        (self.root / 'old-ui.tar.gz').write_bytes(b'tampered')
        with self.assertRaises(CompatError):
            verified_union(self.capture, self.root)

    def test_actual_hk_capture_if_supplied(self):
        root = os.environ.get('NAUMI103_ASSET_ROOT')
        if not root:
            self.skipTest('No actual local capture supplied')
        root = Path(root)
        result = verified_union(json.loads((root / 'manifest.json').read_text(encoding='utf-8')), root)
        self.assertEqual(result['containerSources'], 20)
        self.assertEqual(result['sourceFiles'], 7637)
        self.assertEqual(len(result['assets']), 2684)
        self.assertFalse(result['conflicts'])


if __name__ == '__main__':
    unittest.main()
