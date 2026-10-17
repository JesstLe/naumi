import copy
import json
import pathlib
import tempfile
import unittest

from release47_host import Hold
from release47_recovery_supervisor import Supervisor, recovery_binding, encoded, sha, static_pin


class Fake:
    def __init__(self):
        self.rows = {k: {'Id': k, 'Name': '/' + k, 'Image': 'image', 'HostConfig': {'RestartPolicy': {'Name': 'no'}},
                         'State': {'Running': True, 'StartedAt': 'boot1', 'ExitCode': 0, 'OOMKilled': False}}
                     for k in ['web', 'worker']}
        self.app = {'identity': {'bootId': 'webboot1', 'instanceId': 'web', 'commit': 'commit'},
                    'transport': {'verified': True}, 'admission': {'mode': 'open', 'revision': 1}}
        self.worker = {'bootId': 'workerboot1', 'instanceId': 'worker', 'commit': 'commit',
                       'targetInstanceId': 'web', 'origin': 'http://web:3000', 'phase': 'IDLE',
                       'unresolvedTicks': 0, 'lastTick': None, 'paused': False, 'revision': 1}
        self.starts = []; self.controls = []; self.ready = True

    def inspect(self, spec): return copy.deepcopy(self.rows[spec['id']])
    def status(self, spec): return copy.deepcopy(self.app if spec['role'] == 'web' else self.worker)
    def readiness(self, spec):
        if not self.ready: raise Hold('DB_DOWN')
        return {'db': True, 'login': True}

    def start(self, spec):
        self.starts.append(spec['id']); row = self.rows[spec['id']]
        row['State'].update(Running=True, StartedAt='boot2', ExitCode=0, OOMKilled=False)
        if spec['role'] == 'web':
            self.app['identity']['bootId'] = 'webboot2'; self.app['admission'].update(mode='draining', revision=0)
        else:
            self.worker.update(bootId='workerboot2', paused=True, phase='QUIESCENT')

    def control(self, spec, request):
        self.controls.append((spec['id'], copy.deepcopy(request)))
        if spec['role'] == 'web': self.app['admission'].update(mode='open', revision=request['expectedRevision'] + 1)
        else: self.worker.update(paused=False, phase='IDLE', revision=request['expectedRevision'] + 1)
        return {'operationId': request['operationId']}


class Recovery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.fake = Fake()
        self.manifest = {'commit': 'commit', 'web': {'role': 'web', 'id': 'web', 'name': 'web'},
                         'worker': {'role': 'worker', 'id': 'worker', 'name': 'worker'}}
        self.supervisor = Supervisor(self.manifest, self.tmp.name, self.fake)

    def test_healthy_no_mutation(self):
        self.supervisor.once(); self.supervisor.once()
        self.assertEqual(self.fake.starts, []); self.assertEqual(self.fake.controls, [])

    def test_web_oom_starts_same_id_and_checks_before_open(self):
        self.fake.rows['web']['State'].update(Running=False, ExitCode=137, OOMKilled=True)
        self.supervisor.once(); self.supervisor.once()
        self.assertEqual(self.fake.starts, ['web']); self.assertEqual(len(self.fake.controls), 1)
        self.assertEqual(self.fake.controls[0][1]['bootId'], 'webboot2')

    def test_database_failure_never_opens_or_resumes(self):
        self.fake.ready = False; self.fake.app['admission']['mode'] = 'draining'
        with self.assertRaisesRegex(Hold, 'DB_DOWN'): self.supervisor.once()
        self.assertEqual(self.fake.controls, [])

    def test_unknown_paid_tick_never_cleared(self):
        self.fake.worker.update(phase='UNKNOWN', unresolvedTicks=1, paused=True,
                                lastTick={'id': 'original', 'phase': 'unknown'})
        before = copy.deepcopy(self.fake.worker)
        with self.assertRaisesRegex(Hold, 'UNRESOLVED'): self.supervisor.once()
        self.assertEqual(self.fake.worker, before); self.assertEqual(self.fake.controls, [])

    def test_clean_stop_not_undone(self):
        self.fake.rows['web']['State'].update(Running=False, ExitCode=0)
        with self.assertRaisesRegex(Hold, 'INTENTIONAL_STOP'): self.supervisor.once()
        self.assertEqual(self.fake.starts, [])

    def test_deliberate_web_drain_not_undone(self):
        self.supervisor.once(); self.fake.app['admission']['mode'] = 'draining'
        with self.assertRaisesRegex(Hold, 'OPERATOR_DRAIN'): self.supervisor.once()
        self.assertEqual(self.fake.controls, [])

    def test_deliberate_worker_pause_not_undone(self):
        self.supervisor.once(); self.fake.worker.update(paused=True, phase='QUIESCENT')
        with self.assertRaisesRegex(Hold, 'OPERATOR_WORKER_PAUSE'): self.supervisor.once()
        self.assertEqual(self.fake.controls, [])

    def test_worker_crash_starts_then_resumes_new_boot(self):
        self.fake.rows['worker']['State'].update(Running=False, ExitCode=137)
        self.supervisor.once()
        self.assertEqual(self.fake.starts, ['worker']); self.assertEqual(self.fake.controls[0][0], 'worker')

    def test_worker_restart_with_unknown_remains_paused(self):
        self.fake.rows['worker']['State'].update(Running=False, ExitCode=137)
        self.fake.worker.update(phase='UNKNOWN', unresolvedTicks=1, paused=True)
        with self.assertRaisesRegex(Hold, 'UNRESOLVED'): self.supervisor.once()
        self.assertEqual(self.fake.starts, ['worker']); self.assertEqual(self.fake.controls, [])

    def test_failed_boot_restart_budget(self):
        self.fake.rows['web']['State'].update(Running=False, ExitCode=137)
        self.supervisor.once()
        self.fake.rows['web']['State'].update(Running=False, ExitCode=137)
        with self.assertRaisesRegex(Hold, 'BUDGET_EXHAUSTED'): self.supervisor.once()
        self.assertEqual(len(self.fake.starts), 1)

    def test_ambiguous_control_reuses_uuid(self):
        self.fake.app['admission']['mode'] = 'draining'
        original = self.fake.control
        def lost(spec, request):
            self.fake.controls.append((spec['id'], copy.deepcopy(request))); raise Hold('HTTP_LOST')
        self.fake.control = lost
        with self.assertRaisesRegex(Hold, 'HTTP_LOST'): self.supervisor.once()
        operation = self.fake.controls[0][1]['operationId']
        self.fake.control = original; self.supervisor.once()
        self.assertEqual(operation, self.fake.controls[1][1]['operationId'])

    def test_target_drift_does_not_resume(self):
        self.fake.worker.update(paused=True, targetInstanceId='somewhere-else')
        with self.assertRaisesRegex(Hold, 'TARGET_MISMATCH'): self.supervisor.once()
        self.assertEqual(self.fake.controls, [])

    def test_manifest_binding_keeps_pending_phase(self):
        m = {'releaseId': 'r', 'originalPlanSha256': 'p', 'operationId': 'op'}
        s = {'target': '47.105.59.142', 'releaseId': 'r', 'phase': 'MIGRATED_CLEANUP_PENDING',
             'planSha256': 'p', 'operations': {}, 'runtimeRecovery': {'operationId': 'op',
             'manifestSha256': sha(encoded(m)), 'phase': 'ACKNOWLEDGED'}}
        recovery_binding(s, m); s['runtimeRecovery']['phase'] = 'UNKNOWN'
        with self.assertRaisesRegex(Hold, 'NOT_ACKNOWLEDGED'): recovery_binding(s, m)


if __name__ == '__main__': unittest.main()
