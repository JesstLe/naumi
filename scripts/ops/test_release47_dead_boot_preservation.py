"""Pure validation and SQL contract tests; no remote/runtime/paid calls."""
import copy
import hashlib
import json
import unittest
from unittest.mock import patch

import release47_dead_boot_preservation as m
from release47_host import Hold


class Preservation(unittest.TestCase):
    def setUp(self):
        self.web = {'name':'web-old','id':'container-fixed','image':'image-fixed',
                    'running':True,'startedAt':'2026-10-23T08:34:00Z','restartPolicy':'no'}
        self.identity = {'instanceId':'web-old','bootId':'current-boot','commit':'fixed'}
        self.app = {'identity':self.identity,'admission':{'mode':'draining'},
                    'observations':dict(activeRequests=0,trackedRequests=0,trackedAcceptedWork=0,
                                        agentRuns=0,unknownLeases=1),
                    'transport':{'verified':True,'transport':dict(completeFromProcessStart=True,
                        accountingFault=False,activeRequests=0,startedRequests=4,finishedRequests=4)}}
        activity = dict(id='activity-1',instance_id='web-old',boot_id='old-boot',state='unknown',
                        activity_kind='accepted-work',work_scope='durable-image',work_key='generate:job-one',
                        claim_token='claim-original',started_at='2026-10-22T08:00:00Z',
                        heartbeat_at='2026-10-22T08:01:00Z')
        job = dict(id='job-one',kind='generate',lease_token='claim-original',
                   lease_until='2026-10-22T08:05:00Z',snapshot={'status':'pending',
                   'paidOperations':{'job-one':{'state':'done','bytes':'original'}}})
        self.review = dict(web=copy.deepcopy(self.web),identity=copy.deepcopy(self.identity),
                           app_release_activities=[self.pack(activity)],app_image_jobs=[self.pack(job)],
                           app_imagegen_batches=[],app_reference_operations=[],
                           relatedRaw='{"exact_numeric": 12345678901234567890.123456789}',
                           relatedSha256='f'*64,relatedFences=[])
        self.cfg = dict(oldWeb=self.web,currentBoot='current-boot',physicalStartedAt=self.web['startedAt'],
                        environment={'NAUMI_ENVIRONMENT':'staging','NAUMI_STAGING_HISTORY_GUARD':'1'},
                        jobIds=['job-one'],extraRows=[],
                        expectedActivities={'activity-1':self.review['app_release_activities'][0]['sha256']},
                        expectedJobs={'job-one':self.review['app_image_jobs'][0]['sha256']},
                        expectedReviewSha256=m.review_sha(self.review))
        self.saved, self.queries, self.writes = [], [], []
        self.domain = dict(drained=True,absentTables=[],activeFences=0,activeTransactions=0,advisoryLocks=0,
                           counts=dict(imageJobs=0,canvasImages=0,videoPolls=0,supplierCosts=0,imagegenItems=0))
        self.receipt = dict(fencedRows=1,relatedFencedRows=0,carriedOldBootObservations=1,currentUnknown=0,
                            paidReplays=0,businessRowMutations=0,reviewSha256=self.cfg['expectedReviewSha256'])

    @staticmethod
    def pack(row):
        raw = json.dumps(row,sort_keys=True)
        return {'id':row['id'],'raw':raw,'sha256':hashlib.sha256(raw.encode()).hexdigest()}

    def sql(self, query):
        self.queries.append(query)
        if "json_build_object('triggerMatch'" in query:
            return [{'triggerMatch':True}]
        if "json_build_object('match'" in query:
            return [{'match':True}]
        return [{k:copy.deepcopy(v) for k,v in self.review.items() if k not in ('web','identity')}]

    def write(self, query):
        self.writes.append(query)
        return [copy.deepcopy(self.receipt)]

    def guard(self):
        return m.Guard(self.cfg,self.sql,lambda *a:self.saved.append(a),write_sql=self.write)

    def repin(self):
        self.cfg['expectedReviewSha256'] = m.review_sha(self.review)

    def test_collect_returns_raw_pg_text_without_numeric_roundtrip(self):
        value = m.collect_review(self.sql,self.web,self.app,['job-one'])
        self.assertEqual(value,self.review)
        self.assertIn('12345678901234567890.123456789',value['relatedRaw'])
        self.assertIn('READ ONLY',self.queries[-1])

    def test_fence_only_writes_exact_origin_rows_and_preserves_business_rows(self):
        before = copy.deepcopy(self.review)
        guard = self.guard()
        guard.establish(self.web,self.app)
        self.assertEqual(guard.apply(self.web,self.app),self.receipt)
        statement = self.writes[0]
        self.assertIn('INSERT INTO naumi_staging_guard.origin_rows',statement)
        self.assertIn('ON CONFLICT DO NOTHING',statement)
        self.assertIn('FOR UPDATE',statement)
        self.assertIn('pg_advisory_xact_lock',statement)
        self.assertIn('DEAD_BOOT_FULL_ROW_CAS_CHANGED',statement)
        self.assertIn('DEAD_BOOT_EXISTING_FENCE_MISMATCH',statement)
        self.assertNotRegex(statement,r'(?i)\b(?:UPDATE|DELETE FROM)\s+(?:app_|naumi_)')
        self.assertEqual(self.review,before)
        self.assertEqual(len(self.writes),1)

    def test_environment_must_enable_staging_guard(self):
        for env in ({},{'NAUMI_ENVIRONMENT':'production','NAUMI_STAGING_HISTORY_GUARD':'1'},
                    {'NAUMI_ENVIRONMENT':'staging','NAUMI_STAGING_HISTORY_GUARD':'0'}):
            self.cfg['environment'] = env
            with self.assertRaises(Hold): self.guard()

    def test_row_hash_or_signed_review_change_denied_before_write(self):
        self.review['app_image_jobs'][0]['sha256'] = 'b'*64
        with self.assertRaises(Hold): self.guard().establish(self.web,self.app)
        self.assertEqual(self.writes,[])

    def test_unpinned_extra_unknown_and_current_boot_rows_denied(self):
        for boot in ('old-boot','current-boot'):
            original = copy.deepcopy(self.review)
            row = json.loads(self.review['app_release_activities'][0]['raw'])
            row.update(id='extra',boot_id=boot)
            self.review['app_release_activities'].append(self.pack(row))
            self.repin()
            with self.assertRaises(Hold): self.guard().establish(self.web,self.app)
            self.review = original
        self.assertEqual(self.writes,[])

    def test_lease_owner_change_denied_even_after_review_resigned(self):
        row = json.loads(self.review['app_image_jobs'][0]['raw'])
        row['lease_token'] = 'new-terminal-lease'
        self.review['app_image_jobs'] = [self.pack(row)]
        self.cfg['expectedJobs']['job-one'] = self.review['app_image_jobs'][0]['sha256']
        self.repin()
        with self.assertRaisesRegex(Hold,'OWNER_CHANGED'): self.guard().establish(self.web,self.app)

    def lease_case(self, lease_until, token='claim-original'):
        row = json.loads(self.review['app_image_jobs'][0]['raw'])
        row.update(lease_until=lease_until,lease_token=token)
        self.review['app_image_jobs'] = [self.pack(row)]
        self.cfg['expectedJobs']['job-one'] = self.review['app_image_jobs'][0]['sha256']
        self.repin()
        now = m.timestamp('2026-10-23T12:00:00Z')
        with patch.object(m.dt,'datetime',wraps=m.dt.datetime) as clock:
            clock.now.return_value = now
            return self.guard().establish(self.web,self.app)

    def test_expired_lease_crossing_physical_start_passes(self):
        result = self.lease_case('2026-10-23T08:35:00Z')
        self.assertEqual(result,self.review)
        self.assertEqual(self.writes,[])

    def test_lease_at_or_after_now_holds(self):
        for until in ('2026-10-23T12:00:00Z','2026-10-23T12:00:01Z'):
            with self.subTest(until=until),self.assertRaisesRegex(Hold,'LIVE_JOB_LEASE'):
                self.lease_case(until)
        self.assertEqual(self.writes,[])

    def test_expired_crossing_lease_with_owner_mismatch_still_holds(self):
        with self.assertRaisesRegex(Hold,'OWNER_CHANGED'):
            self.lease_case('2026-10-23T08:35:00Z',token='different-owner')
        self.assertEqual(self.writes,[])

    def add_related(self):
        self.review['relatedFences'] = [
            dict(table=table,keyColumn=key,rowKey=f'{table}-{i}',sha256=hashlib.sha256(f'{table}:{i}'.encode()).hexdigest())
            for table,key,n in [('app_billing_operations','id',15),('app_gen_reservations','job_id',15),
                                ('app_supplier_calls','id',11),('app_supplier_cost_jobs','key',2)]
            for i in range(n)]
        self.repin()
        self.receipt.update(relatedFencedRows=43,reviewSha256=self.cfg['expectedReviewSha256'])

    def test_43_related_fences_separate_count_pg_hash_and_key_columns(self):
        self.add_related()
        before = copy.deepcopy(self.review)
        guard = self.guard()
        guard.establish(self.web,self.app)
        receipt = guard.apply(self.web,self.app)
        statement = self.writes[0]
        self.assertEqual(receipt['fencedRows'],1)
        self.assertEqual(receipt['relatedFencedRows'],43)
        self.assertEqual(statement.count('INSERT INTO naumi_staging_guard.origin_rows'),44)
        self.assertIn("'app_gen_reservations','job_id'",statement)
        self.assertIn("'app_supplier_cost_jobs','key'",statement)
        for row in self.review['relatedFences']:
            self.assertIn(row['sha256'],statement)
        self.assertIn("sha256(convert_to(value::text,'UTF8'))",self.queries[0])
        self.assertIn('12345678901234567890.123456789',statement)
        self.assertNotRegex(statement,r'(?i)\b(?:UPDATE|DELETE FROM)\s+(?:app_|naumi_)')
        self.assertNotIn("VALUES('app_imagegen_batch_items'",statement)
        self.assertEqual(self.review,before)
        self.assertEqual(guard.check(self.web,self.app)['relatedFencedRows'],43)

    def test_related_fence_missing_or_wrong_hash_denies_check(self):
        self.add_related()
        guard = self.guard()
        guard.establish(self.web,self.app)
        guard.apply(self.web,self.app)
        original = self.sql
        def missing(query):
            if "json_build_object('match'" in query:
                self.assertIn("table_name='app_supplier_cost_jobs'",query)
                self.assertIn("key_column='key'",query)
                return [{'match':False}]
            return original(query)
        guard.sql = missing
        with self.assertRaisesRegex(Hold,'FENCE_MISSING_OR_CHANGED'):
            guard.check(self.web,self.app)

    def test_related_count_or_manifest_invalid_denies(self):
        self.add_related()
        guard = self.guard()
        guard.establish(self.web,self.app)
        guard.write_sql = lambda q:[{**self.receipt,'relatedFencedRows':42}]
        with self.assertRaisesRegex(Hold,'RECEIPT_INVALID'): guard.apply(self.web,self.app)
        self.review['relatedFences'][0]['table'] = 'app_ledger'
        self.repin()
        with self.assertRaisesRegex(Hold,'RELATED_FENCE_INVALID'):
            self.guard().establish(self.web,self.app)

    def test_related_cost_or_call_mutation_aborts_before_write(self):
        self.add_related()
        guard = self.guard()
        guard.establish(self.web,self.app)
        self.review['relatedFences'][-1]['sha256'] = '0'*64
        with self.assertRaisesRegex(Hold,'REVIEW_HASH'):
            guard.check(self.web,self.app)
        self.assertEqual(self.writes,[])

    def test_collect_snapshots_media_outputs_and_callback_inbox_without_fencing(self):
        m.collect_review(self.sql,self.web,self.app,['job-one'])
        query = self.queries[-1]
        for table in ('app_media_postprocess','app_supplier_call_outputs','app_supplier_callback_inbox'):
            self.assertIn(f'FROM {table} x',query)
            self.assertNotIn(f"'table','{table}'",query)
        self.assertIn('parent_operation_id IN',query)

    def test_only_two_missing_triggers_can_be_created_in_cas_transaction(self):
        guard = self.guard()
        guard.establish(self.web,self.app)
        statement = guard._statement(self.web,self.app)
        self.assertEqual(statement.count('CREATE TRIGGER naumi_staging_history_freeze'),2)
        for table in ('app_imagegen_batches','app_reference_operations'):
            self.assertIn(f'BEFORE UPDATE OR DELETE ON public.{table}',statement)
        for table in m.TRIGGER_KEYS:
            self.assertIn(f'DEAD_BOOT_FREEZE_TRIGGER_INVALID:{table}',statement)
        self.assertLess(statement.index('DEAD_BOOT_FULL_ROW_CAS_CHANGED'),statement.index('CREATE TRIGGER'))
        self.assertLess(statement.index('CREATE TRIGGER'),statement.index('INSERT INTO naumi_staging_guard.origin_rows'))
        self.assertNotIn('CREATE OR REPLACE FUNCTION',statement)
        self.assertNotIn('DROP TRIGGER',statement)
        self.assertNotIn('ENABLE TRIGGER',statement)
        self.assertNotIn('DISABLE TRIGGER',statement)

    def test_trigger_catalog_checks_exact_function_events_args_and_enabled(self):
        check = m._trigger_match('app_gen_reservations','job_id')
        for predicate in ("n.nspname='naumi_staging_guard'","p.proname='freeze_imported_row'",
                          "p.pronargs=0","p.prorettype='pg_catalog.trigger'::regtype",
                          "t.tgtype=27","t.tgnargs=1","t.tgqual IS NULL",
                          "t.tgenabled IN ('O','A')","convert_to('job_id','UTF8')||decode('00','hex')"):
            self.assertIn(predicate,check)

    def test_missing_disabled_or_wrong_trigger_denies_continuing_check(self):
        guard = self.guard()
        guard.establish(self.web,self.app)
        guard.apply(self.web,self.app)
        original = self.sql
        def invalid(query):
            if "json_build_object('triggerMatch'" in query:
                self.assertIn("public.app_reference_operations",query)
                self.assertIn("public.app_imagegen_batches",query)
                return [{'triggerMatch':False}]
            return original(query)
        guard.sql = invalid
        with self.assertRaisesRegex(Hold,'FREEZE_TRIGGER_MISSING_OR_CHANGED'):
            guard.check(self.web,self.app)

    def test_trigger_ddl_failure_never_returns_a_fence_receipt_or_retries(self):
        guard = self.guard()
        guard.establish(self.web,self.app)
        def deny(query):
            self.writes.append(query)
            raise Hold('DEAD_BOOT_FREEZE_TRIGGER_INVALID:app_billing_operations')
        guard.write_sql = deny
        with self.assertRaisesRegex(Hold,'FREEZE_TRIGGER_INVALID'):
            guard.apply(self.web,self.app)
        self.assertEqual(len(self.writes),1)
        self.assertIsNone(guard.receipt)

    def test_sql_cas_failure_is_not_retried_or_reported_applied(self):
        guard = self.guard()
        guard.establish(self.web,self.app)
        def deny(query):
            self.writes.append(query)
            raise Hold('DEAD_BOOT_FULL_ROW_CAS_CHANGED')
        guard.write_sql = deny
        with self.assertRaises(Hold): guard.apply(self.web,self.app)
        self.assertIsNone(guard.receipt)
        self.assertEqual(len(self.writes),1)

    def test_conflicting_existing_fence_or_missing_receipt_is_not_success(self):
        guard = self.guard()
        guard.establish(self.web,self.app)
        def conflict(query):
            raise Hold('DEAD_BOOT_EXISTING_FENCE_MISMATCH')
        guard.write_sql = conflict
        with self.assertRaisesRegex(Hold,'EXISTING_FENCE'): guard.apply(self.web,self.app)
        self.assertIsNone(guard.receipt)
        guard.write_sql = lambda q:[{**self.receipt,'fencedRows':0}]
        with self.assertRaisesRegex(Hold,'RECEIPT_INVALID'): guard.apply(self.web,self.app)

    def test_dollar_marker_in_raw_rows_is_not_sql_delimiter(self):
        self.review['relatedRaw'] = '{"original":"$deadboot$"}'
        self.repin()
        guard = self.guard()
        guard.establish(self.web,self.app)
        statement = guard._statement(self.web,self.app)
        self.assertIn('DO $deadboot_x$',statement)
        self.assertIn('$deadboot$',statement)

    def test_post_fence_change_or_missing_guard_row_aborts_check(self):
        guard = self.guard()
        guard.establish(self.web,self.app)
        guard.apply(self.web,self.app)
        self.review['relatedRaw'] += ' '
        with self.assertRaisesRegex(Hold,'REVIEW_HASH'): guard.check(self.web,self.app)

    def test_current_identity_and_physical_startedat_bound(self):
        for field,value in [('id','different'),('startedAt','2026-10-23T08:35:00Z')]:
            changed = {**self.web,field:value}
            with self.assertRaises(Hold): self.guard().establish(changed,self.app)

    def test_bad_id_and_fence_table_never_reach_sql(self):
        for bad in (['x;DELETE'],['same','same'],['a']*101):
            with self.assertRaises(Hold): m.collect_review(self.sql,self.web,self.app,bad)
        with self.assertRaises(Hold):
            m.collect_review(self.sql,self.web,self.app,['job-one'],[{'table':'app_ledger','rowKey':'x'}])
        self.assertEqual(self.queries,[])

    def test_exact_extra_parent_requires_closure_proof(self):
        row = self.pack(dict(id='imagegen-parent',kind='imagegen',lease_token=None,snapshot={'status':'running'}))
        self.review['app_image_jobs'].append(row)
        self.cfg['expectedJobs'][row['id']] = row['sha256']
        extra = dict(table='app_image_jobs',rowKey=row['id'],sha256=row['sha256'])
        self.cfg['extraRows'] = [extra]
        self.repin()
        with self.assertRaisesRegex(Hold,'LINK_PROOF'): self.guard().establish(self.web,self.app)
        extra['linkProofSha256'] = self.review['relatedSha256']
        self.guard().establish(self.web,self.app)

    def test_drain_preserves_raw_unknown_instead_of_zeroing(self):
        before = copy.deepcopy(self.app)
        result = m.current_drained(self.app,self.domain,{},[{'state':'idle'}],self.review,
                                   self.receipt,worker_preserved=True)
        self.assertEqual(result['carriedOldBootObservations'],1)
        self.assertEqual(result['currentUnknown'],0)
        self.assertEqual(result['rawApp']['observations']['unknownLeases'],1)
        self.assertFalse(result['historicalDrainProven'])
        self.assertEqual(self.app,before)

    def test_raw_unknown_extra_or_synthetic_zero_aborts(self):
        for count in (0,2,True,None):
            self.app['observations']['unknownLeases'] = count
            with self.assertRaises(Hold):
                m.current_drained(self.app,self.domain,{},[],self.review,self.receipt,worker_preserved=True)

    def test_every_current_work_transport_owner_domain_gate_remains(self):
        cases = [('obs','trackedAcceptedWork',1),('obs','agentRuns',1),
                 ('transport','activeRequests',1),('transport','finishedRequests',3),
                 ('domain','activeTransactions',1),('domain','drained',False)]
        for kind,key,value in cases:
            app, domain = copy.deepcopy(self.app),copy.deepcopy(self.domain)
            target = app['observations'] if kind=='obs' else app['transport']['transport'] if kind=='transport' else domain
            target[key] = value
            with self.subTest(kind=kind,key=key),self.assertRaises(Hold):
                m.current_drained(app,domain,{},[],self.review,self.receipt,worker_preserved=True)
        with self.assertRaises(Hold):
            m.current_drained(self.app,self.domain,{},[{'state':'active'}],self.review,self.receipt,worker_preserved=True)


if __name__ == '__main__':
    unittest.main()
