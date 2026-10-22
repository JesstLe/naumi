import copy
import hashlib
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

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
            'webFinalMemoryMiB': 3072, 'commit': 'b' * 40,
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
                           ('webFinalMemoryMiB', 2048), ('mediaProbePath', '/data/unreviewed.mp4'),
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

    def test_only_memory_method_is_reused_from_nas(self):
        cls = mod.VideoFamilyController
        self.assertNotIn(NasController, cls.__mro__)
        self.assertIs(cls.after_retirement, NasController.after_retirement)
        self.assertIsNot(cls.ready, NasController.ready)
        self.assertIs(cls.drain_proof, ImageDeliveryController.drain_proof)
        for name in ['run', 'finish_ready', 'retire_ready', 'build_gateway', 'install_supervisor', 'recover_failure']:
            self.assertIs(getattr(cls, name), getattr(ctl.Controller, name))

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
