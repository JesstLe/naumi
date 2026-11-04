"""Offline successor-contract tests. No SSH, Docker, supplier or network I/O."""
import copy
import datetime as dt
import json
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import release103_mapping as mapping
from release47_host import Hold, public_identity, sha


def row(name, identifier, commit='c' * 40, image='sha256:' + 'd' * 64):
    return {'Id': identifier * 64, 'Name': '/' + name, 'Image': image,
            'Config': {'Env': ['SOURCE_COMMIT=' + commit]},
            'State': {'Running': True, 'StartedAt': '2026-10-28T12:00:00Z', 'ExitCode': 0, 'OOMKilled': False},
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}}}


def config():
    old = {'web': row('naumi103-web-old-release', '1'), 'worker': row('naumi103-worker-old-release', '2')}
    return {'target': mapping.TARGET, 'authorization': mapping.AUTHORIZATION, 'branch': mapping.BRANCH,
            'taskActivityScope': 'nonfinished-and-prior',
            'releaseMode': 'BLUE_GREEN', 'releaseId': 'release103-mapping-20261029-r1',
            'evidenceRoot': '/opt/naumi-staging/evidence/release103-mapping-20261029-r1',
            'commit': 'a' * 40, 'oldCommit': 'c' * 40, 'image': 'sha256:' + 'b' * 64,
            'oldImage': 'sha256:' + 'd' * 64, 'buildVersion': '1793275200',
            'restoreDatabase': False, 'replayAcceptedTasks': False, 'webEnvironment': {}, 'workspaceModules': [],
            'webMemoryMiB': 1536, 'workerMemoryMiB': 1024, 'newPort': 13107, 'oldPort': 13106,
            'newNames': {'web': 'naumi103-web-mapping-20261029-r1', 'worker': 'naumi103-worker-mapping-20261029-r1'},
            'oldNames': {k: r['Name'].lstrip('/') for k, r in old.items()},
            'oldPins': {k: public_identity(r) for k, r in old.items()},
            'runningIds': ['1' * 64, '2' * 64, '3' * 64],
            'date': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),
            'archiveSha256': 'e' * 64, 'storageProbeSha256': 'f' * 64,
            'canonicalSha256': '0' * 64, 'canonicalRevision': 200, 'nginxSha256': sha(b'old gateway')}


class ValidationTests(unittest.TestCase):
    def test_fixed_spec_passes(self):
        mapping.validate(config())

    def test_reject_other_site_branch_authorization_and_mode(self):
        cases = [('target', v) for v in ['47.105.59.142', '120.27.162.85', '101.133.166.67', '179.236.104.112']]
        cases += [('branch', 'main'), ('authorization', mapping.shared.AUTHORIZATION), ('releaseMode', 'STOP_OLD_REPLACE')]
        cases += [('taskActivityScope', 'all'), ('taskActivityScope', None), ('abortedPredecessor', 'release47-mapping-fixture')]
        for key, value in cases:
            c = config(); c[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(Hold):
                mapping.validate(c)

    def test_no_restore_replay_cross_site_modules_or_environment_override(self):
        for key, value in [('restoreDatabase', True), ('replayAcceptedTasks', True),
                           ('workspaceModules', ['fleet']), ('webEnvironment', {'FLEET_CONTROL_ENABLED': '0'}),
                           ('webEnvironment', {'DATABASE_URL': 'fixture'}), ('resumeFinal', True),
                           ('resumeCandidate', 'gateway')]:
            c = config(); c[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(Hold):
                mapping.validate(c)

    def test_fixed_source_hashes_date_port_and_resources(self):
        for key, value in [('commit', 'main'), ('oldCommit', 'latest'), ('image', 'latest'),
                           ('oldImage', 'sha256:short'), ('buildVersion', 'latest'),
                           ('canonicalSha256', ''), ('archiveSha256', ''), ('storageProbeSha256', ''),
                           ('nginxSha256', ''), ('canonicalRevision', True), ('date', '2000-01-01'),
                           ('newPort', 13106), ('newPort', 80), ('oldPort', '13106'),
                           ('webMemoryMiB', 2048), ('workerMemoryMiB', 128),
                           ('releaseId', 'release47-mapping-20261029'), ('evidenceRoot', '/tmp/release')]:
            c = config(); c[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(Hold):
                mapping.validate(c)

    def test_exact_roles_names_and_instances(self):
        for key, value in [('oldNames', {'web': 'naumi103-web-old', 'worker': 'naumi103-worker-old', 'media': 'x'}),
                           ('newNames', {'web': 'naumi103-web-old-release', 'worker': 'naumi103-worker-new'}),
                           ('newNames', {'web': 'naumi47-web-new', 'worker': 'naumi103-worker-new'}),
                           ('oldPins', {}), ('runningIds', ['latest']), ('runningIds', ['1' * 64] * 2)]:
            c = config(); c[key] = value
            with self.subTest(key=key), self.assertRaises(Hold):
                mapping.validate(c)

    def test_startup_context_binds_exact_mapping_release(self):
        c = config()
        value = mapping.startup.context(c['releaseId'], c['commit'], c['buildVersion'], c['newNames']['web'])
        self.assertEqual(value['releaseId'], c['releaseId'])
        self.assertEqual(value['commit'], c['commit'])
        self.assertEqual(value['instanceId'], c['newNames']['web'])
        with self.assertRaises(Hold):
            mapping.startup.context('release47-mapping-fixture', c['commit'], c['buildVersion'], c['newNames']['web'])


class InitializationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / 'current.json'
        self.c = config()
        self.state = {'revision': 200, 'status': 'PREPARED', 'legacyDrainProven': False,
                      'activeSiteControlReleaseId': 'prior', 'siteControlReleases': {
                          'prior': {'phase': 'COMPLETE', 'commit': self.c['oldCommit'], 'operations': {}}}}
        self.rows = [row(self.c['oldNames']['web'], '1'), row(self.c['oldNames']['worker'], '2'),
                     row('naumi-staging-db-1', '3')]
        self.tx = Mock(folder=pathlib.Path(self.temp.name))
        self.tx.run.side_effect = lambda args: (json.dumps(self.rows).encode() if args[1] == 'inspect'
                                              else '\n'.join(r['Id'] for r in self.rows).encode())
        self.addCleanup(patch.stopall)
        patch.object(mapping.shared, 'CANON', self.path).start()
        patch.object(mapping.base, 'CANON', self.path).start()
        patch.object(mapping.shared, 'EVIDENCE_ROOT', pathlib.Path(self.temp.name)).start()
        self.store()

    def store(self):
        self.path.write_text(json.dumps(self.state), encoding='utf8')
        self.c['canonicalSha256'] = sha(self.path.read_bytes())

    def test_constructor_only_reads_preserves_history_and_builds_record(self):
        before = self.path.read_bytes()
        r = mapping.Release(self.tx, self.c)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(r.state['legacyDrainProven'])
        self.assertEqual(r.record['branch'], mapping.BRANCH)
        self.assertFalse(r.record['configurationPublication'])
        self.tx.save.assert_not_called()

    def test_canonical_drift_rejected_before_inventory(self):
        self.c['canonicalRevision'] += 1
        with self.assertRaisesRegex(Hold, 'CANONICAL_REVIEW_CHANGED'):
            mapping.Release(self.tx, self.c)
        self.tx.run.assert_not_called()

    def test_pinned_identity_and_source_and_image_drift(self):
        for mutation in ['id', 'source', 'image', 'running']:
            with self.subTest(mutation=mutation):
                changed = copy.deepcopy(self.rows)
                if mutation == 'id': changed[0]['State']['StartedAt'] = 'later'
                if mutation == 'source': changed[0]['Config']['Env'] = ['SOURCE_COMMIT=' + 'f' * 40]
                if mutation == 'image': changed[0]['Image'] = 'sha256:' + 'e' * 64
                if mutation == 'running': changed[0]['State']['Running'] = False
                self.tx.run.side_effect = lambda args: json.dumps(changed).encode() if args[1] == 'inspect' else b'ids'
                with self.assertRaises(Hold): mapping.Release(self.tx, self.c)

    def test_repeated_release_id_is_not_silently_restarted(self):
        self.state['siteControlReleases'][self.c['releaseId']] = {'phase': 'COMPLETE'}
        self.store()
        with self.assertRaisesRegex(Hold, 'ORIGINAL_TRANSACTION'):
            mapping.Release(self.tx, self.c)

    def test_unresolved_predecessor_operation_rejected(self):
        self.state['siteControlReleases']['prior']['operations'] = {'switch': {'phase': 'UNKNOWN'}}
        self.store()
        with self.assertRaisesRegex(Hold, 'PREDECESSOR_OPERATION_UNKNOWN'):
            mapping.Release(self.tx, self.c)

    def test_even_stopped_existing_candidate_name_rejected(self):
        stopped = row(self.c['newNames']['web'], '4'); stopped['State']['Running'] = False
        self.rows.append(stopped)
        with self.assertRaisesRegex(Hold, 'CANDIDATE_NAME_ALREADY_EXISTS'):
            mapping.Release(self.tx, self.c)

    def aborted(self):
        rid='release103-mapping-20261029-r2'
        folder=pathlib.Path(self.temp.name)/rid;folder.mkdir()
        raw=self.path.read_bytes()
        original=copy.deepcopy(self.c);original.update(releaseId=rid,canonicalSha256=sha(raw),canonicalRevision=200)
        (folder/'canonical-before.private.json').write_bytes(raw)
        (folder/'release-config.private.json').write_text(json.dumps(original),encoding='utf8')
        self.state['siteControlReleases'][rid]={'releaseId':rid,'phase':'ABORTED','candidatesRetained':False,
          'gatewaySwitched':False,'gatewayObservedSha256':self.c['nginxSha256'],'operations':{'database-backup':{'phase':'ACKNOWLEDGED'}}}
        self.state['activeSiteControlReleaseId']=rid;self.state['revision']=205
        self.c.update(abortedPredecessor=rid,canonicalRevision=205)
        self.store();return rid,folder

    def test_explicit_pristine_abort_backtracks_original_complete_without_rewriting_history(self):
        rid,_=self.aborted();before=self.path.read_bytes();aborted=copy.deepcopy(self.state['siteControlReleases'][rid])
        r=mapping.Release(self.tx,self.c)
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(r.state['siteControlReleases'][rid],aborted)
        self.assertEqual(r.record['predecessorReleaseId'],'prior')
        self.assertEqual(r.record['abortedPredecessor'],rid)
        self.tx.save.assert_not_called()

    def test_abort_is_never_automatically_skipped(self):
        self.aborted();del self.c['abortedPredecessor']
        with self.assertRaisesRegex(Hold,'PREDECESSOR_NOT_COMPLETE'):mapping.Release(self.tx,self.c)

    def test_abort_unknown_candidate_switch_or_different_record_rejected(self):
        rid,_=self.aborted();original=copy.deepcopy(self.state['siteControlReleases'][rid])
        for mutation in [{'phase':'UNKNOWN'},{'candidatesRetained':True},{'gatewaySwitched':True},
                         {'new':{'web':{'id':'x'}}},{'operations':{'database-backup':{'phase':'UNKNOWN'}}},
                         {'operations':{'web-create':{'phase':'ACKNOWLEDGED'}}},{'gatewayObservedSha256':'a'*64}]:
            with self.subTest(mutation=mutation):
                self.state['siteControlReleases'][rid]={**original,**mutation};self.store()
                with self.assertRaisesRegex(Hold,'ABORTED_PREDECESSOR_NOT_PRISTINE|SITE_ROLLOUT_OPERATION_UNKNOWN'):mapping.Release(self.tx,self.c)

    def test_another_aborted_unknown_operation_is_not_accepted(self):
        self.aborted()
        self.state['siteControlReleases']['other-aborted']={'phase':'ABORTED','operations':{'attempt':{'phase':'UNKNOWN'}}};self.store()
        with self.assertRaisesRegex(Hold,'SITE_ROLLOUT_OPERATION_UNKNOWN'):mapping.Release(self.tx,self.c)

    def test_abort_preimage_cas_and_historical_complete_identity_must_match(self):
        _,folder=self.aborted()
        original=(folder/'canonical-before.private.json').read_bytes()
        (folder/'canonical-before.private.json').write_bytes(original+b' ')
        with self.assertRaisesRegex(Hold,'ABORTED_PREDECESSOR_BASELINE_CHANGED'):mapping.Release(self.tx,self.c)
        (folder/'canonical-before.private.json').write_bytes(original)
        self.state['siteControlReleases']['prior']['commit']='e'*40;self.store()
        with self.assertRaisesRegex(Hold,'ABORTED_PREDECESSOR_HISTORY_CHANGED'):mapping.Release(self.tx,self.c)


class LifecycleTests(unittest.TestCase):
    def release(self):
        r = mapping.Release.__new__(mapping.Release)
        r.c = config(); r.root = pathlib.Path('fixture'); r.record = {'operations': {}, 'phase': 'READY'}
        r.old = {'web': row(r.c['oldNames']['web'], '1'), 'worker': row(r.c['oldNames']['worker'], '2')}
        r.new = {'web': row(r.c['newNames']['web'], '4', r.c['commit'], r.c['image']),
                 'worker': row(r.c['newNames']['worker'], '5', r.c['commit'], r.c['image'])}
        r.tx = Mock(); r.tx.run.return_value = b''
        r.switched = r.old_stopped = r.worker_paused = r.app_drained = False
        r.events = []
        def op(name, fn):
            r.events.append(name)
            entry = {'phase': 'INTENT_RECORDED'}; r.record['operations'][name] = entry
            try: result = fn('11111111-1111-4111-8111-111111111111')
            except BaseException: entry['phase'] = 'UNKNOWN'; raise
            entry.update(phase='ACKNOWLEDGED', receipt=result)
            return result
        r.op = op
        r.phase = lambda phase, **facts: r.record.update(phase=phase, **facts)
        r.worker = Mock(return_value={'paused': True, 'activeTicks': 0, 'unresolvedTicks': 0})
        r.marker = Mock(return_value={'passed': True})
        def wait(fn, label, *args, **kwargs):
            value = fn()
            mapping.require(value, 'WAIT_' + label)
            return value
        r.wait = wait
        r.drain = Mock(return_value={'drained': True})
        r.gateway = Mock(return_value={'afterDumpSha256': 'f' * 64})
        r.retire = Mock(return_value={})
        r.handoff_media = Mock(return_value={'bothWritersStoppedDuringCopy': True})
        return r

    @patch.object(mapping.controls, 'control_app')
    def test_two_role_switch_order_and_handoff_before_resume(self, control):
        r = self.release(); r.switch()
        self.assertEqual(r.events, ['pause-old-worker', 'open-new-web', 'gateway-switch', 'drain-old-web',
                                   'retire-worker', 'retire-web', 'cold-media-receipt-handoff', 'resume-new-worker'])
        self.assertTrue(r.switched and r.old_stopped)
        self.assertEqual(r.record['phase'], 'PUBLIC_ACCEPTANCE')
        r.marker.assert_called_once_with('browser-before.json')
        r.tx.run.assert_called_once_with(['ss', '-Htn', 'state', 'established', '( sport = :13106 or dport = :13106 )'])

    @patch.object(mapping.controls, 'control_app')
    def test_unknown_gateway_does_not_retire_or_resume_candidate(self, control):
        r = self.release(); r.gateway.side_effect = Hold('LOST_GATEWAY_RECEIPT')
        with self.assertRaises(Hold): r.switch()
        self.assertFalse(r.switched)
        self.assertEqual(r.record['operations']['gateway-switch']['phase'], 'UNKNOWN')
        r.retire.assert_not_called(); r.handoff_media.assert_not_called()
        self.assertNotIn('resume-new-worker', r.events)
        r.tx.run.return_value = b'changed gateway'
        r.rollback()
        self.assertEqual(r.record['phase'], 'UNKNOWN')
        self.assertFalse(r.record['rollbackEntryRestored'])

    @patch.object(mapping.controls, 'control_app')
    def test_handoff_failure_never_resumes_new_worker(self, control):
        r = self.release(); r.handoff_media.side_effect = Hold('SCRATCH_COPY_NOT_IDENTICAL')
        with self.assertRaises(Hold): r.switch()
        r.rollback()
        self.assertTrue(r.switched and r.old_stopped)
        self.assertEqual(r.record['phase'], 'UNKNOWN')
        self.assertNotIn('resume-new-worker', r.events)
        self.assertFalse(r.record['databaseRestored'] or r.record['tasksReplayed'])

    @patch.object(mapping.controls, 'control_app')
    def test_old_connections_block_retirement(self, control):
        r = self.release(); r.tx.run.return_value = b'ESTAB'
        with self.assertRaisesRegex(Hold, 'OLD_HTTP_CONNECTIONS_ACTIVE'): r.switch()
        r.retire.assert_not_called(); r.handoff_media.assert_not_called()

    def test_candidate_browser_missing_prevents_switch(self):
        r = self.release(); r.marker.return_value = False
        with self.assertRaisesRegex(Hold, 'WAIT_CANDIDATE_BROWSER'): r.switch()
        self.assertEqual(r.events, [])
        r.gateway.assert_not_called()

    @patch.object(mapping, 'assert_legacy_fleet_rollback_clear', return_value={'businessRows': 0})
    def test_pre_switch_known_original_gateway_only_resumes_original_worker(self, guard):
        r = self.release(); r.worker_paused = True; r.tx.run.return_value = b'old gateway'
        r.db = row('fixture-db', '6')
        r.rollback()
        guard.assert_called_once_with(r.tx, public_identity(r.db))
        self.assertEqual(r.events, ['resume-original-worker'])
        r.worker.assert_called_once_with(r.old['worker'], 'resume')
        self.assertEqual(r.record['phase'], 'CLEANUP_PENDING')

    def test_post_switch_does_not_invent_rollback_or_start_new_worker(self):
        r = self.release(); r.switched = True
        r.rollback()
        self.assertEqual(r.record['phase'], 'CLEANUP_PENDING')
        r.worker.assert_not_called()
        self.assertFalse(r.record['rollbackEntryRestored'])

    @patch.object(mapping.shared.Release, 'drain')
    def test_combined_media_is_part_of_drain_not_just_tick_state(self, shared_drain):
        r = self.release()
        for media in [{}, {'running': 1, 'queued': 0}, {'running': 0, 'queued': 1}]:
            shared_drain.return_value = {'worker': {'mediaWorker': media}}
            with self.subTest(media=media), self.assertRaisesRegex(Hold, 'COMBINED_MEDIA_NOT_DRAINED'):
                mapping.Release.drain(r)
        shared_drain.return_value = {'worker': {'mediaWorker': {'running': 0, 'queued': 0}}}
        self.assertEqual(mapping.Release.drain(r), shared_drain.return_value)

    def test_retirement_checks_clean_exit_and_no_restart(self):
        r = self.release(); stopped = copy.deepcopy(r.old['web'])
        stopped['State']['Running'] = False; stopped['HostConfig']['RestartPolicy']['Name'] = 'no'
        r.tx.inspect.return_value = stopped
        result = mapping.Release.retire(r, 'web')
        self.assertFalse(result['running']); self.assertEqual(result['restartPolicy'], 'no')
        stopped['State']['ExitCode'] = 137
        with self.assertRaisesRegex(Hold, 'OLD_SLOT_STOP_REQUIRED'): mapping.Release.retire(r, 'web')

    def test_shared_primitives_not_duplicated_or_overridden(self):
        for method in ['candidates', 'acceptance', 'assets', 'clone_web', 'memory', 'handoff_media', 'reconcile']:
            self.assertIs(getattr(mapping.Release, method), getattr(mapping.shared.Release, method))

    def finish_fixture(self):
        r = self.release(); r.resumed_at = 100
        r.db = row('naumi-staging-db-1', '3'); r.task_before = SimpleNamespace(private={})
        r.acceptance = Mock(); r.activate_startup = Mock(return_value={'sameImage': True})
        r.router_binding = Mock(); r.memory = Mock(return_value={'availableMiB': 4096})
        r.configuration = [{'models': 'original', 'billing': 'original'}]
        r.config = Mock(return_value=r.configuration)
        r.worker.return_value = {'commit': r.c['commit'], 'bootId': 'current', 'paused': True,
            'activeTicks': 0, 'unresolvedTicks': 0, 'backgroundTasks': 0,
            'lastTick': {'phase': 'complete', 'startedAt': '1970-01-01T00:01:41Z',
                         'workerBootId': 'current', 'workerCommit': r.c['commit']}}
        actual = copy.deepcopy({v['Id']: v for v in [*r.old.values(), *r.new.values()]})
        for old in r.old.values():
            actual[old['Id']]['State']['Running'] = False
            actual[old['Id']]['HostConfig']['RestartPolicy']['Name'] = 'no'
        r.tx.inspect.side_effect = lambda cid: actual[cid]
        r.tx.run.return_value = '\n'.join(['3' * 64, '4' * 64, '5' * 64]).encode()
        response = Mock()
        response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'version': r.c['buildVersion'], 'commit': r.c['commit']}).encode()
        return r, actual, response

    @patch.object(mapping.tasks, 'compare_task_snapshots', return_value={'preservationVerified': True})
    @patch.object(mapping.tasks, 'collect_task_snapshot')
    @patch.object(mapping.time, 'time', return_value=100)
    @patch.object(mapping.urllib.request, 'urlopen')
    def test_finish_requires_task_preservation_public_version_and_only_exact_pair(self, urlopen, now, collect, compare):
        r, actual, response = self.finish_fixture(); urlopen.return_value = response
        r.finish()
        self.assertEqual(r.record['phase'], 'COMPLETE')
        self.assertTrue(r.record['taskPreservationVerified'])
        self.assertTrue(r.record['legacyHistoricalUncertaintyRetained'])
        r.marker.assert_called_once_with('browser-after.json')
        self.assertEqual(r.events, ['proof-worker-barrier', 'proof-worker-resume', 'activate-persistent-startup'])
        self.assertEqual(collect.call_args.kwargs['previous'], {})
        self.assertEqual(collect.call_args.kwargs['projection'], 'proof')
        self.assertEqual(collect.call_args.kwargs['activity_scope'],'nonfinished-and-prior')
        self.assertEqual(urlopen.call_args.args[0].full_url, 'http://127.0.0.1/api/version')
        self.assertEqual(urlopen.call_args.args[0].get_header('Host'), mapping.TARGET)
        r.router_binding.assert_called_once_with(live=True)

    def test_public_browser_missing_prevents_completion(self):
        r, _, _ = self.finish_fixture(); r.marker.return_value = False
        with self.assertRaisesRegex(Hold, 'WAIT_PUBLIC_BROWSER'): r.finish()
        self.assertEqual(r.events, [])
        self.assertNotEqual(r.record['phase'], 'COMPLETE')

    @patch.object(mapping.tasks, 'compare_task_snapshots', return_value={'preservationVerified': False})
    @patch.object(mapping.tasks, 'collect_task_snapshot')
    def test_failed_task_preservation_keeps_barrier_no_completion(self, collect, compare):
        r, _, _ = self.finish_fixture()
        with self.assertRaisesRegex(Hold, 'TASK_PRESERVATION_FAILED'): r.finish()
        self.assertEqual(r.events, ['proof-worker-barrier'])
        self.assertNotEqual(r.record['phase'], 'COMPLETE')
        r.activate_startup.assert_not_called()

    @patch.object(mapping.tasks, 'compare_task_snapshots', return_value={'preservationVerified': True})
    @patch.object(mapping.tasks, 'collect_task_snapshot')
    @patch.object(mapping.time, 'time', return_value=100)
    @patch.object(mapping.urllib.request, 'urlopen')
    def test_unknown_earlier_operation_never_claims_complete(self, urlopen, now, collect, compare):
        r, _, response = self.finish_fixture(); urlopen.return_value = response
        r.record['operations']['previous'] = {'phase': 'UNKNOWN'}
        with self.assertRaisesRegex(Hold, 'UNACKNOWLEDGED_RELEASE_OPERATION'): r.finish()
        self.assertNotEqual(r.record['phase'], 'COMPLETE')

    @patch.object(mapping.shared.Release, 'prepare')
    @patch.object(mapping.shutil, 'disk_usage', return_value=SimpleNamespace(free=9 * 1024**3))
    def test_space_gate_precedes_journal_and_backup(self, disk_usage, prepare):
        r = self.release(); r.memory = Mock(return_value={})
        with self.assertRaisesRegex(Hold, 'TEN_GIB_FREE_REQUIRED'): r.prepare()
        prepare.assert_not_called()

    @patch.object(mapping.shared.Release, 'prepare')
    @patch.object(mapping.shutil, 'disk_usage', return_value=SimpleNamespace(free=20 * 1024**3))
    @patch.object(mapping, 'file_sha', return_value='wrong')
    def test_archive_gate_precedes_journal_and_backup(self, file_sha, disk_usage, prepare):
        r = self.release(); r.memory = Mock(return_value={})
        with self.assertRaisesRegex(Hold, 'IMAGE_ARCHIVE_CHANGED'): r.prepare()
        prepare.assert_not_called()

    @patch.object(mapping.tasks, 'compare_task_snapshots')
    @patch.object(mapping.shared.Release, 'prepare')
    @patch.object(mapping.shutil, 'disk_usage', return_value=SimpleNamespace(free=20 * 1024**3))
    @patch.object(mapping, 'file_sha', return_value='e' * 64)
    def test_incomplete_original_task_coverage_rejected_before_candidates(self, file_sha, disk, prepare, compare):
        r = self.release(); r.memory = Mock(return_value={}); r.task_before = SimpleNamespace(private={})
        for role, limit in [('web', 1536), ('worker', 1024)]:
            r.old[role]['HostConfig']['Memory'] = limit * 1024**2
            r.old[role]['Mounts'] = [{'Source': '/fixture/scratch', 'Destination': '/scratch'}]
        r.old['web']['HostConfig']['PortBindings'] = {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '13106'}]}
        r.old['web']['Config']['Env'].append('INTERNAL_APP_ORIGIN=http://127.0.0.1:3000')
        r.old['worker']['Config']['Env'].append('NAUMI_APP_ORIGIN=http://' + r.c['oldNames']['web'] + ':3000')
        compare.return_value = {'preservationVerified': False, 'unknownTables': ['app_image_jobs']}
        with self.assertRaisesRegex(Hold, 'TASK_BASELINE_COVERAGE_INCOMPLETE'): r.prepare()
        prepare.assert_called_once(); compare.assert_called_once_with(r.task_before, r.task_before)
        r.tx.save.assert_called_with('task-baseline-coverage.json', compare.return_value)
        self.assertEqual(r.events, [])
        compare.return_value = {'preservationVerified': True, 'unknownTables': []}
        r.prepare()


class FreshTickTests(unittest.TestCase):
    def test_fresh_same_boot_commit_complete_receipt(self):
        status = {'commit': 'a' * 40, 'bootId': 'boot-current', 'lastTick': {
            'phase': 'complete', 'startedAt': '2026-10-29T12:00:01Z',
            'workerBootId': 'boot-current', 'workerCommit': 'a' * 40}}
        resumed = dt.datetime.fromisoformat('2026-10-29T12:00:00+00:00').timestamp()
        self.assertTrue(mapping.fresh_tick(status, 'a' * 40, resumed))
        for key, value in [('startedAt', '2026-10-29T11:59:59Z'), ('startedAt', 'invalid'),
                           ('startedAt', '2026-10-29T12:00:01'), ('workerBootId', 'prior-boot'),
                           ('workerCommit', 'c' * 40), ('phase', 'unknown')]:
            wrong = copy.deepcopy(status); wrong['lastTick'][key] = value
            with self.subTest(key=key, value=value):
                self.assertFalse(mapping.fresh_tick(wrong, 'a' * 40, resumed))
        self.assertFalse(mapping.fresh_tick({}, 'a' * 40, resumed))


if __name__ == '__main__':
    unittest.main()
