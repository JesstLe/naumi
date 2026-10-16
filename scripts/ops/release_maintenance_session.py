#!/usr/bin/env python3
"""Single-process, locked, journalled Oct16 maintenance RPC. No SSH or arbitrary shell."""
import argparse
import copy
import datetime as dt
import json
import http.client
import os
import pathlib
import re
import subprocess
import sys
import uuid
import urllib.parse
from types import SimpleNamespace

import release47_controls as controls
import release47_maintenance as maintenance
import release47_task_snapshot as tasks
import worker_handoff
from release47_host import HostTransaction, Hold, environment, public_identity, require, sha, file_sha
from release47_inventory import collect_inventory

ROOT = pathlib.Path('/opt/naumi-staging/releases/release-lifecycle')
TERMINAL = {'COMPLETE', 'ROLLED_BACK'}
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
HASH = re.compile(r'[a-f0-9]{64}')
PHASES = ['NEW', 'BASELINED', 'BACKED_UP', 'MAINTENANCE', 'FROZEN', 'CANDIDATES',
          'ACCEPTED', 'PRESERVED', 'ACTIVE', 'MIGRATED_CLEANUP_PENDING', 'COMPLETE', 'ROLLED_BACK']


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def check_path(name, path):
    parsed = urllib.parse.urlsplit(path)
    require(not parsed.scheme and not parsed.netloc and path.startswith('/') and '\r' not in path and '\n' not in path,
            'CANDIDATE_RELATIVE_URL_REQUIRED')
    routes = {'login': ('/api/auth/session',), 'canvas': ('/api/projects', '/canvas'),
              'private-media': ('/api/media/',), 'old-client': ('/_next/static/', '/desktop/_next/static/', '/enterprise/_next/static/'),
              'skills': ('/api/agent/skills',), 'packaging': ('/api/packaging-strategy', '/creation/'),
              'health': ('/api/health',), 'version': ('/api/version',)}
    require(name in routes and any(parsed.path == prefix or prefix.endswith('/') and parsed.path.startswith(prefix)
                                   for prefix in routes[name]), 'FEATURE_SPECIFIC_NONBILLABLE_GET_REQUIRED')


def assertion_value(assertion, body, status):
    kind = assertion.get('kind')
    if kind == 'status': return status
    if kind == 'bodySha256': return sha(body)
    if kind == 'bodyContains': return assertion['needle'].encode() in body
    if kind == 'json':
        require(isinstance(assertion.get('path'), list) and assertion['path'], 'TYPED_JSON_ASSERTION_REQUIRED')
        value = json.loads(body)
        for field in assertion['path']: value = value[field]
        return value
    raise Hold('CONCRETE_RESPONSE_ASSERTION_REQUIRED')


def load_json(path, limit=16 * 1024 * 1024):
    require(not path.is_symlink() and path.is_file() and path.stat().st_size <= limit,
            'PRIVATE_ARTIFACT_UNREADABLE')
    try:
        return json.loads(path.read_bytes())
    except (ValueError, UnicodeError):
        raise Hold('PRIVATE_JSON_ARTIFACT_INVALID') from None


def relative_artifact(folder, descriptor):
    require(isinstance(descriptor, dict) and set(descriptor) == {'path', 'sha256'} and
            HASH.fullmatch(descriptor.get('sha256', '')), 'HASH_BOUND_ARTIFACT_REQUIRED')
    relative = pathlib.PurePosixPath(descriptor['path'])
    require(not relative.is_absolute() and relative.parts and '..' not in relative.parts and
            '\\' not in descriptor['path'], 'RELATIVE_PRIVATE_ARTIFACT_REQUIRED')
    path = folder.joinpath(*relative.parts)
    require(not any(p.is_symlink() for p in [path, *path.parents] if p != folder.parent) and
            path.resolve().is_relative_to(folder.resolve()) and path.is_file() and
            path.stat().st_size <= 16 * 1024 * 1024 and sha(path.read_bytes()) == descriptor['sha256'],
            'PRIVATE_ARTIFACT_HASH_OR_PATH_CHANGED')
    return path


def valid_plan(plan):
    require(isinstance(plan, dict) and plan.get('schemaVersion') == 1 and
            plan.get('target') in ['47.105.59.142', '103.30.76.93'] and
            re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', plan.get('releaseId', '')) and
            HASH.fullmatch(plan.get('hostIdentitySha256', '')) and
            re.fullmatch('[a-f0-9]{40}', plan.get('commit', '')) and
            re.fullmatch('[0-9]{10,13}', plan.get('buildVersion', '')), 'FIXED_SESSION_PLAN_REQUIRED')
    require(plan.get('authorization', {}).get('target') == plan['target'], 'AUTHORIZATION_TARGET_MISMATCH')
    names = [v.get('variant') for v in plan.get('webs', [])]
    require(names == (['main'] if plan['target'] == '47.105.59.142' else ['main', 'desktop', 'enterprise']),
            'HOST_SPECIFIC_ORDERED_VARIANTS_REQUIRED')
    ports, slots = set(), set()
    for web in plan['webs']:
        require(re.fullmatch('sha256:[a-f0-9]{64}', web.get('image', '')) and
                web.get('assetPrefix') == {'main': '', 'desktop': '/desktop', 'enterprise': '/enterprise'}[web['variant']],
                'COMPILED_VARIANT_IMAGE_REQUIRED')
        require(type(web.get('port')) is int and web['port'] not in ports and web.get('name') not in slots,
                'UNIQUE_CANDIDATE_PORT_AND_NAME_REQUIRED')
        ports.add(web['port']); slots.add(web['name'])
        require(web.get('requiredChecks') and set(web['requiredChecks']) >= {'login', 'canvas', 'private-media', 'old-client'},
                'USER_FUNCTION_ACCEPTANCE_CHECKS_REQUIRED')
    require(plan.get('restoreDatabase') is False and plan.get('replayAcceptedTasks') is False and
            plan.get('legacyCaller') and plan.get('database') and plan.get('baseline'), 'PRESERVATION_SCOPE_REQUIRED')
    if plan['target'] == '103.30.76.93':
        require(plan.get('predecessor47') and HASH.fullmatch(plan['predecessor47'].get('sha256', '')),
                '47_BEFORE_103_RECEIPT_REQUIRED')
    return plan


PROBE = r"""
const [wantedCommit,wantedBuild,wantedPrefix]=process.argv.slice(1);
const fs=await import('node:fs');
const cfg=JSON.parse(fs.readFileSync('/app/.next/required-server-files.json','utf8')).config;
if((cfg.assetPrefix||'')!==wantedPrefix)throw Error('COMPILED_VARIANT_MISMATCH');
const results={};
for(const path of ['/api/health','/api/version']){
const r=await fetch('http://127.0.0.1:3000'+path,{signal:AbortSignal.timeout(10000)});
if(!r.ok)throw Error('PROBE_HTTP_'+r.status);results[path]=await r.json();}
const version=results['/api/version'];
if(version.commit!==wantedCommit||String(version.version)!==wantedBuild)throw Error('PROBE_VERSION_MISMATCH');
console.log(JSON.stringify({health:results['/api/health'],version,assetPrefix:cfg.assetPrefix||''}));
"""


class LiveAdapter:
    """Only these finite operations can reach the host. Steps cannot supply argv."""
    def __init__(self, tx, plan):
        self.tx, self.plan = tx, plan

    def private_save(self, operation):
        def save(name, value):
            raw = value if isinstance(value, bytes) else encoded(value)
            name = operation + '-' + sha(raw)[:16] + '-' + name
            path = self.tx.folder / name
            if path.exists():
                require(not path.is_symlink() and path.read_bytes() == (raw if isinstance(value, bytes) else json.dumps(value, sort_keys=True).encode() + b'\n'),
                        'PRIVATE_CAPTURE_CAS_CHANGED')
                return {'path': str(path), 'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size}
            return self.tx.save(name, value)
        return save

    def inventory(self, operation):
        result = collect_inventory(command=self.tx.run, private_save=self.private_save(operation),
                                   expected_host_sha256=self.plan['hostIdentitySha256'])
        require(result.get('hostIdentityMatches') is True and result.get('dockerInventory', {}).get('complete') is True and
                result.get('nginx', {}).get('stable') is True and not result.get('errors'), 'FRESH_BASELINE_INCOMPLETE')
        for identity in self.plan['baseline']:
            self.tx.pin(identity)
        return result

    def snapshot(self, operation, previous=None):
        result = tasks.collect_task_snapshot(self.tx.run, self.plan['database'], self.private_save(operation), previous=previous)
        return {'public': result.public, 'private': result.private}

    def backup(self, operation, reconcile=False):
        path = self.tx.folder / 'backup-readable.json'
        if reconcile:
            record = load_json(path)
        else:
            record = load_json(pathlib.Path(self.tx.backup_database(self.plan['database'])['path']))
        dump = pathlib.Path(record['path'])
        require(dump.parent == self.tx.folder and dump.is_file() and not dump.is_symlink() and
                dump.stat().st_size == record['bytes'] and file_sha(dump) == record['sha256'] and
                record.get('restoreExecuted') is False, 'READABLE_BACKUP_IDENTITY_CHANGED')
        self.tx.pin(self.plan['database'])
        with dump.open('rb') as stream:
            require(self.tx._command is None, 'LIVE_BACKUP_REOPEN_REQUIRES_REAL_COMMAND')
            result = subprocess.run(['docker', 'exec', '-i', self.plan['database']['id'], 'pg_restore', '--list'],
                                    stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            require(result.returncode == 0, 'BACKUP_REOPEN_FAILED')
            listing = result.stdout
        require(b'TABLE DATA' in listing and sha(listing) == record['listSha256'], 'BACKUP_REOPEN_FAILED')
        return record

    def gateway(self, kind, operation, reconcile=False):
        descriptor = self.plan['gateways'][kind]
        folder = self.tx.folder
        report = load_json(relative_artifact(folder, descriptor['report']))
        before = {name: relative_artifact(folder, item).read_bytes() for name, item in descriptor['before'].items()}
        after = {name: relative_artifact(folder, item).read_bytes() for name, item in descriptor['after'].items()}
        logical = {name: str(pathlib.Path(name).resolve(strict=True)) for name in before}
        current = sha(self.tx.run(['nginx', '-T']))
        if reconcile and current == report['afterDumpSha256']:
            require(all(pathlib.Path(logical[name]).read_bytes() == after.get(name, raw) for name, raw in before.items()),
                    'GATEWAY_RECONCILE_CLOSURE_CHANGED')
            self.tx.run(['nginx', '-t']); self.tx.run(['systemctl', 'reload', 'nginx'])
            return {'afterDumpSha256': current, 'reloadIssued': True, 'result': 'EXPLICIT_SAME_INTENT_RECONCILED'}
        require(current == report['beforeDumpSha256'], 'GATEWAY_BASELINE_CHANGED')
        # The underlying function uses fixed evidence names. Isolate per operation;
        # retain the same HostTransaction and all its locks, never nested transactions.
        original = self.tx.folder
        evidence = original / ('gateway-' + operation + ('-reconcile-' + str(uuid.uuid4()) if reconcile else ''))
        evidence.mkdir(mode=0o700, exist_ok=False)
        try:
            self.tx.folder = evidence
            return controls.switch_gateway_bundle(self.tx, report, before, after,
                         expected_dump_sha=current, logical_to_real=logical)
        finally:
            self.tx.folder = original

    def freeze(self, operation, reconcile=False):
        caller = self.plan['legacyCaller']
        if reconcile and self.tx.pin(caller['identity'])['State'].get('Paused') is True:
            intent = load_json(self.tx.folder / ('legacy-caller-freeze-intent-' + caller['identity']['id'][:12] + '.json'))
            require(intent.get('identity') == caller['identity'] and intent.get('scriptSha256') == caller['scriptSha256'],
                    'AUDITED_ORIGINAL_FREEZE_INTENT_REQUIRED')
            return {'identity': caller['identity'], 'frozen': True, 'coverage': 'legacy-unknown',
                    'activeTicks': None, 'acceptedTasks': None, 'reconciledFromExactIntent': operation}
        return maintenance.freeze_legacy_caller(self.tx, caller['identity'], expected_script_sha256=caller['scriptSha256'])

    def web_create(self, web, operation, reconcile=False):
        if reconcile:
            row = self.tx.inspect(web['name']); env = environment(row)
            receipt = load_json(self.tx.folder / ('candidate-created-' + row['Id'][:12] + '.json'))
            require(row['Image'] == web['image'] and env.get('SOURCE_COMMIT') == self.plan['commit'] and
                    env.get('BUILD_VERSION') == self.plan['buildVersion'] and env.get('NAUMI_INSTANCE_ID') == web['name'] and
                    env.get('NAUMI_VIDEO_WORKER') == '0' and env.get('NAUMI_RELEASE_ADMISSION_START') == 'draining' and
                    receipt == public_identity(row),
                    'UNKNOWN_CREATED_WEB_REQUIRES_PRIVATE_REVIEW')
            return public_identity(row)
        require(web['name'] not in [r.get('name') for r in self.inventory(operation)['containers']], 'CANDIDATE_NAME_ALREADY_EXISTS')
        return self.tx.clone_web(web['source'], name=web['name'], port=web['port'], image=web['image'],
            commit=self.plan['commit'], memory_mib=web['memoryMiB'], cpu=web['cpu'],
            release_secret=self.plan['releaseSecret'], state_dir=web['stateDir'], build_version=self.plan['buildVersion'],
            reviewed_omitted_mounts=web.get('reviewedOmittedMounts'))

    def available(self):
        text = self.tx.run(['cat', '/proc/meminfo']).decode()
        match = re.search(r'^MemAvailable:\s+(\d+)\s+kB$', text, re.M)
        require(match is not None, 'MEMAVAILABLE_UNKNOWN')
        return int(match.group(1)) // 1024

    def web_start(self, web, identity, operation, reconcile=False):
        if reconcile:
            row = self.tx.inspect(identity['id'])
            receipt = load_json(self.tx.folder / ('candidate-start-intent-' + identity['id'][:12] + '.json'))
            require(receipt == identity and row['Image'] == identity['image'] and row['State']['Running'], 'UNKNOWN_WEB_START_NOT_OBSERVED')
            return public_identity(row)
        return self.tx.start_candidate(identity, web['budget'], self.available())

    def verify(self, web, identity, operation):
        self.tx.pin(identity)
        actual = json.loads(self.tx.run(['docker', 'exec', identity['id'], 'node', '--input-type=module', '-e', PROBE,
                                        self.plan['commit'], self.plan['buildVersion'], web['assetPrefix']]))
        status = controls.app_status(self.tx, identity)
        require(actual.get('health', {}).get('db', {}).get('ok') is True, 'CANDIDATE_DATABASE_HEALTH_REQUIRED')
        require(status['admission']['mode'] in ['draining', 'open'], 'CANDIDATE_ADMISSION_UNKNOWN')
        return {'identity': identity, 'app': status, 'probe': actual, 'observedAt': timestamp()}

    def worker_create(self, web, operation, reconcile=False):
        spec = self.plan['worker']
        if reconcile:
            row = self.tx.inspect(spec['name']); env = environment(row)
            receipt = load_json(self.tx.folder / ('worker-created-' + row['Id'][:12] + '.json'))
            require(row['Image'] == web['image'] and env.get('SOURCE_COMMIT') == self.plan['commit'] and
                    env.get('NAUMI_APP_ORIGIN') == 'http://' + web['name'] + ':3000' and
                    env.get('NAUMI_WORKER_START_PAUSED') == '1' and receipt == public_identity(row), 'UNKNOWN_CREATED_WORKER_REQUIRES_PRIVATE_REVIEW')
            return public_identity(row)
        return controls.clone_worker(self.tx, web, name=spec['name'], memory_mib=spec['memoryMiB'],
                                     cpu=spec['cpu'], state_dir=spec['stateDir'])

    def worker_start(self, identity, operation, reconcile=False):
        if reconcile:
            row = self.tx.inspect(identity['id'])
            receipt = load_json(self.tx.folder / ('worker-start-intent-' + identity['id'][:12] + '.json'))
            require(receipt == identity and row['Image'] == identity['image'] and row['State']['Running'], 'UNKNOWN_WORKER_START_NOT_OBSERVED')
            return public_identity(row)
        return controls.start_worker(self.tx, identity, self.available())

    def worker_control(self, identity, web, action, operation):
        self.tx.pin(identity)
        args = SimpleNamespace(container=identity['id'], expected_id=identity['id'], expected_image=identity['image'],
            expected_commit=self.plan['commit'], expected_origin='http://' + web['name'] + ':3000',
            action=action, operation_id=operation, tick_id=None)
        folder = self.tx.folder / 'worker-operations'; folder.mkdir(mode=0o700, exist_ok=True)
        require(not folder.is_symlink() and not folder.stat().st_mode & 0o077, 'PRIVATE_WORKER_JOURNAL_REQUIRED')
        return worker_handoff.execute(args, folder, lambda argv: self.tx.run(argv).decode())

    def app_control(self, identity, action, operation):
        return controls.control_app(self.tx, identity, action, operation)

    def acceptance(self, state, descriptor, operation):
        report = load_json(relative_artifact(self.tx.folder, descriptor))
        require(report.get('kind') == 'naumi-candidate-acceptance-v1' and
                report.get('releaseId') == self.plan['releaseId'] and report.get('target') == self.plan['target'] and
                report.get('commit') == self.plan['commit'] and report.get('buildVersion') == self.plan['buildVersion'],
                'CURRENT_CANDIDATE_ACCEPTANCE_REPORT_REQUIRED')
        for web in self.plan['webs']:
            variant = web['variant']; verified = self.verify(web, state['webs'][variant]['running'], operation)
            require(verified['app']['admission']['mode'] == ('open' if state.get('app-open-' + variant) else 'draining'),
                    'ACCEPTANCE_ADMISSION_CHANGED')
            binding = report.get('bindings', {}).get(variant)
            require(binding == {'container': verified['identity'], 'appIdentity': verified['app']['identity'],
                                'assetPrefix': web['assetPrefix']}, 'ACCEPTANCE_CANDIDATE_BOOT_OR_VARIANT_CHANGED')
            checks = [item for item in report.get('checks', []) if item.get('variant') == variant]
            require(set(web['requiredChecks']) <= {item.get('name') for item in checks}, 'REQUIRED_FEATURE_ACCEPTANCE_MISSING')
            for item in checks:
                require(item.get('passed') is True and item.get('runner') in ['playwright', 'cua', 'http-integration'] and
                        item.get('startedAt') >= state['webs'][variant]['verified']['observedAt'], 'FEATURE_TEST_NOT_CURRENT')
                controls.fresh(item.get('startedAt'), maximum=900)
                response = load_json(relative_artifact(self.tx.folder, item['response']))
                require(response.get('containerId') == binding['container']['id'] and
                        response.get('bootId') == binding['appIdentity']['bootId'] and
                        response.get('status') == item.get('expectedStatus', 200) and response.get('status') in [200, 201, 204, 401, 403] and response.get('assertions') and
                        all(assertion.get('actual') == assertion.get('expected') for assertion in response['assertions']) and
                        response.get('request', {}).get('method') in ['GET', 'POST', 'PATCH'] and
                        isinstance(response.get('request', {}).get('url'), str) and
                        response['request']['url'].startswith('http://127.0.0.1:' + str(web['port']) + '/') and
                        response.get('responseBodySha256') and HASH.fullmatch(response['responseBodySha256']),
                        'REAL_RESPONSE_AND_ASSERTIONS_REQUIRED')
                check_path(item['name'], urllib.parse.urlsplit(response['request']['url']).path)
                body = relative_artifact(self.tx.folder, response['body']).read_bytes()
                require(body and sha(body) == response['responseBodySha256'], 'ACTUAL_RESPONSE_BODY_CHANGED')
                require(any(a.get('kind') in ['json', 'bodyContains', 'bodySha256'] for a in response['assertions']) and
                        all(assertion_value(a, body, response['status']) == a['expected'] for a in response['assertions']),
                        'FEATURE_BODY_ASSERTIONS_REQUIRED')
                if item['runner'] in ['playwright', 'cua']:
                    screenshot = relative_artifact(self.tx.folder, item['screenshot']).read_bytes()
                    require(screenshot.startswith(b'\x89PNG\r\n\x1a\n') and len(screenshot) > 128, 'REAL_BROWSER_SCREENSHOT_REQUIRED')
        return {'reportSha256': descriptor['sha256'], 'checks': len(report['checks']), 'candidateBindingsVerified': True}

    def capture_acceptance(self, state, descriptor, operation):
        """Executable GET collector; browser reports can additionally bind real PNGs.

        This makes no supplier POST and does not claim generation/save coverage.
        JSON assertions are collected from actual HTTP bytes, never hand-written PASS.
        """
        spec = load_json(relative_artifact(self.tx.folder, descriptor))
        require(isinstance(spec.get('checks'), list) and 1 <= len(spec['checks']) <= 64, 'BOUNDED_HTTP_CHECKS_REQUIRED')
        report = {'kind': 'naumi-candidate-acceptance-v1', 'releaseId': self.plan['releaseId'], 'target': self.plan['target'],
                  'commit': self.plan['commit'], 'buildVersion': self.plan['buildVersion'], 'bindings': {}, 'checks': []}
        for web in self.plan['webs']:
            verified = self.verify(web, state['webs'][web['variant']]['running'], operation)
            report['bindings'][web['variant']] = {'container': verified['identity'], 'appIdentity': verified['app']['identity'],
                                                 'assetPrefix': web['assetPrefix']}
        for index, item in enumerate(spec['checks']):
            web = next((w for w in self.plan['webs'] if w['variant'] == item.get('variant')), None)
            require(web is not None and item.get('expectedStatus') in [200, 401, 403], 'TYPED_HTTP_GET_CHECK_REQUIRED')
            check_path(item['name'], item['path'])
            headers = {}
            if item.get('cookie'):
                cookie = relative_artifact(self.tx.folder, item['cookie']).read_text().strip()
                require('\r' not in cookie and '\n' not in cookie and len(cookie) <= 16384, 'PRIVATE_COOKIE_FILE_INVALID')
                headers['Cookie'] = cookie
            started = timestamp()
            connection = http.client.HTTPConnection('127.0.0.1', web['port'], timeout=15)
            try:
                connection.request('GET', item['path'], headers=headers)
                response = connection.getresponse(); body = response.read(2 * 1024 * 1024 + 1)
                require(0 < len(body) <= 2 * 1024 * 1024 and response.status == item['expectedStatus'], 'HTTP_FEATURE_RESPONSE_FAILED')
                assertions = [{'kind': 'status', 'actual': response.status, 'expected': item['expectedStatus']}]
                for assertion in item.get('jsonAssertions', []):
                    require(isinstance(assertion.get('path'), list) and assertion['path'], 'TYPED_JSON_ASSERTION_REQUIRED')
                    actual = json.loads(body)
                    for field in assertion['path']: actual = actual[field]
                    require(actual == assertion['expected'], 'HTTP_FEATURE_ASSERTION_FAILED')
                    assertions.append({'kind': 'json', 'path': assertion['path'], 'actual': actual, 'expected': assertion['expected']})
                if item.get('expectedBodySha256'):
                    require(HASH.fullmatch(item['expectedBodySha256']) and sha(body) == item['expectedBodySha256'], 'HTTP_FEATURE_BODY_HASH_FAILED')
                    assertions.append({'kind': 'bodySha256', 'actual': sha(body), 'expected': item['expectedBodySha256']})
                if item.get('bodyContains'):
                    require(isinstance(item['bodyContains'], str) and item['bodyContains'].encode() in body, 'HTTP_FEATURE_BODY_CONTENT_FAILED')
                    assertions.append({'kind': 'bodyContains', 'needle': item['bodyContains'], 'actual': True, 'expected': True})
                require(len(assertions) > 1, 'FEATURE_BODY_ASSERTIONS_REQUIRED')
            finally:
                connection.close()
            stem = operation + '-feature-' + str(index)
            def save(name, raw):
                saved = self.private_save(operation)(name, raw)
                return {'path': pathlib.Path(saved['path']).name, 'sha256': saved['sha256']}
            body_descriptor = save(stem + '.body', body)
            binding = report['bindings'][web['variant']]
            receipt = {'containerId': binding['container']['id'], 'bootId': binding['appIdentity']['bootId'],
                       'request': {'method': 'GET', 'url': 'http://127.0.0.1:' + str(web['port']) + item['path']},
                       'status': response.status, 'body': body_descriptor, 'responseBodySha256': sha(body), 'assertions': assertions,
                       'startedAt': started, 'completedAt': timestamp()}
            check = {'variant': web['variant'], 'name': item['name'], 'runner': 'http-integration', 'passed': True,
                     'startedAt': started, 'expectedStatus': item['expectedStatus'], 'response': save(stem + '.response.json', encoded(receipt))}
            if item.get('screenshot'):
                raw = relative_artifact(self.tx.folder, item['screenshot']).read_bytes()
                require(raw.startswith(b'\x89PNG\r\n\x1a\n') and len(raw) > 128, 'REAL_BROWSER_SCREENSHOT_REQUIRED')
                check.update(runner='cua', screenshot=item['screenshot'])
            report['checks'].append(check)
        saved = self.private_save(operation)('acceptance-report.json', encoded(report))
        return {'path': pathlib.Path(saved['path']).name, 'sha256': saved['sha256']}

    def restore_caller(self, operation):
        identity = self.plan['legacyCaller']['identity']
        intent = self.tx.folder / ('legacy-caller-restore-intent-' + identity['id'][:12] + '.json')
        row = self.tx.pin(identity)
        if intent.exists():
            require(load_json(intent).get('identity') == identity, 'ORIGINAL_CALLER_RESTORE_INTENT_CHANGED')
            if row['State'].get('Paused') is False:
                return {'restored': True, 'reconciled': True}
            require(row['State'].get('Paused') is True, 'CALLER_RESTORE_UNKNOWN')
            self.tx.run(['docker', 'unpause', identity['id']])
            require(self.tx.inspect(identity['id'])['State'].get('Paused') is False, 'CALLER_RESTORE_UNKNOWN')
            return {'restored': True, 'reconciled': True}
        return maintenance.restore_frozen_caller(self.tx, self.plan['legacyCaller']['identity'], candidate_worker_quiescent=True)

    def assert_activation(self, state, operation):
        report = load_json(relative_artifact(self.tx.folder, self.plan['gateways']['open']['report']))
        require(sha(self.tx.run(['nginx', '-T'])) == report['afterDumpSha256'], 'ACTIVE_GATEWAY_CLOSURE_CHANGED')
        for web in self.plan['webs']:
            slot = state['webs'][web['variant']]
            status = controls.app_status(self.tx, slot['running'])
            require(status['identity'] == slot['verified']['app']['identity'] and status['admission']['mode'] == 'open',
                    'ACTIVE_APP_BOOT_OR_ADMISSION_CHANGED')
        return {'gatewayAndAppIdentitiesVerified': True}

    def retire(self, identity, descriptor, operation):
        receipt = load_json(relative_artifact(self.tx.folder, descriptor))
        return self.tx.retire(identity, receipt)


class MaintenanceSession:
    def __init__(self, tx, plan, *, adapter=None, state_root=ROOT, now=None):
        self.tx, self.plan = tx, valid_plan(copy.deepcopy(plan))
        require(tx.stack is not None, 'WHOLE_TRANSACTION_LOCK_REQUIRED')
        maintenance.authorize(self.plan['authorization'], now=now)
        self.root = pathlib.Path(state_root)
        require(self.root.is_absolute() and not self.root.is_symlink(), 'PRIVATE_CANONICAL_STATE_REQUIRED')
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if os.name == 'posix':
            require(not self.root.stat().st_mode & 0o077, 'PRIVATE_CANONICAL_STATE_MODE_REQUIRED')
        self.path = self.root / 'current.json'
        self.disk_sha = sha(self.path.read_bytes()) if self.path.exists() else None
        self.plan_hash = sha(encoded(self.plan))
        self.adapter = adapter or LiveAdapter(tx, self.plan)
        if self.path.exists():
            self.state = load_json(self.path)
            require(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', self.state.get('releaseId', '')),
                    'CORRUPT_CANONICAL_RELEASE_ID')
            require(self.state.get('target') == self.plan['target'], 'CANONICAL_TARGET_MISMATCH')
            if self.state.get('releaseId') != self.plan['releaseId']:
                require(self.state.get('phase', self.state.get('status')) in TERMINAL | {'ABORTED'}, 'UNFINISHED_RELEASE_BLOCKS_NEXT')
                controls._atomic_private(self.root / (self.state['releaseId'] + '.json'), self.state)
                self.state = self.new_state()
            else:
                require(self.state.get('planSha256') == self.plan_hash and isinstance(self.state.get('operations'), dict), 'ACTIVE_PLAN_CHANGED')
        else:
            self.state = self.new_state()
        if self.plan['target'] == '103.30.76.93':
            receipt = load_json(relative_artifact(self.tx.folder, self.plan['predecessor47']))
            require(receipt.get('target') == '47.105.59.142' and
                    receipt.get('phase') in ['COMPLETE', 'MIGRATED_CLEANUP_PENDING'] and
                    receipt.get('preservation', {}).get('taskDataPreserved') is True and
                    receipt.get('activation', {}).get('workerResumed') is True,
                    '47_MUST_BE_MIGRATED_BEFORE_103')
        self.persist()

    def new_state(self):
        return {'schemaVersion': 1, 'releaseId': self.plan['releaseId'], 'target': self.plan['target'],
            'planSha256': self.plan_hash, 'phase': 'NEW', 'revision': 0, 'operations': {}, 'webs': {},
            'startedAt': timestamp(), 'legacyDrainProven': False, 'legacyActiveTicks': None,
            'acceptedTasks': None, 'agentSessions': None, 'databaseRestored': False, 'tasksReplayed': False,
            'retired': [], 'history': []}

    def persist(self):
        require((sha(self.path.read_bytes()) if self.path.exists() else None) == self.disk_sha, 'CANONICAL_STATE_CAS_CHANGED')
        self.state['status'] = {'NEW': 'PREPARED', 'BASELINED': 'PREPARED', 'BACKED_UP': 'PREPARED',
            'MAINTENANCE': 'DRAINING', 'FROZEN': 'DRAINING', 'CANDIDATES': 'DRAINING', 'ACCEPTED': 'READY',
            'PRESERVED': 'READY', 'ACTIVE': 'DRAINING', 'MIGRATED_CLEANUP_PENDING': 'CLEANUP_PENDING',
            'COMPLETE': 'COMPLETE', 'ROLLED_BACK': 'ROLLED_BACK'}[self.state['phase']]
        if any(item['phase'] != 'ACKNOWLEDGED' for item in self.state['operations'].values()):
            self.state['status'] = 'UNKNOWN'
        controls._atomic_private(self.path, self.state)
        require(load_json(self.path) == self.state, 'CANONICAL_STATE_REOPEN_FAILED')
        self.disk_sha = sha(self.path.read_bytes())

    def public(self):
        return {key: self.state.get(key) for key in ['releaseId', 'target', 'phase', 'revision', 'legacyDrainProven',
            'legacyActiveTicks', 'acceptedTasks', 'agentSessions', 'databaseRestored', 'tasksReplayed', 'lastError', 'collectedAcceptance']}

    def step(self, request):
        maintenance.authorize(self.plan['authorization'])
        require(isinstance(request, dict) and set(request) <= {'action', 'operationId', 'expectedRevision', 'variant', 'reconcile', 'artifact'} and
                UUID.fullmatch(request.get('operationId', '')) and type(request.get('expectedRevision')) is int,
                'TYPED_STEP_UUID_AND_REVISION_REQUIRED')
        action, operation = request['action'], request['operationId']
        clean = {key: value for key, value in request.items() if key != 'reconcile'}
        binding = sha(encoded(clean)); old = self.state['operations'].get(operation)
        if old:
            require(old['requestSha256'] == binding, 'OPERATION_UUID_BINDING_CONFLICT')
            if old['phase'] == 'ACKNOWLEDGED':
                return {'result': 'ALREADY_ACKNOWLEDGED', 'operationId': operation, **self.public()}
            require(request.get('reconcile') is True and old['phase'] in ['INTENT_RECORDED', 'UNKNOWN'],
                    'EXPLICIT_ORIGINAL_UUID_RECONCILIATION_REQUIRED')
        else:
            require(request.get('reconcile') is not True and request['expectedRevision'] == self.state['revision'], 'REVISION_CONFLICT')
            require(not any(r['phase'] != 'ACKNOWLEDGED' for r in self.state['operations'].values()), 'UNKNOWN_OPERATION_BLOCKS_NEXT')
            require(self.state['phase'] not in TERMINAL, 'SESSION_ALREADY_TERMINAL')
            self.validate_action(action, request)
            self.state['operations'][operation] = {'requestSha256': binding, 'request': clean, 'phase': 'INTENT_RECORDED', 'recordedAt': timestamp()}
            self.state['revision'] += 1
            self.persist()  # Before the first possible host mutation.
        try:
            result = self.dispatch(action, request, operation, bool(old))
            self.state['operations'][operation].update(phase='ACKNOWLEDGED', resultSha256=sha(encoded(result)))
            self.state['history'].append({'action': action, 'operationId': operation, 'result': 'ACKNOWLEDGED', 'at': timestamp()})
            self.state.pop('lastError', None)
            self.state['revision'] += 1; self.persist()
            return {'result': 'ACKNOWLEDGED', 'operationId': operation, **self.public()}
        except BaseException as error:
            self.state['operations'][operation]['phase'] = 'UNKNOWN'
            self.state['history'].append({'action': action, 'operationId': operation, 'result': 'UNKNOWN', 'at': timestamp()})
            self.state['lastError'] = str(error) if isinstance(error, Hold) and re.fullmatch('[A-Z0-9_]+', str(error)) else 'STEP_RESULT_UNKNOWN'
            self.state['revision'] += 1; self.persist()
            raise Hold(self.state['lastError']) from None

    def validate_action(self, action, request):
        phase = self.state['phase']
        allowed = {'baseline': ['NEW'], 'backup': ['BASELINED'], 'maintenance': ['BACKED_UP'], 'freeze': ['MAINTENANCE'],
            'web-create': ['FROZEN', 'CANDIDATES'], 'web-start': ['CANDIDATES'], 'web-verify': ['CANDIDATES'],
            'worker-create': ['CANDIDATES'], 'worker-start': ['CANDIDATES'], 'capture-acceptance': ['CANDIDATES'], 'acceptance': ['CANDIDATES'],
            'preservation': ['ACCEPTED'], 'activate': ['PRESERVED'], 'finish': ['ACTIVE', 'MIGRATED_CLEANUP_PENDING'],
            'retire': ['ACTIVE', 'MIGRATED_CLEANUP_PENDING'], 'rollback': PHASES[3:-2]}
        require(action in allowed and phase in allowed[action], 'INVALID_MAINTENANCE_PHASE')
        if action.startswith('web-'):
            name = request.get('variant'); names = [w['variant'] for w in self.plan['webs']]
            require(name in names, 'KNOWN_VARIANT_REQUIRED')
            current = self.state['webs'].get(name, {})
            if action == 'web-create':
                require(not current and all('verified' in self.state['webs'].get(v, {}) for v in names[:names.index(name)]),
                        'SEQUENTIAL_VARIANT_CREATE_REQUIRED')
            else:
                require(('created' if action == 'web-start' else 'running') in current and
                        ('running' if action == 'web-start' else 'verified') not in current, 'WEB_STEP_ORDER_REQUIRED')
        if action in ['worker-create', 'worker-start', 'capture-acceptance', 'acceptance']:
            require(all('verified' in self.state['webs'].get(w['variant'], {}) for w in self.plan['webs']), 'ALL_COMPILED_VARIANTS_REQUIRED')
            require((action != 'worker-create' or 'worker' not in self.state) and
                    (action != 'worker-start' or 'created' in self.state.get('worker', {}) and 'running' not in self.state['worker']) and
                    (action not in ['acceptance', 'capture-acceptance'] or 'running' in self.state.get('worker', {})), 'WORKER_STEP_ORDER_REQUIRED')

    def op(self, operation, name):
        return str(uuid.uuid5(uuid.UUID(operation), name))

    def main_web(self):
        return self.state['webs']['main']['running']

    def worker_state(self, action, operation):
        return self.adapter.worker_control(self.state['worker']['running'], self.main_web(), action, operation)['state']

    def quiescent_worker(self, operation):
        state = self.worker_state('status', operation)
        require(state.get('paused') is True and state.get('phase') == 'QUIESCENT' and
                state.get('activeTicks') == 0 and state.get('unresolvedTicks') == 0, 'NEW_WORKER_NOT_QUIESCENT')
        return state

    def dispatch(self, action, request, operation, reconcile):
        state, adapter = self.state, self.adapter
        if action == 'baseline':
            require(not reconcile, 'UNKNOWN_BASELINE_REQUIRES_ORIGINAL_PRIVATE_SNAPSHOT_REVIEW')
            state['baselineInventory'] = adapter.inventory(operation)
            state['before'] = adapter.snapshot(operation)
            state['phase'] = 'BASELINED'; return state['before']['public']
        if action == 'backup':
            state['backup'] = adapter.backup(operation, reconcile); state['phase'] = 'BACKED_UP'; return state['backup']
        if action == 'maintenance':
            maintenance.authorize(self.plan['authorization'])
            state['maintenance'] = adapter.gateway('maintenance', operation, reconcile)
            state['phase'] = 'MAINTENANCE'; return state['maintenance']
        if action == 'freeze':
            state['freeze'] = adapter.freeze(operation, reconcile); state['phase'] = 'FROZEN'; return state['freeze']
        if action.startswith('web-'):
            web = next(w for w in self.plan['webs'] if w['variant'] == request['variant'])
            slot = state['webs'].setdefault(web['variant'], {})
            if action == 'web-create': slot['created'] = adapter.web_create(web, operation, reconcile)
            if action == 'web-start': slot['running'] = adapter.web_start(web, slot['created'], operation, reconcile)
            if action == 'web-verify':
                slot['verified'] = adapter.verify(web, slot['running'], operation)
                require(slot['verified']['app']['admission']['mode'] == 'draining', 'CANDIDATE_MUST_STAY_DRAINING')
            state['phase'] = 'CANDIDATES'; return slot
        if action == 'worker-create':
            state['worker'] = {'created': adapter.worker_create(self.main_web(), operation, reconcile)}; return state['worker']
        if action == 'worker-start':
            state['worker']['running'] = adapter.worker_start(state['worker']['created'], operation, reconcile)
            state['worker']['initial'] = self.quiescent_worker(operation); return state['worker']['initial']
        if action == 'capture-acceptance':
            self.quiescent_worker(operation)
            state['collectedAcceptance'] = adapter.capture_acceptance(state, request.get('artifact', self.plan.get('acceptanceSpec')), operation)
            return state['collectedAcceptance']
        if action == 'acceptance':
            self.quiescent_worker(operation)
            descriptor = request.get('artifact', state.get('collectedAcceptance', self.plan.get('acceptance')))
            state['acceptance'] = adapter.acceptance(state, descriptor, operation)
            state['acceptedDescriptor'] = descriptor
            state['phase'] = 'ACCEPTED'; return state['acceptance']
        if action == 'preservation':
            state['after'] = adapter.snapshot(operation, state['before']['private'])
            comparison = tasks.compare_task_snapshots(state['before']['private'], state['after']['private'])
            state['preservation'] = maintenance.validate_preservation(state['before']['public'], state['after']['public'], comparison)
            state['comparison'] = comparison; state['phase'] = 'PRESERVED'; return state['preservation']
        if action == 'activate':
            # Revalidate unchanged candidate boot, artifacts and functional receipts.
            if not state.get('activationAcceptance'):
                self.quiescent_worker(operation)
                state['activationAcceptance'] = adapter.acceptance(state, state['acceptedDescriptor'], operation)
                self.persist()
            for web in self.plan['webs']:
                variant = web['variant']; name = 'app-open-' + variant
                if not state.get(name):
                    state[name] = adapter.app_control(state['webs'][variant]['running'], 'resume', self.op(operation, name))
                    self.persist()
            if not state.get('openGateway'):
                state['openGateway'] = adapter.gateway('open', self.op(operation, 'open-gateway'), reconcile)
                self.persist()
            adapter.assert_activation(state, operation)
            resumed = self.worker_state('resume', self.op(operation, 'worker-resume'))
            require(resumed.get('paused') is False and resumed.get('phase') != 'UNKNOWN' and resumed.get('unresolvedTicks') == 0,
                    'NEW_WORKER_RESUME_UNKNOWN')
            state['activation'] = {'workerResumed': True, 'gateway': state['openGateway'], 'at': timestamp()}
            state['phase'] = 'ACTIVE'; return state['activation']
        if action == 'retire':
            require(not reconcile, 'UNKNOWN_RETIREMENT_REQUIRES_PRIVATE_PROCESS_REVIEW')
            identifier = request.get('variant')
            require(identifier in self.plan.get('retirements', {}), 'EXPLICIT_BOUND_RETIREMENT_REQUIRED')
            item = self.plan['retirements'][identifier]
            result = adapter.retire(item['identity'], item['receipt'], operation)
            if item['identity']['id'] not in state['retired']: state['retired'].append(item['identity']['id'])
            return result
        if action == 'finish':
            adapter.assert_activation(state, operation)
            current_worker = self.worker_state('status', operation)
            require(current_worker.get('paused') is False and current_worker.get('phase') != 'UNKNOWN' and
                    current_worker.get('unresolvedTicks') == 0, 'FINAL_WORKER_STATE_UNKNOWN')
            required = {identity['id'] for identity in self.plan['baseline']}
            state['phase'] = 'COMPLETE' if required <= set(state['retired']) else 'MIGRATED_CLEANUP_PENDING'
            return {'phase': state['phase'], 'legacyDrainProven': False, 'unretired': len(required - set(state['retired']))}
        if action == 'rollback':
            if state.get('worker', {}).get('running') and not state.get('rollbackWorkerPaused'):
                self.worker_state('drain', self.op(operation, 'worker-drain'))
                self.quiescent_worker(operation)
                state['rollbackWorkerPaused'] = True; self.persist()
            if state.get('worker', {}).get('running'): self.quiescent_worker(operation)
            for variant, web in state['webs'].items():
                if web.get('running') and not state.get('rollback-app-' + variant):
                    state['rollback-app-' + variant] = adapter.app_control(web['running'], 'drain', self.op(operation, 'app-drain-' + variant))
                    self.persist()
            kind = 'rollback-open' if state.get('openGateway') else 'rollback-maintenance'
            if not state.get('rollbackGateway'):
                state['rollbackGateway'] = adapter.gateway(kind, self.op(operation, 'rollback-gateway'), reconcile)
                self.persist()
            if state.get('freeze') and not state.get('rollbackCaller'):
                state['rollbackCaller'] = adapter.restore_caller(self.op(operation, 'restore-caller'))
                self.persist()
            after = adapter.snapshot(operation, state['before']['private'])
            comparison = tasks.compare_task_snapshots(state['before']['private'], after['private'])
            state['rollbackPreservation'] = maintenance.validate_preservation(state['before']['public'], after['public'], comparison)
            state['phase'] = 'ROLLED_BACK'; return {'phase': 'ROLLED_BACK', 'databaseRestored': False, 'tasksReplayed': False}
        raise Hold('UNKNOWN_STEP_ACTION')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=pathlib.Path)
    parser.add_argument('--steps', type=pathlib.Path, help='JSON array; otherwise stdin NDJSON, one response per line')
    args = parser.parse_args(argv)
    try:
        plan = valid_plan(load_json(args.manifest))
        maintenance.authorize(plan['authorization'])
        with HostTransaction(plan['target'], plan['hostIdentitySha256'], args.manifest.parent) as tx:
            session = MaintenanceSession(tx, plan)
            steps = load_json(args.steps) if args.steps else None
            require(steps is None or isinstance(steps, list) and len(steps) <= 128, 'BOUNDED_STEPS_ARRAY_REQUIRED')
            if steps is not None:
                for step in steps: print(json.dumps(session.step(step), ensure_ascii=False), flush=True)
            else:
                for line in sys.stdin:
                    require(len(line) <= 65536, 'STEP_LINE_TOO_LARGE')
                    request = json.loads(line)
                    if request == {'action': 'status'}:
                        print(json.dumps(session.public(), ensure_ascii=False), flush=True); continue
                    try:
                        print(json.dumps(session.step(request), ensure_ascii=False), flush=True)
                    except Hold as error:
                        print(json.dumps({'error': str(error), **session.public()}, ensure_ascii=False), flush=True)
            return 0
    except (Hold, OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'error': 'MAINTENANCE_SESSION_HELD', 'databaseRestored': False, 'tasksReplayed': False}), flush=True)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
