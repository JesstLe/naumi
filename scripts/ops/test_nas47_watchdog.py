import contextlib
import dataclasses
import hashlib
import http.server
import json
import os
import pathlib
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch

import nas47_watchdog as m
import install_nas47_watchdog as install


class Probe:
    def __init__(self, code='timeout'):
        self.code = code
        self.calls = 0

    def check(self, endpoint):
        self.calls += 1
        return m.Probe(self.code, 200 if self.code == 'ok' else 0)


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.c = {'endpoint': 'primary', 'bridgeEndpoint': 'bridge'}
        self.probe = Probe()
        self.current = m.Session(12345, 'pinned-start', 200000)
        self.actions = []
        self.saved = []
        self.now = 10000
        self.w = m.Watchdog(self.c, self.probe, session=lambda: self.current,
                            locks=contextlib.nullcontext, terminate=self.terminate,
                            clock=lambda: self.now, sleep=lambda _: None,
                            save=lambda s: self.saved.append(json.loads(json.dumps(s))))

    def terminate(self, session):
        self.actions.append(session)
        self.probe.code = 'ok'

    def failures(self, n=3, state=None):
        state = state or m.empty_state()
        for _ in range(n):
            state = self.w.tick(state)
        return state

    def test_healthy_no_signal(self):
        self.probe.code = 'ok'
        s = self.failures(5)
        self.assertEqual(s['failures'], 0)
        self.assertFalse(s['alert'])
        self.assertEqual(self.actions, [])

    def test_three_timeouts_proven_stale_one_recovery(self):
        s = self.failures(2)
        self.assertEqual(self.actions, [])
        s = self.failures(1, s)
        self.assertEqual(s['outcome'], 'recovered')
        self.assertEqual(self.actions, [self.current])
        self.assertEqual(s['attempts'], [10000])
        self.assertEqual(self.saved[-2]['outcome'], 'reconnecting')

    def test_active_transfer_never_signal(self):
        self.current = dataclasses.replace(self.current, last_receive_ms=100)
        self.assertEqual(self.failures(5)['outcome'], 'transport_unavailable')
        self.assertEqual(self.actions, [])

    def test_absent_or_unverified_session_never_signal(self):
        self.current = None
        self.failures(5)
        self.assertEqual(self.actions, [])

    def test_http_403_content_mismatch_and_404_are_not_a_dead_tunnel(self):
        for code in ['http_403', 'http_404', 'content_mismatch', 'http_503']:
            self.probe.code = code
            self.assertEqual(self.failures(5)['outcome'], 'storage_or_credentials')
        self.assertEqual(self.actions, [])

    def test_bridge_only_failure_never_kills_working_tunnel(self):
        self.w.reads = lambda: (m.Probe('ok', 200), m.Probe('timeout'))
        self.assertEqual(self.failures(5)['outcome'], 'bridge_fault')
        self.assertEqual(self.actions, [])

    def test_release_lock_contention_no_mutation(self):
        @contextlib.contextmanager
        def busy():
            raise BlockingIOError()
            yield
        self.w.locks = busy
        s = self.failures()
        self.assertEqual(s['outcome'], 'release_lock_busy')
        self.assertEqual(s['attempts'], [])
        self.assertEqual(self.actions, [])

    def test_recheck_healthy_cancels(self):
        s = self.failures(2)
        count = [0]
        def reads():
            count[0] += 1
            return (m.Probe('timeout'),) * 2 if count[0] == 1 else (m.Probe('ok', 200),) * 2
        self.w.reads = reads
        self.assertEqual(self.w.tick(s)['outcome'], 'recheck_cancelled')
        self.assertEqual(self.actions, [])

    def test_recheck_pid_reuse_or_new_session_cancels(self):
        s = self.failures(2)
        old = self.current
        sessions = iter([old, dataclasses.replace(old, start='recycled-pid')])
        self.w.session = lambda: next(sessions)
        self.assertEqual(self.w.tick(s)['outcome'], 'session_changed_or_active')
        self.assertEqual(self.actions, [])

    def test_cooldown_and_hourly_cap_and_backward_clock(self):
        for extra, expected in [({'lastAttempt': 9999}, 'cooldown'),
                                ({'lastAttempt': 9000, 'attempts': [8000, 9000]}, 'recovery_limit'),
                                ({'lastAttempt': 10001}, 'clock_hold')]:
            s = dict(m.empty_state(), **extra)
            self.assertEqual(self.failures(state=s)['outcome'], expected)
            self.assertEqual(self.actions, [])

    def test_restarted_watchdog_keeps_budget_after_signal_failure(self):
        self.w.terminate = lambda _: (_ for _ in ()).throw(OSError('fixture'))
        s = self.failures()
        self.assertEqual(s['outcome'], 'recovery_guard_failed')
        self.assertEqual(s['lastAttempt'], 10000)
        s = json.loads(json.dumps(s))
        self.assertEqual(self.failures(1, s)['outcome'], 'cooldown')

    def test_recovery_unconfirmed_never_clears_alert(self):
        self.w.terminate = lambda s: self.actions.append(s)
        s = self.failures()
        self.assertEqual(s['outcome'], 'recovery_unconfirmed')
        self.assertTrue(s['alert'])
        self.assertEqual(len(self.actions), 1)


class WireTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mode = 'ok'
        cls.requests = []
        cls.payload = b'fixture NAS health object\n'
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                cls.requests.append(dict(self.headers))
                if cls.mode == 'disconnect':
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                if cls.mode == 'stall':
                    threading.Event().wait(0.15)
                    return
                code = int(cls.mode) if cls.mode in ['403', '404', '503', '302'] else 200
                self.send_response(code)
                if code == 302:
                    self.send_header('Location', '/must-not-follow')
                self.end_headers()
                self.wfile.write(cls.payload if cls.mode != 'corrupt' else b'wrong bytes')
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.endpoint = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.__class__.mode = 'ok'
        self.__class__.requests = []
        self.c = {'bucket': 'fixture-bucket', 'probeKey': '.naumi-ops/health/nas47-' + 'a' * 32 + '.txt',
                  'probeSha256': hashlib.sha256(self.payload).hexdigest(), 'region': 'garage'}
        self.p = m.S3Probe(self.c, {'accessKeyId': 'fixture-access', 'secretAccessKey': 'fixture-secret'})

    def test_real_signed_get_and_hash(self):
        self.assertTrue(self.p.check(self.endpoint).ok)
        headers = {k.lower(): v for k, v in self.requests[-1].items()}
        self.assertTrue(headers['authorization'].startswith('AWS4-HMAC-SHA256 Credential=fixture-access/'))
        self.assertEqual(headers['cache-control'], 'no-store')
        self.assertNotIn('fixture-secret', json.dumps(headers))

    def test_actual_storage_errors_and_content_integrity(self):
        for mode, expected in [('403', 'http_403'), ('404', 'http_404'), ('503', 'http_503'), ('corrupt', 'content_mismatch'), ('disconnect', 'transport_error')]:
            self.__class__.mode = mode
            self.assertEqual(self.p.check(self.endpoint).code, expected)

    def test_no_redirect_or_credential_forwarding(self):
        self.__class__.mode = '302'
        self.assertEqual(self.p.check(self.endpoint).code, 'http_302')
        self.assertEqual(len(self.requests), 1)

    def test_blackhole_timeout(self):
        self.__class__.mode = 'stall'
        original = self.p.opener.open
        with patch.object(self.p.opener, 'open', side_effect=lambda r, timeout: original(r, timeout=0.03)):
            self.assertEqual(self.p.check(self.endpoint).code, 'timeout')

    def test_corrupt_state_fail_closed_and_atomic_budget_survives_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'state.json'
            m.atomic(path, m.empty_state())
            self.assertEqual(m.load_state(path), m.empty_state())
            for data in [{'schemaVersion': 1}, dict(m.empty_state(), attempts=[float('nan')])]:
                m.atomic(path, data)
                with self.assertRaises(ValueError):
                    m.load_state(path)


class ProcessTests(unittest.TestCase):
    def test_only_match_allowed_liveness_directives_and_no_root_policy_change(self):
        directives = [l.strip().split()[0] for l in install.BLOCK.splitlines() if l.strip() and not l.strip().startswith('#')]
        self.assertEqual(directives, ['Match', 'ClientAliveInterval', 'ClientAliveCountMax'])
        self.assertEqual(install.changed_keys('clientaliveinterval 0\npermitlisten any\n', 'clientaliveinterval 30\npermitlisten any\n'), {'clientaliveinterval'})

    def test_only_unambiguous_pinned_ssh_listener_and_transport(self):
        listener = 'LISTEN 0 128 127.0.0.1:13947 0.0.0.0:* users:(("sshd",pid=12345,fd=7))\n'
        transport = '0 0 127.0.0.1:22 127.0.0.2:50000 users:(("sshd",pid=12345,fd=4))\n\t cubic lastrcv:200001 lastack:100\n'
        with patch.object(m, 'command', side_effect=[listener, transport]), patch.object(m, 'process_identity', return_value='start'):
            self.assertEqual(m.read_session({'user': 'naumi-nas47', 'uid': 1001}), m.Session(12345, 'start', 200001))
        with patch.object(m, 'command', return_value=listener + listener):
            self.assertIsNone(m.read_session({'user': 'naumi-nas47', 'uid': 1001}))
        with patch.object(m, 'command', return_value=listener), patch.object(m, 'process_identity', side_effect=ValueError('wrong UID or executable')):
            self.assertIsNone(m.read_session({'user': 'naumi-nas47', 'uid': 1001}))

    def test_pidfd_signal_targets_only_pinned_stale_session(self):
        s = m.Session(12345, 'start', 200000)
        with patch.object(m.os, 'pidfd_open', return_value=88) as opened, patch.object(m.os, 'close') as closed, patch.object(m.signal, 'pidfd_send_signal') as sent, patch.object(m, 'read_session', return_value=s):
            m.terminate_session({}, s)
            opened.assert_called_once_with(12345)
            sent.assert_called_once_with(88, m.signal.SIGTERM)
            closed.assert_called_once_with(88)

    def test_pid_recycled_or_new_data_never_signalled(self):
        original = m.Session(12345, 'start', 200000)
        for current in [None, m.Session(12345, 'new-start', 200000), m.Session(12345, 'start', 10)]:
            with patch.object(m.os, 'pidfd_open', return_value=88), patch.object(m.os, 'close') as closed, patch.object(m.signal, 'pidfd_send_signal') as sent, patch.object(m, 'read_session', return_value=current):
                with self.assertRaises(ValueError):
                    m.terminate_session({}, original)
                sent.assert_not_called()
                closed.assert_called_once_with(88)

    def test_corrupt_config_and_symlink_cannot_arm_watchdog(self):
        with tempfile.TemporaryDirectory() as directory:
            p = pathlib.Path(directory) / 'config.json'
            m.atomic(p, {'schemaVersion': 1})
            with patch.object(m, 'CONFIG', p):
                with self.assertRaises(ValueError):
                    m.load_config()
            link = pathlib.Path(directory) / 'symlink.json'
            link.symlink_to(p)
            with self.assertRaises(ValueError):
                m.private_json(link)


if __name__ == '__main__':
    unittest.main()
