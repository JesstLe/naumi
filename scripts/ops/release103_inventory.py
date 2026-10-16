#!/usr/bin/env python3
"""Pure offline 103 route/build/storage inventory. Never executes deployment.

This does not reuse 47's machine id, fixed route renderer or lock assumptions.
It shares only the generic nginx lexer/include parser from release_client_compat.
No location text or Docker environment is rewritten.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

from release_client_compat import Dump, CompatError, require


TARGET = '103.30.76.93'
SCOPE = {
    'ui': ('/', ''),
    'desktop': ('= /desktop', '/desktop'),
    'enterprise': ('= /enterprise', '/enterprise'),
}


def bound_ports(container):
    result = []
    for rows in (container.get('portBindings') or {}).values():
        for binding in rows or []:
            if binding.get('HostIp') in ('127.0.0.1', '::1'):
                result.append(int(binding['HostPort']))
    return result


def inspect_routes(text, containers):
    dump = Dump(text)
    target_servers = []
    for name, node in dump.expand(dump.root):
        if node.name == 'server' and any(child.name == 'server_name' and TARGET in child.args for child in node.children or []):
            target_servers.append((name, node))
    require(len(target_servers) == 1, 'Exactly one actual 103 main server required')
    name, server = target_servers[0]
    locations = []
    for node in server.children:
        if node.name != 'location':
            continue
        require(node.children is not None, 'Invalid location')
        proxies = [child.args for child in node.children if child.name == 'proxy_pass']
        require(len(proxies) <= 1, 'Ambiguous proxy location')
        proxy = proxies[0][0] if proxies else None
        endpoint = re.fullmatch(r'http://127\.0\.0\.1:([1-9][0-9]{0,4})(/[^\s]*)?', proxy or '')
        require(proxy is None or endpoint, 'Unknown 103 backend shape; no guessing')
        fallbacks = [arg for child in node.children if child.name == 'error_page' for arg in child.args if arg.startswith('@')]
        locations.append({
            'location': ' '.join(node.args),
            'proxy': proxy, 'port': int(endpoint.group(1)) if endpoint else None,
            'upstreamPath': endpoint.group(2) if endpoint else None,
            'fallbacks': fallbacks,
            'aliases': [child.args for child in node.children if child.name == 'alias'],
            'roots': [child.args for child in node.children if child.name == 'root'],
            'tryFiles': [child.args for child in node.children if child.name == 'try_files'],
            'returns': [child.args for child in node.children if child.name == 'return'],
            'blockSha256': hashlib.sha256(dump.files[name][node.start:node.end].encode()).hexdigest(),
        })
    by_location = {row['location']: row for row in locations}
    require(len(by_location) == len(locations), 'Duplicate exact location description')
    for row in locations:
        require(all(fallback in by_location for fallback in row['fallbacks']), 'Missing named static fallback')
    named = {row['location']: row for row in locations if row['location'].startswith('@')}

    def chain(start, visited=()):
        require(start not in visited, 'Static fallback cycle')
        row = by_location[start]
        return [row['port']] + [port for target in row['fallbacks'] for port in chain(target, visited + (start,))]

    by_port = {}
    for container in containers:
        for port in bound_ports(container):
            require(port not in by_port, 'Ambiguous bound port in captured inventory')
            by_port[port] = container
    referenced = {}
    for row in locations:
        if row['port'] is not None:
            referenced.setdefault(row['port'], []).append(row['location'])
    active = {}
    for flavor, (location, prefix) in SCOPE.items():
        require(location in by_location, 'Missing UI flavor route: ' + flavor)
        port = by_location[location]['port']
        require(port in by_port, 'No captured container for active UI port')
        container = by_port[port]
        require(container.get('running') is True, 'Active UI container not running')
        require(container.get('build', {}).get('assetPrefix') == prefix, 'UI flavor/build assetPrefix mismatch: ' + flavor)
        env = container.get('publicEnv') or {}
        require(env.get('STORAGE_DRIVER') == 'r2' and env.get('MEDIA_PRIVATE') == '1', 'Expected existing private R2 binding missing')
        require(container.get('storagePresence', {}).get('R2_BUCKET') and container.get('storagePresence', {}).get('R2_SECRET_ACCESS_KEY'), 'Expected existing R2 credential presence missing')
        active[flavor] = {'port': port, 'container': container['name'], 'containerId': container['id'], 'image': container['image'], 'source': env.get('SOURCE_COMMIT'), 'version': env.get('BUILD_VERSION'), 'build': container.get('build'), 'envSha256': container.get('envSha256'), 'storageBindingSha256': container.get('storageBindingSha256')}
    containers_out = []
    for row in containers:
        ports = bound_ports(row)
        refs = [{'port': port, 'locations': referenced.get(port, [])} for port in ports]
        if row.get('build', {}).get('assetPrefix') == '/fleet-assets':
            role = 'independent-fleet-portal-preserve'
        elif row.get('roleHint') == 'worker':
            role = 'worker-needs-separate-handoff'
        elif row.get('build', {}).get('id'):
            role = 'current-or-fallback-web' if any(value['locations'] for value in refs) else 'web-no-nginx-reference-not-drain-proof'
        else:
            role = 'infrastructure-or-other-preserve'
        containers_out.append({'id': row['id'], 'name': row['name'], 'running': row.get('running'), 'role': role, 'references': refs, 'image': row['image'], 'canStop': False, 'drainStatus': 'NOT_MEASURED', 'cgroup': row.get('cgroup')})
    workers = []
    for worker in containers:
        if worker.get('roleHint') != 'worker':
            continue
        origin = worker.get('origins', {}).get('NAUMI_APP_ORIGIN', {}).get('value')
        match = re.fullmatch(r'http://([^/:]+):3000', origin or '')
        matches = []
        if match:
            host = match.group(1)
            for candidate in containers:
                shared = set(worker.get('networks') or []) & set(candidate.get('networks') or [])
                if any(host in (candidate.get('networkAliases', {}).get(network) or []) for network in shared):
                    matches.append(candidate['id'])
        workers.append({'name': worker['name'], 'id': worker['id'], 'origin': origin, 'resolvedContainerIds': matches, 'ownershipStatus': 'EXACT_ALIAS_IN_SHARED_NETWORK' if len(matches) == 1 else 'UNKNOWN', 'acceptedTasks': None, 'agentSessions': None, 'newAdmissions': None})
    return {
        'schemaVersion': 1, 'kind': '103-offline-adaptation-inventory', 'target': TARGET,
        'fullDumpSha256': hashlib.sha256(text.encode()).hexdigest(), 'configFiles': list(dump.files), 'site': name,
        'activeUiFlavors': active, 'locations': locations,
        'staticFallbackChains': {row['location']: chain(row['location']) for row in locations if '_next/' in row['location'] or row['location'].startswith('@')},
        'referencedPorts': sorted(referenced), 'containers': containers_out, 'workers': workers,
        'requiresThreeBuildFlavors': True, 'retainFleetPortal': True, 'productionWrites': 0,
        'readyToDeploy': False, 'legacyDrainKnown': False,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump', required=True)
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    require(not output.exists(), 'New offline output required')
    captured = json.loads(Path(args.inventory).read_text(encoding='utf-8'))
    require(captured.get('machineIdSha256') == '26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35', 'Captured 103 identity mismatch')
    result = inspect_routes(Path(args.dump).read_bytes().decode('utf-8'), captured['containers'])
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('RELEASE103_OFFLINE=PASS UI_FLAVORS=3 PRIVATE_R2=PRESERVED FLEET=PRESERVED READY_TO_DEPLOY=0')
