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
    def test_graph_is_evaluated_once_and_bounded_without_temp_writes(self):
        sql = m.build_sql().decode()
        self.assertEqual(sql.count('FROM (:roots_query) graph'), 0)
        self.assertIn('LIMIT 8001', sql)
        self.assertIn('unknown-root-limit', sql)
        self.assertIn("SET LOCAL statement_timeout='5000ms'", sql)
        self.assertIn('expanded AS MATERIALIZED', sql)
        self.assertIn("SELECT prefix||value", sql)
        self.assertNotIn("OR EXISTS(SELECT 1 FROM", sql)
        self.assertNotIn('CREATE TEMP', sql)

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

    def test_supplier_unknown_states_are_active_not_an_incomplete_allow_list(self):
        predicate = m.SPECS['app_supplier_calls'][1]
        self.assertIn('NOT IN', predicate)
        for state in ['response-received', 'stream-completed', 'pre-submission-failed', 'canceled', 'success']:
            self.assertIn("'" + state + "'", predicate)
        self.assertNotIn("'running'", predicate)

    def test_catalog_additive_absence_never_hides_invalid_after_rows(self):
        before = private(); table = 'app_worker_tick_receipts'
        before['tables'][table].update(status='confirmed-absent-additive', activeCount=None)
        for rows, count in [([{'tick_id': 'one'}], 1001), ([{}], 1), ([{'tick_id': 'same'}, {'tick_id': 'same'}], 2)]:
            after = copy.deepcopy(before); after['tables'][table].update(status='observed', rows=rows, selectedCount=count)
            self.assertIn(table, m.compare_task_snapshots(before, after)['unknownTables'])
        after = copy.deepcopy(before); after['tables'][table].update(status='observed', rows=[{'tick_id': 'one', 'phase': 'running'}], selectedCount=1)
        self.assertTrue(m.compare_task_snapshots(before, after)['preservationVerified'])

    def test_output_identity_owner_wire_model_and_real_request_changes_are_detected(self):
        examples = [
            ('app_supplier_call_outputs', {'call_id': 'c', 'output_index': 0, 'supplier_ref_hash': 'original'}, 'supplier_ref_hash', 'changed', 'ORIGINAL_SUPPLIER_BINDING_CHANGED'),
            ('app_image_jobs', {'id': 'j', 'email': 'original-owner'}, 'email', 'changed-owner', 'FROZEN_CONTEXT_CHANGED'),
            ('app_model_execution_stages', {'id': 's', 'wire_model': 'original'}, 'wire_model', 'changed', 'FROZEN_CONTEXT_CHANGED'),
            ('app_reference_operations', {'id': 'r', 'body': {'prompt': 'original'}}, 'body', {'prompt': 'changed'}, 'FROZEN_CONTEXT_CHANGED'),
            ('app_reference_operations', {'id': 'r', 'plans': [{'prompt': 'original', 'state': 'running'}]}, 'plans', [{'prompt': 'changed', 'state': 'done'}], 'FROZEN_CONTEXT_CHANGED'),
            ('app_video_tasks', {'id': 'v', 'parameters': {'request': {'prompt': 'original'}, 'workflowManifestEnc': 'frozen'}}, 'parameters', {'request': {'prompt': 'changed'}, 'workflowManifestEnc': 'frozen'}, 'FROZEN_CONTEXT_CHANGED'),
            ('app_canvas_image_tasks', {'id': 'e', 'parameters': {'prompt': 'original', 'unknownNewField': 'keep-frozen'}}, 'parameters', {'prompt': 'changed', 'unknownNewField': 'keep-frozen'}, 'FROZEN_CONTEXT_CHANGED'),
        ]
        for table, row, field, value, reason in examples:
            with self.subTest(table=table, field=field):
                before = private({table: [row]}); after = copy.deepcopy(before)
                after['tables'][table]['rows'][0][field] = value
                self.assertIn(reason, [v['reason'] for v in m.compare_task_snapshots(before, after)['violations']])

    def test_only_source_audited_progress_is_excluded_from_frozen_context(self):
        row = {'id': 'r', 'payload': {'prompt': 'same'}, 'parameters': {'request': {'prompt': 'same'}},
               'plans': [{'prompt': 'same', 'source': 'immutable', 'annotated': 'immutable', 'state': 'running'}]}
        before = private({'app_reference_operations': [row]}); after = copy.deepcopy(before)
        latest = after['tables']['app_reference_operations']['rows'][0]
        latest['payload']['cancelRequested'] = True
        latest['parameters'].update(submissionState='sending', upstreamStarted=True, upstreamResult='saved',
            qualityAudit={'executed': 'high'}, resultAssets=['new'], resultArtworkIds=['new'], resultMetadataWarnings=[],
            resultAssetManifest={'entries': ['new']}, acceptedOutputs=1, preparation=False)
        latest['plans'][0].update(state='done', startedAt=123, text='new result', error='')
        self.assertTrue(m.compare_task_snapshots(before, after)['preservationVerified'])
        latest['plans'][0]['source'] = 'changed'
        self.assertFalse(m.compare_task_snapshots(before, after)['preservationVerified'])
        latest['plans'][0]['source'] = 'immutable'; latest['parameters']['newUnknownField'] = 'must-be-audited'
        self.assertFalse(m.compare_task_snapshots(before, after)['preservationVerified'])

    def test_ordinary_settlement_reservation_deletion_still_requires_manual_conservation_review(self):
        before = private({'app_gen_reservations': [{'job_id': 'j', 'cost': 5}],
                          'app_billing_operations': [{'id': 'j', 'state': 'reserved', 'reserved_credits': 5}]})
        after = copy.deepcopy(before); after['tables']['app_gen_reservations'].update(rows=[], selectedCount=0)
        after['tables']['app_billing_operations']['rows'][0].update(state='settled', reserved_credits=0, charged_credits=5)
        after['tables']['app_ledger'].update(rows=[{'id': 'led-image-j', 'delta': -5}], selectedCount=1)
        self.assertFalse(m.compare_task_snapshots(before, after)['noMissingJobs'])

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
        self.assertIsNone(m.row_key({'run_id': 'a'}, 'composite:run_id,node_id'))
        invalid = private({'app_supplier_call_outputs': [{'call_id': 'a'}]})
        self.assertEqual(m.summarize(invalid)['tables']['app_supplier_call_outputs']['status'], 'unknown-invalid-rows')
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
        container = os.environ.get('NAUMI_TASK_SNAPSHOT_TEST_CONTAINER','naumi-packaging-skills-pg-20261016')
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
            proof = m.collect_task_snapshot(run, identity, schema=schema, projection='proof',
                        allow_absent_tables=m.ADDITIVE_TABLES)
            self.assertEqual(proof.public['tables']['app_video_tasks']['status'], 'observed')
            self.assertTrue(all(row.get('_preservationProof') for row in proof.private['tables']['app_video_tasks']['rows']))
            self.assertNotIn('parameters', proof.private['tables']['app_video_tasks']['rows'][0])
            self.assertEqual(proof.public['tables']['app_release_activities']['status'], 'confirmed-absent-additive')
            self.assertIsNone(proof.public['tables']['app_release_activities']['activeCount'])
            self.assertFalse(proof.public['drainProven'])
            again = m.collect_task_snapshot(run, identity, schema=schema, projection='proof', previous=proof,
                        allow_absent_tables=m.ADDITIVE_TABLES)
            self.assertTrue(m.compare_task_snapshots(proof,again)['noMissingJobs'])
            self.assertNotIn('app_release_activities', m.compare_task_snapshots(proof,again)['unknownTables'])
            with self.assertRaises(ValueError):
                m.collect_task_snapshot(run, identity, schema=schema, allow_absent_tables=['app_video_tasks'])
            # SQL and Python normalization must exclude exactly the same audited
            # progress fields while retaining every unknown/new input field.
            normalized_rows = [
                {'id': 'x', 'email': 'owner', 'parameters': {'request': {'prompt': 'original'}, 'submissionState': 'sending', 'resultAssets': []}},
                {'id': 'x', 'payload': {'prompt': 'original', 'cancelRequested': True}, 'plans': [{'prompt': 'original', 'state': 'done', 'text': 'result', 'source': 'frozen'}]},
                {'id': 'x', 'parameters': None, 'plans': None, 'payload': None},
                {'id': 'x', 'parameters': {'unknownNewField': 1}, 'plans': []},
            ]
            values = ','.join('(' + m.literal(json.dumps(row)) + '::jsonb)' for row in normalized_rows)
            actual = [json.loads(line) for line in sql('SELECT (' + m.sql_frozen() + ') FROM (VALUES ' + values + ') q(j);').decode().splitlines()]
            self.assertEqual(actual, [m.frozen(row) for row in normalized_rows])
            sql(f"CREATE TABLE {schema}.app_image_jobs(id text PRIMARY KEY,payload jsonb,snapshot jsonb); INSERT INTO {schema}.app_image_jobs VALUES('image-pending','{{}}','{{\"status\":\"pending\",\"paidOperations\":{{\"paid-child-op\":{{\"model\":\"original\",\"gatewayIdentity\":\"original-binding\",\"state\":\"done\"}}}}}}'); CREATE TABLE {schema}.app_supplier_cost_jobs(key text PRIMARY KEY,state text,payload jsonb,account_id text); INSERT INTO {schema}.app_supplier_cost_jobs VALUES('router:native','queued','{{\"operation\":\"router-native\",\"context\":{{\"operationId\":\"router-context-op\"}}}}',NULL),('task:exact','queued','{{\"callId\":\"exact-call\"}}','account-original'); INSERT INTO {schema}.app_supplier_calls VALUES('paid-child-call','paid-child-op','account-original','paid-upstream','completed','reported'),('router-call','router-context-op','account-original','router-upstream','completed','reported'),('exact-call','exact-operation','account-original','exact-upstream','completed','reported'),('running-call','unlinked-operation','account-original','inflight','running','pending'),('future-state-call','unlinked-future','account-original','future-inflight','future-provider-state','pending');")
            graph = m.collect_task_snapshot(run, identity, schema=schema, projection='proof', row_limit=5000, allow_absent_tables=m.ADDITIVE_TABLES)
            selected = {row['id'] for row in graph.private['tables']['app_supplier_calls']['rows']}
            self.assertTrue({'paid-child-call', 'router-call', 'exact-call', 'running-call', 'future-state-call'} <= selected)
            self.assertNotIn('unrelated-call', selected)
            sql(f"ALTER TABLE {schema}.app_supplier_call_outputs ADD COLUMN supplier_ref_hash text; UPDATE {schema}.app_supplier_call_outputs SET supplier_ref_hash='original-output' WHERE call_id='running-call'; INSERT INTO {schema}.app_supplier_call_outputs VALUES('running-call',0,'delivered','original-output'); CREATE TABLE {schema}.app_reference_operations(id text PRIMARY KEY,state text,owner text,body jsonb,plans jsonb); INSERT INTO {schema}.app_reference_operations VALUES('reference','accepted','original-owner','{{\"prompt\":\"original\"}}','[{{\"prompt\":\"original\",\"state\":\"running\",\"source\":\"immutable\"}}]'); CREATE TABLE {schema}.app_worker_tick_receipts(tick_id text PRIMARY KEY,phase text); INSERT INTO {schema}.app_worker_tick_receipts VALUES('tick-original','running'); UPDATE {schema}.app_video_tasks SET parameters='{{\"request\":{{\"prompt\":\"original\"}}}}' WHERE id='big-active';")
            immutable = m.collect_task_snapshot(run, identity, schema=schema, projection='proof', row_limit=5000, allow_absent_tables=m.ADDITIVE_TABLES)
            self.assertEqual(immutable.public['tables']['app_worker_tick_receipts']['status'], 'observed')
            sql(f"UPDATE {schema}.app_reference_operations SET plans='[{{\"prompt\":\"original\",\"state\":\"done\",\"source\":\"immutable\",\"text\":\"result\"}}]'; UPDATE {schema}.app_video_tasks SET parameters=parameters || '{{\"submissionState\":\"sending\",\"resultAssets\":[]}}' WHERE id='big-active';")
            progressed = m.collect_task_snapshot(run, identity, schema=schema, projection='proof', row_limit=5000, previous=immutable, allow_absent_tables=m.ADDITIVE_TABLES)
            self.assertEqual(m.compare_task_snapshots(immutable, progressed)['violations'], [])
            sql(f"UPDATE {schema}.app_reference_operations SET owner='changed-owner',plans='[{{\"prompt\":\"changed\",\"state\":\"done\",\"source\":\"immutable\"}}]'; UPDATE {schema}.app_video_tasks SET parameters=jsonb_set(parameters,'{{request,prompt}}','\"changed\"') WHERE id='big-active'; UPDATE {schema}.app_supplier_call_outputs SET supplier_ref_hash='changed-output' WHERE call_id='running-call';")
            changed = m.collect_task_snapshot(run, identity, schema=schema, projection='proof', row_limit=5000, previous=immutable, allow_absent_tables=m.ADDITIVE_TABLES)
            violations = m.compare_task_snapshots(immutable, changed)['violations']
            self.assertTrue({'app_reference_operations', 'app_video_tasks'} <= {v['table'] for v in violations if v['reason'] == 'FROZEN_CONTEXT_CHANGED'})
            self.assertIn('app_supplier_call_outputs', {v['table'] for v in violations if v['reason'] == 'ORIGINAL_SUPPLIER_BINDING_CHANGED'})
        finally:
            sql(f'DROP SCHEMA {schema} CASCADE;')


if __name__ == '__main__': unittest.main()
