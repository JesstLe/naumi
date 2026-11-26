import copy
import datetime
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch
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

    def test_new_web_cannot_share_existing_control_state(self):
        row = {'Config': {'Cmd': ['node', 'server.js'], 'Env': []},
               'NetworkSettings': {'Networks': {'net': {}}},
               'Mounts': [{'Type': 'bind', 'Source': '/opt/naumi-staging/releases/prior/web',
                           'Destination': '/release-state', 'RW': True}]}
        tx = m.HostTransaction(m.TARGET, 'a'*64, '/tmp/unused')
        tx.pin = lambda _: row
        with self.assertRaisesRegex(m.Hold, 'EXACT_PRIOR_SLOT_STATE_REVIEW_REQUIRED'):
            tx.clone_web({}, name='naumi47-new', port=13102, image='sha256:'+'a'*64, commit='b'*40,
                         memory_mib=2048, cpu=0.5, release_secret='s'*40,
                         state_dir='/opt/naumi-staging/releases/prior/web', build_version='1792146767',
                         reviewed_prior_state_dir='/opt/naumi-staging/releases/prior/web')

    def test_reviewed_video_reference_origin_is_only_in_candidate_env_file(self):
        # Docker and the Linux-only slot directory are simulated; the private
        # env file is genuinely written/read so this verifies the clone payload.
        real_path = pathlib.Path
        image = 'sha256:'+'a'*64
        source = {'Id': '1'*64, 'Name': '/naumi47-existing-web', 'Image': image,
                  'Config': {'Cmd': ['node', 'server.js'], 'Env': ['EXISTING_SETTING=preserved',
                             'STORAGE_DRIVER=s3', 'MEDIA_PRIVATE=1', 'MEDIA_REMOTE_ACCESS=proxy', 'NAUMI_NAS_DEFER_UPLOAD=1']},
                  'NetworkSettings': {'Networks': {'synthetic-network': {}}}, 'Mounts': [],
                  'State': {'Running': True, 'StartedAt': 'existing-boot'},
                  'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}}}
        before = copy.deepcopy(source)
        state_name = '/opt/naumi-staging/releases/synthetic-video-origin/web'
        state_path = Mock()
        state_path.is_absolute.return_value = True
        state_path.is_symlink.return_value = False
        state_path.resolve.return_value.is_relative_to.return_value = True
        state_path.stat.return_value.st_mode = 0o40700
        state_path.__str__ = Mock(return_value=state_name)
        def path(value):
            return state_path if str(value) == state_name else real_path(value)
        calls, candidate_env = [], {}
        def command(args, **_):
            calls.append(args)
            self.assertEqual(args[:2], ['docker', 'create'])
            env_file = args[args.index('--env-file')+1]
            candidate_env.update(line.split('=', 1) for line in real_path(env_file).read_text().splitlines())
            self.assertNotIn('VIDEO_REFERENCE_PUBLIC_BASE_URL=', ' '.join(args))
            return ('2'*64).encode()
        with tempfile.TemporaryDirectory() as folder:
            tx = m.HostTransaction(m.TARGET, 'a'*64, folder, command=command)
            tx.stack = True  # simulated lock scope; this test touches no host.
            tx.pin = lambda _: source
            tx.save = Mock()
            tx.inspect = lambda _: {'Id': '2'*64, 'Name': '/naumi47-new-video-origin', 'Image': image,
                                   'Config': {'Env': [key+'='+value for key, value in candidate_env.items()]},
                                   'State': {'Running': False, 'StartedAt': ''},
                                   'HostConfig': {'RestartPolicy': {'Name': 'no'}}}
            with patch.object(m.pathlib, 'Path', side_effect=path), patch.object(m.os, 'chown', create=True):
                result = tx.clone_web(m.public_identity(source), name='naumi47-new-video-origin', port=13122,
                                      image=image, commit='b'*40, memory_mib=2048, cpu=0.5,
                                      release_secret='s'*40, state_dir=state_name, build_version='1792674911',
                                      reviewed_video_reference_origin='https://47.105.59.142',
                                      reviewed_remote_first_nas_delivery=True, reviewed_nas_backfill_cutoff='2030-01-01T00:00:00.123456Z')
            self.assertFalse(result['running'])
            self.assertEqual(candidate_env['VIDEO_REFERENCE_PUBLIC_BASE_URL'], 'https://47.105.59.142')
            self.assertEqual(candidate_env['EXISTING_SETTING'], 'preserved')
            self.assertEqual(candidate_env['NAUMI_NAS_DEFER_UPLOAD'], '0')
            self.assertEqual(candidate_env['NAUMI_NAS_BACKFILL_CUTOFF_UTC'], '2030-01-01T00:00:00.123456Z')
            self.assertEqual(source, before, 'Existing slot configuration must remain untouched')
            self.assertEqual(len(calls), 1, 'Only candidate create is requested; no restart or update')
            tx.save.assert_any_call('reviewed-video-reference-origin-naumi47-new-video-origin.json',
                                    {'origin': 'https://47.105.59.142', 'existingSlotChanged': False})

    def test_reviewed_video_reference_origin_rejects_every_other_origin_before_mutation(self):
        source = {'Config': {'Cmd': ['node', 'server.js'], 'Env': []},
                  'NetworkSettings': {'Networks': {'synthetic-network': {}}}, 'Mounts': []}
        for target, origin in [(m.TARGET, 'http://47.105.59.142'), (m.TARGET, 'https://other.example.test'),
                               (m.TARGET, 'https://47.105.59.142/'), (m.TARGET, 'https://47.105.59.142/path'),
                               ('103.30.76.93', 'https://47.105.59.142')]:
            with self.subTest(target=target, origin=origin):
                tx = m.HostTransaction(target, 'a'*64, '/tmp/unused')
                tx.pin = lambda _: source
                tx.run = Mock()
                tx.save = Mock()
                with self.assertRaisesRegex(m.Hold, 'EXACT_REVIEWED_VIDEO_REFERENCE_ORIGIN_REQUIRED'):
                    tx.clone_web({}, name='naumi47-rejected-origin', port=13122, image='sha256:'+'a'*64,
                                 commit='b'*40, memory_mib=2048, cpu=0.5, release_secret='s'*40,
                                 state_dir='/opt/naumi-staging/releases/synthetic/web', build_version='1792674911',
                                 reviewed_video_reference_origin=origin)
                tx.run.assert_not_called()
                tx.save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
