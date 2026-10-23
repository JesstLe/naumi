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


if __name__ == '__main__':unittest.main()

