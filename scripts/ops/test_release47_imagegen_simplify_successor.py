"""Offline successor contract tests. All identities/cookies/programs are fixtures."""
import copy
import datetime as dt
import inspect
import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

import release47_imagegen_simplify_successor as m
import release47_normal_controller as ctl
from release47_host import Hold, sha
from release47_saas_successor import SaasController
from release47_video_family_successor import VideoFamilyController


def config():
    root = '/opt/naumi-staging/evidence/release47-imagegen-simplify-fixture'
    def identity(name, byte):
        return {'id': byte * 64, 'name': name, 'image': 'sha256:' + 'a' * 64,
                'running': True, 'startedAt': '2026-10-23T03:41:38Z', 'restartPolicy': 'unless-stopped'}
    cfg = {'target': '47.105.59.142', 'authorization': m.AUTHORIZATION, 'scope': list(m.SCOPE),
        'releaseId': 'release47-imagegen-simplify-fixture', 'recoveryMode': 'saas-controlled-maintenance',
        'restoreDatabase': False, 'replayAcceptedTasks': False, 'activateDisabledModels': False,
        'date': '2026-10-23', 'expectedRevision': 743, 'expectedCanonicalDigest': 'b' * 64,
        'expectedCanonicalFileSha256': 'c' * 64, 'expectedGatewayDigest': 'd' * 64,
        'predecessorReleaseId': 'release47-saas-fixture-prior', 'previousNormalReleaseId': 'release47-saas-fixture-prior',
        'evidenceRoot': root, 'stateDir': '/opt/naumi-staging/releases/release47-imagegen-simplify-fixture',
        'oldWebStateDir': '/opt/naumi-staging/releases/fixture-prior/web', 'cookiePath': root + '/admin.cookie',
        'oldWeb': identity('naumi47-web-fixture-prior', '1'), 'oldWorker': identity('naumi47-worker-fixture-prior', '2'),
        'newWebName': 'naumi47-web-imagegen-fixture', 'newWorkerName': 'naumi47-worker-video-family-imagegen-fixture',
        'oldPort': 13114, 'newPort': 13115, 'commit': 'b' * 40, 'image': 'sha256:' + 'b' * 64, 'version': '1792719999',
        'imageArchive': root + '/image.tar', 'imageArchiveSha256': 'e' * 64, 'expectedConfigurationFacts': [{'fixture': True}],
        'webMemoryMiB': 3072, 'webFinalMemoryMiB': 3072, 'workerMemoryMiB': 1024, 'reviewedCombinedMedia': True,
        'memoryReview': {'reviewed': True, 'observedWebOomMiB': 2048, 'rationale': 'FIXTURE post-OOM review, not a production choice',
            'webMinMiB': 2560, 'webMaxMiB': 4096, 'webPeakMiB': 3072, 'workerPeakMiB': 1024,
            'hostReserveMiB': 1024, 'predecessorWebMiB': 2048, 'predecessorWorkerMiB': 1024},
        'combinedMedia': {'workerName': 'naumi47-worker-video-family-imagegen-fixture',
            'secret': 'synthetic-fixture-secret-' * 3, 'scratchSource': '/opt/naumi-staging/data/video-media-jobs'},
        'videoReferencePublicOrigin': 'https://47.105.59.142',
        'storageAcceptanceScript': root + '/tools/storage.cjs', 'storageAcceptanceSha256': 'f' * 64,
        'mediaProbePath': '/data/isolated-provider-probes/provider-video-probe-20261023/fixture.mp4', 'mediaProbeSha256': 'f' * 64,
        'imageAcceptanceOperations': ['11111111-1111-4111-8111-111111111111'],
        'preservedUnknown': {'baselinePath': m.CASE05_BASELINE, 'baselineSha256': m.CASE05_SHA256, 'allowedAdditiveColumns': {}},
        'permissionChecks': []}
    for key in ('localAcceptance', 'recoveryIngressAudit', 'predecessorRecoveryReview'):
        cfg[key] = {'path': root + '/' + key + '.json', 'sha256': 'a' * 64}
    for name in sorted(m.PERMISSION_CASES):
        admin = name in ('anonymous-admin', 'platform-admin', 'dual-cookie')
        cfg['permissionChecks'].append({'name': name, 'path': '/api/admin/tenants' if admin else '/api/enterprise/saas-overview?tenantId=11111111-1111-4111-8111-111111111111',
            'status': 200 if name in ('platform-admin', 'tenant-owner') else 403,
            'cookiePath': None if name == 'anonymous-admin' else root + '/' + name + '.cookie'})
    return cfg


def state(cfg):
    rid = cfg['predecessorReleaseId']
    return {'target': cfg['target'], 'revision': 743, 'phase': 'MIGRATED_CLEANUP_PENDING', 'legacyDrainProven': False,
        'operations': {}, 'blueGreenSuccessor': {'releaseId': 'release47-alldev-20261018', 'phase': 'COMPLETE'},
        'runtimeRecovery': {'phase': 'ACKNOWLEDGED', 'successorReleaseId': rid}, 'activeNormalBlueGreenReleaseId': rid,
        'normalBlueGreenReleases': {rid: {'releaseId': rid, 'phase': 'COMPLETE', 'operations': {},
            'web': cfg['oldWeb'], 'worker': cfg['oldWorker'], 'retired': ['older-web', 'older-worker']},
            'release47-capacity-fixture': {'phase': 'COMPLETE', 'operations': {'capacity': {'phase': 'ACKNOWLEDGED'}}, 'retired': []}}}


class SuccessorContract(unittest.TestCase):
    def test_prepare_config_requires_fresh_slots_and_never_reuses_old_authorization(self):
        cfg = config(); baseline = copy.deepcopy(cfg)
        baseline.update(authorization='old authorization', releaseId='old-release', resumeReview={'revision': 1})
        baseline['oldWeb']['id'] = 'f' * 64
        before = copy.deepcopy((baseline, cfg))
        prepared = m.prepare_config(baseline, cfg, cfg)
        self.assertEqual(prepared['oldWeb'], cfg['oldWeb'])
        self.assertEqual(prepared['authorization'], m.AUTHORIZATION)
        self.assertNotIn('resumeReview', prepared)
        self.assertEqual((baseline, cfg), before)

    def test_prepare_config_missing_live_pin_never_infers_old_publication_slots(self):
        cfg = config(); live = copy.deepcopy(cfg); del live['oldWeb']
        with self.assertRaisesRegex(Hold, 'FRESH_LIVE'): m.prepare_config(cfg, live, cfg)

    def test_config_uses_current_authorization_without_rewriting_old_policy(self):
        cfg = config()
        before = copy.deepcopy(cfg)
        m.validate_config(cfg)
        self.assertEqual(cfg, before)
        self.assertNotEqual(m.AUTHORIZATION, __import__('release47_saas_successor').AUTHORIZATION)
        with patch.object(ctl.pathlib, 'Path', pathlib.PurePosixPath), self.assertRaisesRegex(Hold, 'REVIEWED_WEB_MEMORY'):
            ctl.configure(cfg)  # Old gate stays unchanged; new configure does not disguise 3GiB as 1.5GiB.
        with patch.multiple(ctl, ROOT=None, WEB=None, WORKER=None, OLDWEB=None, OLDWORKER=None, STATE=None, COOKIE=None, RELEASE=None):
            m.configure(cfg)
            self.assertEqual(ctl.WEB, cfg['newWebName'])
            self.assertEqual(ctl.RELEASE, cfg['releaseId'])

    def test_unrelated_target_scope_old_authorization_or_exceptions_fail_closed(self):
        for key, value in [('target', '103.30.76.93'), ('authorization', '合并分支，上线服务器'),
                ('scope', ['47-only']), ('recoveryMode', 'old-program'), ('restoreDatabase', True),
                ('replayAcceptedTasks', True), ('activateDisabledModels', True), ('resumeReview', {'revision': 743}),
                ('preservedWorkerTick', {'id': 'unknown'}), ('expectedCanonicalFileSha256', ''),
                ('commit', 'main'), ('preservedUnknown', {}), ('reviewedCombinedMedia', False)]:
            with self.subTest(key=key), self.assertRaises(Hold):
                m.validate_config({**config(), key: value})

    def test_ram_is_explicit_reviewed_post_oom_range_not_old_growth(self):
        for key, value in [('webMemoryMiB', 2048), ('webMemoryMiB', True), ('webFinalMemoryMiB', 4096), ('workerMemoryMiB', 128)]:
            with self.subTest(key=key), self.assertRaises(Hold):
                m.validate_config({**config(), key: value})
        for key, value in [('hostReserveMiB', 512), ('webPeakMiB', 2048), ('reviewed', False), ('observedWebOomMiB', 0)]:
            cfg = config(); cfg['memoryReview'][key] = value
            with self.subTest(key=key), self.assertRaises(Hold): m.validate_config(cfg)
        cfg = config(); cfg.update(webMemoryMiB=3584, webFinalMemoryMiB=3584); cfg['memoryReview']['webPeakMiB'] = 4096
        m.validate_config(cfg)

    def test_memory_uses_memavailable_no_swap_no_old_retirement_credit(self):
        cfg = config()
        self.assertTrue(m.ram_budget(5120 * m.MIB, 0, cfg)['passed'])
        self.assertFalse(m.ram_budget(5120 * m.MIB - 1, 0, cfg)['passed'])
        proof = m.ram_budget(3355284 * 1024, 0, cfg)
        self.assertFalse(proof['passed']); self.assertEqual(proof['requiredAvailableMiB'], 5120)
        self.assertEqual(proof['oldAnonymousCreditMiB'], 0); self.assertFalse(proof['swapIncluded'])
        self.assertTrue(m.ram_budget(4096 * m.MIB, 1024 * m.MIB, cfg)['passed'])
        for available in (True, -1, '5120'):
            with self.assertRaises(Hold): m.ram_budget(available, 0, cfg)

    def test_fresh_begin_keeps_original_authorization_and_entire_history(self):
        cfg = config(); s = state(cfg); cfg['expectedCanonicalDigest'] = sha(m.recovery.encoded(s))
        before = copy.deepcopy(s)
        result = m.begin(s, cfg, {'path': cfg['evidenceRoot'] + '/original.json', 'sha256': cfg['expectedCanonicalDigest']}, 'f' * 64,
                         dt.datetime(2026, 10, 23, tzinfo=dt.timezone.utc))
        self.assertEqual(s, before); self.assertEqual(result['authorization'], '批准，然后合并并上线')
        self.assertEqual(result['scope'], m.SCOPE); self.assertFalse(result['historicalDrainReclassified'])

    def test_begin_refuses_unknown_in_capacity_journal_and_every_old_operation(self):
        for change in ('unknown-capacity', 'pending-release', 'duplicate', 'active', 'legacy', 'root-unknown'):
            cfg = config(); s = state(cfg)
            if change == 'unknown-capacity': s['normalBlueGreenReleases']['release47-capacity-fixture']['operations']['capacity']['phase'] = 'UNKNOWN'
            if change == 'pending-release': s['normalBlueGreenReleases']['pending'] = {'phase': 'RECOVERY_REQUIRED', 'operations': {}}
            if change == 'duplicate': s['normalBlueGreenReleases'][cfg['releaseId']] = {'phase': 'COMPLETE'}
            if change == 'active': s['activeNormalBlueGreenReleaseId'] = 'other'
            if change == 'legacy': s['legacyDrainProven'] = True
            if change == 'root-unknown': s['operations']['old'] = {'phase': 'UNKNOWN'}
            cfg['expectedCanonicalDigest'] = sha(m.recovery.encoded(s))
            with self.subTest(change=change), self.assertRaises(Hold):
                m.begin(s, cfg, {'path': cfg['evidenceRoot'] + '/original.json', 'sha256': cfg['expectedCanonicalDigest']}, 'f' * 64,
                        dt.datetime(2026, 10, 23, tzinfo=dt.timezone.utc))

    def test_case05_task_preservation_agent_drain_and_recovery_not_overridden(self):
        for method in ('drain_proof', 'finish_ready', 'retire_ready', 'op', 'persist', 'build_gateway',
                       'recover_failure', 'seal_candidate_ingress', 'media_worker', 'verify_internal_authority'):
            self.assertIs(getattr(m.ImagegenSimplifyController, method), getattr(SaasController, method))
        self.assertIsNot(m.ImagegenSimplifyController.after_retirement, VideoFamilyController.after_retirement)
        source = inspect.getsource(m.ImagegenSimplifyController.run)
        self.assertLess(source.index('preserved_unknown.establish()'), source.index("self.op('database-backup'"))
        self.assertLess(source.index("self.op('database-backup'"), source.index('self.maintenance_and_import()'))
        self.assertLess(source.index('tasks.collect_task_snapshot'), source.index("self.op('web-create'"))
        self.assertIn('self.finish_ready()', source)
        self.assertNotIn('tasks.compare_task_snapshots =', inspect.getsource(m))

    def test_permissions_cannot_be_replaced_with_health_endpoint_or_missing_case(self):
        cfg = config(); cfg['permissionChecks'].pop()
        with self.assertRaises(Hold): m.validate_config(cfg)
        cfg = config(); cfg['permissionChecks'][0]['path'] = '/api/health'
        with self.assertRaises(Hold): m.validate_config(cfg)
        cfg = config(); cfg['permissionChecks'][0]['status'] = 200
        with self.assertRaises(Hold): m.validate_config(cfg)

    def test_exact_quote_rows_survive_additive_table_but_mutation_or_loss_blocks(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        table = 'app_imagegen_quotes'
        op.tx = Mock(); op.quote_before = {table: {'exists': True, 'rows': {'quote-original': 'old-hash'}}}
        op.quote_snapshot = Mock(return_value={table: {'exists': True, 'rows': {'quote-original': 'old-hash', 'new-preview': 'new'}}})
        op.check_quotes('READY')
        for after in ({'exists': True, 'rows': {}}, {'exists': True, 'rows': {'quote-original': 'changed'}}, {'exists': False, 'rows': {}}):
            op.quote_snapshot.return_value = {table: after}
            with self.assertRaisesRegex(Hold, 'FROZEN_QUOTE'): op.check_quotes('HOLD')
        op.quote_before = {table: {'exists': False, 'rows': {}}}
        op.check_quotes('FAILURE_BEFORE_DDL')

    def test_both_quote_tables_are_frozen_and_absence_is_not_inferred(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.cfg = config(); op.tx = Mock()
        op.sql = Mock(side_effect=[[{'exists': False}], [{'exists': True}], [{'count': 1, 'rows': {'billing-id': 'billing-hash'}}]])
        before = op.quote_snapshot()
        self.assertFalse(before['app_imagegen_quotes']['exists'])
        self.assertEqual(before['app_image_billing_quotes']['rows'], {'billing-id': 'billing-hash'})
        op.quote_before = before; op.quote_snapshot = Mock(return_value=copy.deepcopy(before))
        op.check_quotes('BEFORE_DDL')
        op.quote_snapshot.return_value['app_image_billing_quotes']['rows']['billing-id'] = 'changed'
        with self.assertRaisesRegex(Hold, 'app_image_billing_quotes'): op.check_quotes('HOLD')

    def test_quote_schema_checks_both_tables_keys_indexes_and_not_null(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.tx = Mock()
        good_keys = dict(primary=True, ownerForeignKey=True, ownerIndex=True, expiryIndex=True)
        responses = []
        for columns in m.QUOTE_TABLES.values():
            responses += [{'columns': columns, 'allNotNull': True}, good_keys]
        op.sql = Mock(side_effect=[[row] for row in responses])
        op.quote_schema_proof('READY')
        proof = op.tx.save.call_args.args[1]
        self.assertEqual(set(proof['tables']), set(m.QUOTE_TABLES))
        bad = copy.deepcopy(responses); bad[-1]['expiryIndex'] = False
        op.sql = Mock(side_effect=[[row] for row in bad])
        with self.assertRaisesRegex(Hold, 'KEYS_OR_INDEXES'): op.quote_schema_proof('HOLD')

    def test_ram_hold_prevents_backup_candidate_and_canonical_writes(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.cfg = config(); op.tx = Mock(); op.preserved_unknown = Mock()
        op.quote_snapshot = Mock(return_value={table: {'exists': False, 'rows': {}} for table in m.QUOTE_TABLES})
        op.op = Mock(); op.persist = Mock()
        with patch.object(m, 'mem_available', return_value=3355284 * 1024), self.assertRaisesRegex(Hold, 'DUAL_SLOT_MEMORY'):
            op.run()
        op.op.assert_not_called(); op.persist.assert_not_called()
        op.preserved_unknown.establish.assert_called_once()

    def test_quote_schema_requires_backup_before_any_ddl_and_has_no_replay(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.succ = {'operations': {}}; op.tx = Mock()
        with self.assertRaisesRegex(Hold, 'READABLE_BACKUP'): op.install_quote_schema()
        op.tx.run.assert_not_called()
        self.assertIn('SET LOCAL lock_timeout', m.QUOTE_DDL)
        for forbidden in ('DROP ', 'DELETE ', 'UPDATE ', 'INSERT ', 'ALTER '): self.assertNotIn(forbidden, m.QUOTE_DDL)
        product = (pathlib.Path(__file__).parents[2] / 'src/lib/imagegen/quotes.ts').read_text(encoding='utf-8')
        self.assertIn('CREATE TABLE IF NOT EXISTS app_imagegen_quotes(', product)
        self.assertIn('app_imagegen_quotes_owner ON app_imagegen_quotes(owner,operation_id)', product)
        self.assertIn('app_imagegen_quotes_expiry ON app_imagegen_quotes(expires_at)', product)
        self.assertIn('CREATE TABLE IF NOT EXISTS app_image_billing_quotes(', m.QUOTE_DDL)
        self.assertIn('app_image_billing_quotes_expiry ON app_image_billing_quotes(expires_at)', m.QUOTE_DDL)

    def test_rollback_never_claims_prior_saas_compatible_from_ancestry(self):
        with self.assertRaisesRegex(Hold, 'NOT_PROVEN_COMPATIBLE'): m.rollback_proof_check(config())
        cfg = config(); cfg['rollbackCompatibility'] = {'path': cfg['evidenceRoot'] + '/rollback.json', 'sha256': 'a' * 64}
        proof = {'kind': 'isolated-prior-saas-program-compatibility', 'evidenceMode': 'isolated', 'target': cfg['target'],
                 'priorImage': cfg['oldWeb']['image'], 'candidateCommit': cfg['commit'], 'candidateImage': cfg['image'],
                 **{k: True for k in ('permissionParityPassed', 'additiveSchemaCompatible', 'frozenQuoteContractsCompatible', 'originalUnknownPreserved', 'noAcceptedTaskReplay')}}
        with patch.object(m, 'pinned_json', return_value=proof):
            result = m.rollback_proof_check(cfg)
            self.assertFalse(result['automaticPriorProgramRollbackEnabled'])
            self.assertTrue(result['liveDrainedContractGateStillRequired'])
            proof['frozenQuoteContractsCompatible'] = False
            with self.assertRaises(Hold): m.rollback_proof_check(cfg)

    def test_failure_retains_quote_and_case05_hold_without_worker_resume(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.preserved_unknown = Mock(); op.check_quotes = Mock(side_effect=Hold('FROZEN_QUOTE_ROW_CHANGED_OR_MISSING'))
        outcome = {}
        op.failure_preservation_check(outcome, 'failure-before')
        self.assertTrue(outcome['preservationHold']); self.assertTrue(outcome['reconciliationRequired'])
        op.preserved_unknown.check.assert_called_once_with('failure-before')

    def test_main_validation_fails_before_transaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / 'bad.json'; path.write_text('{}', encoding='utf-8')
            with patch.object(ctl, 'transaction') as transaction, self.assertRaises(Hold): m.main(path)
            transaction.assert_not_called()

    def test_ready_calls_real_saas_video_image_readiness_and_permissions(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.check_quotes = Mock(); op.permission_readiness = Mock(); op.quote_schema_proof = Mock()
        with patch.object(SaasController, 'ready', return_value={'realStorageChecked': True}) as ready:
            self.assertTrue(op.ready()['realStorageChecked'])
            ready.assert_called_once(); op.permission_readiness.assert_called_once()

    def test_supervisor_rebind_supersedes_current_managed_closure_not_old_r1(self):
        op = m.ImagegenSimplifyController.__new__(m.ImagegenSimplifyController)
        op.runtime = {'controlledMaintenanceReport': {'path': 'latest-capacity/report.json', 'sha256': 'latest'}}
        op.state = {'runtimeRecovery': {}}; op.after_dump = 'fresh-full-dump'; op.persist = Mock()
        with patch.object(SaasController, 'install_supervisor'), patch.object(m, 'file_sha', return_value='new'), patch.object(ctl, 'ROOT', pathlib.Path('/fixture')):
            op.install_supervisor()
        report = op.state['runtimeRecovery']['controlledMaintenanceReport']
        self.assertEqual(report['supersedes'], op.runtime['controlledMaintenanceReport'])
        self.assertEqual(report['gatewayDumpSha256'], sha(b'fresh-full-dump'))
        self.assertFalse(report['compatibleBusinessRollback'])

    def test_predecessor_binds_latest_capacity_managed_closure_and_exact_file_cas(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); cfg = config(); s = state(cfg)
            canon = root / 'current.json'; manifest_path = root / 'supervisor-manifest.json'; report_path = root / 'latest-capacity-report.json'
            report_path.write_text(json.dumps({'beforeDumpSha256': cfg['expectedGatewayDigest']}), encoding='utf-8')
            manifest = {'gatewayDumpSha256': cfg['expectedGatewayDigest'], 'image': cfg['oldWeb']['image'],
                'commit': 'a' * 40, 'buildVersion': '1792705393',
                'web': {'id': cfg['oldWeb']['id'], 'staticSha256': 'pin'},
                'worker': {'id': cfg['oldWorker']['id'], 'staticSha256': 'pin'}}
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
            managed = {'path': str(report_path), 'sha256': m.file_sha(report_path), 'gatewayDumpSha256': cfg['expectedGatewayDigest']}
            s['runtimeRecovery'].update(manifestPath=str(manifest_path), controlledMaintenanceReport=managed)
            canon.write_text(json.dumps(s), encoding='utf-8'); cfg['expectedCanonicalFileSha256'] = m.file_sha(canon)
            review = {'kind': 'current-saas-recovery-review', 'evidenceMode': 'live', 'target': cfg['target'],
                'releaseId': cfg['predecessorReleaseId'], 'canonicalFileSha256': cfg['expectedCanonicalFileSha256'],
                'manifestPath': str(manifest_path), 'manifestSha256': m.file_sha(manifest_path),
                'gatewayDumpSha256': cfg['expectedGatewayDigest'], 'maintenanceReport': managed,
                'priorCommit': manifest['commit'], 'priorBuildVersion': manifest['buildVersion']}
            tx = Mock(); tx.inspect.return_value = {'State': {'Running': False}, 'HostConfig': {'RestartPolicy': {'Name': 'no'}}}
            tx.pin.side_effect = lambda pin: {'State': {'Running': True},
                'HostConfig': {'Memory': (2048 if pin['id'] == cfg['oldWeb']['id'] else 1024) * m.MIB},
                'Config': {'Env': ['SOURCE_COMMIT=' + manifest['commit'], 'BUILD_VERSION=' + manifest['buildVersion']]}}
            with patch.object(ctl, 'CANON', canon), patch.object(m, 'begin'), patch.object(m, 'pinned_json', return_value=review), \
                    patch.object(m.recovery, 'recovery_binding'), patch.object(m.recovery, 'static_pin', return_value='pin'):
                proof = m.predecessor_proof(tx, s, cfg)
                self.assertEqual(proof['maintenanceReport'], managed)
                review['maintenanceReport'] = {'path': str(root / 'old-r1.json'), 'sha256': 'old'}
                with self.assertRaisesRegex(Hold, 'LATEST_MANAGED_MAINTENANCE_POINTER'): m.predecessor_proof(tx, s, cfg)
                canon.write_text('{}', encoding='utf-8')
                with self.assertRaisesRegex(Hold, 'FILE_CAS'): m.predecessor_proof(tx, s, cfg)

    def test_lifecycle_exposes_new_action_without_redirecting_old_saas(self):
        import release_lifecycle
        with patch.object(release_lifecycle, 'os', SimpleNamespace(name='posix')), patch.object(m, 'main') as publish:
            self.assertEqual(release_lifecycle.main(['publish47-imagegen-simplify', '--config', 'fixture.json']), 0)
            publish.assert_called_once_with(pathlib.Path('fixture.json'))


if __name__ == '__main__': unittest.main()
