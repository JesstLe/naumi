#!/usr/bin/env python3
"""Read-only host collector. Raw Docker/nginx/systemd output is private, never CLI stdout.

collect_inventory(command=transaction.run, private_save=transaction.save) composes
with the existing HostTransaction without acquiring locks or controlling services.
This is observation, not a lifecycle/drain receipt or authorization to stop anything.
"""
import argparse
import datetime as dt
import hashlib
import ipaddress
import json
import os
import pathlib
import re
import selectors
import shlex
import subprocess
import time
import urllib.parse

try:
    from .release47_host import public_identity
except ImportError:
    from release47_host import public_identity

SHA = re.compile(r'^[a-f0-9]{64}$')
COMMIT = re.compile(r'^[a-f0-9]{40}$')
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$')
UNIT = re.compile(r'^(?:[A-Za-z0-9_.:@-]|\\x[0-9a-fA-F]{2})+\.service$')
SECRET = re.compile(r'KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|COOKIE|DATABASE_URL|DSN', re.I)
ORIGIN_KEYS = ('NAUMI_APP_ORIGIN', 'INTERNAL_APP_ORIGIN', 'APP_ORIGIN')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def number(value):
    return value if type(value) is int and value >= 0 else None


def local_command(args, *, stdin=None, timeout=30):
    if os.name != 'posix':
        raise RuntimeError('LOCAL_LINUX_REQUIRED')
    # No shell, no sudo/SSH, no environment mutation and no command-derived error strings.
    if stdin is not None:
        raise ValueError('INVENTORY_STDIN_FORBIDDEN')
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    outputs, total, end = {process.stdout: bytearray(), process.stderr: bytearray()}, 0, time.monotonic() + timeout
    try:
        with selectors.DefaultSelector() as selector:
            for stream in outputs:
                selector.register(stream, selectors.EVENT_READ)
            while selector.get_map():
                if time.monotonic() >= end:
                    raise ValueError('READ_COMMAND_TIMEOUT')
                for key, _ in selector.select(min(0.25, max(0, end - time.monotonic()))):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    total += len(chunk)
                    if total > 16 * 1024 * 1024:
                        raise ValueError('READ_COMMAND_OUTPUT_TOO_LARGE')
                    outputs[key.fileobj].extend(chunk)
        process.wait(timeout=max(0.01, end - time.monotonic()))
        return subprocess.CompletedProcess(args, process.returncode, bytes(outputs[process.stdout]), bytes(outputs[process.stderr]))
    finally:
        if process.poll() is None:
            # Only this collector's read command is terminated, never Docker/system services.
            process.kill()
            process.wait()
        process.stdout.close()
        process.stderr.close()


class Collector:
    def __init__(self, command=None, private_save=None, *, max_containers=512, max_services=256, max_duration=90):
        self.command = command or local_command
        self.private_save = private_save
        self.max_containers, self.max_services = max_containers, max_services
        self.observations, self.errors, self.private = [], [], []
        self.secrets = set()
        self.deadline = time.monotonic() + max_duration

    def read(self, label, args, *, timeout=30, limit=16 * 1024 * 1024):
        try:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError('collection deadline reached')
            got = self.command(args, stdin=None, timeout=min(timeout, remaining))
            if isinstance(got, bytes):
                output, error, code = got, b'', 0
            else:
                output, error, code = got.stdout or b'', got.stderr or b'', got.returncode
            if not isinstance(output, bytes) or not isinstance(error, bytes) or type(code) is not int:
                raise ValueError('invalid runner contract')
            if len(output) + len(error) > limit:
                raise ValueError('bounded command output exceeded')
        except Exception:
            self.errors.append({'source': label, 'code': 'OBSERVATION_UNAVAILABLE'})
            return None
        item = {'source': label, 'exitStatus': code, 'stdoutSha256': digest(output),
                'stderrSha256': digest(error), 'stdoutBytes': len(output), 'stderrBytes': len(error)}
        self.observations.append(item)
        if self.private_save:
            # A transaction's save() may return private path metadata, but none of it is echoed publicly.
            for suffix, value in [('stdout', output), ('stderr', error)]:
                if value:
                    name = 'inventory-' + str(len(self.observations)).zfill(4) + '-' + suffix + '.bin'
                    try:
                        self.private_save(name, value)
                        self.private.append({'name': name, 'sha256': digest(value), 'bytes': len(value)})
                    except Exception:
                        self.errors.append({'source': label, 'code': 'PRIVATE_CAPTURE_FAILED'})
        if code != 0:
            self.errors.append({'source': label, 'code': 'OBSERVATION_COMMAND_FAILED'})
            return None
        return output

    def json(self, label, args):
        raw = self.read(label, args)
        try:
            return json.loads(raw) if raw is not None else None
        except (ValueError, UnicodeError):
            self.errors.append({'source': label, 'code': 'INVALID_JSON_OBSERVATION'})
            return None

    def env(self, row):
        values = {}
        for value in row.get('Config', {}).get('Env', []):
            if not isinstance(value, str) or '=' not in value:
                continue
            key, content = value.split('=', 1)
            values[key] = content
            if SECRET.search(key) and len(content) >= 4:
                self.secrets.add(content)
                try:
                    url = urllib.parse.urlsplit(content)
                    for part in [url.password, url.username]:
                        if part and len(part) >= 4:
                            self.secrets.add(part)
                except ValueError:
                    pass
        return values

    def sanitize(self, value):
        if isinstance(value, str):
            for secret in sorted(self.secrets, key=len, reverse=True):
                value = value.replace(secret, '[REDACTED]')
            return value
        if isinstance(value, list):
            return [self.sanitize(v) for v in value]
        if isinstance(value, dict):
            return {key: self.sanitize(v) for key, v in value.items()}
        return value

    def ids(self, label):
        raw = self.read(label, ['docker', 'ps', '-aq', '--no-trunc'], limit=256 * 1024)
        if raw is None:
            return None
        try:
            ids = raw.decode('ascii').split()
            if len(ids) > self.max_containers or len(ids) != len(set(ids)) or any(not SHA.fullmatch(i) for i in ids):
                raise ValueError()
            return sorted(ids)
        except (ValueError, UnicodeError):
            self.errors.append({'source': label, 'code': 'DOCKER_ID_LIST_UNVERIFIED'})
            return None

    def inspect(self, ids, label):
        rows = []
        for offset in range(0, len(ids), 32):
            expected = set(ids[offset:offset + 32])
            got = self.json(label, ['docker', 'inspect', *sorted(expected)])
            if not isinstance(got, list) or len(got) != len(expected) or any(not isinstance(r, dict) for r in got) or {r.get('Id') for r in got} != expected:
                self.errors.append({'source': label, 'code': 'DOCKER_INSPECT_INCOMPLETE'})
                return None
            rows.extend(got)
        return rows

    def memory(self):
        raw = self.read('meminfo', ['cat', '--', '/proc/meminfo'], limit=128 * 1024)
        values = {}
        for line in (raw or b'').decode('ascii', errors='replace').splitlines():
            found = re.fullmatch(r'([A-Za-z_()]+):\s+(\d+) kB', line)
            if found:
                values[found[1]] = int(found[2]) * 1024
        wanted = ('MemTotal', 'MemFree', 'MemAvailable', 'Buffers', 'Cached', 'SwapTotal', 'SwapFree')
        return {'status': 'observed' if all(k in values for k in ['MemTotal', 'MemAvailable']) else 'unknown',
                'bytes': {k: values.get(k) for k in wanted},
                'availableMiB': values.get('MemAvailable', 0) // (1024 * 1024) if 'MemAvailable' in values else None,
                'swapIncludedInAvailable': False}

    def cgroup(self, row, controlled):
        pid = number(row.get('State', {}).get('Pid'))
        unknown = {'status': 'unknown', 'controlled': controlled, 'currentBytes': None, 'peakBytes': None,
                   'anonBytes': None, 'fileBytes': None, 'limitBytes': None,
                   'businessPeakAcceptance': False}
        if not row.get('State', {}).get('Running') or not pid:
            return unknown
        raw = self.read('container-cgroup', ['cat', '--', f'/proc/{pid}/cgroup'], limit=65536)
        lines = (raw or b'').decode('utf-8', errors='replace').splitlines()
        version, relative = None, None
        for line in lines:
            parts = line.split(':', 2)
            if len(parts) == 3 and parts[:2] == ['0', '']:
                version, relative = 2, parts[2]
                break
            if len(parts) == 3 and 'memory' in parts[1].split(','):
                version, relative = 1, parts[2]
        if not relative or not relative.startswith('/') or '..' in pathlib.PurePosixPath(relative).parts or re.search(r'[\x00-\x20\\]', relative):
            return unknown
        base = ('/sys/fs/cgroup' if version == 2 else '/sys/fs/cgroup/memory') + relative.rstrip('/')
        names = ['memory.current', 'memory.peak', 'memory.max', 'memory.stat'] if version == 2 else ['memory.usage_in_bytes', 'memory.max_usage_in_bytes', 'memory.limit_in_bytes', 'memory.stat']
        data = {}
        for name in names:
            value = self.read('cgroup-memory-file', ['cat', '--', base + '/' + name], limit=128 * 1024)
            data[name] = value.decode('ascii', errors='replace').strip() if value is not None else ''
        scalar = lambda name: int(data[name]) if re.fullmatch(r'\d+', data[name]) else None
        stat = dict((parts[0], int(parts[1])) for line in data['memory.stat'].splitlines() if len(parts := line.split()) == 2 and parts[1].isdigit())
        return {**unknown, 'status': 'observed' if scalar(names[0]) is not None else 'unknown', 'version': version,
                'currentBytes': scalar(names[0]), 'peakBytes': scalar(names[1]), 'limitBytes': scalar(names[2]),
                'unlimited': data[names[2]] == 'max' if version == 2 else None,
                'anonBytes': stat.get('anon') if version == 2 else stat.get('total_rss', stat.get('rss')),
                'fileBytes': stat.get('file') if version == 2 else stat.get('total_cache', stat.get('cache')),
                'peakMeaning': 'observed-cgroup-lifetime-not-business-acceptance'}


def endpoint(value, containers, *, origin_only=False):
    """Only expose host literals already public in container inventory/loopback; credentials never survive."""
    try:
        if not isinstance(value, str) or '$' in value or any(c.isspace() for c in value):
            raise ValueError()
        parsed = urllib.parse.urlsplit(value if '://' in value else 'tcp://' + value)
        if parsed.username or parsed.password or parsed.query or parsed.fragment or origin_only and parsed.path not in ['', '/']:
            raise ValueError()
        host, port = parsed.hostname, parsed.port
        if not host:
            raise ValueError()
        if parsed.scheme not in ['http', 'https', 'tcp', 'grpc', 'grpcs']:
            raise ValueError()
        port = port or {'http': 80, 'https': 443, 'grpc': 80, 'grpcs': 443}.get(parsed.scheme)
        if port is None or not 1 <= port <= 65535:
            raise ValueError()
        candidates = set()
        for row in containers:
            hosts = set(row.get('addresses', [])) | set(row.get('aliases', [])) | {row.get('name'), row['id'], row['id'][:12]}
            if host in hosts and port in row.get('containerPorts', []):
                candidates.add(row['id'])
            reachable = {'127.0.0.1': {'127.0.0.1', '0.0.0.0'}, '::1': {'::1', '::'}, 'localhost': {'127.0.0.1', '0.0.0.0', '::1', '::'}}
            if host in reachable and any(p['hostPort'] == port and p['protocol'] == 'tcp' and p['hostIp'] in reachable[host] for p in row['ports']):
                candidates.add(row['id'])
        known = len(candidates) > 0 or host in ['127.0.0.1', 'localhost', '::1']
        return {'status': 'resolved' if len(candidates) == 1 else 'ambiguous' if len(candidates) > 1 else 'unresolved',
                'scheme': parsed.scheme, 'port': port, 'host': host if known else None,
                'hostSha256': digest(host.encode()), 'targets': sorted(candidates)}
    except (ValueError, TypeError):
        return {'status': 'unknown', 'reason': 'DYNAMIC_OR_UNSUPPORTED_ENDPOINT', 'targets': []}


def safe_ports(row):
    exposed, published = set(), []
    for key in set(row.get('Config', {}).get('ExposedPorts', {})) | set(row.get('NetworkSettings', {}).get('Ports', {})):
        parsed = re.fullmatch(r'(\d{1,5})/(tcp|udp)', key)
        if not parsed or not 1 <= int(parsed[1]) <= 65535:
            continue
        port, protocol = int(parsed[1]), parsed[2]
        if protocol == 'tcp':
            exposed.add(port)
        for value in row.get('NetworkSettings', {}).get('Ports', {}).get(key) or []:
            try:
                address, host_port = str(ipaddress.ip_address(value['HostIp'])), int(value['HostPort'])
                if 1 <= host_port <= 65535:
                    published.append({'hostIp': address, 'hostPort': host_port, 'containerPort': port, 'protocol': protocol})
            except (KeyError, ValueError, TypeError):
                continue
    return sorted(exposed), sorted(published, key=lambda p: (p['protocol'], p['hostPort'], p['hostIp']))


def container_summary(collector, raw, roles, controlled):
    env = collector.env(raw)
    try:
        identity = public_identity(raw)
        if not SHA.fullmatch(identity['id']) or not re.fullmatch(r'sha256:[a-f0-9]{64}', identity['image']) or type(identity['running']) is not bool:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        collector.errors.append({'source': 'container-identity', 'code': 'INVALID_CONTAINER_IDENTITY'})
        return None
    name = identity['name'] if NAME.fullmatch(identity['name']) else None
    cmd = raw.get('Config', {}).get('Cmd')
    inferred = 'web' if cmd == ['node', 'server.js'] else 'worker' if cmd in [['scripts/video-worker.mjs'], ['node', 'scripts/video-worker.mjs']] else 'unknown'
    role = roles.get(identity['id'], inferred)
    addresses, aliases = set(), set()
    for network in raw.get('NetworkSettings', {}).get('Networks', {}).values():
        for field in ['IPAddress', 'GlobalIPv6Address']:
            try:
                addresses.add(str(ipaddress.ip_address(network.get(field, ''))))
            except ValueError:
                pass
        aliases.update(value for value in network.get('Aliases', []) or [] if isinstance(value, str) and NAME.fullmatch(value))
    container_ports, ports = safe_ports(raw)
    version = env.get('SOURCE_COMMIT', '')
    return {**identity, 'name': name, 'role': role, 'roleEvidence': 'command-shape' if role == inferred else 'caller-declared-unverified',
            'commit': version if COMMIT.fullmatch(version) else None, 'buildVersion': env.get('BUILD_VERSION') if re.fullmatch(r'\d{10,13}', env.get('BUILD_VERSION', '')) else None,
            'containerPorts': container_ports, 'ports': ports, 'addresses': sorted(addresses), 'aliases': sorted(aliases),
            'commandSha256': digest(json.dumps(cmd, sort_keys=True).encode()),
            'resources': {'memoryLimitBytes': number(raw.get('HostConfig', {}).get('Memory')),
                          'nanoCpus': number(raw.get('HostConfig', {}).get('NanoCpus')),
                          'cgroup': collector.cgroup(raw, identity['id'] in controlled)},
            'mounts': [{'destinationSha256': digest(str(m.get('Destination', '')).encode()), 'sourceSha256': digest(str(m.get('Source', '')).encode()),
                        'type': m.get('Type') if m.get('Type') in ['bind', 'volume', 'tmpfs'] else 'unknown', 'readOnly': not m.get('RW') if type(m.get('RW')) is bool else None} for m in raw.get('Mounts', [])],
            'drain': {'coverage': 'legacy-partial' if role in ['web', 'worker'] else 'unknown', 'connections': None, 'agentSessions': None,
                      'acceptedTasks': None, 'workerLeases': None, 'newAdmissions': None, 'complete': False}}


def nginx_graph(text, containers):
    edges, unknown, groups = [], [], {}
    try:
        lexer = shlex.shlex(text, posix=True, punctuation_chars='{};')
        lexer.whitespace_split, lexer.commenters = True, '#'
        stack, directive = [], []
        for token in lexer:
            # shlex may join adjacent punctuation into '};'.
            for part in list(token) if token and all(c in '{};' for c in token) else [token]:
                if part == '{':
                    if directive and (directive[0] in ['map', 'geo', 'if'] or any('$' in value for value in directive)):
                        unknown.append({'source': 'nginx', 'reason': 'DYNAMIC_BLOCK_REQUIRES_REVIEW', 'directiveSha256': digest(' '.join(directive).encode())})
                    stack.append(directive); directive = []
                elif part == '}':
                    if not stack:
                        raise ValueError()
                    stack.pop(); directive = []
                elif part == ';':
                    if directive:
                        op, values = directive[0], directive[1:]
                        if op == 'server' and any(frame and frame[0] == 'upstream' for frame in stack):
                            group = next(frame[1] for frame in reversed(stack) if frame and frame[0] == 'upstream' and len(frame) > 1)
                            groups.setdefault(group, []).append(endpoint(values[0], containers) if values else {'status': 'unknown', 'targets': []})
                        if op in ['proxy_pass', 'grpc_pass', 'fastcgi_pass', 'uwsgi_pass', 'scgi_pass']:
                            edges.append({'source': 'nginx', 'kind': op, 'valueSha256': digest(' '.join(values).encode()), 'endpoint': endpoint(values[0], containers) if len(values) == 1 else {'status': 'unknown', 'targets': []}})
                        if op in ['map', 'set', 'js_set', 'perl_set'] or any('$' in value for value in values) and op in ['server', 'include', 'resolver']:
                            unknown.append({'source': 'nginx', 'reason': 'DYNAMIC_DIRECTIVE_REQUIRES_REVIEW', 'directiveSha256': digest(' '.join(directive).encode())})
                    directive = []
                else:
                    directive.append(part)
        if stack or directive:
            raise ValueError()
    except (ValueError, IndexError):
        unknown.append({'source': 'nginx', 'reason': 'NGINX_PARSE_INCOMPLETE'})
    # Expand only a literal upstream name; no map/$variable inference or DNS guess.
    for edge in edges:
        found = edge['endpoint']
        if found['status'] == 'unresolved':
            for name, members in groups.items():
                if digest(name.encode()) == found.get('hostSha256'):
                    edge['upstreamMembers'] = members
                    found['targets'] = sorted({target for member in members for target in member['targets']})
                    found['status'] = 'resolved-group' if members and all(m['status'] == 'resolved' for m in members) else 'unknown'
        if found['status'] not in ['resolved', 'resolved-group']:
            unknown.append({'source': 'nginx', 'reason': 'UNRESOLVED_PROXY_REFERENCE', 'valueSha256': edge['valueSha256']})
    return {'coverage': 'partial', 'edges': edges, 'unknown': unknown,
            'note': 'static-endpoints-only; location precedence, map, DNS, RSC, request ownership and internal callbacks require acceptance'}


def listeners(raw):
    result = []
    for line in (raw or b'').decode('utf8', errors='replace').splitlines():
        fields = line.split()
        if len(fields) < 6 or fields[0] not in ['tcp', 'udp']:
            continue
        try:
            address, port = fields[4].rsplit(':', 1)
            address = address.strip('[]')
            if address != '*':
                address = str(ipaddress.ip_address(address))
            port = int(port)
            if not 1 <= port <= 65535:
                continue
            result.append({'protocol': fields[0], 'address': address, 'port': port, 'pids': sorted(set(int(v) for v in re.findall(r'pid=(\d+)', line)))})
        except ValueError:
            continue
    return result


def collect_inventory(command=None, private_save=None, *, expected_host_sha256=None, roles=None,
                      controlled_instances=(), max_containers=512, max_services=256, max_duration=90):
    if expected_host_sha256 is not None and not SHA.fullmatch(expected_host_sha256):
        raise ValueError('INVALID_EXPECTED_HOST_HASH')
    if type(max_containers) is not int or not 1 <= max_containers <= 2048 or type(max_services) is not int or not 1 <= max_services <= 1024 or type(max_duration) not in [int, float] or not 1 <= max_duration <= 300:
        raise ValueError('BOUNDED_INVENTORY_REQUIRED')
    roles = roles or {}
    if any(not SHA.fullmatch(key) or value not in ['web', 'worker', 'infra'] for key, value in roles.items()) or any(not SHA.fullmatch(value) for value in controlled_instances):
        raise ValueError('FIXED_CONTAINER_IDS_REQUIRED')
    c = Collector(command, private_save, max_containers=max_containers, max_services=max_services, max_duration=max_duration)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    machine = c.read('machine-id', ['cat', '--', '/etc/machine-id'], limit=4096)
    host_hash = digest(machine.strip()) if machine and re.fullmatch(b'[a-fA-F0-9]{32}', machine.strip()) else None
    memory = c.memory()
    before = c.ids('docker-list-before')
    raw = c.inspect(before, 'docker-inspect-before') if before is not None else None
    containers = [container_summary(c, row, roles, set(controlled_instances)) for row in raw or []]
    containers = [row for row in containers if row is not None]
    by_id = {row['id']: row for row in containers}
    internal = []
    for row in raw or []:
        for key, value in c.env(row).items():
            if key in ORIGIN_KEYS:
                internal.append({'source': row['Id'], 'kind': key, 'endpoint': endpoint(value, containers, origin_only=True)})
    dump = c.read('nginx-T-before', ['nginx', '-T'])
    files = []
    if dump is not None:
        text = dump.decode('utf8', errors='replace')
        config_files = list(dict.fromkeys(match[1] for match in re.finditer(r'^# configuration file ([^\n]+):\s*$', text, re.M)))
        if len(config_files) > 512:
            c.errors.append({'source': 'nginx-source-file', 'code': 'NGINX_FILE_LIMIT_EXCEEDED'})
        for name in config_files[:512]:
            if not name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts or re.search(r'[\x00-\x20\\]', name):
                c.errors.append({'source': 'nginx-source-file', 'code': 'UNSAFE_CONFIG_PATH'}); continue
            value = c.read('nginx-source-file', ['cat', '--', name])
            files.append({'path': name, 'sha256': digest(value) if value is not None else None, 'bytes': len(value) if value is not None else None})
        graph = nginx_graph(text, containers)
    else:
        graph = {'coverage': 'unknown', 'edges': [], 'unknown': [{'source': 'nginx', 'reason': 'FULL_DUMP_UNAVAILABLE'}]}
    unit_raw = c.read('systemd-unit-list', ['systemctl', 'list-units', '--type=service', '--all', '--no-legend', '--plain', '--no-pager'])
    unit_files = c.read('systemd-unit-files', ['systemctl', 'list-unit-files', '--type=service', '--no-legend', '--no-pager'])
    units = []
    for line in ((unit_raw or b'') + b'\n' + (unit_files or b'')).decode('utf8', errors='replace').splitlines():
        fields = line.split()
        # systemctl can print the failed-unit status marker even with --plain.
        # Only its separate, leading token is presentation; do not strip other
        # characters, suppress invalid unit names, or skip templates/masked units.
        if fields and fields[0] == '\u25cf' and len(fields) > 1:
            fields = fields[1:]
        unit = fields[0] if fields else ''
        if UNIT.fullmatch(unit):
            units.append(unit)
        elif unit:
            c.errors.append({'source': 'systemd-unit-list', 'code': 'UNPARSED_SYSTEMD_UNIT'})
    units = sorted(set(units))
    if len(units) > max_services:
        c.errors.append({'source': 'systemd-unit-list', 'code': 'SERVICE_LIMIT_EXCEEDED'})
    services = []
    for unit in units[:max_services]:
        shown = c.read('systemd-unit-show', ['systemctl', 'show', unit, '--property=Id,LoadState,ActiveState,SubState,FragmentPath,DropInPaths,ExecStart,ExecStop,Environment,EnvironmentFiles,Requires,Wants,After,Before', '--no-pager'])
        content = c.read('systemd-unit-cat', ['systemctl', 'cat', unit, '--no-pager'])
        values = dict(line.split('=', 1) for line in (shown or b'').decode('utf8', errors='replace').splitlines() if '=' in line)
        full = ((shown or b'') + b'\n' + (content or b'')).decode('utf8', errors='replace')
        matches = [row['id'] for row in containers if row.get('name') and re.search(r'(?<![A-Za-z0-9_.-])(?:' + re.escape(row['name']) + '|' + row['id'] + r')(?![A-Za-z0-9_.-])', full)]
        urls = re.findall(r'https?://[^\s\'";{}]+', full)
        references = [endpoint(value, containers, origin_only=True) for value in urls]
        services.append({'unit': unit, 'loadState': values.get('LoadState') if values.get('LoadState') in ['loaded', 'not-found', 'masked', 'error'] else None,
                         'activeState': values.get('ActiveState') if values.get('ActiveState') in ['active', 'inactive', 'failed', 'activating', 'deactivating', 'reloading'] else None,
                         'rawSha256': digest(full.encode()), 'referencedContainerIds': sorted(matches), 'endpoints': references,
                         'mayControlContainers': bool(re.search(r'\bdocker\b|\bcontainerd\b', full)),
                         'coverage': 'partial', 'unknown': ['dynamic-exec-and-environment-files-not-executed-or-evaluated']})
    sockets = c.read('listening-sockets', ['ss', '-H', '-lntup'], limit=2 * 1024 * 1024)
    after = c.ids('docker-list-after')
    final_rows = c.inspect(after, 'docker-inspect-after') if after is not None else None
    stable = before is not None and after == before and raw is not None and final_rows is not None
    def fingerprint(rows):
        return {r['Id']: (r.get('Image'), r.get('Name'), r.get('State', {}).get('Pid'), r.get('State', {}).get('Running'), r.get('State', {}).get('StartedAt'), r.get('HostConfig', {}).get('RestartPolicy'), r.get('Config', {}).get('Env'), r.get('NetworkSettings')) for r in rows}
    stable = stable and fingerprint(raw) == fingerprint(final_rows)
    nginx_after = c.read('nginx-T-after', ['nginx', '-T'])
    nginx_stable = dump is not None and nginx_after is not None and digest(dump) == digest(nginx_after)
    if not stable:
        c.errors.append({'source': 'docker', 'code': 'CONCURRENT_INVENTORY_CHANGE_OR_INCOMPLETE'})
    if not nginx_stable:
        c.errors.append({'source': 'nginx', 'code': 'CONCURRENT_CONFIG_CHANGE_OR_INCOMPLETE'})
    if host_hash is None or expected_host_sha256 and expected_host_sha256 != host_hash:
        c.errors.append({'source': 'machine-id', 'code': 'HOST_IDENTITY_UNVERIFIED'})
    return c.sanitize({'schemaVersion': 1, 'kind': 'read-only-host-inventory-not-drain-receipt', 'observedAt': started,
            'completedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'source': 'injected-runner' if command else 'local-linux',
            'hostIdentitySha256': host_hash, 'hostIdentityMatches': host_hash == expected_host_sha256 if expected_host_sha256 else None,
            'memory': memory, 'containers': containers,
            'dockerInventory': {'complete': stable and len(by_id) == len(before or []), 'stable': stable, 'includesStopped': True, 'observedCount': len(containers)},
            'nginx': {'fullDumpSha256': digest(dump) if dump is not None else None, 'stable': nginx_stable, 'files': files, 'graph': graph},
            'internalReferences': internal, 'services': services, 'systemdCoverage': 'partial' if unit_raw is not None and unit_files is not None else 'unknown',
            'listeners': listeners(sockets), 'listenerCoverage': 'listening-only-not-drain' if sockets is not None else 'unknown',
            'retirementApproved': False, 'drainCoverage': 'unknown', 'errors': c.errors, 'observations': c.observations,
            'privateCaptures': c.private, 'privateCaptureRequested': bool(private_save)})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-host-sha256')
    args = parser.parse_args(argv)
    try:
        if os.name != 'posix':
            raise ValueError('LOCAL_LINUX_REQUIRED')
        print(json.dumps(collect_inventory(expected_host_sha256=args.expected_host_sha256), sort_keys=True))
        return 0
    except Exception:
        print(json.dumps({'error': 'INVENTORY_COLLECTION_FAILED', 'retirementApproved': False}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
