"""One-time 103 capacity maintenance under the user's explicit volatile-state choice.

Private operator payload. Ordinary complete-drain policy is never changed or used.
Only pinned retained containers may stop, one at a time, until 5120 MiB is free.
"""
import datetime
import hashlib
import json
import pathlib
import re
import time
import urllib.request

from release47_host import HostTransaction, environment, public_identity
from release_fleet_business_guard import assert_legacy_fleet_rollback_clear
from release_legacy_ui_retirement import immutable, network_binding, identity
import release_legacy_ui_retirement as old

AUTHORIZATION = '允许维护退役无入口旧 UI：保留数据库、媒体、容器及回滚，接受历史内存态无法完整证明（推荐）'
MACHINE = '26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35'
GATEWAY = 'fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e'
DB = 'e39220c01cb2242abef8bc3604404859849808b0b4777f128aff5b4c85c76f74'
PROTECTED_PORTS = (13012, 13027, 13038, 13039, 13040, 13041, 13062)


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def network_configuration(row):
    # Same declaration boundary as release_runtime_ui_retirement: Docker
    # allocates EndpointID/IP/MAC anew for a retained-CID stop/start.
    fields = ('NetworkID', 'Aliases', 'Links', 'IPAMConfig', 'DriverOpts', 'GwPriority')
    return {name: {key: network.get(key) for key in fields} for name, network in old.canonical_networks(row['NetworkSettings']['Networks']).items()}


def restored_network_changes(original, restored):
    require(network_configuration(original) == network_configuration(restored), 'RESTORED_NETWORK_DECLARATION_CHANGED')
    before = old.canonical_networks(original['NetworkSettings']['Networks'])
    after = old.canonical_networks(restored['NetworkSettings']['Networks'])
    require(set(before) == set(after), 'RESTORED_NETWORK_SET_CHANGED')
    changes = {}
    allowed = {'EndpointID', 'IPAddress', 'IPPrefixLen', 'MacAddress', 'GlobalIPv6Address', 'GlobalIPv6PrefixLen'}
    for name, values in after.items():
        changed = {key for key in set(values) | set(before[name]) if values.get(key) != before[name].get(key)}
        require(changed <= allowed, 'UNEXPLAINED_RESTORED_NETWORK_CHANGE')
        request = values.get('IPAMConfig') or {}
        for requested, allocated in (('IPv4Address', 'IPAddress'), ('IPv6Address', 'GlobalIPv6Address')):
            require(not request.get(requested) or request[requested] == values.get(allocated), 'STATIC_NETWORK_ADDRESS_NOT_RESTORED')
        if changed:
            changes[name] = sorted(changed)
    return changes


def emit(value):
    # Durable evidence decides outcomes; a disconnected SSH stdout must never
    # trigger recovery after commit or replace the original operation failure.
    try:
        print(value, flush=True)
    except (OSError, ValueError):
        pass


def available(tx):
    rows = dict(line.split(':', 1) for line in tx.run(['cat', '/proc/meminfo']).decode().splitlines())
    return int(rows['MemAvailable'].split()[0]) / 1024


def gateway(tx, expected_sha=None):
    raw = tx.run(['nginx', '-T'])
    require(sha(raw) == (expected_sha or GATEWAY), 'GATEWAY_CHANGED')
    return raw


def bound(row, pin):
    require(row['Id'] == pin['id'] and row['Image'] == pin['image'] and row['State']['StartedAt'] == pin['startedAt'], 'BOOT_IDENTITY_CHANGED')
    require(row['State']['Running'] and not row['State'].get('Paused') and not row['State'].get('Restarting'), 'BOOT_NOT_RUNNING')


def eligible(row, pin):
    bound(row, pin)
    require(row['Name'] == pin['name'], 'NAME_CHANGED')
    require(row['Config']['Cmd'] == ['node', 'server.js'], 'NOT_STANDARD_WEB')
    require(environment(row).get('NAUMI_VIDEO_WORKER') == '0', 'VIDEO_WORKER_NOT_ZERO')
    require(row['HostConfig']['PortBindings'] == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(pin['port'])}]}, 'PORT_BINDING_CHANGED')
    require(pin['port'] not in PROTECTED_PORTS and 13014 <= pin['port'] <= 13037, 'PROTECTED_PORT')


def serving_connections(row):
    active = 0
    for proto in ('tcp', 'tcp6'):
        for line in pathlib.Path('/proc/' + str(row['State']['Pid']) + '/net/' + proto).read_text().splitlines()[1:]:
            fields = line.split()
            if fields[3] == '01' and int(fields[1].split(':')[1], 16) == 3000:
                active += 1
    return active


def active_db(tx, row, database):
    bound(tx.inspect(database['Id']), identity(database))
    ips = [v[key] for v in row['NetworkSettings']['Networks'].values() for key in ('IPAddress', 'GlobalIPv6Address') if v.get(key)]
    require(ips and all(re.fullmatch(r'[0-9a-fA-F:.]+', x) for x in ips), 'IP_IDENTITY_UNKNOWN')
    values = ','.join("'" + x + "'::inet" for x in ips)
    env = environment(database)
    sql = 'BEGIN READ ONLY; SELECT count(*) FROM pg_stat_activity WHERE client_addr IN (' + values + ") AND state IS DISTINCT FROM 'idle'; COMMIT;"
    raw = tx.run(['docker', 'exec', '-i', database['Id'], 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB']], stdin=sql.encode())
    return int(raw.strip())


def references(text, row, *, aliases=()):
    port = int(row['HostConfig']['PortBindings']['3000/tcp'][0]['HostPort'])
    needles = [row['Id'], row['Id'][:12], row['Name'].lstrip('/')]
    if any(n in text for n in needles):
        return True
    for host in ('127.0.0.1', 'localhost', '[::1]', '::1'):
        if re.search(re.escape(host) + ':' + str(port) + r'(?![0-9])', text, re.I):
            return True
    for network in row['NetworkSettings']['Networks'].values():
        for key in ('IPAddress', 'GlobalIPv6Address'):
            ip = network.get(key)
            if ip and re.search(r'(?<![0-9A-Fa-f:.])' + re.escape(ip) + r'(?![0-9A-Fa-f.])', text):
                return True
    for alias in set(aliases) - {''}:
        if re.search(r'(?<![A-Za-z0-9_.-])' + re.escape(alias) + r'(?![A-Za-z0-9_.-])', text, re.I):
            return True
    return False


def no_references(tx, row, *, expected_gateway_sha=None):
    text = gateway(tx, expected_gateway_sha).decode()
    port = int(row['HostConfig']['PortBindings']['3000/tcp'][0]['HostPort'])
    require(not re.search(r'(?<![0-9])' + str(port) + r'(?![0-9])', text), 'GATEWAY_REFERENCES_TARGET')
    all_aliases = [a for n in row['NetworkSettings']['Networks'].values() for a in (n.get('Aliases') or []) + (n.get('DNSNames') or [])]
    require(not references(text, row, aliases=all_aliases), 'GATEWAY_DIRECT_REFERENCES_TARGET')
    ids = tx.run(['docker', 'ps', '-aq']).decode().split()
    rows = json.loads(tx.run(['docker', 'inspect', *ids]))
    target_networks = row['NetworkSettings']['Networks']
    for other in rows:
        if other['Id'] == row['Id'] or not other['State']['Running']:
            continue
        config = other['Config']
        raw = json.dumps({k: config.get(k) for k in ('Env', 'Cmd', 'Entrypoint', 'Labels')})
        require(not references(raw, row), 'DOCKER_REFERENCES_TARGET')
        for network, target in target_networks.items():
            if network not in other['NetworkSettings']['Networks']:
                continue
            aliases = set(target.get('Aliases') or []) | set(target.get('DNSNames') or []) | {target.get('IPAddress', '')}
            require(not references(raw, row, aliases=aliases), 'NETWORK_ALIAS_REFERENCES_TARGET')
    # Effective unit properties supplement Docker + actual Nginx routing. This
    # is not represented as a complete transitive shell/configuration proof.
    units = tx.run(['systemctl', 'list-units', '--all', '--no-legend', '--plain', '--type=service']).decode()
    names = []
    for line in units.splitlines():
        fields = line.split()
        if fields and fields[0] == '●':
            fields.pop(0)
        if fields:
            names.append(fields[0])
    if names:
        effective = tx.run(['systemctl', 'show', *names, '--property=ExecStart,ExecStartPre,ExecStartPost,Environment,EnvironmentFiles']).decode()
        require(not references(effective, row, aliases=all_aliases), 'SYSTEMD_REFERENCES_TARGET')


def protected_health(tx, pins):
    for pin in pins:
        bound(tx.inspect(pin['id']), pin)
    results = []
    for port in (13039, 13040, 13041, 13012):
        with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/version', timeout=10) as response:
            value = json.load(response)
            require(response.status == 200, 'PROTECTED_VERSION_FAILED')
            expected = 'c05a923e830d27aafcb1c0856dc15181dc21d92b' if port == 13012 else '8af8ee6ee83579fed34a01ac5db86326f9602e3e'
            require(value.get('commit') == expected, 'PROTECTED_VERSION_CHANGED')
            results.append({'port': port, 'commit': value['commit'], 'version': value.get('version')})
    gateway(tx)
    return results


def restore_probe(original, port):
    expected = environment(original)
    deadline = time.monotonic() + 30
    while True:
        try:
            with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/version', timeout=5) as response:
                value = json.load(response)
                require(response.status == 200 and value.get('commit') == expected.get('SOURCE_COMMIT') and str(value.get('version')) == expected.get('BUILD_VERSION'), 'RESTORED_VERSION_CHANGED')
                return value
        except Exception:
            if time.monotonic() >= deadline:
                raise RuntimeError('RESTORED_VERSION_NOT_VERIFIED') from None
            time.sleep(.5)


def execute(plan):
    require(plan['authorization'] == AUTHORIZATION and plan['target'] == '103.30.76.93', 'EXPLICIT_AUTHORIZATION_REQUIRED')
    require(plan['ordinaryDrainReceipt'] is None and plan['historicalVolatileStateAccepted'] is True, 'DO_NOT_CLAIM_COMPLETE_DRAIN')
    require(plan['requiredAvailableMiB'] == 5120, 'MEMORY_GATE_CHANGED')
    candidates = plan['candidates']
    require(candidates and len({p['id'] for p in candidates}) == len(candidates), 'DUPLICATE_TARGETS')
    require(not ({p['id'] for p in candidates} & {p['id'] for p in plan['protectedContainers']}), 'PROTECTED_TARGET')
    intents = []
    with HostTransaction('103.30.76.93', MACHINE, plan['evidenceDirectory']) as tx:
        tx.save('authorization-and-plan.json', plan)
        protected_health(tx, plan['protectedContainers'])
        database = tx.inspect(DB)
        require(database['State']['Running'] and database['Image'] == 'sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229', 'DATABASE_CHANGED')
        originals = []
        for pin in candidates:
            row = tx.inspect(pin['id']); eligible(row, pin); no_references(tx, row)
            originals.append(row)
        tx.save('private-original-inspects.json', originals)
        tx.save('private-database-inspect.json', database)
        tx.save('private-nginx-original.txt', gateway(tx))
        emit('CAPACITY_RETIREMENT=LOCKED_AND_BOUND')
        backup = tx.backup_database(public_identity(database))
        tx.save('capacity-backup.json', backup)
        emit('CAPACITY_RETIREMENT=BACKUP_READABLE')
        before = available(tx)
        try:
            for pin, original in zip(candidates, originals):
                if available(tx) >= 5120:
                    break
                for _ in range(2):
                    row = tx.inspect(pin['id']); eligible(row, pin)
                    require(immutable(row) == immutable(original) and network_binding(row) == network_binding(original), 'BINDINGS_CHANGED')
                    require(serving_connections(row) == 0 and active_db(tx, row, database) == 0, 'CURRENT_ACTIVITY_PRESENT')
                    no_references(tx, row)
                    time.sleep(2)
                protected_health(tx, plan['protectedContainers'])
                row = tx.inspect(pin['id']); eligible(row, pin)
                require(immutable(row) == immutable(original) and network_binding(row) == network_binding(original), 'FINAL_BINDINGS_CHANGED')
                require(serving_connections(row) == 0 and active_db(tx, row, database) == 0, 'FINAL_ACTIVITY_PRESENT')
                intent = {'identity': identity(original), 'port': pin['port'], 'immutableSha256': immutable(original), 'networkSha256': network_binding(original), 'originalRestartPolicy': original['HostConfig']['RestartPolicy'], 'originalPortBindings': original['HostConfig']['PortBindings'], 'ordinaryDrainReceipt': None, 'historicalVolatileStateAccepted': True, 'authorizationSha256': sha(AUTHORIZATION.encode()), 'containerDeleted': False, 'databaseRestoreAllowed': False, 'taskReplayAllowed': False}
                tx.save('retirement-intent-' + pin['id'][:12] + '.json', intent)
                intents.append((original, intent))
                tx.run(['docker', 'update', '--restart=no', pin['id']])
                tx.run(['docker', 'stop', '--time=-1', pin['id']], timeout=120)
                stopped = tx.inspect(pin['id'])
                require(not stopped['State']['Running'] and not stopped['State'].get('OOMKilled') and stopped['State']['ExitCode'] != 137, 'GRACEFUL_STOP_UNCONFIRMED')
                require(immutable(stopped) == immutable(original) and stopped['HostConfig']['PortBindings'] == original['HostConfig']['PortBindings'], 'RETAINED_CONTAINER_CHANGED')
                require(stopped['HostConfig']['RestartPolicy'] == {'Name': 'no', 'MaximumRetryCount': 0}, 'RESTART_POLICY_UNCONFIRMED')
                versions = protected_health(tx, plan['protectedContainers'])
                bound(tx.inspect(DB), identity(database))
                tx.save('retirement-complete-' + pin['id'][:12] + '.json', {'id': pin['id'], 'port': pin['port'], 'exitCode': stopped['State']['ExitCode'], 'availableMiB': available(tx), 'versions': versions, 'ordinaryDrainReceipt': None})
                emit(json.dumps({'retiredPort': pin['port'], 'availableMiB': available(tx), 'retainedCid': pin['id']}))
            versions = protected_health(tx, plan['protectedContainers'])
            bound(tx.inspect(DB), identity(database))
            final_available = available(tx)
            require(final_available >= 5120, 'CAPACITY_STILL_INSUFFICIENT')
            result = {'status': 'CAPACITY_READY', 'beforeAvailableMiB': before, 'afterAvailableMiB': final_available, 'retiredIds': [r['Id'] for r, _ in intents], 'versions': versions, 'gatewayUnchanged': True, 'databaseRestored': False, 'containersDeleted': False, 'ordinaryDrainReceipt': None, 'historicalVolatileStateAccepted': True, 'applicationReleased': False}
            tx.save('CAPACITY_ACCEPTANCE.json', result)
            emit(json.dumps(result))
        except BaseException:
            # Observe each retained CID once before recovery. A running process
            # may still have an unresolved Docker stop in flight: never restart
            # it or retry stop; preserve its durable intent for reconciliation.
            recovery = []
            for original, intent in reversed(intents):
                cid = original['Id']
                try:
                    row = tx.inspect(cid)
                    require(immutable(row) == intent['immutableSha256'], 'RECOVERY_IDENTITY_CHANGED')
                    if row['State']['Running']:
                        entry = {'id': cid, 'status': 'STOP_OUTCOME_REQUIRES_RECONCILIATION'}
                    else:
                        assert_legacy_fleet_rollback_clear(tx, public_identity(database))
                        tx.save('restore-intent-' + cid[:12] + '.json', intent)
                        tx.run(['docker', 'start', cid])
                        row = tx.inspect(cid)
                        require(row['State']['Running'] and immutable(row) == intent['immutableSha256'], 'RETAINED_CID_RESTORE_FAILED')
                        policy = intent['originalRestartPolicy']; flag = policy['Name']
                        if flag == 'on-failure' and policy.get('MaximumRetryCount'):
                            flag += ':' + str(policy['MaximumRetryCount'])
                        tx.run(['docker', 'update', '--restart=' + flag, cid])
                        restored = tx.inspect(cid)
                        require(restored['HostConfig']['RestartPolicy'] == policy and restored['HostConfig']['PortBindings'] == intent['originalPortBindings'], 'ORIGINAL_POLICY_NOT_RESTORED')
                        network_changes = restored_network_changes(original, restored)
                        no_references(tx, restored)
                        probe = restore_probe(original, intent['port'])
                        entry = {'id': cid, 'status': 'RETAINED_CID_RESTORED', 'version': probe, 'currentIdentity': identity(restored), 'runtimeNetworkAllocationChanges': network_changes, 'originalRuntimeNetworkSha256': intent['networkSha256'], 'currentRuntimeNetworkSha256': network_binding(restored)}
                        tx.save('restore-complete-' + cid[:12] + '.json', entry)
                except BaseException as recovery_error:
                    entry = {'id': cid, 'status': 'RECOVERY_REQUIRES_RECONCILIATION', 'errorType': type(recovery_error).__name__}
                    try:
                        tx.save('restore-failed-' + cid[:12] + '.json', entry)
                    except BaseException:
                        entry['failureEvidencePersisted'] = False
                recovery.append(entry)
            report = {'rows': recovery, 'ordinaryDrainReceipt': None, 'databaseRestored': False}
            try:
                report['protectedVersions'] = protected_health(tx, plan['protectedContainers'])
            except BaseException as health_error:
                report['protectedHealthErrorType'] = type(health_error).__name__
            try:
                tx.save('CAPACITY_RECOVERY.json', report)
            except BaseException:
                report['recoveryEvidencePersisted'] = False
            emit(json.dumps({'capacityRecovery': report}))
            raise
