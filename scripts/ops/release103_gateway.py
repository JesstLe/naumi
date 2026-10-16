#!/usr/bin/env python3
"""Offline 103-only gateway/maintenance bundles; no SSH, install or reload.

The pinned complete live dump is intentional. A refreshed live baseline must be
captured, reviewed and this inventory revised, never force-applied with old CAS.
Shared code is only the generic lexer, exact-file bundle writer and hash helpers.
"""
import argparse
import difflib
import json
from pathlib import Path, PurePosixPath
import re

from release_client_compat import Dump, origin, quote, require, sha, write_gateway_bundle
from release103_assets import canonical_url, PREFIXES

LIVE_DUMP_SHA = '10cda9f769a1696f237d4beb9e1ecc141168ffc9d9612fac9b59039b177193d9'
SITE = '/etc/nginx/sites-enabled/default'
EXACT_SOURCE_SHA = {
    '/etc/nginx/nginx.conf': '48c6a4ec1e1fd28ccf968490f07e34a1d7f755793b2108a3ed8670b1ee2a0aa2',
    '/etc/nginx/mime.types': '36c77daa2d85803e87c91ba723dd2bc6aaa6543ae4bd4a569034a7bf8bce464d',
    SITE: '1215cc5cc2bd67d2c892a8ee22503ac8092880685615bc9f5e59fd62e66f7381',
}
FLEET = {
    '= /admin/deployments', '= /api/admin/fleet', '= /api/admin/fleet/status',
    '= /api/admin/fleet/releases', '= /api/fleet/poll', '= /api/fleet/ack',
    '= /api/fleet/releases/poll', '= /api/fleet/releases/ack', '^~ /fleet-assets/_next/',
}
DENIES = {'^~ /api/video/worker/': '403', '^~ /desktop/api/video/worker/': '403', r'~ /\.': '404'}
DESKTOP = {'= /desktop', '^~ /desktop/', '^~ /desktop/_next/'}
ENTERPRISE = {'= /enterprise', '^~ /enterprise/', '^~ /enterprise/_next/', '= /team'}
MAIN = {
    '= /api/enterprise', '^~ /api/enterprise/', '= /api/team', '^~ /api/team/',
    '= /desktop/api/team', '^~ /desktop/api/team/', '^~ /api/', '= /api/version',
    '= /api/feature-access', '= /desktop/api/feature-access', '^~ /_next/',
    '= /desktop/api/version', '^~ /desktop/api/', '^~ /media/',
    '= /api/media/image-cache', '= /api/public-image-cache', '= /api/team/media',
    '= /api/enterprise/media', '= /desktop/api/media/image-cache',
    '= /desktop/api/public-image-cache', '= /desktop/api/team/media',
    '= /desktop/api/enterprise/media', '= /api/imagegen', '^~ /api/imagegen/',
    '= /api/generate-image', '= /desktop/api/imagegen', '^~ /desktop/api/imagegen/',
    '= /desktop/api/generate-image', '/',
}
FALLBACKS = {
    '@enterprise_previous_assets', '@entry_previous_ui_assets', '@enterprise_oldest_assets',
    '@entry_original_ui_assets', '@enterprise_analytics_assets', '@entry_r1_ui_assets',
    '@enterprise_r1_assets', '@image_cache_old_ui', '@image_cache_old_desktop',
    '@image_cache_old_enterprise', '@admin_probe_previous_ui', '@admin_probe_previous_desktop',
    '@admin_probe_previous_enterprise', '@upload_previous_ui', '@upload_previous_desktop',
    '@upload_previous_enterprise', '@imagegen_previous_primary_ui',
}


def validate_manifest(manifest):
    require(manifest.get('kind') == '103-prefixed-static-union' and manifest.get('schemaVersion') == 1, 'Verified prefixed 103 static union required')
    require(manifest.get('fleetIncluded') is False and not manifest.get('conflicts'), 'Fleet/conflicted static union rejected')
    seen, prefixes = set(), set()
    for asset in manifest['assets']:
        url = canonical_url(asset['url'])
        require(url not in seen, 'Duplicate static URL')
        require(re.fullmatch('[a-f0-9]{64}', asset['sha256']) and type(asset['size']) is int and asset['size'] >= 0, 'Invalid static byte identity')
        seen.add(url)
        prefixes.add(next(prefix for prefix in PREFIXES if url.startswith(prefix)))
    require(prefixes == set(PREFIXES), 'All three independent static namespaces required')
    return len(seen)


def inventory(text):
    require(sha(text.encode()) == LIVE_DUMP_SHA, '103 baseline changed: recapture/review/regenerate; no stale CAS override')
    dump = Dump(text)
    require(set(dump.files) == {'/etc/nginx/nginx.conf', '/etc/nginx/mime.types', SITE}, 'Unexpected config closure')
    servers = [node for node in dump.nodes[SITE] if node.name == 'server']
    require(len(servers) == 1, 'Exactly one known 103 server required')
    server = servers[0]
    require([child.args for child in server.children if child.name == 'server_name'] == [['103.30.76.93', 'naumi.top', 'www.naumi.top']], 'Unexpected server identity')
    locations = {' '.join(child.args): child for child in server.children if child.name == 'location'}
    require(set(locations) == FLEET | set(DENIES) | DESKTOP | ENTERPRISE | MAIN | FALLBACKS and len(locations) == 65, 'Unknown/missing/duplicated 103 route class')
    for key in FLEET:
        expected = 'http://127.0.0.1:13062' + ('/_next/' if key == '^~ /fleet-assets/_next/' else '')
        require([c.args for c in locations[key].children if c.name == 'proxy_pass'] == [[expected]], 'Fleet backend must remain exactly 13062')
    return dump, server, locations


def render(text, main, desktop, enterprise, static_root, manifest, maintenance=False):
    origins = {'main': origin(main), 'desktop': origin(desktop), 'enterprise': origin(enterprise)}
    require(len(set(origins.values())) == 3 and all(not value.endswith(':13062') for value in origins.values()), 'Three distinct non-Fleet candidate origins required')
    require(static_root.startswith('/') and not any(c in static_root for c in '$\r\n;{}\\') and '..' not in PurePosixPath(static_root).parts, 'Invalid static union root')
    asset_count = validate_manifest(manifest)
    dump, server, locations = inventory(text)
    body, edits, classes = dump.files[SITE], [], []
    for key, node in locations.items():
        if key in FLEET or key in DENIES:
            classes.append({'location': key, 'action': 'preserved-exact', 'class': 'fleet' if key in FLEET else 'deny'})
            continue
        if key in FALLBACKS:
            edits.append((node.start, node.end, '# Retired known legacy static fallback ' + key + '; bytes retained in prefixed union.'))
            classes.append({'location': key, 'action': 'retired-static-chain'})
            continue
        flavor = 'desktop' if key in DESKTOP else 'enterprise' if key in ENTERPRISE else 'main'
        classes.append({'location': key, 'action': 'maintenance-503' if maintenance else 'proxy', 'flavor': flavor})
        if maintenance:
            replacement = 'location ' + ' '.join(quote(t.value) for t in node.tokens[1:]) + ' { add_header Retry-After "60" always; add_header Cache-Control "no-store" always; return 503; }'
            edits.append((node.start, node.end, replacement))
            continue
        for child in node.children:
            if child.name in ('proxy_intercept_errors', 'error_page'):
                edits.append((child.start, child.end, ''))
            elif child.name == 'proxy_pass':
                require(len(child.args) == 1, 'Invalid known proxy')
                match = re.fullmatch(r'http://127\.0\.0\.1:[0-9]+(/.*)?', child.args[0])
                require(match, 'Unexpected origin')
                # Preserve exact prefix stripping semantics in the known live file.
                suffix = match.group(1) or ''
                edits.append((child.tokens[1].start, child.tokens[1].end, quote(origins[flavor] + suffix)))
            elif child.name == 'proxy_set_header' and child.args[:1] == ['X-Forwarded-For']:
                edits.append((child.start, child.end, 'proxy_set_header X-Forwarded-For $remote_addr;'))
        # Do not trust client-provided Cloudflare identity; Fleet already clears it.
        identity = '\n proxy_set_header CF-Connecting-IP "";\n'
        if not any(c.name == 'proxy_set_header' and c.args[:1] == ['X-Forwarded-For'] for c in node.children):
            identity += ' proxy_set_header X-Forwarded-For $remote_addr;\n'
        if not any(c.name == 'proxy_set_header' and c.args[:1] == ['X-Real-IP'] for c in node.children):
            identity += ' proxy_set_header X-Real-IP $remote_addr;\n'
        edits.append((node.closing, node.closing, identity))
    extra = []
    for prefix in PREFIXES:
        extra.append('location ^~ ' + prefix + ' { alias ' + quote(static_root.rstrip('/') + prefix) + '; autoindex off; add_header Cache-Control "public, max-age=31536000, immutable" always; }')
    # Enterprise pages stay on their compiled UI; their APIs have one main owner.
    for modifier, uri, upstream in [('=', '/enterprise/api', '/api'), ('^~', '/enterprise/api/', '/api/')]:
        extra.append('location ' + modifier + ' ' + uri + ' { ' + ('add_header Retry-After "60" always; add_header Cache-Control "no-store" always; return 503;' if maintenance else 'proxy_pass ' + quote(main + upstream) + '; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header CF-Connecting-IP ""; proxy_set_header Connection ""; proxy_buffering off; proxy_read_timeout 900s;') + ' }')
    # A long prefix otherwise bypasses the inherited worker deny.
    extra.append('location ^~ /enterprise/api/video/worker/ { return 403; }')
    edits.append((server.closing, server.closing, '\n# 103 independently retained static + centralized enterprise API\n' + '\n'.join(extra) + '\n'))
    for start, end, replacement in sorted(edits, reverse=True):
        body = body[:start] + replacement + body[end:]
    patches = {**dump.files, SITE: body}  # all exact source files participate in CAS.
    after = dump.render(patches)
    new = Dump(after)
    new_locations = {' '.join(child.args): child for child in new.nodes[SITE][0].children if child.name == 'location'}
    for key in FLEET | set(DENIES):
        old_node, new_node = locations[key], new_locations[key]
        require(dump.files[SITE][old_node.start:old_node.end] == new.files[SITE][new_node.start:new_node.end], 'Protected route bytes changed')
    require(all(not child.args[0].startswith('@') for child in new_locations.values()), 'Legacy static chain retained')
    report = {'schemaVersion': 1, 'kind': '103-maintenance-gateway' if maintenance else '103-candidate-gateway', 'target': '103.30.76.93', 'baselineDumpSha256': LIVE_DUMP_SHA, 'afterDumpSha256': sha(after.encode()), 'origins': origins, 'staticRoot': static_root, 'staticAssets': asset_count, 'originalRouteClasses': classes, 'originalRouteClassesCount': len(classes), 'fleetRouteBytesPreserved': 9, 'denyRouteBytesPreserved': 3, 'retiredFallbacks': sorted(FALLBACKS), 'compiledUiFlavors': 3, 'apiOwner': 'main', 'readyToDeploy': False, 'liveWrites': 0, 'protocolCompatibility': 'NOT_VERIFIED'}
    report['sourceRealPaths'] = {'/etc/nginx/nginx.conf': '/etc/nginx/nginx.conf', '/etc/nginx/mime.types': '/etc/nginx/mime.types', SITE: '/etc/nginx/sites-available/default'}
    report['rollbackScriptScope'] = 'Local copied config tree only; live lock owner must preserve sites-enabled symlink, validate realpath/CAS, nginx -t, reload and business acceptance separately'
    return patches, after, report


ROLLBACK = '''#!/usr/bin/env bash
set -euo pipefail
# Exact local tree restoration only. Caller owns lock, nginx -t and reload.
python3 - "$0" "${1:?Usage: ROLLBACK.sh ABSOLUTE_TARGET_CONFIG_ROOT}" <<'PY'
import hashlib,json,pathlib,sys
bundle=pathlib.Path(sys.argv[1]).resolve().parent
root=pathlib.Path(sys.argv[2]).resolve()
assert root.is_dir(), 'Target root must exist'
report=json.loads((bundle/'report.json').read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
for p in report['patches']:
 target=root/p['path'].lstrip('/')
 assert target.resolve().is_relative_to(root) and target.is_file() and not target.is_symlink(), 'Invalid target'
 assert sha(target)==p['afterSha256'], 'CAS mismatch; nothing restored'
 assert sha(bundle/p['before'])==p['beforeSha256'], 'Original backup changed'
for p in report['patches']:
 target=root/p['path'].lstrip('/')
 target.write_bytes((bundle/p['before']).read_bytes())
 assert sha(target)==p['beforeSha256']
print('ROLLBACK=PASS EXACT_SOURCE_FILES='+str(len(report['patches']))+' ORIGINAL_BYTES=RESTORED RELOAD=NOT_EXECUTED')
PY
'''


def bundle(text, source_files, main, desktop, enterprise, static_root, manifest, output, maintenance=False):
    patches, after, report = render(text, main, desktop, enterprise, static_root, manifest, maintenance)
    # Verify exact bytes for ALL closure members before writing any bundle.
    dump = Dump(text)
    require(set(source_files) == set(dump.files), 'All exact closure source files required')
    for name, raw in source_files.items():
        require(dump.files[name] in (raw.decode(), raw.decode() + '\n'), 'Exact source mismatch: ' + name)
        require(sha(raw) == EXACT_SOURCE_SHA[name], 'Exact disk source hash mismatch: ' + name)
    output = Path(output)
    write_gateway_bundle(text, patches, after, report, output, source_files)
    (output / 'MODIFIED_FILE').write_bytes((output / 'after' / SITE.lstrip('/')).read_bytes())
    (output / 'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(text.splitlines(True), after.splitlines(True), fromfile='nginx.before.txt', tofile='nginx.after.txt')), encoding='utf-8')
    rollback = output / 'ROLLBACK.sh'
    rollback.write_text(ROLLBACK, encoding='utf-8', newline='\n')
    rollback.chmod(0o755)
    (output / 'VERIFICATION.txt').write_text('STATUS=PREPARED_NOT_DEPLOYED\nBRANCH=103 main API + compiled desktop/enterprise UI + prefixed readonly static aliases\nFULL_SOURCE_CAS=3\nBASELINE_DUMP_SHA256=' + LIVE_DUMP_SHA + '\nFINAL_CANDIDATE_NEXT_BROWSER=NOT_VERIFIED\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ('dump', 'source-root', 'main', 'desktop', 'enterprise', 'static-root', 'manifest', 'output'):
        p.add_argument('--' + arg, required=True)
    p.add_argument('--maintenance', action='store_true')
    a = p.parse_args()
    text = Path(a.dump).read_bytes().decode()
    sources = {name: (Path(a.source_root) / name.lstrip('/')).read_bytes() for name in Dump(text).files}
    result = bundle(text, sources, a.main, a.desktop, a.enterprise, a.static_root, json.loads(Path(a.manifest).read_text()), a.output, a.maintenance)
    print('HK_GATEWAY=PREPARED MODE=' + ('MAINTENANCE' if a.maintenance else 'CANDIDATE') + ' KNOWN_ROUTES=65 FLEET_EXACT=9 SOURCE_CAS=3 LIVE_WRITES=0 PROTOCOL=NOT_VERIFIED')
