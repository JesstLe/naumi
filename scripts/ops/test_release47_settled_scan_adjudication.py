import copy
import datetime as dt
import pathlib
import subprocess
import unittest

import release47_settled_scan_adjudication as m
from release47_host import Hold, assert_drain

NOW = dt.datetime(2026, 11, 1, 15, 10, tzinfo=dt.timezone.utc)


def fixture(name='naumi47-web-capacity-20261029-r2'):
    """Public collector contract example. All data here is explicitly a fixture."""
    case = m.CASES[name]
    web = dict(name=name, id=case['webId'], image=case['image'], running=True,
               restartPolicy='no', startedAt='2026-10-29T04:42:52.755411495Z')
    worker = dict(name=case['workerName'], id=case['workerId'], image=case['image'],
                  running=case['workerRunning'], restartPolicy='no', startedAt='2026-10-30T01:56:44.822852582Z')
    rows = [dict(id=identifier, instance_id=name, boot_id=case['webBoot'], activity_kind='accepted-work',
                 state='unknown', work_scope='durable-image', work_key=case['scanKeys'][identifier],
                 admission_key=case['scanKeys'][identifier], claim_token=None, parent_id=None,
                 finished_at=None, outcome='background-promise-unconfirmed',
                 started_at='2026-10-30T08:46:51.218909+00:00', heartbeat_at='2026-10-30T08:47:06.184082+00:00')
            for identifier in sorted(case['scanIds'])]
    preservation = {'pendingJobIds': ['imagegen-original-parent', 'job-original-child'],
                    'tables': {table: {'rowCount': 2 if table == 'app_image_jobs' else 1,
                                       'sha256': m.digest([{'table': table, 'fixture': True}])}
                               for table in m.PRESERVATION_TABLES}}
    tick = dict(tick_id=m.TICK_ID, worker_instance_id=case['workerName'], worker_boot_id=m.WORKER_BOOT,
                worker_commit=case['commit'], web_instance_id=name, web_boot_id=case['webBoot'],
                web_commit=case['commit'], phase='unknown', completed_at=None, result=None,
                accepted_at='2026-10-30T08:46:50.725496+00:00') if case['workerRunning'] else None
    spec = dict(target=m.TARGET, releaseId=m.RELEASE_ID, authorization=m.AUTHORIZATION,
                canonicalSha256='a' * 64, webIdentity=web, workerIdentity=worker,
                sourceHashes=copy.deepcopy(m.SOURCE_HASHES[case['commit']]), scanRows=rows,
                scanRowsSha256=m.digest(rows), tickReceipt=tick, tickReceiptSha256=m.digest(tick),
                preservation=preservation, preservationSha256=m.digest(preservation))
    samples = []
    for seconds in [4, 1]:
        at = (NOW - dt.timedelta(seconds=seconds)).isoformat()
        app = dict(schemaVersion=1, identity=dict(instanceId=name, bootId=case['webBoot'], commit=case['commit'], bootSource='preload'),
                   observedAt=at, admission=dict(mode='draining', revision=3),
                   observations=dict(activeRequests=0, trackedRequests=0, trackedAcceptedWork=0, agentRuns=0,
                                     unknownLeases=2, acceptedTasks=None, agentSessions=None),
                   transport=dict(verified=True, transport=dict(completeFromProcessStart=True, accountingFault=False,
                                                               activeRequests=0, startedRequests=100, finishedRequests=100)))
        worker_status = dict(schemaVersion=1, instanceId=case['workerName'], bootId=m.WORKER_BOOT, commit=case['commit'],
                             targetInstanceId=name, origin='http://' + name + ':3000', observedAt=at,
                             paused=True, phase='UNKNOWN', activeTicks=0, unresolvedTicks=1, controlFault=None,
                             lastTick=dict(id=m.TICK_ID, phase='unknown', workerBootId=m.WORKER_BOOT,
                                           workerInstanceId=case['workerName'], workerCommit=case['commit'],
                                           targetWebInstanceId=name, httpStatus=503, failure={'code': 'TICK_HTTP_ERROR'},
                                           startedAt='2026-10-30T08:46:50.507Z', finishedAt='2026-10-30T08:47:06.205Z'),
                             mediaWorker=dict(ok=True, version=case['commit'], sandbox=True, draining=True,
                                              running=0, queued=0)) if case['workerRunning'] else None
        samples.append(dict(observedAt=at, canonicalSha256=spec['canonicalSha256'],
                            webIdentity=copy.deepcopy(web), workerIdentity=copy.deepcopy(worker),
                            webEnvironment=dict(SOURCE_COMMIT=case['commit'], NAUMI_VIDEO_WORKER='0', INTERNAL_APP_ORIGIN='http://127.0.0.1:3000',
                                                MEDIA_WORKER_ORIGIN='http://' + case['workerName'] + ':3002'),
                            workerEnvironment=dict(SOURCE_COMMIT=case['commit'], NAUMI_APP_ORIGIN='http://' + name + ':3000'),
                            app=app, activities=copy.deepcopy(rows),
                            activitiesCoverage='all-nonfinished-for-exact-instance-and-boot',
                            owners=[], ownersCoverage='all-for-exact-instance',
                            domain=dict(schema=1, scope='shared-database', drained=True, absentTables=[],
                                        counts={k: 0 for k in m.DOMAIN_COUNTS}, activeFences=0, activeTransactions=0, advisoryLocks=0),
                            domainObservedAt=at, workerStatus=worker_status, tickReceipt=copy.deepcopy(tick),
                            preservation=copy.deepcopy(preservation), routingReferences=[],
                            internalReferences=[{'source': 'associated-worker', 'containerId': case['workerId'],
                                                 'environmentKey': 'NAUMI_APP_ORIGIN', 'origin': 'http://' + name + ':3000'}]
                            if case['workerRunning'] else []))
    return spec, samples


class SettledScanAdjudication(unittest.TestCase):
    def setUp(self):
        self.spec, self.samples = fixture()

    def run_policy(self):
        return m.adjudicate(self.spec, self.samples, now=NOW)

    def test_original_generic_retirement_rejects_missing_complete_execution_proof(self):
        # Baseline remains fail-closed. The new adjudication is NOT itself a
        # generic HostTransaction.retire receipt and cannot be passed as one.
        with self.assertRaisesRegex(Hold, 'DRAIN_COVERAGE_INCOMPLETE'):
            assert_drain({'identity': self.spec['webIdentity'], 'coverage': 'partial'}, self.spec['webIdentity'], NOW)
        proof = self.run_policy()
        with self.assertRaises(Hold):
            assert_drain(proof, self.spec['webIdentity'], NOW)

    def test_r2_adjudicates_coordinator_only_without_input_mutation(self):
        before = copy.deepcopy((self.spec, self.samples))
        proof = self.run_policy()
        self.assertEqual(before, (self.spec, self.samples))
        self.assertTrue(proof['currentExecutableWorkDrained'])
        self.assertEqual(proof['coordinatorDisposition'], 'settled-with-error')
        self.assertEqual(proof['carriedUnknownObservations'], 2)
        self.assertFalse(proof['originalTickCompleted'])
        self.assertFalse(proof['paidOutcomeReclassified'])
        self.assertFalse(proof['databaseMutationRequired'])
        self.assertEqual(self.samples[-1]['app']['observations']['unknownLeases'], 2)
        self.assertIsNone(self.samples[-1]['app']['observations']['acceptedTasks'])
        self.assertTrue(proof['requiresAssociatedWorkerRetirementBeforeWeb'])
        self.assertEqual(proof['retirementOrder'], [self.spec['workerIdentity']['id'], self.spec['webIdentity']['id']])

    def test_configured_worker_reference_cannot_be_hidden_as_empty(self):
        self.samples[1]['internalReferences'] = []
        with self.assertRaisesRegex(Hold, 'INTERNAL_REFERENCES_NOT_ISOLATED'):
            self.run_policy()

    def test_supervisor_or_other_container_reference_blocks(self):
        for ref in [{'source': 'supervisor', 'web': self.spec['webIdentity']['name']},
                    {'source': 'container', 'containerId': 'a' * 64, 'origin': self.samples[1]['workerEnvironment']['NAUMI_APP_ORIGIN']}]:
            self.spec, self.samples = fixture()
            self.samples[1]['internalReferences'].append(ref)
            with self.assertRaises(Hold): self.run_policy()

    def test_r1_uses_already_stopped_associated_worker_not_live_r2_media(self):
        spec, samples = fixture('naumi47-web-capacity-20261029-r1')
        proof = m.adjudicate(spec, samples, now=NOW)
        self.assertEqual(proof['associatedWorkerDisposition'], 'already-stopped')
        self.assertIsNone(proof['tickId'])
        samples[1]['workerIdentity']['running'] = True
        with self.assertRaises(Hold):
            m.adjudicate(spec, samples, now=NOW)

    def test_stopped_worker_none_must_be_explicit_not_missing(self):
        spec, samples = fixture('naumi47-web-capacity-20261029-r1')
        del samples[1]['workerStatus']
        with self.assertRaisesRegex(Hold, 'COMPLETE_SAMPLE_REQUIRED'):
            m.adjudicate(spec, samples, now=NOW)

    def test_naive_evaluation_timestamp_rejected(self):
        with self.assertRaisesRegex(Hold, 'UTC_EVALUATION_TIME_REQUIRED'):
            m.adjudicate(self.spec, self.samples, now=NOW.replace(tzinfo=None))

    def test_exact_authorization_and_release_target(self):
        for field, value in [('target', '103.30.76.93'), ('releaseId', 'another-release'), ('authorization', '上线一版')]:
            spec = {**self.spec, field: value}
            with self.subTest(field=field), self.assertRaises(Hold):
                m.adjudicate(spec, self.samples, now=NOW)

    def test_source_hashes_are_pinned_not_a_reviewed_boolean(self):
        self.spec['sourceHashes']['src/lib/durable-image-jobs.ts'] = 'b' * 64
        with self.assertRaisesRegex(Hold, 'REVIEWED_SOURCE_HASHES_REQUIRED'):
            self.run_policy()

    def test_source_pins_match_real_git_objects(self):
        root = pathlib.Path(__file__).resolve().parents[2]
        for commit, files in m.SOURCE_HASHES.items():
            for path, wanted in files.items():
                body = subprocess.check_output(['git', '-C', str(root), 'show', commit + ':' + path])
                self.assertEqual(m.hashlib.sha256(body).hexdigest(), wanted, (commit, path))

    def test_unknown_scope_or_job_key_is_not_a_scan(self):
        for key, value in [('work_scope', 'supplier-scan'), ('work_key', 'generate:job-x'),
                           ('outcome', 'detached-background-unconfirmed'), ('claim_token', 'token'),
                           ('finished_at', NOW.isoformat()), ('admission_key', 'another')]:
            spec, samples = fixture()
            spec['scanRows'][0][key] = value
            spec['scanRowsSha256'] = m.digest(spec['scanRows'])
            for sample in samples:
                sample['activities'] = copy.deepcopy(spec['scanRows'])
            with self.subTest(key=key), self.assertRaises(Hold):
                m.adjudicate(spec, samples, now=NOW)

    def test_row_byte_change_without_changed_identity_is_rejected(self):
        self.samples[1]['activities'][0]['detail'] = 'later edit'
        with self.assertRaisesRegex(Hold, 'SCAN_ROW_BYTES_CHANGED'):
            self.run_policy()

    def test_extra_activity_or_partial_inventory_blocks(self):
        self.samples[1]['activities'].append(copy.deepcopy(self.samples[1]['activities'][0]))
        with self.assertRaises(Hold): self.run_policy()
        self.spec, self.samples = fixture()
        self.samples[1]['activitiesCoverage'] = 'parent-id-only'
        with self.assertRaises(Hold): self.run_policy()

    def test_boot_or_image_or_origin_change_blocks(self):
        changes = [lambda s: s['app']['identity'].__setitem__('bootId', '00000000-0000-0000-0000-000000000000'),
                   lambda s: s['webIdentity'].__setitem__('image', 'sha256:' + 'f' * 64),
                   lambda s: s['webEnvironment'].__setitem__('MEDIA_WORKER_ORIGIN', 'http://other:3002'),
                   lambda s: s['webEnvironment'].__setitem__('NAUMI_VIDEO_WORKER', '1')]
        for change in changes:
            self.spec, self.samples = fixture(); change(self.samples[1])
            with self.assertRaises(Hold): self.run_policy()

    def test_domain_absence_expired_fence_and_noninteger_zero_block(self):
        changes = [lambda d: d['counts'].__setitem__('imageJobs', 1),
                   lambda d: d.__setitem__('activeTransactions', 1),
                   lambda d: d.__setitem__('advisoryLocks', 1),
                   lambda d: d.__setitem__('absentTables', ['app_image_jobs']),
                   lambda d: d['counts'].__setitem__('canvasImages', False),
                   lambda d: d.__setitem__('activeFences', '0')]
        for change in changes:
            self.spec, self.samples = fixture(); change(self.samples[1]['domain'])
            with self.assertRaises(Hold): self.run_policy()

    def test_agent_or_http_or_new_work_blocks(self):
        changes = [lambda s: s['owners'].append({'instance_id': self.spec['webIdentity']['name'], 'state': 'unknown'}),
                   lambda s: s['app']['observations'].__setitem__('trackedAcceptedWork', 1),
                   lambda s: s['app']['observations'].__setitem__('unknownLeases', 3),
                   lambda s: s['app']['transport']['transport'].__setitem__('activeRequests', 1),
                   lambda s: s['app']['admission'].__setitem__('mode', 'open')]
        for change in changes:
            self.spec, self.samples = fixture(); change(self.samples[1])
            with self.assertRaises(Hold): self.run_policy()

    def test_original_tick_missing_complete_or_changed_blocks(self):
        for field, value in [('phase', 'completed'), ('tick_id', '00000000-0000-0000-0000-000000000000'),
                             ('completed_at', NOW.isoformat()), ('result', {'ok': True}), ('worker_boot_id', 'other')]:
            self.spec, self.samples = fixture()
            self.samples[1]['tickReceipt'][field] = value
            with self.subTest(field=field), self.assertRaises(Hold): self.run_policy()

    def test_worker_unknown_without_received_failure_is_not_settled_proof(self):
        for field, value in [('httpStatus', None), ('failure', {'code': 'FETCH_TIMEOUT'}), ('finishedAt', None)]:
            self.spec, self.samples = fixture()
            self.samples[1]['workerStatus']['lastTick'][field] = value
            with self.subTest(field=field), self.assertRaises(Hold): self.run_policy()

    def test_current_worker_and_media_must_be_quiescent(self):
        for field, value in [('paused', False), ('activeTicks', 1), ('controlFault', 'persist-failed')]:
            self.spec, self.samples = fixture(); self.samples[1]['workerStatus'][field] = value
            with self.assertRaises(Hold): self.run_policy()
        for field, value in [('draining', False), ('running', 1), ('queued', 1)]:
            self.spec, self.samples = fixture(); self.samples[1]['workerStatus']['mediaWorker'][field] = value
            with self.assertRaises(Hold): self.run_policy()

    def test_paid_or_supplier_or_ledger_changes_block(self):
        for table in m.PRESERVATION_TABLES:
            self.spec, self.samples = fixture()
            self.samples[1]['preservation']['tables'][table]['sha256'] = 'f' * 64
            with self.subTest(table=table), self.assertRaisesRegex(Hold, 'PAID_BUSINESS_BYTES_CHANGED'):
                self.run_policy()

    def test_missing_preservation_table_or_fake_empty_hash_blocks(self):
        del self.spec['preservation']['tables']['app_ledger']
        with self.assertRaises(Hold): self.run_policy()
        self.spec, self.samples = fixture()
        self.spec['preservation']['tables']['app_ledger']['rowCount'] = 0
        with self.assertRaises(Hold): self.run_policy()

    def test_empty_ledger_is_preserved_not_assumed_charged(self):
        self.spec['preservation']['tables']['app_ledger'] = {'rowCount': 0, 'sha256': m.digest([])}
        self.spec['preservationSha256'] = m.digest(self.spec['preservation'])
        for sample in self.samples: sample['preservation'] = copy.deepcopy(self.spec['preservation'])
        self.assertFalse(self.run_policy()['paidOutcomeReclassified'])

    def test_two_fresh_separated_samples_required(self):
        with self.assertRaises(Hold): m.adjudicate(self.spec, self.samples[:1], now=NOW)
        with self.assertRaises(Hold): m.adjudicate(self.spec, self.samples, now=NOW + dt.timedelta(seconds=40))
        self.samples[1]['observedAt'] = self.samples[0]['observedAt']
        with self.assertRaises(Hold): self.run_policy()

    def test_inner_observation_stale_blocks(self):
        for field in ['app', 'workerStatus']:
            self.spec, self.samples = fixture()
            self.samples[1][field]['observedAt'] = (NOW - dt.timedelta(seconds=20)).isoformat()
            with self.assertRaises(Hold): self.run_policy()
        self.spec, self.samples = fixture()
        self.samples[1]['domainObservedAt'] = (NOW - dt.timedelta(seconds=20)).isoformat()
        with self.assertRaises(Hold): self.run_policy()

    def test_internal_dispatch_target_must_be_explicitly_collected_and_local(self):
        for change in [lambda e: e.pop('INTERNAL_APP_ORIGIN'),
                       lambda e: e.__setitem__('INTERNAL_APP_ORIGIN', 'http://another-web:3000')]:
            self.spec, self.samples = fixture()
            change(self.samples[1]['webEnvironment'])
            with self.assertRaisesRegex(Hold, 'RUNTIME_ORIGIN_OR_COMMIT_DRIFT'): self.run_policy()
        self.spec, self.samples = fixture()
        for sample in self.samples: sample['webEnvironment']['INTERNAL_APP_ORIGIN'] = None
        self.assertTrue(self.run_policy()['currentExecutableWorkDrained'])

    def test_outer_timestamp_cannot_hide_reused_component_observations(self):
        for component in ['app', 'domainObservedAt', 'workerStatus', 'all']:
            self.spec, self.samples = fixture()
            if component == 'all':
                self.samples[1] = copy.deepcopy(self.samples[0])
                self.samples[1]['observedAt'] = (NOW - dt.timedelta(seconds=1)).isoformat()
            else:
                self.samples[1][component] = copy.deepcopy(self.samples[0][component])
            with self.assertRaisesRegex(Hold, 'REUSED_COMPONENT_OBSERVATION'): self.run_policy()

    def test_canonical_route_or_admission_changes_block(self):
        changes = [lambda s: s.__setitem__('canonicalSha256', 'b' * 64),
                   lambda s: s.__setitem__('routingReferences', ['nginx upstream']),
                   lambda s: s.__setitem__('internalReferences', ['worker origin']),
                   lambda s: s['app']['admission'].__setitem__('revision', 4)]
        for change in changes:
            self.spec, self.samples = fixture(); change(self.samples[1])
            with self.assertRaises(Hold): self.run_policy()


if __name__ == '__main__':
    unittest.main()
