"""Safety regressions for SaaS-specific emergency recovery. No host actions."""
import copy
import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

import release47_normal_controller as ctl
import release47_normal_rollback as old_rollback
from release47_host import Hold
from release47_saas_successor import AUTHORIZATION, SaasController, validate_config, predecessor_proof, MIB
from release47_video_family_successor import VideoFamilyController


class SaasRecovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='naumi-saas-recovery-controller-fixture-')
        self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()
    def config(self):
        return {'target': '47.105.59.142', 'authorization': AUTHORIZATION, 'releaseId': 'release47-saas-20261023',
                'recoveryMode': 'saas-controlled-maintenance', 'restoreDatabase': False,
                'replayAcceptedTasks': False, 'activateDisabledModels': False, 'webFinalMemoryMiB': 2048,
                'webMemoryMiB':1536, 'workerMemoryMiB':1024, 'reviewedCombinedMedia':True,
                'previousNormalReleaseId':'release47-video-family-prior',
                'predecessorReleaseId':'release47-video-family-prior',
                'newWorkerName':'naumi47-worker-video-family-saas-20261023',
                'combinedMedia':{'workerName':'naumi47-worker-video-family-saas-20261023',
                                 'secret':'synthetic-fixture-media-secret-'*3,
                                 'scratchSource':'/opt/naumi-staging/data/video-media-jobs'},
                'videoReferencePublicOrigin':'https://47.105.59.142',
                'evidenceRoot':'/opt/naumi-staging/evidence/saas-fixture',
                'storageAcceptanceScript':'/opt/naumi-staging/evidence/saas-fixture/tools/storage.cjs',
                'storageAcceptanceSha256':'a'*64,
                'mediaProbePath':'/data/isolated-provider-probes/provider-video-probe-20261023/fixture.mp4',
                'mediaProbeSha256':'b'*64, 'commit':'b'*40, 'image':'sha256:'+'a'*64,
                'version':'1792699999', 'imageArchiveSha256':'c'*64,
                'imageAcceptanceOperations':['11111111-1111-4111-8111-111111111111']}

    def test_exact_scope_and_no_data_or_configuration_rewind(self):
        cfg = self.config()
        validate_config(cfg)
        for key, value in [('target', '103.30.76.93'), ('authorization', '继续'),
                           ('recoveryMode', 'old-program'), ('restoreDatabase', True),
                           ('replayAcceptedTasks', True), ('activateDisabledModels', True), ('webFinalMemoryMiB', 3072),
                           ('workerMemoryMiB',128), ('webMemoryMiB',2048), ('reviewedCombinedMedia',False),
                           ('previousNormalReleaseId','different')]:
            bad = {**cfg, key: value}
            with self.subTest(key=key), self.assertRaises(Hold):
                validate_config(bad)

    def test_runtime_dependencies_are_rejected_before_host_access(self):
        cfg = self.config()
        invalid = [('newWorkerName','naumi47-worker-saas-20261023'),
                   ('combinedMedia',{**cfg['combinedMedia'],'workerName':'naumi47-worker-video-family-other'}),
                   ('combinedMedia',{**cfg['combinedMedia'],'scratchSource':'/unreviewed'}),
                   ('combinedMedia',{**cfg['combinedMedia'],'extra':True}),
                   ('videoReferencePublicOrigin','http://127.0.0.1'),
                   ('storageAcceptanceScript','/opt/naumi-staging/evidence/other/tools/storage.cjs'),
                   ('storageAcceptanceSha256','changed'), ('mediaProbePath','/data/unknown.mp4'),
                   ('mediaProbeSha256',''), ('imageAcceptanceOperations',[]),
                   ('preservedWorkerTick',{'id':'legacy'}), ('commit','branch-name')]
        for key,value in invalid:
            with self.subTest(key=key), self.assertRaises(Hold):
                validate_config({**cfg,key:value})

    def test_current_media_readiness_and_memory_gates_are_inherited(self):
        self.assertIs(SaasController.after_retirement, VideoFamilyController.after_retirement)
        self.assertIs(SaasController.reference_proof, VideoFamilyController.reference_proof)
        self.assertIs(SaasController.retirement_memory_proof, VideoFamilyController.retirement_memory_proof)
        self.assertIs(SaasController.media_worker, VideoFamilyController.media_worker)
        # SaaS's extra tenant check must run the real media/storage ready gates.
        operator = SaasController.__new__(SaasController)
        operator.newweb = {'id':'candidate'}
        operator.request = Mock(return_value={'items':[]})
        operator.tx = Mock()
        with patch.object(VideoFamilyController, 'ready', return_value={'combinedMediaChecked':True}) as ready:
            self.assertTrue(operator.ready()['combinedMediaChecked'])
            ready.assert_called_once()

    def test_exact_two_gib_current_predecessor_and_retirement_are_required(self):
        cfg = {**self.config(), 'oldWeb':{'id':'web','name':'old-web','image':'same'},
               'oldWorker':{'id':'worker','name':'old-worker','image':'same'}}
        prior = {'phase':'COMPLETE','retired':['older-web','older-worker'],
                 'web':cfg['oldWeb'],'worker':cfg['oldWorker']}
        state = {'activeNormalBlueGreenReleaseId':cfg['predecessorReleaseId'],
                 'normalBlueGreenReleases':{cfg['predecessorReleaseId']:prior},
                 'runtimeRecovery':{'phase':'ACKNOWLEDGED','successorReleaseId':cfg['predecessorReleaseId']}}
        tx = Mock()
        tx.inspect.return_value = {'State':{'Running':False},'HostConfig':{'RestartPolicy':{'Name':'no'}}}
        rows = {key:{'State':{'Running':True},'HostConfig':{'Memory':memory*MIB}}
                for key,memory in [('web',2048),('worker',1024)]}
        tx.pin.side_effect = lambda identity: rows[identity['id']]
        self.assertEqual(predecessor_proof(tx,state,cfg)['priorWebMemoryMiB'],2048)
        for key, memory in [('web',3072),('worker',128)]:
            before = rows[key]['HostConfig']['Memory']
            rows[key]['HostConfig']['Memory'] = memory*MIB
            with self.subTest(key=key), self.assertRaisesRegex(Hold,'PREDECESSOR_MEMORY_CHANGED'):
                predecessor_proof(tx,state,cfg)
            rows[key]['HostConfig']['Memory'] = before
        tx.inspect.return_value['State']['Running'] = True
        with self.assertRaisesRegex(Hold,'PRIOR_SLOT_NOT_RETIRED'):
            predecessor_proof(tx,state,cfg)

    def test_previous_program_entry_refuses_before_any_host_access(self):
        with self.assertRaisesRegex(Hold, 'SAAS_REQUIRES_CONTROLLED_RECOVERY'):
            old_rollback.run(self.config(), apply=True)
        with self.assertRaisesRegex(Hold, 'SAAS_RECOVERY_CONTROLLER'):
            ctl.Controller(Mock(), self.config())
        operator = ctl.Controller.__new__(ctl.Controller)
        operator.cfg = self.config()
        with self.assertRaisesRegex(Hold, 'SAAS_RECOVERY_CONTROLLER'):
            operator.recover_failure(RuntimeError())
        with self.assertRaisesRegex(Hold, 'SAAS_RECOVERY_CONTROLLER'):
            operator.verify_recovery_materials()

    def operator(self, current_dump):
        operator = SaasController.__new__(SaasController)
        operator.cfg = {**self.config(), 'expectedGatewayDigest': ctl.sha(b'baseline')}
        operator.tx = Mock()
        operator.tx.folder = self.root
        operator.tx.run.return_value = current_dump
        operator.succ = {'phase': 'SWITCHED', 'operations': {'gateway-switch': {'phase': 'UNKNOWN'}}}
        operator.persist = Mock()
        operator.phase = Mock(side_effect=lambda phase, **fields: operator.succ.update(phase=phase, **fields))
        operator.emergency = {'beforeDumpSha256': ctl.sha(b'candidate')}
        operator.emergency_after = {'fixture.conf': b'maintenance'}
        operator.candidate_closure = {'fixture.conf': b'candidate'}
        operator.real = {'fixture.conf': 'fixture.conf'}
        operator.switched = False  # The forward HTTP/command could time out.
        operator.worker_control = Mock(side_effect=AssertionError('Worker state must not change'))

        def operation(name, fn):
            result = fn('new-recovery-operation')
            operator.succ['operations'][name] = {'phase': 'ACKNOWLEDGED'}
            return result
        operator.op = Mock(side_effect=operation)
        return operator

    def test_switch_timeout_uses_physical_cas_without_clearing_unknown(self):
        operator = self.operator(b'candidate')
        with patch.object(ctl.c, 'switch_gateway_bundle', return_value={'applied': True}) as switch:
            operator.recover_failure(RuntimeError('synthetic forward timeout'))
        self.assertEqual(switch.call_count, 1)
        self.assertEqual(operator.succ['phase'], 'RECOVERY_REQUIRED')
        self.assertEqual(operator.succ['operations']['gateway-switch']['phase'], 'UNKNOWN')
        operator.worker_control.assert_not_called()
        receipt = operator.tx.save.call_args.args[1]
        self.assertTrue(receipt['maintenanceApplied'])
        self.assertFalse(receipt['priorProgramResumed'])
        self.assertFalse(receipt['tasksReplayed'])

    def test_before_switch_baseline_stays_serving_without_restart(self):
        operator = self.operator(b'baseline')
        with patch.object(ctl.c, 'switch_gateway_bundle') as switch:
            operator.recover_failure(Hold('CANDIDATE_NOT_READY'))
        switch.assert_not_called()
        operator.worker_control.assert_not_called()
        self.assertTrue(operator.tx.save.call_args.args[1]['baselinePublicEntryPreserved'])
        self.assertFalse(operator.tx.save.call_args.args[1]['maintenanceApplied'])

    def test_unrecognized_physical_gateway_is_not_overwritten(self):
        operator = self.operator(b'unknown gateway')
        original = copy.deepcopy(operator.succ['operations'])
        with patch.object(ctl.c, 'switch_gateway_bundle') as switch:
            operator.recover_failure(RuntimeError())
        switch.assert_not_called()
        self.assertEqual(operator.succ['operations'], original)
        self.assertTrue(operator.tx.save.call_args.args[1]['reconciliationRequired'])

    def test_uncertain_emergency_mutation_is_not_reported_successful(self):
        operator = self.operator(b'candidate')
        with patch.object(ctl.c, 'switch_gateway_bundle', side_effect=TimeoutError()):
            operator.recover_failure(RuntimeError())
        receipt = operator.tx.save.call_args.args[1]
        self.assertFalse(receipt['maintenanceApplied'])
        self.assertTrue(receipt['reconciliationRequired'])
        self.assertEqual(operator.succ['operations']['gateway-switch']['phase'], 'UNKNOWN')

    def authority_operator(self):
        operator = self.operator(b'candidate')
        operator.cfg.update(image='sha256:'+'a'*64, commit='b'*40)
        operator.newweb, operator.newworker = {'id':'web','name':'naumi47-fixture-web'}, {'id':'worker'}
        def row(role):
            origin = 'INTERNAL_APP_ORIGIN=http://127.0.0.1:3000' if role=='web' else 'NAUMI_APP_ORIGIN=http://naumi47-fixture-web:3000'
            return {'Image':operator.cfg['image'],'Config':{'Env':['SOURCE_COMMIT='+operator.cfg['commit'],origin]}}
        operator.tx.inspect.side_effect = lambda identity: row(identity)
        operator.tx.run.return_value = json.dumps({'sourceCommit':operator.cfg['commit'], 'mutation':False,
                                                   'unauthorizedHttp':403, 'authorizedHttp':200}).encode()
        return operator

    def test_internal_authority_binds_same_image_and_rejects_bad_proof(self):
        operator = self.authority_operator()
        operator.verify_internal_authority()
        self.assertEqual(operator.tx.save.call_args.args[0], 'SAAS_INTERNAL_WORKER_AUTHORITY.json')
        operator.tx.run.return_value = json.dumps({'sourceCommit':operator.cfg['commit'], 'mutation':False,
                                                   'unauthorizedHttp':200, 'authorizedHttp':200}).encode()
        with self.assertRaisesRegex(Hold, 'WORKER_AUTHORITY_PROOF'):
            operator.verify_internal_authority()

    def test_old_internal_origin_rejected_before_status_request(self):
        operator = self.authority_operator()
        worker = operator.tx.inspect('worker')
        worker['Config']['Env'] = ['SOURCE_COMMIT='+operator.cfg['commit'], 'NAUMI_APP_ORIGIN=http://old-web:3000']
        web = operator.tx.inspect('web')
        operator.tx.inspect.side_effect = lambda identity: web if identity=='web' else worker
        with self.assertRaisesRegex(Hold, 'EXECUTION_GRAPH'):
            operator.verify_internal_authority()
        operator.tx.run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
