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
    def preflight(self, operation): self.record('preflight'); return {'availableMiB':9999,'requiredMiB':2176,'swapIncluded':False}
    def legacy_safety(self, **kwargs): self.record('legacy-safety'); return {'verified':True}
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
    def observed_started_identity(self, ident):self.record('pin-started');return ident
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

    def test_unified_103_is_explicit_and_requires_both_real_ui_checks(self):
        spec=plan('103.30.76.93');spec['webs']=spec['webs'][:1]
        with self.assertRaises(m.Hold):m.valid_plan(spec)
        spec['runtimeTopology']='unified-web-three-ui'
        with self.assertRaisesRegex(m.Hold,'THREE_REAL_UI'):m.valid_plan(spec)
        spec['webs'][0]['requiredChecks']+=['desktop-ui','enterprise-ui']
        self.assertEqual(m.valid_plan(spec)['webs'][0]['assetPrefix'],'')
        spec['target']='47.105.59.142';spec['authorization']['target']=spec['target']
        with self.assertRaisesRegex(m.Hold,'TOPOLOGY'):m.valid_plan(spec)

    def test_immediate_hk_only_removes_47_predecessor_but_no_other_gate(self):
        spec=plan('103.30.76.93');spec.pop('predecessor47')
        spec['authorization'].update(mode='immediate-HK-only',
            userImmediateAcknowledgement='现在就上线香港',notBefore='2026-10-16T08:41:00Z')
        self.assertEqual(m.valid_plan(spec)['target'],'103.30.76.93')
        self.session=self.make_new(spec);self.to_candidates();self.step('acceptance');self.step('preservation')
        self.adapter.fail='legacy-safety'
        with self.assertRaises(m.Hold):self.step('activate')
        self.assertNotIn('worker-resume',self.adapter.calls)
        normal=copy.deepcopy(spec);normal['authorization']['mode']='one-time-maintenance'
        with self.assertRaisesRegex(m.Hold,'47_BEFORE_103'):m.valid_plan(normal)
        for change in [dict(userImmediateAcknowledgement='wrong'),dict(notBefore='2026-10-16T08:40:00Z')]:
            invalid=copy.deepcopy(spec);invalid['authorization'].update(change)
            with self.assertRaises(m.Hold):m.valid_plan(invalid)
        wrong=plan();wrong['authorization'].update(spec['authorization'],target='47.105.59.142')
        with self.assertRaisesRegex(m.Hold,'IMMEDIATE_HK_ONLY'):m.valid_plan(wrong)

    def test_no_secret_raw_snapshot_or_artifacts_in_public_result(self):
        self.to_active();raw=json.dumps(self.session.public())
        self.assertNotIn('secret-not-printed',raw);self.assertNotIn('tables',raw);self.assertNotIn('private',raw)

    def test_capacity_failure_is_before_503_and_same_uuid_can_revalidate(self):
        self.step('baseline');self.step('backup');self.adapter.fail='preflight'
        request={'action':'maintenance','operationId':str(uuid.uuid4()),'expectedRevision':self.session.state['revision']}
        with self.assertRaisesRegex(m.Hold,'FIXTURE_UNKNOWN'):self.session.step(request)
        self.assertNotIn('gateway-maintenance',self.adapter.calls)
        self.adapter.fail=None;self.session=self.make();self.session.step({**request,'reconcile':True})
        self.assertEqual(self.session.state['phase'],'MAINTENANCE')
        self.assertEqual(self.adapter.calls.count('gateway-maintenance'),1)

    def test_changed_legacy_safety_blocks_activation_and_caller_restore(self):
        self.to_candidates();self.step('acceptance');self.step('preservation');self.adapter.fail='legacy-safety'
        with self.assertRaisesRegex(m.Hold,'FIXTURE_UNKNOWN'):self.step('activate')
        self.assertNotIn('app-resume',self.adapter.calls);self.assertNotIn('worker-resume',self.adapter.calls)

    def test_worker_start_success_then_status_read_failure_reuses_exact_running_identity(self):
        for action in ['baseline','backup','maintenance','freeze']:self.step(action)
        for action in ['web-create','web-start','web-verify']:self.step(action,variant='main')
        self.step('worker-create');self.adapter.fail='worker-status'
        request={'action':'worker-start','operationId':str(uuid.uuid4()),'expectedRevision':self.session.state['revision']}
        with self.assertRaises(m.Hold):self.session.step(request)
        self.assertIn('running',self.session.state['worker'])
        self.adapter.fail=None;self.session=self.make();self.session.step({**request,'reconcile':True})
        self.assertEqual(self.adapter.calls.count('worker-start'),1);self.assertIn('pin-started',self.adapter.calls)

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
    def test_packaging_paths_match_actual_source_routes_not_generic_creation_prefix(self):
        root=pathlib.Path(__file__).resolve().parents[2]
        self.assertTrue((root/'src/app/tools/packaging-strategy/page.tsx').is_file())
        self.assertTrue((root/'src/app/api/packaging-strategy/route.ts').is_file())
        for path in ['/tools/packaging-strategy','/tools/packaging-strategy?project=fixture','/api/packaging-strategy']:
            m.check_path('packaging',path)
        for path in ['/creation/anything','/tools/packaging-strategy-extra','/api/generate-image',
                     'https://external.test/tools/packaging-strategy']:
            with self.assertRaises(m.Hold):m.check_path('packaging',path)

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

    def test_unified_ui_requires_real_browser_dom_roles_not_200_html_shell(self):
        self.spec['webs'][0]['requiredChecks']=['desktop-ui','enterprise-ui']
        report={'kind':'naumi-candidate-acceptance-v1','releaseId':self.spec['releaseId'],'target':self.spec['target'],
                'commit':self.spec['commit'],'buildVersion':self.spec['buildVersion'],
                'bindings':{'main':{'container':self.ident,'appIdentity':self.app,'assetPrefix':''}},'checks':[]}
        for name,path in [('desktop-ui','/desktop'),('enterprise-ui','/enterprise')]:
            body=b'<html><div>actual fixture UI</div></html>';url='http://127.0.0.1:13080'+path
            response={'containerId':self.ident['id'],'bootId':self.app['bootId'],'status':200,
                      'request':{'method':'GET','url':url},'body':self.artifact(name+'.html',body),
                      'responseBodySha256':m.sha(body),'assertions':[{'kind':'bodyContains','needle':'actual fixture UI','actual':True,'expected':True}]}
            roles=[{'role':'tablist' if name=='desktop-ui' else 'button','name':'工作空间展示' if name=='desktop-ui' else '组织与成员'},
                   {'role':'heading','name':'Fixture workspace' if name=='desktop-ui' else 'Fixture enterprise'}]
            dom={'kind':'hydrated-role-snapshot-v1','containerId':self.ident['id'],'bootId':self.app['bootId'],
                 'url':url,'hydrated':True,'errors':[],'observedAt':m.timestamp(),
                 'elements':[{**role,'visible':True} for role in roles]}
            report['checks'].append({'variant':'main','name':name,'runner':'cua','passed':True,'startedAt':m.timestamp(),
                'response':self.artifact(name+'.response.json',response),'screenshot':self.artifact(name+'.png',b'\x89PNG\r\n\x1a\n'+b'x'*256),
                'dom':self.artifact(name+'.dom.json',dom),'roleAssertions':roles})
        self.assertTrue(self.adapter.acceptance(self.state,self.artifact('ui-report.json',report),'op')['candidateBindingsVerified'])
        for mutation in [lambda r:r['checks'][0].update(runner='http-integration'),
                         lambda r:r['checks'][0].update(roleAssertions=[{'role':'tablist','name':'not-actually-visible'}])]:
            invalid=copy.deepcopy(report);mutation(invalid)
            with self.assertRaises(m.Hold):self.adapter.acceptance(self.state,self.artifact('invalid-ui.json',invalid),'op')
        checks={'checks':[{'variant':'main','name':'desktop-ui','path':'/desktop','expectedStatus':200,'bodyContains':'shell'}]}
        with self.assertRaisesRegex(m.Hold,'EXTERNAL_BROWSER'):self.adapter.capture_acceptance(self.state,self.artifact('ui-http.json',checks),'op')


class LiveRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=pathlib.Path(self.tmp.name);self.spec=plan()
        self.memory=5000;self.calls=[];self.fail_start=False;self.reload_fail_once=False
        def raw(number,cmd,running,env):
            return {'Id':str(number)*64,'Name':'/fixture-'+str(number),'Image':'sha256:'+'a'*64,
                    'State':{'Running':running,'StartedAt':'fixture-start','Paused':False},
                    'Config':{'Cmd':cmd,'Env':env},'HostConfig':{'RestartPolicy':{'Name':'no'},'Memory':128*1024**2}}
        self.rows={
            '1'*64:raw(1,['node','server.js'],True,['NAUMI_VIDEO_WORKER=0']),
            '2'*64:raw(2,['node','scripts/video-worker.mjs'],True,[]),
            '3'*64:raw(3,['node','server.js'],False,['NAUMI_VIDEO_WORKER=0']),
            '4'*64:raw(4,['node','scripts/video-worker.mjs'],False,['NAUMI_WORKER_RELEASE_CONTROL=1','NAUMI_WORKER_START_PAUSED=1']),
            '9'*64:raw(9,['postgres'],True,[]),
        }
        self.spec['baseline']=[m.public_identity(self.rows['1'*64])]
        self.spec['webs'][0]['source']=self.spec['baseline'][0]
        self.spec['legacyCaller']['identity']=m.public_identity(self.rows['2'*64])
        self.spec['database']=m.public_identity(self.rows['9'*64])
        self.tx=m.HostTransaction(self.spec['target'],self.spec['hostIdentitySha256'],self.folder,command=self.command)
        self.tx.stack=True;self.adapter=m.LiveAdapter(self.tx,self.spec)
    def tearDown(self):self.tmp.cleanup()
    def command(self,args,**kwargs):
        self.calls.append(args)
        if args[:2]==['docker','inspect']:return json.dumps([self.rows[args[2]]]).encode()
        if args==['cat','/proc/meminfo']:return f'MemAvailable: {self.memory*1024} kB\nSwapFree: 0 kB\n'.encode()
        if args[:2]==['docker','start']:
            if self.fail_start:raise m.Hold('FIXTURE_START_RESULT_LOST')
            self.rows[args[2]]['State'].update(Running=True,StartedAt='new-start');return b''
        if args==['nginx','-T']:
            return b'after' if all(pathlib.Path(path).read_bytes()==value for path,value in self.after.items()) else b'before'
        if args==['systemctl','reload','nginx'] and self.reload_fail_once:
            self.reload_fail_once=False;raise m.Hold('FIXTURE_RELOAD_RESPONSE_LOST')
        return b''
    def test_web_and_worker_memory_gate_failure_before_intent_retries_original_stopped_identity_only(self):
        for number,method in [('3',lambda ident,reconcile:self.adapter.web_start(self.spec['webs'][0],ident,str(uuid.uuid4()),reconcile)),
                              ('4',lambda ident,reconcile:self.adapter.worker_start(ident,str(uuid.uuid4()),reconcile))]:
            with self.subTest(kind=number):
                ident=m.public_identity(self.rows[number*64]);self.memory=1000
                with self.assertRaisesRegex(m.Hold,'MEMORY'):method(ident,False)
                self.assertFalse(any(call[:2]==['docker','start'] and call[2]==ident['id'] for call in self.calls))
                self.memory=5000;result=method(ident,True)
                self.assertTrue(result['running'])
                self.assertEqual(sum(call[:2]==['docker','start'] and call[2]==ident['id'] for call in self.calls),1)
    def test_ambiguous_start_intent_stopped_container_is_never_restarted(self):
        ident=m.public_identity(self.rows['3'*64]);self.fail_start=True
        with self.assertRaisesRegex(m.Hold,'LOST'):self.adapter.web_start(self.spec['webs'][0],ident,'op')
        self.fail_start=False
        with self.assertRaisesRegex(m.Hold,'UNKNOWN_WEB_START'):self.adapter.web_start(self.spec['webs'][0],ident,'op',True)
        self.assertEqual(sum(call[:2]==['docker','start'] for call in self.calls),1)
    def test_missing_intent_running_or_changed_original_identity_cannot_trigger_start(self):
        ident=m.public_identity(self.rows['4'*64]);self.rows['4'*64]['State']['StartedAt']='changed'
        with self.assertRaisesRegex(m.Hold,'NOT_PROVEN'):self.adapter.worker_start(ident,'op',True)
        self.rows['4'*64]['State'].update(Running=True,StartedAt=ident['startedAt'])
        with self.assertRaisesRegex(m.Hold,'NOT_PROVEN'):self.adapter.worker_start(ident,'op',True)
        self.assertFalse(any(call[:2]==['docker','start'] for call in self.calls))
    def test_all_variant_capacity_is_checked_without_swap_before_maintenance(self):
        self.memory=1045
        with self.assertRaisesRegex(m.Hold,'ALL_VARIANT_PRE_MAINTENANCE'):self.adapter.preflight('op')
        self.assertFalse(any(call==['systemctl','reload','nginx'] for call in self.calls))
        self.memory=2176;self.assertEqual(self.adapter.preflight('op')['requiredMiB'],2176)
        # HK needs all three images concurrently, not just one old budget.
        self.spec['webs']=[{**self.spec['webs'][0],'variant':v} for v in ['main','desktop','enterprise']]
        self.memory=1045
        with self.assertRaises(m.Hold):self.adapter.preflight('op')
        self.memory=4224;result=self.adapter.preflight('op');self.assertEqual(result['requiredMiB'],4224)
        self.assertFalse(result['swapIncluded'])
        self.spec['webs']=self.spec['webs'][:1];self.spec['webs'][0]['memoryMiB']=896
        self.spec['webs'][0]['budget']['webPeakMiB']=896;self.memory=2048
        self.assertEqual(self.adapter.preflight('op')['requiredMiB'],2048)
    def test_legacy_caller_pause_does_not_hide_app_internal_timer_or_infra(self):
        self.rows['2'*64]['State']['Paused']=True
        self.assertTrue(self.adapter.legacy_safety(frozen=True)['oldWebTimersExplicitlyDisabled'])
        self.rows['1'*64]['Config']['Env']=[]
        with self.assertRaisesRegex(m.Hold,'INTERNAL_CLAIM_TIMER'):self.adapter.legacy_safety(frozen=True)
        self.rows['1'*64]['Config']['Env']=['NAUMI_VIDEO_WORKER=0'];self.rows['2'*64]['State']['Paused']=False
        with self.assertRaisesRegex(m.Hold,'FROZEN_STATE'):self.adapter.legacy_safety(frozen=True)
        self.spec['baseline'].append(self.spec['database'])
        with self.assertRaisesRegex(m.Hold,'INFRA'):self.adapter.legacy_safety(frozen=False)

    def test_original_caller_restore_response_loss_reconciles_only_with_intent_after_new_worker_paused(self):
        caller=self.spec['legacyCaller']['identity']
        with self.assertRaisesRegex(m.Hold,'UNREADABLE'):
            self.adapter.legacy_safety(frozen=True,restore_reconcile=True)
        (self.folder/('legacy-caller-restore-intent-'+caller['id'][:12]+'.json')).write_bytes(m.encoded({'identity':caller}))
        self.adapter.legacy_safety(frozen=True,restore_reconcile=True)
        self.assertTrue(self.adapter.restore_caller('op')['reconciled'])
    def gateway_fixture(self):
        nginx=self.folder/'nginx';nginx.mkdir()
        before={str(nginx/'site.conf'):b'before config\n'};self.after={path:b'after config\n' for path in before}
        for path,value in before.items():pathlib.Path(path).write_bytes(value)
        def artifact(name,value):
            raw=value if isinstance(value,bytes) else m.encoded(value);(self.folder/name).write_bytes(raw)
            return {'path':name,'sha256':m.sha(raw)}
        report={'configClosureValidated':True,'baselineFileCasVerified':True,'beforeDumpSha256':m.sha(b'before'),
                'afterDumpSha256':m.sha(b'after'),'patches':[{'path':path,'beforeSha256':m.sha(value),
                'afterSha256':m.sha(self.after[path])} for path,value in before.items()]}
        self.spec['gateways']={'maintenance':{'report':artifact('report.json',report),
            'before':{path:artifact('before.conf',value) for path,value in before.items()},
            'after':{path:artifact('after.conf',value) for path,value in self.after.items()}}}
        return nginx
    def test_gateway_automatic_rollback_then_same_uuid_can_repeat_exact_original_cas(self):
        nginx=self.gateway_fixture();op=str(uuid.uuid4());self.reload_fail_once=True
        with patch.object(m.controls,'NGINX_ROOT',nginx),patch.object(m.controls,'_replace_config',lambda p,b:p.write_bytes(b)):
            with self.assertRaisesRegex(m.Hold,'RELOAD_RESPONSE_LOST'):self.adapter.gateway('maintenance',op)
            self.assertEqual(self.command(['nginx','-T']),b'before')
            result=self.adapter.gateway('maintenance',op,True)
            self.assertTrue(result['reloadIssued']);self.assertEqual(self.command(['nginx','-T']),b'after')
            before=len(self.calls);self.adapter.gateway('maintenance',op,True)
            self.assertEqual(sum(call==['systemctl','reload','nginx'] for call in self.calls[before:]),1)
        self.assertEqual(len(list(self.folder.glob('gateway-'+op+'-attempt-*'))),2)
    def test_gateway_after_hash_without_actual_write_intent_stays_unknown(self):
        self.gateway_fixture()
        for path,value in self.after.items():pathlib.Path(path).write_bytes(value)
        with self.assertRaisesRegex(m.Hold,'WRITE_INTENT'):self.adapter.gateway('maintenance',str(uuid.uuid4()),True)
        self.assertFalse(any(call==['systemctl','reload','nginx'] for call in self.calls))
    def test_backup_failed_read_is_not_ack_and_new_read_attempt_keeps_original_dump(self):
        self.tx._command=None;attempts=[];data=b'fixture-pgdump-'+b'x'*200;listing=b'TABLE DATA fixture\n'
        def backup(db):
            folder=self.tx.folder;attempts.append(folder)
            dump=folder/'db.dump';dump.write_bytes(data)
            record={'path':str(dump),'bytes':len(data),'sha256':m.sha(data),'listSha256':m.sha(listing),'restoreExecuted':False}
            receipt=folder/'backup-readable.json';receipt.write_bytes(m.encoded(record))
            return {'path':str(receipt)}
        self.tx.backup_database=backup;self.tx.pin=lambda ident:self.rows[ident['id']]
        failure={'enabled':True};commands=[]
        def read(args,**kwargs):
            commands.append(args)
            return subprocess.CompletedProcess(args,1 if failure['enabled'] else 0,listing if '--list' in args else b'',b'')
        op=str(uuid.uuid4())
        with patch.object(m.subprocess,'run',read):
            with self.assertRaisesRegex(m.Hold,'BACKUP_REOPEN_FAILED'):self.adapter.backup(op)
            self.assertEqual(len(attempts),1);self.assertEqual((attempts[0]/'db.dump').read_bytes(),data)
            failure['enabled']=False;record=self.adapter.backup(op,True)
            self.assertEqual(record['sha256'],m.sha(data));self.assertEqual(len(attempts),1)
            # Corrupt original evidence is retained; a new read-only backup is
            # required and fully verified, never acknowledged from old PASS.
            (attempts[0]/'db.dump').write_bytes(b'corrupt')
            self.adapter.backup(op,True);self.assertEqual(len(attempts),2)
            self.assertEqual((attempts[0]/'db.dump').read_bytes(),b'corrupt')
        self.assertTrue(any('--file=/dev/null' in call for call in commands))
        self.assertFalse(any('-d' in call or '--dbname' in call for call in commands))


@unittest.skipUnless(os.environ.get('NAUMI_VERIFY_ISOLATED_DB')=='1','explicit isolated local PostgreSQL fixture required')
class RealBackupFixture(unittest.TestCase):
    def test_complete_archive_read_decodes_to_discarded_sql_without_restoring_db(self):
        container='naumi-packaging-skills-pg-20261016';schema='session_backup_test_'+uuid.uuid4().hex
        inspected=json.loads(subprocess.check_output(['docker','inspect',container]))[0]
        self.assertEqual(inspected['Name'].lstrip('/'),container)
        env=dict(value.split('=',1) for value in inspected['Config']['Env'] if '=' in value)
        self.assertEqual(env['POSTGRES_DB'],'naumi_packaging')
        db=m.public_identity(inspected)
        command=['docker','exec','-i',db['id'],'psql','-X','-qAt','--no-password','-U',env.get('POSTGRES_USER','postgres'),'-d',env['POSTGRES_DB'],'-v','ON_ERROR_STOP=1']
        def sql(value):return subprocess.check_output(command,input=value.encode(),stderr=subprocess.PIPE)
        try:
            sql(f'CREATE SCHEMA {schema};CREATE TABLE {schema}.fixture(id int);INSERT INTO {schema}.fixture VALUES(1),(2);')
            with tempfile.TemporaryDirectory() as temp:
                folder=pathlib.Path(temp);dump=folder/'original.dump'
                dump.write_bytes(subprocess.check_output(['docker','exec',db['id'],'pg_dump','-Fc','--schema='+schema,'-U',env.get('POSTGRES_USER','postgres'),'-d',env['POSTGRES_DB']]))
                listing=subprocess.check_output(['docker','exec','-i',db['id'],'pg_restore','--list'],input=dump.read_bytes())
                record={'path':str(dump),'bytes':dump.stat().st_size,'sha256':m.sha(dump.read_bytes()),'listSha256':m.sha(listing),'restoreExecuted':False}
                descriptor=folder/'backup-readable.json';descriptor.write_bytes(m.encoded(record))
                def pin(identity):
                    self.assertEqual(m.public_identity(json.loads(subprocess.check_output(['docker','inspect',db['id']]))[0]),identity)
                adapter=m.LiveAdapter(SimpleNamespace(folder=folder,_command=None,pin=pin),{**plan(),'database':db})
                self.assertEqual(adapter.verify_backup(descriptor),record)
                self.assertEqual(sql(f'SELECT count(*) FROM {schema}.fixture;').strip(),b'2')
        finally:sql(f'DROP SCHEMA {schema} CASCADE;')


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
