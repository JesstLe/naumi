import copy
import datetime
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import os
import stat

import release47_host as m


class Gates(unittest.TestCase):
    @unittest.skipUnless(hasattr(os, 'O_DIRECTORY'), 'Linux directory durability')
    def test_save_fsyncs_file_and_directory_before_returning(self):
        with tempfile.TemporaryDirectory() as folder:
            tx = m.HostTransaction(m.TARGET, 'a'*64, folder)
            kinds = []
            original = os.fsync
            def fsync(fd):
                kinds.append(stat.S_ISDIR(os.fstat(fd).st_mode))
                return original(fd)
            with patch.object(m.os, 'fsync', side_effect=fsync):
                tx.save('intent.json', {'id': '1'*64})
            self.assertEqual(kinds, [False, True])

    @unittest.skipUnless(hasattr(os, 'O_DIRECTORY'), 'Linux directory durability')
    def test_directory_durability_failure_does_not_return_an_intent(self):
        with tempfile.TemporaryDirectory() as folder:
            tx = m.HostTransaction(m.TARGET, 'a'*64, folder)
            original = os.fsync
            def fsync(fd):
                if stat.S_ISDIR(os.fstat(fd).st_mode):
                    raise OSError('fixture directory sync failed')
                return original(fd)
            with patch.object(m.os, 'fsync', side_effect=fsync):
                with self.assertRaisesRegex(OSError, 'directory sync'):
                    tx.save('intent.json', {'id': '1'*64})

    def test_memory_keeps_one_gib_and_never_adds_swap(self):
        budget = dict(webPeakMiB=1536, workerPeakMiB=256, hostReserveMiB=1024)
        self.assertFalse(m.memory_gate(2119, budget)['ok'])
        self.assertTrue(m.memory_gate(2816, budget)['ok'])
        self.assertFalse(m.memory_gate(2816, budget)['swapIncluded'])
        for value in [None, True, '4096', -1]:
            with self.assertRaises(m.Hold):
                m.memory_gate(value, budget)

    def test_memory_budget_unknown_or_weak_reserve_is_rejected(self):
        for budget in [{}, dict(webPeakMiB=True, workerPeakMiB=256, hostReserveMiB=1024),
                       dict(webPeakMiB=512, workerPeakMiB=128, hostReserveMiB=512)]:
            with self.assertRaises(m.Hold):
                m.memory_gate(9999, budget)

    def receipt(self):
        identity = dict(id='1'*64, image='sha256:'+'a'*64, running=True)
        value = dict(identity=identity, coverage='complete', connections=0, agentSessions=0, acceptedTasks=0,
                     workerLeases=0, newAdmissions=0, observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        return identity, value

    def test_each_drain_counter_is_a_fresh_real_integer(self):
        identity, receipt = self.receipt()
        m.assert_drain(receipt, identity)
        for name in ['connections', 'agentSessions', 'acceptedTasks', 'workerLeases', 'newAdmissions']:
            for invalid in [None, False, '0', 1, -1]:
                bad = dict(receipt, **{name: invalid})
                with self.assertRaises(m.Hold):
                    m.assert_drain(bad, identity)

    def test_legacy_unknown_and_stale_receipts_never_retire(self):
        identity, receipt = self.receipt()
        for change in [dict(coverage='partial'), dict(identity={}), dict(observedAt='2000-01-01T00:00:00+00:00'),
                       dict(observedAt='bad'), dict(observedAt='2099-01-01T00:00:00+00:00')]:
            with self.assertRaises(m.Hold):
                m.assert_drain(dict(receipt, **change), identity)

    def test_command_requires_whole_transaction_lock(self):
        tx = m.HostTransaction(m.TARGET, 'a'*64, '/tmp/evidence')
        with self.assertRaisesRegex(m.Hold, 'WHOLE_TRANSACTION_LOCK'):
            tx.run(['docker', 'stop', 'anything'])

    def test_only_two_explicitly_authorized_targets_are_supported(self):
        for target in ['101.133.166.67', '120.27.162.85', '47.105.59.142.example']:
            with self.assertRaises(m.Hold):
                m.HostTransaction(target, 'a'*64, '/tmp/evidence')
        hk = m.HostTransaction('103.30.76.93', 'a'*64, '/tmp/evidence')
        self.assertEqual(len(hk.spec['locks']), 2)
        self.assertEqual(len(m.HostTransaction('47.105.59.142', 'a'*64, '/tmp/evidence').spec['locks']), 3)

    def test_identity_and_drain_rechecked_before_stop(self):
        row = {'Id': '1'*64, 'Name': '/naumi47-explicit-old', 'Image': 'sha256:'+'a'*64,
               'Config': {'Cmd': ['node', 'server.js']},
               'State': {'Running': True, 'StartedAt': 'old'},
               'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}}}
        calls = []
        def command(args, **_):
            calls.append(args)
            if args[:2] == ['docker', 'inspect']:
                import json
                return json.dumps([row]).encode()
            if args[:2] == ['docker', 'update']:
                row['HostConfig']['RestartPolicy']['Name'] = 'no'
            if args[:2] == ['docker', 'stop']:
                row['State']['Running'] = False
            return b''
        with tempfile.TemporaryDirectory() as folder:
            tx = m.HostTransaction(m.TARGET, 'a'*64, folder, command=command)
            tx.stack = True  # mock transaction; no claim of a live lock.
            identity = m.public_identity(row)
            _, receipt = self.receipt()
            receipt.update(identity=identity, routingReferences=[], internalReferences=[])
            result = tx.retire(identity, receipt)
            self.assertFalse(result['running'])
            self.assertEqual(result['restartPolicy'], 'no')
            self.assertIn(['docker', 'stop', '--time=-1', identity['id']], calls)
            self.assertFalse(any('SIGKILL' in arg for args in calls for arg in args))
            self.assertTrue(any(pathlib.Path(folder).glob('retire-intent-*.json')))

    def test_retire_refuses_referenced_or_unknown_work_before_mutation(self):
        identity, receipt = self.receipt()
        for change in [dict(routingReferences=['nginx']), dict(internalReferences=['worker']), dict(agentSessions=None)]:
            tx = m.HostTransaction(m.TARGET, 'a'*64, '/tmp/unused')
            tx.pin = lambda _: {'Name': '/naumi47-explicit-old', 'Config': {'Cmd': ['node', 'server.js']}}
            receipt.update(routingReferences=[], internalReferences=[])
            with self.assertRaises(m.Hold):
                tx.retire(identity, dict(receipt, **change))

    def test_public_identity_has_no_env_secret(self):
        row = {'Id': '1'*64, 'Name': '/web', 'Image': 'sha256:'+'a'*64, 'Config': {'Env': ['SECRET=not-for-output']},
               'State': {'Running': True, 'StartedAt': 'old'}, 'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}}}
        self.assertNotIn('SECRET', repr(m.public_identity(row)))


if __name__ == '__main__':
    unittest.main()
