"""NoUser-only dead-boot preservation. Only exact origin_rows inserts are writes.

sql/write_sql return a list of JSON objects; save is HostTransaction.save.
PG emits raw JSONB strings and hashes: Python never reserializes business rows.
The parent owns live identity/environment verification, locks and worker controls.
"""
import copy
import datetime as dt
import hashlib
import json
import re
from decimal import Decimal

from release47_host import require
from release47_normal_policy import worker_quiescent

ALLOW = {'app_image_jobs', 'app_imagegen_batches', 'app_reference_operations'}
RELATED_KEYS = {'app_billing_operations':'id', 'app_gen_reservations':'job_id',
                'app_supplier_calls':'id', 'app_supplier_cost_jobs':'key'}
TRIGGER_KEYS = {**{table:'id' for table in ALLOW}, **RELATED_KEYS}
CREATE_TRIGGER_ONLY = {'app_imagegen_batches', 'app_reference_operations'}
SCOPES = {'durable-image', 'media-variant', 'reference-sync', 'imagegen-batch'}
IDENT = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}')
SHA = re.compile(r'[a-f0-9]{64}')


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def ids(values):
    require(isinstance(values, (list, tuple)) and len(values) <= 100
            and all(isinstance(v, str) and IDENT.fullmatch(v) for v in values)
            and len(set(values)) == len(values), 'DEAD_BOOT_EXACT_IDS_REQUIRED')
    return ','.join(lit(v) for v in sorted(values)) or 'NULL'


def one(sql, statement):
    rows = sql(statement)
    require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], dict),
            'DEAD_BOOT_SQL_RESULT_INVALID')
    return rows[0]


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'DEAD_BOOT_TIMESTAMP_TZ_REQUIRED')
    return parsed


def review_sha(review):
    # Only metadata/PG hashes are signed; business numeric fields stay raw text.
    return hashlib.sha256(json.dumps(review, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False).encode()).hexdigest()


def _trigger_match(table, key):
    # tgtype=27: ROW(1) + BEFORE(2) + DELETE(8) + UPDATE(16), no other events.
    return f"""EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE t.tgrelid=to_regclass({lit('public.'+table)})
 AND t.tgname='naumi_staging_history_freeze' AND NOT t.tgisinternal
 AND t.tgenabled IN ('O','A') AND t.tgtype=27 AND t.tgqual IS NULL
 AND t.tgnargs=1 AND t.tgargs=convert_to({lit(key)},'UTF8')||decode('00','hex')
 AND n.nspname='naumi_staging_guard' AND p.proname='freeze_imported_row'
 AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype)"""


def _trigger_function_match():
    return """EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='naumi_staging_guard' AND p.proname='freeze_imported_row'
 AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype)"""


def _trigger_apply():
    checks = [f"IF NOT ({_trigger_function_match()}) THEN RAISE EXCEPTION 'DEAD_BOOT_FREEZE_FUNCTION_MISSING'; END IF;"]
    for table, key in sorted(TRIGGER_KEYS.items()):
        exists = f"EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass({lit('public.'+table)}) AND tgname='naumi_staging_history_freeze')"
        if table in CREATE_TRIGGER_ONLY:
            checks.append(f"""IF NOT ({exists}) THEN
CREATE TRIGGER naumi_staging_history_freeze BEFORE UPDATE OR DELETE ON public.{table}
 FOR EACH ROW EXECUTE FUNCTION naumi_staging_guard.freeze_imported_row({lit(key)});
END IF;""")
        checks.append(f"IF NOT ({_trigger_match(table,key)}) THEN RAISE EXCEPTION 'DEAD_BOOT_FREEZE_TRIGGER_INVALID:{table}'; END IF;")
    return '\n'.join(checks)


def _parts(web, app, job_ids, extra_rows):
    ids(job_ids)
    require(isinstance(extra_rows, (list, tuple)) and len(extra_rows) <= 100,
            'DEAD_BOOT_EXTRA_ROWS_INVALID')
    extras = {}
    for row in extra_rows:
        require(row.get('table') in ALLOW, 'DEAD_BOOT_FENCE_TABLE_DENIED')
        ids([row.get('rowKey')])
        require(row.get('keyColumn', 'id') == 'id', 'DEAD_BOOT_FENCE_KEY_DENIED')
        key = (row['table'], row['rowKey'])
        require(key not in extras, 'DEAD_BOOT_EXTRA_DUPLICATE')
        extras[key] = row
    jobs = sorted(set(job_ids) | {key for table, key in extras if table == 'app_image_jobs'})
    ids(jobs)
    batches = sorted(key for table, key in extras if table == 'app_imagegen_batches')
    refs = sorted(key for table, key in extras if table == 'app_reference_operations')
    identity = app.get('identity', {})
    require(identity.get('instanceId') == web.get('name') and identity.get('bootId'),
            'DEAD_BOOT_APP_WEB_IDENTITY_CHANGED')
    active = f"instance_id={lit(web['name'])} AND state<>'finished'"
    return jobs, batches, refs, active


def _query(web, app, job_ids, extra_rows):
    jobs, batches, refs, active = _parts(web, app, job_ids, extra_rows)
    j, b, r = ids(jobs), ids(batches), ids(refs)
    # Exact related sets, including empty sets, are part of the signed review.
    calls = f"SELECT id::text FROM app_supplier_calls WHERE operation_id IN ({j}) OR task_id IN ({j})"
    related = {
        'app_billing_operations': f'id IN ({j})',
        'app_gen_reservations': f'job_id IN ({j})',
        'app_ledger': f"id IN (SELECT 'led-image-'||id FROM app_image_jobs WHERE id IN ({j})) OR id IN (SELECT ledger_id FROM app_billing_operations WHERE id IN ({j}))",
        'app_supplier_calls': f'operation_id IN ({j}) OR task_id IN ({j}) OR parent_call_id::text IN ({calls})',
        'app_supplier_cost_jobs': f"key IN (SELECT 'task:'||id::text FROM app_supplier_calls WHERE operation_id IN ({j}) OR task_id IN ({j})) OR payload->>'operationId' IN ({j}) OR payload->>'taskId' IN ({j}) OR payload->>'callId' IN ({calls})",
        'app_imagegen_batch_items': f'batch_id::text IN ({b})',
        'app_media_postprocess': f'operation_id IN ({j}) OR parent_operation_id IN ({j})',
        'app_supplier_call_outputs': f'call_id::text IN ({calls})',
        'app_supplier_callback_inbox': f'task_id IN ({j}) OR task_id IN (SELECT task_id FROM app_supplier_calls WHERE id::text IN ({calls}))',
    }
    packs = []
    for name, pred in related.items():
        packs.append(f"{lit(name)},(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM {name} x WHERE {pred})")
    # Derive PKs and full-row SHA inside PG from the exact JSONB rowset. No
    # business number is parsed/re-emitted by Python, including numeric(30,0).
    related_fences = []
    for table, key in RELATED_KEYS.items():
        related_fences.append(f"SELECT jsonb_build_object('table',{lit(table)},'keyColumn',{lit(key)},'rowKey',value->>{lit(key)},'sha256',encode(sha256(convert_to(value::text,'UTF8')),'hex')) v FROM jsonb_array_elements(data->{lit(table)})")
    fence_sql = "(SELECT COALESCE(jsonb_agg(v ORDER BY v->>'table',v->>'rowKey'),'[]'::jsonb) FROM (" + ' UNION ALL '.join(related_fences) + ') f)'
    rows = []
    for table, pred in [('app_release_activities', active), ('app_image_jobs', f'id IN ({j})'),
                         ('app_imagegen_batches', f'id::text IN ({b})'),
                         ('app_reference_operations', f'id::text IN ({r})')]:
        rows.append(f"{lit(table)},COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id::text,'raw',to_jsonb(x)::text,'sha256',encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex')) ORDER BY x.id) FROM {table} x WHERE {pred}),'[]'::jsonb)")
    return f"""WITH related AS (SELECT jsonb_build_object({','.join(packs)}) data)
SELECT jsonb_build_object({','.join(rows)},'relatedRaw',data::text,
 'relatedSha256',encode(sha256(convert_to(data::text,'UTF8')),'hex'),
 'relatedFences',{fence_sql}) FROM related"""


def collect_review(sql, web, current_app, job_ids, extra_rows=()):
    """Read-only fresh snapshot. Caller supplies exact job/extra IDs, not discovery."""
    value = one(sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'
                "SET LOCAL statement_timeout='10s';" +
                _query(web, current_app, job_ids, extra_rows) + ';COMMIT;')
    return {'web': copy.deepcopy(web), 'identity': copy.deepcopy(current_app['identity']), **value}


class Guard:
    def __init__(self, cfg, sql, save, *, write_sql=None):
        self.cfg, self.sql, self.save = copy.deepcopy(cfg), sql, save
        self.write_sql = write_sql
        self.review = None
        self.receipt = None
        require(cfg.get('environment', {}).get('NAUMI_ENVIRONMENT') == 'staging'
                and cfg['environment'].get('NAUMI_STAGING_HISTORY_GUARD') == '1',
                'DEAD_BOOT_STAGING_HISTORY_GUARD_REQUIRED')
        require(SHA.fullmatch(cfg.get('expectedReviewSha256', '')),
                'DEAD_BOOT_EXTERNAL_REVIEW_HASH_REQUIRED')

    def _bind(self, web, app):
        require(web == self.cfg['oldWeb'] and app['identity']['bootId'] == self.cfg['currentBoot']
                and app['identity']['instanceId'] == web['name']
                and self.cfg['physicalStartedAt'] == web['startedAt'],
                'DEAD_BOOT_CURRENT_IDENTITY_CHANGED')
        if self.review:
            require(app['identity'] == self.review['identity'], 'DEAD_BOOT_PUBLIC_IDENTITY_CHANGED')

    def _validate(self, review):
        cfg = self.cfg
        require(review_sha(review) == cfg['expectedReviewSha256'], 'DEAD_BOOT_REVIEW_HASH_CHANGED')
        for table, pins in [('app_release_activities', cfg['expectedActivities']),
                            ('app_image_jobs', cfg['expectedJobs'])]:
            require(pins and len(pins) <= 100 and all(IDENT.fullmatch(k) and SHA.fullmatch(v) for k,v in pins.items()),
                    'DEAD_BOOT_EXTERNAL_ROW_PINS_REQUIRED')
            require({r['id']:r['sha256'] for r in review[table]} == pins, 'DEAD_BOOT_ROW_HASH_CHANGED')
        activities = [json.loads(r['raw'], parse_float=Decimal) for r in review['app_release_activities']]
        require(activities and len(activities) <= 100, 'DEAD_BOOT_ACTIVITY_COUNT_INVALID')
        physical = timestamp(cfg['physicalStartedAt'])
        now = dt.datetime.now(dt.timezone.utc)
        jobs = {r['id']:json.loads(r['raw'], parse_float=Decimal) for r in review['app_image_jobs']}
        direct = set()
        for activity in activities:
            require(activity['boot_id'] != cfg['currentBoot'] and activity['instance_id'] == cfg['oldWeb']['name']
                    and activity['activity_kind'] == 'accepted-work' and activity['state'] in ('active','unknown')
                    and activity['work_scope'] in SCOPES, 'DEAD_BOOT_UNREVIEWED_ACTIVITY')
            for key in ('started_at', 'heartbeat_at'):
                require(timestamp(activity[key]) < physical and
                        (now-timestamp(activity[key])).total_seconds() > 600,
                        'DEAD_BOOT_ACTIVITY_NOT_OLD')
            if activity['work_scope'] == 'durable-image':
                prefix, sep, key = (activity.get('work_key') or '').partition(':')
                require(sep and prefix in ('generate','imagegen') and key in jobs,
                        'DEAD_BOOT_JOB_LINK_MISSING')
                job = jobs[key]
                require(job['kind'] == prefix and (job.get('lease_token') is None
                        or str(job['lease_token']) == str(activity.get('claim_token'))),
                        'DEAD_BOOT_JOB_OWNER_CHANGED_REVIEW_REQUIRED')
                if job.get('lease_until'):
                    # A dead owner's TTL may cross the replacement Web start.
                    # Expiry is checked against UTC now, not that start boundary.
                    require(timestamp(job['lease_until']) < now, 'DEAD_BOOT_LIVE_JOB_LEASE')
                direct.add(key)
        require(direct == set(cfg['jobIds']), 'DEAD_BOOT_DIRECT_JOB_SET_CHANGED')
        extras = cfg.get('extraRows', [])
        for row in extras:
            candidates = {r['id']:r['sha256'] for r in review[row['table']]}
            require(candidates.get(row['rowKey']) == row.get('sha256'), 'DEAD_BOOT_EXTRA_ROW_CHANGED')
            if row['table'] == 'app_image_jobs':
                require(row.get('linkProofSha256') == review['relatedSha256'],
                        'DEAD_BOOT_CLOSURE_LINK_PROOF_REQUIRED')
        require(set(jobs) == direct | {r['rowKey'] for r in extras if r['table']=='app_image_jobs'},
                'DEAD_BOOT_JOB_MANIFEST_CHANGED')
        related = review.get('relatedFences')
        require(isinstance(related, list) and len(related) <= 400, 'DEAD_BOOT_RELATED_FENCES_REQUIRED')
        seen = set()
        for row in related:
            require(row.get('table') in RELATED_KEYS
                    and row.get('keyColumn') == RELATED_KEYS[row['table']]
                    and isinstance(row.get('rowKey'), str) and IDENT.fullmatch(row['rowKey'])
                    and isinstance(row.get('sha256'), str) and SHA.fullmatch(row['sha256'])
                    and (row['table'],row['rowKey']) not in seen, 'DEAD_BOOT_RELATED_FENCE_INVALID')
            seen.add((row['table'],row['rowKey']))

    def establish(self, web, app):
        self._bind(web, app)
        review = collect_review(self.sql, web, app, self.cfg['jobIds'], self.cfg.get('extraRows', []))
        self._validate(review)
        self.save('DEAD_BOOT_REVIEW.private.json', review)
        self.review = review
        return review

    def _statement(self, web, app):
        require(self.review is not None, 'DEAD_BOOT_REVIEW_NOT_ESTABLISHED')
        manifest = [(t,r['id'],r['sha256']) for t in ALLOW for r in self.review[t]]
        related = self.review['relatedFences']
        jobs, batches, refs, active = _parts(web, app, self.cfg['jobIds'], self.cfg.get('extraRows', []))
        locks = [f'PERFORM 1 FROM app_release_activities WHERE {active} ORDER BY id FOR UPDATE;']
        for table, keys in [('app_image_jobs',jobs),('app_imagegen_batches',batches),('app_reference_operations',refs)]:
            locks.append(f'PERFORM 1 FROM {table} WHERE id::text IN ({ids(keys)}) ORDER BY id FOR UPDATE;')
        for table, key in RELATED_KEYS.items():
            row_keys = [r['rowKey'] for r in related if r['table'] == table]
            if row_keys:
                locks.append(f'PERFORM 1 FROM {table} WHERE {key}::text IN ('+
                             ','.join(lit(v) for v in sorted(row_keys))+f') ORDER BY {key} FOR UPDATE;')
        # No raw row payload enters SQL: CAS is PG full-row SHA and full closure SHA.
        check = _query(web, app, self.cfg['jobIds'], self.cfg.get('extraRows', []))
        expected = json.dumps({k:v for k,v in self.review.items() if k not in ('web','identity')},
                              ensure_ascii=False, separators=(',', ':'))
        writes = []
        all_fences = [(t,'id',k,h) for t,k,h in manifest] + [
            (r['table'],r['keyColumn'],r['rowKey'],r['sha256']) for r in related]
        for table, key_column, key, digest in sorted(all_fences):
            writes.append(f"""INSERT INTO naumi_staging_guard.origin_rows(table_name,key_column,row_key,snapshot_sha256)
VALUES({lit(table)},{lit(key_column)},{lit(key)},{lit(digest)}) ON CONFLICT DO NOTHING;
IF NOT EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows WHERE table_name={lit(table)}
 AND key_column={lit(key_column)} AND row_key={lit(key)} AND snapshot_sha256={lit(digest)})
THEN RAISE EXCEPTION 'DEAD_BOOT_EXISTING_FENCE_MISMATCH'; END IF;""")
        delimiter = '$deadboot$'
        while delimiter in expected or any(delimiter in statement for statement in writes):
            delimiter = delimiter[:-1] + '_x$'
        # write_sql must accept an explicit transaction, not wrap it READ ONLY.
        return f"""BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SET LOCAL standard_conforming_strings=on;
DO {delimiter} DECLARE observed jsonb; BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('release47-dead-boot-preservation',0));
{''.join(locks)}
SELECT q.v INTO observed FROM ({check}) AS q(v);
IF observed IS DISTINCT FROM {lit(expected)}::jsonb THEN RAISE EXCEPTION 'DEAD_BOOT_FULL_ROW_CAS_CHANGED'; END IF;
{_trigger_apply()}
{''.join(writes)}
END; {delimiter};
COMMIT;
SELECT json_build_object('fencedRows',{len(manifest)},'relatedFencedRows',{len(related)},'carriedOldBootObservations',{len(self.review['app_release_activities'])},
 'currentUnknown',0,'paidReplays',0,'businessRowMutations',0,'reviewSha256',{lit(self.cfg['expectedReviewSha256'])});"""

    def apply(self, web, app):
        self._bind(web, app)
        require(self.write_sql is not None, 'DEAD_BOOT_WRITE_CALLBACK_REQUIRED')
        statement = self._statement(web, app)
        self.save('DEAD_BOOT_FENCE_REQUEST.private.sql', statement.encode())
        receipt = one(self.write_sql, statement)
        expected_fences = sum(len(self.review[t]) for t in ALLOW)
        require(receipt.get('reviewSha256') == self.cfg['expectedReviewSha256']
                and type(receipt.get('fencedRows')) is int and receipt['fencedRows'] == expected_fences
                and type(receipt.get('relatedFencedRows')) is int
                and receipt['relatedFencedRows'] == len(self.review['relatedFences'])
                and type(receipt.get('carriedOldBootObservations')) is int
                and receipt['carriedOldBootObservations'] == len(self.review['app_release_activities'])
                and type(receipt.get('currentUnknown')) is int and receipt['currentUnknown'] == 0
                and receipt.get('businessRowMutations') == 0 and receipt.get('paidReplays') == 0,
                'DEAD_BOOT_FENCE_RECEIPT_INVALID')
        self.receipt = receipt
        self.check(web, app)
        self.save('DEAD_BOOT_FENCE_RECEIPT.json', receipt)
        return receipt

    def check(self, web, app):
        self._bind(web, app)
        require(self.review is not None, 'DEAD_BOOT_REVIEW_NOT_ESTABLISHED')
        current = collect_review(self.sql, web, app, self.cfg['jobIds'], self.cfg.get('extraRows', []))
        self._validate(current)
        if self.receipt:
            trigger_checks = [_trigger_function_match()] + [
                _trigger_match(table,key) for table,key in sorted(TRIGGER_KEYS.items())]
            require(one(self.sql, "SELECT json_build_object('triggerMatch',"+
                        ' AND '.join(trigger_checks)+');').get('triggerMatch') is True,
                    'DEAD_BOOT_FREEZE_TRIGGER_MISSING_OR_CHANGED')
            checks = []
            for table in sorted(ALLOW):
                for row in self.review[table]:
                    checks.append(f"EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows WHERE table_name={lit(table)} AND key_column='id' AND row_key={lit(row['id'])} AND snapshot_sha256={lit(row['sha256'])})")
            for row in self.review['relatedFences']:
                checks.append(f"EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows WHERE table_name={lit(row['table'])} AND key_column={lit(row['keyColumn'])} AND row_key={lit(row['rowKey'])} AND snapshot_sha256={lit(row['sha256'])})")
            require(one(self.sql, "SELECT json_build_object('match',"+' AND '.join(checks)+');')['match'] is True,
                    'DEAD_BOOT_FENCE_MISSING_OR_CHANGED')
        return {'preserved':True, 'reviewSha256':review_sha(current),
                'carriedOldBootObservations':len(current['app_release_activities']), 'currentUnknown':0,
                'relatedFencedRows':len(current['relatedFences'])}


def current_drained(app, domain, worker, owners, review, receipt, *, worker_preserved=False):
    """Separate carried UNKNOWN from genuine current zero; never edit raw app."""
    require(app['identity'] == review['identity'] and receipt.get('reviewSha256') == review_sha(review),
            'DEAD_BOOT_DRAIN_IDENTITY_OR_FENCE_CHANGED')
    n = len(review['app_release_activities'])
    require(n > 0 and receipt.get('carriedOldBootObservations') == n,
            'DEAD_BOOT_DRAIN_ROWSET_CHANGED')
    obs, transport = app.get('observations', {}), app.get('transport', {})
    t = transport.get('transport', {})
    require(app.get('admission', {}).get('mode') == 'draining'
            and type(obs.get('unknownLeases')) is int and obs['unknownLeases'] == n
            and all(type(obs.get(k)) is int and obs[k] == 0 for k in
                    ('activeRequests','trackedRequests','trackedAcceptedWork','agentRuns')),
            'DEAD_BOOT_CURRENT_OR_EXTRA_UNKNOWN_WORK')
    require(transport.get('verified') is True and t.get('completeFromProcessStart') is True
            and t.get('accountingFault') is False and type(t.get('activeRequests')) is int
            and t['activeRequests'] == 0 and type(t.get('startedRequests')) is int
            and t['startedRequests'] == t.get('finishedRequests'), 'DEAD_BOOT_TRANSPORT_NOT_DRAINED')
    require(all(o.get('state') == 'idle' for o in owners), 'DEAD_BOOT_OWNER_NOT_IDLE')
    require(domain.get('drained') is True and domain.get('absentTables') == []
            and set(domain.get('counts', {})) == {'imageJobs','canvasImages','videoPolls','supplierCosts','imagegenItems'}
            and all(type(v) is int and v == 0 for v in domain['counts'].values())
            and all(type(domain.get(k)) is int and domain[k] == 0 for k in
                    ('activeFences','activeTransactions','advisoryLocks')), 'DEAD_BOOT_DOMAIN_NOT_DRAINED')
    require(worker_preserved is True or worker_quiescent(worker), 'DEAD_BOOT_WORKER_NOT_DRAINED')
    return {'kind':'no-user-carried-dead-boot-drain','currentExecutableWorkDrained':True,
            'historicalDrainProven':False,'carriedOldBootObservations':n,'currentUnknown':0,
            'rawApp':copy.deepcopy(app),'rawDomain':copy.deepcopy(domain),
            'rawWorker':copy.deepcopy(worker),'rawOwners':copy.deepcopy(owners)}
