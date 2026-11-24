#!/usr/bin/env python3
"""Fixed GitHub image records and preparation; never changes live services or data."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tarfile

REPO = 'JesstLe/naumi'
IMAGE = 'ghcr.io/jesstle/naumi'
ORDER = ('ui', 'desktop', 'enterprise')
FLAVORS = set(ORDER)


def require(value, message):
    if not value:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON field: ' + key)
        result[key] = value
    return result


def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding='utf-8-sig'), object_pairs_hook=unique_object)


def write_json(path, value):
    pathlib.Path(path).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def sha256(path):
    digest = hashlib.sha256()
    with pathlib.Path(path).open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def commit(value):
    require(isinstance(value, str) and re.fullmatch('[0-9a-f]{40}', value), 'Expected full lowercase source SHA')
    return value


def validate(record, expected=None, flavors=None):
    require(type(record.get('schemaVersion')) is int and record['schemaVersion'] == 1, 'Unsupported image manifest schema')
    source = commit(record.get('sourceCommit'))
    require(expected is None or source == commit(expected), 'Source does not match explicitly selected commit')
    require(type(record.get('buildVersion')) is int and record['buildVersion'] > 0, 'Invalid build version')
    require(record.get('platform') == 'linux/amd64', 'Only linux/amd64 is supported')
    require(record.get('mediaVariants') is True, '103 requires the existing media-variant build configuration')
    provenance = record.get('provenance', {})
    require(provenance.get('repository') == REPO, 'Unexpected repository')
    commit(provenance.get('workflowCommit'))
    require(all(re.fullmatch('[1-9][0-9]*', str(provenance.get(key, ''))) for key in ['runId', 'attempt']), 'Invalid workflow identity')
    images = record.get('images', {})
    require(isinstance(images, dict) and bool(images) and set(images) <= FLAVORS, 'Invalid image flavors')
    require(flavors is None or set(images) == set(flavors), 'Required image flavors are missing or unexpected')
    for flavor, row in images.items():
        digest = row.get('digest', '')
        require(re.fullmatch('sha256:[0-9a-f]{64}', digest), 'Invalid image digest')
        require(row.get('reference') == IMAGE + '@' + digest, 'Registry or immutable reference mismatch')
        tag = IMAGE + ':' + source + ('' if flavor == 'ui' else '-' + flavor)
        require(row.get('tag') == tag, 'Tag does not match source and flavor')
        require(re.fullmatch('sha256:[0-9a-f]{64}', row.get('imageId', '')), 'Missing fixed runtime image ID')
        offline = row.get('offline')
        if offline is not None:
            require(offline.get('name') == 'naumi-' + flavor + '-' + source + '.tar.gz', 'Unexpected offline package path')
            require(re.fullmatch('[0-9a-f]{64}', offline.get('sha256', '')), 'Invalid offline package checksum')
            require(type(offline.get('bytes')) is int and 0 < offline['bytes'] < 2 * 1024**3, 'Offline package exceeds Release asset limit')
    return record


def archive_image_ids(path, row):
    """Bind the exact saved tag's config, platform manifest and nested OCI index."""
    with tarfile.open(path, 'r:gz') as archive:
        matches=[x for x in json.load(archive.extractfile('manifest.json')) if row['tag'] in (x.get('RepoTags') or [])]
        require(len(matches)==1,'Selected archive tag must be unique')
        selected=matches[0];config_path=selected['Config'];config_bytes=archive.extractfile(config_path).read()
        config_id='sha256:'+hashlib.sha256(config_bytes).hexdigest()
        require(config_path in ['blobs/sha256/'+config_id[7:],config_id[7:]+'.json'],'Config content digest mismatch')
        config=json.loads(config_bytes);require(config.get('os')=='linux' and config.get('architecture')=='amd64','Wrong platform config')
        identities={config_id}
        def visit(desc,depth=0):
            require(depth<4 and re.fullmatch('sha256:[a-f0-9]{64}',desc.get('digest','')),'Invalid OCI graph')
            digest=desc['digest'];raw=archive.extractfile('blobs/sha256/'+digest[7:]).read()
            require('sha256:'+hashlib.sha256(raw).hexdigest()==digest and len(raw)==desc['size'],'OCI descriptor bytes mismatch')
            node=json.loads(raw)
            if node.get('config',{}).get('digest')==config_id:
                require(desc.get('platform') in [None,{'architecture':'amd64','os':'linux'}],'Wrong platform descriptor')
                require([x['digest'][7:] for x in node['layers']]==[x.split('/')[-1] for x in selected['Layers']],'Selected layer graph mismatch')
                identities.add(digest);return True
            if 'manifests' in node:
                platforms=[x for x in node['manifests'] if x.get('platform')=={'architecture':'amd64','os':'linux'}]
                require(len(platforms)==1,'Ambiguous Linux amd64 manifest')
                if visit(platforms[0],depth+1):identities.add(digest);return True
            return False
        try:index=json.load(archive.extractfile('index.json'))
        except KeyError:index={'manifests':[]}
        for descriptor in index.get('manifests',[]):visit(descriptor)
        require(row['imageId'] in identities,'Source image ID does not bind to verified archive graph')
        return identities


def verify_image(image, record, flavor, archive_ids=None, pulled=False):
    row = record['images'][flavor]
    if pulled:
        require(row['reference'] in (image.get('RepoDigests') or []), 'Pulled image does not retain selected immutable registry digest')
    else:
        require(image.get('Id') in (archive_ids or {row['imageId']}), 'Loaded image differs from verified config/manifest IDs')
    require(image.get('Os') == 'linux' and image.get('Architecture') == 'amd64', 'Wrong runtime platform')
    env = dict(value.split('=', 1) for value in image['Config'].get('Env', []))
    labels = image['Config'].get('Labels') or {}
    require(env.get('SOURCE_COMMIT') == record['sourceCommit'], 'Runtime source mismatch')
    require(env.get('BUILD_VERSION') == str(record['buildVersion']), 'Runtime build version mismatch')
    require(labels.get('org.opencontainers.image.revision') == record['sourceCommit'], 'Revision label mismatch')
    require(labels.get('io.naumi.build.flavor') == flavor, 'Desktop/enterprise flavor mismatch')


def part(args):
    image = read_json(args.inspect)[0]
    source = commit(args.sha)
    tag = IMAGE + ':' + source + ('' if args.flavor == 'ui' else '-' + args.flavor)
    row = {'reference': IMAGE + '@' + args.digest, 'digest': args.digest, 'tag': tag, 'imageId': image['Id']}
    if args.offline:
        path = pathlib.Path(args.offline)
        row['offline'] = {'name': path.name, 'sha256': sha256(path), 'bytes': path.stat().st_size}
        archive_image_ids(path, row)
    record = {'schemaVersion': 1, 'sourceCommit': source, 'buildVersion': args.version,
              'platform': 'linux/amd64', 'mediaVariants': True, 'images': {args.flavor: row},
              'provenance': {'repository': REPO, 'workflowCommit': commit(args.workflow_sha), 'runId': args.run_id, 'attempt': args.attempt}}
    validate(record, source, [args.flavor])
    verify_image(image, record, args.flavor)
    write_json(args.output, record)


def merge(args):
    records = [validate(read_json(path)) for path in sorted(pathlib.Path(args.directory).glob('image-*.json'))]
    require(bool(records), 'No completed image records')
    merged = dict(records[0], images={})
    for record in records:
        require({k: v for k, v in record.items() if k != 'images'} == {k: v for k, v in merged.items() if k != 'images'}, 'Mixed source/build/run records')
        require(not(set(merged['images']) & set(record['images'])), 'Duplicate image flavor')
        merged['images'].update(record['images'])
    validate(merged, flavors=json.loads(args.flavors))
    merged['images'] = {flavor: merged['images'][flavor] for flavor in ORDER if flavor in merged['images']}
    write_json(args.output, merged)


def checked(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    require(result.returncode == 0, command[0] + ' operation failed (exit ' + str(result.returncode) + '); inspect locally without printing credentials')
    return result.stdout


def fetch(args):
    expected = commit(args.expected_sha)
    require(re.fullmatch('codex-image-' + expected + '-run[1-9][0-9]*-a[1-9][0-9]*', args.tag), 'Release tag does not match selected source')
    info = json.loads(checked(['gh', 'release', 'view', args.tag, '--repo', REPO, '--json', 'isDraft,tagName']))
    require(not info['isDraft'] and info['tagName'] == args.tag, 'Candidate is not completely published')
    destination = pathlib.Path(args.directory).resolve()
    require(not destination.exists() or not any(destination.iterdir()), 'Use a new empty candidate directory')
    destination.mkdir(parents=True, exist_ok=True)
    checked(['gh', 'release', 'download', args.tag, '--repo', REPO, '--pattern', 'release-manifest.json', '--dir', str(destination)])
    record = validate(read_json(destination / 'release-manifest.json'), expected, args.flavors.split(','))
    provenance = record['provenance']
    require(args.tag.endswith('-run' + str(provenance['runId']) + '-a' + str(provenance['attempt'])), 'Release/run mismatch')
    run = json.loads(checked(['gh', 'run', 'view', str(provenance['runId']), '--repo', REPO, '--json', 'status,conclusion,headSha,workflowName,attempt']))
    require(run['status'] == 'completed' and run['conclusion'] == 'success' and run['workflowName'] == 'Build & push Docker image', 'Image workflow did not succeed')
    require(run['headSha'] == provenance['workflowCommit'] and run['attempt'] == int(provenance['attempt']), 'Workflow provenance mismatch')
    if args.offline:
        for row in record['images'].values():
            require('offline' in row, 'This release has no offline bundle; dispatch offline_bundle=true')
            bundle = row['offline']
            checked(['gh', 'release', 'download', args.tag, '--repo', REPO, '--pattern', bundle['name'], '--dir', str(destination)])
            require((destination / bundle['name']).stat().st_size == bundle['bytes'] and sha256(destination / bundle['name']) == bundle['sha256'], 'Downloaded package checksum mismatch')
    print('GITHUB_CANDIDATE_DOWNLOADED source=' + expected + ' flavors=' + ','.join(record['images']))


def prepare(args):
    record = validate(read_json(args.manifest), args.expected_sha, args.flavors.split(','))
    destination = pathlib.Path(args.directory).resolve()
    require(not destination.exists() or not any(destination.iterdir()), 'Use a new empty preparation directory')
    parent = destination.parent
    require(parent.exists() and shutil.disk_usage(parent).free > 10 * 1024**3, 'Preparation requires more than 10GiB free')
    # Validate every offline checksum before importing any image.
    archive_ids = {}
    if args.offline_directory:
        base = pathlib.Path(args.offline_directory).resolve()
        for row in record['images'].values():
            require('offline' in row, 'Missing requested offline package')
            path = base / row['offline']['name']
            require(not path.is_symlink() and path.is_file(), 'Missing regular offline package')
            require(path.stat().st_size == row['offline']['bytes'] and sha256(path) == row['offline']['sha256'], 'Offline checksum mismatch; import refused')
        for row in record['images'].values():
            archive_ids[row['tag']] = archive_image_ids(base / row['offline']['name'], row)
    destination.mkdir(exist_ok=True)
    releases = []
    for flavor in ORDER:
        if flavor not in record['images']:
            continue
        row = record['images'][flavor]
        image = None
        if args.offline_directory:
            reference = row['tag']
            try:
                image = json.loads(checked(['docker', 'image', 'inspect', reference]))[0]
                verify_image(image, record, flavor, archive_ids[row['tag']])
            except ValueError:
                image = None
                checked(['docker', 'load', '-i', str(base / row['offline']['name'])])
        else:
            checked(['docker', 'pull', row['reference']])
            reference = row['reference']
        if image is None:
            image = json.loads(checked(['docker', 'image', 'inspect', reference]))[0]
        verify_image(image, record, flavor, archive_ids.get(row['tag']), pulled=not args.offline_directory)
        releases.append({'kind': flavor, 'sha': record['sourceCommit'], 'image': image['Id']})
    # Existing slot controllers accept this archive + release.json contract.
    with (destination / 'release-images.tar').open('wb') as file:
        subprocess.run(['docker', 'save', *[row['image'] for row in releases]], stdout=file, check=True)
    write_json(destination / 'release.json', releases)
    write_json(destination / 'release-manifest.json', record)
    (destination / 'IMAGES_READY').write_text('Verified fixed images only; no live service/config/database changes\n')
    print('FIXED_IMAGES_PREPARED source=' + record['sourceCommit'] + ' LIVE_DEPLOYMENT=NOT_STARTED')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('part')
    for name in ['output', 'sha', 'digest', 'inspect', 'run-id', 'attempt', 'workflow-sha']:
        create.add_argument('--' + name, required=True)
    create.add_argument('--version', type=int, required=True)
    create.add_argument('--flavor', choices=sorted(FLAVORS), required=True)
    create.add_argument('--offline')
    combine = commands.add_parser('merge')
    for name in ['directory', 'output', 'flavors']:
        combine.add_argument('--' + name, required=True)
    check = commands.add_parser('validate')
    check.add_argument('--manifest', required=True)
    check.add_argument('--expected-sha', required=True)
    check.add_argument('--flavors', default='ui,desktop,enterprise')
    for command in ['fetch', 'prepare']:
        sub = commands.add_parser(command)
        sub.add_argument('--directory', required=True)
        sub.add_argument('--expected-sha', required=True)
        sub.add_argument('--flavors', default='ui,desktop,enterprise')
        if command == 'fetch':
            sub.add_argument('--tag', required=True)
            sub.add_argument('--offline', action='store_true')
        else:
            sub.add_argument('--manifest', required=True)
            sub.add_argument('--offline-directory')
    args = parser.parse_args()
    if args.command == 'validate':
        validate(read_json(args.manifest), args.expected_sha, args.flavors.split(','))
        print('MANIFEST=VALID FIXED_SOURCE_DIGEST_PLATFORM_FLAVORS')
    else:
        {'part': part, 'merge': merge, 'fetch': fetch, 'prepare': prepare}[args.command](args)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, tarfile.TarError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None
