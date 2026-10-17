"""Effective Docker bindings: harmless reordering versus unsafe drift."""
import copy
import unittest
from unittest.mock import Mock

import release_legacy_ui_retirement as legacy
import release_runtime_ui_retirement as runtime


class BindingFormatTests(unittest.TestCase):
    def setUp(self):
        self.row = {
            'Id': 'a' * 64, 'Image': 'sha256:' + 'b' * 64,
            'Config': {'Env': ['DUP=first', 'DUP=last'], 'Cmd': ['node', 'server.js']},
            'Mounts': [
                {'Destination': '/data', 'Type': 'bind', 'Source': '/srv/data', 'RW': True},
                {'Destination': '/data/media', 'Type': 'bind', 'Source': '/srv/media', 'RW': False},
            ],
            'NetworkSettings': {'Networks': {'app': {
                'Aliases': ['web', 'app', 'web'], 'DNSNames': ['z', 'a'],
                'Links': ['b:c', 'a:d'], 'IPAddress': '172.18.0.16',
                'NetworkID': 'network', 'DriverOpts': {'key': 'value'},
            }}},
        }

    def test_permutations_do_not_change_bindings_or_mutate_inspect(self):
        before = copy.deepcopy(self.row)
        changed = copy.deepcopy(self.row)
        changed['Mounts'].reverse()
        for key in ('Aliases', 'DNSNames', 'Links'):
            changed['NetworkSettings']['Networks']['app'][key].reverse()
        self.assertEqual(legacy.immutable(self.row), legacy.immutable(changed))
        self.assertEqual(legacy.network_binding(self.row), legacy.network_binding(changed))
        self.assertEqual(runtime.network_configuration(self.row), runtime.network_configuration(changed))
        self.assertEqual(self.row, before)

    def test_config_order_mount_values_and_extra_fields_remain_bound(self):
        for kind in ('env', 'cmd', 'source', 'rw', 'extra'):
            changed = copy.deepcopy(self.row)
            if kind == 'env': changed['Config']['Env'].reverse()
            if kind == 'cmd': changed['Config']['Cmd'].reverse()
            if kind == 'source': changed['Mounts'][0]['Source'] = '/other'
            if kind == 'rw': changed['Mounts'][0]['RW'] = False
            if kind == 'extra': changed['Mounts'][0]['Propagation'] = 'rshared'
            with self.subTest(kind=kind):
                self.assertNotEqual(legacy.immutable(self.row), legacy.immutable(changed))

    def test_network_values_duplicates_nulls_and_extra_fields_remain_bound(self):
        changes = [
            ('Aliases', ['app', 'web']), ('Aliases', ['app', 'other', 'web']),
            ('Aliases', None), ('Aliases', []), ('IPAddress', '172.18.0.17'),
            ('DriverOpts', {'key': 'changed'}), ('FutureField', 'preserved'),
        ]
        for key, value in changes:
            changed = copy.deepcopy(self.row)
            changed['NetworkSettings']['Networks']['app'][key] = value
            with self.subTest(key=key, value=value):
                self.assertNotEqual(legacy.network_binding(self.row), legacy.network_binding(changed))
        missing = copy.deepcopy(self.row)
        missing['NetworkSettings']['Networks']['app'].pop('Aliases')
        null = copy.deepcopy(missing)
        null['NetworkSettings']['Networks']['app']['Aliases'] = None
        self.assertNotEqual(legacy.network_binding(missing), legacy.network_binding(null))

    def test_duplicate_mount_and_malformed_names_hold(self):
        duplicate = copy.deepcopy(self.row)
        duplicate['Mounts'].append(copy.deepcopy(duplicate['Mounts'][0]))
        with self.assertRaisesRegex(legacy.RetirementHold, 'DUPLICATE_MOUNT'):
            legacy.immutable(duplicate)
        for value in ('app', [None], {'key': 'value'}):
            changed = copy.deepcopy(self.row)
            changed['NetworkSettings']['Networks']['app']['Aliases'] = value
            with self.assertRaisesRegex(legacy.RetirementHold, 'INVALID_NETWORK_NAMES'):
                legacy.network_binding(changed)

    def test_old_manifest_rejected_before_host_access_for_both_policies(self):
        for value in ({}, {'bindingHashFormat': 'raw-v1'}):
            tx = Mock()
            with self.assertRaisesRegex(legacy.RetirementHold, 'REPREPARE_REQUIRED'):
                legacy.retire_one(tx, value, '.', Mock(), Mock())
            with self.assertRaisesRegex(legacy.RetirementHold, 'REPREPARE_REQUIRED'):
                runtime.check_manifest(value)
            with self.assertRaisesRegex(legacy.RetirementHold, 'REPREPARE_REQUIRED'):
                legacy.restore_one(tx, value, {}, Mock(), required_available_mib=2048)
            self.assertEqual(tx.mock_calls, [])


if __name__ == '__main__':
    unittest.main()
