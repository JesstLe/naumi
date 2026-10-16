import copy
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

import release47_inventory as m


WEB, WORKER, DB = '1' * 64, '2' * 64, '3' * 64
MACHINE = b'a' * 32 + b'\n'
SECRET = 'fixture-never-publish-password-abcdefgh'


def container(identifier, name, cmd, *, pid=101, env=None, port=None, running=True):
    return {'Id': identifier, 'Name': '/' + name, 'Image': 'sha256:' + 'a' * 64,
            'Config': {'Cmd': cmd, 'Env': ['SOURCE_COMMIT=' + 'a' * 40, 'BUILD_VERSION=1792127247',
                      'VIDEO_WORKER_SECRET=' + SECRET, *(env or [])], 'ExposedPorts': {'3000/tcp': {}}},
            'State': {'Running': running, 'StartedAt': '2026-10-16T00:00:00Z', 'Pid': pid},
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}, 'Memory': 1024 * 1024 * 1024, 'NanoCpus': 1000000000},
            'Mounts': [{'Type': 'bind', 'Source': '/private/' + SECRET, 'Destination': '/data', 'RW': True}],
            'NetworkSettings': {'Ports': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(port)}]} if port else {},
                                'Networks': {'naumi': {'IPAddress': '172.20.0.' + str(pid - 99), 'GlobalIPv6Address': '', 'Aliases': [name]}}}}


NGINX = b'''# configuration file /etc/nginx/nginx.conf:
events {}
http {
 upstream old_web { server 127.0.0.1:13012; }
 map $request_uri $dynamic { default http://127.0.0.1:13013; }
 server {
  listen 443 ssl;
  location / { proxy_pass http://old_web; }
  location /api/imagegen { proxy_pass $dynamic; }
  location /credential { proxy_pass http://user:fixture-never-publish-password-abcdefgh@127.0.0.1:13012; }
 }
}
'''


class Fake:
    def __init__(self):
        self.rows = [container(WEB, 'naumi47-old', ['node', 'server.js'], port=13012),
                     container(WORKER, 'naumi47-worker', ['node', 'scripts/video-worker.mjs'], pid=102,
                               env=['NAUMI_APP_ORIGIN=http://naumi47-old:3000']),
                     container(DB, 'postgres', ['postgres'], pid=0, running=False)]
        self.calls, self.private = [], []
        self.fail, self.mutate, self.nginx_calls, self.inspect_calls = None, None, 0, 0

    def save(self, name, raw):
        self.private.append((name, raw))
        return {'path': '/private/secret-location', 'value': SECRET}

    def run(self, args, **kwargs):
        self.calls.append(args)
        if self.fail and self.fail(args):
            raise RuntimeError('private failure: ' + SECRET)
        if args == ['cat', '--', '/etc/machine-id']:
            return MACHINE
        if args == ['cat', '--', '/proc/meminfo']:
            return b'MemTotal: 8192000 kB\nMemAvailable: 2119680 kB\nSwapTotal: 16777216 kB\nSwapFree: 16777216 kB\n'
        if args[:2] == ['docker', 'ps']:
            return ('\n'.join(row['Id'] for row in self.rows) + '\n').encode()
        if args[:2] == ['docker', 'inspect']:
            self.inspect_calls += 1
            rows = copy.deepcopy([r for r in self.rows if r['Id'] in args[2:]])
            if self.mutate and self.inspect_calls > 1:
                self.mutate(rows)
            return json.dumps(rows).encode()
        if args == ['nginx', '-T']:
            self.nginx_calls += 1
            return NGINX
        if args == ['cat', '--', '/etc/nginx/nginx.conf']:
            return NGINX.split(b'\n', 1)[1]
        if args[0] == 'cat' and args[-1].endswith('/cgroup'):
            return b'0::/system.slice/docker-fixture.scope\n'
        if args[0] == 'cat' and args[-1].startswith('/sys/fs/cgroup/'):
            return {'memory.current': b'524288000\n', 'memory.peak': b'805306368\n', 'memory.max': b'1073741824\n',
                    'memory.stat': b'anon 419430400\nfile 104857600\n'}[args[-1].split('/')[-1]]
        if args[:2] == ['systemctl', 'list-units']:
            return b'naumi-worker.service loaded active running fixture\nnginx.service loaded active running fixture\n'
        if args[:2] == ['systemctl', 'list-unit-files']:
            return b'naumi-worker.service enabled enabled\nnginx.service enabled enabled\n'
        if args[:2] == ['systemctl', 'show']:
            return (f'Id={args[2]}\nLoadState=loaded\nActiveState=active\nExecStart={{ path=/bin/sh ; argv[]=/bin/sh -c docker start naumi47-old ; }}\nEnvironment=API_KEY={SECRET}\nEnvironmentFiles=/private/env\n').encode()
        if args[:2] == ['systemctl', 'cat']:
            return (f'[Service]\nEnvironment=API_KEY={SECRET}\nExecStart=/bin/sh -c "docker start naumi47-old"\n').encode()
        if args == ['ss', '-H', '-lntup']:
            return b'tcp LISTEN 0 128 127.0.0.1:13012 0.0.0.0:* users:(("docker-proxy",pid=99,fd=4))\nudp UNCONN 0 0 [::]:53 [::]:*\n'
        raise AssertionError('unrecognized read-only command')


class InventoryTests(unittest.TestCase):
    def collect(self, fake=None, **options):
        fake = fake or Fake()
        result = m.collect_inventory(fake.run, fake.save, expected_host_sha256=hashlib.sha256(MACHINE.strip()).hexdigest(), **options)
        return fake, result

    def test_full_inventory_includes_stopped_and_identity_is_bound(self):
        fake, result = self.collect()
        self.assertTrue(result['dockerInventory']['complete'])
        self.assertTrue(result['dockerInventory']['stable'])
        self.assertEqual(result['dockerInventory']['observedCount'], 3)
        self.assertTrue(result['hostIdentityMatches'])
        self.assertFalse(next(r for r in result['containers'] if r['id'] == DB)['running'])
        self.assertTrue(all(args[:2] not in [['docker', 'stop'], ['docker', 'start'], ['docker', 'exec'], ['systemctl', 'reload']] for args in fake.calls))

    def test_public_output_strips_env_secrets_commands_mounts_and_private_results(self):
        fake, result = self.collect()
        public = json.dumps(result)
        for value in [SECRET, '/private/env', '/private/secret-location', 'API_KEY=', 'docker start', '/private/' + SECRET]:
            self.assertNotIn(value, public)
        self.assertTrue(any(SECRET.encode() in raw for _, raw in fake.private))
        self.assertTrue(result['privateCaptureRequested'])

    def test_available_memory_never_adds_swap(self):
        _, result = self.collect()
        self.assertEqual(result['memory']['availableMiB'], 2070)
        self.assertFalse(result['memory']['swapIncludedInAvailable'])
        self.assertEqual(result['memory']['bytes']['SwapTotal'], 16777216 * 1024)

    def test_cgroup_lifetime_peak_not_business_acceptance(self):
        _, result = self.collect(controlled_instances=[WEB])
        group = next(r for r in result['containers'] if r['id'] == WEB)['resources']['cgroup']
        self.assertTrue(group['controlled'])
        self.assertEqual(group['currentBytes'], 524288000)
        self.assertEqual(group['peakBytes'], 805306368)
        self.assertEqual(group['anonBytes'], 419430400)
        self.assertEqual(group['fileBytes'], 104857600)
        self.assertFalse(group['businessPeakAcceptance'])

    def test_all_web_workers_are_legacy_partial_even_if_declared_controlled(self):
        _, result = self.collect(roles={WEB: 'web', WORKER: 'worker', DB: 'infra'}, controlled_instances=[WEB, WORKER])
        for row in result['containers']:
            if row['role'] in ['web', 'worker']:
                self.assertEqual(row['drain']['coverage'], 'legacy-partial')
                self.assertFalse(row['drain']['complete'])
                self.assertTrue(all(row['drain'][key] is None for key in ['connections', 'agentSessions', 'acceptedTasks', 'workerLeases', 'newAdmissions']))
        self.assertFalse(result['retirementApproved'])

    def test_nginx_full_dump_and_source_file_have_independent_raw_hashes(self):
        _, result = self.collect()
        self.assertEqual(result['nginx']['fullDumpSha256'], hashlib.sha256(NGINX).hexdigest())
        source = result['nginx']['files'][0]
        self.assertEqual(source['path'], '/etc/nginx/nginx.conf')
        self.assertEqual(source['sha256'], hashlib.sha256(NGINX.split(b'\n', 1)[1]).hexdigest())
        self.assertTrue(result['nginx']['stable'])

    def test_nginx_static_upstream_resolves_dynamic_and_credential_urls_remain_unknown(self):
        _, result = self.collect()
        edges = result['nginx']['graph']['edges']
        self.assertEqual(edges[0]['endpoint']['status'], 'resolved-group')
        self.assertEqual(edges[0]['endpoint']['targets'], [WEB])
        self.assertEqual(edges[1]['endpoint']['status'], 'unknown')
        self.assertEqual(edges[2]['endpoint']['status'], 'unknown')
        self.assertEqual(result['nginx']['graph']['coverage'], 'partial')
        self.assertTrue(result['nginx']['graph']['unknown'])

    def test_docker_origin_is_exact_name_port_not_guess_or_dns_probe(self):
        _, result = self.collect()
        edge = result['internalReferences'][0]
        self.assertEqual(edge['source'], WORKER)
        self.assertEqual(edge['endpoint']['targets'], [WEB])
        self.assertEqual(edge['endpoint']['status'], 'resolved')

    def test_service_references_do_not_publish_exec_environment_or_claim_complete(self):
        _, result = self.collect()
        self.assertEqual(len(result['services']), 2)
        self.assertEqual(result['services'][0]['referencedContainerIds'], [WEB])
        self.assertTrue(result['services'][0]['mayControlContainers'])
        self.assertEqual(result['services'][0]['coverage'], 'partial')
        self.assertIn('dynamic-exec-and-environment-files-not-executed-or-evaluated', result['services'][0]['unknown'])

    def test_listeners_have_only_safe_endpoint_and_pid_not_process_cmdline(self):
        _, result = self.collect()
        self.assertEqual(result['listeners'][0], {'protocol': 'tcp', 'address': '127.0.0.1', 'port': 13012, 'pids': [99]})
        self.assertEqual(result['listenerCoverage'], 'listening-only-not-drain')
        self.assertEqual(result['drainCoverage'], 'unknown')

    def test_every_failed_command_is_sanitized_and_unknown_not_green(self):
        for match in [lambda a: a[:2] == ['docker', 'inspect'], lambda a: a == ['nginx', '-T'], lambda a: a[-1] == '/proc/meminfo', lambda a: a[:2] == ['systemctl', 'list-units']]:
            fake = Fake(); fake.fail = match
            _, result = self.collect(fake)
            self.assertTrue(result['errors'])
            self.assertNotIn(SECRET, json.dumps(result))
            self.assertFalse(result['retirementApproved'])

    def test_container_identity_change_is_not_hidden_by_unchanged_list(self):
        for mutate in [lambda rows: rows[0]['State'].update(StartedAt='restarted'), lambda rows: rows[0]['Config']['Env'].append('APP_ORIGIN=http://other:3000'), lambda rows: rows[0]['State'].update(Pid=999)]:
            fake = Fake(); fake.mutate = mutate
            _, result = self.collect(fake)
            self.assertFalse(result['dockerInventory']['stable'])
            self.assertFalse(result['dockerInventory']['complete'])

    def test_nginx_changed_while_collecting_is_unknown(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            value = original(args, **kwargs)
            return value + b'\n# concurrent change\n' if args == ['nginx', '-T'] and fake.nginx_calls > 1 else value
        fake.run = run
        _, result = self.collect(fake)
        self.assertFalse(result['nginx']['stable'])

    def test_nonzero_process_result_does_not_parse_stdout_as_valid(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            value = original(args, **kwargs)
            return subprocess.CompletedProcess(args, 1, value, SECRET.encode()) if args == ['nginx', '-T'] else value
        fake.run = run
        _, result = self.collect(fake)
        self.assertIsNone(result['nginx']['fullDumpSha256'])
        self.assertNotIn(SECRET, json.dumps(result))

    def test_cgroup_path_traversal_and_unknown_files_cannot_be_read(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            return b'0::/../../private\n' if args[0] == 'cat' and args[-1].endswith('/cgroup') else original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake)
        self.assertTrue(all(row['resources']['cgroup']['status'] == 'unknown' for row in result['containers']))
        self.assertFalse(any(args[0] == 'cat' and args[-1].startswith('/sys/fs/cgroup/') for args in fake.calls))

    def test_v1_memory_cgroup_is_observed_without_mutation(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            if args[0] == 'cat' and args[-1].endswith('/cgroup'):
                return b'5:cpu,cpuacct:/docker/fixture\n8:memory:/docker/fixture\n'
            if args[0] == 'cat' and args[-1].startswith('/sys/fs/cgroup/memory/'):
                return {'memory.usage_in_bytes': b'100', 'memory.max_usage_in_bytes': b'200', 'memory.limit_in_bytes': b'300', 'memory.stat': b'total_rss 80\ntotal_cache 20\n'}[args[-1].split('/')[-1]]
            return original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake)
        self.assertEqual(result['containers'][0]['resources']['cgroup']['version'], 1)
        self.assertEqual(result['containers'][0]['resources']['cgroup']['anonBytes'], 80)

    def test_private_capture_failure_is_visible_without_raw_error(self):
        fake = Fake()
        def bad(*_):
            raise RuntimeError(SECRET)
        fake.save = bad
        _, result = self.collect(fake)
        self.assertIn('PRIVATE_CAPTURE_FAILED', [error['code'] for error in result['errors']])
        self.assertNotIn(SECRET, json.dumps(result))

    def test_invalid_host_or_container_declarations_rejected_before_commands(self):
        for options in [dict(expected_host_sha256='bad'), dict(roles={'short': 'web'}), dict(controlled_instances=['short']), dict(max_containers=0), dict(max_services=2048)]:
            fake = Fake()
            with self.assertRaises(ValueError):
                m.collect_inventory(fake.run, **options)
            self.assertEqual(fake.calls, [])

    def test_endpoint_credentials_dynamic_external_and_ambiguity_never_resolve(self):
        fake, result = self.collect()
        for value in ['http://u:p@naumi47-old:3000', 'http://$variable', 'http://naumi47-old:3000?key=secret', 'file:///private', 'http://evil.example:3000']:
            point = m.endpoint(value, result['containers'], origin_only=True)
            self.assertNotEqual(point['status'], 'resolved')
        clone = copy.deepcopy(result['containers'][0]); clone['id'] = '4' * 64
        ambiguous = m.endpoint('http://naumi47-old:3000', [*result['containers'], clone])
        self.assertEqual(ambiguous['status'], 'ambiguous')

    def test_malformed_nginx_never_becomes_complete_graph(self):
        for text in ['http { server { proxy_pass "unterminated;', 'http {', '}']:
            result = m.nginx_graph(text, [])
            self.assertEqual(result['coverage'], 'partial')
            self.assertTrue(result['unknown'])

    def test_public_ip_only_publish_does_not_resolve_loopback(self):
        _, result = self.collect()
        rows = copy.deepcopy(result['containers']); rows[0]['ports'][0]['hostIp'] = '203.0.113.5'
        self.assertEqual(m.endpoint('http://127.0.0.1:13012', rows)['status'], 'unresolved')

    def test_dynamic_map_block_explicitly_requires_review(self):
        result = m.nginx_graph('http { map $host $backend { default upstream; } }', [])
        self.assertIn('DYNAMIC_BLOCK_REQUIRES_REVIEW', [item['reason'] for item in result['unknown']])

    def test_unloaded_service_unit_files_are_included(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            return b'future-worker.service disabled enabled\n' if args[:2] == ['systemctl', 'list-unit-files'] else original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake)
        self.assertIn('future-worker.service', [row['unit'] for row in result['services']])

    def test_failed_service_leading_bullet_is_presentation_not_unit(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            if args[:2] == ['systemctl', 'list-units']:
                return '\u25cf  failed-worker.service loaded failed failed Example worker\n  nginx.service loaded active running fixture\n'.encode()
            return original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake)
        self.assertIn('failed-worker.service', [row['unit'] for row in result['services']])
        self.assertFalse(any(row['code'] == 'UNPARSED_SYSTEMD_UNIT' for row in result['errors']))
        self.assertTrue(any(args[:3] == ['systemctl', 'show', 'failed-worker.service'] for args in fake.calls))

    def test_only_separate_leading_bullet_is_ignored_invalid_units_still_error(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            if args[:2] == ['systemctl', 'list-units']:
                return '\u25cffailed.service loaded failed failed fixture\n\u25cf\ninvalid/unit.service loaded failed failed fixture\n'.encode()
            return original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake)
        self.assertEqual(sum(e['code'] == 'UNPARSED_SYSTEMD_UNIT' for e in result['errors']), 3)

    def test_template_and_masked_observation_failures_remain_real_errors(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            if args[:2] == ['systemctl', 'list-units']:return b''
            if args[:2] == ['systemctl', 'list-unit-files']:return b'worker@.service disabled enabled\nmasked-worker.service masked enabled\n'
            if args[:2] == ['systemctl', 'cat']:return type('R', (), {'returncode':1,'stdout':b'','stderr':b'unavailable'})()
            return original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake)
        self.assertEqual({row['unit'] for row in result['services']}, {'worker@.service', 'masked-worker.service'})
        self.assertEqual(sum(e['source'] == 'systemd-unit-cat' for e in result['errors']), 2)

    def test_source_file_count_and_services_are_bounded_and_unknown_on_limit(self):
        fake = Fake(); original = fake.run
        def run(args, **kwargs):
            return b'one.service loaded active running fixture\ntwo.service loaded active running fixture\n' if args[:2] in [['systemctl', 'list-units'], ['systemctl', 'list-unit-files']] else original(args, **kwargs)
        fake.run = run
        _, result = self.collect(fake, max_services=1)
        self.assertEqual(len(result['services']), 1)
        self.assertIn('SERVICE_LIMIT_EXCEEDED', [item['code'] for item in result['errors']])

    def test_whole_collection_deadline_blocks_additional_commands_without_leaking(self):
        fake = Fake(); collector = m.Collector(fake.run, fake.save)
        with patch.object(m.time, 'monotonic', return_value=collector.deadline + 1):
            self.assertIsNone(collector.read('deadline-fixture', ['nginx', '-T']))
        self.assertEqual(fake.calls, [])
        self.assertEqual(collector.errors[0]['code'], 'OBSERVATION_UNAVAILABLE')

    @unittest.skipUnless(os.name == 'posix', 'real streaming subprocess is Linux/POSIX only')
    def test_local_command_captures_stdout_stderr_exit_without_environment(self):
        result = m.local_command([sys.executable, '-c', 'import sys;print("out");sys.stderr.write("err");sys.exit(3)'])
        self.assertEqual(result.stdout, b'out\n'); self.assertEqual(result.stderr, b'err'); self.assertEqual(result.returncode, 3)

    @unittest.skipUnless(os.name == 'posix', 'real streaming subprocess is Linux/POSIX only')
    def test_local_command_timeout_and_output_bound_terminate_only_own_fixture(self):
        with self.assertRaises(ValueError):
            m.local_command([sys.executable, '-c', 'import time;time.sleep(2)'], timeout=0.05)
        with self.assertRaises(ValueError):
            m.local_command([sys.executable, '-c', 'import sys;sys.stdout.buffer.write(b"x"*(17*1024*1024))'])


if __name__ == '__main__':
    unittest.main()
