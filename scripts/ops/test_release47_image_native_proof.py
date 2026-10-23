"""Isolated PostgreSQL equivalence for native image proof; no remote access."""
import json
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


if __name__ == '__main__':
    unittest.main()
