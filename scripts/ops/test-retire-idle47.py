#!/usr/bin/env python3
"""Small offline contract suite; does not inspect or control Docker."""
import importlib.util
import json
import pathlib
import sys
import tempfile
import types
import unittest

if sys.platform == 'win32':
    sys.modules['fcntl'] = types.SimpleNamespace()
spec = importlib.util.spec_from_file_location('retire47', pathlib.Path(__file__).with_name('retire-idle47.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
swap_spec = importlib.util.spec_from_file_location('swap47', pathlib.Path(__file__).with_name('provision-emergency-swap47.py'))
swap = importlib.util.module_from_spec(swap_spec)
swap_spec.loader.exec_module(swap)


class ManifestContract(unittest.TestCase):
    def setUp(self):
        self.row = {'name': next(iter(m.ALLOW)), 'id': 'original-id', 'image': 'fixed-image',
                    'running': True, 'startedAt': 'original-start',
                    'restartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}}

    def test_only_running_and_restart_change(self):
        after = m.proposed([self.row])[0]
        self.assertFalse(after['running'])
        self.assertEqual(after['restartPolicy']['Name'], 'no')
        for k in ['name', 'id', 'image', 'startedAt']:
            self.assertEqual(after[k], self.row[k])

    def test_input_not_modified(self):
        before = json.dumps(self.row, sort_keys=True)
        m.proposed([self.row])
        self.assertEqual(json.dumps(self.row, sort_keys=True), before)

    def test_all_protected_rejected(self):
        for name in m.PROTECTED:
            with self.assertRaises(ValueError):
                m.proposed([dict(self.row, name=name)])

    def test_unknown_rejected(self):
        with self.assertRaises(ValueError):
            m.proposed([dict(self.row, name='future-colleague-slot')])

    def test_rollback_exact(self):
        before = [self.row]
        self.assertEqual(m.restore_copy(before, m.proposed(before)), before)

    def test_rollback_replaced_identity_rejected(self):
        after = m.proposed([self.row])
        for key in ['id', 'image']:
            changed = [dict(after[0], **{key: 'different'})]
            with self.assertRaises(ValueError):
                m.restore_copy([self.row], changed)

    def test_no_database_media_scan(self):
        for path in ['/opt/naumi-new-api/data/postgres/base/16384/16493',
                     '/opt/naumi-new-api/data/config.json', '/opt/x/logs/test.json',
                     '/opt/x/backups/config.json', '/etc/nginx/key.pem']:
            self.assertFalse(m.config_file(pathlib.Path(path)), path)

    def test_config_scan(self):
        for path in ['/etc/systemd/system/naumi.service', '/opt/naumi-staging/config/router.env',
                     '/etc/cron.d/naumi', '/opt/naumi-reverse-hub/config/hub.json']:
            self.assertTrue(m.config_file(pathlib.Path(path)), path)

    def test_full_fixture(self):
        with tempfile.TemporaryDirectory() as path:
            m.fixture(pathlib.Path(path))


class SwapContract(unittest.TestCase):
    def test_preserves_existing_fstab(self):
        for before in [b'', b'UUID=fixture / ext4 defaults 0 1', b'# fixture\n']:
            after = swap.modify(before)
            self.assertTrue(after.startswith(before))
            self.assertEqual(after.count(swap.ENTRY), 1)

    def test_duplicate_swap_rejected(self):
        with self.assertRaises(AssertionError):
            swap.modify(swap.ENTRY)

    def test_swap_fixture(self):
        swap.fixture()


if __name__ == '__main__':
    unittest.main()
