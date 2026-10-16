#!/usr/bin/env python3
"""Read-only 103 inventory; JSON goes only to an ACL-protected local capture.

No SSH/credentials are implemented here. The main controller must supply its
103-only pinned-host transport. No database queries, HTTP mutations, lock grabs,
container starts/stops, temp files, environment changes or service reloads occur.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(arguments, timeout=20):
    result = subprocess.run(arguments, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Read command failed: ' + arguments[0])
    return result.stdout


PUBLIC_ENV = {
    'SOURCE_COMMIT', 'BUILD_VERSION', 'NAUMI_EDITION', 'NAUMI_ENVIRONMENT',
    'NAUMI_MULTI_USER', 'NAUMI_VIDEO_WORKER', 'MEDIA_DIR', 'MEDIA_PRIVATE',
    'STORAGE_DRIVER', 'NEXT_PUBLIC_MEDIA_VARIANTS', 'DESKTOP_UI_BUILD',
    'ENTERPRISE_UI_BUILD', 'NEXT_PUBLIC_DESKTOP_DEPLOYMENT', 'HOSTNAME', 'PORT',
    'NAUMI_STAGING_HISTORY_GUARD',
}
ORIGIN_ENV = {'NAUMI_APP_ORIGIN', 'INTERNAL_APP_ORIGIN', 'REFERENCE_WORKBENCH_URL'}
STORAGE_ENV = {
    'MEDIA_DIR', 'MEDIA_PRIVATE', 'STORAGE_DRIVER', 'R2_ACCOUNT_ID', 'R2_BUCKET',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL',
    'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'S3_BUCKET',
    'S3_PUBLIC_BASE_URL', 'NEXT_PUBLIC_MEDIA_VARIANTS',
}


def safe_origin(value):
    # Never emit userinfo/query/token; unknown origin shapes get only a hash.
    if re.fullmatch(r'https?://[a-zA-Z0-9_.:-]+(?:/[a-zA-Z0-9_./-]*)?', value or ''):
        return {'value': value, 'sha256': digest(value.encode())}
    return {'present': bool(value), 'sha256': digest((value or '').encode())}


def container_summary(row):
    config, host = row.get('Config') or {}, row.get('HostConfig') or {}
    env = dict(value.split('=', 1) for value in config.get('Env') or [] if '=' in value)
    image = row.get('Image', '')
    command_line = (config.get('Entrypoint') or []) + (config.get('Cmd') or [])
    # Command arguments can contain secrets, so retain a hash and executable names only.
    role = 'worker' if any('worker' in str(part) for part in command_line) else 'web' if '3000/tcp' in (config.get('ExposedPorts') or {}) else 'infrastructure-or-unclassified'
    mounts = [{'source': item.get('Source'), 'destination': item.get('Destination'), 'rw': item.get('RW'), 'type': item.get('Type')} for item in row.get('Mounts') or []]
    storage = {key: env[key] for key in sorted(STORAGE_ENV) if key in env}
    return {
        'id': row.get('Id'), 'name': row.get('Name', '').lstrip('/'), 'image': image,
        'imageTag': config.get('Image'), 'roleHint': role,
        'startedAt': (row.get('State') or {}).get('StartedAt'),
        'running': (row.get('State') or {}).get('Running'),
        'oomKilled': (row.get('State') or {}).get('OOMKilled'),
        'restartCount': row.get('RestartCount'), 'restartPolicy': host.get('RestartPolicy'),
        'memoryLimitBytes': host.get('Memory'), 'cpuNanoLimit': host.get('NanoCpus'),
        'portBindings': host.get('PortBindings'), 'networks': sorted((row.get('NetworkSettings') or {}).get('Networks') or {}),
        'networkAliases': {name: value.get('Aliases') for name, value in ((row.get('NetworkSettings') or {}).get('Networks') or {}).items()},
        'publicEnv': {key: env[key] for key in sorted(PUBLIC_ENV) if key in env},
        'origins': {key: safe_origin(env[key]) for key in sorted(ORIGIN_ENV) if key in env},
        'envSha256': digest(json.dumps(sorted(env.items()), separators=(',', ':')).encode()),
        'storageBindingSha256': digest(json.dumps(storage, separators=(',', ':')).encode()),
        'storagePresence': {key: bool(env.get(key)) for key in sorted(STORAGE_ENV)},
        'commandSha256': digest(json.dumps(command_line, separators=(',', ':')).encode()),
        'mounts': mounts,
    }


def memory_summary():
    fields = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, rest = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'):
            fields[key + 'KiB'] = int(rest.split()[0])
    fields['swapIsNotAvailableBudget'] = True
    return fields


def cgroup_summary(row):
    pid = (row.get('State') or {}).get('Pid')
    if not pid or not (row.get('State') or {}).get('Running'):
        return {'status': 'NOT_RUNNING'}
    try:
        groups = Path('/proc/' + str(int(pid)) + '/cgroup').read_text().splitlines()
        selected = next(line.split(':', 2)[2] for line in groups if line.startswith('0::'))
        if '..' in Path(selected).parts:
            return {'status': 'INVALID_PATH'}
        root = Path('/sys/fs/cgroup') / selected.lstrip('/')
        values = {}
        for name in ('memory.current', 'memory.peak', 'memory.events', 'memory.stat'):
            path = root / name
            if not path.is_file():
                values[name] = None
            elif name in ('memory.current', 'memory.peak'):
                values[name] = int(path.read_text().strip())
            else:
                values[name] = {key: int(value) for key, value in (line.split() for line in path.read_text().splitlines())}
        return {'status': 'OBSERVED_CGROUP_V2', **values}
    except (OSError, ValueError, StopIteration):
        return {'status': 'UNKNOWN_UNSUPPORTED_OR_RACE'}


def config_capture(raw, include_bodies=False):
    text = raw.decode('utf-8')
    sections = list(re.finditer(r'^# configuration file (/[^\r\n:]+):\r?\n', text, re.M))
    files = []
    for index, marker in enumerate(sections):
        path = Path(marker.group(1))
        data = path.read_bytes()
        row = {'path': str(path), 'realPath': str(path.resolve()), 'isSymlink': path.is_symlink(), 'sha256': digest(data), 'bytes': len(data)}
        # Deny literal sensitive headers/auth credentials in the body capture mode.
        sensitive = re.search(r'(?im)^\s*(?:proxy_set_header\s+(?:authorization|x-[\w-]*(?:secret|token|key))\s+["\']?(?!\$)[^;\n]+|auth_basic_user_file|ssl_password_file|set\s+\$[\w]*(?:secret|token|key)[\w]*\s+["\']?(?!\$)[^;\n]+)', data.decode('utf-8'))
        row['sensitiveDirectiveDetected'] = bool(sensitive)
        if include_bodies and not sensitive:
            row['text'] = data.decode('utf-8')
        files.append(row)
    complete = bool(sections) and all(not row['sensitiveDirectiveDetected'] for row in files)
    result = {'sha256': digest(raw), 'bytes': len(raw), 'files': files, 'bodyCaptureComplete': bool(include_bodies and complete)}
    if include_bodies and complete:
        result['fullDumpText'] = text
    return result


def inventory(include_config_bodies=False, read_build_files=False, skip_config=False):
    names = command(['docker', 'ps', '-aq']).decode().split()
    rows = json.loads(command(['docker', 'inspect', *names], timeout=30)) if names else []
    result = {
        'schemaVersion': 1, 'kind': 'release103-readonly-inventory',
        'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'machineIdSha256': digest(Path('/etc/machine-id').read_bytes().strip()),
        'memory': memory_summary(),
        'disk': command(['df', '-P', '-B1', '/']).decode(),
        'containers': [{**container_summary(row), 'cgroup': cgroup_summary(row)} for row in rows],
        'nginx': None if skip_config else config_capture(command(['nginx', '-T']), include_config_bodies),
        'services': command(['systemctl', 'list-units', '--all', '--type=service', '--no-pager', '--no-legend']).decode(),
        'listeningSockets': command(['ss', '-H', '-lntp']).decode(),
        'productionWrites': 0, 'databaseQueries': 0, 'supplierCalls': 0,
    }
    if read_build_files:
        for summary in result['containers']:
            if not summary['running'] or summary['roleHint'] != 'web':
                continue
            try:
                raw = command(['docker', 'exec', summary['id'], 'cat', '/app/.next/required-server-files.json'], timeout=8)
                config = json.loads(raw).get('config') or {}
                build_id = command(['docker', 'exec', summary['id'], 'cat', '/app/.next/BUILD_ID'], timeout=8).decode().strip()
                summary['build'] = {'id': build_id, 'assetPrefix': config.get('assetPrefix', ''), 'basePath': config.get('basePath', ''), 'manifestSha256': digest(raw)}
            except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired):
                summary['build'] = {'status': 'UNAVAILABLE'}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--include-config-bodies', action='store_true', help='Only to a private local capture, never paste full output')
    parser.add_argument('--read-build-files', action='store_true', help='Sequential small read-only docker exec cat; no Next process')
    parser.add_argument('--skip-config', action='store_true', help='Reuse a separately captured full nginx -T rather than recapture')
    args = parser.parse_args()
    print(json.dumps(inventory(args.include_config_bodies, args.read_build_files, args.skip_config), separators=(',', ':')))
