"""Pure renderer/CAS tests; no production connections or shell mutations."""
import pathlib
import tempfile
import unittest

import release_client_compat as compat
import saas_recovery_gateway as recovery
from test_release_client_compat import fixture_files, dump_files, SITE


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='naumi-saas-recovery-fixture-')
        self.root = pathlib.Path(self.temp.name)
        self.files = fixture_files()
        self.text = dump_files(self.files)
        self.spec = {'kind': 'saas-controlled-maintenance-recovery',
                     'expectedDumpSha256': compat.sha(self.text.encode()),
                     'servers': [row for row in recovery.server_inventory(self.text) if row['path'] == SITE],
                     'restoreDatabase': False, 'replayAcceptedTasks': False, 'compatibleBusinessRollback': False}

    def tearDown(self):
        self.temp.cleanup()

    def run_render(self):
        return recovery.render(self.text, self.spec, self.root / 'bundle',
                               source_files={name: body.encode() for name, body in self.files.items()})

    def test_only_audited_servers_change_and_no_success_claim(self):
        result = self.run_render()
        after = compat.Dump((self.root / 'bundle/nginx.after.txt').read_text())
        self.assertEqual(after.files['/etc/nginx/sites-enabled/other'], compat.Dump(self.text).files['/etc/nginx/sites-enabled/other'])
        self.assertEqual(after.files[SITE].count('location @naumi_saas_recovery_503'), 2)
        self.assertIn('ssl_protocols TLSv1.2 TLSv1.3;', after.files[SITE])
        self.assertFalse(result['compatibleBusinessRollback'])
        self.assertFalse(result['productionAcceptance'])
        self.assertFalse(result['allPublicEntrancesInventoried'])

    def test_changed_dump_or_server_is_rejected(self):
        self.spec['expectedDumpSha256'] = '0' * 64
        with self.assertRaisesRegex(compat.CompatError, 'DUMP_CAS'):
            self.run_render()
        self.spec['expectedDumpSha256'] = compat.sha(self.text.encode())
        self.spec['servers'][0]['serverSha256'] = '0' * 64
        with self.assertRaisesRegex(compat.CompatError, 'SERVER_CAS'):
            self.run_render()

    def test_unknown_duplicates_and_replay_are_rejected(self):
        self.spec['servers'].append(self.spec['servers'][0])
        with self.assertRaisesRegex(compat.CompatError, 'DUPLICATE'):
            self.run_render()
        self.spec['servers'] = self.spec['servers'][:2]
        self.spec['replayAcceptedTasks'] = True
        with self.assertRaisesRegex(compat.CompatError, 'PRESERVE_DATA'):
            self.run_render()


if __name__ == '__main__':
    unittest.main()
