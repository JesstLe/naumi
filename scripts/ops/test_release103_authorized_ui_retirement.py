import copy
import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch

import release103_authorized_ui_retirement as module


def row(cid, port):
    return {'Id': cid, 'Name': '/legacy-' + str(port), 'Image': 'sha256:' + 'c' * 64, 'State': {'Running': True, 'StartedAt': '2026-10-17T00:00:00Z', 'Pid': 123, 'ExitCode': 0, 'OOMKilled': False}, 'Config': {'Cmd': ['node', 'server.js'], 'Env': ['NAUMI_VIDEO_WORKER=0']}, 'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}, 'PortBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(port)}]}}, 'Mounts': [], 'NetworkSettings': {'Networks': {}}}


class FakeTx:
    def __init__(self, *args):
        self.rows = {x['Id']: copy.deepcopy(x) for x in (row('a'*64, 13033), row('b'*64, 13037))}
        self.rows[module.DB] = row(module.DB, 5432)
        self.rows[module.DB]['Image'] = 'sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229'
        self.rows[module.DB]['Config']['Env'] = ['POSTGRES_USER=fixture', 'POSTGRES_DB=fleet_guard_fixture']
        self.target = '103.30.76.93'; self.business_rows = 0
        self.saved = {}; self.commands = []; self.memory = 2923; self.stop_error = False; self.exit_code = 0; self.closed = False; self.gain = 3300; self.fail_start = None; self.changed_network = False
    def __enter__(self): return self
    def __exit__(self, *args): self.closed = True
    def inspect(self, cid): return copy.deepcopy(self.rows[cid])
    def pin(self, identity):
        result = self.inspect(identity['id'])
        if module.public_identity(result) != identity: raise RuntimeError('Fixture identity changed')
        return result
    def save(self, name, value):
        if name in self.saved: raise AssertionError('Duplicate durable intent')
        self.saved[name] = copy.deepcopy(value); return {'path': name, 'sha256': 'e'*64}
    def backup_database(self, identity): self.saved['backup'] = identity; return {'path': 'fixture.dump', 'sha256': 'e'*64}
    def run(self, args, **kwargs):
        self.commands.append(args)
        if args[1] == 'exec' and 'psql' in args:
            import json
            return (json.dumps({'database': 'fleet_guard_fixture', 'readOnly': 'on', 'isolation': 'repeatable read', 'schema': 'public', 'table': 'app_fleet_commands', 'businessRows': self.business_rows})+'\n').encode()
        if args[1] == 'update':
            policy = args[2].split('=', 1)[1]; self.rows[args[-1]]['HostConfig']['RestartPolicy']['Name'] = policy
        elif args[1] == 'stop':
            if self.stop_error: raise RuntimeError('Uncertain stop result')
            self.rows[args[-1]]['State'].update(Running=False, ExitCode=self.exit_code); self.memory += self.gain
        elif args[1] == 'start':
            if args[-1] == self.fail_start: raise RuntimeError('Single CID restore failure')
            self.rows[args[-1]]['State']['Running'] = True; self.memory -= self.gain
            if self.changed_network: self.rows[args[-1]]['NetworkSettings']['Networks'] = {'changed': {'IPAddress': '172.20.0.99'}}
        return b''


class Tests(unittest.TestCase):
    def setUp(self):
        self.tx = FakeTx(); self.plan = {'authorization': module.AUTHORIZATION, 'target': '103.30.76.93', 'ordinaryDrainReceipt': None, 'historicalVolatileStateAccepted': True, 'requiredAvailableMiB': 5120, 'evidenceDirectory': '/fixture', 'protectedContainers': [], 'candidates': []}
        for cid in ('a'*64, 'b'*64):
            r = self.tx.rows[cid]; self.plan['candidates'].append({**module.identity(r), 'name': r['Name'], 'port': int(r['HostConfig']['PortBindings']['3000/tcp'][0]['HostPort'])})
    def execute(self, health=None, activity=0):
        with patch.object(module, 'HostTransaction', return_value=self.tx), patch.object(module, 'available', side_effect=lambda tx: tx.memory), patch.object(module, 'protected_health', side_effect=health or (lambda *args: [])), patch.object(module, 'no_references'), patch.object(module, 'gateway', return_value=b'fixture'), patch.object(module, 'serving_connections', return_value=activity), patch.object(module, 'active_db', return_value=0), patch.object(module, 'restore_probe', return_value={'commit': 'fixture'}), patch.object(module.time, 'sleep'):
            module.execute(self.plan)
    def test_stop_minimum_and_preserve(self):
        self.execute(); stops = [c for c in self.tx.commands if c[1] == 'stop']; self.assertEqual(len(stops), 1); self.assertEqual(stops[0][2], '--time=-1'); self.assertTrue(self.tx.closed)
        self.assertIn('CAPACITY_ACCEPTANCE.json', self.tx.saved); self.assertIsNone(self.tx.saved['CAPACITY_ACCEPTANCE.json']['ordinaryDrainReceipt']); self.assertEqual(self.tx.rows['a'*64]['HostConfig']['RestartPolicy']['Name'], 'no'); self.assertTrue(self.tx.rows['b'*64]['State']['Running'])
    def test_authorization_required(self):
        self.plan['authorization'] = ''; self.assertRaisesRegex(RuntimeError, 'AUTHORIZATION', self.execute); self.assertEqual(self.tx.commands, [])
    def test_no_complete_drain(self):
        self.plan['ordinaryDrainReceipt'] = {}; self.assertRaisesRegex(RuntimeError, 'COMPLETE_DRAIN', self.execute)
    def test_protected_target(self):
        self.plan['protectedContainers'] = [{'id': 'a'*64}]; self.assertRaisesRegex(RuntimeError, 'PROTECTED_TARGET', self.execute)
    def test_current_connection_holds_before_update(self):
        self.assertRaisesRegex(RuntimeError, 'CURRENT_ACTIVITY', lambda: self.execute(activity=1)); self.assertEqual(self.tx.commands, [])
    def test_worker_not_disabled(self):
        self.tx.rows['a'*64]['Config']['Env'] = []; self.assertRaisesRegex(RuntimeError, 'WORKER_NOT_ZERO', self.execute); self.assertEqual(self.tx.commands, [])
    def test_changed_boot_holds(self):
        self.plan['candidates'][0]['startedAt'] = 'wrong'; self.assertRaisesRegex(RuntimeError, 'BOOT_IDENTITY', self.execute)
    def test_protected_port_holds(self):
        self.plan['candidates'][0]['port'] = 13039; self.tx.rows['a'*64]['HostConfig']['PortBindings']['3000/tcp'][0]['HostPort'] = '13039'; self.assertRaisesRegex(RuntimeError, 'PROTECTED_PORT', self.execute)
    def test_bad_host_binding_holds(self):
        self.tx.rows['a'*64]['HostConfig']['PortBindings']['3000/tcp'][0]['HostIp'] = '0.0.0.0'; self.assertRaisesRegex(RuntimeError, 'PORT_BINDING', self.execute)
    def test_health_failure_restores_same_cid_and_policy(self):
        calls = 0
        def health(*args):
            nonlocal calls
            calls += 1
            if calls == 3: raise RuntimeError('Protected health failed')
            return []
        self.assertRaisesRegex(RuntimeError, 'Protected health', lambda: self.execute(health=health)); self.assertTrue(self.tx.rows['a'*64]['State']['Running']); self.assertEqual(self.tx.rows['a'*64]['HostConfig']['RestartPolicy']['Name'], 'unless-stopped'); self.assertIn('CAPACITY_RECOVERY.json', self.tx.saved)
    def test_unknown_stop_does_not_retry_or_start(self):
        self.tx.stop_error = True; self.assertRaisesRegex(RuntimeError, 'Uncertain stop', self.execute); self.assertEqual(len([c for c in self.tx.commands if c[1] == 'stop']), 1); self.assertFalse(any(c[1] == 'start' for c in self.tx.commands)); self.assertEqual(self.tx.saved['CAPACITY_RECOVERY.json']['rows'][0]['status'], 'STOP_OUTCOME_REQUIRES_RECONCILIATION')
    def test_killed_exit_not_accepted(self):
        self.tx.exit_code = 137; self.assertRaisesRegex(RuntimeError, 'GRACEFUL_STOP', self.execute); self.assertTrue(self.tx.rows['a'*64]['State']['Running']); self.assertNotIn('CAPACITY_ACCEPTANCE.json', self.tx.saved)
    def test_restore_failure_continues_other_cids_and_preserves_original_error(self):
        self.tx.gain = 1100; self.tx.fail_start = 'b'*64; calls = 0
        def health(*args):
            nonlocal calls
            calls += 1
            if calls == 5: raise RuntimeError('Original operation failed')
            return []
        self.assertRaisesRegex(RuntimeError, 'Original operation failed', lambda: self.execute(health=health))
        self.assertTrue(self.tx.rows['a'*64]['State']['Running']); self.assertFalse(self.tx.rows['b'*64]['State']['Running'])
        outcomes = self.tx.saved['CAPACITY_RECOVERY.json']['rows']; self.assertEqual(outcomes[0]['status'], 'RECOVERY_REQUIRES_RECONCILIATION'); self.assertEqual(outcomes[1]['status'], 'RETAINED_CID_RESTORED')
    def test_final_memory_drop_rejects_acceptance(self):
        calls = 0
        def health(*args):
            nonlocal calls
            calls += 1
            if calls == 4: self.tx.memory = 5000
            return []
        self.assertRaisesRegex(RuntimeError, 'CAPACITY_STILL_INSUFFICIENT', lambda: self.execute(health=health)); self.assertNotIn('CAPACITY_ACCEPTANCE.json', self.tx.saved)
    def test_direct_ip_loopback_and_alias_references(self):
        r = row('a'*64, 13033); r['NetworkSettings']['Networks'] = {'fixture': {'IPAddress': '172.20.0.8', 'Aliases': ['old-ui']}}
        for text in ('proxy_pass http://172.20.0.8:3000;', 'server 172.20.0.8:3000;', 'http://localhost:13033/path', 'http://[::1]:13033/', 'http://old-ui:3000'):
            with self.subTest(text=text): self.assertTrue(module.references(text, r, aliases=['old-ui']))
        self.assertFalse(module.references('http://172.20.0.80:3000', r))
        self.assertFalse(module.references('http://localhost:130330/', r))
    def test_scanner_rejects_nginx_direct_ip(self):
        r = row('a'*64, 13033); r['NetworkSettings']['Networks'] = {'fixture': {'IPAddress': '172.20.0.8'}}
        with patch.object(module, 'gateway', return_value=b'proxy_pass http://172.20.0.8:3000;'):
            self.assertRaisesRegex(RuntimeError, 'GATEWAY_DIRECT_REFERENCES', lambda: module.no_references(self.tx, r))
    def test_bare_and_authenticated_scoped_aliases(self):
        r = row('a'*64, 13033)
        for text in ('UPSTREAM=old-ui:3000', 'UPSTREAM_HOST=old-ui', 'https://fixture:fake@old-ui:3000/path'):
            with self.subTest(text=text): self.assertTrue(module.references(text, r, aliases=['old-ui']))
        self.assertFalse(module.references('UPSTREAM_HOST=old-ui-copy', r, aliases=['old-ui']))
    def test_global_ipv6_reference(self):
        r = row('a'*64, 13033); r['NetworkSettings']['Networks'] = {'fixture': {'IPAddress': '', 'GlobalIPv6Address': 'fd00::8'}}
        self.assertTrue(module.references('http://[fd00::8]:3000/path', r))
    def test_stdout_failure_cannot_rollback_committed_acceptance(self):
        with patch('builtins.print', side_effect=BrokenPipeError('disconnected fixture')):
            self.execute()
        self.assertIn('CAPACITY_ACCEPTANCE.json', self.tx.saved); self.assertNotIn('CAPACITY_RECOVERY.json', self.tx.saved); self.assertFalse(any(c[1]=='start' for c in self.tx.commands))
    def test_stdout_failure_does_not_mask_original_recovery_error(self):
        calls = 0
        def health(*args):
            nonlocal calls
            calls += 1
            if calls == 3: raise RuntimeError('Original health failure')
            return []
        with patch('builtins.print', side_effect=BrokenPipeError('disconnected fixture')):
            self.assertRaisesRegex(RuntimeError, 'Original health failure', lambda: self.execute(health=health))
        self.assertTrue(self.tx.rows['a'*64]['State']['Running']); self.assertIn('CAPACITY_RECOVERY.json', self.tx.saved)
    def test_restored_network_drift_requires_reconciliation(self):
        self.tx.changed_network = True; calls = 0
        def health(*args):
            nonlocal calls
            calls += 1
            if calls == 3: raise RuntimeError('Original health failure')
            return []
        self.assertRaisesRegex(RuntimeError, 'Original health failure', lambda: self.execute(health=health))
        self.assertNotIn('restore-complete-'+'a'*12+'.json', self.tx.saved)
        self.assertEqual(self.tx.saved['CAPACITY_RECOVERY.json']['rows'][0]['status'], 'RECOVERY_REQUIRES_RECONCILIATION')

    def test_explained_docker_allocation_changes_keep_declared_identity(self):
        before = row('a'*64, 13033)
        before['NetworkSettings']['Networks'] = {'fixture': {'NetworkID': 'same-network', 'Aliases': ['legacy-ui'], 'IPAMConfig': None, 'EndpointID': 'before', 'IPAddress': '172.20.0.8', 'MacAddress': 'before', 'Gateway': '172.20.0.1'}}
        after = copy.deepcopy(before)
        after['NetworkSettings']['Networks']['fixture'].update(EndpointID='after', IPAddress='172.20.0.9', MacAddress='after')
        changes = module.restored_network_changes(before, after)
        self.assertEqual(changes, {'fixture': ['EndpointID', 'IPAddress', 'MacAddress']})
        after['NetworkSettings']['Networks']['fixture']['Gateway'] = '172.20.0.2'
        self.assertRaisesRegex(RuntimeError, 'UNEXPLAINED', lambda: module.restored_network_changes(before, after))
    def test_declared_static_address_must_match_actual_allocation(self):
        before = row('a'*64, 13033)
        before['NetworkSettings']['Networks'] = {'fixture': {'NetworkID': 'same-network', 'IPAMConfig': {'IPv4Address': '172.20.0.8'}, 'IPAddress': '172.20.0.8'}}
        after = copy.deepcopy(before); after['NetworkSettings']['Networks']['fixture']['IPAddress'] = '172.20.0.9'
        self.assertRaisesRegex(RuntimeError, 'STATIC_NETWORK_ADDRESS', lambda: module.restored_network_changes(before, after))


if __name__ == '__main__': unittest.main()
