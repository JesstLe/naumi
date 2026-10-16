#!/usr/bin/env python3
"""Offline, fail-closed 47 gateway/static preparation. Never reloads or contacts a host.

Input is a complete ``nginx -T`` stdout capture, not grep output. Returned patches
preserve unrelated bytes and must be installed by the lock-owning executor with
beforeSha256 CAS, isolated nginx -t, graceful reload and real business acceptance.
Static retention alone is deliberately NOT old-client protocol acceptance.
"""
from __future__ import annotations

import argparse
import base64
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass


class CompatError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise CompatError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


@dataclass
class Token:
    raw: str
    value: str
    start: int
    end: int


@dataclass
class Directive:
    tokens: list[Token]
    children: list['Directive'] | None
    start: int
    end: int
    closing: int | None = None

    @property
    def name(self):
        return self.tokens[0].value

    @property
    def args(self):
        return [token.value for token in self.tokens[1:]]


def lex(text):
    """Nginx quotes/comments/escapes; preserve offsets for surgical edits."""
    result = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        if text[i] == '#':
            newline = text.find('\n', i)
            i = len(text) if newline < 0 else newline + 1
            continue
        start = i
        if text[i] in '{};':
            result.append(Token(text[i], text[i], i, i + 1)); i += 1
            continue
        value, quote = '', None
        while i < len(text):
            char = text[i]
            if char == '\\':
                require(i + 1 < len(text), 'Trailing escape')
                following = text[i + 1]
                value += following if following in '\\"\' \t\n;{}#' else char + following
                i += 2
            elif quote:
                if char == quote:
                    quote = None; i += 1
                else:
                    value += char; i += 1
            elif char in "\"'":
                quote = char; i += 1
            elif char.isspace() or char in '{};#':
                # ${variable} is legal nginx syntax, not a block.
                if char == '{' and value.endswith('$'):
                    end = text.find('}', i)
                    require(end > i, 'Unclosed variable')
                    value += text[i:end + 1]; i = end + 1
                else:
                    break
            else:
                value += char; i += 1
        require(quote is None and i > start, 'Unclosed quoted token')
        result.append(Token(text[start:i], value, start, i))
    return result


def parse(text):
    tokens, index = lex(text), 0

    def block(nested=False):
        nonlocal index
        nodes, pending = [], []
        while index < len(tokens):
            token = tokens[index]; index += 1
            if token.raw == '}':
                require(nested and not pending, 'Unexpected closing brace')
                return nodes, token
            if token.raw in (';', '{'):
                require(pending, 'Empty directive')
                if token.raw == '{':
                    children, closing = block(True)
                    nodes.append(Directive(pending, children, pending[0].start, closing.end, closing.start))
                else:
                    nodes.append(Directive(pending, None, pending[0].start, token.end))
                pending = []
            else:
                pending.append(token)
        require(not nested and not pending, 'Unclosed block or unterminated directive')
        return nodes, None

    return block()[0]


def walk(nodes):
    for node in nodes:
        yield node
        if node.children is not None:
            yield from walk(node.children)


def quote(value):
    require('\n' not in value and '\r' not in value and '\x00' not in value, 'Invalid nginx value')
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


class Dump:
    def __init__(self, text):
        self.text = text
        headers = list(re.finditer(r'^# configuration file (/[^\r\n:]+):\r?\n', text, re.M))
        require(headers and not text[:headers[0].start()].strip(), 'Complete nginx -T stdout required')
        self.files, self.nodes, self.sections = {}, {}, []
        for index, header in enumerate(headers):
            name = header.group(1)
            require('..' not in PurePosixPath(name).parts and '\\' not in name, 'Invalid dump path')
            start, end = header.end(), headers[index + 1].start() if index + 1 < len(headers) else len(text)
            body = text[start:end]
            require(name not in self.files, 'Duplicate dump section: ' + name)
            self.files[name], self.nodes[name] = body, parse(body)
            self.sections.append((name, start, end))
        self.root = headers[0].group(1)
        root_nodes = self.nodes[self.root]
        require(len([n for n in root_nodes if n.name == 'http']) == 1, 'Expected complete main config with one http block')
        self.prefix = str(PurePosixPath(self.root).parent)
        self.reachable = set()
        list(self.expand(self.root))
        require(self.reachable == set(self.files), 'Unreachable dump section; include closure incomplete')

    def include_files(self, pattern):
        require('$' not in pattern, 'Dynamic include is unsupported')
        absolute = pattern if pattern.startswith('/') else self.prefix + '/' + pattern
        require('..' not in PurePosixPath(absolute).parts, 'Include traversal')
        # libc glob's '*' never crosses '/'; fnmatch on a whole path does.
        pattern_parts = PurePosixPath(absolute).parts
        matches = sorted(path for path in self.files if len(PurePosixPath(path).parts) == len(pattern_parts) and all(fnmatch.fnmatchcase(part, pattern) for part, pattern in zip(PurePosixPath(path).parts, pattern_parts)))
        require(matches or any(char in absolute for char in '*?['), 'Missing include: ' + absolute)
        return matches

    def expand(self, name, nodes=None, chain=()):
        require(name not in chain, 'Cyclic include: ' + name)
        self.reachable.add(name)
        for node in self.nodes[name] if nodes is None else nodes:
            if node.name == 'include':
                require(node.children is None and len(node.args) == 1, 'Invalid include')
                for child in self.include_files(node.args[0]):
                    yield from self.expand(child, chain=chain + (name,))
            else:
                yield name, node
                if node.children is not None:
                    yield from self.expand(name, node.children, chain)

    def render(self, patches):
        text = self.text
        for name, start, end in reversed(self.sections):
            if name in patches:
                text = text[:start] + patches[name] + text[end:]
        return text


def origin(value):
    require(bool(re.fullmatch(r'http://127\.0\.0\.1:([1-9][0-9]{0,4})', value)), 'Only explicit loopback HTTP origins accepted')
    require(int(value.rsplit(':', 1)[1]) <= 65535, 'Invalid port')
    return value


def public_url(value):
    require(value.startswith('/_next/static/') and not any(char in value for char in '%?#\\\x00\r\n\t '), 'Only canonical Next static URLs accepted')
    require(all(part not in ('.', '..', '') for part in value[1:].split('/')), 'Invalid static URL')
    return value


def collect_assets(sources, aliases=()):
    """Every source is (label, .next/static directory); aliases are (url, file)."""
    entries = {}

    def add(url, path, label):
        public_url(url)
        require(path.is_file() and not path.is_symlink(), 'Static source must be a regular non-symlink file')
        size, digest = path.stat().st_size, file_sha(path)
        if url in entries:
            require(entries[url]['sha256'] == digest and entries[url]['size'] == size, 'STATIC_URL_CONFLICT: ' + url)
            entries[url]['sources'].append(label)
        else:
            entries[url] = {'url': url, 'sha256': digest, 'size': size, 'source': str(path.resolve()), 'sources': [label]}

    for label, root in sources:
        root = Path(root)
        require(root.is_dir() and not root.is_symlink(), 'Static root must be a non-symlink directory')
        count = 0
        for base, directories, files in os.walk(root, followlinks=False):
            require(not any((Path(base) / directory).is_symlink() for directory in directories), 'Symlink directory in static tree')
            for filename in sorted(files):
                path = Path(base) / filename
                add('/_next/static/' + path.relative_to(root).as_posix(), path, label)
                count += 1
                require(count <= 100000, 'Static inventory file limit exceeded')
        require(count, 'Empty static inventory: ' + label)
    for url, file in aliases:
        add(url, Path(file), 'alias')
    require(entries, 'No static assets')
    return {'schemaVersion': 1, 'kind': 'next-static-union', 'assets': [entries[key] for key in sorted(entries)], 'protocolCompatibility': 'NOT_VERIFIED'}


def materialize_assets(manifest, output):
    output = Path(output)
    require(not output.exists(), 'New distinct static output directory required')
    seen = set()
    for entry in manifest['assets']:
        public_url(entry['url'])
        require(entry['url'] not in seen, 'Duplicate manifest URL'); seen.add(entry['url'])
        require(bool(re.fullmatch('[a-f0-9]{64}', entry['sha256'])) and type(entry['size']) is int and entry['size'] >= 0, 'Invalid static metadata')
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='compat-assets-', dir=output.parent))
    try:
        for entry in manifest['assets']:
            public_url(entry['url'])
            source = Path(entry['source'])
            require(source.is_file() and not source.is_symlink(), 'Static source changed type')
            destination = temp / entry['url'].lstrip('/')
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            require(destination.stat().st_size == entry['size'] and file_sha(destination) == entry['sha256'], 'Static source changed during copy')
            destination.chmod(0o644)
        (temp / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        verify_assets(manifest, temp)
        temp.rename(output)
    finally:
        if temp.exists():
            shutil.rmtree(temp)


def verify_assets(manifest, root):
    require(manifest.get('schemaVersion') == 1 and manifest.get('kind') == 'next-static-union', 'Invalid asset manifest')
    root, seen = Path(root), set()
    for entry in manifest['assets']:
        url = public_url(entry['url'])
        require(url not in seen, 'Duplicate manifest URL'); seen.add(url)
        path = root / url.lstrip('/')
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root.resolve()) and not any(parent.is_symlink() for parent in path.parents if parent != root.parent), 'Missing or redirected static asset: ' + url)
        require(path.stat().st_size == entry['size'] and file_sha(path) == entry['sha256'], 'Static bytes changed: ' + url)
    return len(seen)


def alias_inventory(dump):
    result = []
    for name in dump.files:
        for node in walk(dump.nodes[name]):
            if node.name != 'location' or node.children is None:
                continue
            aliases = [child for child in node.children if child.name == 'alias']
            if not aliases:
                continue
            if node.args[:1] != ['='] or len(node.args) != 2 or not node.args[1].startswith('/_next/static/'):
                continue
            require(len(aliases) == 1 and len(aliases[0].args) == 1, 'Ambiguous static alias')
            path = aliases[0].args[0]
            require(path.startswith('/') and '$' not in path, 'Static alias must be an absolute file')
            result.append({'url': public_url(node.args[1]), 'path': path, 'configFile': name})
    return result


def render_gateway(text, site_path, candidate, old_origins, static_root, manifest):
    dump, candidate = Dump(text), origin(candidate)
    old_origins = {origin(value) for value in old_origins}
    require(old_origins and candidate not in old_origins and 'http://127.0.0.1:17847' not in old_origins, 'Explicit distinct Naumi origins required; 17847 is protected')
    require(site_path in dump.files, 'Target site missing from nginx -T')
    require(static_root.startswith('/') and not any(c in static_root for c in '$\r\n;{}\\') and '..' not in PurePosixPath(static_root).parts, 'Invalid static union root')
    require(manifest.get('kind') == 'next-static-union' and manifest.get('schemaVersion') == 1, 'Verified static manifest required')
    assets = {entry['url']: entry for entry in manifest['assets']}
    aliases = alias_inventory(dump)
    require(all(item['url'] in assets for item in aliases), 'Immutable alias not included in static inventory')
    site_expanded = list(dump.expand(site_path))
    servers = [(name, node) for name, node in site_expanded if node.name == 'server']
    targets = []
    for name, server in servers:
        names = [child.args for child in server.children if child.name == 'server_name']
        if any('47.105.59.142' in nameset for nameset in names):
            require(names == [['47.105.59.142']], 'Unexpected shared target server_name')
            require(name == site_path, 'Target server split into include; explicit site owner required')
            targets.append(server)
    require(targets, 'Target 47 server missing')
    tls = [server for server in targets if any(child.name == 'listen' and 'ssl' in child.args for child in server.children)]
    require(len(tls) == 1, 'Exactly one target TLS server required')
    maps = [(name, node) for name, node in dump.expand(dump.root) if node.name == 'map']
    mapped = {}
    for name, node in maps:
        if node.args and node.args[-1].startswith('$naumi47_'):
            key = node.args[-1]
            require(key not in mapped, 'Duplicate compatibility map: ' + key)
            mapped[key] = (name, node)
    for required in ('$naumi47_compat_api', '$naumi47_compat_page', '$naumi47_auth_login_backend'):
        require(required in mapped, 'Required dynamic compatibility map missing: ' + required)
    edits, rewritten, removed = {}, [], []

    def edit(name, start, end, replacement):
        edits.setdefault(name, []).append((start, end, replacement))

    def rewrite_nodes(name, nodes, inside_map=False):
        for node in nodes:
            if node.name == 'include':
                for included in dump.include_files(node.args[0]):
                    rewrite_nodes(included, dump.nodes[included], inside_map)
                continue
            if node.name == 'location' and node.args == ['=', '/canvas'] and node.children:
                filters = [child for child in node.children if child.name == 'sub_filter']
                if filters:
                    require(len(filters) == 1 and len(filters[0].args) == 2 and all(re.fullmatch(r'[0-9]+-[a-f0-9]+\.js', item) for item in filters[0].args), 'Unknown canvas override; manual review required')
                    require('/_next/static/chunks/' + filters[0].args[1] in assets, 'Canvas override alias bytes not retained')
                    allowed = {'proxy_pass', 'proxy_http_version', 'proxy_set_header', 'proxy_buffering', 'proxy_read_timeout', 'proxy_send_timeout', 'sub_filter', 'sub_filter_once', 'sub_filter_types', 'add_header'}
                    require(all(child.name in allowed and child.children is None for child in node.children), 'Unknown canvas override directives')
                    proxies = [child.args for child in node.children if child.name == 'proxy_pass']
                    require(len(proxies) == 1 and len(proxies[0]) == 1 and proxies[0][0] in old_origins, 'Unknown canvas override backend')
                    require(any(child.name == 'add_header' and child.args[:1] == ['X-Naumi-Canvas-Credits'] for child in node.children), 'Canvas override fingerprint missing')
                    edit(name, node.start, node.end, '# Retired exact canvas HTML/RSC sub_filter overlay; immutable alias retained.')
                    removed.append({'file': name, 'location': '= /canvas'})
                    continue
            if node.name == 'proxy_pass':
                require(len(node.args) == 1, 'Invalid proxy_pass')
                value = node.args[0]
                if value.startswith('$'):
                    require(bool(re.fullmatch(r'\$naumi47_(compat_api|auth_login_backend)(\$request_uri)?', value)), 'Unclassified dynamic proxy_pass')
                else:
                    require(any(value == base or value.startswith(base + '/') for base in old_origins | {'http://127.0.0.1:17847'}), 'Unclassified proxy backend: ' + value)
            if inside_map:
                for token in node.tokens:
                    if token.value.startswith(('http://', 'https://')):
                        require(token.value in old_origins | {'http://127.0.0.1:17847'}, 'Unclassified compatibility map backend: ' + token.value)
            for index, token in enumerate(node.tokens):
                for old in old_origins:
                    if token.value == old or token.value.startswith(old + '/') or token.value.startswith(old + '$'):
                        require((node.name == 'proxy_pass' and index == 1) or (inside_map and index > 0), 'Unclassified Naumi endpoint: ' + node.name)
                        replacement = candidate + token.value[len(old):]
                        edit(name, token.start, token.end, quote(replacement))
                        rewritten.append({'file': name, 'directive': node.name, 'from': token.value, 'to': replacement})
            if node.children is not None:
                rewrite_nodes(name, node.children, inside_map)

    for server in targets:
        rewrite_nodes(site_path, server.children)
    for key, (name, node) in mapped.items():
        rewrite_nodes(name, node.children, True)
    require(rewritten, 'No known Naumi endpoint changed')
    # A full next/static union needs a namespace route, not only currently requested chunks.
    secure = tls[0]
    require(not any(node.name == 'location' and '/_next/static/' in node.args and node.args[:1] != ['='] for node in secure.children), 'Existing static namespace route needs explicit review')
    inherited_headers = ''.join('\n        ' + dump.files[site_path][node.start:node.end] for node in secure.children if node.name == 'add_header')
    block = '\n    location ^~ /_next/static/ {\n        alias ' + quote(static_root.rstrip('/') + '/_next/static/') + ';\n        add_header Cache-Control "public, max-age=31536000, immutable" always;' + inherited_headers + '\n    }\n'
    edit(site_path, secure.closing, secure.closing, block)
    patches = {}
    for name, changes in edits.items():
        changes.sort(key=lambda value: (value[0], value[1]))
        for left, right in zip(changes, changes[1:]):
            require(left[1] <= right[0], 'Overlapping or duplicate config edits')
        body = dump.files[name]
        for start, end, replacement in reversed(changes):
            body = body[:start] + replacement + body[end:]
        patches[name] = body
    after = dump.render(patches)
    parsed_after = Dump(after)
    for name in parsed_after.files:
        for node in walk(parsed_after.nodes[name]):
            for token in node.tokens:
                require(not any(token.value == old or token.value.startswith(old + '/') or token.value.startswith(old + '$') for old in old_origins), 'Unmapped Naumi endpoint remains in full config closure')
    require(alias_inventory(parsed_after) == aliases, 'Immutable alias mapping changed')
    # Retain every protected legacy endpoint token, including map results and named locations.
    endpoint_count = lambda source: sum(token.value.startswith('http://127.0.0.1:17847') for nodes in source.nodes.values() for node in walk(nodes) for token in node.tokens)
    require(endpoint_count(dump) == endpoint_count(parsed_after) and endpoint_count(dump) > 0, 'Legacy 17847 references changed or absent')
    return patches, after, {'schemaVersion': 1, 'kind': 'naumi47-client-compat', 'beforeDumpSha256': sha(text.encode()), 'afterDumpSha256': sha(after.encode()), 'candidateOrigin': candidate, 'oldNaumiOrigins': sorted(old_origins), 'configClosureValidated': True, 'changedEndpoints': rewritten, 'removedOverrides': removed, 'retainedAliases': aliases, 'legacy17847Preserved': True, 'routes': {key: candidate for key in ('main', 'login', 'canvas', 'reference-workbench', 'router-capacity')}, 'loginLegacyException': 'Existing compat_api/auth_login_backend maps and 17847 branches preserved', 'oldClientComplete': False, 'protocolCompatibility': 'NOT_VERIFIED', 'requiredLiveAcceptance': ['fresh full nginx -T closure', 'all old static/alias real bytes', 'isolated nginx -t candidate and rollback', 'old build canvas save and persisted readback across switch', 'old build RSC module references all resolve', 'actual old/new server action manifests compared; nonempty actions need cross-build execution or authenticated build ownership']}


def write_gateway_bundle(dump_text, patches, after, report, output, source_files):
    """source_files must contain exact disk preimages, not bodies guessed from -T.

    nginx -T appends a separator newline after every file. The report hashes exact
    preimages and removes only that proven separator from generated file bodies.
    """
    output = Path(output)
    require(not output.exists(), 'New distinct gateway output directory required')
    before = Dump(dump_text)
    normalized = {}
    for name, body in patches.items():
        require(name in source_files and isinstance(source_files[name], bytes), 'Exact source config bytes required: ' + name)
        raw = source_files[name].decode('utf-8')
        capture = before.files[name]
        require(capture == raw or capture == raw + '\n', 'Dump/source preimage mismatch: ' + name)
        normalized[name] = body[:-1] if capture == raw + '\n' else body
    output.mkdir(parents=True)
    report['patches'] = []
    for name, body in sorted(normalized.items()):
        relative = name.lstrip('/')
        for folder, content in [('before', source_files[name]), ('after', body.encode())]:
            target = output / folder / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        report['patches'].append({'path': name, 'beforeSha256': sha(source_files[name]), 'afterSha256': sha(body.encode()), 'before': 'before/' + relative, 'after': 'after/' + relative})
    report['baselineFileCasVerified'] = True
    (output / 'nginx.before.txt').write_bytes(dump_text.encode())
    (output / 'nginx.after.txt').write_bytes(after.encode())
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


def compare_builds(old_records, candidate_next):
    """Inspect only required public build metadata. Never emit manifest secrets."""
    paths = ['.next/BUILD_ID', '.next/server/server-reference-manifest.json', '.next/app-build-manifest.json']

    def describe(files):
        build_id = files[paths[0]].decode().strip()
        require(bool(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', build_id)), 'Invalid build id')
        reference = json.loads(files[paths[1]])
        require(isinstance(reference.get('node'), dict) and isinstance(reference.get('edge'), dict), 'Invalid server reference manifest')
        app = json.loads(files[paths[2]])
        require(isinstance(app.get('pages'), dict), 'Invalid app build manifest')
        urls = set()
        for fileset in app['pages'].values():
            require(isinstance(fileset, list), 'Invalid app page files')
            for item in fileset:
                require(isinstance(item, str) and item.startswith('static/'), 'Unexpected app asset prefix')
                urls.add(public_url('/_next/' + item))
        return {'buildId': build_id, 'serverActionCount': len(reference['node']) + len(reference['edge']), 'appPageCount': len(app['pages']), 'appStaticUrls': sorted(urls), 'manifestSha256': {path: sha(files[path]) for path in paths}}

    candidate_next = Path(candidate_next)
    candidate = describe({path: (candidate_next / path.removeprefix('.next/')).read_bytes() for path in paths})
    old = []
    require(isinstance(old_records, list) and old_records, 'Old build records required')
    for item in old_records:
        files = {}
        for line in item['data'].splitlines():
            if not line.startswith('{'):
                continue
            record = json.loads(line)
            if record.get('path') not in paths:
                continue
            require(record['path'] not in files, 'Duplicate old manifest')
            data = base64.b64decode(record['base64'], validate=True)
            require(sha(data) == record['sha256'] and len(data) == record['bytes'], 'Old manifest hash/size mismatch')
            files[record['path']] = data
        require(set(files) == set(paths), 'Required old build manifests missing')
        old.append({'container': item['container'], **describe(files)})
    no_actions = not candidate['serverActionCount'] and not any(item['serverActionCount'] for item in old)
    return {'schemaVersion': 1, 'kind': 'build-protocol-inventory', 'candidate': candidate, 'oldBuilds': old, 'serverActionStatus': 'NO_SERVER_ACTIONS_IN_BOTH_MANIFESTS' if no_actions else 'CROSS_BUILD_ACTION_EXECUTION_OR_OWNERSHIP_REQUIRED', 'rscStatus': 'NOT_VERIFIED', 'canvasSaveStatus': 'NOT_VERIFIED', 'oldClientComplete': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    assets = commands.add_parser('assets')
    assets.add_argument('--source', action='append', default=[], help='LABEL=directory containing .next/static contents')
    assets.add_argument('--alias', action='append', default=[], help='/_next/static/path=local real file')
    assets.add_argument('--output', required=True)
    verify = commands.add_parser('verify-assets')
    verify.add_argument('--manifest', required=True); verify.add_argument('--root', required=True)
    inspect = commands.add_parser('inspect')
    inspect.add_argument('--dump', required=True)
    builds = commands.add_parser('compare-builds')
    builds.add_argument('--old-manifests', required=True); builds.add_argument('--candidate-next', required=True); builds.add_argument('--output', required=True)
    gateway = commands.add_parser('gateway')
    gateway.add_argument('--dump', required=True); gateway.add_argument('--site', required=True)
    gateway.add_argument('--candidate-origin', required=True); gateway.add_argument('--old-origin', action='append', required=True)
    gateway.add_argument('--static-root', required=True); gateway.add_argument('--manifest', required=True); gateway.add_argument('--output', required=True)
    gateway.add_argument('--source-root', required=True, help='Exact copied nginx file tree; paths relative to /')
    args = parser.parse_args(argv)
    if args.command == 'assets':
        manifest = collect_assets([value.split('=', 1) for value in args.source], [value.split('=', 1) for value in args.alias])
        materialize_assets(manifest, args.output)
        print('STATIC_UNION=PASS ASSETS=' + str(len(manifest['assets'])) + ' PROTOCOL=NOT_VERIFIED')
    elif args.command == 'verify-assets':
        manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
        print('STATIC_BYTES=PASS ASSETS=' + str(verify_assets(manifest, args.root)))
    elif args.command == 'inspect':
        dump = Dump(Path(args.dump).read_bytes().decode('utf-8'))
        print(json.dumps({'fullDumpSha256': sha(dump.text.encode()), 'files': list(dump.files), 'aliases': alias_inventory(dump)}, indent=2))
    elif args.command == 'compare-builds':
        output = Path(args.output)
        require(not output.exists(), 'New build report output required')
        report = compare_builds(json.loads(Path(args.old_manifests).read_text(encoding='utf-8')), args.candidate_next)
        output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print('BUILD_INVENTORY=PASS OLD_BUILDS=' + str(len(report['oldBuilds'])) + ' SERVER_ACTIONS=' + report['serverActionStatus'] + ' RSC=NOT_VERIFIED SAVE=NOT_VERIFIED')
    else:
        text = Path(args.dump).read_bytes().decode('utf-8')
        manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
        patches, after, report = render_gateway(text, args.site, args.candidate_origin, args.old_origin, args.static_root, manifest)
        source_root = Path(args.source_root).resolve()
        source_files = {}
        for name in patches:
            path = source_root / name.lstrip('/')
            require(not path.is_symlink() and path.resolve().is_relative_to(source_root), 'Invalid source config copy')
            source_files[name] = path.read_bytes()
        write_gateway_bundle(text, patches, after, report, args.output, source_files)
        print('GATEWAY_PREPARED=PASS FILES=' + str(len(patches)) + ' LEGACY17847=PRESERVED OLD_CLIENT_COMPLETE=0')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (CompatError, OSError, KeyError, json.JSONDecodeError) as error:
        print('CLIENT_COMPAT_ERROR=' + str(error), file=sys.stderr)
        sys.exit(2)
