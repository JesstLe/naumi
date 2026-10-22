import copy
import datetime
import json
import pathlib
import os
import shutil
import subprocess
import tempfile
import types
import unittest

import worker_handoff as m
from test_release_lifecycle import plan as lifecycle_plan


class WorkerHandoff(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = pathlib.Path(self.temp.name)
        self.args = types.SimpleNamespace(action='drain', container='worker', expected_id='1'*64,
            expected_image='sha256:'+'a'*64, expected_commit='b'*40,
            expected_origin='http://web:3000', operation_id='22222222-2222-4222-8222-222222222222')
        self.status = {'schemaVersion': 1, 'instanceId': 'worker-instance', 'commit': 'b'*40,
            'origin': 'http://web:3000', 'revision': 0, 'bootId': '33333333-3333-4333-8333-333333333333',
            'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'durableControl': True,
            'phase': 'IDLE', 'paused': False, 'activeTicks': 0, 'unresolvedTicks': 0,
            'workerLeases': None, 'acceptedTasks': None, 'agentSessions': None}
        self.calls = []
        self.failure = False

    def tearDown(self):
        self.temp.cleanup()

    def command(self, cmd):
        self.calls.append(cmd)
        if cmd[:2] == ['docker', 'inspect']:
            worker = cmd[2] == 'worker'
            return json.dumps([{'Id': '1'*64 if worker else '4'*64,
                'Image': self.args.expected_image, 'State': {'Running': True},
                'Config': {'Env': ['SOURCE_COMMIT='+'b'*40, 'NAUMI_APP_ORIGIN=http://web:3000',
                    'NAUMI_WORKER_RELEASE_CONTROL=1', 'NAUMI_INSTANCE_ID=worker-instance',
                    'INTERNAL_APP_ORIGIN=http://127.0.0.1:3000']}}])
        self.assertEqual(cmd[2:4], ['-e', 'NODE_OPTIONS='])
        request = json.loads(cmd[-1])
        if request is None:
            return json.dumps(self.status)
        if self.failure:
            raise OSError('response lost')
        self.status.update(revision=self.status['revision']+1, paused=request['action']=='drain',
                           phase='QUIESCENT' if request['action']=='drain' else 'IDLE')
        return json.dumps({'state': self.status, 'receipt': {'action': request['action'], 'revision': self.status['revision']}})

    def test_drain_receipt_preserves_unknown_business_counts(self):
        result = m.execute(self.args, self.folder, self.command)
        self.assertEqual(result['result'], 'ACKNOWLEDGED')
        self.assertIsNone(result['state']['acceptedTasks'])
        self.assertIsNone(result['state']['workerLeases'])

    def test_resume_requires_same_image_web_and_self_recovery(self):
        self.args.action = 'resume'
        result = m.execute(self.args, self.folder, self.command)
        self.assertEqual(result['result'], 'ACKNOWLEDGED')
        self.assertIn(['docker', 'inspect', 'web'], self.calls)

    def test_unknown_tick_blocks_resume(self):
        self.args.action = 'resume'; self.status['phase'] = 'UNKNOWN'
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'UNRESOLVED_TICK'):
            m.execute(self.args, self.folder, self.command)

    def test_uncertain_request_reuses_exact_operation_body(self):
        self.failure = True
        with self.assertRaises(OSError):
            m.execute(self.args, self.folder, self.command)
        original = json.loads((self.folder/(self.args.operation_id+'.json')).read_text())
        self.assertEqual(original['phase'], 'UNKNOWN')
        self.failure = False
        m.execute(self.args, self.folder, self.command)
        current = json.loads((self.folder/(self.args.operation_id+'.json')).read_text())
        self.assertEqual(current['request'], original['request'])

    def test_unknown_operation_blocks_different_operation(self):
        self.failure = True
        with self.assertRaises(OSError):
            m.execute(self.args, self.folder, self.command)
        self.args.operation_id = '55555555-5555-4555-8555-555555555555'
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'UNRESOLVED_HANDOFF_BLOCKS_NEXT'):
            m.execute(self.args, self.folder, self.command)

    def test_acknowledged_duplicate_is_observation_not_reapplication(self):
        m.execute(self.args, self.folder, self.command)
        count = len([c for c in self.calls if c[:2] == ['docker', 'exec'] and c[-1] != 'null'])
        self.status.update(paused=False, phase='IDLE', revision=2)
        result = m.execute(self.args, self.folder, self.command)
        self.assertEqual(result['result'], 'ALREADY_ACKNOWLEDGED')
        self.assertFalse(result['state']['paused'])
        self.assertEqual(len([c for c in self.calls if c[:2] == ['docker', 'exec'] and c[-1] != 'null']), count)

    def test_identity_drift_blocks_before_control(self):
        self.args.expected_id = '9'*64
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'IDENTITY_DRIFT'):
            m.execute(self.args, self.folder, self.command)
        self.assertFalse(any(c[:2] == ['docker', 'exec'] for c in self.calls))

    def test_status_is_not_drain_proof_and_does_not_write_operation(self):
        self.args.action = 'status'
        result = m.execute(self.args, self.folder, self.command)
        self.assertEqual(result['result'], 'OBSERVED')
        self.assertEqual(list(self.folder.glob('*.json')), [])

    def test_resume_rejects_other_web_image(self):
        self.args.action = 'resume'
        def changed(cmd):
            value = self.command(cmd)
            if cmd == ['docker', 'inspect', 'web']:
                rows = json.loads(value); rows[0]['Image'] = 'sha256:'+'e'*64; return json.dumps(rows)
            return value
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'WEB_WORKER_IMAGE_MISMATCH'):
            m.execute(self.args, self.folder, changed)
        self.assertEqual(list(self.folder.glob('*.json')), [])

    def test_resume_rejects_web_self_recovery_split(self):
        self.args.action = 'resume'
        def changed(cmd):
            value = self.command(cmd)
            if cmd == ['docker', 'inspect', 'web']:
                rows = json.loads(value); rows[0]['Config']['Env'][-1] = 'INTERNAL_APP_ORIGIN=http://old-web:3000'; return json.dumps(rows)
            return value
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'SPLIT_WEB_RECOVERY_ORIGIN'):
            m.execute(self.args, self.folder, changed)

    def test_loopback_origin_cannot_be_used_to_resume_worker(self):
        self.args.action = 'resume'; self.args.expected_origin = 'http://127.0.0.1:3000'; self.status['origin'] = self.args.expected_origin
        def changed(cmd):
            value = self.command(cmd)
            if cmd == ['docker', 'inspect', 'worker']:
                rows = json.loads(value); rows[0]['Config']['Env'][1] = 'NAUMI_APP_ORIGIN=http://127.0.0.1:3000'; return json.dumps(rows)
            return value
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'DIRECT_DOCKER_WEB_ORIGIN_REQUIRED'):
            m.execute(self.args, self.folder, changed)

    def test_stale_status_is_not_accepted(self):
        self.status['observedAt'] = '2000-01-01T00:00:00+00:00'
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'STALE_OR_FUTURE_OBSERVATION'):
            m.execute(self.args, self.folder, self.command)

    def test_legacy_worker_without_control_is_not_modified(self):
        def changed(cmd):
            value = self.command(cmd)
            if cmd == ['docker', 'inspect', 'worker']:
                rows = json.loads(value); rows[0]['Config']['Env'] = [e for e in rows[0]['Config']['Env'] if not e.startswith('NAUMI_WORKER_RELEASE_CONTROL=')]; return json.dumps(rows)
            return value
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'WORKER_ORIGIN_OR_COMMIT_DRIFT'):
            m.execute(self.args, self.folder, changed)
        self.assertFalse(any(c[:2] == ['docker', 'exec'] for c in self.calls))

    def release_fixture(self, status='READY'):
        p = lifecycle_plan(); p['evidenceMode'] = 'live'; p['target'] = '47.105.59.142'
        self.args.target = p['target']; self.args.host_identity_sha256 = p['hostIdentitySha256']; self.args.expected_id = p['worker']
        self.args.expected_image = p['image']; self.args.expected_commit = p['commit']
        self.args.action = 'resume'
        state = dict(evidenceMode='live', target=p['target'], releaseId=p['releaseId'],
                     planSha256=m.lifecycle.digest(p), status=status)
        return p, state

    def test_release_binding_allows_only_ready_candidate_resume(self):
        p, state = self.release_fixture(); m.authorize_release(self.args, state, p)
        state['status'] = 'UNKNOWN'
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'READY_CANDIDATE_WORKER_REQUIRED'):
            m.authorize_release(self.args, state, p)

    def test_release_digest_mismatch_blocks_mutation(self):
        p, state = self.release_fixture(); state['planSha256'] = '0'*64
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'ACTIVE_RELEASE_PLAN_REQUIRED'):
            m.authorize_release(self.args, state, p)

    def test_unregistered_worker_cannot_use_another_release_plan(self):
        p, state = self.release_fixture(); self.args.expected_id = 'other-worker'
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'LEGACY_WORKER_PLAN_MISMATCH'):
            m.authorize_release(self.args, state, p)

    def test_reconcile_requires_exact_original_unknown_tick(self):
        self.args.action = 'reconcile'
        self.args.tick_id = '66666666-6666-4666-8666-666666666666'
        self.status.update(phase='UNKNOWN', paused=True, unresolvedTicks=1,
                           lastTick={'id': '77777777-7777-4777-8777-777777777777'})
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'EXACT_UNKNOWN_TICK_REQUIRED'):
            m.execute(self.args, self.folder, self.command)
        self.assertFalse(any(c[:2] == ['docker', 'exec'] and c[-1] != 'null' for c in self.calls))

    def test_reconcile_keeps_paused_and_does_not_resume_or_replay_tick(self):
        self.args.action = 'reconcile'; self.args.tick_id = '66666666-6666-4666-8666-666666666666'
        self.status.update(phase='UNKNOWN', paused=True, unresolvedTicks=1, lastTick={'id': self.args.tick_id})
        def reconciled(cmd):
            if cmd[:2] == ['docker', 'inspect']:
                rows = json.loads(self.command(cmd))
                rows[0]['Config']['Env'].append('NAUMI_WORKER_TARGET_INSTANCE_ID=web-instance')
                return json.dumps(rows)
            request = json.loads(cmd[-1])
            self.calls.append(cmd)
            if request is None:
                return json.dumps(self.status)
            self.assertEqual(request['action'], 'reconcile')
            self.assertEqual(request['tickId'], self.args.tick_id)
            self.status.update(paused=True, phase='QUIESCENT', revision=1, unresolvedTicks=0)
            return json.dumps({'state': self.status, 'receipt': {'action': 'reconcile', 'revision': 1,
                              'serverReceipt': {'tickId': self.args.tick_id, 'phase': 'completed',
                                                'web': {'instanceId': 'web-instance', 'commit': self.args.expected_commit}}}})
        result = m.execute(self.args, self.folder, reconciled)
        self.assertTrue(result['state']['paused'])
        self.assertEqual(result['state']['phase'], 'QUIESCENT')
        self.assertIsNone(result['state']['acceptedTasks'])

    def test_reconcile_target_drift_is_persisted_unknown_not_acknowledged(self):
        self.args.action = 'reconcile'; self.args.tick_id = '66666666-6666-4666-8666-666666666666'
        self.status.update(phase='UNKNOWN', paused=True, unresolvedTicks=1, lastTick={'id': self.args.tick_id})
        def bad(cmd):
            if cmd[:2] == ['docker', 'inspect']:
                rows = json.loads(self.command(cmd)); rows[0]['Config']['Env'].append('NAUMI_WORKER_TARGET_INSTANCE_ID=web-instance'); return json.dumps(rows)
            request = json.loads(cmd[-1])
            if request is None:
                return json.dumps(self.status)
            self.status.update(paused=True, phase='QUIESCENT', revision=1, unresolvedTicks=0)
            return json.dumps({'state': self.status, 'receipt': {'action': 'reconcile', 'revision': 1,
                              'serverReceipt': {'tickId': self.args.tick_id, 'phase': 'completed',
                                                'web': {'instanceId': 'wrong', 'commit': self.args.expected_commit}}}})
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'TARGET_DRIFT'):
            m.execute(self.args, self.folder, bad)
        saved = json.loads((self.folder / (self.args.operation_id + '.json')).read_text())
        self.assertEqual(saved['phase'], 'UNKNOWN')


class CombinedWorkerHandoff(unittest.TestCase):
    """The proxy's partial failure must retain the scanner's original request."""
    def setUp(self):
        self.legacy = WorkerHandoff()
        self.legacy.setUp()
        self.args, self.folder = self.legacy.args, self.legacy.folder
        self.media = {'ok': True, 'version': self.args.expected_commit, 'sandbox': True,
                      'draining': False, 'running': 0, 'queued': 0, 'terminal': 3, 'maxActive': 8, 'concurrency': 1}
        self.legacy.status['mediaWorker'] = self.media
        self.receipts, self.requests = {}, []
        self.main_writes = self.media_attempts = 0
        self.media_timeout = self.missing_media = self.wrong_mode = False
        self.media_enabled = True

    def tearDown(self):
        self.legacy.tearDown()

    def command(self, cmd):
        if cmd[:2] == ['docker', 'inspect']:
            rows = json.loads(self.legacy.command(cmd))
            if cmd[2] == 'worker':
                rows[0]['Config']['Env'].append('NAUMI_WORKER_TARGET_INSTANCE_ID=web-instance')
                if self.media_enabled:
                    rows[0]['Config']['Env'].append('NAUMI_MEDIA_WORKER=1')
            return json.dumps(rows)
        request = json.loads(cmd[-1])
        if request is None:
            value = copy.deepcopy(self.legacy.status)
            if self.missing_media:
                value.pop('mediaWorker', None)
            return json.dumps(value)
        self.requests.append(copy.deepcopy(request))
        op = request['operationId']
        if op not in self.receipts:
            self.main_writes += 1
            if request['action'] == 'reconcile':
                self.legacy.status.update(paused=True, phase='QUIESCENT', revision=self.legacy.status['revision']+1,
                                          unresolvedTicks=0)
                result = {'state': self.legacy.status, 'receipt': {'action': 'reconcile', 'revision': self.legacy.status['revision'],
                          'serverReceipt': {'tickId': request['tickId'], 'phase': 'completed',
                                            'web': {'instanceId': 'web-instance', 'commit': self.args.expected_commit}}}}
            else:
                result = json.loads(self.legacy.command(cmd))
            self.receipts[op] = copy.deepcopy(result['receipt'])
        self.media_attempts += 1
        if self.media_timeout:
            raise OSError('Synthetic media timeout after scanner ACK')
        if not self.wrong_mode:
            self.media['draining'] = request['action'] != 'resume'
        return json.dumps({'state': self.legacy.status, 'receipt': self.receipts[op]})

    def test_real_media_health_is_required_only_for_combined_worker(self):
        self.args.action = 'status'
        result = m.execute(self.args, self.folder, self.command)
        self.assertEqual(result['state']['mediaWorker']['terminal'], 3)
        self.assertEqual(list(self.folder.glob('*.json')), [])
        self.missing_media = True
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'MEDIA_WORKER_STATUS'):
            m.execute(self.args, self.folder, self.command)

    def test_wrong_or_unknown_media_health_blocks_before_control(self):
        for field, value in [('ok', False), ('version', 'c'*40), ('sandbox', False), ('draining', None),
                             ('running', None), ('queued', -1), ('terminal', False), ('maxActive', 0),
                             ('concurrency', True), ('concurrency', 2)]:
            with self.subTest(field=field, value=value):
                prior = self.media[field]
                self.media[field] = value
                with self.assertRaisesRegex(m.lifecycle.Blocked, 'MEDIA_WORKER_STATUS'):
                    m.execute(self.args, self.folder, self.command)
                self.media[field] = prior
        self.assertEqual(self.main_writes, 0)
        self.assertEqual(list(self.folder.glob('*.json')), [])

    def test_main_ack_then_media_timeout_reuses_original_uuid_and_body(self):
        self.media_timeout = True
        with self.assertRaises(OSError):
            m.execute(self.args, self.folder, self.command)
        file = self.folder / (self.args.operation_id+'.json')
        unknown = json.loads(file.read_text())
        self.assertEqual(unknown['phase'], 'UNKNOWN')
        self.assertTrue(unknown['binding']['mediaWorker'])
        self.assertTrue(self.legacy.status['paused'], 'The scanner really acknowledged before the simulated media timeout')
        self.media_timeout = False
        result = m.execute(self.args, self.folder, self.command)
        self.assertEqual(result['result'], 'ACKNOWLEDGED')
        self.assertTrue(result['state']['mediaWorker']['draining'])
        self.assertEqual(self.requests[0], self.requests[1])
        self.assertEqual(json.loads(file.read_text())['request'], unknown['request'])
        self.assertEqual(self.main_writes, 1, 'Proxy duplicate scanner ACK must not advance its revision twice')
        self.assertEqual(self.media_attempts, 2)

    def test_partial_media_failure_blocks_another_operation(self):
        self.media_timeout = True
        with self.assertRaises(OSError):
            m.execute(self.args, self.folder, self.command)
        self.args.operation_id = '55555555-5555-4555-8555-555555555555'
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'UNRESOLVED_HANDOFF_BLOCKS_NEXT'):
            m.execute(self.args, self.folder, self.command)
        self.assertEqual(self.main_writes, 1)
        self.assertEqual(self.media_attempts, 1)

    def test_missing_future_worker_flag_is_never_treated_as_legacy(self):
        self.args.require_media_worker = True
        self.media_enabled = False
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'REQUIRED_MEDIA_WORKER_NOT_CONFIGURED'):
            m.execute(self.args, self.folder, self.command)
        self.assertEqual(self.main_writes, 0)

    def test_removing_media_flag_cannot_complete_an_unknown_combined_operation(self):
        self.media_timeout = True
        with self.assertRaises(OSError):
            m.execute(self.args, self.folder, self.command)
        self.media_timeout = False
        self.media_enabled = False
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'OPERATION_BINDING_CONFLICT'):
            m.execute(self.args, self.folder, self.command)

    def test_media_mode_is_observed_before_acknowledging_the_host_operation(self):
        self.wrong_mode = True
        with self.assertRaisesRegex(m.lifecycle.Blocked, 'MEDIA_WORKER_CONTROL_NOT_OBSERVED'):
            m.execute(self.args, self.folder, self.command)
        saved = json.loads((self.folder/(self.args.operation_id+'.json')).read_text())
        self.assertEqual(saved['phase'], 'UNKNOWN')

    def test_reconcile_keeps_both_services_draining_without_a_new_resume(self):
        self.args.action = 'reconcile'
        self.args.tick_id = '66666666-6666-4666-8666-666666666666'
        self.legacy.status.update(phase='UNKNOWN', paused=True, unresolvedTicks=1, lastTick={'id': self.args.tick_id})
        result = m.execute(self.args, self.folder, self.command)
        self.assertTrue(result['state']['paused'])
        self.assertTrue(result['state']['mediaWorker']['draining'])
        self.assertEqual([r['action'] for r in self.requests], ['reconcile'])
        self.assertEqual(self.requests[0]['tickId'], self.args.tick_id)


@unittest.skipUnless(shutil.which('node'), 'Node.js validates the actual docker-exec JavaScript')
class CombinedRemoteProtocol(unittest.TestCase):
    def run_remote(self, action=None, change=None, http_status=200):
        media = {'ok': True, 'version': 'b'*40, 'sandbox': True, 'draining': not action or action['action'] != 'resume',
                 'running': 0, 'queued': 0, 'terminal': 2, 'maxActive': 8, 'concurrency': 1}
        media.update(change or {})
        state = {'mediaWorker': media}
        payload = {'state': state, 'receipt': {'action': action['action'], 'revision': 1}} if action else state
        if http_status != 200:
            payload = {'error': 'synthetic-private-upstream-error-never-print'}
        setup = "const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response("+json.dumps(json.dumps(payload))+",{status:"+str(http_status)+",headers:{'content-type':'application/json'}})};\n"
        audit = "\nif(calls.length!==1||!calls[0].url.startsWith('http://127.0.0.1:3001/'))throw Error('CLIENT_MUST_ONLY_USE_PARENT_PROXY');if(action&&JSON.stringify(JSON.parse(calls[0].init.body))!==JSON.stringify(action))throw Error('ORIGINAL_CONTROL_BODY_CHANGED');"
        env = {**os.environ, 'SOURCE_COMMIT': 'b'*40, 'NAUMI_WORKER_RELEASE_CONTROL': '1', 'NAUMI_MEDIA_WORKER': '1',
               'VIDEO_WORKER_SECRET': 'synthetic-only-secret-at-least-32-characters', 'NAUMI_WORKER_CONTROL_PORT': '3001'}
        return subprocess.run(['node', '--input-type=module', '-e', setup+m.REMOTE+audit, m.canonical(action)],
                              capture_output=True, text=True, timeout=10, env=env)

    def test_actual_remote_uses_only_parent_proxy_for_every_control(self):
        for action in [None, {'action': 'drain', 'operationId': 'original'}, {'action': 'resume', 'operationId': 'original'},
                       {'action': 'reconcile', 'operationId': 'original'}]:
            with self.subTest(action=action):
                result = self.run_remote(action)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('mediaWorker', result.stdout)

    def test_actual_remote_refuses_unsafe_media_health(self):
        for change in [{'version': 'c'*40}, {'sandbox': False}, {'running': None}, {'queued': True},
                       {'terminal': -1}, {'concurrency': 2}]:
            with self.subTest(change=change):
                result = self.run_remote(change=change)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('MEDIA_WORKER_HEALTH_INVALID', result.stderr)

    def test_parent_partial_failure_is_fail_closed_without_private_error_output(self):
        result = self.run_remote({'action': 'drain', 'operationId': 'original'}, http_status=503)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('CONTROL_HTTP_503', result.stderr)
        self.assertNotIn('synthetic-private-upstream-error', result.stderr)


if __name__ == '__main__':
    unittest.main()
