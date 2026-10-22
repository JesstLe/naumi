import copy
import hashlib
import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

import release47_normal_controller as ctl
import release47_video_family_successor as mod
from release47_host import Hold
from release47_image_delivery_successor import ImageDeliveryController
from release47_nas_successor import NasController


def identity(name):
    return {'id': name, 'name': name, 'image': 'sha256:' + 'a' * 64}


class VideoFamilyRelease(unittest.TestCase):
    def setUp(self):
        self.config = {
            'authorization': mod.AUTHORIZATION, 'releaseId': 'release47-video-family-20261023',
            'predecessorReleaseId': 'release47-nas-upload-20261022',
            'previousNormalReleaseId': 'release47-nas-upload-20261022',
            'restoreDatabase': False, 'replayAcceptedTasks': False, 'activateDisabledModels': False,
            'webMemoryMiB': 1536, 'workerMemoryMiB': 1024, 'reviewedCombinedMedia': True,
            'webFinalMemoryMiB': 2048, 'commit': 'b' * 40,
            'videoReferencePublicOrigin': 'https://47.105.59.142',
            'storageAcceptanceScript': '/opt/naumi-staging/evidence/video-family/tools/storage.cjs',
            'storageAcceptanceSha256': 'e' * 64,
            'mediaProbePath': '/data/isolated-provider-probes/provider-video-probe-20261023/sample.mp4',
            'mediaProbeSha256': 'f' * 64,
            'image': 'sha256:' + 'c' * 64, 'version': '1792700000', 'imageArchiveSha256': 'd' * 64,
            'imageAcceptanceOperations': ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
            'oldWeb': identity('current-web'), 'oldWorker': identity('current-worker'),
        }
        self.state = {'phase': 'MIGRATED_CLEANUP_PENDING', 'legacyDrainProven': False,
            'activeNormalBlueGreenReleaseId': self.config['predecessorReleaseId'],
            'runtimeRecovery': {'phase': 'ACKNOWLEDGED', 'successorReleaseId': self.config['predecessorReleaseId']},
            'normalBlueGreenReleases': {self.config['predecessorReleaseId']: {
                'phase': 'COMPLETE', 'operations': {}, 'retired': ['retired-web', 'retired-worker'],
                'web': self.config['oldWeb'], 'worker': self.config['oldWorker']}}}
        class Fixture:
            def __init__(self): self.running = False; self.restart = 'no'; self.memory = 3072
            def inspect(self, name):
                return {'Id': name, 'Name': '/' + name, 'Image': 'sha256:' + 'a' * 64,
                    'State': {'Running': self.running, 'StartedAt': 'fixed-start'},
                    'HostConfig': {'RestartPolicy': {'Name': self.restart}, 'Memory': self.memory * 1048576}}
        self.tx = Fixture()

    def test_program_only_config_preserves_final_memory(self):
        before = copy.deepcopy(self.config)
        mod.validate_config(self.config)
        self.assertEqual(self.config, before)
        for key, value in [('activateDisabledModels', True), ('authorization', '继续'),
                           ('webMemoryMiB', 2048), ('workerMemoryMiB', 512), ('reviewedCombinedMedia', False),
                           ('webFinalMemoryMiB', 3072), ('mediaProbePath', '/data/unreviewed.mp4'),
                           ('videoReferencePublicOrigin', 'http://172.18.0.1:13947'),
                           ('imageAcceptanceOperations', []), ('preservedWorkerTick', {'old': 'unknown'})]:
            sample = {**self.config, key: value}
            with self.subTest(key=key), self.assertRaises(Hold):
                mod.validate_config(sample)

    def test_predecessor_actual_retirement_is_verified_without_changing_history(self):
        before = copy.deepcopy(self.state)
        proof = mod.predecessor_proof(self.tx, self.state, self.config)
        self.assertEqual(len(proof['retired']), 2)
        self.assertFalse(proof['historicalUnknownsCleared'])
        self.assertEqual(self.state, before)
        self.tx.running = True
        with self.assertRaisesRegex(Hold, 'PREVIOUS_VIDEO_SLOT_STILL_RUNNING'):
            mod.predecessor_proof(self.tx, self.state, self.config)

    def test_unknown_operation_cannot_be_carried_as_old_incident(self):
        prior = self.state['normalBlueGreenReleases'][self.config['predecessorReleaseId']]
        prior['operations']['unknown-mutation'] = {'phase': 'UNKNOWN'}
        with self.assertRaisesRegex(Hold, 'PRIOR_VIDEO_OPERATION_NOT_RECONCILED'):
            mod.predecessor_proof(self.tx, self.state, self.config)

    def test_other_unfinished_publication_blocks(self):
        self.state['normalBlueGreenReleases']['other'] = {'phase': 'READY', 'operations': {}}
        with self.assertRaises(Hold):
            mod.predecessor_proof(self.tx, self.state, self.config)

    def test_standard_preswitch_resume_only_keeps_original_acknowledged_operations(self):
        self.config['resumeReview'] = {'revision': 1}
        self.state['normalBlueGreenReleases'][self.config['releaseId']] = {
            'phase': 'BACKED_UP', 'operations': {'database-backup': {'phase': 'ACKNOWLEDGED'}}}
        mod.predecessor_proof(self.tx, self.state, self.config)
        self.state['normalBlueGreenReleases'][self.config['releaseId']]['operations']['database-backup']['phase'] = 'UNKNOWN'
        with self.assertRaises(Hold):
            mod.predecessor_proof(self.tx, self.state, self.config)

    def test_prior_memory_and_exact_slot_are_not_guessed(self):
        self.tx.memory = 2048
        with self.assertRaisesRegex(Hold, 'REVIEWED_PRIOR_3G_WEB_CHANGED'):
            mod.predecessor_proof(self.tx, self.state, self.config)
        self.tx.memory = 3072
        self.config['oldWeb'] = identity('another-web')
        with self.assertRaisesRegex(Hold, 'VIDEO_PREDECESSOR_SLOT_CHANGED'):
            mod.predecessor_proof(self.tx, self.state, self.config)

    def test_explicit_two_gib_predecessor_preserves_completed_and_retired_gates(self):
        self.config['predecessorWebMemoryMiB'] = 2048
        self.tx.memory = 2048
        before = copy.deepcopy((self.state, self.config))
        mod.validate_config(self.config)
        proof = mod.predecessor_proof(self.tx, self.state, self.config)
        self.assertEqual(proof['priorWebMemoryMiB'], 2048)
        self.assertEqual(proof['dualSlotRequiredMiB'], 3584)
        self.assertEqual(proof['finalWebMemoryMiB'], 2048)
        self.assertEqual((self.state, self.config), before)
        prior = self.state['normalBlueGreenReleases'][self.config['predecessorReleaseId']]
        prior['phase'] = 'READY'
        with self.assertRaisesRegex(Hold, 'PUBLICATION_NOT_COMPLETE'):
            mod.predecessor_proof(self.tx, self.state, self.config)
        prior['phase'] = 'COMPLETE'; prior['operations']['unresolved'] = {'phase': 'UNKNOWN'}
        with self.assertRaisesRegex(Hold, 'OPERATION_NOT_RECONCILED'):
            mod.predecessor_proof(self.tx, self.state, self.config)

    def test_reviewed_predecessor_cap_is_strict_and_must_match_actual(self):
        for value in [None, True, 1024, 2048.0, '2048', 4096]:
            with self.subTest(value=value), self.assertRaisesRegex(Hold, 'PRIOR_2G_OR_3G'):
                mod.validate_config({**self.config, 'predecessorWebMemoryMiB': value})
        self.config['predecessorWebMemoryMiB'] = 2048
        self.tx.memory = 3072
        with self.assertRaisesRegex(Hold, 'REVIEWED_PRIOR_2G_WEB_CHANGED'):
            mod.predecessor_proof(self.tx, self.state, self.config)
        self.config['predecessorWebMemoryMiB'] = 3072
        self.assertEqual(mod.predecessor_proof(self.tx, self.state, self.config)['priorWebMemoryMiB'], 3072)

    def test_combined_web_successor_keeps_scratch_and_uses_new_control_and_media_identity(self):
        from release47_host import HostTransaction
        from types import SimpleNamespace
        real_path = pathlib.Path
        state_name = '/opt/naumi-staging/releases/video-family-r3/web'
        old_state = '/opt/naumi-staging/releases/video-family-r2/web'
        scratch_name = '/opt/naumi-staging/data/video-media-jobs'
        old = {'Id': 'a' * 64, 'Name': '/naumi47-web-video-family-r2', 'Image': 'sha256:' + 'a' * 64,
               'State': {'Running': True, 'StartedAt': 'original-combined-web-boot'},
               'Config': {'Cmd': ['node', 'server.js'], 'Env': ['NAUMI_MEDIA_WORKER=1',
                   'MEDIA_WORKER_ORIGIN=http://naumi47-worker-video-family-r2:3002',
                   'MEDIA_WORKER_SECRET=' + 'old-media-secret-' * 4, 'VIDEO_WORKER_SECRET=' + 'scanner-secret-' * 4]},
               'HostConfig': {'RestartPolicy': {'Name': 'no'}},
               'NetworkSettings': {'Networks': {'fixture-network': {}}},
               'Mounts': [{'Type': 'bind', 'Source': scratch_name, 'Destination': '/scratch', 'RW': True},
                          {'Type': 'bind', 'Source': old_state, 'Destination': '/release-state', 'RW': True}]}
        original = copy.deepcopy(old); captured = {}; calls = []
        state_path = Mock(); state_path.is_absolute.return_value = True; state_path.is_symlink.return_value = False
        state_path.resolve.return_value.is_relative_to.return_value = True
        state_path.stat.return_value.st_mode = 0o40700
        state_path.__str__ = Mock(return_value=state_name)
        scratch = Mock(); scratch.is_symlink.return_value = False; scratch.exists.return_value = True
        scratch.is_dir.return_value = True; scratch.stat.return_value = SimpleNamespace(st_uid=1001, st_mode=0o40700)
        scratch.__str__ = Mock(return_value=scratch_name)
        def path(value):
            if str(value) == state_name: return state_path
            if str(value) == scratch_name: return scratch
            return real_path(value)
        def command(args, **_kwargs):
            calls.append(args)
            env_path = real_path(args[args.index('--env-file') + 1])
            captured.update(line.split('=', 1) for line in env_path.read_text().splitlines())
            return ('b' * 64).encode()
        with tempfile.TemporaryDirectory() as folder:
            tx = HostTransaction('47.105.59.142', 'a' * 64, folder, command=command)
            tx.stack = True; tx.pin = lambda _identity: old; tx.save = Mock()
            tx.inspect = lambda _identifier: {'Id': 'b' * 64, 'Name': '/naumi47-web-video-family-r3',
                'Image': self.config['image'], 'State': {'Running': False, 'StartedAt': ''},
                'HostConfig': {'RestartPolicy': {'Name': 'no'}},
                'Config': {'Env': [key + '=' + value for key, value in captured.items()]}}
            with patch('release47_host.pathlib.Path', side_effect=path), patch('release47_host.os.chown', create=True):
                tx.clone_web(mod.public_identity(old), name='naumi47-web-video-family-r3', port=13133,
                    image=self.config['image'], commit=self.config['commit'], memory_mib=1536, cpu=1.5,
                    release_secret='r' * 48, state_dir=state_name, build_version=self.config['version'],
                    reviewed_prior_state_dir=old_state, reviewed_combined_media={
                        'workerName': 'naumi47-worker-video-family-r3', 'secret': 'new-media-secret-' * 4,
                        'scratchSource': scratch_name})
        self.assertEqual(old, original)
        self.assertEqual(captured['NAUMI_MEDIA_WORKER'], '1')
        self.assertEqual(captured['MEDIA_WORKER_ORIGIN'], 'http://naumi47-worker-video-family-r3:3002')
        self.assertEqual(captured['MEDIA_WORKER_SECRET'], 'new-media-secret-' * 4)
        self.assertEqual(captured['SOURCE_COMMIT'], self.config['commit'])
        self.assertEqual(captured['NAUMI_INSTANCE_ID'], 'naumi47-web-video-family-r3')
        self.assertIn('type=bind,src=' + scratch_name + ',dst=/scratch', calls[0])
        self.assertIn('type=bind,src=' + state_name + ',dst=/release-state', calls[0])
        self.assertFalse(any('src=' + old_state + ',' in value for value in calls[0]))
        self.assertEqual(sum('dst=/scratch' in value for value in calls[0]), 1)
    def test_no_nas_memory_or_exception_is_reused(self):
        cls = mod.VideoFamilyController
        self.assertNotIn(NasController, cls.__mro__)
        self.assertIsNot(cls.after_retirement, NasController.after_retirement)
        self.assertIsNot(cls.ready, NasController.ready)
        self.assertIs(cls.drain_proof, ImageDeliveryController.drain_proof)
        for name in ['run', 'finish_ready', 'retire_ready', 'build_gateway', 'install_supervisor', 'recover_failure']:
            self.assertIs(getattr(cls, name), getattr(ctl.Controller, name))

    def test_final_ram_uses_only_old_anon_and_full_two_gib_reserves(self):
        proof = mod.retirement_ram_budget(3000 * mod.MIB, 300 * mod.MIB, [700 * mod.MIB, 96 * mod.MIB])
        self.assertTrue(proof['passed'])
        self.assertEqual(proof['requiredAvailableMiB'], 3796)
        self.assertEqual(proof['marginMiB'], 0)
        self.assertFalse(proof['fileCacheCredited'])
        self.assertFalse(proof['swapIncluded'])
        self.assertFalse(mod.retirement_ram_budget(3000 * mod.MIB - 1, 300 * mod.MIB, [700 * mod.MIB, 96 * mod.MIB])['passed'])
        # Partial MiB in current usage cannot lower growth by a full MiB.
        self.assertFalse(mod.retirement_ram_budget(3000 * mod.MIB, 300 * mod.MIB + 1, [700 * mod.MIB, 95 * mod.MIB])['passed'])
        for value in [True, -1, None]:
            with self.subTest(value=value), self.assertRaises(Hold):
                mod.retirement_ram_budget(value, 0, [])

    def test_actual_memory_observation_never_credits_old_file_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder); cgroups = root / 'cgroup'; cgroups.mkdir()
            meminfo = root / 'meminfo'; meminfo.write_text('MemAvailable: 3072000 kB\nSwapFree: 999999999 kB\n')
            rows = {}
            for name, identifier in [('old-web', 'a' * 64), ('old-worker', 'b' * 64), ('new-web', 'c' * 64)]:
                rows[identifier] = {'Id': identifier, 'Name': '/' + name, 'Image': self.config['image'],
                    'State': {'Running': True, 'StartedAt': 'unchanged-start'},
                    'HostConfig': {'Memory': 1536 * mod.MIB, 'RestartPolicy': {'Name': 'no'}}}
                group = cgroups / ('docker-' + identifier + '.scope'); group.mkdir()
                (group / 'memory.current').write_text(str(300 * mod.MIB))
                (group / 'memory.stat').write_text('anon 0\nfile ' + str(10000 * mod.MIB) + '\n')
            op = mod.VideoFamilyController.__new__(mod.VideoFamilyController)
            op.cfg = self.config; op.newweb = mod.public_identity(rows['c' * 64])
            op.web = mod.public_identity(rows['a' * 64]); op.worker = mod.public_identity(rows['b' * 64])
            saved = []
            class Fixture:
                def pin(self, identity): return copy.deepcopy(rows[identity['id']])
                def inspect(self, identifier): return copy.deepcopy(rows[identifier])
                def save(self, name, value): saved.append((name, value))
            op.tx = Fixture()
            with patch.object(mod, 'CGROUP_ROOT', cgroups), patch.object(mod, 'MEMINFO', meminfo):
                with self.assertRaisesRegex(Hold, 'FINAL_RAM_RESERVE_INSUFFICIENT'):
                    op.retirement_memory_proof('ready')
                self.assertEqual(saved[-1][1]['oldAnonymousCreditMiB'], 0)
                for identifier, anon in [('a' * 64, 700), ('b' * 64, 96)]:
                    (cgroups / ('docker-' + identifier + '.scope') / 'memory.stat').write_text('anon ' + str(anon * mod.MIB) + '\n')
                self.assertTrue(op.retirement_memory_proof('retire')['passed'])
                for identifier in ['a' * 64, 'b' * 64]: rows[identifier]['State']['Running'] = False
                with self.assertRaisesRegex(Hold, 'FINAL_RAM_RESERVE_INSUFFICIENT'):
                    op.retirement_memory_proof('after-retirement', include_old=False)
                meminfo.write_text('MemAvailable: ' + str(3796 * 1024) + ' kB\n')
                actual = op.retirement_memory_proof('after-retirement', include_old=False)
                self.assertEqual(actual['oldAnonymousCreditMiB'], 0)
                self.assertTrue(actual['passed'])

    def test_retirement_reference_rechecks_ram_before_any_stop(self):
        op = mod.VideoFamilyController.__new__(mod.VideoFamilyController)
        stages = []; op.retirement_memory_proof = lambda stage: stages.append(stage)
        with patch.object(ctl.Controller, 'reference_proof', return_value='references-verified') as original:
            self.assertEqual(op.reference_proof(), 'references-verified')
            original.assert_called_once()
        self.assertEqual(stages, ['retire'])

    def test_final_two_gib_updates_supervisor_without_process_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest_path = pathlib.Path(folder) / 'supervisor.json'
            row = {'Id': 'c' * 64, 'Name': '/new-web', 'Image': self.config['image'],
                'State': {'Running': True, 'StartedAt': 'same-process'},
                'HostConfig': {'Memory': 1536 * mod.MIB, 'MemorySwap': 1536 * mod.MIB, 'RestartPolicy': {'Name': 'no'}}}
            op = mod.VideoFamilyController.__new__(mod.VideoFamilyController)
            op.cfg = self.config; op.newweb = mod.public_identity(row); op.newworker = {'id': 'd' * 64}
            op.state = {'runtimeRecovery': {'manifestPath': str(manifest_path)}}
            manifest = {'web': {**op.newweb, 'memoryMiB': 1536, 'staticSha256': '1536'},
                        'worker': {'id': op.newworker['id'], 'memoryMiB': 1024}}
            manifest_path.write_text(json.dumps(manifest))
            stages = []; commands = []; operations = []; saved = []; persisted = []
            op.retirement_memory_proof = lambda stage, include_old: stages.append((stage, include_old)) or {'passed': True}
            op.persist = lambda: persisted.append(True)
            def operation(name, execute): operations.append(name); return execute('fixture-operation')
            op.op = operation
            class Fixture:
                def pin(self, _identity): return copy.deepcopy(row)
                def inspect(self, _identifier): return copy.deepcopy(row)
                def save(self, name, value): saved.append((name, value))
                def run(self, command):
                    commands.append(command)
                    row['HostConfig'].update(Memory=2048 * mod.MIB, MemorySwap=2048 * mod.MIB)
            op.tx = Fixture()
            with patch.object(mod.recovery, 'static_pin', lambda value: str(value['HostConfig']['Memory'] // mod.MIB)):
                op.after_retirement()
            changed = json.loads(manifest_path.read_bytes())
            self.assertEqual(changed['web']['memoryMiB'], 2048)
            self.assertEqual(changed['web']['staticSha256'], '2048')
            self.assertEqual(op.state['runtimeRecovery']['memoryMiB'], 2048)
            self.assertEqual(operations, ['new-web-memory-grow'])
            self.assertEqual(stages, [('after-retirement', False)])
            self.assertEqual(commands, [['docker', 'update', '--memory=2048m', '--memory-swap=2048m', row['Id']]])
            self.assertEqual(row['State']['StartedAt'], 'same-process')
            self.assertEqual(len(persisted), 1)

    def test_real_media_health_rejects_sandbox_version_or_capacity_drift(self):
        op = mod.VideoFamilyController.__new__(mod.VideoFamilyController)
        op.newweb = {'id': 'new-web'}
        op.cfg = self.config
        health = {'ok': True, 'sandbox': True, 'version': self.config['commit'], 'concurrency': 1,
                  'draining': True, 'running': 0, 'queued': 0, 'terminal': 0}
        class Fixture:
            def run(self, *args, **kwargs): return json.dumps(health).encode()
        op.tx = Fixture()
        self.assertTrue(op.media_worker()['sandbox'])
        for field, value in [('ok', False), ('sandbox', False), ('version', 'a' * 40),
                             ('concurrency', 2), ('draining', None), ('running', True), ('queued', -1)]:
            original = health[field]; health[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(Hold, 'REAL_MEDIA_WORKER_NOT_READY'):
                op.media_worker()
            health[field] = original

    def test_ready_checks_candidate_origin_and_fixed_real_storage_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root / 'tools').mkdir()
            script = root / 'tools/storage.cjs'
            script.write_bytes(b'/* isolated storage acceptance fixture */')
            op = mod.VideoFamilyController.__new__(mod.VideoFamilyController)
            op.newweb = {'id': 'new-web'}
            op.newworker = {'id': 'new-worker'}
            op.retirement_memory_proof = lambda stage: {'passed': True, 'stage': stage}
            op.succ = {'operations': {}}
            op.cookie = 'fixture-cookie-not-a-live-session'
            op.cfg = {**self.config, 'storageAcceptanceScript': str(script),
                      'storageAcceptanceSha256': hashlib.sha256(script.read_bytes()).hexdigest()}
            op.worker_control = lambda *args: {'state': {'paused': True, 'activeTicks': 0, 'unresolvedTicks': 0}}
            health = {'ok': True, 'sandbox': True, 'version': op.cfg['commit'], 'concurrency': 1,
                      'draining': True, 'running': 0, 'queued': 0, 'terminal': 0}
            def media_worker(action=None, operation=None):
                if action == 'resume': health['draining'] = False
                return dict(health)
            op.media_worker = media_worker
            def operation(name, execute):
                receipt = execute('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
                op.succ['operations'][name] = {'phase': 'ACKNOWLEDGED', 'receipt': receipt}
                return receipt
            op.op = operation
            class Fixture:
                origin = 'https://47.105.59.142'
                passed = True
                def __init__(self): self.calls = []; self.saved = []
                def inspect(self, _name):
                    return {'Config': {'Env': ['VIDEO_REFERENCE_PUBLIC_BASE_URL=' + self.origin]}}
                def run(self, command, *, stdin=None, **_options):
                    self.calls.append((command, stdin))
                    if command[:2] == ['docker', 'cp']:
                        return b''
                    if '0:0' in command:
                        if 'chownSync' not in ' '.join(command): return b''
                        return json.dumps({'sha256': hashlib.sha256(script.read_bytes()).hexdigest(),
                                           'uid': 1001, 'mode': 0o600}).encode()
                    return json.dumps({'passed': self.passed, 'actualUpload': True,
                                       'verificationDataCleaned': True, 'supplierCalls': 0,
                                       'signatureDirectDownload': True, 'HEAD': True, 'Range': True,
                                       'mediaProbeCleaned': True, 'mediaProbe': {'passed': True,
                                           'sourceSha256': op.cfg['mediaProbeSha256']},
                                       'sourceCommit': op.cfg['commit'], 'buildVersion': op.cfg['version']}).encode()
                def save(self, name, value): self.saved.append((name, value))
            op.tx = Fixture()
            with patch.object(ctl, 'ROOT', root), patch.object(ImageDeliveryController, 'ready', return_value={'original': True}):
                result = op.ready()
                self.assertTrue(result['original'])
                self.assertEqual(result['videoReferencePublicOrigin'], 'https://47.105.59.142')
                self.assertEqual(op.tx.calls[1][0][:2], ['docker', 'cp'])
                helper_call = op.tx.calls[3]
                self.assertIn('NODE_OPTIONS=--conditions=react-server', helper_call[0])
                self.assertTrue(helper_call[0][-1].startswith('/tmp/video-reference-acceptance-'))
                self.assertEqual(json.loads(helper_call[1]), {'cookie': op.cookie,
                    'root': '/data/isolated-provider-config/video-reference-acceptance-' + op.cfg['releaseId'],
                    'publicCheck': False, 'mediaProbePath': op.cfg['mediaProbePath'],
                    'mediaProbeSha256': op.cfg['mediaProbeSha256']})
                op.tx.origin = 'http://172.18.0.1:13947'
                with self.assertRaisesRegex(Hold, 'CANDIDATE_VIDEO_REFERENCE_ORIGIN_CHANGED'):
                    op.ready()
                self.assertEqual(len(op.tx.calls), 4)
                op.tx.origin = 'https://47.105.59.142'
                op.succ['operations']['candidate-media-probe-resume']['phase'] = 'UNKNOWN'
                with self.assertRaisesRegex(Hold, 'ORIGINAL_MEDIA_PROBE_CONTROL_REQUIRES_RECONCILIATION'):
                    op.ready()
                self.assertEqual(len(op.tx.calls), 4)
                op.succ['operations']['candidate-media-probe-resume']['phase'] = 'ACKNOWLEDGED'
                op.worker_control = lambda *args: {'state': {'paused': False, 'activeTicks': 0, 'unresolvedTicks': 0}}
                with self.assertRaisesRegex(Hold, 'SCANNER_MUST_REMAIN_PAUSED'):
                    op.ready()
                self.assertEqual(len(op.tx.calls), 4)
                op.worker_control = lambda *args: {'state': {'paused': True, 'activeTicks': 0, 'unresolvedTicks': 0}}
                op.tx.passed = False
                with self.assertRaisesRegex(Hold, 'REAL_VIDEO_FAMILY_STORAGE_ACCEPTANCE_FAILED'):
                    op.ready()


if __name__ == '__main__':
    unittest.main()
