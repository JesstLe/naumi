"""Pure, exact-case proof for four rejected 47 coordinator observations.

This is NOT a normal release bypass, a DB updater, or a Worker resume protocol.
The original UNKNOWN rows, tick receipt and paid outcomes stay byte-identical.
The caller collects identity-bound evidence while holding all deployment locks,
then persists this separate adjudication before attempting a normal graceful stop.
"""
import datetime as dt
import hashlib
import json
import re

from release47_host import Hold, require

TARGET = '47.105.59.142'
RELEASE_ID = 'release47-main-20261101-r1'
AUTHORIZATION = '我让你上线，你就把全部问题都清完，最后给我上线，听不听得懂话？'
R1 = 'e18780188d02ac92c901b8cf5648b4554aef14e8'
R2 = 'b79c8c397a33cfb3b636acbbe2edfa976f534c39'
TICK_ID = 'f3cd801e-b557-4a12-b492-2841dfd862a4'
WORKER_BOOT = '758b0092-078b-4c2b-ae5b-c8de36c2a305'

# Source-object SHA256, NOT caller-supplied "reviewed=true". Full source commits
# and immutable deployed image IDs are independently pinned below.
COMMON_SOURCES = {
    'src/lib/release-runtime/background-activity.ts': '888db25eebb2b4bff29b9770ac62555a8507715795fd7aa83b8f8ce87764de36',
    'src/lib/image-job-queue.ts': '911fb1dd344b8bd938bdf645daf5f29d1f6a50b1fad0e2b3405340530dbc1360',
    'src/lib/imagegen/batch.ts': '070e8a69a0ff07c3e024077ec9a9f2a19f934ae06c3efc4d5ae5e9aa8c4e71d3',
    'src/lib/worker/drain-status.ts': '163661141b42058895b66b66451b524716ae7c2a72d619579e3dceda697c9ecf',
}
SOURCE_HASHES = {
    R1: {**COMMON_SOURCES,
         'src/lib/release-runtime/worker-tick-receipts.ts': '5a217a52b37412658e4d097af256b0a9efea5756acd289716c5c4947630e920f',
         'src/app/api/video/worker/tick/route.ts': '065e14037ee66d2c03a962e911d4cdce9764e102d33746c4c960e576c6e1ba45',
         'src/lib/durable-image-jobs.ts': '07cc6449e4bac61c1372c752f6f94cc6d6f45b2e2d168fffff58b2cba57a6532',
         'src/lib/imagegen/stored-delivery.ts': '83861741fd97a95752f646da972d877bb812b1ce66de120c77321bd372404afa'},
    R2: {**COMMON_SOURCES,
         'src/lib/release-runtime/worker-tick-receipts.ts': '3ec0d86c2f68f40b29f73d618d4ac3112dc2a5427b9bffc1afe6c30103ae8aa8',
         'src/app/api/video/worker/tick/route.ts': '4738cef4444716b81860e04d01fb8f649e3fe65d8101c4990a8642a351f0cf29',
         'src/lib/durable-image-jobs.ts': 'a28cd9bd0183864ec9ebf2382e2a9d9242002e960647e9187e782ad1b8b9f007',
         'src/lib/imagegen/stored-delivery.ts': 'a92c9dd04aa0cd7de563abffb628bb0c62e3f0b0f490b852956602595ddb9ea3'},
}
CASES = {
    'naumi47-web-capacity-20261029-r1': {
        'commit': R1, 'webId': '340335c02fda0660a141b4fb5290b626520531430d9089135544c8c5f2a3cd32',
        'webBoot': '7e23d02d-39d7-4aaa-8ba7-d885731ae61c',
        'image': 'sha256:6d0b1051e42f46728ab6817fda52001c5f979bca78b28e32f79ff463a006dfdf',
        'workerName': 'naumi47-worker-capacity-20261029-r1',
        'workerId': 'f228e9a3bf7441483568deba259d65a9d08b5d97f987f50b857870406736893b',
        'workerRunning': False,
        'scanIds': {'382f6c0a-8ed0-47e2-95b7-56bf6ed1e713', '39908fcd-b9fa-486b-bf92-a1ea07196bcb'},
        'scanKeys': {'382f6c0a-8ed0-47e2-95b7-56bf6ed1e713': 'recovery-dispatch-scan:ccc262de-b2ca-466e-8b9e-83a5ed2cf754',
                     '39908fcd-b9fa-486b-bf92-a1ea07196bcb': 'recovery-dispatch-scan:5a67d747-0ffb-400c-a347-f672884921e7'},
    },
    'naumi47-web-capacity-20261029-r2': {
        'commit': R2, 'webId': 'ecbd5d9e77aef1f83ce73b4b213d2e2330d20f1f0ac3751386b1c5907d8c6ad2',
        'webBoot': '44bcc943-7234-4291-b403-d2fd7033bfaf',
        'image': 'sha256:25fbae1d9999eb461515830323618aa8871842774e44849fc0aa27ff005f8ca8',
        'workerName': 'naumi47-worker-capacity-20261029-r2',
        'workerId': '9c20833d45e31c7ba93175eab7b469e4d3e1a34b7c1eb173d1eacb1caccb44b0',
        'workerRunning': True,
        'scanIds': {'3b7e0129-1692-4b98-86cc-36ee7d25c7ab', '60f5a125-d57c-4002-8938-c4f64e4e80e6'},
        'scanKeys': {'3b7e0129-1692-4b98-86cc-36ee7d25c7ab': 'recovery-dispatch-scan:1c231015-26a7-4624-8b4b-66b181b9251b',
                     '60f5a125-d57c-4002-8938-c4f64e4e80e6': 'recovery-dispatch-scan:3f36552b-2050-4a19-804b-c94ec23e2f20'},
    },
}
DOMAIN_COUNTS = {'imageJobs', 'canvasImages', 'videoPolls', 'supplierCosts', 'imagegenItems'}
PRESERVATION_TABLES = {'app_image_jobs', 'app_supplier_calls', 'app_billing_operations',
                       'app_gen_reservations', 'app_ledger', 'app_supplier_call_outputs',
                       'app_model_execution_stages'}


def digest(value):
    """Same UTF-8 canonical JSON convention as release47_task_snapshot.sha."""
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _sha(value):
    return isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value) is not None


def _time(value):
    require(isinstance(value, str), 'OBSERVATION_TIMESTAMP_REQUIRED')
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(parsed.tzinfo is not None, 'OBSERVATION_TIMEZONE_REQUIRED')
        return parsed
    except ValueError:
        raise Hold('OBSERVATION_TIMESTAMP_INVALID') from None


def _zero(value):
    return type(value) is int and value == 0


def _identity(value, *, name, identifier, image, running):
    require(isinstance(value, dict) and value.get('name') == name and value.get('id') == identifier
            and value.get('image') == image and value.get('running') is running
            and value.get('restartPolicy') == 'no' and isinstance(value.get('startedAt'), str),
            'PINNED_CONTAINER_IDENTITY_REQUIRED')
    _time(value['startedAt'])


def _preservation(value):
    require(isinstance(value, dict) and set(value) == {'pendingJobIds', 'tables'}, 'BUSINESS_PRESERVATION_REQUIRED')
    ids = value['pendingJobIds']
    require(isinstance(ids, list) and len(ids) == 2 and all(isinstance(v, str) for v in ids) and len(set(ids)) == 2 and
            sum(isinstance(v, str) and v.startswith('job-') for v in ids) == 1 and
            sum(isinstance(v, str) and v.startswith('imagegen-') for v in ids) == 1,
            'EXACT_PENDING_PARENT_CHILD_REQUIRED')
    tables = value['tables']
    require(isinstance(tables, dict) and set(tables) == PRESERVATION_TABLES, 'PRESERVATION_TABLE_COVERAGE_REQUIRED')
    for table, proof in tables.items():
        require(isinstance(proof, dict) and set(proof) == {'rowCount', 'sha256'} and
                type(proof['rowCount']) is int and proof['rowCount'] >= 0 and _sha(proof['sha256']),
                'PRESERVATION_TABLE_PROOF_INVALID')
        if proof['rowCount'] == 0:
            require(proof['sha256'] == digest([]), 'EMPTY_PRESERVATION_ROWS_HASH_MISMATCH')
    require(tables['app_image_jobs']['rowCount'] >= 2 and tables['app_supplier_calls']['rowCount'] >= 1 and
            tables['app_billing_operations']['rowCount'] >= 1, 'PENDING_PAID_GRAPH_INCOMPLETE')


def _scan_rows(rows, case, name):
    require(isinstance(rows, list) and len(rows) == 2 and
            {r.get('id') for r in rows if isinstance(r, dict)} == case['scanIds'], 'EXACT_SCAN_SET_REQUIRED')
    for row in rows:
        require(row.get('instance_id') == name and row.get('boot_id') == case['webBoot'] and
                row.get('activity_kind') == 'accepted-work' and row.get('state') == 'unknown' and
                row.get('work_scope') == 'durable-image' and row.get('outcome') == 'background-promise-unconfirmed' and
                'claim_token' in row and row['claim_token'] is None and
                'finished_at' in row and row['finished_at'] is None and
                row.get('work_key') == case['scanKeys'][row['id']],
                'NOT_EXACT_REJECTED_COORDINATOR')
        require(row.get('admission_key') == row['work_key'], 'SCAN_ADMISSION_KEY_CHANGED')
        require(_time(row['heartbeat_at']) >= _time(row['started_at']), 'SCAN_TIME_ORDER_INVALID')


def _tick(row, case, name):
    if not case['workerRunning']:
        require(row is None, 'STOPPED_WORKER_TICK_NOT_ADJUDICATED')
        return
    require(isinstance(row, dict) and row.get('tick_id') == TICK_ID and
            row.get('worker_instance_id') == case['workerName'] and row.get('worker_boot_id') == WORKER_BOOT and
            row.get('worker_commit') == case['commit'] and row.get('web_instance_id') == name and
            row.get('web_boot_id') == case['webBoot'] and row.get('web_commit') == case['commit'] and
            row.get('phase') == 'unknown' and 'completed_at' in row and row['completed_at'] is None and
            'result' in row and row['result'] is None, 'ORIGINAL_ACCEPTED_UNKNOWN_TICK_REQUIRED')
    _time(row.get('accepted_at'))


def _sample(spec, sample, case, name, now):
    required = {'observedAt', 'canonicalSha256', 'webIdentity', 'workerIdentity', 'webEnvironment', 'workerEnvironment',
                'routingReferences', 'internalReferences', 'activities', 'activitiesCoverage', 'app', 'owners',
                'ownersCoverage', 'domain', 'domainObservedAt', 'preservation', 'tickReceipt', 'workerStatus'}
    require(isinstance(sample, dict) and required.issubset(sample), 'COMPLETE_SAMPLE_REQUIRED')
    observed = _time(sample.get('observedAt'))
    require(0 <= (now - observed).total_seconds() <= 30, 'SAMPLE_STALE')
    require(sample.get('canonicalSha256') == spec['canonicalSha256'], 'CANONICAL_BASELINE_CHANGED')
    for key in ('webIdentity', 'workerIdentity'):
        require(sample.get(key) == spec[key], 'CONTAINER_IDENTITY_DRIFT')
    web_env = sample.get('webEnvironment', {})
    worker_env = sample.get('workerEnvironment', {})
    require('INTERNAL_APP_ORIGIN' in web_env and web_env['INTERNAL_APP_ORIGIN'] in (None, 'http://127.0.0.1:3000') and
            web_env.get('SOURCE_COMMIT') == case['commit'] and web_env.get('NAUMI_VIDEO_WORKER') == '0' and
            web_env.get('MEDIA_WORKER_ORIGIN') == 'http://' + case['workerName'] + ':3002' and
            worker_env.get('SOURCE_COMMIT') == case['commit'] and
            worker_env.get('NAUMI_APP_ORIGIN') == 'http://' + name + ':3000', 'RUNTIME_ORIGIN_OR_COMMIT_DRIFT')
    require(sample.get('routingReferences') == [], 'OLD_SLOT_STILL_ROUTED')
    # A paused, identity-pinned old Worker still has this real configured origin.
    # Preserve it explicitly and require Worker-before-Web retirement. All other
    # live container/control-plane references block, including supervisor refs.
    allowed_refs = [{'source': 'associated-worker', 'containerId': case['workerId'],
                     'environmentKey': 'NAUMI_APP_ORIGIN', 'origin': 'http://' + name + ':3000'}] if case['workerRunning'] else []
    require(sample.get('internalReferences') == allowed_refs, 'OLD_SLOT_INTERNAL_REFERENCES_NOT_ISOLATED')
    rows = sample.get('activities')
    _scan_rows(rows, case, name)
    require(digest(sorted(rows, key=lambda r: r['id'])) == spec['scanRowsSha256'], 'SCAN_ROW_BYTES_CHANGED')
    require(sample.get('activitiesCoverage') == 'all-nonfinished-for-exact-instance-and-boot', 'ACTIVITY_COVERAGE_REQUIRED')
    require(all(_time(r['heartbeat_at']) <= observed for r in rows), 'SCAN_OBSERVATION_FROM_FUTURE')
    app = sample.get('app', {})
    identity = app.get('identity', {})
    require(app.get('schemaVersion') == 1 and identity.get('instanceId') == name and identity.get('bootId') == case['webBoot'] and
            identity.get('commit') == case['commit'] and identity.get('bootSource') == 'preload', 'APP_BOOT_IDENTITY_CHANGED')
    require(0 <= (observed - _time(app.get('observedAt'))).total_seconds() <= 10, 'APP_OBSERVATION_STALE')
    require(app.get('admission', {}).get('mode') == 'draining' and
            type(app.get('admission', {}).get('revision')) is int, 'APP_NOT_DRAINING')
    obs = app.get('observations', {})
    require(all(_zero(obs.get(k)) for k in ['activeRequests', 'trackedRequests', 'trackedAcceptedWork', 'agentRuns']) and
            type(obs.get('unknownLeases')) is int and obs['unknownLeases'] == 2, 'CURRENT_WORK_OR_EXTRA_UNKNOWN')
    transport = app.get('transport', {})
    t = transport.get('transport', {})
    require(transport.get('verified') is True and t.get('completeFromProcessStart') is True and
            t.get('accountingFault') is False and _zero(t.get('activeRequests')) and
            type(t.get('startedRequests')) is int and t['startedRequests'] >= 0 and
            type(t.get('finishedRequests')) is int and t['finishedRequests'] == t['startedRequests'], 'HTTP_NOT_DRAINED')
    owners = sample.get('owners')
    require(isinstance(owners, list) and sample.get('ownersCoverage') == 'all-for-exact-instance' and
            all(o.get('instance_id') == name and o.get('state') == 'idle' for o in owners), 'AGENT_OWNER_NOT_IDLE')
    domain = sample.get('domain', {})
    require(domain.get('schema') == 1 and domain.get('scope') == 'shared-database' and domain.get('drained') is True and
            domain.get('absentTables') == [] and isinstance(domain.get('counts'), dict) and
            set(domain['counts']) == DOMAIN_COUNTS and all(_zero(v) for v in domain['counts'].values()) and
            all(_zero(domain.get(k)) for k in ['activeFences', 'activeTransactions', 'advisoryLocks']), 'DOMAIN_NOT_DRAINED')
    require(0 <= (observed - _time(sample.get('domainObservedAt'))).total_seconds() <= 10, 'DOMAIN_OBSERVATION_STALE')
    preservation = sample.get('preservation')
    _preservation(preservation)
    require(digest(preservation) == spec['preservationSha256'], 'PAID_BUSINESS_BYTES_CHANGED')
    _tick(sample.get('tickReceipt'), case, name)
    require(digest(sample.get('tickReceipt')) == spec['tickReceiptSha256'], 'ORIGINAL_TICK_BYTES_CHANGED')
    worker = sample.get('workerStatus')
    if not case['workerRunning']:
        require(worker is None, 'STOPPED_WORKER_STATUS_MUST_BE_ABSENT')
    else:
        require(isinstance(worker, dict) and worker.get('schemaVersion') == 1 and worker.get('instanceId') == case['workerName'] and
                worker.get('bootId') == WORKER_BOOT and worker.get('commit') == case['commit'] and
                worker.get('targetInstanceId') == name and worker.get('origin') == 'http://' + name + ':3000', 'WORKER_IDENTITY_CHANGED')
        require(0 <= (observed - _time(worker.get('observedAt'))).total_seconds() <= 10, 'WORKER_OBSERVATION_STALE')
        require(worker.get('paused') is True and worker.get('phase') == 'UNKNOWN' and _zero(worker.get('activeTicks')) and
                type(worker.get('unresolvedTicks')) is int and worker['unresolvedTicks'] == 1 and
                worker.get('controlFault') is None, 'WORKER_EXECUTION_NOT_STOPPED')
        last = worker.get('lastTick', {})
        require(last.get('id') == TICK_ID and last.get('phase') == 'unknown' and last.get('workerBootId') == WORKER_BOOT and
                last.get('workerInstanceId') == case['workerName'] and last.get('workerCommit') == case['commit'] and
                last.get('targetWebInstanceId') == name and type(last.get('httpStatus')) is int and last['httpStatus'] == 503 and
                last.get('failure') == {'code': 'TICK_HTTP_ERROR'}, 'ORIGINAL_TICK_HTTP_FAILURE_REQUIRED')
        require(_time(last.get('finishedAt')) >= _time(last.get('startedAt')) and
                _time(last['finishedAt']) <= observed, 'TICK_RESPONSE_TIME_INVALID')
        media = worker.get('mediaWorker', {})
        require(media.get('ok') is True and media.get('version') == case['commit'] and media.get('sandbox') is True and
                media.get('draining') is True and _zero(media.get('running')) and _zero(media.get('queued')),
                'ASSOCIATED_MEDIA_NOT_DRAINED')
    return observed


def adjudicate(spec, samples, *, now=None):
    """Validate a single pinned old Web and its actual associated Worker.

    Returned proof is separate from raw observations. It does not authorize a
    new image, supplier request, historical row rewrite, or generic retirement.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    require(isinstance(now, dt.datetime) and now.tzinfo is not None, 'UTC_EVALUATION_TIME_REQUIRED')
    required = {'target', 'releaseId', 'authorization', 'canonicalSha256', 'webIdentity', 'workerIdentity',
                'sourceHashes', 'scanRows', 'scanRowsSha256', 'tickReceipt', 'tickReceiptSha256',
                'preservation', 'preservationSha256'}
    require(isinstance(spec, dict) and required.issubset(spec), 'COMPLETE_SPEC_REQUIRED')
    require(isinstance(spec, dict) and spec.get('target') == TARGET and spec.get('releaseId') == RELEASE_ID and
            spec.get('authorization') == AUTHORIZATION, 'EXACT_RELEASE_AUTHORIZATION_REQUIRED')
    require(_sha(spec.get('canonicalSha256')), 'CANONICAL_DIGEST_REQUIRED')
    name = spec.get('webIdentity', {}).get('name')
    require(name in CASES, 'UNREVIEWED_SLOT')
    case = CASES[name]
    _identity(spec['webIdentity'], name=name, identifier=case['webId'], image=case['image'], running=True)
    _identity(spec.get('workerIdentity'), name=case['workerName'], identifier=case['workerId'],
              image=case['image'], running=case['workerRunning'])
    require(spec.get('sourceHashes') == SOURCE_HASHES[case['commit']], 'REVIEWED_SOURCE_HASHES_REQUIRED')
    rows = spec.get('scanRows')
    _scan_rows(rows, case, name)
    require(digest(sorted(rows, key=lambda r: r['id'])) == spec.get('scanRowsSha256'), 'ORIGINAL_SCAN_HASH_REQUIRED')
    _tick(spec.get('tickReceipt'), case, name)
    require(digest(spec.get('tickReceipt')) == spec.get('tickReceiptSha256'), 'ORIGINAL_TICK_HASH_REQUIRED')
    _preservation(spec.get('preservation'))
    require(digest(spec['preservation']) == spec.get('preservationSha256'), 'ORIGINAL_PAID_GRAPH_HASH_REQUIRED')
    require(isinstance(samples, list) and len(samples) == 2, 'TWO_SAMPLES_REQUIRED')
    times = [_sample(spec, s, case, name, now) for s in samples]
    require(1 <= (times[1] - times[0]).total_seconds() <= 30, 'STABLE_SAMPLE_INTERVAL_REQUIRED')
    require(_time(samples[1]['app']['observedAt']) > _time(samples[0]['app']['observedAt']) and
            _time(samples[1]['domainObservedAt']) > _time(samples[0]['domainObservedAt']),
            'REUSED_COMPONENT_OBSERVATION')
    if case['workerRunning']:
        require(_time(samples[1]['workerStatus']['observedAt']) > _time(samples[0]['workerStatus']['observedAt']),
                'REUSED_COMPONENT_OBSERVATION')
    require(samples[0]['app']['admission'] == samples[1]['app']['admission'], 'ADMISSION_CHANGED_BETWEEN_SAMPLES')
    require(samples[1]['app']['transport']['transport']['startedRequests'] >= samples[0]['app']['transport']['transport']['startedRequests'],
            'HTTP_COUNTER_REGRESSION')
    return {
        'schemaVersion': 1, 'kind': 'exact-failed-coordinator-adjudication', 'target': TARGET, 'releaseId': RELEASE_ID,
        'webIdentity': dict(spec['webIdentity']), 'workerIdentity': dict(spec['workerIdentity']),
        'observedAt': times[1].isoformat(), 'canonicalSha256': spec['canonicalSha256'],
        'currentExecutableWorkDrained': True, 'coordinatorDisposition': 'settled-with-error',
        'originalResultDisposition': 'unknown-preserved', 'carriedUnknownObservations': 2,
        'activityIds': sorted(case['scanIds']), 'scanRowsSha256': spec['scanRowsSha256'],
        'tickId': TICK_ID if case['workerRunning'] else None, 'tickReceiptSha256': spec['tickReceiptSha256'],
        'sourceCommit': case['commit'], 'sourceHashesSha256': digest(spec['sourceHashes']),
        'businessPreservationSha256': spec['preservationSha256'],
        'sampleSha256': [digest(s) for s in samples], 'specSha256': digest(spec),
        'associatedWorkerDisposition': 'paused-error-coordinator-settled' if case['workerRunning'] else 'already-stopped',
        'requiresAssociatedWorkerRetirementBeforeWeb': case['workerRunning'],
        'retirementOrder': [case['workerId'], case['webId']] if case['workerRunning'] else [case['webId']],
        'mustRecheckReferencesBeforeEachStop': True,
        'historicalDrainProven': False, 'originalTickCompleted': False,
        'paidOutcomeReclassified': False, 'paidTasksReplayed': False, 'databaseMutationRequired': False,
    }
