"""Isolated PostgreSQL equivalence for native image proof; no remote access."""
import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import types
import unittest
import uuid

import release47_task_snapshot as current


@unittest.skipUnless(os.environ.get('NAUMI_NATIVE_PROOF_DB') == '1', 'explicit isolated PostgreSQL fixture required')
class NativeImageProof(unittest.TestCase):
    def test_large_payload_exact_baseline_equivalence(self):
        # Retain the generic pre-optimization path without Git/output fixtures.
        source = Path(current.__file__).read_text(encoding='utf-8')
        source = source.replace("    if reg.rsplit('.', 1)[-1] == 'app_image_jobs':\n        return image_job_native_proof_projection_sql(reg)\n", '')
        source = source.replace("if projection == 'proof' and name != 'app_image_jobs':", "if projection == 'proof':")
        source = source.replace("if projection == 'proof' and name == 'app_image_jobs':", "if False:")
        baseline = types.ModuleType('image_native_proof_baseline')
        baseline.__package__ = ''
        sys.modules[baseline.__name__] = baseline
        exec(compile(source, 'generic_baseline.py', 'exec'), baseline.__dict__)
        container = os.environ.get('NAUMI_NATIVE_PROOF_CONTAINER', 'naumi-pricing-friction-pg-20261023')
        schema = 'native_proof_' + uuid.uuid4().hex
        def command(args, *, stdin=None, timeout=120):
            return subprocess.run(args, input=stdin, capture_output=True, timeout=timeout)
        identity = current.public_identity(json.loads(command(['docker', 'inspect', container]).stdout)[0])
        def sql(query):
            result = command(['docker', 'exec', '-i', container, 'psql', '-XqAt', '-U', 'fixture', '-d', 'naumi_pricing_fixture', '-v', 'ON_ERROR_STOP=1'], stdin=query.encode())
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            return result.stdout
        try:
            sql(f'''CREATE SCHEMA {schema}; CREATE TABLE {schema}.app_image_jobs(
                id text PRIMARY KEY,email text,kind text,snapshot jsonb,payload jsonb,
                plans jsonb,parameters jsonb,cost numeric,reserved_cost numeric,created_at timestamptz);
                INSERT INTO {schema}.app_image_jobs VALUES
                ('big','fixture@test','generate',jsonb_build_object('status','pending','images',repeat('z',1500000),
                    'paidOperations',jsonb_build_object('op',jsonb_build_object('model','wire','replayable',false,'gatewayIdentity','bind','receipt',repeat('r',1000000)))),
                    jsonb_build_object('blob',repeat(md5('large'),65536),'cancelRequested',true,'nested',jsonb_build_object('cost',0,'flag',false)),
                    '[{{"state":"done","text":"progress","prompt":"immutable","unknown":false}},null,7]',
                    '{{"request":{{"prompt":"original"}},"upstreamStarted":true,"newUnknown":0}}',0,3,'2026-10-23T00:00:00Z'),
                ('nulls',null,null,'{{"status":"pending"}}',null,null,null,null,null,null),
                ('scalars','x','generate','{{"status":"pending"}}','false','3','[]',1,0,null);
            ''')
            before = baseline.collect_task_snapshot(command, identity, schema=schema, projection='proof', row_limit=5000, statement_timeout_ms=15000)
            after = current.collect_task_snapshot(command, identity, schema=schema, projection='proof', row_limit=5000, statement_timeout_ms=15000)
            self.assertEqual(before.private['tables'], after.private['tables'])
            self.assertEqual(len(after.private['tables']['app_image_jobs']['rows']), 3)
            self.assertNotIn('payload', after.private['tables']['app_image_jobs']['rows'][0])
            sql(f'''UPDATE {schema}.app_image_jobs SET
                payload=jsonb_set(payload,'{{cancelRequested}}','false'),
                parameters=parameters || '{{"upstreamStarted":false,"resultAssets":["saved"]}}',
                plans=jsonb_set(plans,'{{0,state}}','"completed"'),
                snapshot=jsonb_set(snapshot,'{{paidOperations,op,state}}','"done"') WHERE id='big';''')
            progressed = current.collect_task_snapshot(command, identity, schema=schema, projection='proof', statement_timeout_ms=15000)
            generic = baseline.collect_task_snapshot(command, identity, schema=schema, projection='proof', statement_timeout_ms=15000)
            self.assertEqual(progressed.private['tables'], generic.private['tables'])
            self.assertEqual(after.private['tables']['app_image_jobs'], progressed.private['tables']['app_image_jobs'])
            sql(f'''UPDATE {schema}.app_image_jobs SET
                payload=jsonb_set(payload,'{{nested,cost}}','1'),
                snapshot=jsonb_set(snapshot,'{{paidOperations,op,gatewayIdentity}}','"changed-binding"') WHERE id='big';''')
            changed = current.collect_task_snapshot(command, identity, schema=schema, projection='proof', statement_timeout_ms=15000)
            generic = baseline.collect_task_snapshot(command, identity, schema=schema, projection='proof', statement_timeout_ms=15000)
            self.assertEqual(changed.private['tables'], generic.private['tables'])
            violations = current.compare_task_snapshots(progressed, changed)['violations']
            self.assertIn('FROZEN_CONTEXT_CHANGED', {v['reason'] for v in violations})
            self.assertIn('ORIGINAL_SUPPLIER_BINDING_CHANGED', {v['reason'] for v in violations})
            # Every currently audited frozen/native column, including SQL NULL.
            names = sorted(set(current.FROZEN_FIELDS + current.PROOF_FIELDS + ['parameters', 'plans', 'snapshot']))
            json_columns = {'payload', 'parameters', 'plans', 'snapshot'}
            definitions = ','.join('"'+name+'" '+('jsonb' if name in json_columns else 'text') for name in names)
            sql(f'DROP TABLE {schema}.app_image_jobs; CREATE TABLE {schema}.app_image_jobs({definitions}); INSERT INTO {schema}.app_image_jobs(id,snapshot) VALUES (\'all-null\',\'{{"status":"pending"}}\');')
            before = baseline.collect_task_snapshot(command, identity, schema=schema, projection='proof', row_limit=5000, statement_timeout_ms=15000)
            after = current.collect_task_snapshot(command, identity, schema=schema, projection='proof', row_limit=5000, statement_timeout_ms=15000)
            self.assertEqual(before.private['tables'], after.private['tables'])
            # Minimal older schema: absent payload/parameters/plans remain absent.
            sql(f'DROP TABLE {schema}.app_image_jobs; CREATE TABLE {schema}.app_image_jobs(id text); INSERT INTO {schema}.app_image_jobs VALUES (\'minimal\');')
            before = baseline.collect_task_snapshot(command, identity, schema=schema, projection='proof', statement_timeout_ms=15000)
            after = current.collect_task_snapshot(command, identity, schema=schema, projection='proof', statement_timeout_ms=15000)
            self.assertEqual(before.private['tables'], after.private['tables'])
        finally:
            sql(f'DROP SCHEMA {schema} CASCADE;')

    def test_previous_ids_all_tables_closure_and_limits(self):
        original = os.environ.get('NAUMI_NATIVE_PROOF_BASELINE')
        self.assertTrue(original, 'exact original source fixture required')
        spec = importlib.util.spec_from_file_location('exact_post_snapshot_baseline', original)
        baseline = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = baseline
        spec.loader.exec_module(baseline)
        container = os.environ['NAUMI_NATIVE_PROOF_CONTAINER']
        schema = 'post_proof_' + uuid.uuid4().hex
        def command(args, *, stdin=None, timeout=300):
            return subprocess.run(args, input=stdin, capture_output=True, timeout=timeout)
        identity = current.public_identity(json.loads(command(['docker', 'inspect', container]).stdout)[0])
        def sql(query):
            result = command(['docker', 'exec', '-i', container, 'psql', '-XqAt', '-U', 'fixture', '-d', 'naumi_pricing_fixture', '-v', 'ON_ERROR_STOP=1'], stdin=query.encode())
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            return result.stdout
        def collect(module, previous=None, limit=5000):
            if hasattr(previous, 'private'):
                previous = previous.private
            return module.collect_task_snapshot(command, identity, previous=previous, schema=schema, projection='proof', row_limit=limit, statement_timeout_ms=15000)
        fields = sorted(set(current.PROOF_FIELDS + current.GRAPH_FIELDS + current.FROZEN_FIELDS + ['parameters', 'plans']))
        json_fields = {'snapshot', 'payload', 'parameters', 'plans', 'billing_quote', 'provider_snapshot', 'capability_snapshot', 'quote', 'plan', 'request', 'request_body', 'inputs', 'body', 'video_references', 'procurement', 'fx'}
        definitions = ','.join('"'+name+'" '+('jsonb' if name in json_fields else 'text') for name in fields)
        try:
            sql(f'CREATE SCHEMA {schema};' + ''.join(f'CREATE TABLE {schema}.{name}({definitions}); CREATE INDEX ON {schema}.{name}(id);' for name in current.KEYS))
            previous = {'kind': 'task-preservation-private-v1', 'tables': {}}
            for name, key in current.KEYS.items():
                # Terminal/prior rows stay selected even after completion. The
                # paid-operation root also pulls non-prior terminal billing.
                sql(f'''INSERT INTO {schema}.{name}(id,key,tick_id,job_id,call_id,output_index,run_id,node_id,account_key,session_id,kind,child_operation_id,operation_id,state,status,phase,snapshot,payload,parameters,plans,email,model,account_id,billing_quote)
                    VALUES ('prior','prior','prior','prior','prior','0','prior','prior','prior','prior','fixture','prior','billing-closure','completed','completed','completed','{{"status":"done"}}','{{"immutable":false,"cancelRequested":true}}','{{"unknown":0,"upstreamStarted":true}}','[{{"state":"done","prompt":"immutable"}}]','fixture@test','wire','account-binding','{{"cost":0}}');''')
                row = {'id':'prior','key':'prior','tick_id':'prior','job_id':'prior','call_id':'prior','output_index':'0','run_id':'prior','node_id':'prior','account_key':'prior','session_id':'prior','kind':'fixture','child_operation_id':'prior'}
                previous['tables'][name] = {'rows':[row]}
            sql(f'''INSERT INTO {schema}.app_image_jobs(id,snapshot,payload)
                SELECT 'historic-'||lpad(i::text,5,'0'),'{{"status":"done"}}',jsonb_build_object('blob',repeat(md5(i::text),512),'cancelRequested',true) FROM generate_series(1,1876)i;
                INSERT INTO {schema}.app_image_jobs(id,snapshot,payload) VALUES
                ('imagegen-active','{{"status":"pending","paidOperations":{{"billing-closure":{{"model":"wire","replayable":false,"gatewayIdentity":"original"}}}}}}','{{"request":"frozen"}}'),
                ('untracked','{{"status":"done"}}','{{"request":"not-selected"}}');
                INSERT INTO {schema}.app_billing_operations(id,state,operation_id,billing_quote) VALUES ('billing-closure','settled','billing-closure','{{"cost":0,"binding":"original"}}');
                ANALYZE {schema}.app_image_jobs;''')
            previous['tables']['app_image_jobs']['rows'] += [{'id':'historic-'+str(i).zfill(5)} for i in range(1,1877)]
            before = collect(baseline, previous)
            after = collect(current, previous)
            self.assertEqual(before.private['tables'], after.private['tables'])
            self.assertEqual(len(after.private['tables']),23)
            self.assertTrue(after.public['preservationComplete'])
            selected_ids = {row['id'] for row in after.private['tables']['app_image_jobs']['rows']}
            self.assertIn('historic-01876', selected_ids)
            self.assertNotIn('untracked', selected_ids)
            self.assertIn('billing-closure', {row['id'] for row in after.private['tables']['app_billing_operations']['rows']})
            sql(f'''UPDATE {schema}.app_image_jobs SET payload=payload || '{{"cancelRequested":false}}',snapshot=jsonb_set(snapshot,'{{status}}','"done"') WHERE id='imagegen-active';''')
            progressed = collect(current, after)
            self.assertEqual(collect(baseline, after).private['tables'], progressed.private['tables'])
            self.assertFalse(current.compare_task_snapshots(after, progressed)['violations'])
            sql(f'''UPDATE {schema}.app_image_jobs SET payload=payload || '{{"newImmutable":false}}',snapshot=jsonb_set(snapshot,'{{paidOperations,billing-closure,gatewayIdentity}}','"changed"') WHERE id='imagegen-active';''')
            changed = collect(current, progressed)
            self.assertEqual(collect(baseline, progressed).private['tables'], changed.private['tables'])
            reasons = {v['reason'] for v in current.compare_task_snapshots(progressed, changed)['violations']}
            self.assertIn('FROZEN_CONTEXT_CHANGED', reasons)
            self.assertIn('ORIGINAL_SUPPLIER_BINDING_CHANGED', reasons)
            # Exactly 5000 total accepted; 5001 remains unknown-row-limit.
            sql(f'TRUNCATE {schema}.app_image_jobs; INSERT INTO {schema}.app_image_jobs(id,snapshot) SELECT lpad(i::text,5,\'0\'),\'{{"status":"pending"}}\' FROM generate_series(1,5000)i;')
            at_limit = collect(current)
            self.assertEqual(at_limit.private['tables']['app_image_jobs']['selectedCount'],5000)
            self.assertEqual(at_limit.public['tables']['app_image_jobs']['status'],'observed')
            sql(f'INSERT INTO {schema}.app_image_jobs(id,snapshot) VALUES (\'05001\',\'{{"status":"pending"}}\');')
            over_limit = collect(current)
            self.assertEqual(over_limit.private['tables'],collect(baseline).private['tables'])
            self.assertEqual(over_limit.public['tables']['app_image_jobs']['status'],'unknown-row-limit')
            # The byte ceiling is over proof rows, not raw payload, and remains
            # fail-closed even when one paid binding alone exceeds the ceiling.
            sql(f'''TRUNCATE {schema}.app_image_jobs; INSERT INTO {schema}.app_image_jobs(id,snapshot) VALUES ('byte-limit',jsonb_build_object('status','pending','paidOperations',jsonb_build_object('op',jsonb_build_object('gatewayIdentity',repeat('x',9*1024*1024)))));''')
            byte_limit = collect(current)
            self.assertEqual(byte_limit.private['tables'],collect(baseline).private['tables'])
            self.assertEqual(byte_limit.private['tables']['app_image_jobs']['status'],'unknown-byte-limit')
            self.assertEqual(byte_limit.private['tables']['app_image_jobs']['rows'],[])
        finally:
            sql(f'DROP SCHEMA {schema} CASCADE;')


if __name__ == '__main__':
    unittest.main()
