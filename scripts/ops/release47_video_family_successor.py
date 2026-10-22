"""One video-family program release through the existing 47 normal controller.

The model configuration stays unchanged throughout this transaction. Activation
is a separate versioned config CAS after the program publication is COMPLETE.
Final Web RAM is explicitly 2 GiB. No NAS migration, RAM growth, unknown-scanner,
settlement, or resume exception is inherited.
"""
import json
import pathlib
import re
import uuid
import time

import release47_normal_controller as ctl
import release47_recovery_supervisor as recovery
from release47_host import environment, file_sha, public_identity, require
from release47_image_delivery_successor import ImageDeliveryController


AUTHORIZATION = '将seedance kling wan h3家族群为视频节点配置并启用'
MIB = 1024 ** 2
CGROUP_ROOT = pathlib.Path('/sys/fs/cgroup/system.slice')
MEMINFO = pathlib.Path('/proc/meminfo')


def retirement_ram_budget(available_bytes, new_web_current_bytes, old_anonymous_bytes):
    """Credit only old anonymous RAM; file cache and Swap earn no retirement credit."""
    require(type(available_bytes) is int and available_bytes >= 0 and
            type(new_web_current_bytes) is int and new_web_current_bytes >= 0 and
            isinstance(old_anonymous_bytes, list) and len(old_anonymous_bytes) <= 2 and
            all(type(value) is int and value >= 0 for value in old_anonymous_bytes),
            'UNKNOWN_VIDEO_RETIREMENT_RAM')
    available = available_bytes // MIB
    # Round every credit downward. A partial MiB never reduces the hard reserve.
    current = new_web_current_bytes // MIB
    old_anon = sum(value // MIB for value in old_anonymous_bytes)
    required = max(0, 2048 - current) + 1024 + 1024
    predicted = available + old_anon
    return {'passed': predicted >= required, 'availableMiB': available,
            'newWebCurrentMiB': current, 'oldAnonymousCreditMiB': old_anon,
            'predictedAfterRetirementAvailableMiB': predicted, 'requiredAvailableMiB': required,
            'marginMiB': predicted - required, 'finalWebMiB': 2048,
            'hostReserveMiB': 1024, 'workerReserveMiB': 1024,
            'fileCacheCredited': False, 'swapIncluded': False}


def validate_config(config):
    require(config.get('authorization') == AUTHORIZATION, 'EXACT_VIDEO_FAMILY_AUTHORIZATION_REQUIRED')
    require(config.get('releaseId', '').startswith('release47-video-family-'), 'VIDEO_FAMILY_RELEASE_ID_REQUIRED')
    require(config.get('restoreDatabase') is False and config.get('replayAcceptedTasks') is False and
            config.get('activateDisabledModels') is False, 'PROGRAM_ONLY_NON_ACTIVATION_REQUIRED')
    require(config.get('previousNormalReleaseId') == config.get('predecessorReleaseId') and
            bool(config.get('predecessorReleaseId')), 'EXACT_VIDEO_FAMILY_PREDECESSOR_REQUIRED')
    require(type(config.get('webMemoryMiB')) is int and config['webMemoryMiB'] == 1536 and
            type(config.get('workerMemoryMiB')) is int and config['workerMemoryMiB'] == 1024 and
            config.get('reviewedCombinedMedia') is True and
            type(config.get('webFinalMemoryMiB')) is int and config['webFinalMemoryMiB'] == 2048,
            'VIDEO_FAMILY_REQUIRES_REVIEWED_1536M_WEB_1G_WORKER_2G_FINAL')
    require(config.get('videoReferencePublicOrigin') == 'https://47.105.59.142',
            'EXACT_VIDEO_REFERENCE_PUBLIC_ORIGIN_REQUIRED')
    require(isinstance(config.get('storageAcceptanceScript'), str) and
            re.fullmatch('[a-f0-9]{64}', config.get('storageAcceptanceSha256', '')),
            'FIXED_VIDEO_FAMILY_STORAGE_ACCEPTANCE_REQUIRED')
    require(isinstance(config.get('mediaProbePath'), str) and
            re.fullmatch(r'/data/isolated-provider-probes/provider-video-probe-20261023/[A-Za-z0-9_.-]+\.mp4', config['mediaProbePath']) and
            re.fullmatch('[a-f0-9]{64}', config.get('mediaProbeSha256', '')), 'FIXED_REAL_MEDIA_PROBE_REQUIRED')
    require(re.fullmatch('[a-f0-9]{40}', config.get('commit', '')) and
            re.fullmatch('sha256:[a-f0-9]{64}', config.get('image', '')) and
            re.fullmatch('[0-9]{10,13}', config.get('version', '')) and
            re.fullmatch('[a-f0-9]{64}', config.get('imageArchiveSha256', '')),
            'FIXED_VIDEO_FAMILY_PROGRAM_REQUIRED')
    operations = config.get('imageAcceptanceOperations')
    require(isinstance(operations, list) and operations and
            all(isinstance(v, str) and re.fullmatch('[a-fA-F0-9-]{36}', v) for v in operations) and
            len(set(operations)) == len(operations), 'EXISTING_REAL_IMAGE_ACCEPTANCE_REQUIRED')
    require(not any(config.get(key) for key in ['resumeReady', 'resumeCutback', 'finishPromoted',
            'preservedWorkerTick', 'nasRollbackManifestPath']), 'NAS_EXCEPTION_NOT_A_VIDEO_RELEASE_PATH')


def predecessor_proof(tx, state, config):
    """Verify the last publication and exact retired containers without changing them."""
    active = state.get('activeNormalBlueGreenReleaseId')
    require(active == config['predecessorReleaseId'], 'ACTIVE_VIDEO_PREDECESSOR_CHANGED')
    journal = state.get('normalBlueGreenReleases', {})
    prior = journal.get(active, {})
    require(prior.get('phase') == 'COMPLETE' and
            state.get('runtimeRecovery', {}).get('phase') == 'ACKNOWLEDGED' and
            state['runtimeRecovery'].get('successorReleaseId') == active,
            'PRIOR_VIDEO_PUBLICATION_NOT_COMPLETE')
    require(state.get('phase') == 'MIGRATED_CLEANUP_PENDING' and state.get('legacyDrainProven') is False,
            'HISTORICAL_INCIDENTS_MUST_REMAIN_EXPLICIT')
    for release_id, release in journal.items():
        resume = (release_id == config['releaseId'] and bool(config.get('resumeReview')) and
                  release.get('phase') in ['BASELINED', 'BACKED_UP', 'CANDIDATE'])
        require((release.get('phase') in ['COMPLETE', 'ROLLED_BACK'] or resume) and
                all(op.get('phase') == 'ACKNOWLEDGED' for op in release.get('operations', {}).values()),
                'PRIOR_VIDEO_OPERATION_NOT_RECONCILED')
    for role, key in [('web', 'oldWeb'), ('worker', 'oldWorker')]:
        expected = config[key]
        require(all(prior.get(role, {}).get(field) == expected.get(field) for field in ['id', 'image', 'name']),
                'VIDEO_PREDECESSOR_SLOT_CHANGED')
    identifiers = prior.get('retired', [])
    require(isinstance(identifiers, list) and len(identifiers) == 2 and len(set(identifiers)) == 2,
            'PREVIOUS_VIDEO_RETIREMENT_INCOMPLETE')
    retired = []
    for identifier in identifiers:
        row = public_identity(tx.inspect(identifier))
        require(not row['running'] and row['restartPolicy'] == 'no', 'PREVIOUS_VIDEO_SLOT_STILL_RUNNING')
        retired.append(row)
    current = tx.inspect(config['oldWeb']['id'])
    require(current['HostConfig']['Memory'] == 3072 * 1048576, 'REVIEWED_PRIOR_3G_WEB_CHANGED')
    return {'releaseId': active, 'phase': prior['phase'], 'retired': retired,
            'historicalDrainReclassified': False, 'historicalUnknownsCleared': False,
            'priorWebMemoryMiB': 3072, 'candidateWebMemoryMiB': 1536, 'workerMemoryMiB': 1024,
            'hostReserveMiB': 1024, 'dualSlotRequiredMiB': 3584, 'finalWebMemoryMiB': 2048}


class VideoFamilyController(ImageDeliveryController):
    def retirement_memory_proof(self, stage, include_old=True):
        require(stage in ['ready', 'retire', 'after-retirement'] and
                include_old is (stage != 'after-retirement'), 'INVALID_VIDEO_MEMORY_PROOF_STAGE')
        started = time.monotonic()
        current = self.tx.pin(self.newweb)
        require(current['State']['Running'] is True and current['Image'] == self.cfg['image'] and
                current['HostConfig']['Memory'] == 1536 * MIB,
                'CANDIDATE_VIDEO_MEMORY_BASELINE_CHANGED')
        def cgroup(row):
            require(re.fullmatch('[a-f0-9]{64}', row['Id']), 'EXACT_VIDEO_CGROUP_ID_REQUIRED')
            return CGROUP_ROOT / ('docker-' + row['Id'] + '.scope')
        raw_current = (cgroup(current) / 'memory.current').read_text().strip()
        require(raw_current.isdecimal(), 'VIDEO_WEB_MEMORY_CURRENT_UNKNOWN')
        available = [line.split() for line in MEMINFO.read_text().splitlines() if line.startswith('MemAvailable:')]
        require(len(available) == 1 and len(available[0]) == 3 and available[0][1].isdecimal() and
                available[0][2] == 'kB', 'VIDEO_HOST_MEM_AVAILABLE_UNKNOWN')
        old_rows = []
        for identity in [self.web, self.worker]:
            row = self.tx.inspect(identity['id'])
            require(all(public_identity(row).get(key) == identity.get(key) for key in ['id', 'name', 'image']),
                    'VIDEO_RETIREMENT_RAM_OLD_SLOT_CHANGED')
            if include_old:
                require(row['State']['Running'] is True, 'VIDEO_RETIREMENT_RAM_OLD_SLOT_NOT_RUNNING')
                fields = [line.split() for line in (cgroup(row) / 'memory.stat').read_text().splitlines()]
                anon = [line[1] for line in fields if len(line) == 2 and line[0] == 'anon']
                require(len(anon) == 1 and anon[0].isdecimal(), 'VIDEO_OLD_ANONYMOUS_RAM_UNKNOWN')
                old_rows.append({'identity': public_identity(row), 'anonymousBytes': int(anon[0])})
            else:
                require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name'] == 'no',
                        'OLD_SLOT_NOT_RETIRED')
        require(time.monotonic() - started <= 5, 'VIDEO_RETIREMENT_RAM_OBSERVATION_TOO_SLOW')
        proof = retirement_ram_budget(int(available[0][1]) * 1024, int(raw_current),
                                      [row['anonymousBytes'] for row in old_rows])
        proof.update(stage=stage, observedAt=ctl.now(), oldSlots=old_rows,
                     newWeb=public_identity(current), kind='video-family-final-ram-budget')
        self.tx.save('VIDEO_FINAL_RAM_' + stage.upper().replace('-', '_') + '.json', proof)
        require(proof['passed'], 'FINAL_RAM_RESERVE_INSUFFICIENT')
        return proof

    def reference_proof(self):
        result = super().reference_proof()
        self.retirement_memory_proof('retire')
        return result

    def after_retirement(self):
        proof = self.retirement_memory_proof('after-retirement', include_old=False)
        row = self.tx.pin(self.newweb)
        before = row['State']['StartedAt']
        path = pathlib.Path(self.state['runtimeRecovery']['manifestPath'])
        manifest = json.loads(path.read_bytes())
        require(manifest['web']['id'] == self.newweb['id'] and manifest['web']['image'] == self.cfg['image'] and
                manifest['web']['memoryMiB'] == 1536 and manifest['web']['staticSha256'] == recovery.static_pin(row) and
                manifest['worker']['id'] == self.newworker['id'] and manifest['worker']['memoryMiB'] == 1024,
                'VIDEO_MEMORY_SUPERVISOR_PIN_CHANGED')
        self.tx.save('SUPERVISOR_BEFORE_MEMORY.json', manifest)
        def grow(_operation):
            self.tx.run(['docker', 'update', '--memory=2048m', '--memory-swap=2048m', row['Id']])
            changed = self.tx.inspect(row['Id'])
            require(changed['HostConfig']['Memory'] == 2048 * MIB and
                    changed['HostConfig']['MemorySwap'] == 2048 * MIB and
                    changed['State']['Running'] is True and changed['State']['StartedAt'] == before,
                    'MEMORY_UPDATE_OR_PROCESS_CHANGED')
            manifest['web'].update(staticSha256=recovery.static_pin(changed), memoryMiB=2048)
            ctl.save(path, manifest)
            require(json.loads(path.read_bytes()) == manifest, 'VIDEO_MEMORY_SUPERVISOR_READBACK_FAILED')
            self.state['runtimeRecovery'].update(manifestSha256=recovery.sha(recovery.encoded(manifest)), memoryMiB=2048)
            self.persist()
            return {**proof, 'running': True, 'sameProcessStartedAt': before,
                    'restartExecuted': False, 'manifestUpdated': True}
        self.op('new-web-memory-grow', grow)

    def media_worker(self, action=None, operation=None):
        require(action in [None, 'resume'], 'VIDEO_READINESS_MEDIA_ACTION_INVALID')
        script = """let raw='';for await(const c of process.stdin)raw+=c;
const p=JSON.parse(raw),base=process.env.MEDIA_WORKER_ORIGIN,headers={authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET};
if(p.action){const r=await fetch(base+'/'+p.action,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({operationId:p.operation}),redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('MEDIA_CONTROL_HTTP_'+r.status);if((await r.json()).ok!==true)throw Error('MEDIA_CONTROL_REJECTED');}
const r=await fetch(base+'/health',{headers,redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('MEDIA_HEALTH_HTTP_'+r.status);console.log(JSON.stringify(await r.json()));"""
        health = json.loads(self.tx.run(['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', self.newweb['id'],
            'node', '--input-type=module', '-e', script], stdin=json.dumps({'action': action, 'operation': operation}).encode(), timeout=30))
        require(health.get('ok') is True and health.get('sandbox') is True and
                health.get('version') == self.cfg['commit'] and health.get('concurrency') == 1 and
                type(health.get('draining')) is bool and
                all(type(health.get(k)) is int and health[k] >= 0 for k in ['running', 'queued', 'terminal']),
                'CANDIDATE_REAL_MEDIA_WORKER_NOT_READY')
        return health

    def ready(self):
        result = super().ready()
        actual = environment(self.tx.inspect(self.newweb['id']))
        require(actual.get('VIDEO_REFERENCE_PUBLIC_BASE_URL') == self.cfg['videoReferencePublicOrigin'],
                'CANDIDATE_VIDEO_REFERENCE_ORIGIN_CHANGED')
        scanner = self.worker_control(self.newworker, 'status', str(uuid.uuid4()))['state']
        require(scanner.get('paused') is True and scanner.get('activeTicks') == 0 and scanner.get('unresolvedTicks') == 0,
                'CANDIDATE_SCANNER_MUST_REMAIN_PAUSED')
        health = self.media_worker()
        operation = self.succ['operations'].get('candidate-media-probe-resume')
        if operation:
            require(operation.get('phase') == 'ACKNOWLEDGED' and health['draining'] is False,
                    'ORIGINAL_MEDIA_PROBE_CONTROL_REQUIRES_RECONCILIATION')
        else:
            require(health['draining'] is True and health['running'] == 0 and health['queued'] == 0,
                    'FRESH_CANDIDATE_MEDIA_NOT_PAUSED')
            health = self.op('candidate-media-probe-resume', lambda op: self.media_worker('resume', op))
            require(health['draining'] is False, 'CANDIDATE_MEDIA_PROBE_RESUME_NOT_OBSERVED')
        self.tx.save('CANDIDATE_MEDIA_HEALTH.json', health)
        script = pathlib.Path(self.cfg['storageAcceptanceScript'])
        require(script.parent == ctl.ROOT / 'tools' and not script.is_symlink() and
                file_sha(script) == self.cfg['storageAcceptanceSha256'], 'FIXED_STORAGE_ACCEPTANCE_REQUIRED')
        target = '/tmp/video-reference-acceptance-' + self.cfg['storageAcceptanceSha256'] + '.cjs'
        # The reviewed helper reads JSON from stdin, so run a pinned standalone
        # file. Never overlay /app or change the running server process.
        guard = "const f=require('fs');try{const s=f.lstatSync(process.argv[1]);if(!s.isFile()||s.isSymbolicLink())throw Error('NOT_REGULAR')}catch(e){if(e.code!=='ENOENT')throw e}"
        self.tx.run(['docker', 'exec', '-u', '0:0', '-e', 'NODE_OPTIONS=', self.newweb['id'], 'node', '-e', guard, target])
        self.tx.run(['docker', 'cp', str(script), self.newweb['id'] + ':' + target], timeout=30)
        pin = "const f=require('fs'),c=require('crypto'),p=process.argv[1],s=f.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error('NOT_REGULAR');f.chownSync(p,1001,1001);f.chmodSync(p,0o600);const t=f.statSync(p);console.log(JSON.stringify({sha256:c.createHash('sha256').update(f.readFileSync(p)).digest('hex'),uid:t.uid,mode:t.mode&0o777}));"
        copied = json.loads(self.tx.run(['docker', 'exec', '-u', '0:0', '-e', 'NODE_OPTIONS=', self.newweb['id'], 'node', '-e', pin, target]))
        require(copied == {'sha256': self.cfg['storageAcceptanceSha256'], 'uid': 1001, 'mode': 0o600},
                'CANDIDATE_REFERENCE_BUNDLE_CHANGED')
        private_root = '/data/isolated-provider-config/video-reference-acceptance-' + self.cfg['releaseId']
        raw = self.tx.run(['docker', 'exec', '-i', '-u', '1001:1001', '-e', 'NODE_OPTIONS=--conditions=react-server',
                          '-e', 'NODE_PATH=/app/node_modules', self.newweb['id'], 'node', target],
                         stdin=json.dumps({'cookie': self.cookie, 'root': private_root, 'publicCheck': False,
                             'mediaProbePath': self.cfg['mediaProbePath'], 'mediaProbeSha256': self.cfg['mediaProbeSha256']}).encode(), timeout=240)
        proof = json.loads(raw)
        require(proof.get('passed') is True and proof.get('actualUpload') is True and
                proof.get('verificationDataCleaned') is True and
                type(proof.get('supplierCalls')) is int and proof['supplierCalls'] == 0 and
                proof.get('signatureDirectDownload') is True and proof.get('HEAD') is True and proof.get('Range') is True and
                proof.get('mediaProbeCleaned') is True and proof.get('mediaProbe', {}).get('passed') is True and
                proof['mediaProbe'].get('sourceSha256') == self.cfg['mediaProbeSha256'] and
                proof.get('sourceCommit') == self.cfg['commit'] and proof.get('buildVersion') == self.cfg['version'],
                'REAL_VIDEO_FAMILY_STORAGE_ACCEPTANCE_FAILED')
        # Observe after actual image upload and native decode have charged RAM,
        # before READY/browser/cutover can accept a known insufficient final slot.
        self.retirement_memory_proof('ready')
        self.tx.save('PRIVATE_VIDEO_REFERENCE_ACCEPTANCE.json', proof)
        return {**result, 'videoReference': proof, 'videoReferencePublicOrigin': self.cfg['videoReferencePublicOrigin']}


def main(config_path):
    config = json.loads(pathlib.Path(config_path).read_bytes())
    validate_config(config)
    ctl.configure(config)
    with ctl.transaction() as tx:
        print('THREE_LOCKS=ACQUIRED', flush=True)
        state = json.loads(ctl.CANON.read_bytes())
        proof = predecessor_proof(tx, state, config)
        proof_path = tx.folder / 'PREDECESSOR_PUBLICATION_RECONCILED.json'
        if config.get('resumeReview'):
            require(json.loads(proof_path.read_bytes()) == proof, 'VIDEO_PREDECESSOR_PROOF_CHANGED')
        else:
            tx.save(proof_path.name, proof)
        operator = VideoFamilyController(tx, config)
        try:
            operator.run()
        except BaseException as error:
            operator.recover_failure(error)
            raise
    print('THREE_LOCKS=RELEASED', flush=True)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=pathlib.Path)
    main(parser.parse_args().config)
