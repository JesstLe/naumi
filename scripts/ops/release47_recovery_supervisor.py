#!/usr/bin/env python3
"""Pinned, fail-closed crash recovery, not a release or paid-job retry engine.

The service only starts the two explicitly authorized existing containers. It
does not create containers, reload nginx, kill processes, clear ticks or restore
databases. An interrupted scanner may be superseded only by a separate audited
human operation; this supervisor NEVER performs that operation automatically.
"""
import argparse
import copy
import datetime as dt
import json
import os
import pathlib
import time
import uuid

from release47_host import HostTransaction, Hold, environment, public_identity, require, sha
from release47_controls import _atomic_private


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def static_pin(row):
    """No secret leaves the host. Pins include RAM, mounts, ports, env and image."""
    value = {k: row[k] for k in ['Id', 'Name', 'Image', 'Config', 'HostConfig', 'Mounts']}
    # Docker 29 persists default DNS as null but reports [] after daemon reboot.
    # Both mean host defaults; normalize to the enrolled null representation.
    # A real resolver list (and every other configuration field) remains pinned.
    value['HostConfig'] = copy.deepcopy(row['HostConfig'])
    if value['HostConfig'].get('Dns') == []:
        value['HostConfig']['Dns'] = None
    # Docker may reorder its inspect Mounts array at a stop/start. Destination
    # identity is unique; order has no semantics and must not invalidate pins.
    value['Mounts'] = sorted(row['Mounts'], key=lambda m: m['Destination'])
    value['Networks'] = sorted(row.get('NetworkSettings', {}).get('Networks', {}))
    # Docker changes anonymous-volume propagation details at start; use actual
    # mount identity, not a synthesized command or a name-only match.
    return sha(encoded(value))


def recovery_binding(state, manifest):
    require(state.get('target') == '47.105.59.142' and state.get('releaseId') == manifest['releaseId'] and
            state.get('planSha256') == manifest['originalPlanSha256'], 'RECOVERY_RELEASE_CHANGED')
    require(state.get('phase') == 'MIGRATED_CLEANUP_PENDING', 'RECOVERY_RELEASE_NOT_ACTIVE')
    require(all(o.get('phase') == 'ACKNOWLEDGED' for o in state.get('operations', {}).values()),
            'UNRESOLVED_RELEASE_OPERATION')
    recovery = state.get('runtimeRecovery', {})
    require(recovery.get('operationId') == manifest['operationId'] and
            recovery.get('manifestSha256') == sha(encoded(manifest)) and
            recovery.get('phase') == 'ACKNOWLEDGED', 'RECOVERY_MANIFEST_NOT_ACKNOWLEDGED')


NODE_REQUEST = r"""
let raw='';for await(const c of process.stdin)raw+=c;
const input=JSON.parse(raw),headers={};
if(input.kind==='web')headers['x-release-control-secret']=process.env.RELEASE_CONTROL_SECRET;
if(input.kind==='worker')headers['x-video-worker-secret']=process.env.VIDEO_WORKER_SECRET;
if(input.cookie)headers.cookie=input.cookie;
headers['content-type']='application/json';
const response=await fetch('http://127.0.0.1:'+input.port+input.path,{method:input.body?'POST':'GET',headers,
 ...(input.body?{body:JSON.stringify(input.body)}:{}),signal:AbortSignal.timeout(12000)});
let data;const text=await response.text();try{data=JSON.parse(text)}catch{data={html:text.includes('<html')}}
console.log(JSON.stringify({status:response.status,data}));
"""


class Adapter:
    def __init__(self, tx, manifest):
        self.tx, self.manifest = tx, manifest

    def inspect(self, spec):
        row = self.tx.inspect(spec['id'])
        require(static_pin(row) == spec['staticSha256'], 'CONTAINER_CONFIGURATION_CHANGED')
        require(row['Image'] == self.manifest['image'], 'RECOVERY_IMAGE_CHANGED')
        return row

    def request(self, spec, path, *, body=None, cookie=None):
        data = {'kind': spec['role'], 'port': 3000 if spec['role'] == 'web' else 3001,
                'path': path, 'body': body, 'cookie': cookie}
        raw = self.tx.run(['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', spec['id'], 'node',
                           '--input-type=module', '-e', NODE_REQUEST], stdin=encoded(data), timeout=20)
        response = json.loads(raw)
        require(response['status'] == 200, 'RECOVERY_HTTP_CHECK_FAILED')
        return response['data']

    def status(self, spec):
        return self.request(spec, '/api/internal/release/status' if spec['role'] == 'web' else '/status')

    def readiness(self, spec):
        health = self.request(spec, '/api/health')
        version = self.request(spec, '/api/version')
        require(health.get('db', {}).get('ok') is True and health['db'].get('enabled') is True,
                'RECOVERY_DATABASE_NOT_READY')
        require(version.get('commit') == self.manifest['commit'] and
                str(version.get('version')) == self.manifest['buildVersion'], 'RECOVERY_VERSION_CHANGED')
        cookie = pathlib.Path(self.manifest['cookieFile']).read_text().strip()
        require(bool(self.request(spec, '/api/auth/session', cookie=cookie).get('user')), 'RECOVERY_LOGIN_FAILED')
        self.request(spec, '/api/projects', cookie=cookie)
        require(self.request(spec, '/canvas', cookie=cookie).get('html') is True, 'RECOVERY_CANVAS_FAILED')
        return {'database': True, 'version': True, 'existingLogin': True, 'projects': True, 'canvas': True}

    def start(self, spec):
        self.tx.run(['docker', 'start', spec['id']])

    def available_kib(self):
        return int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines()
                        if l.startswith('MemAvailable:')))

    def host_boot_id(self):
        return pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()

    def wait_ready(self, spec):
        for attempt in range(12):
            try:
                self.status(spec)
                return
            except Hold:
                if attempt == 11: raise
                time.sleep(1)

    def control(self, spec, request):
        return self.request(spec, '/api/internal/release/control' if spec['role'] == 'web' else '/control', body=request)


class Supervisor:
    def __init__(self, manifest, folder, adapter):
        self.manifest, self.folder, self.adapter = manifest, pathlib.Path(folder), adapter
        self.folder.mkdir(mode=0o700, parents=True, exist_ok=True)

    def record(self, name, data):
        _atomic_private(self.folder / name, data)

    def ensure_running(self, spec):
        row = self.adapter.inspect(spec)
        if row['State']['Running']:
            return row
        # A deliberate clean stop or docker stop is not an instruction to undo
        # maintenance. No restart loops on unhealthy-but-running applications.
        latest_path = self.folder / 'latest.json'
        latest = json.loads(latest_path.read_bytes()) if latest_path.exists() else {}
        host_boot = getattr(self.adapter, 'host_boot_id', lambda: None)()
        prior_boot = latest.get('hostBootId') or self.manifest.get('initialHostBootId')
        reboot = bool(host_boot and prior_boot and host_boot != prior_boot and
                      (latest.get(spec['role'], {}).get('running') is True or
                       spec.get('runningAtEnrollment') is True))
        require(reboot or row['State'].get('OOMKilled') is True or row['State'].get('ExitCode') not in [0, 143],
                'INTENTIONAL_STOP_REMAINS_STOPPED')
        filename = spec['role'] + '-restart.json'
        path = self.folder / filename
        log = json.loads(path.read_bytes()) if path.exists() else {'attempts': []}
        recent = [a for a in log['attempts'] if time.time() - a['epoch'] < 3600]
        same = next((a for a in recent if a['failedStartedAt'] == row['State']['StartedAt']), None)
        if same:
            # No unbounded retry after an uncertain start or a readiness error.
            require(same.get('started') is True, 'RECOVERY_START_UNKNOWN')
            raise Hold('RECOVERY_START_ALREADY_ATTEMPTED')
        require(len(recent) < 3 and (not recent or time.time() - recent[-1]['epoch'] >= 60),
                'RECOVERY_RESTART_BUDGET_EXHAUSTED')
        attempt = {'operationId': str(uuid.uuid4()), 'epoch': time.time(), 'at': now(),
                   'failedStartedAt': row['State']['StartedAt'], 'exitCode': row['State']['ExitCode'],
                   'oomKilled': row['State'].get('OOMKilled'), 'phase': 'INTENT_RECORDED'}
        available_kib = getattr(self.adapter, 'available_kib', lambda: 10**9)()
        require(available_kib >= spec.get('memoryMiB', 2048) * 1024 + 1024 * 1024,
                'RECOVERY_PHYSICAL_MEMORY_INSUFFICIENT')
        log['attempts'] = recent + [attempt]
        self.record(filename, log)
        self.adapter.start(spec)
        fresh = self.adapter.inspect(spec)
        require(fresh['State']['Running'] and fresh['State']['StartedAt'] != row['State']['StartedAt'],
                'RECOVERY_START_NOT_OBSERVED')
        attempt.update(started=True, phase='ACKNOWLEDGED', newStartedAt=fresh['State']['StartedAt'])
        self.record(filename, log)
        return fresh

    def admit(self, spec, status, operation_suffix=''):
        if spec['role'] == 'worker':
            require(status.get('unresolvedTicks') == 0 and status.get('phase') != 'UNKNOWN' and
                    not status.get('controlFault'),
                    'UNRESOLVED_TICK_BLOCKS_RESUME')
            if not status.get('paused'):
                return status
            require((status.get('lastTick') or {}).get('phase') not in ['unknown', 'dispatched'],
                    'UNRESOLVED_TICK_BLOCKS_RESUME')
            revision = status['revision']
            boot = status['bootId']
            request = {'action': 'resume', 'bootId': boot, 'expectedRevision': revision}
        else:
            if status['admission']['mode'] == 'open':
                return status
            boot = status['identity']['bootId']
            request = {'action': 'resume', 'instanceId': spec['name'], 'bootId': boot,
                       'expectedRevision': status['admission']['revision']}
        path = self.folder / (spec['role'] + '-resume-' + boot + operation_suffix + '.json')
        if path.exists():
            log = json.loads(path.read_bytes())
            require(log['request']['bootId'] == boot, 'RECOVERY_CONTROL_BOOT_CHANGED')
            request = log['request']
        else:
            request['operationId'] = str(uuid.uuid4())
            log = {'request': request, 'phase': 'INTENT_RECORDED'}
            self.record(path.name, log)
        result = self.adapter.control(spec, request)
        fresh = self.adapter.status(spec)
        got_boot = fresh['identity']['bootId'] if spec['role'] == 'web' else fresh['bootId']
        require(got_boot == boot and (fresh.get('admission', {}).get('mode') == 'open' if spec['role'] == 'web'
                                     else fresh.get('paused') is False), 'RECOVERY_CONTROL_NOT_OBSERVED')
        log.update(phase='ACKNOWLEDGED', receipt=result, observedAt=now())
        self.record(path.name, log)
        return fresh

    def recover_completed_tick(self, spec, status):
        """Reconcile only the original UUID through the Worker's GET verifier.

        A missing/running/unknown receipt remains paused. This is not tick
        supersession and never sends a generation POST or clears a DB row.
        """
        tick = status.get('lastTick') or {}
        if not (status.get('paused') is True and status.get('activeTicks') == 0 and
                tick.get('phase') in ['unknown','complete'] and not status.get('controlFault')):
            return status, False
        if tick.get('phase') == 'complete' and not tick.get('id'): return status, False
        require(isinstance(tick.get('id'), str), 'ORIGINAL_UNKNOWN_TICK_ID_REQUIRED')
        try: uuid.UUID(tick['id']); uuid.UUID(status['bootId'])
        except (ValueError, KeyError): raise Hold('ORIGINAL_UNKNOWN_TICK_ID_REQUIRED') from None
        path = self.folder / ('worker-reconcile-' + status['bootId'] + '-' + tick['id'] + '.json')
        if path.exists():
            log = json.loads(path.read_bytes())
            require(log['request']['tickId'] == tick['id'] and log['request']['bootId'] == status['bootId'],
                    'RECOVERY_RECONCILE_IDENTITY_CHANGED')
        else:
            if tick.get('phase') != 'unknown' or status.get('unresolvedTicks') != 1: return status, False
            log = {'phase': 'INTENT_RECORDED', 'request': {'action': 'reconcile',
                   'tickId': tick['id'], 'bootId': status['bootId'], 'expectedRevision': status['revision'],
                   'operationId': str(uuid.uuid4())}, 'at': now()}
            self.record(path.name, log)
        if tick.get('phase') == 'complete' and status.get('revision') != log['request']['expectedRevision'] + 1:
            return status, False
        result = self.adapter.control(spec, log['request'])
        fresh = self.adapter.status(spec)
        require(fresh.get('bootId') == status['bootId'] and fresh.get('unresolvedTicks') == 0 and
                fresh.get('paused') is True and (fresh.get('lastTick') or {}).get('id') == tick['id'] and
                fresh['lastTick'].get('phase') == 'complete', 'RECOVERY_RECONCILE_NOT_OBSERVED')
        # The next CAS resume is tied to this acknowledged reconciliation, not
        # to the presence of paused=true (which could be an operator drain).
        log.update(phase='ACKNOWLEDGED', receipt=result, revision=fresh['revision'], observedAt=now())
        self.record(path.name, log)
        return fresh, True

    def once(self):
        web, worker = self.manifest['web'], self.manifest.get('worker')
        row = self.ensure_running(web)
        # Fresh Node/Next processes do not become ready at docker-start return.
        # No mutation occurs in this bounded readiness wait.
        if getattr(self.adapter, 'wait_ready', None): self.adapter.wait_ready(web)
        ready = self.adapter.readiness(web)
        app = self.adapter.status(web)
        require(app['identity']['instanceId'] == web['name'] and app['identity']['commit'] == self.manifest['commit'] and
                app.get('transport', {}).get('verified') is True, 'RECOVERY_WEB_IDENTITY_MISMATCH')
        # Only crash recovery/new-boot enrollment authorizes automatic admission;
        # an operator draining the same boot must remain in control.
        boot = app['identity']['bootId']
        enrollment = self.folder / ('web-enrolled-' + boot + '.json')
        if enrollment.exists():
            require(app['admission']['mode'] == 'open', 'OPERATOR_DRAIN_REMAINS_DRAINED')
        app = self.admit(web, app)
        if not enrollment.exists(): self.record(enrollment.name, {'at': now(), 'bootId': boot})
        result = {'at': now(), 'hostBootId': getattr(self.adapter, 'host_boot_id', lambda: None)(),
                  'web': public_identity(row), 'webBootId': boot, 'readiness': ready,
                  'admission': app['admission'], 'supplierSubmissions': 0}
        if worker:
            wr = self.ensure_running(worker)
            if getattr(self.adapter, 'wait_ready', None): self.adapter.wait_ready(worker)
            ws = self.adapter.status(worker)
            require(ws.get('instanceId') == worker['name'] and ws.get('commit') == self.manifest['commit'] and
                    ws.get('targetInstanceId') == web['name'] and ws.get('origin') == 'http://' + web['name'] + ':3000',
                    'RECOVERY_WORKER_TARGET_MISMATCH')
            ws, reconciled = self.recover_completed_tick(worker, ws)
            worker_enrollment = self.folder / ('worker-enrolled-' + ws['bootId'] + '.json')
            if worker_enrollment.exists(): require(not ws['paused'] or reconciled, 'OPERATOR_WORKER_PAUSE_REMAINS_PAUSED')
            # Per-tick UUIDs keep later repairs independent; retries preserve
            # the same intent after a lost control response or supervisor crash.
            ws = self.admit(worker, ws, '-tick-' + ws['lastTick']['id'] if reconciled else '')
            if not worker_enrollment.exists(): self.record(worker_enrollment.name, {'at': now(), 'bootId': ws['bootId']})
            result.update(worker=public_identity(wr), workerBootId=ws['bootId'], workerState=ws,
                          reconciledCompletedTick=reconciled,
                          progressWarning='LONG_RUNNING_TICK' if ws.get('activeTickAgeMs',0)>60000 else None)
        self.record('latest.json', result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=pathlib.Path)
    args = parser.parse_args()
    try:
        require(args.manifest.is_absolute() and not args.manifest.is_symlink() and
                args.manifest.stat().st_uid == 0 and not args.manifest.stat().st_mode & 0o077,
                'PRIVATE_ROOT_OWNED_MANIFEST_REQUIRED')
        manifest = json.loads(args.manifest.read_bytes())
        require(manifest.get('target') == '47.105.59.142' and manifest.get('schemaVersion') == 1,
                'RECOVERY_TARGET_REQUIRED')
        with HostTransaction(manifest['target'], manifest['hostIdentitySha256'], manifest['evidenceDir']) as tx:
            state = json.loads(pathlib.Path(manifest['canonicalPath']).read_bytes())
            recovery_binding(state, manifest)
            require(sha(tx.run(['nginx', '-T'])) == manifest['gatewayDumpSha256'], 'RECOVERY_GATEWAY_CHANGED')
            result = Supervisor(manifest, pathlib.Path(manifest['journalDir']), Adapter(tx, manifest)).once()
            # Current bindings and observations, never retroactive old acceptance.
            canonical = pathlib.Path(manifest['canonicalPath'])
            require(json.loads(canonical.read_bytes()) == state, 'RECOVERY_CANONICAL_CAS_CHANGED')
            recovery = state['runtimeRecovery']
            if recovery.get('effectiveWeb') != result['web'] or recovery.get('effectiveWorker') != result.get('worker'):
                recovery.update(effectiveWeb=result['web'], effectiveWorker=result.get('worker'),
                                webBootId=result['webBootId'], workerBootId=result.get('workerBootId'), reboundAt=now())
                state['webs']['main']['running'] = result['web']
                if result.get('worker'): state['worker']['running'] = result['worker']
                state['revision'] += 1
                _atomic_private(canonical, state)
            print('RECOVERY_SUPERVISOR=PASS WEB_OPEN=YES WORKER=' + (result.get('workerState', {}).get('phase') or 'NOT_ENROLLED'))
        return 0
    except BlockingIOError:
        print('RECOVERY_SUPERVISOR=DEFERRED LOCK_BUSY'); return 0
    except Exception as error:
        print('RECOVERY_SUPERVISOR=HOLD ' + (str(error) if isinstance(error, Hold) else type(error).__name__))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
