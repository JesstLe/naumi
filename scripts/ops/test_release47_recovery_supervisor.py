import copy
import json
import pathlib
import tempfile
import unittest
import uuid

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

    def test_mount_order_is_not_configuration_change_but_path_is(self):
        row = dict(Id='id', Name='web', Image='image', Config={}, HostConfig={},
                   Mounts=[{'Destination': '/a', 'Source': '/one'}, {'Destination': '/b', 'Source': '/two'}])
        pin = static_pin(row); row['Mounts'].reverse()
        self.assertEqual(static_pin(row), pin)
        row['Mounts'][0]['Source'] = '/different'
        self.assertNotEqual(static_pin(row), pin)

    def test_low_ram_defers_without_consuming_restart_attempt(self):
        self.fake.available_kib = lambda: 100
        self.fake.rows['web']['State'].update(Running=False, ExitCode=137)
        with self.assertRaisesRegex(Hold, 'PHYSICAL_MEMORY'): self.supervisor.once()
        self.assertFalse((pathlib.Path(self.tmp.name) / 'web-restart.json').exists())
        self.assertEqual(self.fake.starts, [])

    def test_new_host_boot_restores_only_enrolled_crash_scope(self):
        self.manifest['initialHostBootId'] = 'host1'
        self.fake.host_boot_id = lambda: 'host2'
        self.manifest['web']['runningAtEnrollment'] = True
        self.fake.rows['web']['State'].update(Running=False, ExitCode=0)
        self.supervisor.once()
        self.assertEqual(self.fake.starts, ['web'])

    def test_active_healthy_tick_does_not_block_observation(self):
        self.fake.worker.update(phase='RUNNING', lastTick={'phase': 'dispatched'}, activeTicks=1)
        self.assertEqual(self.supervisor.once()['workerState']['phase'], 'RUNNING')
        self.assertEqual(self.fake.controls, [])

    def test_docker_reboot_default_dns_does_not_change_static_pin(self):
        row=dict(Id='id',Name='web',Image='image',Config={'Env':['SAMPLE=1']},HostConfig={'Dns':None},Mounts=[])
        pin=static_pin(row);row['HostConfig']['Dns']=[]
        self.assertEqual(static_pin(row),pin)
        self.assertEqual(row['HostConfig']['Dns'],[], 'pin calculation must not mutate inspect')
        row['HostConfig']['Dns']=['192.0.2.53'];self.assertNotEqual(static_pin(row),pin)
        row['HostConfig']['Dns']=[];row['Config']['Env']=['SAMPLE=2'];self.assertNotEqual(static_pin(row),pin)

    def completed_receipt_recovery(self):
        self.fake.worker.update(bootId=str(uuid.uuid4()),activeTicks=0)
        self.supervisor.once()
        tick=str(uuid.uuid4());self.fake.worker.update(paused=True,unresolvedTicks=1,phase='UNKNOWN',automaticRecoveryEligible=True,lastTick={'id':tick,'phase':'unknown'})
        original=self.fake.control;receipts={}
        def control(spec,request):
            if request['action']=='reconcile':
                if request['operationId'] in receipts:return receipts[request['operationId']]
                self.fake.controls.append((spec['id'],copy.deepcopy(request)))
                self.fake.worker.update(paused=True,unresolvedTicks=0,phase='QUIESCENT',revision=request['expectedRevision']+1)
                self.fake.worker['lastTick']['phase']='complete'
                receipts[request['operationId']]={'operationId':request['operationId']}
                return receipts[request['operationId']]
            return original(spec,request)
        self.fake.control=control
        return control,tick

    def test_original_completed_receipt_reconciles_then_resumes_same_boot(self):
        self.completed_receipt_recovery()
        result=self.supervisor.once();self.assertTrue(result['reconciledCompletedTick'])
        self.assertEqual([c[1]['action'] for c in self.fake.controls],['reconcile','resume'])
        self.assertFalse(self.fake.worker['paused']);self.supervisor.once()
        self.assertEqual(len(self.fake.controls),2)
        self.fake.worker.update(paused=True,phase='QUIESCENT',revision=self.fake.worker['revision']+1)
        with self.assertRaisesRegex(Hold,'OPERATOR_WORKER_PAUSE'):self.supervisor.once()

    def test_lost_reconcile_reply_reuses_original_uuid_then_resumes(self):
        control,_=self.completed_receipt_recovery();lost=True
        def once(spec,request):
            nonlocal lost
            result=control(spec,request)
            if request['action']=='reconcile' and lost:lost=False;raise Hold('REPLY_LOST')
            return result
        self.fake.control=once
        with self.assertRaisesRegex(Hold,'REPLY_LOST'):self.supervisor.once()
        self.supervisor.once();self.assertFalse(self.fake.worker['paused'])
        self.assertEqual([c[1]['action'] for c in self.fake.controls],['reconcile','resume'])

    def test_unverified_original_receipt_does_not_resume(self):
        self.completed_receipt_recovery()
        self.fake.control=lambda *_:(_ for _ in ()).throw(Hold('WORKER_TICK_RECONCILE_UNVERIFIED'))
        before=copy.deepcopy(self.fake.worker)
        with self.assertRaisesRegex(Hold,'UNVERIFIED'):self.supervisor.once()
        self.assertEqual(self.fake.worker,before)

    def test_manual_drain_of_unknown_tick_does_not_trigger_recovery(self):
        self.completed_receipt_recovery();self.fake.worker['automaticRecoveryEligible']=False
        with self.assertRaisesRegex(Hold,'OPERATOR_WORKER_PAUSE'):self.supervisor.once()
        self.assertEqual(self.fake.controls,[])


if __name__ == '__main__': unittest.main()
