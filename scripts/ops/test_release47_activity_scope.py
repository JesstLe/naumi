"""Real isolated PG checks for source-scoped release observations, never recovery.

Uses only its own labelled fixture and the established command/evidence runner.
No production credentials, deployment operations, suppliers or external HTTP.
"""
import argparse
import copy
import json
from pathlib import Path
from types import SimpleNamespace
import sys

import release47_site_single as caller
import release47_task_snapshot as module
from verify_release47_snapshot_pagination import Fixture, load

NAMES = ['naumi47-web-scope-old', 'naumi47-web-scope-new']


def scoped(m):
    original = caller.tasks
    try:
        caller.tasks = m
        return caller.current_activity_collector(NAMES)
    finally:
        caller.tasks = original


class ScopeFixture(Fixture):
    def seed(self):
        s = self.schema
        self.sql('CREATE SCHEMA ' + s + ';')
        fields = sorted(set(self.m.GRAPH_FIELDS + self.m.PROOF_FIELDS + self.m.FROZEN_FIELDS +
                            ['parameters', 'plans', 'batch_id', 'instance_id']))
        json_fields = {'snapshot', 'payload', 'parameters', 'plans', 'billing_quote', 'provider_snapshot',
                       'capability_snapshot', 'quote', 'plan', 'request', 'request_body', 'inputs', 'body',
                       'video_references', 'procurement', 'fx'}
        for name, key in self.m.KEYS.items():
            keys = ['batch_id', 'key'] if name == 'app_imagegen_batch_items' else (
                key[10:].split(',') if key.startswith('composite:') else [key])
            defs = ','.join('"' + f + '" ' + ('jsonb' if f in json_fields else 'text') for f in fields)
            self.sql(f'CREATE TABLE {s}.{name}({defs},PRIMARY KEY({",".join(keys)}));')
        self.sql(f"""INSERT INTO {s}.app_release_activities(id,instance_id,state)
          SELECT 'old-'||lpad(i::text,7,'0'),'naumi47-web-unrelated',
            CASE WHEN i%10000=0 THEN 'unknown' ELSE 'finished' END FROM generate_series(1,120001)i;
          INSERT INTO {s}.app_release_activities(id,instance_id,state)
          SELECT 'current-history-'||lpad(i::text,7,'0'),'{NAMES[0]}','finished' FROM generate_series(1,120001)i;
          INSERT INTO {s}.app_release_activities(id,instance_id,state)
          SELECT 'scope-'||lpad(i::text,4,'0'),CASE WHEN i%2=0 THEN '{NAMES[0]}' ELSE '{NAMES[1]}' END,
            CASE WHEN i%4=0 THEN 'finished' ELSE 'running' END FROM generate_series(1,260)i;
          CREATE INDEX ON {s}.app_release_activities(instance_id,id);
          INSERT INTO {s}.app_worker_tick_receipts(tick_id,phase,instance_id)
          SELECT 'tick-finished-'||lpad(i::text,7,'0'),'completed','naumi47-web-unrelated' FROM generate_series(1,100001)i;
          INSERT INTO {s}.app_worker_tick_receipts(tick_id,phase,instance_id) VALUES
            ('tick-running','running','naumi47-web-unrelated'),('tick-unknown','unknown','naumi47-web-unrelated');
          INSERT INTO {s}.app_image_jobs(id,snapshot,payload) VALUES
            ('gen-active','{{"status":"pending","paidOperations":{{"paid-original":{{"model":"wire","gatewayIdentity":"frozen","state":"started"}}}}}}','{{"prompt":"kept"}}');
          INSERT INTO {s}.app_billing_operations(id,state,quote,ledger_id) VALUES
            ('paid-original','settled','{{"price":6}}','ledger-original');
          INSERT INTO {s}.app_ledger(id,delta) VALUES ('ledger-original','-6');
          ANALYZE {s}.app_release_activities;
        """)

    def read(self, m, previous=None, **opts):
        options = {'schema': self.schema, 'projection': 'proof', 'row_limit': 5000,
                   'statement_timeout_ms': 15000, 'previous': previous}
        options.update(opts)
        return m.collect_task_snapshot(self.command, self.identity,
                                      lambda name, data: (self.out / name).write_bytes(data), **options)

    def must_reject(self, fn, message):
        try:
            fn()
        except ValueError:
            return
        raise AssertionError(message)

    def run(self):
        self.seed()
        m = scoped(self.m)
        s = self.schema
        original_defaults = {'page_rows': 128, 'scan_rows': 100000, 'selected_rows': 20000,
                             'pages': 2048, 'graph_bytes': 8*1024*1024, 'proof_bytes': 8*1024*1024,
                             'page_bytes': 1024*1024, 'seconds': 60, 'roots': 40000}
        self.check('default_budgets_unchanged', lambda: self.require(m.budgets() == original_defaults, 'default drift'))
        self.check('explicit_measured_metadata_envelope', lambda: self.require(
            m.budgets({'page_rows': 1024, 'graph_bytes': 32*1024*1024}) ==
            {**original_defaults, 'page_rows': 1024, 'graph_bytes': 32*1024*1024}, 'explicit maxima rejected'))
        for key, value in [('page_rows', 1025), ('graph_bytes', 32*1024*1024+1),
                           ('page_rows', 512.0), ('page_rows', True), ('seconds', 61), ('scan_rows', 100001)]:
            self.check('reject_budget_' + key + '_' + str(value),
                       lambda k=key, v=value: self.must_reject(lambda: m.budgets({k: v}), 'unbounded value accepted'))
        self.check('scope_rejects_duplicate_instances', lambda: self.reject_pair([NAMES[0], NAMES[0]]))
        self.check('scope_rejects_sql_like_instance', lambda: self.reject_pair([NAMES[0], "naumi47-web-x' OR true"]))
        self.check('scope_has_no_business_predicate', lambda: self.require(
            m.native_scan_predicate('app_image_jobs') == m.native_scan_predicate('app_ledger') == 'true', 'business scope narrowed'))
        self.check('observation_leaves_have_no_incoming_graph_links', lambda: self.require(
            m.graph_links('app_release_activities') == m.graph_links('app_worker_tick_receipts') == 'jsonb_build_array()',
            'terminal observation may be a business graph target'))

        # Original graph selection was scoped only after scanning every source row.
        # The same database, same default 100k budget, and same current-pair seed
        # demonstrate the pre-patch inability to collect a complete proof.
        if self.args.baseline_module:
            baseline = scoped(load(Path(self.args.baseline_module).resolve()))
            old = self.read(baseline)
            self.check('baseline_same_fixture_is_incomplete', lambda: self.require(
                not old.public['preservationComplete'] and not baseline.compare_task_snapshots(old.private, old.private)['preservationVerified'],
                'baseline unexpectedly complete'))
            (self.out/'BASELINE.json').write_text(json.dumps(old.public, indent=2))

        before = self.read(m)
        expected = {'scope-' + str(i).zfill(4) for i in range(1, 261) if i % 4}
        activity_ids = self.ids(before, 'app_release_activities')
        self.check('modified_current_pair_cross_page_complete', lambda: self.require(
            before.public['preservationComplete'] and activity_ids == expected, 'current-pair coverage mismatch'))
        self.check('modified_business_graph_retained', lambda: self.require(
            self.ids(before, 'app_image_jobs') == {'gen-active'} and
            'paid-original' in self.ids(before, 'app_billing_operations') and
            'ledger-original' in self.ids(before, 'app_ledger'), 'business graph was narrowed'))
        self.check('modified_self_proof_verified', lambda: self.require(
            m.compare_task_snapshots(before.private, before.private)['preservationVerified'], 'self proof failed'))
        self.check('unknown_ticks_from_other_instances_kept', lambda: self.require(
            self.ids(before,'app_worker_tick_receipts')=={'tick-running','tick-unknown'},'unknown tick omitted'))
        self.test_explain_scope(m)

        self.sql(f"UPDATE {s}.app_release_activities SET state='finished' WHERE id='scope-0001';")
        after = self.read(m, previous=before.private)
        self.check('previous_id_retained_after_finished', lambda: self.require(
            'scope-0001' in self.ids(after, 'app_release_activities') and
            m.compare_task_snapshots(before.private, after.private)['preservationVerified'], 'completed original lost'))
        self.sql(f"UPDATE {s}.app_release_activities SET instance_id='naumi47-web-moved' WHERE id='scope-0003';")
        moved = self.read(m, previous=before.private)
        self.check('previous_activity_relocated_is_read_and_rejected', lambda: self.require(
            'scope-0003' in self.ids(moved,'app_release_activities') and
            not m.compare_task_snapshots(before.private,moved.private)['preservationVerified'],'relocated activity escaped protection'))
        self.sql(f"UPDATE {s}.app_release_activities SET instance_id='{NAMES[1]}' WHERE id='scope-0003';")
        self.sql(f"UPDATE {s}.app_worker_tick_receipts SET phase='completed' WHERE tick_id='tick-running';")
        completed = self.read(m, previous=before.private)
        self.check('previous_tick_completed_is_retained', lambda: self.require(
            'tick-running' in self.ids(completed,'app_worker_tick_receipts') and
            m.compare_task_snapshots(before.private,completed.private)['preservationVerified'],'completed tick original lost'))
        self.sql(f"UPDATE {s}.app_worker_tick_receipts SET phase='completed' WHERE tick_id='tick-unknown';")
        unknown = self.read(m, previous=before.private)
        self.check('unknown_tick_completion_without_proof_rejected', lambda: self.require(
            'tick-unknown' in self.ids(unknown,'app_worker_tick_receipts') and
            not m.compare_task_snapshots(before.private,unknown.private)['preservationVerified'],'UNKNOWN tick was cleared'))
        self.sql(f"UPDATE {s}.app_worker_tick_receipts SET phase='unknown' WHERE tick_id='tick-unknown';")
        self.sql(f"DELETE FROM {s}.app_release_activities WHERE id='scope-0002';")
        deleted = self.read(m, previous=before.private)
        self.check('deleted_original_rejected', lambda: self.require(
            not m.compare_task_snapshots(before.private, deleted.private)['preservationVerified'], 'deleted original accepted'))
        self.sql(f"INSERT INTO {s}.app_release_activities(id,instance_id,state) VALUES('scope-0002','{NAMES[0]}','running');")

        small = self.read(m, budget={'scan_rows': 128})
        self.check('scoped_scan_budget_still_fail_closed', lambda: self.require(
            not small.public['preservationComplete'] and not m.compare_task_snapshots(small.private, small.private)['preservationVerified'],
            'small budget ignored'))
        self.sql(f'ALTER TABLE {s}.app_release_activities DROP CONSTRAINT app_release_activities_pkey;')
        no_pk = self.read(m)
        self.check('scope_without_trusted_pk_fail_closed', lambda: self.require(
            not no_pk.public['preservationComplete'] and not m.compare_task_snapshots(no_pk.private, no_pk.private)['preservationVerified'],
            'unverified PK accepted'))
        self.sql(f'ALTER TABLE {s}.app_release_activities ADD PRIMARY KEY(id);')
        self.sql(f'ALTER TABLE {s}.app_release_activities RENAME COLUMN instance_id TO instance_removed;')
        no_column = self.read(m)
        self.check('scope_missing_instance_column_fail_closed', lambda: self.require(
            not no_column.public['preservationComplete'] and not m.compare_task_snapshots(no_column.private, no_column.private)['preservationVerified'],
            'missing scope column accepted'))
        self.sql(f'ALTER TABLE {s}.app_release_activities RENAME COLUMN instance_removed TO instance_id;')

        # The SQL history guard remains exact and independent of the source scope.
        mock = SimpleNamespace(c={'oldNames': {'web': NAMES[0]}, 'newNames': {'web': NAMES[1]}},
                               tx=SimpleNamespace(save=lambda name, data: (self.out/name).write_text(json.dumps(data))))
        mock.sql = lambda q: [json.loads(v) for v in self.sql(q.replace('FROM app_', 'FROM '+s+'.app_')).splitlines()]
        guard = caller.HistoricalEvidence(mock);guard.establish();guard.check('unchanged')
        self.sql(f"UPDATE {s}.app_release_activities SET state='finished' WHERE id='old-0010000';")
        def changed_history():
            try: guard.check('changed')
            except Exception as e:
                self.require(str(e) == 'RETAINED_HISTORICAL_OBSERVATIONS_CHANGED', str(e));return
            raise AssertionError('historical UNKNOWN silently accepted')
        self.check('historical_unknown_change_still_rejected', changed_history)
        (self.out/'MODIFIED.json').write_text(json.dumps(before.public, indent=2))

    def reject_pair(self, pair):
        try: caller.current_activity_collector(pair)
        except Exception: return
        raise AssertionError('invalid pair accepted')

    def test_explain_scope(self, m):
        reg = self.schema + '.app_release_activities';i = list(m.KEYS).index('app_release_activities')
        state = {'ok': True, 'reason': '', 'pages': 0, 'scanRows': 0, 'graphBytes': 0, 'proofBytes': 0, 'selectedRows': 0}
        prefix = "BEGIN READ ONLY; SET LOCAL search_path=pg_catalog;\nSELECT " + m.save_setting('state', m.literal(json.dumps(state))+'::jsonb') + ' AS state, ' + m.save_setting('graph_'+str(i), "'[]'::jsonb") + ' AS graph \\gset init_\n'
        prefix += m.catalog_sql(reg, 'id', ('instance_id',)) + f' \\gset table_{i}_\n' + m.graph_projection_sql(reg) + f' \\gset table_{i}_\n'
        query = m.page_graph_sql(i, 'app_release_activities', reg, 'id', m.budgets({'page_rows': 32}), first=True)
        raw = self.sql(prefix + 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query + '\nROLLBACK;')
        plan = json.loads(raw);(self.out/'EXPLAIN_SCOPE.json').write_text(json.dumps(plan, indent=2))
        nodes = []
        def walk(n):
            nodes.append(n)
            for child in n.get('Plans', []): walk(child)
        walk(plan[0]['Plan'])
        keys = [n for n in nodes if n.get('Subplan Name') == 'CTE page_keys']
        pages = [n for n in nodes if n.get('Subplan Name') == 'CTE page']
        self.check('explain_scoped_keys_before_projection', lambda: self.require(
            len(keys)==len(pages)==1 and keys[0]['Actual Rows']==pages[0]['Actual Rows']==32 and
            any('instance_id' in str(n.get('Index Cond', '')) + str(n.get('Filter', '')) for n in nodes),
            'scope not applied inside bounded native key page'))


def main():
    p = argparse.ArgumentParser();p.add_argument('--output', required=True);p.add_argument('--baseline-module')
    args = p.parse_args();args.module = str(Path(__file__).with_name('release47_task_snapshot.py'))
    args.fixture_id = None;args.phase = 'ACTIVITY_SCOPE'
    f = ScopeFixture(args)
    try: f.start();f.run()
    except Exception as e:
        f.failed.append({'name': 'runner', 'error': str(e)});print('RUNNER_ERROR ' + str(e), flush=True)
    finally: f.close()
    return 1 if f.failed or f.cleanup_errors else 0


if __name__ == '__main__':sys.exit(main())
