#!/usr/bin/env python3
"""Read-only, repeatable-read preservation snapshot. Never submits, claims or restores work."""
from dataclasses import dataclass, field
import hashlib
import json
import re

try:
    from .release47_host import public_identity
except ImportError:
    from release47_host import public_identity

MAX_BYTES = 16 * 1024 * 1024


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


@dataclass
class Snapshot:
    public: dict
    private: dict = field(repr=False)


# Audited against db.ts, billing/schema.ts, supplier-cost/schema.ts, imagegen/batch-repository.ts,
# reference-workbench/repository.ts, video/{workflow,media-jobs}.ts, release-runtime/store.ts.
# Missing optional tables are explicit unknown; no core migrations or assumed absence=zero.
SPECS = {
    'app_image_jobs': ('id', "COALESCE(j#>>'{snapshot,status}','') NOT IN ('done','error')"),
    'app_canvas_image_tasks': ('id', "COALESCE(j->>'status','') NOT IN ('completed','failed','cancelled')"),
    'app_video_tasks': ('id', "COALESCE(j->>'status','') NOT IN ('completed','failed','cancelled')"),
    'app_reference_operations': ('id', "COALESCE(j->>'state','') NOT IN ('done','preview')"),
    'app_imagegen_batches': ('id', "COALESCE(j->>'state','') NOT IN ('succeeded','partial','failed','cancelled')"),
    'app_imagegen_batch_items': ('child_operation_id', "COALESCE(j->>'state','') NOT IN ('succeeded','failed','cancelled')"),
    'app_video_workflow_run_nodes': ('composite:run_id,node_id', "COALESCE(j->>'status','') NOT IN ('completed','failed','blocked','cancelled')"),
    'app_video_media_jobs': ('id', "COALESCE(j->>'status','') NOT IN ('completed','failed','cancelled')"),
    'app_billing_operations': ('id', "COALESCE(j->>'state','') NOT IN ('settled','released','failed')"),
    # Historical terminal calls with delayed cost accounting are not new model
    # executions. Actual queued cost jobs below pull their exact original calls
    # into the relation closure; do not pull all historic jobs through a price flag.
    # adapters.ts passes external status through, so unknown/running/accepted
    # states must remain active. Only source-audited terminal states are excluded.
    'app_supplier_calls': ('id', "COALESCE(j->>'state','') NOT IN ('completed','failed','cancelled','canceled','rejected','response-received','stream-completed','succeeded','success','pre-submission-failed')"),
    'app_supplier_cost_jobs': ('key', "COALESCE(j->>'state','') <> 'done'"),
    'app_release_session_owners': ('composite:account_key,session_id,kind', "COALESCE(j->>'state','') <> 'idle'"),
    'app_release_activities': ('id', "COALESCE(j->>'state','') <> 'finished'"),
    'app_worker_tick_receipts': ('tick_id', "COALESCE(j->>'phase','') <> 'completed'"),
}
RELATED = {
    'app_video_workflow_runs': ('id', 'id'),
    'app_gen_reservations': ('job_id', 'job_id'),
    'app_billing_reconciliations': ('id', 'operation_id'),
    'app_billing_api_cost_reviews': ('id', 'operation_id'),
    'app_model_execution_stages': ('id', 'operation_id'),
    'app_supplier_call_outputs': ('composite:call_id,output_index', 'call_id'),
    'app_supplier_callback_inbox': ('id', 'task_id'),
    'app_supplier_accounts': ('id', 'id'),
    'app_ledger': ('id', 'id'),
}
KEYS = {**{name: spec[0] for name, spec in SPECS.items()}, **{name: spec[0] for name, spec in RELATED.items()}}
ADDITIVE_TABLES = {'app_release_session_owners', 'app_release_activities', 'app_worker_tick_receipts',
                   # Current release introduces/initializes these on 103; their
                   # actual public catalog absence is retained, never drain=0.
                   'app_reference_operations', 'app_video_media_jobs'}
FROZEN_FIELDS = ['payload', 'provider_snapshot', 'capability_snapshot', 'billing_quote', 'quote', 'plan',
                 'request', 'request_body', 'inputs', 'input_digest', 'plan_digest', 'fingerprint',
                 'request_fingerprint', 'billing_request_fingerprint', 'frozen_nodes_enc', 'base_url',
                 'credential_ref', 'protocol', 'procurement', 'fx', 'model_version', 'billing_version', 'matched_rule_id',
                 'email', 'owner', 'user_email', 'wire_model', 'body', 'prompt', 'source_artwork_id',
                 'video_references', 'source', 'source_id', 'idempotency_key', 'cost', 'size', 'seconds']
# Audited mutations: video/cancellation.ts, video/result-assets.ts, db.ts canvas
# checkpoint/completion, model-config/{apimart-preset,reverse-hub-images}.ts.
# Unknown/new parameter fields stay frozen; do not use an open-ended allow-list.
PARAMETER_PROGRESS_FIELDS = ['submissionState', 'upstreamStarted', 'upstreamResult', 'qualityAudit',
                             'resultAssets', 'resultArtworkIds', 'resultMetadataWarnings',
                             'resultAssetManifest', 'acceptedOutputs', 'preparation']
# reference-workbench/service.ts writes exactly these execution/result fields.
# source/annotated, request plan, quote, inputs and settings remain immutable.
PLAN_PROGRESS_FIELDS = ['state', 'startedAt', 'text', 'error']
PAYLOAD_PROGRESS_FIELDS = ['cancelRequested']  # imagegen/cancel.ts
PROOF_FIELDS = ['id', 'tick_id', 'call_id', 'output_index', 'run_id', 'node_id', 'key', 'job_id', 'session_id', 'kind',
                'account_key', 'phase', 'state', 'status', 'created_at', 'updated_at', 'started_at', 'completed_at',
                'lease_until', 'lease_token', 'lease_id', 'billing_settled', 'reserved_cost', 'cost_status', 'delta',
                'upstream_id', 'upstream_video_id', 'provider_id', 'channel_id', 'account_id', 'task_id',
                'request_id', 'child_operation_id', 'operation_id', 'attempt_id', 'parent_call_id',
                'billing_unit_id', 'public_model_id', 'model', 'actual_model', 'supplier_ref_hash']


def sql_frozen():
    fields = ','.join(literal(v) for v in FROZEN_FIELDS)
    expression = f"COALESCE((SELECT jsonb_object_agg(k,v) FROM jsonb_each(j) e(k,v) WHERE k IN ({fields})),'{{}}'::jsonb)"
    for field, excluded in [('payload', PAYLOAD_PROGRESS_FIELDS), ('parameters', PARAMETER_PROGRESS_FIELDS)]:
        drop = 'ARRAY[' + ','.join(literal(v) for v in excluded) + ']::text[]'
        value = f"CASE WHEN jsonb_typeof(j->{literal(field)})='object' THEN (j->{literal(field)}) - {drop} ELSE j->{literal(field)} END"
        expression += f" || CASE WHEN j ? {literal(field)} THEN jsonb_build_object({literal(field)},{value}) ELSE '{{}}'::jsonb END"
    drop = 'ARRAY[' + ','.join(literal(v) for v in PLAN_PROGRESS_FIELDS) + ']::text[]'
    plans = f"CASE WHEN jsonb_typeof(j->'plans')='array' THEN COALESCE((SELECT jsonb_agg(CASE WHEN jsonb_typeof(v)='object' THEN v - {drop} ELSE v END ORDER BY ordinal) FROM jsonb_array_elements(j->'plans') WITH ORDINALITY e(v,ordinal)),'[]'::jsonb) ELSE j->'plans' END"
    return expression + f" || CASE WHEN j ? 'plans' THEN jsonb_build_object('plans',{plans}) ELSE '{{}}'::jsonb END"


def row_key(row, key):
    if key.startswith('composite:'):
        fields = key[10:].split(',')
        if any(row.get(field) is None for field in fields):
            return None
        return json.dumps([str(row[field]) for field in fields], ensure_ascii=False)
    return str(row[key]) if row.get(key) is not None else None


def sql_key(key):
    if key.startswith('composite:'):
        return 'jsonb_build_array(' + ','.join("j->>" + literal(field) for field in key[10:].split(',')) + ')::text'
    return 'j->>' + literal(key)


def tracked_ids(previous):
    if previous is None:
        return {}
    if isinstance(previous, Snapshot):
        previous = previous.private
    if not isinstance(previous, dict) or previous.get('kind') != 'task-preservation-private-v1':
        raise ValueError('PRIVATE_PRIOR_SNAPSHOT_REQUIRED')
    return {name: sorted({row_key(row, KEYS[name]) for row in table.get('rows', []) if row_key(row, KEYS[name]) is not None})
            for name, table in previous.get('tables', {}).items() if name in KEYS}


def selected_predicate(name, key, prior, roots=None):
    selected = '(' + SPECS.get(name, (None, 'false'))[1] + ')'
    if roots:
        links = {'app_image_jobs': ['id'], 'app_canvas_image_tasks': ['id'], 'app_video_tasks': ['id'],
                 'app_reference_operations': ['id'], 'app_billing_operations': ['id'],
                 'app_supplier_calls': ['id', 'operation_id', 'task_id', 'parent_call_id'],
                 'app_imagegen_batch_items': ['child_operation_id', 'batch_id'],
                 'app_video_workflow_run_nodes': ['run_id', 'task_id'],
                 'app_imagegen_batches': ['id']}.get(name, [])
        if name in RELATED:
            links.append(RELATED[name][1])
        for link in links:
            selected += f" OR j->>{literal(link)} IN ({roots})"
        if name == 'app_image_jobs':
            selected += f" OR regexp_replace(j->>'id','^(imagegen-|gen-|suite-|aplus-)','') IN ({roots})"
        if name == 'app_ledger':
            # Hashable IN semi-join; correlated EXISTS re-evaluated row JSON for
            # every root/prefix on production ledgers and exceeded the 5s cap.
            selected += f" OR j->>'id' IN (SELECT prefix||value FROM ({roots}) q(value) CROSS JOIN (VALUES ('led-image-'),('led-canvas-image-'),('led-video-'),('led-media-'),('')) p(prefix))"
    if prior.get(name):
        selected += ' OR ' + sql_key(key) + ' IN (' + ','.join(literal(v) for v in prior[name]) + ')'
    return selected


def build_sql(*, previous=None, schema='public', row_limit=1000, projection='full', statement_timeout_ms=5000):
    if not re.fullmatch('[a-z_][a-z0-9_]{0,62}', schema) or type(row_limit) is not int or not 1 <= row_limit <= 5000:
        raise ValueError('BOUNDED_SQL_SCOPE_REQUIRED')
    if projection not in ['full', 'proof']:
        raise ValueError('UNKNOWN_TASK_PROJECTION')
    if type(statement_timeout_ms) is not int or not 1000 <= statement_timeout_ms <= 15000:
        raise ValueError('BOUNDED_STATEMENT_TIMEOUT_REQUIRED')
    root_limit = min(40000, row_limit * 8)
    prior = tracked_ids(previous)
    if any(len(values) > 5000 or any(len(v) > 512 for v in values) for values in prior.values()):
        raise ValueError('TRACKED_IDS_EXCEEDED')
    lines = [r'\set ON_ERROR_STOP on', 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
             f"SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='{statement_timeout_ms}ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms';",
             "SELECT jsonb_build_object('kind','begin','database',current_database(),'observedAt',transaction_timestamp(),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'snapshot',txid_current_snapshot()::text);"]
    # Materialize only bounded IDs in psql memory. Every graph-table expansion
    # is an independent <=5s SELECT in the SAME read-only consistent snapshot.
    # This avoids planning/executing a four-level graph for each related column.
    lines += ["\\set materialized_roots_values '[]'", "\\set materialized_roots_within_limit true"]
    for index, name in enumerate(KEYS):
        lines += [f"SELECT (to_regclass({literal(schema + '.' + name)}) IS NOT NULL) AS exists \\gset table_{index}_"]
    for depth in range(4):
        for index, (name, (key, _)) in enumerate(SPECS.items()):
            selected = selected_predicate(name, key, prior, 'SELECT value FROM roots')
            ids = f"{sql_key(key)},j->>'operation_id',j->>'upstream_id',j->>'task_id',j->>'run_id',j->>'ledger_id',j->>'batch_id',j->>'child_operation_id',j->>'account_id',j->>'parent_call_id',j#>>'{{payload,callId}}',j#>>'{{payload,operation}}',j#>>'{{payload,context,operationId}}',regexp_replace(COALESCE(j->>'id',''),'^(imagegen-|gen-|suite-|aplus-)','')"
            paid_ids = "COALESCE((SELECT jsonb_agg(k) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(j#>'{snapshot,paidOperations}')='object' THEN j#>'{snapshot,paidOperations}' ELSE '{}'::jsonb END) k),'[]'::jsonb)"
            expansion = f"SELECT value FROM {schema}.{name} t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x CROSS JOIN LATERAL jsonb_array_elements_text(jsonb_build_array({ids}) || {paid_ids}) q(value) WHERE ({selected}) AND value IS NOT NULL AND value<>''"
            lines += [f'\\if :table_{index}_exists', '\\if :materialized_roots_within_limit',
                      f"WITH roots AS MATERIALIZED (SELECT jsonb_array_elements_text(:'materialized_roots_values'::jsonb) AS value), expanded AS MATERIALIZED ({expansion}), bounded_roots AS (SELECT value FROM roots UNION SELECT value FROM expanded LIMIT {root_limit + 1}) SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb)::text AS values, count(*)<={root_limit} AS within_limit FROM bounded_roots \\gset materialized_roots_",
                      '\\endif', '\\endif']
    for index, (name, key) in enumerate(KEYS.items()):
        reg = schema + '.' + name
        lines += [f"SELECT (to_regclass({literal(reg)}) IS NOT NULL) AS exists \\gset table_{index}_", f'\\if :table_{index}_exists']
        active = SPECS[name][1] if name in SPECS else 'false'
        selected = selected_predicate(name, key, prior, 'SELECT value FROM roots')
        leaf = "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')"
        summary = "(SELECT jsonb_build_object('count',count(*),'sumA',COALESCE(sum(('x'||substr(" + leaf + ",1,16))::bit(64)::bigint::numeric),0)::text,'sumB',COALESCE(sum(('x'||substr(" + leaf + ",17,16))::bit(64)::bigint::numeric),0)::text,'algorithm','sha256-leaf-two-64bit-sums') FROM " + reg + " t)" if name in ['app_ledger', 'app_billing_operations'] else 'null::jsonb'
        output_row = 'j'
        if projection == 'proof':
            # Full immutable originals stay in the readable database backup.
            # This is bounded comparison evidence, not a restore/recovery payload.
            fields = ','.join(literal(v) for v in PROOF_FIELDS)
            frozen_part = sql_frozen()
            output_row = f"COALESCE((SELECT jsonb_object_agg(k,v) FROM jsonb_each(j) e(k,v) WHERE k IN ({fields})),'{{}}'::jsonb) || jsonb_build_object('_preservationProof',true,'_frozenDigest',encode(sha256(convert_to(({frozen_part})::text,'UTF8')),'hex'),'snapshot',jsonb_build_object('status',j#>'{{snapshot,status}}','paidOperations',COALESCE((SELECT jsonb_object_agg(k,jsonb_build_object('model',v->'model','replayable',v->'replayable','gatewayIdentity',v->'gatewayIdentity')) FROM jsonb_each(CASE WHEN jsonb_typeof(j#>'{{snapshot,paidOperations}}')='object' THEN j#>'{{snapshot,paidOperations}}' ELSE '{{}}'::jsonb END) e(k,v)),'{{}}'::jsonb)))"
            if name == 'app_ledger':
                output_row += " || jsonb_build_object('_ledgerRowSha256',encode(sha256(convert_to(j::text,'UTF8')),'hex'))"
        within = 'COALESCE((SELECT sum(octet_length(j::text)) FROM bounded),0)<=' + str(8*1024*1024 if projection == 'proof' else 524288)
        lines += [f"WITH roots AS MATERIALIZED (SELECT jsonb_array_elements_text(:'materialized_roots_values'::jsonb) AS value), selected AS MATERIALIZED (SELECT {output_row} AS j FROM {reg} t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x WHERE {selected}), bounded AS (SELECT j FROM selected ORDER BY {sql_key(key)} LIMIT {row_limit + 1}) SELECT jsonb_build_object('kind','table','table',{literal(name)},'status',CASE WHEN NOT :'materialized_roots_within_limit'::boolean THEN 'unknown-root-limit' WHEN {within} THEN 'observed' ELSE 'unknown-byte-limit' END,'selectedCount',(SELECT count(*) FROM selected),'activeCount',(SELECT count(*) FROM {reg} t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x WHERE {active}),'rows',CASE WHEN {within} THEN COALESCE((SELECT jsonb_agg(j) FROM bounded),'[]'::jsonb) ELSE '[]'::jsonb END,'allSummary',{summary});",
                  '\\else', f"SELECT jsonb_build_object('kind','table','table',{literal(name)},'status','unknown-table-missing','rows','[]'::jsonb);", '\\endif']
    lines += ["SELECT jsonb_build_object('kind','end','database',current_database(),'readOnly',current_setting('transaction_read_only'),'snapshot',txid_current_snapshot()::text);", 'COMMIT;']
    return ('\n'.join(lines) + '\n').encode()


def run_bytes(command, args, *, stdin=None, timeout=30):
    try:
        got = command(args, stdin=stdin, timeout=timeout)
        if isinstance(got, bytes):
            raw = got
        elif got.returncode == 0:
            raw = got.stdout
        else:
            raise ValueError()
        if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
            raise ValueError()
        return raw
    except Exception:
        raise ValueError('TASK_SNAPSHOT_READ_UNAVAILABLE') from None


def summarize(private, *, row_limit=1000):
    tables = {}
    for name, key in KEYS.items():
        item = private.get('tables', {}).get(name, {'status': 'unknown-unobserved', 'rows': []})
        rows = item.get('rows', [])
        valid = isinstance(rows, list) and all(isinstance(row, dict) and row_key(row, key) is not None for row in rows)
        if valid:
            valid = len({row_key(row, key) for row in rows}) == len(rows)
        status = item.get('status', 'unknown') if valid else 'unknown-invalid-rows'
        if valid and (len(rows) > row_limit or item.get('selectedCount', 0) > row_limit):
            status = 'unknown-row-limit'
        identities = sorted(sha([name, row_key(row, key)]) for row in rows) if valid else []
        tables[name] = {'status': status, 'selectedCount': item.get('selectedCount'), 'activeCount': item.get('activeCount'),
                        'identityHashes': identities, 'rowsSha256': sha(rows), 'allProtectedSummary': item.get('allSummary'),
                        'frozenContextsSha256': sha([frozen(row) for row in rows]) if valid else None,
                        'supplierBindingsSha256': sha([supplier_bindings(row) for row in rows]) if valid else None}
    return {'schemaVersion': 1, 'kind': 'read-only-task-preservation-not-drain', 'databaseIdentitySha256': private.get('databaseIdentitySha256'),
            'observedAt': private.get('observedAt'), 'tables': tables, 'privateRowsSha256': sha(private),
            'preservationComplete': bool(tables) and all(item['status'] in ['observed','confirmed-absent-additive'] for item in tables.values()),
            'drainProven': False, 'unknownRemainsUnknown': True}


def supplier_bindings(row):
    fields = ['upstream_id', 'upstream_video_id', 'provider_id', 'channel_id', 'account_id', 'task_id', 'request_id', 'child_operation_id', 'operation_id', 'attempt_id', 'parent_call_id', 'billing_unit_id', 'public_model_id', 'model', 'actual_model', 'supplier_ref_hash']
    values = {key: row[key] for key in fields if row.get(key) not in [None, '']}
    snapshot = row.get('snapshot') or {}
    if isinstance(snapshot, dict):
        paid = snapshot.get('paidOperations', {})
        if isinstance(paid, dict):
            values['paidOperations'] = {key: {name: part.get(name) for name in ['model', 'replayable', 'gatewayIdentity']} for key, part in paid.items() if isinstance(part, dict)}
    return values


def frozen(row):
    if row.get('_preservationProof') is True:
        return {'_frozenDigest': row.get('_frozenDigest')}
    result = {key: row[key] for key in FROZEN_FIELDS if key in row}
    for field, excluded in [('payload', PAYLOAD_PROGRESS_FIELDS), ('parameters', PARAMETER_PROGRESS_FIELDS)]:
        if field in row:
            value = row[field]
            result[field] = {key: part for key, part in value.items() if key not in excluded} if isinstance(value, dict) else value
    if 'plans' in row:
        plans = row['plans']
        result['plans'] = [{key: value for key, value in plan.items() if key not in PLAN_PROGRESS_FIELDS} if isinstance(plan, dict) else plan
                           for plan in plans] if isinstance(plans, list) else plans
    return result


def collect_task_snapshot(command, db_identity, private_save=None, *, previous=None, schema='public', expected_database=None, row_limit=1000, projection='full', allow_absent_tables=(), statement_timeout_ms=5000):
    if set(allow_absent_tables) - ADDITIVE_TABLES:
        raise ValueError('ONLY_SOURCE_AUDITED_NEW_RELEASE_TABLES_MAY_BE_ABSENT')
    if not isinstance(db_identity, dict) or not re.fullmatch('[a-f0-9]{64}', db_identity.get('id', '')):
        raise ValueError('FIXED_DATABASE_IDENTITY_REQUIRED')
    raw_inspect = run_bytes(command, ['docker', 'inspect', db_identity['id']])
    try:
        inspected = json.loads(raw_inspect)
        if len(inspected) != 1 or public_identity(inspected[0]) != db_identity or not db_identity['running']:
            raise ValueError()
        env = dict(value.split('=', 1) for value in inspected[0]['Config'].get('Env', []) if '=' in value)
        user = env.get('POSTGRES_USER') or 'postgres'
        database = env.get('POSTGRES_DB') or user
        if not re.fullmatch('[A-Za-z_][A-Za-z0-9_.-]{0,62}', user) or not re.fullmatch('[A-Za-z_][A-Za-z0-9_.-]{0,62}', database) or expected_database and database != expected_database:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise ValueError('DATABASE_IDENTITY_UNVERIFIED') from None
    sql = build_sql(previous=previous, schema=schema, row_limit=row_limit, projection=projection, statement_timeout_ms=statement_timeout_ms)
    args = ['docker', 'exec', '-i', db_identity['id'], 'psql', '-X', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database]
    raw = run_bytes(command, args, stdin=sql, timeout=120 if statement_timeout_ms==5000 else 300)
    try:
        lines = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
        first, last = lines[0], lines[-1]
        if first.get('kind') != 'begin' or last.get('kind') != 'end' or first.get('database') != database or last.get('database') != database or first.get('readOnly') != 'on' or last.get('readOnly') != 'on' or first.get('isolation') != 'repeatable read' or first.get('snapshot') != last.get('snapshot'):
            raise ValueError()
        tables = {item['table']: item for item in lines[1:-1] if item.get('kind') == 'table'}
        if set(tables) != set(KEYS) or len(lines) != len(KEYS) + 2:
            raise ValueError()
        for name in allow_absent_tables:
            if tables[name].get('status') == 'unknown-table-missing':
                tables[name].update(status='confirmed-absent-additive', rows=[], selectedCount=0, activeCount=None,
                                    absenceEvidence='to_regclass-null-in-repeatable-read-transaction')
    except (ValueError, KeyError, TypeError, IndexError):
        raise ValueError('TASK_SNAPSHOT_TRANSACTION_UNVERIFIED') from None
    # Re-pin DB container after transaction; no observations from a replacement DB are mixed.
    try:
        after = json.loads(run_bytes(command, ['docker', 'inspect', db_identity['id']]))
        unchanged = len(after) == 1 and public_identity(after[0]) == db_identity
    except (ValueError, KeyError, TypeError, IndexError):
        unchanged = False
    if not unchanged:
        raise ValueError('DATABASE_BASELINE_CHANGED')
    private = {'kind': 'task-preservation-private-v1', 'databaseIdentitySha256': sha({'container': db_identity, 'database': database, 'schema': schema}),
               'observedAt': first.get('observedAt'), 'snapshot': first.get('snapshot'), 'rowLimit': row_limit,
               'rowProjection': projection, 'tables': tables}
    public = summarize(private, row_limit=row_limit)
    public['sqlSha256'], public['originalOutputSha256'] = sha(sql), sha(raw)
    if private_save:
        try:
            private_save('task-snapshot-' + sha(raw)[:20] + '.json', canonical(private) + b'\n')
        except Exception:
            raise ValueError('PRIVATE_TASK_SNAPSHOT_PERSIST_FAILED') from None
    return Snapshot(public=public, private=private)


def compare_task_snapshots(before, after):
    before = before.private if isinstance(before, Snapshot) else before
    after = after.private if isinstance(after, Snapshot) else after
    if any(not isinstance(value, dict) or value.get('kind') != 'task-preservation-private-v1' or not re.fullmatch('[a-f0-9]{64}', value.get('databaseIdentitySha256', '')) for value in [before, after]):
        raise ValueError('PRIVATE_BOUND_SNAPSHOTS_REQUIRED')
    summaries = [summarize(value, row_limit=value.get('rowLimit', 1000)) for value in [before, after]]
    violations, unknown, additions, completions = [], [], 0, 0
    if before.get('databaseIdentitySha256') != after.get('databaseIdentitySha256'):
        violations.append({'reason': 'DATABASE_IDENTITY_CHANGED'})
    if before.get('rowProjection', 'full') != after.get('rowProjection', 'full'):
        violations.append({'reason': 'ROW_PROJECTION_CHANGED'})
    for name, key in KEYS.items():
        old, new = before.get('tables', {}).get(name, {}), after.get('tables', {}).get(name, {})
        if old.get('status') == 'confirmed-absent-additive' and name in ADDITIVE_TABLES and (
                summaries[1]['tables'][name]['status'] == 'observed' and new.get('selectedCount') == len(new.get('rows', [])) or
                new.get('status') == 'confirmed-absent-additive' and new.get('selectedCount') == 0 and new.get('rows') == []):
            additions += len(new.get('rows', []))
            continue
        if any(summary['tables'][name]['status'] != 'observed' for summary in summaries) or old.get('selectedCount') != len(old.get('rows', [])) or new.get('selectedCount') != len(new.get('rows', [])):
            unknown.append(name)
            continue
        prior_summary, later_summary = old.get('allSummary'), new.get('allSummary')
        if prior_summary and later_summary:
            if later_summary['count'] < prior_summary['count'] or name == 'app_ledger' and later_summary['count'] == prior_summary['count'] and later_summary != prior_summary:
                violations.append({'table': name, 'reason': 'PROTECTED_GLOBAL_COUNT_OR_HASH_REGRESSION'})
        current = {row_key(row, key): row for row in new.get('rows', [])}
        original = {row_key(row, key): row for row in old.get('rows', [])}
        additions += len(set(current) - set(original))
        for identifier, row in original.items():
            ref = {'table': name, 'identitySha256': sha([name, identifier])}
            if identifier not in current:
                violations.append({**ref, 'reason': 'PRESERVED_ROW_MISSING'})
                continue
            latest = current[identifier]
            previous_bindings, new_bindings = supplier_bindings(row), supplier_bindings(latest)
            for field_name, value in previous_bindings.items():
                valid = all(new_bindings.get(field_name, {}).get(operation) == binding for operation,binding in value.items()) if field_name == 'paidOperations' else new_bindings.get(field_name) == value
                if not valid:
                    violations.append({**ref, 'reason': 'ORIGINAL_SUPPLIER_BINDING_CHANGED', 'field': field_name})
            if frozen(row) != frozen(latest):
                violations.append({**ref, 'reason': 'FROZEN_CONTEXT_CHANGED'})
            if name == 'app_ledger' and row != latest:
                violations.append({**ref, 'reason': 'ORIGINAL_LEDGER_ROW_CHANGED'})
            for stamp in ['created_at', 'updated_at']:
                if row.get(stamp) and latest.get(stamp) and latest[stamp] < row[stamp]:
                    violations.append({**ref, 'reason': 'ROW_TIMESTAMP_REGRESSION', 'field': stamp})
            for mutable_state in ['state', 'status']:
                if row.get(mutable_state) != latest.get(mutable_state):
                    if row.get(mutable_state) in ['done', 'completed', 'succeeded', 'settled', 'released', 'cancelled']:
                        violations.append({**ref, 'reason': 'TERMINAL_STATE_REGRESSION'})
                    completions += 1
    return {'schemaVersion': 1, 'noMissingJobs': not any(v['reason'] == 'PRESERVED_ROW_MISSING' for v in violations),
            'noOriginalSupplierMutation': not any(v['reason'] == 'ORIGINAL_SUPPLIER_BINDING_CHANGED' for v in violations),
            'preservationVerified': not violations and not unknown, 'violations': violations, 'unknownTables': unknown,
            'newRowsAllowed': additions, 'stateTransitionsAllowed': completions, 'drainProven': False}
