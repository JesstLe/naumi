import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HERE = Path(__file__).resolve().parent
collector = load('collector_test', HERE / 'admin_anomaly_remote.py')
runner = load('runner_test', HERE / 'run_admin_anomaly_watch.py')
GATEWAY = '''# configuration file /etc/nginx/sites-enabled/reference-workbench:
server { listen 443 ssl; server_name 47.105.59.142;
location / { proxy_pass "http://127.0.0.1:13116"; proxy_http_version 1.1; }
}
# configuration file /etc/nginx/conf.d/other.conf:
location / { proxy_pass http://127.0.0.1:9999; }
'''
SQL = """WITH picked AS MATERIALIZED (
 SELECT id FROM app_image_jobs WHERE (updated_at>=now()-interval '72 hours')
 ORDER BY updated_at DESC,id LIMIT 2001)
    SELECT jsonb_build_object('id',j.id) FROM picked j"""


class CollectorContract(unittest.TestCase):
    def test_current_public_port_not_old_name(self):
        self.assertEqual(collector.current_web_port(GATEWAY), 13116)

    def test_comments_and_unrelated_locations_do_not_select_old_web(self):
        text = GATEWAY.replace('location / {', '# location / { proxy_pass http://127.0.0.1:13115; }\nlocation / {', 1)
        self.assertEqual(collector.current_web_port(text), 13116)

    def test_same_file_http_redirect_does_not_hide_https_proxy(self):
        redirect = 'server { listen 80; server_name 47.105.59.142; location / { return 308 https://$host$request_uri; } }\n'
        text = GATEWAY.replace('server { listen 443', redirect + 'server { listen 443')
        self.assertEqual(collector.current_web_port(text), 13116)
        with self.assertRaises(AssertionError):
            collector.current_web_port(text.replace('return 308 https://$host', 'return 308 https://other.invalid'))

    def test_ambiguous_or_changed_public_route_rejected(self):
        for text in [GATEWAY.replace('47.105.59.142', 'other.invalid'),
                     GATEWAY.replace('127.0.0.1:13116', 'external.invalid:13116'),
                     GATEWAY.replace('location / {', 'location / { proxy_pass http://127.0.0.1:13115;'),
                     GATEWAY.replace('http://127.0.0.1:13116', '$unreviewed_backend')]:
            with self.subTest(text=text), self.assertRaises(AssertionError):
                collector.current_web_port(text)

    def test_exact_running_loopback_container(self):
        def row(port, running=True, host='127.0.0.1'):
            return {'State': {'Running': running}, 'NetworkSettings': {'Ports': {'3000/tcp': [{'HostIp': host, 'HostPort': str(port)}]}}, 'Config': {'Env': ['SOURCE_COMMIT=' + 'a' * 40]}}
        old, new = row(13115), row(13116)
        self.assertIs(collector.select_current_web([old, new], 13116), new)
        for rows in [[old], [new, row(13116)], [row(13116, False)], [row(13116, host='0.0.0.0')]]:
            with self.assertRaises(AssertionError):
                collector.select_current_web(rows, 13116)

    def test_fixed_key_pages_survive_concurrent_sort_changes(self):
        identities = [str(i) for i in range(205)]
        calls = []
        def query(sql):
            calls.append(sql)
            self.assertNotIn(' OFFSET ', sql)
            if len(calls) == 1:
                return [{'id': v} for v in identities]
            keys = sql.split('WHERE id IN (', 1)[1].split(')', 1)[0]
            return [{'id': x.strip("'")} for x in reversed(keys.split(','))]
        rows = collector.fixed_image_pages(query, SQL, 2000)
        self.assertEqual({r['id'] for r in rows}, set(identities))
        self.assertEqual(len(calls), 4)
        self.assertEqual(len(rows), 205)

    def test_empty_selection_does_not_query_large_snapshots(self):
        calls = []
        self.assertEqual(collector.fixed_image_pages(lambda sql: calls.append(sql) or [], SQL, 2000), [])
        self.assertEqual(len(calls), 1)

    def test_duplicate_missing_or_replaced_pinned_ids_fail_closed(self):
        for page in [[{'id': 'a'}, {'id': 'a'}], [{'id': 'a'}], [{'id': 'a'}, {'id': 'other'}]]:
            n = 0
            def query(sql):
                nonlocal n
                n += 1
                return [{'id': 'a'}, {'id': 'b'}] if n == 1 else page
            with self.assertRaises(AssertionError):
                collector.fixed_image_pages(query, SQL, 2000)

    def test_duplicate_selection_rejected(self):
        with self.assertRaises(AssertionError):
            collector.fixed_image_pages(lambda sql: [{'id': 'a'}, {'id': 'a'}], SQL, 2000)


class RunnerEvidence(unittest.TestCase):
    def exercise(self, responses, expected):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'scripts/ops/run_admin_anomaly_watch.py'
            path.parent.mkdir(parents=True)
            (path.parent / 'admin_anomaly_remote.py').write_text('pass', encoding='utf-8')
            identity = root / 'fixture-key'; identity.write_bytes(b'fixture')
            known = root / 'fixture-host'; known.write_bytes(b'fixture')
            args = ['runner', '--identity', str(identity), '--known-hosts', str(known)]
            with patch.object(runner, '__file__', str(path)), patch.object(sys, 'argv', args), patch.object(runner.subprocess, 'run', side_effect=responses), contextlib.redirect_stdout(io.StringIO()):
                code = runner.main()
            out = root / 'output/admin-anomaly-watch-20261026'
            result = json.loads((out / 'LATEST_RUN.json').read_text(encoding='utf-8'))
            self.assertEqual(result['result'], expected)
            run = out / 'runs' / result['run']
            self.assertEqual(json.loads((run / 'RESULT.json').read_text(encoding='utf-8')), result)
            self.assertTrue((run / 'observation.private.json').is_file())
            return code, result

    def test_timeout_preserves_partial_bytes_and_nonhealthy_result(self):
        code, result = self.exercise([subprocess.TimeoutExpired('fixture-ssh', 180, output=b'partial', stderr=b'fixture')], 'COLLECTION_TIMEOUT')
        self.assertEqual(code, 1); self.assertFalse(result['cleanBillOfHealth'])

    def test_collection_failure_has_durable_result(self):
        code, result = self.exercise([subprocess.CompletedProcess([], 1, b'{}', b'fixture')], 'COLLECTION_FAILED')
        self.assertEqual(code, 1); self.assertFalse(result['cleanBillOfHealth'])

    def test_analysis_failure_not_recorder_success(self):
        code, result = self.exercise([subprocess.CompletedProcess([], 0, b'{}', b''), subprocess.CompletedProcess([], 1, '', 'DUPLICATE_OBSERVATION')], 'ANALYSIS_FAILED')
        self.assertEqual(code, 1); self.assertFalse(result['cleanBillOfHealth'])

    def test_success_has_ledger_pointer(self):
        code, result = self.exercise([subprocess.CompletedProcess([], 0, b'{}', b''), subprocess.CompletedProcess([], 0, 'RECORDED', '')], 'RECORDED')
        self.assertEqual(code, 0); self.assertIn('ledger', result)

    def test_queued_schedule_deliveries_do_not_burst_repeat_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); path = root / 'scripts/ops/run_admin_anomaly_watch.py'
            path.parent.mkdir(parents=True)
            (path.parent / 'admin_anomaly_remote.py').write_text('pass', encoding='utf-8')
            key = root / 'key'; key.write_bytes(b'fixture')
            args = ['runner', '--identity', str(key), '--known-hosts', str(key), '--minimum-interval-seconds', '900']
            responses = [subprocess.CompletedProcess([], 0, b'{}', b''), subprocess.CompletedProcess([], 0, 'RECORDED', '')]
            with patch.object(runner, '__file__', str(path)), patch.object(sys, 'argv', args), patch.object(runner.subprocess, 'run', side_effect=responses) as calls, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(), 0)
                latest = root / 'output/admin-anomaly-watch-20261026/LATEST_RUN.json'
                original = latest.read_bytes()
                self.assertEqual(runner.main(), 3)
                self.assertEqual(calls.call_count, 2)
                self.assertEqual(latest.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
