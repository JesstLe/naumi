"""47 SaaS successor: ordinary blue/green, fail-closed emergency recovery.

Keeps the established three locks, canonical CAS, snapshot, readiness and drain
gates. Never cuts back to a program that ignores the new permission semantics.
"""
import json
import pathlib

import release47_normal_controller as ctl
import release_client_compat as compat
from release47_host import Hold, environment, file_sha, require
from release47_image_delivery_successor import ImageDeliveryController
from release47_nas_successor import NasController
from saas_recovery_gateway import render, server_inventory

AUTHORIZATION = '后台你觉得验收通过之后 合并所有分支然后上线47服务器做真实验收'


def validate_config(cfg):
    require(cfg.get('target') == '47.105.59.142' and cfg.get('authorization') == AUTHORIZATION
            and cfg.get('releaseId', '').startswith('release47-saas-')
            and cfg.get('recoveryMode') == 'saas-controlled-maintenance', 'EXACT_SAAS_RELEASE_REQUIRED')
    require(cfg.get('restoreDatabase') is False and cfg.get('replayAcceptedTasks') is False
            and cfg.get('activateDisabledModels') is False, 'SAAS_DATA_CONFIG_AND_TASK_PRESERVATION_REQUIRED')
    require(cfg.get('webFinalMemoryMiB') == 3072, 'SAAS_REVIEWED_FINAL_RAM_REQUIRED')


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


class SaasController(ImageDeliveryController):
    saas_controlled_recovery = True
    # Reuse only the published in-place memory-limit increase AFTER retirement;
    # no NAS migration/eviction, task settlement or old-program rollback methods.
    after_retirement = NasController.after_retirement

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

    def ready(self):
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
        path = ctl.ROOT / 'saas-emergency-gateway/report.json'
        proof = json.loads((self.tx.folder / 'SAAS_RECOVERY_PREPARED.json').read_bytes())
        require(proof.get('actualNginxSyntaxPassed') is True and proof.get('compatibleBusinessRollback') is False
                and proof.get('sourceCommit') == self.cfg['commit'] and proof.get('image') == self.cfg['image']
                and proof.get('reportSha256') == file_sha(path), 'SAAS_RECOVERY_MATERIALS_CHANGED')
        require(compat.sha(self.tx.run(['nginx', '-T'])) == self.emergency['beforeDumpSha256'],
                'SAAS_CURRENT_INGRESS_CHANGED')

    def switch_forward_gateway(self):
        self.verify_internal_authority()
        return ctl.c.switch_gateway_bundle(self.tx, self.forward, self.before, self.after,
                    expected_dump_sha=compat.sha(self.dump.encode()), logical_to_real=self.real,
                    failure_policy='preserve-written')

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

    def recover_failure(self, error):
        # Physical CAS is checked even if the forward switch timed out before
        # self.switched was assigned. Unknown UUID receipts stay unknown.
        outcome = {'at': ctl.now(), 'error': str(error) if isinstance(error, Hold) else type(error).__name__,
                   'priorProgramResumed': False, 'databaseRestored': False, 'tasksReplayed': False,
                   'workerStateChanged': False, 'maintenanceApplied': False}
        if hasattr(self, 'succ'):
            self.succ.update(lastError=outcome['error'], failedAt=outcome['at'])
            self.persist()
        try:
            current = compat.sha(self.tx.run(['nginx', '-T']))
            if hasattr(self, 'emergency') and current == self.emergency['beforeDumpSha256']:
                self.op('saas-failure-public-maintenance', lambda _: self.switch_emergency_gateway(current))
                outcome['maintenanceApplied'] = True
            else:
                require(current == self.cfg['expectedGatewayDigest'], 'UNKNOWN_INGRESS_REQUIRES_RECONCILIATION')
                outcome['baselinePublicEntryPreserved'] = True
            if hasattr(self, 'succ'):
                self.phase('RECOVERY_REQUIRED', recoveryMode='saas-controlled-maintenance')
        except BaseException as recovery_error:
            outcome['recoveryError'] = str(recovery_error) if isinstance(recovery_error, Hold) else type(recovery_error).__name__
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
        active = state.get('activeNormalBlueGreenReleaseId')
        prior = state.get('normalBlueGreenReleases', {}).get(active, {})
        require(active == cfg.get('predecessorReleaseId') and prior.get('phase') == 'COMPLETE',
                'LATEST_PUBLICATION_NOT_COMPLETE')
        require(len(prior.get('retired', [])) == 2, 'LATEST_RETIREMENT_INCOMPLETE')
        for identifier in prior['retired']:
            row = tx.inspect(identifier)
            require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name'] == 'no',
                    'PRIOR_SLOT_NOT_RETIRED')
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
