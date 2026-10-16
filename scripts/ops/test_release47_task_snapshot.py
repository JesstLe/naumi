import copy
import json
import os
import re
import subprocess
import unittest
import uuid

import release47_task_snapshot as m


def private(rows=None):
    tables = {name: {'kind': 'table', 'table': name, 'status': 'observed', 'selectedCount': 0, 'activeCount': 0, 'rows': [], 'allSummary': None} for name in m.KEYS}
    for name, values in (rows or {}).items():
        tables[name].update(rows=values, selectedCount=len(values), activeCount=len(values))
    return {'kind': 'task-preservation-private-v1', 'databaseIdentitySha256': 'a' * 64, 'observedAt': '2026-10-16T00:00:00Z', 'tables': tables}


class SnapshotTests(unittest.TestCase):
    def test_sql_is_one_repeatable_read_read_only_transaction_with_bounded_timeouts(self):
        sql = m.build_sql().decode()
        self.assertIn('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', sql)
        self.assertIn("lock_timeout='1000ms'", sql); self.assertIn("statement_timeout='5000ms'", sql)
        self.assertNotRegex(sql, r'(?i)\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER|COPY)\b')
        self.assertEqual(sql.count('BEGIN '), 1); self.assertEqual(sql.count('COMMIT;'), 1)
        self.assertIn('to_regclass', sql)

    def test_table_missing_is_unknown_not_zero_or_drain(self):
        data = private(); data['tables']['app_video_tasks']['status'] = 'unknown-table-missing'
        public = m.summarize(data)
        self.assertFalse(public['preservationComplete']); self.assertFalse(public['drainProven'])
        self.assertIn('app_video_tasks', m.compare_task_snapshots(data, copy.deepcopy(data))['unknownTables'])

    def test_public_contains_only_hashes_counts_no_pii_or_original_ids(self):
        row = {'id': 'sensitive-job-id', 'email': 'person@example.test', 'payload': {'credential': 'secret-key-do-not-show'}, 'provider_id': 'private-provider', 'upstream_id': 'supplier-secret-id'}
        text = json.dumps(m.summarize(private({'app_video_tasks': [row]})))
        for secret in ['sensitive-job-id', 'person@example.test', 'secret-key-do-not-show', 'private-provider', 'supplier-secret-id']:
            self.assertNotIn(secret, text)

    def test_previously_active_ids_are_tracked_after_terminal_state(self):
        before = private({'app_video_tasks': [{'id': 'prior-job', 'status': 'processing'}]})
        sql = m.build_sql(previous=before).decode()
        self.assertIn("j->>'id' IN ('prior-job')", sql)
        after = copy.deepcopy(before); after['tables']['app_video_tasks']['rows'][0]['status'] = 'completed'
        result = m.compare_task_snapshots(before, after)
        self.assertTrue(result['preservationVerified']); self.assertGreater(result['stateTransitionsAllowed'], 0)

    def test_missing_job_original_supplier_mutation_and_frozen_change_are_detected(self):
        row = {'id': 'job', 'upstream_id': 'old-upstream', 'provider_id': 'p1', 'provider_snapshot': {'endpoint': 'original'}}
        before = private({'app_video_tasks': [row]})
        for change, reason in [(lambda r: r.update(upstream_id='new-upstream'), 'ORIGINAL_SUPPLIER_BINDING_CHANGED'), (lambda r: r['provider_snapshot'].update(endpoint='new'), 'FROZEN_CONTEXT_CHANGED')]:
            after = copy.deepcopy(before); change(after['tables']['app_video_tasks']['rows'][0])
            self.assertIn(reason, [v['reason'] for v in m.compare_task_snapshots(before, after)['violations']])
        result = m.compare_task_snapshots(before, private())
        self.assertFalse(result['noMissingJobs'])

    def test_new_supplier_binding_is_allowed_but_old_binding_cannot_disappear(self):
        before = private({'app_video_tasks': [{'id': 'job', 'upstream_id': ''}]})
        after = copy.deepcopy(before); after['tables']['app_video_tasks']['rows'][0]['upstream_id'] = 'accepted-original'
        self.assertTrue(m.compare_task_snapshots(before, after)['preservationVerified'])
        self.assertFalse(m.compare_task_snapshots(after, before)['noOriginalSupplierMutation'])

    def test_paid_operation_identity_preserved_while_result_progress_allowed(self):
        row = {'id': 'image-job', 'snapshot': {'status': 'pending', 'paidOperations': {'op1': {'model': 'original', 'gatewayIdentity': 'originalhash', 'replayable': True, 'state': 'started'}}}}
        before = private({'app_image_jobs': [row]}); after = copy.deepcopy(before)
        paid = after['tables']['app_image_jobs']['rows'][0]['snapshot']['paidOperations']['op1']; paid.update(state='done', result={'url': 'saved-result'})
        after['tables']['app_image_jobs']['rows'][0]['snapshot']['paidOperations']['op2'] = {'model': 'new-model', 'gatewayIdentity': 'next-original'}
        self.assertTrue(m.compare_task_snapshots(before, after)['preservationVerified'])
        paid['gatewayIdentity'] = 'changed'
        self.assertFalse(m.compare_task_snapshots(before, after)['noOriginalSupplierMutation'])

    def test_new_ledger_settlement_allowed_original_ledger_mutation_rejected(self):
        before = private({'app_ledger': [{'id': 'ledger-1', 'delta': -4}]}); after = copy.deepcopy(before)
        table = after['tables']['app_ledger']; table['rows'].append({'id': 'ledger-2', 'delta': -6}); table['selectedCount'] += 1
        self.assertTrue(m.compare_task_snapshots(before, after)['preservationVerified'])
        table['rows'][0]['delta'] = -1
        self.assertFalse(m.compare_task_snapshots(before, after)['preservationVerified'])

    def test_global_count_hash_regression_and_database_replacement_detected(self):
        before = private(); before['tables']['app_ledger']['allSummary'] = {'count': 10, 'sumA': '100', 'sumB': '200'}
        for summary in [{'count': 9, 'sumA': '100', 'sumB': '200'}, {'count': 10, 'sumA': '99', 'sumB': '200'}]:
            after = copy.deepcopy(before); after['tables']['app_ledger']['allSummary'] = summary
            self.assertFalse(m.compare_task_snapshots(before, after)['preservationVerified'])
        after = copy.deepcopy(before); after['databaseIdentitySha256'] = 'b' * 64
        self.assertFalse(m.compare_task_snapshots(before, after)['preservationVerified'])

    def test_limits_and_schema_injection_fail_closed(self):
        for options in [dict(schema='public;DROP TABLE x'), dict(row_limit=0), dict(row_limit=True), dict(row_limit=100000)]:
            with self.assertRaises(ValueError): m.build_sql(**options)
        data = private({'app_video_tasks': [{'id': 'one'}]}); data['tables']['app_video_tasks']['selectedCount'] = 1001
        self.assertEqual(m.summarize(data)['tables']['app_video_tasks']['status'], 'unknown-row-limit')
        data['tables']['app_video_tasks']['selectedCount'] = 1
        data['rowLimit'] = 0
        self.assertFalse(m.compare_task_snapshots(data, copy.deepcopy(data))['preservationVerified'])

    def test_billing_hash_change_from_normal_settlement_is_not_corruption(self):
        before = private({'app_billing_operations': [{'id': 'op', 'state': 'reserved', 'quote': {'price': 3}}]})
        before['tables']['app_billing_operations']['allSummary'] = {'count': 1, 'sumA': '10'}
        after = copy.deepcopy(before)
        after['tables']['app_billing_operations']['allSummary'] = {'count': 1, 'sumA': '20'}
        after['tables']['app_billing_operations']['rows'][0]['state'] = 'settled'
        self.assertTrue(m.compare_task_snapshots(before, after)['preservationVerified'])

    def test_unknown_byte_limit_duplicate_rows_and_unbound_inputs_fail_closed(self):
        data = private(); data['tables']['app_video_tasks']['status'] = 'unknown-byte-limit'
        self.assertFalse(m.compare_task_snapshots(data, copy.deepcopy(data))['preservationVerified'])
        data = private({'app_video_tasks': [{'id': 'same'}, {'id': 'same'}]})
        self.assertFalse(m.compare_task_snapshots(data, copy.deepcopy(data))['preservationVerified'])
        with self.assertRaises(ValueError): m.compare_task_snapshots({}, {})

    def test_composite_keys_and_quoted_previous_ids_are_sql_literals(self):
        row = {'run_id': 'a', 'node_id': '中文-node'}
        self.assertEqual(m.row_key(row, 'composite:run_id,node_id'), '["a", "中文-node"]')
        data = private({'app_video_tasks': [{'id': "job'quoted"}]})
        self.assertIn("'job''quoted'", m.build_sql(previous=data).decode())
        self.assertIn("'[\"a\", \"中文-node\"]'", m.build_sql(previous=private({'app_video_workflow_run_nodes': [row]})).decode())

    def test_read_error_and_identity_changes_fail_closed_without_leaking_stderr(self):
        identity = {'id': 'a' * 64, 'name': 'fixture', 'image': 'sha256:b', 'running': True, 'startedAt': 'now', 'restartPolicy': 'no'}
        def error(*args, **kwargs):
            return subprocess.CompletedProcess([], 1, b'', b'sensitive-password')
        with self.assertRaisesRegex(ValueError, '^TASK_SNAPSHOT_READ_UNAVAILABLE$'):
            m.collect_task_snapshot(error, identity)
        with self.assertRaisesRegex(ValueError, '^DATABASE_IDENTITY_UNVERIFIED$'):
            m.collect_task_snapshot(lambda *a, **kw: b'[]', identity)


@unittest.skipUnless(os.environ.get('NAUMI_VERIFY_ISOLATED_DB') == '1', 'explicit isolated local PostgreSQL fixture required')
class PostgresFixture(unittest.TestCase):
    def test_real_sql_missing_table_terminal_tracking_and_no_write(self):
        container = 'naumi-packaging-skills-pg-20261016'
        schema = 'task_snapshot_test_' + uuid.uuid4().hex
        def run(args, *, stdin=None, timeout=120):
            return subprocess.run(args, input=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        inspect = json.loads(run(['docker', 'inspect', container]).stdout)[0]
        identity = m.public_identity(inspect)
        self.assertEqual(identity['name'], container)
        env = dict(v.split('=', 1) for v in inspect['Config']['Env'] if '=' in v)
        env.setdefault('POSTGRES_USER', 'postgres')
        self.assertEqual(env['POSTGRES_DB'], 'naumi_packaging')
        def sql(value):
            result = run(['docker', 'exec', '-i', identity['id'], 'psql', '-X', '-qAt', '--no-password', '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB'], '-v', 'ON_ERROR_STOP=1'], stdin=value.encode())
            self.assertEqual(result.returncode, 0, result.stderr.decode()); return result.stdout
        try:
            sql(f"CREATE SCHEMA {schema}; CREATE TABLE {schema}.app_video_tasks(id text PRIMARY KEY,status text,upstream_id text,provider_id text,parameters jsonb); INSERT INTO {schema}.app_video_tasks VALUES('job-1','processing','original-task','original-provider','{{}}'),('already-done','completed','old-task','original-provider','{{}}'); CREATE TABLE {schema}.app_billing_operations(id text PRIMARY KEY,state text,ledger_id text,quote jsonb); INSERT INTO {schema}.app_billing_operations VALUES('job-1','reserved','led-video-job-1','{{\"frozen\":true}}'); CREATE TABLE {schema}.app_ledger(id text PRIMARY KEY,delta integer); INSERT INTO {schema}.app_ledger VALUES('old-unrelated',1);")
            sql(f"CREATE TABLE {schema}.app_supplier_calls(id text PRIMARY KEY,operation_id text,account_id text,task_id text,state text,cost_status text); INSERT INTO {schema}.app_supplier_calls VALUES('call-1','job-1','account-original','original-task','completed','reported'),('unrelated-call','already-done','unrelated-account','old-task','completed','reported'); CREATE TABLE {schema}.app_supplier_accounts(id text PRIMARY KEY,base_url text,credential_ref text,protocol text); INSERT INTO {schema}.app_supplier_accounts VALUES('account-original','https://original.test','original-secret-ref','original-protocol'),('unrelated-account','https://other.test','other-secret','other'); CREATE TABLE {schema}.app_supplier_call_outputs(call_id text,output_index int,state text); INSERT INTO {schema}.app_supplier_call_outputs VALUES('call-1',0,'delivered'),('unrelated-call',0,'delivered');")
            captures = []
            first = m.collect_task_snapshot(run, identity, lambda name, value: captures.append(value), schema=schema)
            self.assertEqual(first.public['tables']['app_video_tasks']['selectedCount'], 1)
            self.assertEqual(first.public['tables']['app_reference_operations']['status'], 'unknown-table-missing')
            self.assertFalse(first.public['drainProven']); self.assertNotIn('original-task', json.dumps(first.public))
            self.assertIn(b'original-task', captures[0])
            self.assertEqual(first.private['tables']['app_supplier_calls']['selectedCount'], 1)
            self.assertEqual(first.private['tables']['app_supplier_accounts']['selectedCount'], 1)
            self.assertEqual(first.private['tables']['app_supplier_call_outputs']['selectedCount'], 1)
            self.assertNotIn(b'other-secret', captures[0])
            sql(f"UPDATE {schema}.app_video_tasks SET status='completed' WHERE id='job-1'; UPDATE {schema}.app_billing_operations SET state='settled' WHERE id='job-1'; INSERT INTO {schema}.app_ledger VALUES('led-video-job-1',-4);")
            after = m.collect_task_snapshot(run, identity, schema=schema, previous=first)
            self.assertEqual(after.private['tables']['app_video_tasks']['rows'][0]['status'], 'completed')
            self.assertTrue(m.compare_task_snapshots(first, after)['noMissingJobs'])
            self.assertTrue(m.compare_task_snapshots(first, after)['noOriginalSupplierMutation'])
            self.assertFalse(m.compare_task_snapshots(first, after)['preservationVerified']) # Missing optional tables remain unknown.
            self.assertEqual(sql(f'SELECT count(*) FROM {schema}.app_video_tasks;').strip(), b'2')
            sql(f"INSERT INTO {schema}.app_video_tasks VALUES('big-active','processing',NULL,NULL,jsonb_build_object('opaque',repeat('x',524289)));")
            bounded = m.collect_task_snapshot(run, identity, schema=schema)
            self.assertEqual(bounded.public['tables']['app_video_tasks']['status'], 'unknown-byte-limit')
            self.assertEqual(bounded.private['tables']['app_video_tasks']['rows'], [])
        finally:
            sql(f'DROP SCHEMA {schema} CASCADE;')


if __name__ == '__main__': unittest.main()
