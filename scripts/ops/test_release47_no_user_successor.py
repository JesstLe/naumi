"""Offline mocks only: no SSH, Docker daemon, live locks or production I/O."""
import copy
import datetime as dt
import inspect
import json
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import release47_no_user_successor as m
import release47_host as host
import release47_normal_controller as ctl
from release47_host import Hold, public_identity, sha
from release47_preserved_unknown import Guard
from release47_saas_successor import SaasController
from test_release47_imagegen_simplify_successor import config as old_config, state

NOW = dt.datetime(2026, 10, 23, 10, 0, tzinfo=dt.timezone.utc)


def config():
    cfg = old_config()
    oldroot = cfg['evidenceRoot']
    root = '/opt/naumi-staging/evidence/release47-no-user-fixture'
    def move(v):
        if isinstance(v, str): return v.replace(oldroot, root)
        if isinstance(v, dict): return {k: move(x) for k,x in v.items()}
        if isinstance(v, list): return [move(x) for x in v]
        return v
    cfg = move(cfg)
    cfg['permissionChecks'] = [c for c in cfg['permissionChecks'] if c['name'] != 'revoked-membership']
    cfg.update(authorization=m.AUTHORIZATION, scope=list(m.SCOPE), releaseId='release47-no-user-fixture',
               stateDir='/opt/naumi-staging/releases/release47-no-user-fixture',
               webMemoryMiB=2560, webFinalMemoryMiB=2560)
    cfg['memoryReview'].update(webMinMiB=2304, webMaxMiB=3072, webPeakMiB=2560,
                              webHeapMiB=1152, nativeReserveMiB=1408)
    env = {'NODE_OPTIONS': '--max-old-space-size=1152 --require=/app/scripts/runtime-memory.cjs --require=/app/scripts/release-http-observer.cjs',
        'NAUMI_NATIVE_MEMORY_PROFILE': 'bounded', 'MALLOC_ARENA_MAX': '2', 'UV_THREADPOOL_SIZE': '2',
        'VIPS_CONCURRENCY': '1', 'NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE': '4',
        'NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN': '4', 'NAUMI_IMAGE_JOB_CONCURRENCY_SUITE': '2',
        'NAUMI_IMAGE_JOB_CONCURRENCY_APLUS': '2'}
    cfg['reviewedMemoryEnvironment'] = env
    cfg['memoryReview']['environment'] = copy.deepcopy(env)
    cfg['maintenanceWindow'] = {'noUsersConfirmed': True, 'retireOldBeforeCandidate': True,
        'preserveAcceptedTasks': True, 'confirmedAt': '2026-10-23T17:00:00+08:00',
        'expiresAt': '2026-10-23T23:59:00+08:00'}
    for row in cfg['permissionChecks']:
        if row['name'] == 'dual-cookie':
            row.update(path='/api/enterprise/saas-overview?tenantId=22222222-2222-4222-8222-222222222222', status=403)
    return cfg


def row(identity):
    return {'Id': identity['id'], 'Name': '/'+identity['name'], 'Image': identity['image'],
        'State': {'Running': identity['running'], 'StartedAt': identity['startedAt'], 'OOMKilled': False},
        'HostConfig': {'RestartPolicy': {'Name': identity['restartPolicy']}, 'Memory': 2048*m.MIB,
                       'MemorySwap': 2048*m.MIB, 'Links': None}, 'Config': {'Env': []}}


def operator():
    op = m.NoUserController.__new__(m.NoUserController)
    op.cfg = config()
    op.web, op.worker = copy.deepcopy((op.cfg['oldWeb'], op.cfg['oldWorker']))
    op.tx = Mock()
    op.tx.folder = pathlib.Path('/fixture/transaction')
    op.tx.spec = {'locks': list(host.LOCKS)}
    op.tx.stack, op.tx.lock_fds = True, [1,2,3]
    op.tx.inspect.side_effect = lambda ident: row(op.web if ident == op.web['id'] else op.worker)
    op.tx.pin.side_effect = lambda ident: row(ident)
    op.preserved_unknown, op.check_quotes = Mock(), Mock()
    op.old_retired, op.entry_maintenance_proven, op.retirement_drain = False, True, None
    op.succ = {'operations': {}, 'retired': []}
    op.state = {'webs': {'main': {}}, 'worker': {}, 'runtimeRecovery': {}}
    op.persist, op.phase = Mock(), Mock()
    op.incident_digest = 'f'*64
    op.infra = []
    def operation(name, fn):
        uid = '11111111-1111-4111-8111-111111111111'
        op.succ['operations'][name] = {'operationId': uid, 'phase': 'INTENT_RECORDED'}
        try: result = fn(uid)
        except BaseException:
            op.succ['operations'][name]['phase'] = 'UNKNOWN'
            raise
        op.succ['operations'][name].update(phase='ACKNOWLEDGED', receipt=result)
        return result
    op.op = Mock(side_effect=operation)
    def wait(fn, label, seconds=60):
        result = fn()
        if not result: raise Hold('WAIT_'+label)
        return result
    op.wait = Mock(side_effect=wait)
    return op


class ConfigAndHistory(unittest.TestCase):
    def test_exact_authorization_new_heap_does_not_touch_old_defaults(self):
        cfg = config(); before = copy.deepcopy(cfg)
        m.validate_config(cfg)
        self.assertEqual(cfg, before)
        self.assertNotEqual(m.AUTHORIZATION, m.imagegen.AUTHORIZATION)
        self.assertIn('reviewed_memory_environment=None', inspect.getsource(host.HostTransaction.clone_web))
        with patch.object(ctl.pathlib, 'Path', pathlib.PurePosixPath), self.assertRaisesRegex(Hold, 'REVIEWED_WEB_MEMORY'):
            ctl.configure(cfg)
        with patch.multiple(ctl, ROOT=None, WEB=None, WORKER=None, OLDWEB=None, OLDWORKER=None, STATE=None, COOKIE=None, RELEASE=None):
            m.configure(cfg)
            self.assertEqual(ctl.RELEASE, cfg['releaseId'])

    def test_authorization_scope_target_window_and_unsafe_flags_fail(self):
        for key, value in [('authorization', m.imagegen.AUTHORIZATION), ('scope', ['47-only']),
            ('target', '103.30.76.93'), ('restoreDatabase', True), ('replayAcceptedTasks', True),
            ('activateDisabledModels', True), ('resumeReview', {}), ('date', '2026-10-24')]:
            cfg = config(); cfg[key] = value
            if key == 'resumeReview': cfg[key] = {'revision':743}
            with self.subTest(key=key), self.assertRaises(Hold): m.validate_config(cfg)
        for key in ('noUsersConfirmed', 'retireOldBeforeCandidate', 'preserveAcceptedTasks'):
            cfg = config(); cfg['maintenanceWindow'][key] = False
            with self.subTest(key=key), self.assertRaises(Hold): m.validate_config(cfg)
        m.check_window(config(), NOW)
        for at in (NOW-dt.timedelta(hours=3), NOW+dt.timedelta(days=1)):
            with self.assertRaisesRegex(Hold, 'WINDOW'): m.check_window(config(), at)

    def test_explicit_ram_range_native_headroom_and_only_real_environment_keys(self):
        for key,value in [('webMinMiB',2048),('webHeapMiB',2048),('nativeReserveMiB',512),('hostReserveMiB',512)]:
            cfg = config(); cfg['memoryReview'][key] = value
            with self.subTest(key=key), self.assertRaises(Hold): m.validate_config(cfg)
        for key,value in [('NAUMI_SHARP_CACHE_MB','32'), ('SHARP_CONCURRENCY','1'),('DATABASE_URL','secret'),
                          ('NAUMI_NATIVE_MEMORY_PROFILE','unbounded'),('NODE_OPTIONS','--max-old-space-size=1152')]:
            cfg = config(); cfg['reviewedMemoryEnvironment'][key] = value
            cfg['memoryReview']['environment'] = copy.deepcopy(cfg['reviewedMemoryEnvironment'])
            with self.subTest(key=key), self.assertRaises(Hold): m.validate_config(cfg)
        cfg = config(); cfg['memoryReview']['environment']['MALLOC_ARENA_MAX'] = '4'
        with self.assertRaises(Hold): m.validate_config(cfg)

    def test_dual_cookie_tests_enterprise_foreign_not_legitimate_admin(self):
        cfg = config(); dual = next(c for c in cfg['permissionChecks'] if c['name']=='dual-cookie')
        self.assertEqual(len(cfg['permissionChecks']),5)
        self.assertNotIn('revoked-membership',m.PERMISSION_CASES)
        self.assertIn('revoked-membership',m.imagegen.PERMISSION_CASES)
        for path,status in [('/api/admin/tenants',403),('/api/enterprise/saas-overview?tenantId=foreign',403),
                            (dual['path'],401),(dual['path'],200)]:
            bad = copy.deepcopy(cfg)
            next(c for c in bad['permissionChecks'] if c['name']=='dual-cookie').update(path=path,status=status)
            with self.subTest(path=path,status=status), self.assertRaises(Hold): m.validate_config(bad)

    def test_begin_uses_original_cas_keeps_all_historical_unknown_observations(self):
        cfg = config(); s = state(cfg)
        s['historicalObservations'] = {'state':'UNKNOWN','paidTask':'retained-id'}
        cfg['expectedCanonicalDigest'] = sha(m.recovery.encoded(s))
        original = copy.deepcopy(s)
        proof = m.begin(s,cfg,{'path':cfg['evidenceRoot']+'/baseline.json','sha256':cfg['expectedCanonicalDigest']},'f'*64,NOW)
        self.assertEqual(s, original)
        self.assertEqual(proof['authorization'], cfg['authorization'])
        self.assertFalse(proof['historicalDrainReclassified'])
        for mutation in ('revision','active','root-unknown','nested-unknown','legacy'):
            bad = copy.deepcopy(s)
            if mutation=='revision': bad['revision'] += 1
            if mutation=='active': bad['activeNormalBlueGreenReleaseId']='other'
            if mutation=='root-unknown': bad['operations']['old']={'phase':'UNKNOWN','operationId':'kept'}
            if mutation=='nested-unknown': bad['normalBlueGreenReleases'][cfg['predecessorReleaseId']]['operations']['old']={'phase':'UNKNOWN'}
            if mutation=='legacy': bad['legacyDrainProven']=True
            testcfg=copy.deepcopy(cfg)
            if mutation!='revision': testcfg['expectedCanonicalDigest']=sha(m.recovery.encoded(bad))
            with self.subTest(mutation=mutation), self.assertRaises(Hold):
                m.begin(bad,testcfg,{'path':cfg['evidenceRoot']+'/baseline.json','sha256':testcfg['expectedCanonicalDigest']},'f'*64,NOW)

    def test_constructor_requires_exact_three_lock_transaction_before_any_reads(self):
        for fds,locks,stack in [([],host.LOCKS,True),([1,2],host.LOCKS,True),([1,2,3],host.LOCKS[:2],True),([1,2,3],host.LOCKS,None)]:
            tx=Mock();tx.stack=stack;tx.lock_fds=fds;tx.spec={'locks':locks}
            with self.subTest(fds=fds), self.assertRaisesRegex(Hold,'THREE_LOCK'):
                m.NoUserController(tx,config())
            tx.inspect.assert_not_called()

    def test_invalid_config_fails_before_live_transaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/'bad.json';path.write_text('{}',encoding='utf-8')
            with patch.object(ctl,'transaction') as transaction, self.assertRaises(Hold): m.main(path)
            transaction.assert_not_called()


class MemoryAndClone(unittest.TestCase):
    def test_fresh_ram_does_not_credit_future_retirement_swap_or_cache(self):
        cfg=config()
        self.assertFalse(m.ram_budget(3355284*1024,0,0,cfg)['passed'])
        exact=(2560+1024+1024)*m.MIB
        self.assertTrue(m.ram_budget(exact,0,0,cfg)['passed'])
        self.assertFalse(m.ram_budget(exact-1,0,0,cfg)['passed'])
        self.assertTrue(m.ram_budget((2048+512+1024)*m.MIB,512*m.MIB,512*m.MIB,cfg)['passed'])
        proof=m.ram_budget(exact,0,0,cfg)
        self.assertFalse(proof['swapIncluded']);self.assertEqual(proof['oldRetirementCreditBytes'],0)
        for v in (True,-1,'5000'):
            with self.assertRaises(Hold):m.ram_budget(v,0,0,cfg)

    def test_memory_observation_checks_old_stopped_before_memavailable(self):
        op=operator()
        with patch.object(m,'mem_available') as available, self.assertRaisesRegex(Hold,'ACTUALLY_RETIRED'):
            op.memory_proof('before-start')
        available.assert_not_called()
        op.web.update(running=False,restartPolicy='no');op.worker.update(running=False,restartPolicy='no')
        with patch.object(m,'mem_available',return_value=4608*m.MIB):
            self.assertTrue(op.memory_proof('before-start')['passed'])
        with patch.object(m,'mem_available',return_value=4608*m.MIB-1),self.assertRaisesRegex(Hold,'POST_RETIREMENT_RAM'):
            op.memory_proof('before-start')

    def clone_payload(self,review):
        cfg=config(); real_path=pathlib.Path
        source=row(cfg['oldWeb']); source.update(NetworkSettings={'Networks':{'fixture-network':{}}},Mounts=[])
        source['Config'].update(Cmd=['node','server.js'],Env=['OLD_SETTING=preserved'])
        original=copy.deepcopy(source);captured={};commands=[]
        state_name='/opt/naumi-staging/releases/fixture-only/web'
        state_path=Mock();state_path.is_absolute.return_value=True;state_path.is_symlink.return_value=False
        state_path.resolve.return_value.is_relative_to.return_value=True;state_path.stat.return_value.st_mode=0o40700
        state_path.__str__=Mock(return_value=state_name)
        def path(v):return state_path if str(v)==state_name else real_path(v)
        def command(args,**kwargs):
            commands.append(args)
            self.assertEqual(args[:2],['docker','create'])
            envfile=args[args.index('--env-file')+1]
            captured.update(l.split('=',1) for l in real_path(envfile).read_text().splitlines())
            return ('3'*64).encode()
        with tempfile.TemporaryDirectory() as tmp:
            tx=host.HostTransaction(host.TARGET,'a'*64,tmp,command=command);tx.stack=True
            tx.pin=lambda _:source;tx.save=Mock()
            tx.inspect=lambda _:dict(Id='3'*64,Name='/naumi47-created-fixture',Image=cfg['image'],
                State={'Running':False,'StartedAt':''},HostConfig={'RestartPolicy':{'Name':'no'}},
                Config={'Env':[k+'='+v for k,v in captured.items()]})
            with patch.object(host.pathlib,'Path',side_effect=path),patch.object(host.os,'chown',create=True):
                tx.clone_web(cfg['oldWeb'],name='naumi47-created-fixture',port=13123,image=cfg['image'],commit=cfg['commit'],
                    memory_mib=2560,cpu=1,release_secret='s'*48,state_dir=state_name,build_version=cfg['version'],
                    reviewed_memory_environment=review)
        self.assertEqual(source,original)
        return captured,commands

    def test_host_new_heap_native_budget_env_file_exact_old_defaults_unchanged(self):
        cfg=config();env,commands=self.clone_payload({'memoryReview':cfg['memoryReview'],'environment':cfg['reviewedMemoryEnvironment']})
        self.assertEqual(env['NODE_OPTIONS'],cfg['reviewedMemoryEnvironment']['NODE_OPTIONS'])
        self.assertEqual(env['NAUMI_NATIVE_MEMORY_PROFILE'],'bounded');self.assertEqual(env['OLD_SETTING'],'preserved')
        self.assertIn('--memory=2560m',commands[0]);self.assertIn('--memory-swap=2560m',commands[0])
        self.assertNotIn('--oom-kill-disable',' '.join(commands[0]))
        old,_=self.clone_payload(None)
        self.assertEqual(old['NODE_OPTIONS'],'--max-old-space-size=2176 --require=/app/scripts/release-http-observer.cjs')
        self.assertNotIn('NAUMI_NATIVE_MEMORY_PROFILE',old)

    def test_host_env_rejects_unbound_heap_native_arbitrary_key_or_observer_removal(self):
        cfg=config()
        for mutation in ('unbound','key','observer','native'):
            ram=copy.deepcopy(cfg['memoryReview']);env=copy.deepcopy(cfg['reviewedMemoryEnvironment'])
            if mutation=='unbound':env['MALLOC_ARENA_MAX']='4'
            if mutation=='key':env['DATABASE_URL']='private';ram['environment']=copy.deepcopy(env)
            if mutation=='observer':env['NODE_OPTIONS']='--max-old-space-size=1152';ram['environment']=copy.deepcopy(env)
            if mutation=='native':ram['nativeReserveMiB']=512
            with self.subTest(mutation=mutation),self.assertRaises(Hold):
                self.clone_payload({'memoryReview':ram,'environment':env})


class RetirementAndFailure(unittest.TestCase):
    def test_real_entry_render_and_maintenance_to_candidate_rebase(self):
        from test_release_client_compat import fixture_files, dump_files, SITE
        from saas_recovery_gateway import server_inventory
        files=fixture_files(); original=dump_files(files)
        candidate={n:body.replace('http://127.0.0.1:13070','http://127.0.0.1:13115') for n,body in files.items()}
        op=operator();op.cfg['expectedGatewayDigest']=sha(original.encode())
        op.ingress={'servers':[r for r in server_inventory(original) if r['path']==SITE]}
        def program_gateway():
            op.dump=original;op.before={n:raw.encode() for n,raw in files.items()}
            op.candidate_closure={n:raw.encode() for n,raw in candidate.items()}
            op.after_dump=dump_files(candidate);op.real={n:n for n in files}
        with tempfile.TemporaryDirectory() as tmp,patch.object(ctl,'ROOT',pathlib.Path(tmp)),\
             patch.object(m.ImagegenSimplifyController,'build_gateway',side_effect=program_gateway),\
             patch.object(m,'syntax_check'):
            op.build_gateway()
            entry=pathlib.Path(tmp)/'no-user-entry-maintenance'
            self.assertIn('return 503;', (entry/'nginx.after.txt').read_text())
            self.assertEqual(op.open_report['beforeDumpSha256'],op.entry_report['afterDumpSha256'])
            self.assertEqual(op.open_report['afterDumpSha256'],sha(op.after_dump.encode()))
            reconstructed={**op.entry_closure,**op.open_after}
            self.assertEqual(reconstructed,op.candidate_closure)
            for key in ('report.json','nginx.before.txt','nginx.after.txt'):
                self.assertTrue((pathlib.Path(tmp)/'no-user-open-gateway'/key).read_bytes())

    def ready_retirement(self):
        op=operator();op.entry_report={'afterDumpSha256':sha(b'maintenance')}
        op.tx.run.return_value=b'maintenance'
        op.worker_control=Mock(return_value={'state':{'paused':True,'activeTicks':0,'unresolvedTicks':0,'phase':'QUIESCENT'}})
        op.pre_retirement_drain=Mock(return_value={'currentExecutableWorkDrained':True,'rawWorker':{'originalReceipt':'kept'}})
        op.pre_retirement_reference_proof=Mock()
        op.stop_exact=Mock(side_effect=lambda ident:{**ident,'running':False,'restartPolicy':'no'})
        return op

    def test_real_drain_and_503_precede_stop_and_observed_stopped_identities_are_updated(self):
        op=self.ready_retirement()
        with patch.object(m,'check_window'),patch.object(ctl.c,'control_app',return_value={'drained':True}):op.retire_old_slots()
        self.assertEqual([c.args[0]['id'] for c in op.stop_exact.call_args_list],[op.cfg['oldWorker']['id'],op.cfg['oldWeb']['id']])
        self.assertFalse(op.web['running']);self.assertFalse(op.worker['running'])
        self.assertEqual(op.web['restartPolicy'],'no');self.assertEqual(len(op.succ['retired']),2)
        self.assertEqual(op.state['webs']['main']['running'],op.web)
        self.assertEqual(op.state['runtimeRecovery']['phase'],'MAINTENANCE_OLD_SLOTS_RETIRED')
        self.assertTrue(op.old_retired)
        op.pre_retirement_reference_proof.assert_any_call('worker');op.pre_retirement_reference_proof.assert_any_call('web')
        with self.assertRaisesRegex(Hold,'ORIGINAL_DRAIN'):op.drain_proof()

    def test_new_inflight_or_unknown_never_silently_kills_old(self):
        op=self.ready_retirement();op.pre_retirement_drain.side_effect=Hold('CURRENT_WORK_OR_UNKNOWN_BLOCKS_RETIREMENT')
        with patch.object(m,'check_window'),patch.object(ctl.c,'control_app'),self.assertRaisesRegex(Hold,'CURRENT_WORK'):
            op.retire_old_slots()
        op.stop_exact.assert_not_called()
        op=self.ready_retirement();op.worker_control.return_value['state']['unresolvedTicks']=1
        with patch.object(m,'check_window'),patch.object(ctl.c,'control_app'),self.assertRaisesRegex(Hold,'OLD_WORKER_DRAIN'):
            op.retire_old_slots()
        op.stop_exact.assert_not_called()

    def test_maintenance_http_required_and_changed_gateway_does_not_stop(self):
        for proof,body in [(False,b'maintenance'),(True,b'unknown')]:
            op=self.ready_retirement();op.entry_maintenance_proven=proof;op.tx.run.return_value=body
            with patch.object(m,'check_window'),self.assertRaises(Hold):op.retire_old_slots()
            op.stop_exact.assert_not_called()

    def test_worker_stop_then_web_proof_uses_original_receipt_not_worker_exec(self):
        op=operator();op.worker.update(running=False,restartPolicy='no')
        ws={'phase':'QUIESCENT','originalOperationId':'kept-uuid'}
        op.retirement_drain={'rawWorker':ws};op.request=Mock(return_value={'drained':True})
        op.worker_control=Mock(side_effect=AssertionError('no stopped worker exec'))
        op.owners=Mock(return_value=[]);op.incidents=Mock(return_value=([],{}))
        with patch.object(ctl.c,'app_status',return_value={'liveWeb':True}),patch.object(ctl.normal,'current_drained',return_value={'passed':True}) as current:
            op.pre_retirement_drain()
        self.assertIs(current.call_args.args[2],ws);op.worker_control.assert_not_called()

    def test_pre_retirement_reference_requires_no_loopback_or_other_running_caller(self):
        op=operator();op.tx.run.side_effect=[b'3'*64+b'\n',b'']
        other=row({**op.cfg['oldWeb'],'id':'3'*64,'name':'infra'})
        other['Config']['Env']=['URL=http://127.0.0.1:13114'];op.tx.inspect.side_effect=None;op.tx.inspect.return_value=other
        with patch.multiple(ctl,OLDWEB=op.web['name'],OLDWORKER=op.worker['name']),self.assertRaisesRegex(Hold,'INTERNAL_CALLER'):
            op.pre_retirement_reference_proof('worker')
        op.tx.run.side_effect=[b'',b'ESTABLISHED']
        with self.assertRaisesRegex(Hold,'LOOPBACK'):op.pre_retirement_reference_proof('web')

    def failure(self,current):
        op=operator();op.tx.run.side_effect=None;op.tx.run.return_value=current
        op.cfg['expectedGatewayDigest']=sha(b'baseline')
        op.entry_report={'afterDumpSha256':sha(b'entry-maintenance')}
        op.emergency={'beforeDumpSha256':sha(b'candidate'),'afterDumpSha256':sha(b'candidate-maintenance')}
        op.succ['operations']['gateway-switch']={'phase':'UNKNOWN','operationId':'original-uuid','receipt':None}
        op.maintenance_http_proof=Mock(return_value={'passed':True});op.seal_candidate_ingress=Mock()
        return op

    def test_candidate_failed_or_unknown_switch_seals_503_preserves_uuid_does_not_restart_kill_or_replay(self):
        op=self.failure(b'candidate');original=copy.deepcopy(op.succ['operations'])
        op.recover_failure(Hold('CANDIDATE_FAILED'))
        op.seal_candidate_ingress.assert_called_once_with(sha(b'candidate'))
        self.assertEqual(op.succ['operations'],original)
        proof=op.tx.save.call_args.args[1]
        self.assertTrue(proof['maintenanceApplied']);self.assertFalse(proof['priorProgramResumed']);self.assertFalse(proof['tasksReplayed'])
        self.assertIn('COMPATIBILITY_AND_DRAIN',proof['restoreDecision'])
        self.assertFalse(any('stop' in c.args[0] or 'start' in c.args[0] for c in op.tx.run.call_args_list))

    def test_failed_candidate_before_cutover_keeps_existing_maintenance(self):
        op=self.failure(b'entry-maintenance');op.web.update(running=False,restartPolicy='no');op.worker.update(running=False,restartPolicy='no')
        op.recover_failure(Hold('RAM_INSUFFICIENT'))
        op.seal_candidate_ingress.assert_not_called();op.maintenance_http_proof.assert_called_once()
        self.assertTrue(op.tx.save.call_args.args[1]['maintenanceApplied'])
        self.assertFalse(op.tx.save.call_args.args[1]['oldSlotsObserved']['web']['running'])

    def test_http_failure_unknown_gateway_or_canonical_failure_never_claims_sealed_success(self):
        op=self.failure(b'entry-maintenance');op.maintenance_http_proof.side_effect=Hold('HTTP_FAILED')
        op.recover_failure(Hold('START_FAILED'))
        self.assertFalse(op.tx.save.call_args.args[1]['maintenanceApplied'])
        self.assertTrue(op.tx.save.call_args.args[1]['reconciliationRequired'])
        op=self.failure(b'unknown');op.recover_failure(Hold('FAILED'))
        op.seal_candidate_ingress.assert_not_called();self.assertTrue(op.tx.save.call_args.args[1]['reconciliationRequired'])
        op=self.failure(b'candidate');op.phase.side_effect=Hold('CANONICAL_CAS_CHANGED')
        op.recover_failure(Hold('FAILED'))
        self.assertEqual(op.succ['operations']['gateway-switch']['operationId'],'original-uuid')
        self.assertTrue(op.tx.save.call_args.args[1]['reconciliationRequired'])

    def test_native_permission_dual_cookie_validates_admin_native_and_foreign_scope(self):
        op=operator();op.newweb={'id':'3'*64};op.cfg['permissionChecks']=[next(c for c in op.cfg['permissionChecks'] if c['name']=='dual-cookie')]
        responses=[200,200,403,403,403]
        def run(args,stdin=None,**kwargs):
            query=json.loads(stdin);result={'status':responses.pop(0),'commit':op.cfg['commit']}
            if query['session']:result['user']=True
            return json.dumps(result).encode()
        op.tx.run.side_effect=run
        with patch.object(pathlib.Path,'read_text',return_value='nv_admin=real-fixture; nv_user=nonadmin-fixture'):
            op.permission_readiness()
        paths=[json.loads(c.kwargs['stdin'])['path'] for c in op.tx.run.call_args_list]
        self.assertIn('/api/auth/session',paths);self.assertEqual(paths[-1],op.cfg['permissionChecks'][0]['path'])
        self.assertTrue(op.tx.save.call_args.args[1]['enterpriseIdentityNotElevated'])

    def test_orchestration_has_no_future_ram_gate_or_stopped_old_exec_in_finalizers(self):
        source=inspect.getsource(m.NoUserController.run)
        self.assertLess(source.index('self.build_gateway()'),source.index('self.retire_old_slots()'))
        self.assertLess(source.index('self.retire_old_slots()'),source.index("self.memory_proof('before-candidate-start')"))
        self.assertLess(source.index("self.memory_proof('before-candidate-start')"),source.index("self.op('web-start'"))
        self.assertEqual(source.count('self.server_actions(self.web)'),1)
        for method in ('finish_ready','retire_ready','record_failure_controls'):
            code=inspect.getsource(getattr(m.NoUserController,method))
            self.assertNotIn('worker_control(self.worker',code);self.assertNotIn('request(self.web',code)
            self.assertNotIn('server_actions(self.web)',code);self.assertNotIn('self.stop_exact(',code)
        for method in ('persist','op','maintenance_and_import','after_retirement','install_supervisor','verify_internal_authority'):
            self.assertIs(getattr(m.NoUserController,method),getattr(m.ImagegenSimplifyController,method))


class FrozenVersionPreservation(unittest.TestCase):
    def guard(self, match=True, current=None):
        calls=[]
        def sql(q):
            calls.append(q)
            return [{'match':match}]
        guard=m.FrozenConfigurationGuard({'baselineSha256':'a'*64,'supplementalPath':'/fixture/not-written'},
            sql,Mock(),current_facts=lambda:current or [{'activeModelVersion':139}],
            expected_facts=[{'activeModelVersion':139}])
        guard.original={'generationPosts':0,'taskId':'task-fixture','model':{'version':'135','digest':'frozen-digest','config_md5':'immutable'},
            'billing':{'version':'8','config_md5':'immutable-billing'},'leases':{'pollLockPresent':False,'pollLockFuture':False,'nextPollPresent':True},'activity':[]}
        guard._predicates=Mock(return_value={'app_release_activities':"work_key='task-fixture'"})
        return guard,calls

    def test_original_immutable_versions_and_current_reviewed_config_both_bound(self):
        guard,calls=self.guard();guard._invariants()
        self.assertIn("v.version::text='135'",calls[0])
        self.assertIn("v.version::text='8'",calls[0])
        self.assertNotIn('s.active_version',calls[0])
        self.assertIn('poll_lock_until>now()',calls[0])
        self.assertIn("work_key='task-fixture'",calls[0])
        self.assertIs(m.FrozenConfigurationGuard._compare,Guard._compare)
        self.assertIs(m.FrozenConfigurationGuard.establish,Guard.establish)
        self.assertIs(m.FrozenConfigurationGuard.check,Guard.check)

    def test_deleted_or_changed_frozen_version_lease_or_activity_denies(self):
        guard,_=self.guard(match=False)
        with self.assertRaisesRegex(ValueError,'ORIGINAL_FROZEN_CONFIGURATION_OR_INVARIANT_CHANGED'):guard._invariants()

    def test_current_active_pointer_or_config_fact_change_denies(self):
        guard,_=self.guard(current=[{'activeModelVersion':140}])
        with self.assertRaisesRegex(ValueError,'CURRENT_REVIEWED_CONFIGURATION_CHANGED'):guard._invariants()

    def test_generation_declaration_not_reclassified(self):
        guard,_=self.guard();guard.original['generationPosts']=1
        with self.assertRaisesRegex(ValueError,'POST_DECLARATION_INVALID'):guard._invariants()


class DeadBootWiring(unittest.TestCase):
    def test_new_worker_explicitly_creates_and_starts_bounded_runtime_layout(self):
        source=inspect.getsource(m.NoUserController.run)
        for start,end in [('ctl.c.clone_worker(',"self.memory_proof('before-worker-start')"),
                ('ctl.c.start_worker(',"self.wait(lambda: self.worker_control(self.newworker")]:
            section=source[source.index(start):source.index(end)]
            self.assertIn('reviewed_runtime_memory=True',section)
            self.assertIn('reviewed_combined_media=True',section)

    def fixture(self):
        import release47_dead_boot_preservation as d
        op = operator()
        op.cfg['oldWorker']['startedAt'] = '2026-10-22T22:02:26Z'
        op.worker = copy.deepcopy(op.cfg['oldWorker'])
        identity = {'instanceId': op.web['name'], 'bootId': '44444444-4444-4444-8444-444444444444', 'commit': 'a'*40}
        app = {'identity': identity, 'admission': {'mode': 'draining'},
            'observations': dict(activeRequests=0, trackedRequests=0, trackedAcceptedWork=0, agentRuns=0, unknownLeases=24),
            'transport': {'verified': True, 'transport': dict(completeFromProcessStart=True,
                accountingFault=False, activeRequests=0, startedRequests=9, finishedRequests=9)}}
        def pack(value):
            raw = json.dumps(value, sort_keys=True)
            return {'id': value['id'], 'raw': raw, 'sha256': sha(raw.encode())}
        jobs = [pack(dict(id='job-'+str(i), kind='generate', lease_token='original',
            lease_until='2026-10-22T08:05:00Z')) for i in range(21)]
        activities = [pack(dict(id='activity-'+str(i), instance_id=op.web['name'], boot_id='old-dead-boot',
            state='unknown', activity_kind='accepted-work', work_scope='durable-image' if i < 21 else 'reference-sync',
            work_key='generate:job-'+str(i) if i < 21 else 'reference:'+str(i), claim_token='original',
            started_at='2026-10-22T08:00:00Z', heartbeat_at='2026-10-22T08:01:00Z')) for i in range(24)]
        review = dict(web=copy.deepcopy(op.web), identity=identity, app_release_activities=activities,
            app_image_jobs=jobs, app_imagegen_batches=[pack({'id':'batch-'+str(i)}) for i in range(2)],
            app_reference_operations=[pack({'id':'reference-'+str(i)}) for i in range(2)],
            relatedRaw='{"raw":12345678901234567890.123456789}', relatedSha256='f'*64)
        review['relatedFences']=[dict(table=table,keyColumn=key,rowKey=prefix+str(i),sha256=sha((prefix+str(i)).encode()))
            for table,key,prefix,count in [('app_billing_operations','id','billing-',15),
                ('app_gen_reservations','job_id','reservation-',15),('app_supplier_calls','id','call-',11),
                ('app_supplier_cost_jobs','key','task:cost-',2)] for i in range(count)]
        last = dict(id='55555555-5555-4555-8555-555555555555', phase='unknown',
            workerBootId='66666666-6666-4666-8666-666666666666', workerInstanceId=op.worker['name'],
            workerCommit='a'*40, targetWebInstanceId=op.web['name'],
            startedAt='2026-10-23T01:57:44.490Z', finishedAt='2026-10-23T01:57:44.500Z', error='original-unknown')
        wid = dict(instanceId=op.worker['name'], bootId=last['workerBootId'], commit='a'*40,
            origin='http://'+op.web['name']+':3000', targetInstanceId=op.web['name'])
        status = {**wid, 'paused':True, 'activeTicks':0, 'unresolvedTicks':1, 'phase':'UNKNOWN',
            'controlFault':None, 'lastTick':copy.deepcopy(last),
            'mediaWorker':dict(ok=True, version='a'*40, sandbox=True, draining=True,
                running=0, queued=0, terminal=4, maxActive=1, concurrency=1)}
        extra = [dict(table=t, rowKey=r['id'], sha256=r['sha256'])
            for t in ('app_imagegen_batches','app_reference_operations') for r in review[t]]
        pin = dict(oldWeb=copy.deepcopy(op.web), currentBoot=identity['bootId'], physicalStartedAt=op.web['startedAt'],
            environment={'NAUMI_ENVIRONMENT':'staging', 'NAUMI_STAGING_HISTORY_GUARD':'1'},
            expectedReviewSha256=d.review_sha(review), expectedActivities={r['id']:r['sha256'] for r in activities},
            expectedJobs={r['id']:r['sha256'] for r in jobs}, jobIds=[r['id'] for r in jobs], extraRows=extra,
            workerTick=dict(worker=copy.deepcopy(op.worker), physicalStartedAt=op.worker['startedAt'], identity=wid, lastTick=last))
        op.cfg['deadBootPreservation'] = pin
        receipt = dict(fencedRows=25, relatedFencedRows=43, carriedOldBootObservations=24, currentUnknown=0,
            businessRowMutations=0, paidReplays=0, reviewSha256=pin['expectedReviewSha256'])
        queries, writes = [], []
        def sql(query):
            queries.append(query)
            if "json_build_object('match'" in query: return [{'match':True}]
            return [{k:copy.deepcopy(v) for k,v in review.items() if k not in ('web','identity')}]
        def write(query):
            writes.append(query)
            return [copy.deepcopy(receipt)]
        op.dead_boot = d.Guard(pin, sql, op.tx.save, write_sql=write)
        op.dead_boot_app = Mock(return_value=app)
        op.worker_control = Mock(return_value={'state':status})
        op.request = Mock(return_value=dict(drained=True, absentTables=[], activeFences=0,
            activeTransactions=0, advisoryLocks=0,
            counts=dict(imageJobs=0,canvasImages=0,videoPolls=0,supplierCosts=0,imagegenItems=0)))
        op.incidents = Mock(return_value=([],{})); op.owners = Mock(return_value=[{'state':'idle'}])
        op.db = {'id':'d'*64}; op.de = {'POSTGRES_USER':'fixture-user','POSTGRES_DB':'fixture-db'}
        return op, app, review, status, queries, writes

    def establish(self):
        values = self.fixture(); values[0].establish_dead_boot()
        return values

    def test_exact_config_24_21_25_and_complete_worker_pin(self):
        op, *_ = self.fixture(); before = copy.deepcopy(op.cfg)
        m.validate_config(op.cfg); self.assertEqual(op.cfg, before)
        for change in ('activity', 'job', 'extra', 'hash', 'worker-boot', 'worker-start', 'tick-current-web', 'tick-missing-time'):
            cfg = copy.deepcopy(before); pin = cfg['deadBootPreservation']
            if change=='activity': pin['expectedActivities'].pop('activity-0')
            if change=='job': pin['expectedJobs'].pop('job-0')
            if change=='extra': pin['extraRows'].pop()
            if change=='hash': pin['expectedReviewSha256']='unsigned'
            if change=='worker-boot': pin['workerTick']['identity']['bootId']='77777777-7777-4777-8777-777777777777'
            if change=='worker-start': pin['workerTick']['physicalStartedAt']='2026-10-22T23:00:00Z'
            if change=='tick-current-web': pin['workerTick']['lastTick']['finishedAt']=pin['physicalStartedAt']
            if change=='tick-missing-time': pin['workerTick']['lastTick'].pop('finishedAt')
            with self.subTest(change=change), self.assertRaises(Hold): m.validate_config(cfg)

    def test_no_option_preserves_original_unknown_and_worker_policy(self):
        for value in (None, {}):
            op = operator(); op.cfg['deadBootPreservation'] = value
            m.validate_config(op.cfg)
            self.assertIsNone(op.establish_dead_boot()); self.assertIsNone(op.check_dead_boot('absent'))
            self.assertFalse(op.old_worker_quiescent(dict(paused=True,activeTicks=0,unresolvedTicks=1,phase='UNKNOWN')))
        src=inspect.getsource(m.NoUserController.run)
        self.assertIn("['observations']['unknownLeases'] == 0",src)
        self.assertIs(m.FrozenConfigurationGuard.check, Guard.check)

    def test_unknown_difference_never_subtracted_or_raw_modified(self):
        op, app, review, status, *_ = self.establish()
        original = copy.deepcopy(app)
        for unknown in (0,23,25,True):
            app['observations']['unknownLeases']=unknown
            with self.subTest(unknown=unknown), self.assertRaises(Hold): op.check_dead_boot('unknown')
        app['observations']['unknownLeases']=24
        op.check_dead_boot('exact'); self.assertEqual(app,original)

    def test_exact_row_hash_full_set_related_and_current_boot_changes_deny(self):
        for change in ('activity-hash','job-hash','related','extra-unknown','current-boot','identity'):
            op, app, review, *_ = self.establish()
            if change=='activity-hash': review['app_release_activities'][0]['sha256']='b'*64
            if change=='job-hash': review['app_image_jobs'][0]['sha256']='b'*64
            if change=='related': review['relatedSha256']='b'*64
            if change=='extra-unknown': review['app_release_activities'].append(copy.deepcopy(review['app_release_activities'][0]))
            if change=='current-boot':
                raw=json.loads(review['app_release_activities'][0]['raw']);raw['boot_id']=app['identity']['bootId']
                review['app_release_activities'][0]['raw']=json.dumps(raw)
            if change=='identity': app['identity']['bootId']='77777777-7777-4777-8777-777777777777'
            with self.subTest(change=change), self.assertRaises(Hold): op.check_dead_boot('drift')

    def test_current_web_boot_activity_denied_even_with_resigned_full_review(self):
        import release47_dead_boot_preservation as d
        op, app, review, *_ = self.fixture()
        row=review['app_release_activities'][0];value=json.loads(row['raw']);value['boot_id']=app['identity']['bootId']
        row['raw']=json.dumps(value,sort_keys=True);row['sha256']=sha(row['raw'].encode())
        pin=op.dead_boot.cfg;pin['expectedActivities'][row['id']]=row['sha256'];pin['expectedReviewSha256']=d.review_sha(review)
        with self.assertRaisesRegex(Hold,'UNREVIEWED_ACTIVITY'):op.dead_boot.establish(op.web,app)

    def test_worker_exact_last_tick_current_identity_and_physical_start(self):
        op, app, review, status, *_ = self.establish()
        self.assertTrue(op.old_worker_quiescent(status))
        for field in status['lastTick']:
            changed=copy.deepcopy(status); changed['lastTick'][field]='drift'
            with self.subTest(tick=field): self.assertFalse(op.old_worker_quiescent(changed))
        for field in op.cfg['deadBootPreservation']['workerTick']['identity']:
            changed=copy.deepcopy(status); changed[field]='drift'
            with self.subTest(identity=field): self.assertFalse(op.old_worker_quiescent(changed))
        op.tx.pin.side_effect=lambda identity: row({**identity, 'startedAt':'2026-10-23T08:00:00Z'})
        with self.assertRaisesRegex(Hold,'PHYSICAL_IDENTITY'): op.old_worker_quiescent(status)

    def test_worker_unresolved_media_active_fault_matrix(self):
        op, app, review, status, *_ = self.establish()
        for key,value in [('activeTicks',1),('activeTicks',False),('unresolvedTicks',0),('unresolvedTicks',2),
                ('unresolvedTicks',True),('paused',False),('controlFault','fault'),('controlFault',0),('phase','QUIESCENT')]:
            changed=copy.deepcopy(status);changed[key]=value
            with self.subTest(key=key,value=value): self.assertFalse(op.old_worker_quiescent(changed))
        changed=copy.deepcopy(status);changed.pop('controlFault');self.assertFalse(op.old_worker_quiescent(changed))
        for key,value in [('draining',False),('running',1),('queued',1),('ok',False),('version','b'*40)]:
            changed=copy.deepcopy(status);changed['mediaWorker'][key]=value
            with self.subTest(media=key): self.assertFalse(op.old_worker_quiescent(changed))
        changed=copy.deepcopy(status);changed.pop('mediaWorker');self.assertFalse(op.old_worker_quiescent(changed))
        status['controlFault']=False;self.assertTrue(op.old_worker_quiescent(status))

    def test_read_write_raw_sql_exact_credentials_no_transaction_wrapper(self):
        op, *_ = self.fixture()
        dbrow=row(op.web);dbrow['Config']['Env']=['POSTGRES_USER=fixture-user','POSTGRES_DB=fixture-db']
        op.tx.pin.return_value=dbrow;op.tx.pin.side_effect=None;op.tx.run.return_value=b'{"one":1}\n{"two":2}\n'
        query='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SELECT 1;COMMIT;'
        self.assertEqual(op.dead_boot_sql(query),[{'one':1},{'two':2}])
        call=op.tx.run.call_args
        self.assertEqual(call.kwargs['stdin'],query.encode())
        self.assertEqual(call.args[0],['docker','exec','-i','d'*64,'psql','-XqAt','-v','ON_ERROR_STOP=1',
            '-U','fixture-user','-d','fixture-db'])
        with self.assertRaisesRegex(Hold,'BACKUP_BEFORE'):op.dead_boot_write_sql('BEGIN;COMMIT;')
        op.succ['operations']['database-backup']={'phase':'ACKNOWLEDGED'}
        op.dead_boot_write_sql('BEGIN ISOLATION LEVEL SERIALIZABLE;COMMIT;')
        self.assertEqual(op.tx.run.call_args.kwargs['stdin'],b'BEGIN ISOLATION LEVEL SERIALIZABLE;COMMIT;')

    def test_apply_after_backup_maintenance_drain_fences_25_not_activities(self):
        op, app, review, status, queries, writes = self.establish()
        op.old_drained=False;op.worker_paused=True
        with self.assertRaisesRegex(Hold,'MAINTENANCE_AND_DRAIN'):op.apply_dead_boot_fence('fixture')
        self.assertEqual(writes,[])
        op.old_drained=True;before=copy.deepcopy(review)
        receipt=op.apply_dead_boot_fence('fixture')
        self.assertEqual(receipt['fencedRows'],25);self.assertEqual(receipt['carriedOldBootObservations'],24)
        self.assertEqual(receipt['relatedFencedRows'],43)
        self.assertEqual(writes[0].count('INSERT INTO naumi_staging_guard.origin_rows'),68)
        self.assertNotIn("VALUES('app_release_activities'",writes[0]);self.assertEqual(review,before)
        run=inspect.getsource(m.NoUserController.run);retire=inspect.getsource(m.NoUserController.retire_old_slots)
        self.assertLess(run.index("self.op('database-backup'"),run.index('self.retire_old_slots()'))
        self.assertLess(retire.index("self.op('old-web-drain'"),retire.index("self.op('dead-boot-exact-fence'"))
        self.assertLess(retire.index("self.op('dead-boot-exact-fence'"),retire.index('self.wait(self.pre_retirement_drain'))

    def test_raw_domain_items_and_jobs_must_really_zero_incidents_checked(self):
        op, app, review, status, *_ = self.establish()
        op.dead_boot.apply(op.cfg['oldWeb'],app)
        domain=op.request.return_value;before=copy.deepcopy((app,domain,status))
        with patch.object(ctl.c,'app_status',return_value=app),patch.object(ctl.policy,'check_incidents') as incidents:
            proof=op.pre_retirement_drain();incidents.assert_called()
        self.assertEqual((app,domain,status),before);self.assertEqual(proof['rawApp']['observations']['unknownLeases'],24)
        self.assertFalse(proof['scannerReceiptCompleted']);self.assertFalse(proof['historicalDrainProven'])
        for key,value in [('imageJobs',16),('imagegenItems',1)]:
            domain['counts'][key]=value
            with patch.object(ctl.c,'app_status',return_value=app),patch.object(ctl.policy,'check_incidents'),\
                    self.subTest(key=key),self.assertRaisesRegex(Hold,'DOMAIN_NOT_DRAINED'): op.pre_retirement_drain()
            domain['counts'][key]=0

    def test_final_preservation_uses_carried_http_fresh_db_and_no_stopped_exec(self):
        op, app, review, status, queries, writes = self.establish()
        op.dead_boot.apply(op.cfg['oldWeb'],app)
        op.retirement_drain={'rawApp':copy.deepcopy(app),'rawWorker':copy.deepcopy(status)}
        op.web.update(running=False,restartPolicy='no');op.worker.update(running=False,restartPolicy='no')
        del op.dead_boot_app
        original_pin=op.tx.pin.side_effect
        def pin(identity):
            value=original_pin(identity)
            value['Config']['Env']=['NAUMI_ENVIRONMENT=staging','NAUMI_STAGING_HISTORY_GUARD=1']
            return value
        op.tx.pin.side_effect=pin;op.worker_control.reset_mock()
        before=len(queries);op.check_dead_boot('final');self.assertGreater(len(queries),before)
        op.worker_control.assert_not_called()
        review['app_image_jobs'][0]['sha256']='b'*64
        with self.assertRaises(Hold):op.check_dead_boot('final-drift')
        source=inspect.getsource(m.NoUserController.retire_ready)
        self.assertLess(source.index("self.check_dead_boot('final-publication')"),source.rindex("self.phase('COMPLETE'"))

    def test_final_gate_failure_prevents_complete_and_new_worker_keeps_normal_predicates(self):
        op, *_ = self.establish()
        op.newweb={'id':'7'*64};op.newworker={'id':'8'*64}
        op.worker_control=Mock(return_value={'state':{'paused':True,'activeTicks':0,'unresolvedTicks':0,
            'phase':'QUIESCENT','lastTick':{'phase':'complete'}}})
        op.verify_retired_preservation=Mock();op.reference_proof=Mock();op.install_supervisor=Mock()
        op.after_retirement=Mock();op.verify_recovery_materials=Mock();op.check_running_slots=Mock()
        op.config_before=[];op.configuration_facts=Mock(return_value=[]);op.tx.run.return_value=b'new-entry'
        op.check_dead_boot=Mock(side_effect=Hold('FINAL_DEAD_BOOT_DRIFT'))
        with patch.object(ctl.policy,'check_incidents'), self.assertRaisesRegex(Hold,'FINAL_DEAD_BOOT_DRIFT'):
            op.retire_ready()
        self.assertFalse(any(c.args[0]=='COMPLETE' for c in op.phase.call_args_list))
        self.assertFalse(any(c.args[0]=='PUBLICATION_RECEIPT.json' for c in op.tx.save.call_args_list))

    def test_failure_both_checks_keep_original_guard_and_report_dead_boot_drift(self):
        op, *_ = self.establish();op.check_dead_boot=Mock(side_effect=Hold('EXACT_ROW_DRIFT'))
        outcome={};op.failure_preservation_check(outcome,'failure-before');op.failure_preservation_check(outcome,'failure-after')
        op.preserved_unknown.check.assert_any_call('failure-before');op.preserved_unknown.check.assert_any_call('failure-after')
        self.assertTrue(outcome['preservationHold']);self.assertTrue(outcome['reconciliationRequired'])
        self.assertEqual([e['stage'] for e in outcome['preservationErrors']],['failure-before','failure-after'])

    def test_preflight_retries_exact_collection_and_saves_establish_only_once(self):
        op, app, review, *_ = self.fixture();real=op.dead_boot.establish;attempts=[]
        def establish(web, current):
            attempts.append(True)
            if len(attempts)==1: raise Hold('DEAD_BOOT_REVIEW_HASH_CHANGED')
            return real(web,current)
        op.dead_boot.establish=Mock(side_effect=establish)
        def wait(fn,label,seconds=60):
            for _ in range(2):
                try:return fn()
                except Hold:pass
            raise Hold('WAIT_'+label)
        op.wait.side_effect=wait;op.establish_dead_boot()
        self.assertEqual(len(attempts),2)
        self.assertEqual(sum(c.args[0]=='DEAD_BOOT_REVIEW.private.json' for c in op.tx.save.call_args_list),1)

    def test_new_worker_unknown_is_never_completion_or_retirement(self):
        op, app, review, status, *_ = self.establish()
        self.assertTrue(op.old_worker_quiescent(status))
        self.assertFalse(ctl.normal.worker_quiescent(status));self.assertFalse(ctl.normal.worker_completed(status))
        current=copy.deepcopy(status);current['unresolvedTicks']=0
        self.assertFalse(ctl.normal.worker_completed(current))
        current['lastTick']['phase']='complete';self.assertTrue(ctl.normal.worker_completed(current))
        for method in ('finish_ready','retire_ready'):
            source=inspect.getsource(getattr(m.NoUserController,method))
            self.assertIn('ctl.normal.worker_completed(s)',source);self.assertNotIn('self.old_worker_quiescent(s)',source)


if __name__ == '__main__':unittest.main()

