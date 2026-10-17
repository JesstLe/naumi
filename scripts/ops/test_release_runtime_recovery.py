import copy
import json
import os
import pathlib
import tempfile
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import release_runtime_recovery as r
import release_maintenance_session as session
from release47_host import Hold, public_identity
from test_release_video_media import video_plan
from test_release_maintenance_session import FixtureAdapter


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.plan = video_plan()
        self.plan['webs'][0]['stateDir'] = str(self.root / 'web')
        self.plan['worker']['stateDir'] = str(self.root / 'worker')
        for web in self.plan['webs']:
            p = pathlib.Path(web['stateDir']); p.mkdir(mode=0o700)
            os.chown(p,1001,1001)
            r.install_launcher(p, release_id=self.plan['releaseId'], commit=self.plan['commit'],
                               version=self.plan['buildVersion'], instance=web['name'])
        pathlib.Path(self.plan['worker']['stateDir']).mkdir(mode=0o700)
        os.chown(self.plan['worker']['stateDir'],1001,1001)
        self.rows = {}
        for index, role in enumerate(('web', 'worker', 'media'), 1):
            name = self.plan['webs'][0]['name'] if role == 'web' else self.plan['worker']['name'] if role == 'worker' else self.plan['mediaWorker']['name']
            env = {'SOURCE_COMMIT': self.plan['commit'], 'BUILD_VERSION': self.plan['buildVersion'], 'NAUMI_INSTANCE_ID': name}
            if role == 'web': env.update(NAUMI_VIDEO_WORKER='0', RELEASE_CONTROL_SECRET=self.plan['releaseSecret'])
            if role == 'worker': env.update(NAUMI_WORKER_STATE_FILE='/release-state/worker.json', NAUMI_APP_ORIGIN='http://' + self.plan['webs'][0]['name'] + ':3000')
            directory = self.plan['webs'][0]['stateDir'] if role == 'web' else self.plan['worker']['stateDir']
            row = {'Id': str(index)*64, 'Name': '/'+name, 'Image': self.plan['webs'][0]['image'],
                'State': {'Running': True, 'StartedAt': 'fixture-boot', 'Paused': False, 'Restarting': False},
                'HostConfig': {'RestartPolicy': dict(r.NO_RESTART)},
                'Config': {'Env': [k+'='+v for k,v in env.items()], 'Cmd': ['node','server.js'] if role == 'web' else ['node','scripts/video-worker.mjs'],
                           'Entrypoint': ['/release-state/launch.sh'] if role == 'web' else ['node']},
                'Mounts': [{'Type':'bind','Source':directory,'Destination':'/release-state','RW':True}]}
            self.rows[role] = row
        caller = {'paused':False,'uncertain':False,'identity':{'instanceId':self.plan['worker']['name'],
                  'commit':self.plan['commit'],'targetInstanceId':self.plan['webs'][0]['name']}}
        caller_file=pathlib.Path(self.plan['worker']['stateDir'])/'worker.json'
        caller_file.write_text(json.dumps(caller));caller_file.chmod(0o600);os.chown(caller_file,1001,1001)
        self.state = {'webs': {'main': {'running':public_identity(self.rows['web']), 'verified':{'identity':public_identity(self.rows['web'])}}},
                      'worker': {'running':public_identity(self.rows['worker'])}}
        self.state.update(phase='ACTIVE',activation={'workerResumed':True},openGateway={'fixture':True})
        self.commands = []; self.fail_after = None
        def inspect(identifier):
            return copy.deepcopy(next(row for row in self.rows.values() if row['Id'] == identifier))
        def run(command):
            self.commands.append(command)
            row = next(row for row in self.rows.values() if row['Id'] == command[-1])
            row['HostConfig']['RestartPolicy'] = dict(r.POLICY if command[2] == '--restart=unless-stopped' else r.NO_RESTART)
            if self.fail_after == row['Id']:
                self.fail_after = None
                raise OSError('lost fixture reply')
            return b''
        self.tx = SimpleNamespace(target='103.30.76.93', stack=True, lock_fds=[0], folder=self.root, inspect=inspect, run=run)
        marker = self.root/'media-intent.json'; marker.write_text('{}')
        self.media = patch('release_video_media.MediaLifecycle', return_value=SimpleNamespace(intent=marker, owned=lambda:self.rows['media']))
        self.media.start()

    def tearDown(self):
        self.media.stop(); self.tmp.cleanup()

    def apply(self, enabled, operation=None):
        return r.set_runtime_policy(self.tx,self.plan,self.state,operation or str(uuid.uuid4()),enabled=enabled,
                                    before_update=(lambda _identities:None) if enabled else None)

    def test_finalization_and_disarm_keep_instances_and_state(self):
        before = {role:row['Id'] for role,row in self.rows.items()}
        result = self.apply(True); r.update_identities(self.state,result)
        self.assertEqual(r.verify_runtime_policy(self.tx,self.plan,self.state)['roles'],3)
        self.assertTrue(all(row['HostConfig']['RestartPolicy'] == r.POLICY for row in self.rows.values()))
        result = self.apply(False); r.update_identities(self.state,result)
        self.assertTrue(all(row['HostConfig']['RestartPolicy'] == r.NO_RESTART for row in self.rows.values()))
        self.assertEqual(before,{role:row['Id'] for role,row in self.rows.items()})
        marker = pathlib.Path(self.plan['webs'][0]['stateDir'])/'activation.json'
        self.assertEqual(json.loads(marker.read_bytes()),r.activation_marker(self.plan,self.plan['webs'][0],False))
        self.assertTrue(all(command[:2] == ['docker','update'] for command in self.commands))

    def test_lost_policy_response_recovers_same_operation_without_repeat(self):
        operation = str(uuid.uuid4()); self.fail_after = self.rows['web']['Id']
        with self.assertRaises(OSError):self.apply(True,operation)
        self.assertEqual(self.rows['web']['HostConfig']['RestartPolicy'],r.POLICY)
        result = self.apply(True,operation); r.update_identities(self.state,result)
        self.assertEqual(len([c for c in self.commands if c[-1] == self.rows['web']['Id']]),1)
        self.assertEqual(r.verify_runtime_policy(self.tx,self.plan,self.state)['roles'],3)

    def test_boot_drift_or_unknown_caller_prevents_writes(self):
        self.rows['web']['State']['StartedAt'] = 'another-boot'
        with self.assertRaisesRegex(Hold,'IDENTITY'):self.apply(True)
        self.assertFalse(self.commands)
        self.rows['web']['State']['StartedAt'] = 'fixture-boot'
        path = pathlib.Path(self.plan['worker']['stateDir'])/'worker.json'
        value=json.loads(path.read_text());value['uncertain']=True;path.write_text(json.dumps(value))
        with self.assertRaisesRegex(Hold,'DURABLE_CALLER'):self.apply(True)
        self.assertFalse(self.commands)

    def test_marker_and_operation_cas_cannot_be_rebound(self):
        operation=str(uuid.uuid4());result=self.apply(True,operation);r.update_identities(self.state,result)
        with self.assertRaisesRegex(Hold,'OPERATION_CHANGED'):self.apply(False,operation)
        path=pathlib.Path(self.plan['webs'][0]['stateDir'])/'activation.json';value=json.loads(path.read_text());value['signature']='0'*64;path.write_text(json.dumps(value))
        with self.assertRaisesRegex(Hold,'ACTIVATION_MARKER'):self.apply(False)

    def test_verification_never_recreates_missing_startup_files(self):
        file=pathlib.Path(self.plan['webs'][0]['stateDir'])/'launch.sh';file.unlink()
        with self.assertRaisesRegex(Hold,'LAUNCHER_CHANGED'):self.apply(True)
        self.assertFalse(file.exists());self.assertFalse(self.commands)

    def test_interrupted_marker_keeps_previous_bytes_and_publishes_reader_owner(self):
        file=pathlib.Path(self.plan['webs'][0]['stateDir'])/'activation.json'
        original=r.activation_marker(self.plan,self.plan['webs'][0],False);r.write_activation(file,original)
        with patch.object(r.os,'replace',side_effect=OSError('fixture interruption')):
            with self.assertRaises(OSError):r.write_activation(file,r.activation_marker(self.plan,self.plan['webs'][0],True))
        self.assertEqual(json.loads(file.read_bytes()),original)
        self.assertEqual(file.stat().st_uid,1001);self.assertFalse(file.stat().st_mode & 0o077)
        self.assertFalse(list(file.parent.glob('.activation-*')))


    def test_startup_modes_and_owner_are_required_without_repairs(self):
        folder=pathlib.Path(self.plan['webs'][0]['stateDir']);file=folder/'launch.sh'
        for mode,owner in [(0o400,1001),(0o500,0),(0o600,0)]:
            file.chmod(mode);os.chown(file,owner,owner)
            with self.assertRaisesRegex(Hold,'LAUNCHER_CHANGED'):self.apply(True)
            self.assertEqual(file.stat().st_uid,owner);self.assertEqual(file.stat().st_mode & 0o777,mode)
        file.chmod(0o500);os.chown(file,1001,1001)
        result=self.apply(True);r.update_identities(self.state,result)
        marker=folder/'activation.json';os.chown(marker,0,0)
        with self.assertRaisesRegex(Hold,'ACCESS_CHANGED'):r.verify_runtime_policy(self.tx,self.plan,self.state)

    def test_real_session_adapter_reloads_and_reconciles_lost_policy_reply(self):
        current=session.MaintenanceSession(self.tx,self.plan,adapter=FixtureAdapter(),state_root=self.root/'session')
        current.state.update(copy.deepcopy(self.state));current.persist()
        adapter=session.LiveAdapter(self.tx,self.plan)
        def activation(state,_operation):
            expected=state['webs']['main']['running'];actual=public_identity(self.tx.inspect(expected['id']))
            if actual!=expected:raise Hold('FIXTURE_STALE_STRICT_PIN')
        adapter.assert_activation=activation
        adapter.worker_control=lambda *_args:{'state':{'paused':False,'phase':'IDLE','unresolvedTicks':0}}
        current.adapter=adapter;operation=str(uuid.uuid4());request={'action':'runtime-finalize','operationId':operation,'expectedRevision':current.state['revision']}
        self.fail_after=self.rows['web']['Id']
        with self.assertRaises(Hold):current.step(request)
        self.assertEqual(current.state['operations'][operation]['phase'],'UNKNOWN')
        recovered=session.MaintenanceSession(self.tx,self.plan,adapter=adapter,state_root=self.root/'session')
        recovered.step({**request,'reconcile':True})
        self.assertEqual(recovered.state['operations'][operation]['phase'],'ACKNOWLEDGED')
        self.assertEqual(recovered.state['webs']['main']['running']['restartPolicy'],'unless-stopped')
        self.assertEqual(len([c for c in self.commands if c[-1]==self.rows['web']['Id']]),1)


class SessionRecoveryTests(unittest.TestCase):
    def active(self, root):
        class Adapter(FixtureAdapter):
            def runtime_policy(self,state,operation,*,enabled):
                self.record('runtime-enable' if enabled else 'runtime-disable')
                return {'enabled':enabled,'identities':{}}
            def verify_runtime_policy(self,state):
                self.record('runtime-verify');return {'verified':True}
            def rollback_media(self):return {'retained':True}
            def rollback_boundary(self,state,operation):
                self.record('rollback-boundary');return {'fixtureOnly':True}
            def rollback_business_proof(self,state,operation):
                self.record('rollback-business-proof');return {'fixtureOnly':True}
        adapter=Adapter();spec=video_plan();tx=SimpleNamespace(stack=True,folder=root)
        current=session.MaintenanceSession(tx,spec,adapter=adapter,state_root=root/'state')
        def step(action,**fields):
            return current.step({'action':action,'operationId':str(uuid.uuid4()),'expectedRevision':current.state['revision'],**fields})
        for action in ['baseline','backup','maintenance','freeze']:step(action)
        for action in ['web-create','web-start','web-verify']:step(action,variant='main')
        for action in ['worker-create','worker-start','acceptance','preservation','activate']:step(action)
        return current,adapter,step

    def test_finish_requires_runtime_finalization(self):
        with tempfile.TemporaryDirectory() as directory:
            current,adapter,step=self.active(pathlib.Path(directory))
            with self.assertRaisesRegex(Hold,'RUNTIME_FINALIZATION_REQUIRED'):step('finish')
            self.assertEqual(current.state['phase'],'ACTIVE')
            self.assertNotIn('runtime-verify',adapter.calls)

    def test_preopen_boundary_is_saved_once_before_app_resume(self):
        with tempfile.TemporaryDirectory() as directory:
            current,adapter,step=self.active(pathlib.Path(directory))
            self.assertLess(adapter.calls.index('rollback-boundary'),adapter.calls.index('app-resume'))
            self.assertEqual(adapter.calls.count('rollback-boundary'),1)
            self.assertEqual(current.state['rollbackBoundary'],{'fixtureOnly':True})

    def test_missing_preopen_boundary_is_never_rebased_after_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            current,adapter,step=self.active(pathlib.Path(directory))
            del current.state['rollbackBoundary'];current.state['phase']='PRESERVED';current.persist()
            with self.assertRaisesRegex(Hold,'ORIGINAL_PREOPEN_BOUNDARY_MISSING'):step('activate')
            self.assertEqual(adapter.calls.count('rollback-boundary'),1)

    def test_finalize_then_finish_checks_actual_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            current,adapter,step=self.active(pathlib.Path(directory))
            step('runtime-finalize');step('finish')
            self.assertTrue(current.state['runtimeRecovery']['enabled'])
            self.assertIn('runtime-enable',adapter.calls);self.assertIn('runtime-verify',adapter.calls)
            self.assertEqual(current.state['phase'],'MIGRATED_CLEANUP_PENDING')

    def test_live_rollback_disarms_before_draining_and_holds_unproven_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            current,adapter,step=self.active(pathlib.Path(directory));step('runtime-finalize');start=len(adapter.calls)
            with self.assertRaisesRegex(Hold,'POST_ACTIVATION_ACCEPTED_WORK_AUDIT_REQUIRED'):step('rollback')
            calls=adapter.calls[start:]
            self.assertLess(calls.index('runtime-disable'),calls.index('worker-drain'))
            self.assertLess(calls.index('worker-drain'),calls.index('app-drain'))
            self.assertLess(calls.index('app-drain'),calls.index('rollback-business-proof'))
            self.assertNotIn('gateway-rollback-open',calls);self.assertNotIn('restore-caller',calls)
            self.assertTrue(current.state['rollbackRuntimeDisarmed'])


if __name__ == '__main__':unittest.main()
