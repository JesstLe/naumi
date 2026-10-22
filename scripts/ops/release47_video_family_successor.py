"""One video-family program release through the existing 47 normal controller.

The model configuration stays unchanged throughout this transaction. Activation
is a separate versioned config CAS after the program publication is COMPLETE.
Only the NAS controller's post-retirement RAM growth method is reused; none of
its migration, unknown-scanner, settlement, or resume exceptions are inherited.
"""
import json
import pathlib
import re
import uuid

import release47_normal_controller as ctl
from release47_host import environment, file_sha, public_identity, require
from release47_image_delivery_successor import ImageDeliveryController
from release47_nas_successor import NasController


AUTHORIZATION = '将seedance kling wan h3家族群为视频节点配置并启用'


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
            type(config.get('webFinalMemoryMiB')) is int and config['webFinalMemoryMiB'] == 3072,
            'VIDEO_FAMILY_REQUIRES_REVIEWED_1536M_WEB_1G_WORKER_3G_FINAL')
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
            'hostReserveMiB': 1024, 'dualSlotRequiredMiB': 3584, 'finalWebMemoryMiB': 3072}


class VideoFamilyController(ImageDeliveryController):
    # Deliberately reuse this one method, not NasController's run/ready/recovery.
    after_retirement = NasController.after_retirement

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
