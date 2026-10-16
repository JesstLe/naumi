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
    'app_supplier_calls': ('id', "COALESCE(j->>'cost_status','') NOT IN ('reported','reconciled') OR COALESCE(j->>'state','') IN ('submitting','submitted','pending','unknown','processing','queued')"),
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


def row_key(row, key):
    if key.startswith('composite:'):
        return json.dumps([str(row[field]) if row.get(field) is not None else None for field in key[10:].split(',')], ensure_ascii=False)
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
            selected += f" OR EXISTS(SELECT 1 FROM ({roots}) q(value) WHERE j->>'id' IN ('led-image-'||q.value,'led-video-'||q.value,'led-media-'||q.value,q.value))"
    if prior.get(name):
        selected += ' OR ' + sql_key(key) + ' IN (' + ','.join(literal(v) for v in prior[name]) + ')'
    return selected


def build_sql(*, previous=None, schema='public', row_limit=1000):
    if not re.fullmatch('[a-z_][a-z0-9_]{0,62}', schema) or type(row_limit) is not int or not 1 <= row_limit <= 5000:
        raise ValueError('BOUNDED_SQL_SCOPE_REQUIRED')
    prior = tracked_ids(previous)
    if any(len(values) > 5000 or any(len(v) > 512 for v in values) for values in prior.values()):
        raise ValueError('TRACKED_IDS_EXCEEDED')
    lines = [r'\set ON_ERROR_STOP on', 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
             "SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='5000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms';",
             "SELECT jsonb_build_object('kind','begin','database',current_database(),'observedAt',transaction_timestamp(),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'snapshot',txid_current_snapshot()::text);"]
    # psql text variable consists only of audited SQL literals. It does not evaluate user/DB commands.
    # Three bounded graph hops: active batch -> terminal child -> terminal call ->
    # original account/output. Each CTE is referenced, never text-expanded recursively.
    for depth in range(4):
        unions = []
        for name, (key, _) in SPECS.items():
            roots = f'SELECT value FROM roots{depth - 1}' if depth else None
            selected = selected_predicate(name, key, prior, roots)
            union = f"SELECT value FROM {schema}.{name} t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x CROSS JOIN LATERAL jsonb_array_elements_text(jsonb_build_array({sql_key(key)},j->>'operation_id',j->>'upstream_id',j->>'task_id',j->>'run_id',j->>'ledger_id',j->>'batch_id',j->>'child_operation_id',j->>'account_id',j->>'parent_call_id',j#>>'{{payload,callId}}',regexp_replace(COALESCE(j->>'id',''),'^(imagegen-|gen-|suite-|aplus-)',''))) q(value) WHERE ({selected}) AND value IS NOT NULL AND value<>''"
            unions.append('(' + literal(schema + '.' + name) + ',' + literal(union) + ')')
        inherited = literal(f'SELECT value FROM roots{depth - 1} UNION ') + ' || ' if depth else ''
        lines += ["SELECT " + inherited + "COALESCE(string_agg(part,' UNION '),'SELECT NULL::text WHERE false') AS query FROM (VALUES " + ','.join(unions) + f") v(name,part) WHERE to_regclass(name) IS NOT NULL \\gset roots{depth}_"]
    ctes = " || ',' || ".join(literal(f'roots{n} AS (') + f" || :'roots{n}_query' || ')'" for n in range(4))
    lines += ["SELECT 'WITH ' || " + ctes + " || ' SELECT value FROM roots3' AS query \\gset roots_"]
    for index, (name, key) in enumerate(KEYS.items()):
        reg = schema + '.' + name
        lines += [f"SELECT (to_regclass({literal(reg)}) IS NOT NULL) AS exists \\gset table_{index}_", f'\\if :table_{index}_exists']
        active = SPECS[name][1] if name in SPECS else 'false'
        selected = selected_predicate(name, key, prior, ':roots_query')
        leaf = "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')"
        summary = "(SELECT jsonb_build_object('count',count(*),'sumA',COALESCE(sum(('x'||substr(" + leaf + ",1,16))::bit(64)::bigint::numeric),0)::text,'sumB',COALESCE(sum(('x'||substr(" + leaf + ",17,16))::bit(64)::bigint::numeric),0)::text,'algorithm','sha256-leaf-two-64bit-sums') FROM " + reg + " t)" if name in ['app_ledger', 'app_billing_operations'] else 'null::jsonb'
        within = "COALESCE((SELECT sum(octet_length(j::text)) FROM bounded),0)<=524288"
        lines += [f"WITH selected AS (SELECT j FROM {reg} t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x WHERE {selected}), bounded AS (SELECT j FROM selected ORDER BY {sql_key(key)} LIMIT {row_limit + 1}) SELECT jsonb_build_object('kind','table','table',{literal(name)},'status',CASE WHEN {within} THEN 'observed' ELSE 'unknown-byte-limit' END,'selectedCount',(SELECT count(*) FROM selected),'activeCount',(SELECT count(*) FROM {reg} t CROSS JOIN LATERAL (SELECT to_jsonb(t) j) x WHERE {active}),'rows',CASE WHEN {within} THEN COALESCE((SELECT jsonb_agg(j) FROM bounded),'[]'::jsonb) ELSE '[]'::jsonb END,'allSummary',{summary});",
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
            'preservationComplete': bool(tables) and all(item['status'] == 'observed' for item in tables.values()),
            'drainProven': False, 'unknownRemainsUnknown': True}


def supplier_bindings(row):
    fields = ['upstream_id', 'upstream_video_id', 'provider_id', 'channel_id', 'account_id', 'task_id', 'request_id', 'child_operation_id', 'operation_id', 'attempt_id', 'parent_call_id', 'billing_unit_id', 'public_model_id', 'model', 'actual_model']
    values = {key: row[key] for key in fields if row.get(key) not in [None, '']}
    snapshot = row.get('snapshot') or {}
    if isinstance(snapshot, dict):
        paid = snapshot.get('paidOperations', {})
        if isinstance(paid, dict):
            values['paidOperations'] = {key: {name: part.get(name) for name in ['model', 'replayable', 'gatewayIdentity']} for key, part in paid.items() if isinstance(part, dict)}
    return values


def frozen(row):
    result = {key: row[key] for key in ['payload', 'provider_snapshot', 'capability_snapshot', 'billing_quote', 'quote', 'plan', 'request', 'request_body', 'inputs', 'input_digest', 'plan_digest', 'fingerprint', 'request_fingerprint', 'billing_request_fingerprint', 'frozen_nodes_enc', 'base_url', 'credential_ref', 'protocol', 'procurement', 'fx', 'model_version', 'billing_version', 'matched_rule_id'] if key in row}
    parameters = row.get('parameters')
    if isinstance(parameters, dict):
        result['parameters'] = {key: parameters[key] for key in ['modelExecutions', 'byocSnapshot', 'submissionVersion', 'frozenStage'] if key in parameters}
    return result


def collect_task_snapshot(command, db_identity, private_save=None, *, previous=None, schema='public', expected_database=None, row_limit=1000):
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
    sql = build_sql(previous=previous, schema=schema, row_limit=row_limit)
    args = ['docker', 'exec', '-i', db_identity['id'], 'psql', '-X', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database]
    raw = run_bytes(command, args, stdin=sql, timeout=120)
    try:
        lines = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
        first, last = lines[0], lines[-1]
        if first.get('kind') != 'begin' or last.get('kind') != 'end' or first.get('database') != database or last.get('database') != database or first.get('readOnly') != 'on' or last.get('readOnly') != 'on' or first.get('isolation') != 'repeatable read' or first.get('snapshot') != last.get('snapshot'):
            raise ValueError()
        tables = {item['table']: item for item in lines[1:-1] if item.get('kind') == 'table'}
        if set(tables) != set(KEYS) or len(lines) != len(KEYS) + 2:
            raise ValueError()
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
               'observedAt': first.get('observedAt'), 'snapshot': first.get('snapshot'), 'rowLimit': row_limit, 'tables': tables}
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
    for name, key in KEYS.items():
        old, new = before.get('tables', {}).get(name, {}), after.get('tables', {}).get(name, {})
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
