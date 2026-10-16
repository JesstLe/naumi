import contextlib
import copy
import datetime as dt
import http.server
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import release_maintenance_session as m


NOW = dt.datetime(2026, 10, 16, 11, 0, tzinfo=dt.timezone.utc)


def identity(number, running=True, name='fixture'):
    return {'id': str(number) * 64, 'name': name, 'image': 'sha256:' + 'a' * 64,
            'running': running, 'startedAt': 'fixture-start', 'restartPolicy': 'no'}


def plan(target='47.105.59.142'):
    variants = ['main'] if target.startswith('47.') else ['main', 'desktop', 'enterprise']
    webs = [{'variant': v, 'name': 'candidate-' + v, 'port': 13080 + n, 'image': 'sha256:' + 'a' * 64,
             'source': identity(n + 1), 'memoryMiB': 1024, 'cpu': 1, 'stateDir': '/private/' + v,
             'assetPrefix': {'main': '', 'desktop': '/desktop', 'enterprise': '/enterprise'}[v],
             'budget': {'webPeakMiB': 1024, 'workerPeakMiB': 128, 'hostReserveMiB': 1024},
             'requiredChecks': ['login', 'canvas', 'private-media', 'old-client']} for n, v in enumerate(variants)]
    return {'schemaVersion': 1, 'releaseId': 'fixture-release', 'target': target, 'hostIdentitySha256': 'b' * 64,
            'commit': 'c' * 40, 'buildVersion': '1792148400', 'authorization': {'mode': 'one-time-maintenance',
                'target': target, 'date': '2026-10-16', 'userAcknowledgement': m.maintenance.ACK,
                'restoreDatabase': False, 'replayAcceptedTasks': False}, 'restoreDatabase': False, 'replayAcceptedTasks': False,
            'releaseSecret': 'secret-not-printed-' * 3, 'database': identity(9), 'baseline': [identity(1)],
            'legacyCaller': {'identity': identity(2), 'scriptSha256': 'd' * 64}, 'webs': webs,
            'worker': {'name': 'candidate-worker', 'memoryMiB': 128, 'cpu': 0.25, 'stateDir': '/private/worker'},
            'acceptance': {'path': 'acceptance.json', 'sha256': 'e' * 64},
            'predecessor47': {'path': '47-receipt.json', 'sha256': 'f' * 64}}


def snapshot():
    private = {'kind': 'task-preservation-private-v1', 'databaseIdentitySha256': 'f' * 64,
               'tables': {name: {'status': 'observed', 'selectedCount': 0, 'activeCount': 0, 'rows': [], 'allSummary': None}
                          for name in m.tasks.KEYS}}
    return {'private': private, 'public': m.tasks.summarize(private)}


class FixtureAdapter:
    def __init__(self):
        self.calls, self.worker_mode, self.fail, self.lost = [], True, None, None
    def record(self, action):
        self.calls.append(action)
        if self.fail == action: raise m.Hold('FIXTURE_UNKNOWN')
    def inventory(self, operation): self.record('inventory'); return {'fixture': True}
    def snapshot(self, operation, previous=None): self.record('snapshot'); return snapshot()
    def backup(self, operation, reconcile=False): self.record('backup'); return {'readable': True}
    def gateway(self, kind, operation, reconcile=False): self.record('gateway-' + kind); return {'kind': kind}
    def freeze(self, operation, reconcile=False): self.record('freeze'); return {'frozen': True, 'acceptedTasks': None}
    def web_create(self, web, operation, reconcile=False): self.record('create-' + web['variant']); return identity(3, False, web['name'])
    def web_start(self, web, ident, operation, reconcile=False):
        self.record('start-' + web['variant']); return {**ident, 'running': True}
    def verify(self, web, ident, operation):
        self.record('verify-' + web['variant'])
        return {'identity': ident, 'app': {'admission': {'mode': 'draining'}, 'identity': {'bootId': 'boot'}}, 'observedAt': m.timestamp()}
    def worker_create(self, web, operation, reconcile=False): self.record('worker-create'); return identity(4, False, 'worker')
    def worker_start(self, ident, operation, reconcile=False): self.record('worker-start'); return {**ident, 'running': True}
    def worker_control(self, ident, web, action, operation):
        self.record('worker-' + action)
        if action != 'status': self.worker_mode = action != 'resume'
        if self.lost == action:
            self.lost = None; raise m.Hold('FIXTURE_LOST_RESPONSE')
        return {'state': {'paused': self.worker_mode, 'phase': 'QUIESCENT' if self.worker_mode else 'IDLE',
                          'activeTicks': 0, 'unresolvedTicks': 0}}
    def acceptance(self, state, descriptor, operation): self.record('acceptance'); return {'fixtureBound': True}
    def capture_acceptance(self, state, descriptor, operation): self.record('capture'); return descriptor
    def app_control(self, ident, action, operation): self.record('app-' + action); return {'action': action}
    def restore_caller(self, operation): self.record('restore-caller'); return {'restored': True}
    def assert_activation(self, state, operation): self.record('assert-activation'); return {'verified': True}
    def retire(self, ident, descriptor, operation): self.record('retire'); return {**ident, 'running': False}


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.folder = pathlib.Path(self.tmp.name)
        self.tx = SimpleNamespace(stack=True, folder=self.folder)
        self.adapter = FixtureAdapter()
        self.clock = patch.object(m.maintenance.dt, 'datetime', wraps=dt.datetime)
        self.mockclock = self.clock.start(); self.mockclock.now.return_value = NOW
        self.session = self.make()
    def tearDown(self): self.clock.stop(); self.tmp.cleanup()
    def make(self, spec=None, adapter=None):
        return m.MaintenanceSession(self.tx, spec or plan(), adapter=adapter or self.adapter, state_root=self.folder/'state', now=NOW)
    def step(self, action, **fields):
        request = {'action': action, 'operationId': str(uuid.uuid4()), 'expectedRevision': self.session.state['revision'], **fields}
        result = self.session.step(request)
        return request, result
    def to_candidates(self):
        for action in ['baseline', 'backup', 'maintenance', 'freeze']: self.step(action)
        for web in self.session.plan['webs']:
            for action in ['web-create', 'web-start', 'web-verify']: self.step(action, variant=web['variant'])
        for action in ['worker-create', 'worker-start']: self.step(action)
    def to_active(self):
        self.to_candidates()
        for action in ['acceptance', 'preservation', 'activate']: self.step(action)

    def test_complete_migration_flow_stays_cleanup_pending_with_legacy_unknown(self):
        self.to_active(); self.step('finish')
        state = self.session.state
        self.assertEqual(state['phase'], 'MIGRATED_CLEANUP_PENDING')
        self.assertTrue(state['preservation']['taskDataPreserved']); self.assertTrue(state['activation']['workerResumed'])
        self.assertIsNone(state['acceptedTasks']); self.assertFalse(state['legacyDrainProven'])
        self.assertLess(self.adapter.calls.index('gateway-open'), self.adapter.calls.index('worker-resume'))
        self.assertLess(self.adapter.calls.index('backup'), self.adapter.calls.index('gateway-maintenance'))
        self.assertNotIn('retire', self.adapter.calls)
        self.assertEqual(m.load_json(self.session.path), state)

    def test_finish_can_complete_only_after_explicit_retirement_receipt(self):
        spec = plan(); spec['retirements'] = {'old-web': {'identity': identity(1), 'receipt': {}}}
        self.session = self.make_new(spec)
        self.to_active(); self.step('retire', variant='old-web'); self.step('finish')
        self.assertEqual(self.session.state['phase'], 'COMPLETE')

    def make_new(self, spec):
        return m.MaintenanceSession(self.tx, spec, adapter=self.adapter, state_root=self.folder/'new-state', now=NOW)

    def test_second_release_is_blocked_by_canonical_state(self):
        self.step('baseline'); spec = plan(); spec['releaseId'] = 'second'
        with self.assertRaisesRegex(m.Hold, 'UNFINISHED'): self.make(spec)
        self.assertEqual(self.session.path.name, 'current.json')

    def test_foreign_lifecycle_active_state_blocks_maintenance(self):
        other = self.folder/'foreign'; other.mkdir(mode=0o700)
        (other/'current.json').write_text(json.dumps({'releaseId':'other','target':plan()['target'],'status':'DRAINING'}))
        with self.assertRaisesRegex(m.Hold, 'UNFINISHED'):
            m.MaintenanceSession(self.tx, plan(), adapter=self.adapter,state_root=other, now=NOW)

    def test_cas_conflict_and_arbitrary_shell_are_rejected_before_host_call(self):
        with self.assertRaisesRegex(m.Hold, 'REVISION'): self.session.step({'action':'baseline','operationId':str(uuid.uuid4()),'expectedRevision':99})
        with self.assertRaisesRegex(m.Hold, 'TYPED'): self.session.step({'action':'baseline','operationId':str(uuid.uuid4()),'expectedRevision':0,'shell':'echo exploit'})
        self.assertEqual(self.adapter.calls, [])
        data=m.load_json(self.session.path);data['external-change']=True;self.session.path.write_text(json.dumps(data))
        with self.assertRaisesRegex(m.Hold,'CAS_CHANGED'): self.step('baseline')
        self.assertEqual(self.adapter.calls, [])

    def test_intent_is_durable_before_side_effect_and_same_uuid_ack_is_not_resent(self):
        original = self.adapter.backup
        def backup(op, reconcile=False):
            disk=m.load_json(self.session.path); self.assertEqual(disk['operations'][op]['phase'],'INTENT_RECORDED')
            return original(op,reconcile)
        self.adapter.backup=backup;self.step('baseline');request,_=self.step('backup')
        count=len(self.adapter.calls); result=self.session.step(request)
        self.assertEqual(result['result'],'ALREADY_ACKNOWLEDGED');self.assertEqual(len(self.adapter.calls),count)

    def test_unknown_blocks_new_operation_and_requires_explicit_original_uuid(self):
        self.step('baseline');self.adapter.fail='backup'
        request={'action':'backup','operationId':str(uuid.uuid4()),'expectedRevision':self.session.state['revision']}
        with self.assertRaisesRegex(m.Hold,'FIXTURE_UNKNOWN'): self.session.step(request)
        self.assertEqual(m.load_json(self.session.path)['operations'][request['operationId']]['phase'],'UNKNOWN')
        with self.assertRaisesRegex(m.Hold,'UNKNOWN_OPERATION'): self.step('backup')
        with self.assertRaisesRegex(m.Hold,'RECONCILIATION'): self.session.step(request)
        self.adapter.fail=None;self.session=self.make()
        self.session.step({**request,'reconcile':True});self.assertEqual(self.session.state['phase'],'BACKED_UP')
        with self.assertRaisesRegex(m.Hold,'BINDING_CONFLICT'): self.session.step({**request,'action':'maintenance'})

    def test_resume_response_loss_keeps_original_suboperation_and_never_reopens_apps_twice(self):
        self.to_candidates();self.step('acceptance');self.step('preservation');self.adapter.lost='resume'
        request={'action':'activate','operationId':str(uuid.uuid4()),'expectedRevision':self.session.state['revision']}
        with self.assertRaisesRegex(m.Hold,'LOST_RESPONSE'):self.session.step(request)
        self.session=self.make();self.session.step({**request,'reconcile':True})
        self.assertEqual(self.session.state['phase'],'ACTIVE')
        self.assertEqual(self.adapter.calls.count('app-resume'),1);self.assertEqual(self.adapter.calls.count('gateway-open'),1)

    def test_rollback_pauses_new_worker_before_restoring_gateway_and_original_caller(self):
        self.to_active();self.step('rollback')
        self.assertEqual(self.session.state['phase'],'ROLLED_BACK')
        calls=self.adapter.calls
        self.assertLess(calls.index('worker-drain'),calls.index('gateway-rollback-open'))
        self.assertLess(calls.index('gateway-rollback-open'),calls.index('restore-caller'))
        self.assertFalse(self.session.state['databaseRestored']);self.assertFalse(self.session.state['tasksReplayed'])

    def test_unknown_tick_blocks_rollback_caller_restore(self):
        self.to_active();original=self.adapter.worker_control
        def control(*args):
            got=original(*args)
            if args[2]=='status':got['state'].update(phase='UNKNOWN',unresolvedTicks=1)
            return got
        self.adapter.worker_control=control
        with self.assertRaisesRegex(m.Hold,'QUIESCENT'):self.step('rollback')
        self.assertNotIn('restore-caller',self.adapter.calls)

    def test_unknown_snapshot_coverage_blocks_activation(self):
        self.to_candidates();self.step('acceptance')
        def missing(*args):
            got=snapshot();got['private']['tables']['app_video_tasks']['status']='unknown-table-missing'
            got['public']=m.tasks.summarize(got['private']);return got
        self.adapter.snapshot=missing
        with self.assertRaisesRegex(m.Hold,'COVERAGE_UNKNOWN'):self.step('preservation')
        self.assertNotIn('gateway-open',self.adapter.calls)

    def test_host_date_and_authorization_are_exact(self):
        for change in [lambda p:p.update(target='120.27.162.85'),lambda p:p['authorization'].update(date='2026-10-17'),
                       lambda p:p.update(restoreDatabase=True),lambda p:p['webs'].append(copy.deepcopy(p['webs'][0]))]:
            spec=plan();change(spec)
            with self.assertRaises(m.Hold):self.make(spec)
        with self.assertRaisesRegex(m.Hold,'EVENING_WINDOW'):
            m.maintenance.authorize(plan()['authorization'],now=NOW.replace(hour=10,minute=29))

    def test_103_requires_real_47_receipt_and_compiled_variants_start_sequentially(self):
        spec=plan('103.30.76.93')
        with self.assertRaises(m.Hold):self.make_new(spec)
        receipt={'target':'47.105.59.142','phase':'MIGRATED_CLEANUP_PENDING',
                 'preservation':{'taskDataPreserved':True},'activation':{'workerResumed':True}}
        raw=m.encoded(receipt);(self.folder/'47-receipt.json').write_bytes(raw)
        spec['predecessor47']['sha256']=m.sha(raw);self.session=self.make_new(spec)
        for action in ['baseline','backup','maintenance','freeze']:self.step(action)
        with self.assertRaisesRegex(m.Hold,'SEQUENTIAL'):self.step('web-create',variant='desktop')
        for web in spec['webs']:
            for action in ['web-create','web-start','web-verify']:self.step(action,variant=web['variant'])
        self.assertEqual(list(self.session.state['webs']),['main','desktop','enterprise'])

    def test_no_secret_raw_snapshot_or_artifacts_in_public_result(self):
        self.to_active();raw=json.dumps(self.session.public())
        self.assertNotIn('secret-not-printed',raw);self.assertNotIn('tables',raw);self.assertNotIn('private',raw)

    def test_cli_steps_are_executed_under_one_transaction_not_one_lock_per_step(self):
        spec=plan();manifest=self.folder/'manifest.json';manifest.write_bytes(m.encoded(spec))
        requests=[{'action':a,'operationId':str(uuid.uuid4()),'expectedRevision':n*2}
                  for n,a in enumerate(['baseline','backup','maintenance','freeze'])]
        steps=self.folder/'steps.json';steps.write_bytes(m.encoded(requests))
        entered=[];exited=[];original=m.MaintenanceSession
        class Transaction:
            def __init__(tx,*args):tx.folder=self.folder;tx.stack=None
            def __enter__(tx):entered.append(True);tx.stack=True;return tx
            def __exit__(tx,*args):exited.append(True);tx.stack=None
        def construct(tx,p):
            self.assertTrue(tx.stack);self.assertFalse(exited)
            return original(tx,p,adapter=self.adapter,state_root=self.folder/'cli-state',now=NOW)
        output=io.StringIO()
        with patch.object(m,'HostTransaction',Transaction),patch.object(m,'MaintenanceSession',construct),contextlib.redirect_stdout(output):
            code=m.main(['--manifest',str(manifest),'--steps',str(steps)])
        self.assertEqual(code,0);self.assertEqual(entered,[True]);self.assertEqual(exited,[True])
        responses=[json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([r['phase'] for r in responses],['BASELINED','BACKED_UP','MAINTENANCE','FROZEN'])


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=pathlib.Path(self.tmp.name)
        self.spec=plan();self.tx=SimpleNamespace(folder=self.folder)
        self.adapter=m.LiveAdapter(self.tx,self.spec)
        self.ident=identity(3,name='candidate-main');self.app={'bootId':str(uuid.uuid4()),'instanceId':'candidate-main','commit':'c'*40}
        self.state={'webs':{'main':{'running':self.ident,'verified':{'observedAt':m.timestamp()}}}}
        self.adapter.verify=lambda web,ident,op:{'identity':self.ident,'app':{'identity':self.app,'admission':{'mode':'draining'}}}
        def save(name,value):
            raw=value if isinstance(value,bytes) else m.encoded(value)
            (self.folder/name).write_bytes(raw)
            return {'path':str(self.folder/name),'sha256':m.sha(raw),'bytes':len(raw)}
        self.tx.save=save
    def tearDown(self):self.tmp.cleanup()
    def artifact(self,name,value):
        raw=value if isinstance(value,bytes) else m.encoded(value);(self.folder/name).write_bytes(raw)
        return {'path':name,'sha256':m.sha(raw)}

    def test_executable_http_collector_and_verifier_use_actual_nonempty_responses(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200);self.end_headers();self.wfile.write(b'{"fixture":"actual-http-body"}')
            def log_message(self,*args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.spec['webs'][0]['port']=server.server_port
        checks=[{'variant':'main','name':name,'path':path,'expectedStatus':200,'jsonAssertions':[{'path':['fixture'],'expected':'actual-http-body'}]}
                for name,path in [('login','/api/auth/session'),('canvas','/api/projects'),('private-media','/api/media/fixture'),('old-client','/_next/static/fixture.js')]]
        try:
            descriptor=self.adapter.capture_acceptance(self.state,self.artifact('checks.json',{'checks':checks}),str(uuid.uuid4()))
            result=self.adapter.acceptance(self.state,descriptor,str(uuid.uuid4()))
            self.assertEqual(result['checks'],4)
            report=m.load_json(self.folder/descriptor['path'])
            response=m.load_json(self.folder/report['checks'][0]['response']['path'])
            self.assertIn(str(server.server_port),response['request']['url'])
            self.assertEqual((self.folder/response['body']['path']).read_bytes(),b'{"fixture":"actual-http-body"}')
            invalid=copy.deepcopy(report);invalid['bindings']['main']['appIdentity']['bootId']='wrong'
            with self.assertRaisesRegex(m.Hold,'BOOT_OR_VARIANT'):self.adapter.acceptance(self.state,self.artifact('wrongboot.json',invalid),str(uuid.uuid4()))
            invalid=copy.deepcopy(report);invalid['checks'][0]['startedAt']='2020-01-01T00:00:00Z'
            with self.assertRaises(m.Hold):self.adapter.acceptance(self.state,self.artifact('stale.json',invalid),str(uuid.uuid4()))
            bodypath=self.folder/response['body']['path'];bodypath.write_bytes(b'forged')
            with self.assertRaisesRegex(m.Hold,'HASH_OR_PATH'):self.adapter.acceptance(self.state,descriptor,str(uuid.uuid4()))
        finally:server.shutdown();server.server_close();thread.join()

    def test_pass_text_wrong_boot_stale_forged_body_and_arbitrary_feature_path_rejected(self):
        with self.assertRaises(m.Hold):self.adapter.acceptance(self.state,self.artifact('pass.json',{'PASS':True}),str(uuid.uuid4()))
        with self.assertRaises(m.Hold):m.check_path('canvas','/api/generate-image')
        with self.assertRaises(m.Hold):m.check_path('login','http://external.test/api/auth/session')
        descriptor=self.artifact('secret.json',b'private')
        with self.assertRaises(m.Hold):m.relative_artifact(self.folder,{**descriptor,'path':'../secret.json'})
        with self.assertRaises(m.Hold):m.relative_artifact(self.folder,{**descriptor,'sha256':'a'*64})


@unittest.skipUnless(os.name=='posix' and os.environ.get('NAUMI_SESSION_POSIX_FIXTURE')=='1',
                     'explicit disposable Linux container lock fixture required')
class RealLockTests(unittest.TestCase):
    def test_real_host_transaction_locks_remain_held_across_all_steps(self):
        self.assertTrue(pathlib.Path('/.dockerenv').exists(), 'disposable Docker fixture only')
        machine=pathlib.Path('/etc/machine-id')
        if not machine.exists(): machine.write_text(uuid.uuid4().hex+'\n')
        for target in ['47.105.59.142','103.30.76.93']:
            from release47_host import TARGETS
            for name in TARGETS[target]['locks']:pathlib.Path(name).parent.mkdir(parents=True,exist_ok=True)
        folder=pathlib.Path('/opt/naumi-staging/evidence')/('session-fixture-'+uuid.uuid4().hex)
        folder.mkdir(mode=0o700,parents=True)
        spec=plan();spec['hostIdentitySha256']=m.sha(machine.read_bytes().strip())
        script='import fcntl,sys;f=open(sys.argv[1],"a");\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError:sys.exit(9)'
        with patch.object(m.maintenance.dt,'datetime',wraps=dt.datetime) as clock:
            clock.now.return_value=NOW
            with m.HostTransaction(spec['target'],spec['hostIdentitySha256'],folder) as tx:
                adapter=FixtureAdapter()
                session=m.MaintenanceSession(tx,spec,adapter=adapter,state_root=folder/'canonical',now=NOW)
                for action in ['baseline','backup','maintenance','freeze']:
                    session.step({'action':action,'operationId':str(uuid.uuid4()),'expectedRevision':session.state['revision']})
                    self.assertEqual(len(tx.lock_fds),3)
                    for path in TARGETS[spec['target']]['locks']:
                        result=subprocess.run([sys.executable,'-c',script,path],capture_output=True)
                        self.assertEqual(result.returncode,9,result.stderr.decode())
            for path in TARGETS[spec['target']]['locks']:
                self.assertEqual(subprocess.run([sys.executable,'-c',script,path],capture_output=True).returncode,0)


if __name__=='__main__':unittest.main()
