"""Abort only the exact failed, never-promoted video-family candidate on 47.

Check is read-only by default. --apply retains the original canonical journal and
seven acknowledged operations, appends durable abort UUIDs, drains only the two
candidate roles, and marks ROLLED_BACK only after their real stop is observed.
An ambiguous action remains UNKNOWN for explicit original-UUID reconciliation;
this tool never retries it with another UUID, clears history, or replays work.
"""
import copy
import json
import pathlib
import re
import time
import uuid

import release47_normal_controller as ctl
import release47_normal_policy as normal
import release47_controls as controls
import release47_authorized_successor as incidents
import release47_recovery_supervisor as recovery
from release47_host import environment, file_sha, public_identity, require, sha
from release47_video_family_successor import validate_config, predecessor_proof

COMMIT = '5d568c7b85ad99dc3db317c66aceedca237f6bdd'
IMAGE = 'sha256:a9653626743d1e0c2faaca14e97ea2bef5099c19764acbbbeb3237a9be1ee993'
VERSION = '1792696653'
INITIAL_REVISION = 626
ORIGINAL_OPERATIONS = {'database-backup', 'image-import', 'web-create', 'web-start',
                       'worker-create', 'worker-start', 'candidate-media-probe-resume'}
MEDIA_RESUME_UUID = 'deeb4b0a-428a-414a-9fdd-91d5cba59497'
ABORT_OPERATIONS = {'abort-candidate-worker-drain', 'abort-candidate-web-drain',
                    'abort-candidate-worker-stop', 'abort-candidate-web-stop'}


def protected_state(state, release_id):
    result = copy.deepcopy(state)
    result.pop('revision', None)
    result.get('normalBlueGreenReleases', {}).pop(release_id, None)
    return result


def helper_cleanup_proof(proof, config):
    require(proof.get('passed') is False and proof.get('errorStage') == 'LOCAL_SIGNED_HTTP' and
            proof.get('errorCode') == 'UNEXPECTED_ACCEPTANCE_FAILURE' and
            proof.get('actualUpload') is True and proof.get('verificationDataCleaned') is True and
            proof.get('mediaProbeCleaned') is True and proof.get('mediaProbe', {}).get('passed') is True and
            proof['mediaProbe'].get('sourceSha256') == config['mediaProbeSha256'] and
            proof.get('sourceCommit') == config['commit'] and proof.get('buildVersion') == config['version'] and
            type(proof.get('supplierCalls')) is int and proof['supplierCalls'] == 0 and
            not proof.get('cleanupErrorCode') and not proof.get('poolCloseErrorCode'),
            'ABORT_HELPER_CLEANUP_NOT_PROVEN')
    return {'verificationId': proof.get('verificationId'), 'actualUpload': True,
            'verificationDataCleaned': True, 'mediaProbeCleaned': True, 'supplierCalls': 0}


def journal_gate(state, original, config, review, canonical_file_sha):
    require(config.get('commit') == COMMIT and config.get('image') == IMAGE and config.get('version') == VERSION,
            'EXACT_FAILED_VIDEO_PROGRAM_REQUIRED')
    require(review.get('schemaVersion') == 1 and review.get('kind') == 'video-family-pre-switch-abort-review' and
            review.get('releaseId') == config['releaseId'] and review.get('revision') == INITIAL_REVISION and
            state.get('revision') == INITIAL_REVISION and
            review.get('canonicalFileSha256') == canonical_file_sha,
            'ABORT_CANONICAL_REVIEW_CHANGED')
    require(protected_state(state, config['releaseId']) == protected_state(original, config['releaseId']),
            'ABORT_UNRELATED_OR_HISTORICAL_STATE_CHANGED')
    require(state.get('activeNormalBlueGreenReleaseId') == config['predecessorReleaseId'] and
            state.get('runtimeRecovery', {}).get('successorReleaseId') == config['predecessorReleaseId'] and
            state.get('normalBlueGreenReleases', {}).get(config['predecessorReleaseId'], {}).get('phase') == 'COMPLETE',
            'ABORT_ACTIVE_PREDECESSOR_CHANGED')
    successor = state.get('normalBlueGreenReleases', {}).get(config['releaseId'], {})
    operations = successor.get('operations', {})
    require(successor.get('phase') == 'CANDIDATE' and successor.get('lastError') == 'HOST_COMMAND_FAILED' and
            successor.get('commit') == COMMIT and successor.get('image') == IMAGE and successor.get('buildVersion') == VERSION and
            not successor.get('retired') and not successor.get('preSwitchAbort') and
            set(operations) == ORIGINAL_OPERATIONS and
            set(review.get('operations', {})) == ORIGINAL_OPERATIONS,
            'ONLY_EXACT_UNPROMOTED_VIDEO_CANDIDATE_ABORTABLE')
    for name, operation in operations.items():
        require(operation.get('phase') == 'ACKNOWLEDGED' and
                operation.get('operationId') == review['operations'][name] and
                re.fullmatch('[a-f0-9-]{36}', operation.get('operationId', '')),
                'ABORT_ORIGINAL_OPERATION_NOT_ACKNOWLEDGED')
    require(operations['candidate-media-probe-resume']['operationId'] == MEDIA_RESUME_UUID,
            'ABORT_ORIGINAL_MEDIA_RESUME_UUID_CHANGED')
    for role in ['web', 'worker']:
        require(successor.get(role) == operations[role + '-start'].get('receipt') and
                successor.get(role, {}).get('image') == IMAGE and
                re.fullmatch('[a-f0-9]{64}', review.get('candidateStaticPins', {}).get(role, '')),
                'ABORT_CANDIDATE_OR_STATIC_REVIEW_CHANGED')
    return {'phase': 'CANDIDATE', 'originalOperationIds': copy.deepcopy(review['operations']),
            'candidateWeb': successor['web'], 'candidateWorker': successor['worker'],
            'gatewaySwitched': False, 'historicalStateChanged': False}


def initial_runtime_gate(old_app, old_worker, candidate_app, candidate_worker, config):
    require(old_app.get('admission', {}).get('mode') == 'open' and old_worker.get('paused') is False and
            all(type(old_worker.get(key)) is int and old_worker[key] == 0 for key in ['activeTicks', 'unresolvedTicks']) and
            not old_worker.get('controlFault') and normal.worker_completed(old_worker),
            'ABORT_PRIOR_SERVICE_NOT_HEALTHY_AND_OPEN')
    require(candidate_app.get('admission', {}).get('mode') == 'draining' and
            candidate_app.get('identity', {}).get('instanceId') == config['newWebName'] and
            candidate_app.get('identity', {}).get('commit') == COMMIT and
            candidate_worker.get('instanceId') == config['newWorkerName'] and
            candidate_worker.get('commit') == COMMIT and candidate_worker.get('targetInstanceId') == config['newWebName'] and
            candidate_worker.get('paused') is True and
            all(type(candidate_worker.get(key)) is int and candidate_worker[key] == 0 for key in ['activeTicks', 'unresolvedTicks']) and
            not candidate_worker.get('controlFault') and isinstance(candidate_worker.get('mediaWorker'), dict) and
            normal.worker_media_healthy(candidate_worker), 'ABORT_CANDIDATE_NOT_PAUSED_AND_CONTROLLED')
    media = candidate_worker['mediaWorker']
    require(media['draining'] is False and media['running'] == 0 and media['queued'] == 0 and media['terminal'] == 0,
            'ABORT_CANDIDATE_MEDIA_NOT_EMPTY')
    return {'oldWebOpen': True, 'oldWorkerUnpausedWithCompletedReceipt': True,
            'candidateAdmissionDraining': True, 'candidateScannerPaused': True, 'candidateMediaEmpty': True}


def candidate_database_gate(proof):
    fields = {'activeOrUnknownActivities', 'nonidleSessionOwners', 'candidateTickReceipts'}
    require(proof.get('scope') == 'candidate-all-boots' and set(proof.get('counts', {})) == fields and
            all(type(value) is int and value == 0 for value in proof['counts'].values()),
            'ABORT_CANDIDATE_DATABASE_OWNERSHIP_NOT_ZERO')
    return proof


def stopped_gate(rows, candidates, old_ids):
    require(len(rows) == 2 and len(candidates) == 2 and {row['Id'] for row in rows} == {p['id'] for p in candidates} and
            not ({row['Id'] for row in rows} & set(old_ids)), 'ABORT_STOP_TARGET_NOT_EXACT_CANDIDATES')
    for row in rows:
        identity = next(p for p in candidates if p['id'] == row['Id'])
        require(row['Image'] == IMAGE and row['Name'].lstrip('/') == identity['name'] and
                row['State']['StartedAt'] == identity['startedAt'] and row['State']['Running'] is False and
                row['HostConfig']['RestartPolicy']['Name'] == 'no' and row['State'].get('OOMKilled') is not True,
                'ABORT_CANDIDATE_STOP_NOT_OBSERVED')
    return {'onlyCandidatesStopped': True, 'restartPolicyNo': True, 'oldSlotsStopped': False}


def private_json(path, root):
    path = pathlib.Path(path)
    require(path.is_absolute() and path.resolve() == path and path.is_relative_to(root) and
            path.is_file() and not path.is_symlink() and path.stat().st_size <= 1024 * 1024 and
            path.stat().st_uid == 0 and not path.stat().st_mode & 0o077, 'PRIVATE_ABORT_EVIDENCE_REQUIRED')
    return json.loads(path.read_bytes())


class AbortController(ctl.Controller):
    def persist(self):
        require(protected_state(self.state, self.cfg['releaseId']) == self.abort_protected,
                'ABORT_UNRELATED_STATE_MUTATION_FORBIDDEN')
        require(all(self.succ['operations'].get(name) == value for name, value in self.abort_original_operations.items()),
                'ABORT_ORIGINAL_OPERATION_MUTATION_FORBIDDEN')
        super().persist()

    def database_ownership(self):
        # Names were validated by configure(), and literals are still escaped.
        web = "'" + self.newweb['name'].replace("'", "''") + "'"
        worker = "'" + self.newworker['name'].replace("'", "''") + "'"
        rows = self.sql("SELECT json_build_object('scope','candidate-all-boots','counts',json_build_object("
            "'activeOrUnknownActivities',(SELECT count(*)::int FROM app_release_activities WHERE instance_id IN (" + web + ',' + worker + ") AND state<>'finished'),"
            "'nonidleSessionOwners',(SELECT count(*)::int FROM app_release_session_owners WHERE instance_id IN (" + web + ',' + worker + ") AND state<>'idle'),"
            "'candidateTickReceipts',(SELECT count(*)::int FROM app_worker_tick_receipts WHERE worker_instance_id=" + worker + ' OR web_instance_id=' + web + ")),'historicalActivityCount',(SELECT count(*)::int FROM app_release_activities WHERE instance_id IN (" + web + ',' + worker + ")));")
        require(len(rows) == 1, 'ABORT_CANDIDATE_OWNERSHIP_QUERY_INCOMPLETE')
        return candidate_database_gate(rows[0])

    def unchanged_baseline(self):
        require(self.cfg['expectedGatewayDigest'] == self.original_manifest['gatewayDumpSha256'] and
                sha(self.tx.run(['nginx', '-T'])) == self.cfg['expectedGatewayDigest'], 'ABORT_ORIGINAL_GATEWAY_CHANGED')
        original_facts = json.loads((ctl.ROOT / 'transaction/configuration-before.json').read_bytes())
        require(original_facts == self.cfg['expectedConfigurationFacts'] and
                self.configuration_facts() == original_facts, 'ABORT_MODEL_OR_BILLING_CHANGED')
        require(pathlib.Path('/etc/systemd/system/naumi47-recovery.service').read_bytes() ==
                (ctl.ROOT / 'transaction/original-supervisor.service').read_bytes(), 'ABORT_SUPERVISOR_UNIT_CHANGED')
        manifest = json.loads(pathlib.Path(self.runtime['manifestPath']).read_bytes())
        require(manifest == self.original_manifest and sha(recovery.encoded(manifest)) == self.runtime['manifestSha256'],
                'ABORT_SUPERVISOR_MANIFEST_CHANGED')
        require(self.tx.run(['systemctl', 'is-active', 'naumi47-recovery.timer']).strip() == b'active',
                'ABORT_PRIOR_SUPERVISOR_TIMER_NOT_ACTIVE')
        self.old_adapter.inspect(manifest['web']); self.old_adapter.inspect(manifest['worker'])
        readable = ctl.ROOT / 'transaction/backup-readable.json'
        require(file_sha(readable) == self.succ['operations']['database-backup']['receipt']['sha256'],
                'ABORT_ORIGINAL_BACKUP_RECEIPT_CHANGED')
        backup = json.loads(readable.read_bytes())
        archive = pathlib.Path(backup['path'])
        require(archive.parent == ctl.ROOT / 'transaction' and archive.is_file() and not archive.is_symlink() and
                archive.stat().st_size == backup['bytes'] and file_sha(archive) == backup['sha256'] and
                backup.get('restoreExecuted') is False, 'ABORT_ORIGINAL_BACKUP_CHANGED')
        rows, held = self.incidents()
        incidents.check_incidents(rows, held, self.succ['incidentSha256'])
        for identity in [self.web, self.worker, *self.infra]: self.tx.pin(identity)
        return {'gatewayUnchanged': True, 'configurationUnchanged': True, 'backupUnchanged': True,
                'supervisorUnchanged': True, 'incidentsUnchanged': True, 'infrastructureUnchanged': True}

    def prior_healthy(self):
        self.old_adapter.readiness(self.original_manifest['web'])
        app = controls.app_status(self.tx, self.web)
        worker = self.worker_control(self.worker, 'status', str(uuid.uuid4()))['state']
        require(app['admission']['mode'] == 'open' and worker.get('paused') is False and
                worker.get('activeTicks') == 0 and worker.get('unresolvedTicks') == 0 and
                normal.worker_completed(worker) and not worker.get('controlFault'),
                'ABORT_OLD_SERVICE_NOT_OPEN')
        return app, worker

    def candidate_drain_proof(self, worker_stopped=False):
        app = controls.app_status(self.tx, self.newweb)
        domain = self.request(self.newweb, '/api/video/worker/drain-status')
        owners = self.sql("SELECT json_build_object('rows',COALESCE(json_agg(row_to_json(t)),'[]')) FROM (SELECT state FROM app_release_session_owners WHERE instance_id='" + self.newweb['name'] + "')t;")[0]['rows']
        if worker_stopped:
            row = self.tx.inspect(self.newworker['id'])
            require(not row['State']['Running'] and row['HostConfig']['RestartPolicy']['Name'] == 'no',
                    'ABORT_STOPPED_WORKER_REAPPEARED')
            worker = self.abort_worker_drained
        else:
            worker = self.worker_control(self.newworker, 'status', str(uuid.uuid4()))['state']
        require(normal.worker_quiescent(worker) and worker['mediaWorker']['terminal'] == 0,
                'ABORT_CANDIDATE_WORKER_NOT_QUIESCENT')
        rows, held = self.incidents()
        proof = normal.current_drained(app, domain, worker, owners, rows, held, self.succ['incidentSha256'])
        proof['candidateDatabaseOwnership'] = self.database_ownership()
        proof['scope'] = 'candidate-process-and-conservative-shared-domain'
        if worker_stopped: proof['candidateWorkerObservedStopped'] = public_identity(row)
        if not worker_stopped: self.abort_worker_drained = worker
        return proof

    def stop_candidate(self, identity, role, static_pin):
        require(role in ['web', 'worker'] and identity == getattr(self, 'new' + role) and
                identity['id'] not in [self.web['id'], self.worker['id']], 'ABORT_ONLY_CANDIDATE_STOP_ALLOWED')
        self.wait(self.prior_healthy, 'ABORT_PRIOR_COMPLETED_TICK', 30); self.unchanged_baseline()
        self.candidate_drain_proof(worker_stopped=role == 'web')
        row = self.tx.pin(identity)
        require(recovery.static_pin(row) == static_pin and row['Image'] == IMAGE,
                'ABORT_CANDIDATE_STATIC_PIN_CHANGED')
        self.tx.run(['docker', 'update', '--restart=no', identity['id']])
        self.tx.run(['docker', 'stop', '--time=-1', identity['id']], timeout=120)
        stopped = self.tx.inspect(identity['id'])
        require(not stopped['State']['Running'] and stopped['HostConfig']['RestartPolicy']['Name'] == 'no' and
                stopped['State']['StartedAt'] == identity['startedAt'] and stopped['Image'] == IMAGE and
                stopped['State'].get('OOMKilled') is not True, 'ABORT_CANDIDATE_STOP_UNKNOWN')
        return public_identity(stopped)

    def abort(self, review, apply=False):
        original = json.loads((ctl.ROOT / 'transaction/original-canonical-exact.json').read_bytes())
        proof = journal_gate(self.state, original, self.cfg, review, self.disk)
        self.succ = self.state['normalBlueGreenReleases'][self.cfg['releaseId']]
        self.newweb, self.newworker = self.succ['web'], self.succ['worker']
        self.abort_protected = protected_state(self.state, self.cfg['releaseId'])
        self.abort_original_operations = copy.deepcopy(self.succ['operations'])
        predecessor_proof(self.tx, self.state, {**self.cfg, 'resumeReview': {'kind': 'abort-only-candidate-review'}})
        helper = review['helperResult']
        helper_path = pathlib.Path(helper['path'])
        helper_value = private_json(helper_path, ctl.ROOT)
        require(file_sha(helper_path) == helper['sha256'], 'ABORT_HELPER_EVIDENCE_HASH_CHANGED')
        proof['helperCleanup'] = helper_cleanup_proof(helper_value, self.cfg)
        self.check_running_slots({self.newweb['id'], self.newworker['id']})
        for role in ['web', 'worker']:
            identity = getattr(self, 'new' + role)
            require(recovery.static_pin(self.tx.pin(identity)) == review['candidateStaticPins'][role],
                    'ABORT_CANDIDATE_STATIC_PIN_CHANGED')
        proof['baseline'] = self.unchanged_baseline()
        old_app, old_worker = self.wait(self.prior_healthy, 'ABORT_PRIOR_COMPLETED_TICK', 30)
        candidate_app = controls.app_status(self.tx, self.newweb)
        candidate_worker = self.worker_control(self.newworker, 'status', str(uuid.uuid4()))['state']
        proof['runtime'] = initial_runtime_gate(old_app, old_worker, candidate_app, candidate_worker, self.cfg)
        proof['candidateDatabaseOwnership'] = self.database_ownership()
        self.tx.save('VIDEO_ABORT_CHECK-' + uuid.uuid4().hex + '.json', proof)
        if not apply: return {**proof, 'check': 'PASS', 'executed': False}
        self.succ['preSwitchAbort'] = {'phase': 'INTENT_RECORDED', 'operationId': str(uuid.uuid4()),
            'initialRevision': INITIAL_REVISION, 'initialCanonicalFileSha256': self.disk,
            'reviewSha256': sha(recovery.encoded(review)), 'originalOperationIds': copy.deepcopy(review['operations']),
            'at': ctl.now()}
        self.persist()
        self.op('abort-candidate-worker-drain', lambda op: self.worker_control(self.newworker, 'drain', op))
        self.wait(lambda: self.candidate_drain_proof(), 'ABORT_CANDIDATE_FULL_DRAIN', 120)
        self.op('abort-candidate-web-drain', lambda op: controls.control_app(self.tx, self.newweb, 'drain', op))
        self.wait(lambda: self.candidate_drain_proof(), 'ABORT_CANDIDATE_REPEATED_DRAIN', 120)
        time.sleep(1)
        drained = self.wait(lambda: self.candidate_drain_proof(), 'ABORT_CANDIDATE_FINAL_DRAIN', 120)
        self.tx.save('VIDEO_ABORT_CANDIDATE_DRAIN.json', drained)
        for role in ['worker', 'web']:
            identity = getattr(self, 'new' + role)
            self.op('abort-candidate-' + role + '-stop',
                    lambda _op, identity=identity, role=role: self.stop_candidate(identity, role, review['candidateStaticPins'][role]))
        stopped = stopped_gate([self.tx.inspect(p['id']) for p in [self.newweb, self.newworker]],
                               [self.newweb, self.newworker], [self.web['id'], self.worker['id']])
        final_baseline = self.unchanged_baseline()
        self.wait(self.prior_healthy, 'ABORT_PRIOR_FINAL_COMPLETED_TICK', 30)
        self.database_ownership(); self.check_running_slots()
        require(set(self.succ['operations']) == ORIGINAL_OPERATIONS | ABORT_OPERATIONS and
                all(op['phase'] == 'ACKNOWLEDGED' for op in self.succ['operations'].values()),
                'ABORT_OPERATIONS_NOT_ALL_ACKNOWLEDGED')
        self.succ['preSwitchAbort'].update(phase='COMPLETE', completedAt=ctl.now(), **stopped)
        self.phase('ROLLED_BACK', rollbackAt=ctl.now(), rollbackKind='never-promoted-candidate-abort')
        result = {'phase': 'ROLLED_BACK', 'releaseId': self.cfg['releaseId'], 'commit': COMMIT, 'image': IMAGE,
            'at': ctl.now(), 'executed': True, **stopped, **final_baseline,
            'oldServiceUninterrupted': True, 'databaseRestored': False, 'modelConfigurationChanged': False,
            'supplierCalls': 0, 'tasksReplayed': False, 'historicalDrainReclassified': False,
            'originalOperationIds': copy.deepcopy(review['operations'])}
        self.tx.save('VIDEO_PRE_SWITCH_ABORT_RECEIPT.json', result)
        return result


def main(config_path, review_path, apply=False):
    config = json.loads(pathlib.Path(config_path).read_bytes())
    review = json.loads(pathlib.Path(review_path).read_bytes())
    validate_config(config); ctl.configure(config)
    with ctl.transaction() as tx:
        print('THREE_LOCKS=ACQUIRED', flush=True)
        operator = AbortController(tx, config)
        try:
            result = operator.abort(review, apply)
        except BaseException as error:
            # Never call the publication's automatic cutback/restart path here.
            # Original intent/UNKNOWN records remain at their durable UUIDs.
            if hasattr(operator, 'succ') and operator.succ.get('preSwitchAbort'):
                operator.succ['preSwitchAbort'].update(phase='HOLD', errorCode=str(error) if isinstance(error, ctl.Hold) else type(error).__name__)
                operator.persist()
            raise
        print('VIDEO_PRE_SWITCH_ABORT=' + json.dumps(result), flush=True)
    print('THREE_LOCKS=RELEASED', flush=True)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=pathlib.Path)
    parser.add_argument('--review', required=True, type=pathlib.Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    main(args.config, args.review, args.apply)
