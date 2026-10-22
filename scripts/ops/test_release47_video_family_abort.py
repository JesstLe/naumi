import copy
import json
import pathlib
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import release47_video_family_abort as mod
import release_lifecycle as lifecycle
from release47_host import Hold
from test_release47_authorized_successor import IncidentContinuation


def identity(letter, name):
    return {'id': letter * 64, 'name': name, 'image': mod.IMAGE, 'running': True,
            'startedAt': 'fixed-candidate-start', 'restartPolicy': 'no'}


class VideoAbortGate(unittest.TestCase):
    def setUp(self):
        self.release = 'release47-video-family-20261023'
        self.prior = 'release47-nas-upload-20261022'
        self.cfg = {'releaseId': self.release, 'predecessorReleaseId': self.prior,
                    'commit': mod.COMMIT, 'image': mod.IMAGE, 'version': mod.VERSION,
                    'newWebName': 'candidate-web', 'newWorkerName': 'candidate-worker',
                    'mediaProbeSha256': 'b' * 64}
        self.original = {'revision': 608, 'target': '47.105.59.142',
            'phase': 'MIGRATED_CLEANUP_PENDING', 'legacyDrainProven': False,
            'blueGreenSuccessor': {'phase': 'COMPLETE', 'historicalUnknown': 2},
            'operations': {'historic': {'phase': 'ACKNOWLEDGED'}},
            'activeNormalBlueGreenReleaseId': self.prior,
            'runtimeRecovery': {'phase': 'ACKNOWLEDGED', 'successorReleaseId': self.prior},
            'normalBlueGreenReleases': {self.prior: {'phase': 'COMPLETE'}}}
        self.state = copy.deepcopy(self.original); self.state['revision'] = mod.INITIAL_REVISION
        self.candidates = [identity('c', 'candidate-web'), identity('d', 'candidate-worker')]
        operations = {name: {'phase': 'ACKNOWLEDGED', 'operationId': str(uuid.UUID(int=index + 1))}
                      for index, name in enumerate(sorted(mod.ORIGINAL_OPERATIONS))}
        operations['candidate-media-probe-resume']['operationId'] = mod.MEDIA_RESUME_UUID
        operations['web-start']['receipt'] = self.candidates[0]
        operations['worker-start']['receipt'] = self.candidates[1]
        self.succ = {'phase': 'CANDIDATE', 'lastError': 'HOST_COMMAND_FAILED', 'commit': mod.COMMIT,
                     'image': mod.IMAGE, 'buildVersion': mod.VERSION, 'operations': operations,
                     'web': self.candidates[0], 'worker': self.candidates[1], 'retired': []}
        self.state['normalBlueGreenReleases'][self.release] = self.succ
        self.review = {'schemaVersion': 1, 'kind': 'video-family-pre-switch-abort-review',
                       'releaseId': self.release, 'revision': mod.INITIAL_REVISION,
                       'canonicalFileSha256': 'a' * 64,
                       'operations': {name: row['operationId'] for name, row in operations.items()},
                       'candidateStaticPins': {'web': 'e' * 64, 'worker': 'f' * 64}}
        self.helper = {'passed': False, 'errorStage': 'LOCAL_SIGNED_HTTP',
                       'errorCode': 'UNEXPECTED_ACCEPTANCE_FAILURE', 'actualUpload': True,
                       'verificationDataCleaned': True, 'mediaProbeCleaned': True,
                       'mediaProbe': {'passed': True, 'sourceSha256': self.cfg['mediaProbeSha256']},
                       'sourceCommit': mod.COMMIT, 'buildVersion': mod.VERSION, 'supplierCalls': 0}

    def gate(self):
        return mod.journal_gate(self.state, self.original, self.cfg, self.review, 'a' * 64)

    def test_exact_candidate_gate_does_not_mutate_history_or_operation_uuids(self):
        before = copy.deepcopy((self.state, self.original, self.review))
        self.assertFalse(self.gate()['gatewaySwitched'])
        self.assertEqual((self.state, self.original, self.review), before)

    def test_switched_opened_or_old_drained_operation_always_blocks(self):
        for name in ['gateway-switch', 'new-web-open', 'old-web-drain', 'old-worker-drain',
                     'abort-candidate-worker-drain', 'unknown-extra']:
            self.succ['operations'][name] = {'phase': 'ACKNOWLEDGED', 'operationId': str(uuid.uuid4())}
            with self.subTest(name=name), self.assertRaises(Hold): self.gate()
            del self.succ['operations'][name]

    def test_unknown_original_or_uuid_drift_cannot_be_reconciled_by_abort(self):
        for name in mod.ORIGINAL_OPERATIONS:
            original = copy.deepcopy(self.succ['operations'][name])
            for change in [{'phase': 'UNKNOWN'}, {'operationId': str(uuid.uuid4())}]:
                self.succ['operations'][name].update(change)
                with self.subTest(name=name, change=change), self.assertRaises(Hold): self.gate()
                self.succ['operations'][name] = copy.deepcopy(original)

    def test_any_prior_or_unrelated_historical_state_mutation_blocks(self):
        for key, value in [('phase', 'COMPLETE'), ('legacyDrainProven', True),
                           ('activeNormalBlueGreenReleaseId', self.release), ('revision', 627),
                           ('runtimeRecovery', {'phase': 'UNKNOWN'}), ('newUnrelatedField', True)]:
            old = copy.deepcopy(self.state); self.state[key] = value
            with self.subTest(key=key), self.assertRaises(Hold): self.gate()
            self.state = old; self.succ = self.state['normalBlueGreenReleases'][self.release]

    def test_wrong_program_phase_or_retirement_blocks(self):
        for key, value in [('phase', 'READY'), ('commit', 'f' * 40), ('image', 'sha256:' + 'e' * 64),
                           ('lastError', 'OTHER'), ('retired', ['old-slot']), ('preSwitchAbort', {'phase': 'UNKNOWN'})]:
            old = copy.deepcopy(self.succ); self.succ[key] = value
            with self.subTest(key=key), self.assertRaises(Hold): self.gate()
            self.succ.clear(); self.succ.update(old)

    def test_helper_failed_http_is_safe_only_when_all_created_data_is_cleaned(self):
        self.assertEqual(mod.helper_cleanup_proof(self.helper, self.cfg)['supplierCalls'], 0)
        for key, value in [('verificationDataCleaned', False), ('mediaProbeCleaned', False),
                           ('supplierCalls', 1), ('supplierCalls', False), ('actualUpload', False),
                           ('sourceCommit', 'c' * 40), ('errorStage', 'UPLOAD'),
                           ('cleanupErrorCode', 'UNKNOWN')]:
            sample = {**self.helper, key: value}
            with self.subTest(key=key), self.assertRaises(Hold): mod.helper_cleanup_proof(sample, self.cfg)

    def runtimes(self):
        old_app = {'admission': {'mode': 'open'}}
        old_worker = {'paused': False, 'activeTicks': 0, 'unresolvedTicks': 0,
                      'lastTick': {'phase': 'complete'}}
        app = {'admission': {'mode': 'draining'}, 'identity': {'instanceId': self.cfg['newWebName'], 'commit': mod.COMMIT}}
        worker = {'instanceId': self.cfg['newWorkerName'], 'commit': mod.COMMIT,
                  'targetInstanceId': self.cfg['newWebName'], 'paused': True,
                  'activeTicks': 0, 'unresolvedTicks': 0, 'mediaWorker': {'ok': True, 'version': mod.COMMIT,
                  'sandbox': True, 'draining': False, 'running': 0, 'queued': 0, 'terminal': 0,
                  'maxActive': 8, 'concurrency': 1}}
        return old_app, old_worker, app, worker

    def test_old_service_must_stay_open_and_candidate_scanner_paused(self):
        self.assertTrue(mod.initial_runtime_gate(*self.runtimes(), self.cfg)['oldWebOpen'])
        for index, key, value in [(0, 'admission', {'mode': 'draining'}), (1, 'paused', True),
                                  (1, 'unresolvedTicks', 1), (1, 'activeTicks', False),
                                  (2, 'admission', {'mode': 'open'}), (3, 'paused', False),
                                  (3, 'activeTicks', 1), (3, 'mediaWorker', None)]:
            runtime = list(self.runtimes()); runtime[index][key] = value
            with self.subTest(index=index, key=key), self.assertRaises(Hold):
                mod.initial_runtime_gate(*runtime, self.cfg)

    def test_pending_media_output_or_false_sandbox_blocks_abort(self):
        for key, value in [('sandbox', False), ('draining', True), ('running', 1), ('queued', 1), ('terminal', 1),
                           ('version', 'c' * 40), ('concurrency', 2)]:
            runtime = list(self.runtimes()); runtime[3]['mediaWorker'][key] = value
            with self.subTest(key=key), self.assertRaises(Hold): mod.initial_runtime_gate(*runtime, self.cfg)

    def test_candidate_db_all_boots_claims_and_any_tick_receipt_block(self):
        proof = {'scope': 'candidate-all-boots', 'counts': {
            'activeOrUnknownActivities': 0, 'nonidleSessionOwners': 0, 'candidateTickReceipts': 0},
            'historicalActivityCount': 12}
        self.assertEqual(mod.candidate_database_gate(proof)['historicalActivityCount'], 12)
        for name in proof['counts']:
            for value in [1, False, None]:
                sample = copy.deepcopy(proof); sample['counts'][name] = value
                with self.subTest(name=name, value=value), self.assertRaises(Hold): mod.candidate_database_gate(sample)

    def rows(self):
        return [{'Id': p['id'], 'Name': '/' + p['name'], 'Image': p['image'],
                 'State': {'Running': False, 'StartedAt': p['startedAt'], 'OOMKilled': False},
                 'HostConfig': {'RestartPolicy': {'Name': 'no'}}} for p in self.candidates]

    def test_rollback_label_requires_both_exact_candidates_stopped_without_restart(self):
        rows = self.rows(); self.assertTrue(mod.stopped_gate(rows, self.candidates, ['a' * 64])['onlyCandidatesStopped'])
        for change in [lambda r: r[0]['State'].update(Running=True),
                       lambda r: r[1]['HostConfig']['RestartPolicy'].update(Name='always'),
                       lambda r: r[1]['State'].update(StartedAt='new-process'),
                       lambda r: r[1].update(Id='a' * 64), lambda r: r.pop()]:
            sample = copy.deepcopy(rows); change(sample)
            with self.assertRaises(Hold): mod.stopped_gate(sample, self.candidates, ['a' * 64])

    def test_candidate_drain_keeps_all_existing_http_agent_task_and_lease_gates(self):
        fixture = IncidentContinuation(); fixture.setUp()
        app = copy.deepcopy(fixture.app); app['observations']['unknownLeases'] = 0
        worker = fixture.worker
        worker['mediaWorker'] = self.runtimes()[3]['mediaWorker']; worker['commit'] = mod.COMMIT
        worker['mediaWorker']['draining'] = True
        self.assertTrue(mod.normal.current_drained(app, fixture.domain, worker, [], fixture.rows,
                        fixture.held, fixture.digest)['currentExecutableWorkDrained'])
        for key in app['observations']:
            changed = copy.deepcopy(app); changed['observations'][key] = 1
            with self.subTest(key=key), self.assertRaises(Hold):
                mod.normal.current_drained(changed, fixture.domain, worker, [], fixture.rows, fixture.held, fixture.digest)

    def test_stop_target_guard_rejects_old_slot_before_any_action(self):
        op = mod.AbortController.__new__(mod.AbortController)
        op.web = identity('a', 'old-web'); op.worker = identity('b', 'old-worker')
        op.newweb, op.newworker = self.candidates
        with self.assertRaisesRegex(Hold, 'ONLY_CANDIDATE_STOP_ALLOWED'):
            op.stop_candidate(op.web, 'web', 'e' * 64)

    def test_drain_ambiguity_retains_one_original_uuid_and_never_stops(self):
        op = mod.AbortController.__new__(mod.AbortController); op.succ = {'operations': {}}
        persisted = []; op.persist = lambda: persisted.append(copy.deepcopy(op.succ))
        calls = []
        def uncertain(operation): calls.append(operation); raise TimeoutError('fixture')
        with self.assertRaises(TimeoutError): op.op('abort-candidate-worker-drain', uncertain)
        original = copy.deepcopy(op.succ['operations']['abort-candidate-worker-drain'])
        self.assertEqual(original['phase'], 'UNKNOWN')
        with self.assertRaises(Hold): op.op('abort-candidate-worker-drain', uncertain)
        self.assertEqual(calls, [original['operationId']])
        self.assertEqual(op.succ['operations']['abort-candidate-worker-drain'], original)

    def test_unified_lifecycle_check_and_apply_are_explicitly_separate(self):
        for apply in [False, True]:
            args = ['abort47-video-family', '--config', '/private/cfg.json', '--review', '/private/review.json']
            if apply: args.append('--apply')
            with patch.object(lifecycle, 'os', SimpleNamespace(name='posix')), patch.object(mod, 'main') as command:
                self.assertEqual(lifecycle.main(args), 0)
                command.assert_called_once_with(pathlib.Path('/private/cfg.json'), pathlib.Path('/private/review.json'), apply)
        with patch.object(mod, 'main') as command:
            self.assertEqual(lifecycle.main(['status', '--state-dir', '/unused', '--apply']), 2)
            command.assert_not_called()


if __name__ == '__main__': unittest.main()
