import copy
import datetime
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

import release47_controls as m
from release47_host import HostTransaction, public_identity, Hold, sha


@unittest.skipUnless(os.name == 'posix', 'Real POSIX permission and atomic-file contract; run Linux fixture')
class Controls(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = pathlib.Path(self.tmp.name)
        self.calls = []
        self.row = {'Id': '1'*64, 'Name': '/naumi47-candidate', 'Image': 'sha256:'+'a'*64,
                    'State': {'Running': True, 'StartedAt': 'boot'},
                    'Config': {'Cmd': ['node', 'server.js'], 'Env': ['NAUMI_RELEASE_RUNTIME=1',
                     'NAUMI_INSTANCE_ID=naumi47-candidate', 'SOURCE_COMMIT='+'b'*40]},
                    'HostConfig': {'RestartPolicy': {'Name': 'no'}}}
        self.status = {'schemaVersion': 1, 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'identity': {'instanceId': 'naumi47-candidate', 'bootId': '22222222-2222-4222-8222-222222222222',
                                    'commit': 'b'*40, 'bootSource': 'preload'},
                       'admission': {'mode': 'draining', 'revision': 0}, 'transport': {'verified': True}}
        self.receipts = {}
        self.tx = HostTransaction('47.105.59.142', 'c'*64, self.folder, command=self.command)
        self.tx.stack = True
        self.identity = public_identity(self.row)

    def tearDown(self): self.tmp.cleanup()

    def command(self, args, **kwargs):
        self.calls.append(args)
        if args[:2] == ['docker', 'inspect']: return json.dumps([self.row]).encode()
        if args[:2] == ['docker', 'exec']:
            self.assertEqual(args[2:4], ['-e', 'NODE_OPTIONS='])
            request = json.loads(args[-1])
            if request is None: return json.dumps(self.status).encode()
            if request['operationId'] not in self.receipts:
                self.status['admission'] = {'mode': 'open' if request['action'] == 'resume' else 'draining',
                                            'revision': request['expectedRevision'] + 1}
                self.receipts[request['operationId']] = {'identity': self.status['identity'],
                    'admission': self.status['admission'], 'operationId': request['operationId']}
            return json.dumps(self.receipts[request['operationId']]).encode()
        if args[:2] == ['docker', 'start']: self.row['State']['Running'] = True
        return b''

    def test_app_status_is_identity_bound_and_no_secret_argv(self):
        self.assertEqual(m.app_status(self.tx, self.identity), self.status)
        self.assertFalse(any('secret-value' in value for call in self.calls for value in call))
        self.assertTrue(all(c[2:4]==['-e','NODE_OPTIONS='] for c in self.calls if c[:2]==['docker','exec']))

    def test_app_control_cas_acknowledged_and_repeated_operation_is_not_resent(self):
        op = '33333333-3333-4333-8333-333333333333'
        result = m.control_app(self.tx, self.identity, 'resume', op)
        self.assertEqual(result['current']['admission'], {'mode': 'open', 'revision': 1})
        result = m.control_app(self.tx, self.identity, 'resume', op)
        self.assertEqual(result['result'], 'ALREADY_ACKNOWLEDGED')
        writes = [c for c in self.calls if c[:2] == ['docker', 'exec'] and c[-1] != 'null']
        self.assertEqual(len(writes), 1)

    def test_app_lost_response_is_unknown_and_retry_uses_exact_body(self):
        original = self.tx._command
        sent = []
        def lost(args, **kw):
            result = original(args, **kw)
            if args[:2] == ['docker', 'exec'] and args[-1] != 'null':
                sent.append(args[-1])
                if len(sent) == 1: raise Hold('NETWORK_RESPONSE_LOST')
            return result
        self.tx._command = lost
        op = '33333333-3333-4333-8333-333333333333'
        with self.assertRaises(Hold): m.control_app(self.tx, self.identity, 'resume', op)
        record = json.loads((self.folder/'app-controls'/(op+'.json')).read_text())
        self.assertEqual(record['phase'], 'UNKNOWN')
        m.control_app(self.tx, self.identity, 'resume', op)
        self.assertEqual(sent[0], sent[1]); self.assertEqual(self.status['admission']['revision'], 1)

    def test_unknown_app_operation_blocks_different_op_and_new_boot(self):
        op = '33333333-3333-4333-8333-333333333333'
        folder = self.folder/'app-controls'; folder.mkdir(mode=0o700)
        (folder/(op+'.json')).write_text(json.dumps({'binding': {'container': self.identity, 'action': 'resume'},
              'phase': 'UNKNOWN', 'request': {'bootId': '44444444-4444-4444-8444-444444444444'}}))
        with self.assertRaisesRegex(Hold, 'UNRESOLVED'): m.control_app(self.tx, self.identity, 'drain', '55555555-5555-4555-8555-555555555555')
        with self.assertRaisesRegex(Hold, 'BOOT_CHANGED'): m.control_app(self.tx, self.identity, 'resume', op)

    def test_legacy_stale_fallback_and_bad_transport_are_unknown(self):
        for change in [lambda: self.row['Config'].update(Env=[]),
                       lambda: self.status['identity'].update(bootSource='process-fallback'),
                       lambda: self.status.update(observedAt='2000-01-01T00:00:00Z'),
                       lambda: self.status.update(transport={'verified': False}),
                       lambda: self.status['identity'].update(commit='c'*40)]:
            saved = copy.deepcopy((self.row, self.status)); change()
            with self.assertRaises(Hold): m.app_status(self.tx, self.identity)
            self.row, self.status = saved
        self.assertFalse(any(c[:2] in [['docker', 'stop'], ['docker', 'update']] for c in self.calls))

    def test_control_receipt_drift_is_unknown(self):
        original = self.tx._command
        def bad(args, **kw):
            raw = original(args, **kw)
            if args[:2] == ['docker', 'exec'] and args[-1] != 'null':
                value = json.loads(raw); value['operationId'] = 'wrong'; return json.dumps(value).encode()
            return raw
        self.tx._command = bad
        op = '33333333-3333-4333-8333-333333333333'
        with self.assertRaisesRegex(Hold, 'RECEIPT_MISMATCH'): m.control_app(self.tx, self.identity, 'resume', op)
        self.assertEqual(json.loads((self.folder/'app-controls'/(op+'.json')).read_text())['phase'], 'UNKNOWN')

    def test_worker_start_preserves_full_host_reserve_and_paused(self):
        self.row['State']['Running'] = False
        self.row['Config'].update(Cmd=['node', 'scripts/video-worker.mjs'], Env=['NAUMI_WORKER_RELEASE_CONTROL=1', 'NAUMI_WORKER_START_PAUSED=1'])
        self.row['HostConfig']['Memory'] = 128*1024**2
        identity = public_identity(self.row)
        with self.assertRaisesRegex(Hold, 'MEMORY'): m.start_worker(self.tx, identity, 1151)
        self.assertFalse(any(c[:2] == ['docker', 'start'] for c in self.calls))
        self.assertTrue(m.start_worker(self.tx, identity, 1152)['running'])

    def gateway(self):
        root = self.folder/'nginx'; root.mkdir()
        paths = {str(root/'nginx.conf'): b'original main\n', str(root/'site.conf'): b'original site\n'}
        for name, data in paths.items(): pathlib.Path(name).write_bytes(data)
        after = {name: b'new '+data for name, data in paths.items()}
        report = {'configClosureValidated': True, 'baselineFileCasVerified': True,
                  'beforeDumpSha256': sha(b'before'), 'afterDumpSha256': sha(b'after'),
                  'patches': [{'path': n, 'beforeSha256': sha(b), 'afterSha256': sha(after[n])} for n,b in paths.items()]}
        return root, paths, after, report

    def gateway_command(self, paths, after, fail_reload=False):
        failed = False
        def command(args, **kw):
            nonlocal failed
            self.calls.append(args)
            if args == ['nginx', '-T']:
                return b'after' if all(pathlib.Path(n).read_bytes()==after[n] for n in paths) else b'before'
            if args == ['systemctl', 'reload', 'nginx'] and fail_reload and not failed:
                failed = True; raise Hold('RELOAD_FAILED')
            return b''
        return command

    def test_gateway_exact_multi_file_cas_and_reload(self):
        root, before, after, report = self.gateway()
        self.tx._command = self.gateway_command(before, after)
        with patch.object(m, 'NGINX_ROOT', root), patch.object(m, '_replace_config', lambda p,b:p.write_bytes(b)):
            result = m.switch_gateway_bundle(self.tx, report, before, after,
              expected_dump_sha=sha(b'before'), logical_to_real={n:str(pathlib.Path(n).resolve()) for n in before})
        self.assertTrue(result['reloadIssued']); self.assertFalse(result['tasksReplayed'])
        self.assertTrue(all(pathlib.Path(n).read_bytes()==after[n] for n in before))

    def test_gateway_failed_reload_rolls_back_exact_bytes_without_db_restore(self):
        root, before, after, report = self.gateway()
        self.tx._command = self.gateway_command(before, after, True)
        with patch.object(m, 'NGINX_ROOT', root), patch.object(m, '_replace_config', lambda p,b:p.write_bytes(b)):
            with self.assertRaisesRegex(Hold, 'RELOAD_FAILED'):
                m.switch_gateway_bundle(self.tx, report, before, after, expected_dump_sha=sha(b'before'),
                    logical_to_real={n:str(pathlib.Path(n).resolve()) for n in before})
        self.assertTrue(all(pathlib.Path(n).read_bytes()==before[n] for n in before))
        self.assertEqual(self.calls.count(['systemctl', 'reload', 'nginx']), 2)

    def test_gateway_rejects_unedited_file_drift_before_writing(self):
        root, before, after, report = self.gateway()
        extra = str(root/'unrelated.conf');before[extra] = b'unrelated'; pathlib.Path(extra).write_bytes(b'foreign change')
        self.tx._command = self.gateway_command(before, after)
        with patch.object(m, 'NGINX_ROOT', root):
            with self.assertRaisesRegex(Hold, 'CAS_CHANGED'):
                m.switch_gateway_bundle(self.tx, report, before, after, expected_dump_sha=sha(b'before'),
                    logical_to_real={n:str(pathlib.Path(n).resolve()) for n in before})
        self.assertFalse(any(c == ['systemctl', 'reload', 'nginx'] for c in self.calls))

    def test_preserve_written_failed_reload_never_reloads_previous_program(self):
        root, before, after, report = self.gateway()
        self.tx._command = self.gateway_command(before, after, True)
        with patch.object(m, 'NGINX_ROOT', root):
            with self.assertRaisesRegex(Hold, 'RELOAD_FAILED'):
                m.switch_gateway_bundle(self.tx, report, before, after, expected_dump_sha=sha(b'before'),
                    logical_to_real={n: str(pathlib.Path(n).resolve()) for n in before}, failure_policy='preserve-written')
        self.assertTrue(all(pathlib.Path(n).read_bytes() == after[n] for n in before))
        self.assertEqual(self.calls.count(['systemctl', 'reload', 'nginx']), 1)
        receipt = json.loads((self.folder/'gateway-uncertain-preserved.json').read_bytes())
        self.assertFalse(receipt['preimageRestored'])
        self.assertEqual(receipt['reloadOutcome'], 'UNKNOWN')

    def test_preserve_written_partial_atomic_write_stays_unknown(self):
        root, before, after, report = self.gateway()
        self.tx._command = self.gateway_command(before, after)
        replace = m._replace_config
        writes = []
        def fail_second(path, raw):
            writes.append(str(path))
            if len(writes) == 2:
                raise OSError('synthetic atomic-write failure')
            replace(path, raw)
        with patch.object(m, 'NGINX_ROOT', root), patch.object(m, '_replace_config', fail_second):
            with self.assertRaises(OSError):
                m.switch_gateway_bundle(self.tx, report, before, after, expected_dump_sha=sha(b'before'),
                    logical_to_real={n: str(pathlib.Path(n).resolve()) for n in before}, failure_policy='preserve-written')
        self.assertEqual(pathlib.Path(writes[0]).read_bytes(), after[writes[0]])
        self.assertEqual(pathlib.Path(writes[1]).read_bytes(), before[writes[1]])
        self.assertFalse(any(c == ['systemctl', 'reload', 'nginx'] for c in self.calls))
        receipt = json.loads((self.folder/'gateway-uncertain-preserved.json').read_bytes())
        self.assertTrue(receipt['reconciliationRequired'])
        self.assertEqual(len(receipt['possibleWritePaths']), 2)

    def test_actual_saas_forward_timeout_then_maintenance_preserves_both_intents(self):
        from release47_saas_successor import SaasController
        root, before, after, report = self.gateway()
        maintenance = {name: b'maintenance ' + raw for name, raw in after.items()}
        reload_snapshots = []
        def command(args, **kw):
            self.calls.append(args)
            current = {name: pathlib.Path(name).read_bytes() for name in before}
            if args == ['nginx', '-T']:
                return b'before' if current == before else b'after' if current == after else b'maintenance' if current == maintenance else b'mixed'
            if args == ['systemctl', 'reload', 'nginx']:
                # Model the important ambiguous case: reload was accepted, but
                # its command reply was lost. The disk preimage is NOT safe.
                reload_snapshots.append(current)
                if len(reload_snapshots) == 1:
                    raise Hold('RELOAD_TIMEOUT_AFTER_APPLY')
            return b''
        self.tx._command = command
        operator = SaasController.__new__(SaasController)
        operator.tx = self.tx
        operator.cfg = {'expectedGatewayDigest': sha(b'before')}
        operator.dump = 'before'
        operator.forward, operator.before, operator.after = report, before, after
        operator.candidate_closure = after
        operator.real = {name: str(pathlib.Path(name).resolve()) for name in before}
        operator.emergency_after = maintenance
        operator.emergency = {'configClosureValidated': True, 'baselineFileCasVerified': True,
            'beforeDumpSha256': sha(b'after'), 'afterDumpSha256': sha(b'maintenance'),
            'patches': [{'path': name, 'beforeSha256': sha(raw), 'afterSha256': sha(maintenance[name])}
                        for name, raw in after.items()]}
        operator.succ = {'phase': 'READY', 'operations': {}}
        operator.persist = Mock()
        operator.verify_internal_authority = Mock()  # This case tests only real gateway IO; live auth is separate.
        operator.switched = False
        with patch.object(m, 'NGINX_ROOT', root):
            with self.assertRaisesRegex(Hold, 'RELOAD_TIMEOUT_AFTER_APPLY'):
                operator.op('gateway-switch', lambda _: operator.switch_forward_gateway())
            self.assertEqual(operator.succ['operations']['gateway-switch']['phase'], 'UNKNOWN')
            operator.recover_failure(Hold('RELOAD_TIMEOUT_AFTER_APPLY'))
        self.assertEqual(reload_snapshots, [after, maintenance])
        self.assertEqual(operator.succ['phase'], 'RECOVERY_REQUIRED')
        self.assertEqual(operator.succ['operations']['gateway-switch']['phase'], 'UNKNOWN')
        self.assertEqual(json.loads((self.folder/'gateway-transaction-intent.json').read_bytes())['beforeDumpSha256'], sha(b'before'))
        emergency_intent = self.folder/'saas-controlled-maintenance/gateway-transaction-intent.json'
        self.assertEqual(json.loads(emergency_intent.read_bytes())['beforeDumpSha256'], sha(b'after'))
        self.assertTrue(all(pathlib.Path(name).read_bytes() == maintenance[name] for name in before))

    def test_worker_clone_rejects_legacy_before_creating(self):
        self.row['Config']['Env'] = []
        with self.assertRaisesRegex(Hold, 'CONTROLLED_DIRECT_WEB_REQUIRED'):
            m.clone_worker(self.tx, self.identity, name='naumi47-worker', memory_mib=128, cpu=.5, state_dir='/tmp/not-valid')
        self.assertFalse(any(c[:2] == ['docker', 'create'] for c in self.calls))


class CombinedMediaControls(unittest.TestCase):
    def setUp(self):
        self.web_name, self.worker_name = 'naumi47-web-fixture', 'naumi47-worker-fixture'
        web_env = {'NAUMI_RELEASE_RUNTIME': '1', 'INTERNAL_APP_ORIGIN': 'http://127.0.0.1:3000',
            'NAUMI_INSTANCE_ID': self.web_name, 'SOURCE_COMMIT': 'b' * 40, 'BUILD_VERSION': '1792700000',
            'VIDEO_WORKER_SECRET': 'scanner-secret-' + 's' * 40, 'MEDIA_WORKER_SECRET': 'media-secret-' + 'm' * 40,
            'NAUMI_MEDIA_WORKER': '1', 'MEDIA_JOB_DIR': '/scratch',
            'MEDIA_WORKER_ORIGIN': 'http://' + self.worker_name + ':3002'}
        scratch = {'Type': 'bind', 'Destination': '/scratch', 'Source': '/opt/naumi-staging/fixture-scratch', 'RW': True}
        self.web = {'Id': '1' * 64, 'Name': '/' + self.web_name, 'Image': 'sha256:' + 'a' * 64,
            'State': {'Running': True, 'StartedAt': 'web-boot'},
            'Config': {'Cmd': ['node', 'server.js'], 'Env': [k + '=' + v for k, v in web_env.items()]},
            'HostConfig': {'RestartPolicy': {'Name': 'no'}}, 'Mounts': [scratch],
            'NetworkSettings': {'Networks': {'fixture-net': {}}}}
        worker_env = {key: web_env[key] for key in ['VIDEO_WORKER_SECRET', 'SOURCE_COMMIT', 'BUILD_VERSION',
            'MEDIA_WORKER_SECRET', 'MEDIA_WORKER_ORIGIN']}
        worker_env.update(NAUMI_APP_ORIGIN='http://' + self.web_name + ':3000', NAUMI_INSTANCE_ID=self.worker_name,
            NAUMI_WORKER_TARGET_INSTANCE_ID=self.web_name, NAUMI_WORKER_RELEASE_CONTROL='1',
            NAUMI_WORKER_START_PAUSED='1', NAUMI_WORKER_CONTROL_PORT='3001',
            NAUMI_WORKER_STATE_FILE='/release-state/worker.json', NAUMI_VIDEO_WORKER='0',
            NODE_OPTIONS='--max-old-space-size=64', NODE_ENV='production', NAUMI_MEDIA_WORKER='1',
            MEDIA_JOB_DIR='/scratch', MEDIA_WORKER_HOST='0.0.0.0', MEDIA_WORKER_PORT='3002',
            MEDIA_WORKER_START_PAUSED='1', MEDIA_WORKER_CONCURRENCY='1')
        self.worker = {'Id': '2' * 64, 'Name': '/' + self.worker_name, 'Image': self.web['Image'],
            'State': {'Running': False, 'StartedAt': ''},
            'Config': {'Cmd': list(m.COMBINED_WORKER_COMMAND), 'User': '0:0',
                       'Env': [k + '=' + v for k, v in worker_env.items()]},
            'HostConfig': {'Memory': 1024 * 1024**2, 'MemorySwap': 1024 * 1024**2,
                'PidsLimit': 160, 'NanoCpus': 1_000_000_000, 'ReadonlyRootfs': True, 'Privileged': False,
                'CapDrop': ['ALL'], 'CapAdd': list(m.COMBINED_WORKER_CAPS),
                'SecurityOpt': ['no-new-privileges:true'], 'Tmpfs': dict(m.COMBINED_WORKER_TMPFS),
                'IpcMode': 'private', 'NetworkMode': 'fixture-net', 'RestartPolicy': {'Name': 'no'}},
            'Mounts': [copy.deepcopy(scratch), {'Type': 'bind', 'Destination': '/release-state',
                'Source': '/opt/naumi-staging/releases/fixture/worker', 'RW': True}],
            'NetworkSettings': copy.deepcopy(self.web['NetworkSettings'])}
        self.calls = []
        owner = self
        class Fixture:
            def pin(self, identity):
                owner.assertEqual(public_identity(owner.worker), identity)
                return owner.worker
            def inspect(self, identifier):
                return owner.web if identifier == owner.web_name else owner.worker
            def save(self, name, value): owner.calls.append(['save', name])
            def run(self, command):
                owner.calls.append(command)
                if command[:2] == ['docker', 'start']: owner.worker['State']['Running'] = True
                return b''
        self.tx = Fixture()

    def test_reviewed_combined_profile_is_strictly_bounded(self):
        m._validate_combined_worker(self.worker, self.web)
        self.assertEqual(self.worker['HostConfig']['Memory'], 1024 * 1024**2)
        self.assertEqual(len(m.COMBINED_WORKER_CAPS), 7)

    def test_combined_web_cannot_create_a_legacy_scanner_before_state_io(self):
        with patch.object(self.tx, 'pin', return_value=self.web), patch.object(m.pathlib.Path, 'mkdir') as mkdir:
            with self.assertRaisesRegex(Hold, 'COMBINED_MEDIA_EXPLICIT_REVIEW_REQUIRED'):
                m.clone_worker(self.tx, public_identity(self.web), name=self.worker_name,
                    memory_mib=128, cpu=.25, state_dir='/opt/naumi-staging/releases/fixture/new-worker')
            mkdir.assert_not_called()
        self.assertFalse(any(c[:2] == ['docker', 'create'] for c in self.calls))

    def test_combined_start_requires_explicit_opt_in_and_full_reserve(self):
        identity = public_identity(self.worker)
        with self.assertRaisesRegex(Hold, 'PAUSED_CONTROLLED_WORKER_REQUIRED'):
            m.start_worker(self.tx, identity, 4096)
        with self.assertRaisesRegex(Hold, 'INSUFFICIENT_WORKER_MEMORY'):
            m.start_worker(self.tx, identity, 2047, reviewed_combined_media=True)
        self.assertFalse(any(c[:2] == ['docker', 'start'] for c in self.calls))
        self.assertTrue(m.start_worker(self.tx, identity, 2048, reviewed_combined_media=True)['running'])

    def test_security_drift_never_reaches_start(self):
        for field, value in [('Memory', 512 * 1024**2), ('PidsLimit', 161), ('ReadonlyRootfs', False),
            ('CapAdd', list(m.COMBINED_WORKER_CAPS | {'SYS_ADMIN'})), ('CapDrop', []),
            ('PidMode', 'host'), ('PortBindings', {'3002/tcp': [{'HostPort': '3002'}]}),
            ('Tmpfs', {'/tmp': 'rw,exec,size=1g'})]:
            saved = copy.deepcopy(self.worker)
            self.worker['HostConfig'][field] = value
            with self.subTest(field=field), self.assertRaises(Hold):
                m.start_worker(self.tx, public_identity(self.worker), 4096, reviewed_combined_media=True)
            self.worker = saved
        self.assertFalse(any(c[:2] == ['docker', 'start'] for c in self.calls))

    def test_worker_never_accepts_db_nas_or_extra_secret_environment(self):
        for entry in ['DATABASE_URL=fixture-not-real', 'SETTINGS_SECRET=fixture-not-real',
                      'S3_ACCESS_KEY_ID=fixture-not-real', 'MODEL_CONFIG_PROXY_URL=fixture-not-real']:
            saved = list(self.worker['Config']['Env']); self.worker['Config']['Env'].append(entry)
            with self.subTest(entry=entry.split('=', 1)[0]), self.assertRaisesRegex(Hold, 'ENVIRONMENT_NOT_REVIEWED'):
                m._validate_combined_worker(self.worker, self.web)
            self.worker['Config']['Env'] = saved

    def test_separate_media_secret_and_exact_scratch_binding_are_required(self):
        original = copy.deepcopy(self.web)
        self.web['Config']['Env'] = [v if not v.startswith('MEDIA_WORKER_SECRET=') else
            'MEDIA_WORKER_SECRET=' + m.environment(self.web)['VIDEO_WORKER_SECRET'] for v in self.web['Config']['Env']]
        with self.assertRaisesRegex(Hold, 'MEDIA_BINDING_REQUIRED'):
            m._validate_combined_worker(self.worker, self.web)
        self.web = original
        self.worker['Mounts'][0]['Source'] = '/another-scratch'
        with self.assertRaisesRegex(Hold, 'MOUNTS_CHANGED'):
            m._validate_combined_worker(self.worker, self.web)

    def test_no_added_volume_or_public_image_environment_can_leak_data(self):
        self.worker['Mounts'].append({'Type': 'volume', 'Destination': '/data', 'Source': '/unknown'})
        with self.assertRaisesRegex(Hold, 'MOUNTS_CHANGED'):
            m._validate_combined_worker(self.worker, self.web)


if __name__ == '__main__': unittest.main()
