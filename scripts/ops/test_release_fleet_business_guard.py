"""Finite HostTransaction/psql fixtures only; no Docker, host or live DB claim."""
import copy
import json
import unittest
from unittest.mock import Mock, patch

import release_fleet_business_guard as guard
import release103_refactor as refactor
import release103_staged as staged
import release103_mapping as mapping
import release_site_control as shared
import release_legacy_ui_retirement as legacy
import release_runtime_ui_retirement as runtime
from release47_host import Hold, public_identity, sha


def database_row():
    return {'Id': 'd' * 64, 'Name': '/fleet-guard-fixture-db',
            'Image': 'sha256:' + 'e' * 64,
            'State': {'Running': True, 'StartedAt': '2026-11-05T00:00:00Z'},
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}},
            'Config': {'Env': ['POSTGRES_USER=fixture', 'POSTGRES_DB=fleet_guard_fixture']}}


def psql_output(count=0, **changed):
    value = {'database': 'fleet_guard_fixture', 'readOnly': 'on', 'isolation': 'repeatable read',
             'schema': 'public', 'table': 'app_fleet_commands', 'businessRows': count}
    value.update(changed)
    return (json.dumps(value) + '\n').encode()


class FiniteTx:
    target = '103.30.76.93'

    def __init__(self, output=None):
        self.database = database_row()
        self.output = psql_output() if output is None else output
        self.commands, self.pins = [], []

    def pin(self, identity):
        self.pins.append(copy.deepcopy(identity))
        if identity != public_identity(self.database):
            raise Hold('FINITE_DB_IDENTITY_CHANGED')
        return copy.deepcopy(self.database)

    def run(self, argv, **kwargs):
        self.commands.append((argv, kwargs))
        if argv == ['nginx', '-T']:
            return b'original gateway'
        if 'psql' not in argv:
            raise AssertionError('Unexpected finite-fixture command')
        if isinstance(self.output, BaseException):
            raise self.output
        return self.output


def attach_database(tx, count):
    """Extend an existing finite retirement fixture with actual guard fake I/O."""
    database = database_row()
    tx.target = '103.30.76.93'
    original_run = tx.run
    tx.pin = lambda identity: copy.deepcopy(database) if identity == public_identity(database) else None

    def run(argv, **kwargs):
        if 'psql' in argv:
            tx.commands.append(argv)
            return psql_output(count)
        return original_run(argv, **kwargs)
    tx.run = run
    return public_identity(database)


class ReadOnlyGuardTests(unittest.TestCase):
    def check(self, tx, **kwargs):
        return guard.assert_legacy_fleet_rollback_clear(tx, public_identity(tx.database), **kwargs)

    def test_zero_rows_runs_pinned_read_only_psql_without_any_host_mutation(self):
        tx = FiniteTx()
        result = self.check(tx)
        self.assertEqual(tx.pins, [public_identity(tx.database)])
        argv, options = tx.commands[0]
        self.assertEqual(argv[:5], ['docker', 'exec', '-i', tx.database['Id'], 'psql'])
        self.assertIn('--no-password', argv); self.assertIn('ON_ERROR_STOP=1', argv)
        self.assertEqual(options['stdin'], guard.LEGACY_FLEET_BUSINESS_SQL)
        self.assertEqual(options['timeout'], 25)
        self.assertEqual(result['businessRows'], 0)
        self.assertFalse(result['externalProducersFrozen'] or result['liveCutbackExecuted'])

    def test_every_retained_state_blocks_and_sql_has_no_state_filter(self):
        sql = guard.LEGACY_FLEET_BUSINESS_SQL.decode()
        self.assertIn('REPEATABLE READ READ ONLY', sql)
        self.assertIn('FROM "public"."app_fleet_commands"', sql)
        self.assertIn("WHERE operation->>'type'='business.query'", sql)
        self.assertNotIn('state IN', sql); self.assertNotIn('DELETE', sql); self.assertNotIn('UPDATE', sql)
        for state in ('queued', 'leased', 'succeeded', 'failed', 'blocked'):
            with self.subTest(state=state):
                with self.assertRaisesRegex(Hold, 'ROWS_BLOCK_LEGACY'):
                    self.check(FiniteTx(psql_output(1)))

    def test_timeout_missing_table_and_transport_errors_never_become_zero(self):
        for error in (TimeoutError('finite timeout'), RuntimeError('finite missing relation'), ValueError('finite transport')):
            with self.subTest(error=type(error).__name__):
                with self.assertRaisesRegex(Hold, '^FLEET_LEGACY_ROLLBACK_STATE_UNVERIFIED$'):
                    self.check(FiniteTx(error))

    def test_unknown_output_and_metadata_fail_closed(self):
        invalid = [b'', b'null\n', b'[]\n', b'{}\n', b'not-json\n', b'\xff',
                   psql_output() + psql_output(), psql_output() + b'NOTICE\n', b' ' * 4097,
                   psql_output(-1), psql_output(True), psql_output(0.0), psql_output('0'),
                   psql_output(9223372036854775808), psql_output(database='other'),
                   psql_output(readOnly='off'), psql_output(isolation='read committed'),
                   psql_output(schema='other'), psql_output(table='other'),
                   psql_output(extra=True),
                   psql_output().replace(b'"businessRows": 0', b'"businessRows": 0, "businessRows": 0')]
        for raw in invalid:
            with self.subTest(raw=raw[:80]):
                with self.assertRaisesRegex(Hold, 'STATE_UNVERIFIED'):
                    self.check(FiniteTx(raw))

    def test_database_pin_and_context_are_not_caller_supplied_clear_flags(self):
        tx = FiniteTx(); changed = public_identity(tx.database); changed['startedAt'] = 'other'
        with self.assertRaises(Hold): guard.assert_legacy_fleet_rollback_clear(tx, changed)
        self.assertEqual(tx.commands, [])
        tx = FiniteTx(); tx.database['Config']['Env'] = []
        with self.assertRaises(Hold): self.check(tx)
        self.assertEqual(tx.commands, [])
        tx = FiniteTx(); tx.target = '47.105.59.142'
        with self.assertRaises(Hold): self.check(tx)
        self.assertEqual(tx.commands, [])

    def test_schema_binding_rejects_injection_and_exports_real_pg_sql(self):
        for schema in ('', 'public;DROP SCHEMA public', 'other.schema', "public'", None):
            with self.subTest(schema=schema):
                with self.assertRaises(Hold): guard.legacy_fleet_business_sql(schema)
        sql = guard.legacy_fleet_business_sql('fleet_guard_isolated').decode()
        self.assertIn('FROM "fleet_guard_isolated"."app_fleet_commands"', sql)


class RollbackEntryTests(unittest.TestCase):
    def fixture(self, cls, output=None):
        release = cls.__new__(cls)
        release.tx = FiniteTx(psql_output(1) if output is None else output)
        release.db = release.tx.database
        release.switched = False; release.worker_paused = True
        release.old = {'worker': {'Id': 'w' * 64}}
        release.new = {}; release.record = {'operations': {}}
        release.c = {'target': '103.30.76.93', 'nginxSha256': sha(b'original gateway')}
        release.worker = Mock(); release.op = Mock(); release.phase = Mock()
        return release

    def test_refactor_blocks_before_new_drain_old_start_policy_route_or_resume(self):
        for output in (psql_output(1), RuntimeError('finite unavailable')):
            release = self.fixture(refactor.Release, output)
            release.new = {'would-drain': None}; release.switched = True
            with patch.object(refactor.controls, 'control_app') as control:
                with self.assertRaises(Hold): release.rollback()
            control.assert_not_called(); release.worker.assert_not_called()
            self.assertTrue(all('psql' in argv for argv, _ in release.tx.commands))

    def test_direct_inverse_gateway_is_guarded_before_gateway_writes(self):
        release = self.fixture(refactor.Release)
        with patch.object(refactor.controls, 'switch_gateway_bundle') as switch:
            with self.assertRaisesRegex(Hold, 'ROWS_BLOCK_LEGACY'): release.gateway(False)
        switch.assert_not_called()

    def test_staged_blocks_before_old_restart_or_inverse_route(self):
        release = self.fixture(staged.Release)
        release.retired = [None]; release.switched = True
        with patch.object(staged.controls, 'switch_gateway_bundle') as switch:
            with self.assertRaisesRegex(Hold, 'ROWS_BLOCK_LEGACY'): release.rollback()
        switch.assert_not_called()
        self.assertTrue(all('psql' in argv for argv, _ in release.tx.commands))

    def test_mapping_and_shared_pre_switch_do_not_resume_on_retained_or_unknown(self):
        for cls in (mapping.Release, shared.Release):
            for output in (psql_output(1), TimeoutError('finite timeout')):
                with self.subTest(cls=cls.__module__, output=type(output).__name__):
                    release = self.fixture(cls, output)
                    with self.assertRaises(Hold): release.rollback()
                    release.worker.assert_not_called(); release.op.assert_not_called()

    def test_mapping_clear_resumes_only_existing_pre_switch_path(self):
        release = self.fixture(mapping.Release, psql_output())
        release.rollback()
        self.assertEqual(release.op.call_args.args[0], 'resume-original-worker')
        self.assertEqual(len([argv for argv, _ in release.tx.commands if 'psql' in argv]), 1)

    def test_shared_47_semantics_and_post_switch_no_cutback_remain(self):
        release = self.fixture(shared.Release)
        release.c['target'] = '47.105.59.142'; del release.db
        release.rollback(); release.worker.assert_called_once_with(release.old['worker'], 'resume')
        self.assertFalse(any('psql' in argv for argv, _ in release.tx.commands))
        for cls in (mapping.Release, shared.Release):
            release = self.fixture(cls); release.switched = True
            release.rollback(); release.worker.assert_not_called(); release.op.assert_not_called()

    def test_authorized_retirement_preserves_original_failure_without_restore_start(self):
        import test_release103_authorized_ui_retirement as existing
        fixture = existing.Tests('test_stop_minimum_and_preserve'); fixture.setUp()
        fixture.tx.business_rows = 1
        calls = 0
        def health(*_):
            nonlocal calls
            calls += 1
            if calls == 3: raise RuntimeError('Original finite health failure')
            return []
        with self.assertRaisesRegex(RuntimeError, 'Original finite health failure'):
            fixture.execute(health=health)
        self.assertFalse(any(argv[1] == 'start' for argv in fixture.tx.commands))
        self.assertEqual(fixture.tx.saved['CAPACITY_RECOVERY.json']['rows'][0]['status'], 'RECOVERY_REQUIRES_RECONCILIATION')
        self.assertFalse(any(name.startswith('restore-intent-') for name in fixture.tx.saved))

    def test_both_historical_restore_libraries_require_db_and_block_retained(self):
        import test_release_legacy_ui_retirement as legacy_existing
        import test_release_runtime_ui_retirement as runtime_existing
        for module, case_class, manifest_name in ((legacy, legacy_existing.Fixture, 'manifest'),
                                                   (runtime, runtime_existing.RuntimeFixture, 'm')):
            with self.subTest(module=module.__name__):
                fixture = case_class(); fixture.setUp(); self.addCleanup(fixture.tearDown)
                tx = fixture.tx(); manifest = getattr(fixture, manifest_name)
                intent = {'bindingHashFormat': legacy.BINDING_HASH_FORMAT}
                with patch.object(module, 'require_lock'):
                    with self.assertRaisesRegex(legacy.RetirementHold, 'DATABASE_IDENTITY_REQUIRED'):
                        module.restore_one(tx, manifest, intent, lambda *_: {}, required_available_mib=1024)
                    identity = attach_database(tx, 1)
                    with self.assertRaisesRegex(legacy.RetirementHold, 'BLOCKED_OR_UNVERIFIED'):
                        module.restore_one(tx, manifest, intent, lambda *_: {}, required_available_mib=1024,
                                           database_identity=identity)
                self.assertFalse(any(argv[:2] in (['docker', 'start'], ['docker', 'update']) for argv in tx.commands))

    def test_runtime_restore_zero_state_uses_real_guard_then_preserves_original_policy(self):
        import test_release_runtime_ui_retirement as existing
        fixture = existing.RuntimeFixture(); fixture.setUp(); self.addCleanup(fixture.tearDown)
        tx = fixture.tx(); fixture.retire(tx)
        intent = json.loads((fixture.root / runtime.journal_name(fixture.m, 'intent')).read_text())
        identity = attach_database(tx, 0)
        probe = lambda *_: {'health': True, 'staticHashVerified': True,
                            'version': fixture.m['expectedVersion'], 'commit': fixture.m['expectedCommit']}
        with patch.object(runtime, 'require_lock'):
            result = runtime.restore_one(tx, fixture.m, intent, probe, required_available_mib=1024,
                                         database_identity=identity)
        self.assertTrue(result['restored'])
        self.assertTrue(any('psql' in argv for argv in tx.commands))
        self.assertEqual(tx.row['HostConfig']['RestartPolicy'], intent['originalRestartPolicy'])

    def test_legacy_47_restore_does_not_require_or_invoke_103_database_guard(self):
        import test_release_legacy_ui_retirement as existing
        fixture = existing.Fixture(); fixture.setUp(); self.addCleanup(fixture.tearDown)
        tx = fixture.tx(); tx.row['State']['Running'] = False
        manifest = copy.deepcopy(fixture.manifest); manifest['target'] = '47.105.59.142'
        intent = {'bindingHashFormat': legacy.BINDING_HASH_FORMAT, 'identity': manifest['identity'],
                  'immutableSha256': legacy.immutable(tx.row), 'networkSha256': legacy.network_binding(tx.row),
                  'originalPortBindings': tx.row['HostConfig']['PortBindings'],
                  'originalRestartPolicy': tx.row['HostConfig']['RestartPolicy']}
        probe = lambda *_: {'health': True, 'staticHashVerified': True,
                            'version': manifest['expectedVersion'], 'commit': manifest['expectedCommit']}
        with patch.object(legacy, 'require_lock'), patch.object(legacy, 'assert_legacy_fleet_rollback_clear') as check:
            result = legacy.restore_one(tx, manifest, intent, probe, required_available_mib=1024)
        check.assert_not_called(); self.assertTrue(result['restored'])


if __name__ == '__main__':
    unittest.main()
