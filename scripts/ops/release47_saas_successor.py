"""47 SaaS successor: ordinary blue/green, fail-closed emergency recovery.

Keeps the established three locks, canonical CAS, snapshot, readiness and drain
gates. Never cuts back to a program that ignores the new permission semantics.
"""
import json
import pathlib
import re
import uuid

import release47_normal_controller as ctl
import release_client_compat as compat
from release47_host import Hold, environment, file_sha, require
from release47_video_family_successor import VideoFamilyController, MIB
from saas_recovery_gateway import render, server_inventory
from saas_maintenance_probe import validate_ingress, probe_maintenance
from release47_preserved_unknown import Guard

AUTHORIZATION = '后台你觉得验收通过之后 合并所有分支然后上线47服务器做真实验收'
CASE05_BASELINE = '/opt/naumi-staging/evidence/video-family-release47-20261023-r2/unified-handoff/CASE05-BASELINE.private.json'
CASE05_SHA256 = '512245689fb9884732d6f9f9c7d479ca1481bfe2570b4fa4356fd947b572b041'


def validate_config(cfg):
    preserved = cfg.get('preservedUnknown', {})
    require(isinstance(preserved, dict) and set(preserved) ==
            {'baselinePath', 'baselineSha256', 'allowedAdditiveColumns'}
            and preserved['baselinePath'] == CASE05_BASELINE and preserved['baselineSha256'] == CASE05_SHA256
            and preserved['allowedAdditiveColumns'] == {}, 'EXACT_ORIGINAL_CASE05_BASELINE_REQUIRED')
    require(cfg.get('target') == '47.105.59.142' and cfg.get('authorization') == AUTHORIZATION
            and cfg.get('releaseId', '').startswith('release47-saas-')
            and cfg.get('recoveryMode') == 'saas-controlled-maintenance', 'EXACT_SAAS_RELEASE_REQUIRED')
    require(cfg.get('restoreDatabase') is False and cfg.get('replayAcceptedTasks') is False
            and cfg.get('activateDisabledModels') is False, 'SAAS_DATA_CONFIG_AND_TASK_PRESERVATION_REQUIRED')
    require(type(cfg.get('webMemoryMiB')) is int and cfg['webMemoryMiB'] == 1536
            and type(cfg.get('workerMemoryMiB')) is int and cfg['workerMemoryMiB'] == 1024
            and cfg.get('webFinalMemoryMiB') == 2048 and cfg.get('reviewedCombinedMedia') is True,
            'SAAS_REVIEWED_FINAL_RAM_REQUIRED')
    require(cfg.get('previousNormalReleaseId') == cfg.get('predecessorReleaseId')
            and bool(cfg.get('predecessorReleaseId')), 'SAAS_EXACT_PREDECESSOR_REQUIRED')
    media = cfg.get('combinedMedia', {})
    require(isinstance(media, dict) and set(media) == {'workerName', 'secret', 'scratchSource'}
            and media['workerName'] == cfg.get('newWorkerName')
            and isinstance(media['workerName'], str)
            and re.fullmatch(r'naumi47-worker-video-family-[a-z0-9-]+', media['workerName'])
            and isinstance(media['secret'], str) and 48 <= len(media['secret']) <= 128
            and media['scratchSource'] == '/opt/naumi-staging/data/video-media-jobs',
            'SAAS_EXACT_COMBINED_MEDIA_BINDING_REQUIRED')
    require(cfg.get('videoReferencePublicOrigin') == 'https://47.105.59.142',
            'SAAS_EXACT_REFERENCE_ORIGIN_REQUIRED')
    root = pathlib.PurePosixPath(cfg.get('evidenceRoot', ''))
    script = pathlib.PurePosixPath(cfg.get('storageAcceptanceScript', ''))
    require(root.parent == pathlib.PurePosixPath('/opt/naumi-staging/evidence')
            and script.parent == root / 'tools'
            and re.fullmatch(r'[A-Za-z0-9_.-]+\.cjs', script.name)
            and re.fullmatch('[a-f0-9]{64}', cfg.get('storageAcceptanceSha256', '')),
            'SAAS_PINNED_STORAGE_ACCEPTANCE_REQUIRED')
    require(isinstance(cfg.get('mediaProbePath'), str)
            and re.fullmatch(r'/data/isolated-provider-probes/provider-video-probe-20261023/[A-Za-z0-9_.-]+\.mp4', cfg['mediaProbePath'])
            and re.fullmatch('[a-f0-9]{64}', cfg.get('mediaProbeSha256', '')),
            'SAAS_PINNED_REAL_MEDIA_PROBE_REQUIRED')
    require(re.fullmatch('[a-f0-9]{40}', cfg.get('commit', ''))
            and re.fullmatch('sha256:[a-f0-9]{64}', cfg.get('image', ''))
            and re.fullmatch('[0-9]{10,13}', cfg.get('version', ''))
            and re.fullmatch('[a-f0-9]{64}', cfg.get('imageArchiveSha256', '')),
            'SAAS_FIXED_PROGRAM_REQUIRED')
    operations = cfg.get('imageAcceptanceOperations')
    require(isinstance(operations, list) and operations
            and all(isinstance(v, str) and re.fullmatch('[a-fA-F0-9-]{36}', v) for v in operations)
            and len(set(operations)) == len(operations), 'SAAS_EXISTING_REAL_IMAGE_REQUIRED')
    require(not any(cfg.get(key) for key in ['resumeReady', 'resumeCutback', 'finishPromoted',
            'preservedWorkerTick', 'nasRollbackManifestPath']), 'SAAS_NO_NAS_RELEASE_EXCEPTION')


def predecessor_proof(tx, state, cfg):
    active = state.get('activeNormalBlueGreenReleaseId')
    prior = state.get('normalBlueGreenReleases', {}).get(active, {})
    require(active == cfg['predecessorReleaseId'] and prior.get('phase') == 'COMPLETE',
            'LATEST_PUBLICATION_NOT_COMPLETE')
    require(len(prior.get('retired', [])) == 2 and len(set(prior['retired'])) == 2,
            'LATEST_RETIREMENT_INCOMPLETE')
    for identifier in prior['retired']:
        row = tx.inspect(identifier)
        require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name'] == 'no',
                'PRIOR_SLOT_NOT_RETIRED')
    recovery = state.get('runtimeRecovery', {})
    require(recovery.get('phase') == 'ACKNOWLEDGED' and recovery.get('successorReleaseId') == active,
            'SAAS_PREDECESSOR_RECOVERY_NOT_ACKNOWLEDGED')
    for role, key, memory in [('web', 'oldWeb', 2048), ('worker', 'oldWorker', 1024)]:
        identity = cfg[key]
        require(all(prior.get(role, {}).get(field) == identity.get(field) for field in ['id', 'name', 'image']),
                'SAAS_PREDECESSOR_SLOT_CHANGED')
        row = tx.pin(identity)
        require(row['State']['Running'] is True and row['HostConfig']['Memory'] == memory * MIB,
                'SAAS_PREDECESSOR_MEMORY_CHANGED')
    proof = {'releaseId': active, 'phase': 'COMPLETE', 'priorWebMemoryMiB': 2048,
             'priorWorkerMemoryMiB': 1024, 'retiredIds': prior['retired'],
             'candidateWebMemoryMiB': 1536, 'finalWebMemoryMiB': 2048,
             'workerMemoryMiB': 1024, 'hostReserveMiB': 1024}
    tx.save('SAAS_PREDECESSOR_PUBLICATION.json', proof)
    return proof


def syntax_check(tx, bodies, root):
    """Same whole-closure isolation as normal publication, without live writes."""
    for name, raw in bodies.items():
        text, changes = raw.decode(), []
        for node in compat.walk(compat.parse(text)):
            if node.name in ('pid', 'lock_file', 'error_log', 'access_log', 'client_body_temp_path',
                             'proxy_temp_path', 'fastcgi_temp_path', 'uwsgi_temp_path', 'scgi_temp_path'):
                if node.args and node.args[0] not in ('off', 'stderr'):
                    token = node.tokens[1]
                    changes.append((token.start, token.end, compat.quote(str(root / ('isolated-' + node.name)))))
            if node.name == 'http' and not any(child.name.endswith('_temp_path') for child in node.children or []):
                at = text.index('{', node.tokens[-1].end) + 1
                changes.append((at, at, '\n' + ''.join(n + '_temp_path ' + compat.quote(str(root / ('default-' + n))) + ';\n'
                                                     for n in ('client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'))))
            if node.name == 'include':
                for token in node.tokens[1:]:
                    if token.value.startswith('/etc/nginx/'):
                        changes.append((token.start, token.end, compat.quote(str(root) + token.value)))
        for begin, end, value in sorted(changes, reverse=True):
            text = text[:begin] + value + text[end:]
        target = root / name.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    tx.run(['nginx', '-t', '-c', str(root / 'etc/nginx/nginx.conf')])


class SaasController(VideoFamilyController):
    saas_controlled_recovery = True
    # Keep the current combined Worker/media readiness and conservative 2 GiB
    # final-RAM gates. No NAS migration, settlement or old rollback exception.

    def __init__(self, tx, cfg):
        validate_config(cfg)
        super().__init__(tx, cfg)
        for key in ('localAcceptance', 'recoveryIngressAudit'):
            spec = cfg.get(key, {})
            path = pathlib.Path(spec.get('path', ''))
            require(path.parent == ctl.ROOT and path.is_file() and file_sha(path) == spec.get('sha256'),
                    'PINNED_SAAS_REVIEW_REQUIRED:' + key)
        local = json.loads(pathlib.Path(cfg['localAcceptance']['path']).read_bytes())
        require(local.get('kind') == 'saas-prerelease-review' and local.get('sourceCommit') == cfg['commit']
                and local.get('linuxBuildImage') == cfg['image'] and local.get('localAcceptancePassed') is True
                and local.get('designQa') == 'passed' and local.get('controlledRecoveryFixturePassed') is True
                and local.get('noUnresolvedP1P2') is True, 'SAAS_LOCAL_ACCEPTANCE_INCOMPLETE')
        self.ingress = json.loads(pathlib.Path(cfg['recoveryIngressAudit']['path']).read_bytes())
        require(self.ingress.get('evidenceMode') == 'live' and self.ingress.get('target') == cfg['target']
                and self.ingress.get('dumpSha256') == cfg['expectedGatewayDigest']
                and self.ingress.get('unaccountedNaumiPublicEndpoints') == []
                and bool(self.ingress.get('servers')), 'REAL_PUBLIC_INGRESS_AUDIT_REQUIRED')
        validate_ingress(self.ingress)
        self.preserved_unknown = Guard({**cfg['preservedUnknown'],
            'supplementalPath': str(self.tx.folder / 'CASE05_SUPPLEMENT.private.json')}, self.sql, self.tx.save)

    def run(self):
        # The original immutable eight tables must match BEFORE any candidate
        # or schema initialization; extra related tables are frozen only once.
        self.preserved_unknown.establish()
        return super().run()

    def ready(self):
        self.preserved_unknown.check('candidate-ready')
        result = super().ready()
        tenants = self.request(self.newweb, '/api/admin/tenants?page=1&size=5')
        require(isinstance(tenants.get('items'), list), 'SAAS_TENANT_HTTP_NOT_READY')
        self.tx.save('SAAS_READINESS.json', {'tenantRows': len(tenants['items']), 'fixtureSeeded': False,
                                          'productionPermissionMutations': 0, 'supplierCalls': 0})
        return result

    def build_gateway(self):
        super().build_gateway()
        original = {(row['path'], row['serverOrdinal']): row for row in server_inventory(self.dump)}
        candidate = {(row['path'], row['serverOrdinal']): row for row in server_inventory(self.after_dump)}
        selected = []
        for audited in self.ingress['servers']:
            key = (audited.get('path'), audited.get('serverOrdinal'))
            require(original.get(key) == audited, 'AUDITED_PUBLIC_SERVER_CHANGED')
            require(key in candidate and candidate[key]['listen'] == audited['listen']
                    and candidate[key]['serverNames'] == audited['serverNames'], 'CANDIDATE_PUBLIC_BINDING_CHANGED')
            selected.append(candidate[key])
        spec = {'kind': 'saas-controlled-maintenance-recovery', 'expectedDumpSha256': compat.sha(self.after_dump.encode()),
                'servers': selected, 'restoreDatabase': False, 'replayAcceptedTasks': False, 'compatibleBusinessRollback': False}
        folder = ctl.ROOT / 'saas-emergency-gateway'
        render(self.after_dump, spec, folder, source_files=self.candidate_closure)
        self.emergency = json.loads((folder / 'report.json').read_bytes())
        self.emergency_after = {patch['path']: (folder / patch['after']).read_bytes() for patch in self.emergency['patches']}
        syntax_check(self.tx, {**self.candidate_closure, **self.emergency_after}, ctl.ROOT / 'syntax-saas-recovery')
        self.tx.save('SAAS_RECOVERY_PREPARED.json', {
            'kind': 'controlled-maintenance-recovery', 'actualNginxSyntaxPassed': True,
            'reportSha256': file_sha(folder / 'report.json'), 'compatibleBusinessRollback': False,
            'publicIngressAuditSha256': self.cfg['recoveryIngressAudit']['sha256'], 'liveConfigWritten': False,
            'sourceCommit': self.cfg['commit'], 'image': self.cfg['image']})

    def verify_recovery_materials(self):
        self.preserved_unknown.check('final-before-complete')
        path = ctl.ROOT / 'saas-emergency-gateway/report.json'
        proof = json.loads((self.tx.folder / 'SAAS_RECOVERY_PREPARED.json').read_bytes())
        require(proof.get('actualNginxSyntaxPassed') is True and proof.get('compatibleBusinessRollback') is False
                and proof.get('sourceCommit') == self.cfg['commit'] and proof.get('image') == self.cfg['image']
                and proof.get('reportSha256') == file_sha(path), 'SAAS_RECOVERY_MATERIALS_CHANGED')
        require(compat.sha(self.tx.run(['nginx', '-T'])) == self.emergency['beforeDumpSha256'],
                'SAAS_CURRENT_INGRESS_CHANGED')

    def switch_forward_gateway(self):
        self.preserved_unknown.check('before-switch')
        self.verify_internal_authority()
        return ctl.c.switch_gateway_bundle(self.tx, self.forward, self.before, self.after,
                    expected_dump_sha=compat.sha(self.dump.encode()), logical_to_real=self.real,
                    failure_policy='preserve-written')

    def stop_exact(self, identity):
        require(identity == self.worker or identity == self.web, 'SAAS_UNKNOWN_RETIRE_TARGET')
        self.preserved_unknown.check('before-retire-' + ('worker' if identity == self.worker else 'web'))
        return super().stop_exact(identity)

    def maintenance_http_proof(self):
        require(compat.sha(self.tx.run(['nginx', '-T'])) == self.emergency['afterDumpSha256'],
                'SAAS_MAINTENANCE_PHYSICAL_CAS_CHANGED')
        proof = probe_maintenance(self.ingress)
        self.tx.save('SAAS_MAINTENANCE_HTTP.json', proof)
        require(proof['passed'] is True, 'SAAS_MAINTENANCE_HTTP_NOT_PROVEN')
        return proof

    def record_failure_controls(self, outcome):
        operations = getattr(self, 'succ', {}).get('operations', {})
        controls = {}
        for name, identity in [('old-worker-drain', getattr(self, 'worker', None)),
                               ('new-web-open', getattr(self, 'newweb', None)),
                               ('old-web-drain', getattr(self, 'web', None)),
                               ('new-worker-resume', getattr(self, 'newworker', None)),
                               ('new-worker-retirement-barrier', getattr(self, 'newworker', None))]:
            if name in operations:
                op = operations[name]
                controls[name] = {'operationId': op.get('operationId'), 'phase': op.get('phase'),
                                  'identity': identity, 'ownership': self.cfg['releaseId'],
                                  'originalReceipt': op.get('receipt')}
        outcome['existingControls'] = controls
        outcome['degradedPending'] = bool(controls)
        outcome['fullBaselineServicePreserved'] = False
        # A status observation has no control mutation and never resumes a
        # paused scanner using an invented control operation or receipt.
        if getattr(self, 'worker', None):
            try:
                outcome['oldWorkerObserved'] = self.worker_control(self.worker, 'status', str(uuid.uuid4()))
            except BaseException as error:
                outcome['oldWorkerObserved'] = {'result': 'UNKNOWN', 'error': type(error).__name__}
                outcome['reconciliationRequired'] = True

    def failure_preservation_check(self, outcome, stage):
        try:
            self.preserved_unknown.check(stage)
        except BaseException as error:
            outcome['preservationHold'] = True
            outcome.setdefault('preservationErrors', []).append({
                'stage': stage, 'error': str(error) if isinstance(error, Hold) else type(error).__name__})
            outcome['reconciliationRequired'] = True

    def verify_internal_authority(self):
        web, worker = [self.tx.inspect(identity['id']) for identity in (self.newweb, self.newworker)]
        we, ke = environment(web), environment(worker)
        require(web['Image'] == worker['Image'] == self.cfg['image']
                and we.get('SOURCE_COMMIT') == ke.get('SOURCE_COMMIT') == self.cfg['commit']
                and we.get('INTERNAL_APP_ORIGIN') == 'http://127.0.0.1:3000'
                and ke.get('NAUMI_APP_ORIGIN') == 'http://' + self.newweb['name'] + ':3000',
                'SAAS_INTERNAL_EXECUTION_GRAPH_CHANGED')
        script = """(async()=>{
const url='http://127.0.0.1:3000/api/video/worker/drain-status';
const denied=await fetch(url);if(![401,403,404].includes(denied.status))throw Error('WORKER_UNAUTHENTICATED_NOT_REJECTED');
if(!process.env.VIDEO_WORKER_SECRET)throw Error('WORKER_SECRET_ABSENT');
const allowed=await fetch(url,{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}});
const state=await allowed.json();if(allowed.status!==200||typeof state.drained!=='boolean')throw Error('WORKER_AUTHENTICATED_STATUS_FAILED');
console.log(JSON.stringify({unauthorizedHttp:denied.status,authorizedHttp:allowed.status,sourceCommit:process.env.SOURCE_COMMIT,mutation:false}));
})().catch(e=>{console.error(e.message);process.exit(1)});"""
        raw = self.tx.run(['docker', 'exec', '-e', 'NODE_OPTIONS=', self.newweb['id'],
                           'node', '--input-type=module', '-e', script], timeout=30)
        proof = json.loads(raw)
        require(proof.get('sourceCommit') == self.cfg['commit'] and proof.get('mutation') is False
                and proof.get('unauthorizedHttp') in (401,403,404) and proof.get('authorizedHttp') == 200,
                'SAAS_WORKER_AUTHORITY_PROOF_CHANGED')
        self.tx.save('SAAS_INTERNAL_WORKER_AUTHORITY.json', {
            **proof, 'webImage': web['Image'], 'workerImage': worker['Image'],
            'internalAppOrigin': we['INTERNAL_APP_ORIGIN'], 'workerAppOrigin': ke['NAUMI_APP_ORIGIN']})

    def switch_emergency_gateway(self, current):
        # Keep the uncertain forward operation's private intent/preimages;
        # emergency writes must never overwrite those same evidence filenames.
        prior = self.tx.folder
        folder = prior / 'saas-controlled-maintenance'
        folder.mkdir(mode=0o700, exist_ok=False)
        try:
            self.tx.folder = folder
            return ctl.c.switch_gateway_bundle(self.tx, self.emergency, self.candidate_closure,
                    self.emergency_after, expected_dump_sha=current, logical_to_real=self.real,
                    failure_policy='preserve-written')
        finally:
            self.tx.folder = prior

    def seal_candidate_ingress(self, current):
        # Canonical ACK persistence may itself be the failed forward step.
        # A new canonical intent cannot then be a prerequisite for closing
        # this exact physical candidate. Keep an independent durable intent,
        # original operation UUID and private ACK/UNKNOWN, never overwrite CAS.
        name = 'saas-failure-public-maintenance'
        operations = getattr(self, 'succ', {}).get('operations', {})
        require(name not in operations, 'SAAS_EXISTING_MAINTENANCE_OPERATION_RECONCILE_REQUIRED')
        record = {'operationId':str(uuid.uuid4()), 'phase':'INTENT_RECORDED', 'at':ctl.now(),
                  'releaseId':self.cfg['releaseId'], 'beforeDumpSha256':current,
                  'afterDumpSha256':self.emergency['afterDumpSha256'],
                  'canonicalPersistenceRequiredForSafetySealing':False}
        self.tx.save('SAAS_MAINTENANCE_INTENT.json', record)
        if hasattr(self, 'succ'):
            self.succ['operations'][name] = record
        try:
            result = self.switch_emergency_gateway(current)
            record.update(phase='ACKNOWLEDGED', receipt=result)
            self.tx.save('SAAS_MAINTENANCE_ACK.json', record)
        except BaseException:
            record['phase'] = 'UNKNOWN'
            self.tx.save('SAAS_MAINTENANCE_UNKNOWN.json', record)
            raise
        # This only acknowledges the exact config operation. Real HTTP proof
        # remains separately mandatory before maintenanceApplied can be true.
        if hasattr(self, 'succ'):
            try:
                self.persist()
            except BaseException:
                pass  # Original canonical evidence/CAS must remain unchanged.
        return result

    def recover_failure(self, error):
        # Physical CAS is checked even if the forward switch timed out before
        # self.switched was assigned. Unknown UUID receipts stay unknown.
        outcome = {'at': ctl.now(), 'error': str(error) if isinstance(error, Hold) else type(error).__name__,
                   'priorProgramResumed': False, 'databaseRestored': False, 'tasksReplayed': False,
                   'workerStateChanged': False, 'maintenanceApplied': False}
        self.failure_preservation_check(outcome, 'failure-before')
        self.record_failure_controls(outcome)
        if hasattr(self, 'succ'):
            self.succ.update(lastError=outcome['error'], failedAt=outcome['at'])
            try:
                self.persist()
            except BaseException as persist_error:
                outcome['canonicalPersistenceError'] = type(persist_error).__name__
                outcome['reconciliationRequired'] = True
        try:
            current = compat.sha(self.tx.run(['nginx', '-T']))
            if hasattr(self, 'emergency') and current == self.emergency['beforeDumpSha256']:
                self.seal_candidate_ingress(current)
                self.maintenance_http_proof()
                outcome['maintenanceApplied'] = True
            else:
                require(current == self.cfg['expectedGatewayDigest'], 'UNKNOWN_INGRESS_REQUIRES_RECONCILIATION')
                outcome['baselinePublicEntryPreserved'] = True
            if hasattr(self, 'succ'):
                self.phase('RECOVERY_REQUIRED', recoveryMode='saas-controlled-maintenance',
                           degradedPending=outcome['degradedPending'],
                           preservationHold=outcome.get('preservationHold', False),
                           maintenanceHttpProven=outcome['maintenanceApplied'])
        except BaseException as recovery_error:
            outcome['recoveryError'] = str(recovery_error) if isinstance(recovery_error, Hold) else type(recovery_error).__name__
            outcome['reconciliationRequired'] = True
        self.failure_preservation_check(outcome, 'failure-after')
        # Recovery/HTTP failure must also leave a durable explicit pending
        # phase; it cannot leave SWITCHED looking like successful publication.
        if hasattr(self, 'succ'):
            try:
                self.phase('RECOVERY_REQUIRED', recoveryMode='saas-controlled-maintenance',
                           degradedPending=outcome['degradedPending'],
                           preservationHold=outcome.get('preservationHold', False),
                           maintenanceHttpProven=outcome['maintenanceApplied'])
            except BaseException as persist_error:
                outcome['canonicalPersistenceError'] = type(persist_error).__name__
                outcome['reconciliationRequired'] = True
        self.tx.save('SAAS_FAILURE_RECOVERY.json', outcome)
        print('SAAS_RECOVERY_REQUIRED=' + json.dumps(outcome), flush=True)


def main(config_path):
    cfg = json.loads(pathlib.Path(config_path).read_bytes())
    validate_config(cfg)
    ctl.configure(cfg)
    with ctl.transaction() as tx:
        print('THREE_LOCKS=ACQUIRED', flush=True)
        state = json.loads(ctl.CANON.read_bytes())
        predecessor_proof(tx, state, cfg)
        operator = SaasController(tx, cfg)
        try:
            operator.run()
        except BaseException as error:
            operator.recover_failure(error)
            raise
    print('THREE_LOCKS=RELEASED', flush=True)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True, type=pathlib.Path)
    main(parser.parse_args().config)
