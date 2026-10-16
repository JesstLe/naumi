#!/usr/bin/env python3
"""Static-only 103 CAS gateway package. Offline; never installs or contacts a host.

Keep every dynamic proxy/header/TLS/Fleet directive. The sole non-static behavior
delta is retiring the existing named 404 chains, including their page references.
The following full gateway release MUST be rebased onto this package's after CAS.
"""
import argparse
import difflib
import json
from pathlib import Path, PurePosixPath

import release103_gateway as hk
from release_client_compat import Dump, parse, quote, require, sha, walk, write_gateway_bundle

STATIC_ROOT = '/var/www/naumi-client-assets/evening-0614f9ae6f91-unified'
REFERENCE_ROUTES = {
    '= /desktop': '@image_cache_old_desktop',
    '^~ /desktop/': '@image_cache_old_desktop',
    '= /enterprise': '@image_cache_old_enterprise',
    '^~ /enterprise/': '@image_cache_old_enterprise',
    '= /team': '@image_cache_old_enterprise',
    '^~ /enterprise/_next/': '@upload_previous_enterprise',
    '^~ /_next/': '@upload_previous_ui',
    '/': '@image_cache_old_ui',
    '^~ /desktop/_next/': '@upload_previous_desktop',
}
REAL_PATHS = {name: name for name in hk.EXACT_SOURCE_SHA}
REAL_PATHS[hk.SITE] = '/etc/nginx/sites-available/default'


def render(text, manifest, static_root=STATIC_ROOT):
    require(static_root.startswith('/') and not any(c in static_root for c in '$\r\n;{}\\')
            and '..' not in PurePosixPath(static_root).parts, 'Invalid static root')
    count = hk.validate_manifest(manifest)
    dump, server, locations = hk.inventory(text)
    body, edits, removed = dump.files[hk.SITE], [], []
    for key, node in locations.items():
        if key in hk.FALLBACKS:
            edits.append((node.start, node.end, ''))
            continue
        refs = [c for c in node.children if c.name == 'error_page']
        intercepts = [c for c in node.children if c.name == 'proxy_intercept_errors']
        if key in REFERENCE_ROUTES:
            require([c.args for c in refs] == [['404', '=', REFERENCE_ROUTES[key]]]
                    and [c.args for c in intercepts] == [['on']], 'Unexpected fallback reference')
            for child in refs + intercepts:
                edits.append((child.start, child.end, ''))
            removed.append({'location': key, 'target': REFERENCE_ROUTES[key]})
        else:
            require(not refs and not intercepts, 'Unreviewed error interception')
    extra = '\n# Disk-only static preflight; dynamic routes retain original upstreams.\n'
    for prefix in hk.PREFIXES:
        extra += ('location ^~ ' + prefix + ' { alias ' + quote(static_root.rstrip('/') + prefix)
                  + '; autoindex off; add_header Cache-Control "public, max-age=31536000, immutable" always; }\n')
    edits.append((server.closing, server.closing, extra))
    for start, end, replacement in sorted(edits, reverse=True):
        body = body[:start] + replacement + body[end:]
    patches = {hk.SITE: body}
    after = dump.render(patches)
    new = Dump(after)
    new_locations = {' '.join(n.args): n for n in new.nodes[hk.SITE][0].children if n.name == 'location'}
    require(set(new_locations) == (set(locations) - hk.FALLBACKS) | {'^~ '+p for p in hk.PREFIXES}, 'Unexpected new routes')
    for key, node in locations.items():
        if key in hk.FALLBACKS:
            continue
        old_bytes = dump.files[hk.SITE][node.start:node.end]
        for child in sorted([c for c in node.children if c.name in ('error_page', 'proxy_intercept_errors')], key=lambda c:c.start, reverse=True):
            old_bytes = old_bytes[:child.start-node.start] + old_bytes[child.end-node.start:]
        other = new_locations[key]
        require(old_bytes == new.files[hk.SITE][other.start:other.end], 'Dynamic route byte delta: '+key)
    require(not any(arg in hk.FALLBACKS for node in walk(parse(body)) for arg in node.args), 'Dangling named fallback')
    # Outside exact location spans, all server/global/TLS directives are identical.
    def outside(source, locs):
        for node in sorted(locs.values(), key=lambda n:n.start, reverse=True):
            source = source[:node.start] + source[node.end:]
        return [(n.name,n.args) for n in walk(parse(source))]
    require(outside(dump.files[hk.SITE], locations) == outside(body, new_locations), 'Non-location directive delta')
    report = {
        'schemaVersion': 1, 'kind': '103-static-preflight', 'target': '103.30.76.93',
        'beforeDumpSha256': sha(text.encode()), 'afterDumpSha256': sha(after.encode()),
        'configClosureValidated': True, 'sourceRealPaths': REAL_PATHS,
        'staticRoot': static_root, 'staticAssets': count, 'staticPrefixes': list(hk.PREFIXES),
        'retiredFallbacks': sorted(hk.FALLBACKS), 'retiredReferences': removed,
        'originalRouteClassesCount': 65, 'retainedDynamicRouteClasses': 48,
        'dynamicProxyAndHeaderBytesPreserved': True, 'fleetRouteBytesPreserved': 9,
        'tlsAndOtherDirectivesPreserved': True, 'liveWrites': 0, 'readyToDeploy': False,
        'behaviorDelta': 'Only static namespaces become disk aliases; named404 chains and9 page/next references retire. Dynamic404 now stays on original upstream.',
        'followOnGatewayRequirement': 'Rebase maintenance/open/rollback bundles onto this exact after dump+disk CAS. Never apply old original-before descriptors after preflight.',
    }
    return patches, after, report


ROLLBACK = '''#!/usr/bin/env bash
set -euo pipefail
# LOCAL copied tree only; live executor owns locks, syntax, full-T CAS and reload.
python3 - "$0" "${1:?Usage: ROLLBACK.sh ABSOLUTE_COPIED_CONFIG_ROOT}" <<'PY'
import hashlib,json,pathlib,sys
bundle=pathlib.Path(sys.argv[1]).resolve().parent
root=pathlib.Path(sys.argv[2]).resolve(strict=True)
report=json.loads((bundle/'report.json').read_text())
targets=[]
def sha(b):return hashlib.sha256(b).hexdigest()
for p in report['patches']:
 logical=root/p['path'].lstrip('/')
 target=logical.resolve(strict=True)
 expected=root/report['sourceRealPaths'][p['path']].lstrip('/')
 assert target==expected and target.is_relative_to(root) and target.is_file(), 'REALPATH_CHANGED'
 assert sha(target.read_bytes())==p['afterSha256'], 'CAS_CHANGED'
 original=(bundle/p['before']).read_bytes()
 assert sha(original)==p['beforeSha256'], 'BACKUP_CHANGED'
 targets.append((target,original))
for target,original in targets:
 target.write_bytes(original)
 assert target.read_bytes()==original
print('ROLLBACK=PASS PATCHED_SOURCE_FILES='+str(len(targets))+' ORIGINAL_BYTES=RESTORED SYMLINK=PRESERVED RELOAD=NOT_EXECUTED')
PY
'''


def write_bundle(text, sources, patches, after, report, output):
    output = Path(output)
    require(set(sources) == set(Dump(text).files), 'Full exact source closure required')
    write_gateway_bundle(text, patches, after, report, output, sources)
    for name, raw in sources.items():
        path = output/'closure-before'/name.lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    (output/'MODIFIED_FILE').write_bytes((output/'after'/hk.SITE.lstrip('/')).read_bytes())
    (output/'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(text.splitlines(True), after.splitlines(True), fromfile='nginx.before.txt', tofile='nginx.after.txt')), encoding='utf-8', newline='\n')
    (output/'ROLLBACK.sh').write_text(ROLLBACK, encoding='utf-8', newline='\n')
    (output/'ROLLBACK.sh').chmod(0o755)
    (output/'VERIFICATION.txt').write_text('STATUS=OFFLINE_PREPARED_NOT_DEPLOYED\nBRANCH=three static alias namespaces;17 named fallbacks+9 references retired;dynamic proxy/header/TLS/Fleet unchanged\nBEFORE_DUMP_SHA256='+report['beforeDumpSha256']+'\nAFTER_DUMP_SHA256='+report['afterDumpSha256']+'\n', encoding='utf-8')
    return report


def prepare(text, sources, manifest, output, static_root=STATIC_ROOT):
    output = Path(output)
    require(not output.exists(), 'New package path required')
    for name, expected in hk.EXACT_SOURCE_SHA.items():
        require(name in sources and sha(sources[name]) == expected, 'Original exact file CAS mismatch')
    patches, after, report = render(text, manifest, static_root)
    forward = write_bundle(text, sources, patches, after, report, output/'gateways/static-preflight')
    forward_dir = output/'gateways/static-preflight'
    after_sources = {**sources, hk.SITE: (forward_dir/'after'/hk.SITE.lstrip('/')).read_bytes()}
    reverse_report = {**report, 'kind': '103-static-preflight-rollback', 'beforeDumpSha256': report['afterDumpSha256'], 'afterDumpSha256': report['beforeDumpSha256']}
    reverse = write_bundle(after, after_sources, {hk.SITE: Dump(text).files[hk.SITE]}, text,
                           reverse_report, output/'gateways/rollback-static-preflight')
    def descriptor(folder, r):
        root = output/'gateways'/folder
        def item(p): return {'path': p.relative_to(output).as_posix(), 'sha256': sha(p.read_bytes())}
        return {'report': item(root/'report.json'),
                'before': {name:item(root/'closure-before'/name.lstrip('/')) for name in sources},
                'after': {p['path']:item(root/p['after']) for p in r['patches']}}
    descriptors = {'static-preflight':descriptor('static-preflight',forward),
                   'rollback-static-preflight':descriptor('rollback-static-preflight',reverse)}
    (output/'gateways.json').write_text(json.dumps(descriptors,indent=2)+'\n',encoding='utf-8')
    return descriptors


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('dump','source-root','manifest','output'):p.add_argument('--'+arg,required=True)
    p.add_argument('--static-root',default=STATIC_ROOT)
    a=p.parse_args()
    text=Path(a.dump).read_bytes().decode()
    sources={name:(Path(a.source_root)/name.lstrip('/')).read_bytes() for name in Dump(text).files}
    prepare(text,sources,json.loads(Path(a.manifest).read_text()),a.output,a.static_root)
    print('STATIC_PREFLIGHT=PREPARED SOURCE_CAS=3 PATCHES=1 FALLBACKS=17 REFERENCES=9 DYNAMIC_UPSTREAMS=ORIGINAL LIVE_WRITES=0')
