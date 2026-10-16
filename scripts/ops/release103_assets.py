#!/usr/bin/env python3
"""Verify/materialize already copied HK static bytes by their actual prefixed URL.

No SSH, Docker, service calls or writes outside a new chosen local output exist.
Input capture includes per-file hashes, gzip hashes and before/after identities.
"""
import argparse
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile

from release_client_compat import require, file_sha


PREFIXES = ('/_next/static/', '/desktop/_next/static/', '/enterprise/_next/static/')


def canonical_url(url):
    require(isinstance(url, str) and url.startswith(PREFIXES), 'Unsupported public static namespace')
    require(not any(part in ('', '.', '..') for part in url[1:].split('/')), 'Noncanonical URL components')
    require(not any(char in url for char in '%?#\\\x00\r\n\t '), 'Ambiguous public URL')
    return url


def verified_union(capture, root):
    root = Path(root).resolve()
    require(capture.get('schemaVersion') == 1 and capture.get('kind') == '103-prefixed-old-static-inventory', 'Invalid HK capture')
    require(capture.get('fleetIncluded') is False, 'Fleet must remain independent')
    entries, conflicts, count, container_count, disk_count = {}, [], 0, 0, 0
    for source in capture['sources']:
        if source['kind'] == 'container-static':
            baseline = source['source']
            name, prefix = baseline['name'], baseline['assetPrefix']
            require(prefix in ('', '/desktop', '/enterprise'), 'Wrong build flavor prefix')
            require(source['before'] == source['after'] and source['before']['running'] is True, 'Container changed while copied')
            require(all(source['before'][key] == baseline[key] for key in ('id', 'image', 'startedAt')), 'Source identity mismatch')
            archive = root / (name + '.tar.gz')
            container_count += 1
        else:
            require(source['kind'] == 'disk-static-root', 'Unknown source kind')
            name, prefix, archive = 'disk-static-root', '', root / 'disk-static-root.tar.gz'
            require(source['fullNginxSha256Before'] == source['fullNginxSha256After'], 'Gateway changed during disk capture')
            disk_count += 1
        require(archive.is_file() and not archive.is_symlink() and archive.stat().st_size == source['archiveBytes'] and file_sha(archive) == source['archiveSha256'], 'Archive checksum mismatch')
        seen = set()
        for item in source['files']:
            relative = item['path']
            require(relative not in seen, 'Duplicate source path'); seen.add(relative)
            require(not PurePosixPath(relative).is_absolute() and '..' not in PurePosixPath(relative).parts and '\\' not in relative, 'Invalid relative source path')
            if source['kind'] == 'container-static':
                require(relative.startswith('.next/static/'), 'Non-static container path')
                url = canonical_url(prefix + '/_next/static/' + relative.removeprefix('.next/static/'))
            else:
                url = canonical_url('/' + relative)
            path = root / name / relative
            require(path.resolve().is_relative_to(root) and path.is_file() and not path.is_symlink(), 'Missing/redirected captured file')
            require(path.stat().st_size == item['size'] and file_sha(path) == item['sha256'], 'File checksum mismatch: ' + url)
            count += 1
            value = {'url': url, 'sha256': item['sha256'], 'size': item['size'], 'source': str(path)}
            if url in entries and (entries[url]['sha256'], entries[url]['size']) != (value['sha256'], value['size']):
                conflicts.append({'url': url, 'first': entries[url], 'second': value})
            else:
                entries.setdefault(url, value)
    require(container_count > 0 and disk_count == 1, 'Container and exact one disk static source required')
    return {'schemaVersion': 1, 'kind': '103-prefixed-static-union', 'assets': [entries[url] for url in sorted(entries)], 'conflicts': conflicts, 'sourceFiles': count, 'containerSources': container_count, 'diskRoots': disk_count, 'fleetIncluded': False, 'protocolCompatibility': 'NOT_VERIFIED'}


def materialize(manifest, output):
    output = Path(output)
    require(not manifest['conflicts'], 'STATIC_URL_CONFLICT: retain both source bytes; do not overwrite')
    require(not output.exists(), 'New distinct local output required')
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='103-static-union-', dir=output.parent))
    for item in manifest['assets']:
        url = canonical_url(item['url'])
        path = stage / url.lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(item['source'], path)
        require(path.stat().st_size == item['size'] and file_sha(path) == item['sha256'], 'Copy source changed')
    public = {**manifest, 'assets': [{key: value for key, value in item.items() if key != 'source'} for item in manifest['assets']]}
    (stage / 'manifest.json').write_text(json.dumps(public, indent=2) + '\n', encoding='utf-8')
    stage.rename(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', required=True)
    parser.add_argument('--root', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--materialize')
    args = parser.parse_args()
    report = Path(args.report)
    require(not report.exists(), 'New report path required')
    union = verified_union(json.loads(Path(args.capture).read_text(encoding='utf-8')), args.root)
    report.write_text(json.dumps(union, indent=2) + '\n', encoding='utf-8')
    require(not union['conflicts'], 'STATIC_URL_CONFLICT; inspect report')
    if args.materialize:
        materialize(union, args.materialize)
    print('HK_STATIC_UNION=PASS SOURCES=' + str(union['containerSources']) + '+DISK1 URLS=' + str(len(union['assets'])) + ' CONFLICTS=0 FLEET=EXCLUDED PROTOCOL=NOT_VERIFIED')
