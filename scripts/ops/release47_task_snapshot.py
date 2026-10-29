#!/usr/bin/env python3
"""Budgeted, primary-key-paged read-only preservation evidence, never recovery.

A single bounded REPEATABLE READ transaction is essential: separate page
transactions cannot prove a graph at one instant under concurrent writes. Only
small graph/proof projections cross the connection, never image results in proof
mode. PostgreSQL session-local GUCs hold bounded traversal state, not temp tables.
"""
from dataclasses import dataclass, field
import hashlib
import json
import re

try:
    from .release47_host import public_identity
except ImportError:
    from release47_host import public_identity

MAX_BYTES = 16 * 1024 * 1024
PROOF_VERSION = 3  # Paid state and exact global ledger leaves are now evidence.
# Only the dedicated-site caller narrows release observations. Its separate
# HistoricalEvidence guard protects excluded, unfinished historical observations.
# Business task, supplier and ledger tables never use this source restriction.
ACTIVITY_INSTANCE_SCOPE = ()


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
                 'video_references', 'source', 'source_id', 'idempotency_key', 'cost', 'size', 'seconds', 'ledger_id',
                 'protocol_version', 'nonacceptance_at', 'accepted_at']
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
PROOF_FIELDS = ['id', 'batch_id', 'tick_id', 'call_id', 'output_index', 'run_id', 'node_id', 'key', 'job_id', 'session_id', 'kind',
                'account_key', 'phase', 'state', 'status', 'created_at', 'updated_at', 'started_at', 'completed_at',
                'lease_until', 'lease_token', 'lease_id', 'billing_settled', 'reserved_cost', 'cost_status', 'delta',
                'upstream_id', 'upstream_video_id', 'provider_id', 'channel_id', 'account_id', 'task_id',
                'request_id', 'child_operation_id', 'operation_id', 'attempt_id', 'parent_call_id',
                'billing_unit_id', 'public_model_id', 'model', 'actual_model', 'supplier_ref_hash', 'ledger_id']


def sql_frozen():
    fields = ','.join(literal(v) for v in FROZEN_FIELDS)
    expression = f"COALESCE((SELECT jsonb_object_agg(k,j->k) FROM unnest(ARRAY[{fields}]::text[]) e(k) WHERE j ? k),'{{}}'::jsonb)"
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


# Discover the graph using narrow IDs/state, not base64 payloads or full receipts.
# Catalog projection tolerates additive/older schemas; selected rows are still
# hashed only after selection, inside the same budgeted snapshot.
GRAPH_FIELDS = ['id','key','tick_id','call_id','output_index','node_id','job_id','session_id','kind',
    'account_key','state','status','phase','operation_id','upstream_id','task_id','run_id',
    'ledger_id','batch_id','child_operation_id','account_id','parent_call_id','snapshot','payload']


def graph_projection_sql(reg):
    fields=','.join(literal(v) for v in GRAPH_FIELDS)
    paid="CASE WHEN jsonb_typeof(snapshot->'paidOperations')='object' THEN snapshot->'paidOperations' ELSE '{}'::jsonb END"
    children="CASE WHEN jsonb_typeof(snapshot->'children')='object' THEN snapshot->'children' ELSE '{}'::jsonb END"
    snapshot=("jsonb_build_object('status',snapshot->'status','childJobIds',COALESCE((SELECT jsonb_agg(v->>'jobId') FROM jsonb_each("+children+")e(k,v) WHERE jsonb_typeof(v->'jobId')='string'),'[]'::jsonb),'operationIds',COALESCE((SELECT jsonb_agg(id) FROM (SELECT k AS id FROM jsonb_each("+paid+") e(k,v) UNION SELECT c.k FROM jsonb_each("+paid+") e(k,v) CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(v->'children')='object' THEN v->'children' ELSE '{}'::jsonb END)c(k,v))ids),'[]'::jsonb)) AS snapshot")
    payload="jsonb_build_object('callId',payload->'callId','operation',payload->'operation','context',jsonb_build_object('operationId',payload#>'{context,operationId}')) AS payload"
    # Ledger leaves are tied to original IDs, not just an additive table sum.
    # They live in the already byte/row-bounded graph; only hashes leave SQL.
    leaf = ",encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS \"_ledgerRowSha256\""
    extra = ' || ' + literal(leaf) if reg.endswith('.app_ledger') else ''
    return f"SELECT string_agg(CASE WHEN attname='snapshot' THEN {literal(snapshot)} WHEN attname='payload' THEN {literal(payload)} ELSE quote_ident(attname) END,',' ORDER BY attnum){extra} AS projection FROM pg_attribute WHERE attrelid=to_regclass({literal(reg)}) AND attnum>0 AND NOT attisdropped AND attname IN ({fields})"


def paid_proof_sql():
    # Current durable-image-jobs stores indexed attempts exactly one level below
    # each paid root. Deeper/invalid evidence is explicitly unverified, not lost.
    part="jsonb_build_object('state',v->'state','model',v->'model','replayable',v->'replayable','gatewayIdentity',v->'gatewayIdentity')"
    child="COALESCE((SELECT jsonb_object_agg(c.k,jsonb_build_object('state',c.v->'state','model',c.v->'model','replayable',c.v->'replayable','gatewayIdentity',c.v->'gatewayIdentity','_unverified',jsonb_typeof(c.v)<>'object' OR c.v ? 'children')) FROM jsonb_each(CASE WHEN jsonb_typeof(v->'children')='object' THEN v->'children' ELSE '{}'::jsonb END)c(k,v)),'{}'::jsonb)"
    paid="COALESCE((SELECT jsonb_object_agg(k,"+part+" || jsonb_build_object('children',"+child+",'_unverified',jsonb_typeof(v)<>'object' OR v ? 'children' AND jsonb_typeof(v->'children')<>'object')) FROM jsonb_each(CASE WHEN jsonb_typeof(snapshot->'paidOperations')='object' THEN snapshot->'paidOperations' ELSE '{}'::jsonb END)e(k,v)),'{}'::jsonb)"
    child_jobs="COALESCE((SELECT jsonb_object_agg(k,jsonb_build_object('jobId',v->'jobId')) FROM jsonb_each(CASE WHEN jsonb_typeof(snapshot->'children')='object' THEN snapshot->'children' ELSE '{}'::jsonb END)e(k,v) WHERE v ? 'jobId'),'{}'::jsonb)"
    invalid_child="EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(snapshot->'children')='object' THEN snapshot->'children' ELSE '{}'::jsonb END)e(k,v) WHERE jsonb_typeof(v)<>'object' OR v ? 'jobId' AND jsonb_typeof(v->'jobId')<>'string')"
    return "jsonb_build_object('status',snapshot->'status','paidOperations',"+paid+",'children',"+child_jobs+",'_proofVersion',"+str(PROOF_VERSION)+",'_unverified',snapshot ? 'paidOperations' AND jsonb_typeof(snapshot->'paidOperations')<>'object' OR snapshot ? 'children' AND jsonb_typeof(snapshot->'children')<>'object' OR jsonb_typeof(snapshot) IS DISTINCT FROM 'object' OR "+invalid_child+") AS snapshot"



def image_job_native_proof_projection_sql(reg):
    """Hash native frozen columns before constructing the small proof row.

    A wide materialized row JSON makes every j->field copy/detoast its payload.
    Catalog-selected native expressions preserve missing versus SQL-null fields
    and exactly the sql_frozen normalization, without carrying payload into j.
    """
    frozen_fields = ','.join(literal(v) for v in sorted(set(FROZEN_FIELDS + ['parameters', 'plans'])))
    proof_fields = ','.join(literal(v) for v in PROOF_FIELDS)
    cases = []
    for name, excluded in [('payload', PAYLOAD_PROGRESS_FIELDS), ('parameters', PARAMETER_PROGRESS_FIELDS)]:
        drop = 'ARRAY[' + ','.join(literal(v) for v in excluded) + ']::text[]'
        value = f'COALESCE(to_jsonb("{name}"),\'null\'::jsonb)'
        normalized = f"CASE WHEN jsonb_typeof({value})='object' THEN {value} - {drop} ELSE {value} END"
        cases.append(f"WHEN attname={literal(name)} THEN {literal(normalized)}")
    drop = 'ARRAY[' + ','.join(literal(v) for v in PLAN_PROGRESS_FIELDS) + ']::text[]'
    value = 'COALESCE(to_jsonb("plans"),\'null\'::jsonb)'
    plans = f"CASE WHEN jsonb_typeof({value})='array' THEN COALESCE((SELECT jsonb_agg(CASE WHEN jsonb_typeof(v)='object' THEN v - {drop} ELSE v END ORDER BY ordinal) FROM jsonb_array_elements({value}) WITH ORDINALITY e(v,ordinal)),'[]'::jsonb) ELSE {value} END"
    cases.append(f"WHEN attname='plans' THEN {literal(plans)}")
    snapshot = paid_proof_sql()
    missing_snapshot = "jsonb_build_object('status',null,'paidOperations','{}'::jsonb) AS snapshot"
    prefix = 'true AS "_preservationProof",encode(sha256(convert_to(jsonb_build_object('
    suffix = ')::text,\'UTF8\')),\'hex\') AS "_frozenDigest",'
    return (f"WITH cols AS (SELECT attname,attnum FROM pg_attribute WHERE attrelid=to_regclass({literal(reg)}) AND attnum>0 AND NOT attisdropped) "
            f"SELECT COALESCE(string_agg(quote_ident(attname),',' ORDER BY attnum) FILTER (WHERE attname IN ({proof_fields})) || ',','') || {literal(prefix)} || "
            f"COALESCE(string_agg(quote_literal(attname)||','||(CASE {' '.join(cases)} ELSE 'to_jsonb('||quote_ident(attname)||')' END),',' ORDER BY attnum) FILTER (WHERE attname IN ({frozen_fields})), '') || {literal(suffix)} || "
            f"COALESCE(max(CASE WHEN attname='snapshot' THEN {literal(snapshot)} END),{literal(missing_snapshot)}) AS proof_projection FROM cols")


def proof_projection_sql(reg):
    if reg.rsplit('.', 1)[-1] == 'app_image_jobs':
        return image_job_native_proof_projection_sql(reg)
    scope_fields=['instance_id'] if ACTIVITY_INSTANCE_SCOPE and reg.rsplit('.',1)[-1]=='app_release_activities' else []
    fields=','.join(literal(v) for v in sorted(set(PROOF_FIELDS+FROZEN_FIELDS+['parameters','plans','snapshot']+scope_fields)))
    # The existing proof never retained output images or raw supplier receipts.
    # Project its exact paid binding fields before row JSON construction so those
    # large values are not copied into every proof-field lookup.
    snapshot = paid_proof_sql()
    return f"SELECT string_agg(CASE WHEN attname='snapshot' THEN {literal(snapshot)} ELSE quote_ident(attname) END,',' ORDER BY attnum) AS proof_projection FROM pg_attribute WHERE attrelid=to_regclass({literal(reg)}) AND attnum>0 AND NOT attisdropped AND attname IN ({fields})"


# These ceilings bound one consistent observation, not production capacity.
DEFAULT_BUDGET = {'page_rows': 128, 'scan_rows': 100000, 'selected_rows': 20000,
                  'pages': 2048, 'graph_bytes': 8 * 1024 * 1024,
                  'proof_bytes': 8 * 1024 * 1024, 'page_bytes': 1024 * 1024,
                  'seconds': 60, 'roots': 40000}
# Defaults remain conservative; only an explicit, measured collection may use
# the larger metadata graph/page envelope. Time, rows, proof/output and closure
# bounds do not expand, and this does not change any business execution limit.
MAX_BUDGET = {**DEFAULT_BUDGET, 'page_rows': 1024, 'graph_bytes': 32 * 1024 * 1024}
STATE = "current_setting('naumi_snapshot.state')::jsonb"


def budgets(overrides=None):
    result = dict(DEFAULT_BUDGET)
    if overrides is not None:
        if not isinstance(overrides, dict) or set(overrides) - set(result):
            raise ValueError('UNKNOWN_SNAPSHOT_BUDGET')
        result.update(overrides)
    if any(type(v) is not int or not 1 <= v <= MAX_BUDGET[k] for k, v in result.items()):
        raise ValueError('BOUNDED_GLOBAL_BUDGET_REQUIRED')
    return result


def setting(name):
    return f"current_setting('naumi_snapshot.{name}')::jsonb"


def save_setting(name, expression):
    return f"set_config('naumi_snapshot.{name}',({expression})::text,true)"


def key_fields(key):
    return key[10:].split(',') if key.startswith('composite:') else [key]


def native_scan_predicate(name, previous_ids=()):
    if name not in ['app_release_activities','app_worker_tick_receipts'] or not ACTIVITY_INSTANCE_SCOPE:
        return 'true'
    if (not isinstance(ACTIVITY_INSTANCE_SCOPE, tuple) or len(ACTIVITY_INSTANCE_SCOPE) != 2 or
            len(set(ACTIVITY_INSTANCE_SCOPE)) != 2 or any(
                not isinstance(n, str) or not re.fullmatch('naumi47-web-[a-z0-9-]+', n)
                for n in ACTIVITY_INSTANCE_SCOPE)):
        raise ValueError('CURRENT_ACTIVITY_PAIR_REQUIRED')
    key = 'id' if name=='app_release_activities' else 'tick_id'
    prior = 't.'+key+' IN ('+','.join(literal(v) for v in previous_ids)+')' if previous_ids else 'false'
    active = ("t.instance_id IN (" + ','.join(literal(n) for n in ACTIVITY_INSTANCE_SCOPE) +
              ") AND COALESCE(t.state,'')<>'finished'") if name=='app_release_activities' else "COALESCE(t.phase,'')<>'completed'"
    # These observation leaves have no graph links (incoming business edges).
    # Original IDs remain native-key probes even after completion or relocation.
    return '(('+active+') OR '+prior+')'


def catalog_sql(reg, key, required_fields=()):
    """Use the real PK, including composite UUID/int keys, without text casts in WHERE.

    KEYS is the business identity (batch child operation), not necessarily the PK.
    Missing PK/identity columns stay unknown; never paginate an unverified heap.
    """
    cursor = setting('cursor')
    required_names = list(dict.fromkeys([*key_fields(key), *required_fields]))
    required = ','.join(literal(v) for v in required_names)
    return f"""WITH cols AS (SELECT attname,attnum,atttypid,atttypmod FROM pg_attribute
      WHERE attrelid=to_regclass({literal(reg)}) AND attnum>0 AND NOT attisdropped),
    pk AS (SELECT a.*,k.n FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,n)
      JOIN cols a ON a.attnum=k.attnum WHERE i.indrelid=to_regclass({literal(reg)}) AND i.indisprimary AND i.indisvalid)
    SELECT count(*)>0 AND (SELECT count(*) FROM cols WHERE attname IN ({required}))={len(required_names)} AS key_verified,
      COALESCE(string_agg(quote_ident(attname),',' ORDER BY n),'id') AS pk,
      COALESCE(string_agg('t.'||quote_ident(attname),',' ORDER BY n),'t.id') AS order_pk,
      COALESCE(string_agg('t.'||quote_ident(attname)||' DESC',',' ORDER BY n),'t.id DESC') AS reverse_pk,
      COALESCE(string_agg('t.'||quote_ident(attname)||'=k.'||quote_ident(attname),' AND ' ORDER BY n),'false') AS join_pk,
      COALESCE('jsonb_build_array('||string_agg('t.'||quote_ident(attname)||'::text',',' ORDER BY n)||')','null::jsonb') AS cursor_value,
      COALESCE('ROW('||string_agg('t.'||quote_ident(attname),',' ORDER BY n)||') > ROW('||
        string_agg('('||{literal(cursor)}||'->>'||(n-1)::text||')::'||format_type(atttypid,atttypmod),',' ORDER BY n)||')','false') AS seek
    FROM pk"""


def graph_links(name):
    links = {'app_image_jobs': ['id'], 'app_canvas_image_tasks': ['id'], 'app_video_tasks': ['id'],
             'app_reference_operations': ['id'], 'app_billing_operations': ['id'],
             'app_supplier_calls': ['id', 'operation_id', 'task_id', 'parent_call_id'],
             'app_imagegen_batch_items': ['child_operation_id', 'batch_id'],
             'app_video_workflow_run_nodes': ['run_id', 'task_id'], 'app_imagegen_batches': ['id']}.get(name, [])
    if name in RELATED:
        links = [*links, RELATED[name][1]]
    values = ["j->>" + literal(v) for v in links]
    if name == 'app_image_jobs':
        values.append("regexp_replace(j->>'id','^(imagegen-|gen-|suite-|aplus-)','')")
    if name == 'app_ledger':
        values.append("regexp_replace(j->>'id','^(led-image-|led-canvas-image-|led-video-|led-media-)','')")
    result = 'jsonb_build_array(' + ','.join(values) + ')'
    if name == 'app_image_jobs':
        # Reverse edge as well: an active child must retain its terminal parent.
        result += " || COALESCE(j#>'{snapshot,childJobIds}','[]'::jsonb)"
    return result


def graph_out(key):
    fields = ['operation_id','upstream_id','task_id','run_id','ledger_id','batch_id',
              'child_operation_id','account_id','parent_call_id']
    values = [sql_key(key), *("j->>"+literal(v) for v in fields),
              "j#>>'{payload,callId}'", "j#>>'{payload,operation}'", "j#>>'{payload,context,operationId}'",
              "regexp_replace(COALESCE(j->>'id',''),'^(imagegen-|gen-|suite-|aplus-)','')"]
    return 'jsonb_build_array(' + ','.join(values) + ") || COALESCE(j#>'{snapshot,operationIds}','[]'::jsonb) || COALESCE(j#>'{snapshot,childJobIds}','[]'::jsonb)"


def deadline_sql(budget, statement_timeout_ms):
    # The next statement cannot consume a fresh full timeout near the deadline.
    # GUC writes are session-local, rolled back with this read-only transaction.
    expired = "s || CASE WHEN ms<=0 THEN '{\"ok\":false,\"reason\":\"unknown-time-budget\"}'::jsonb ELSE '{}'::jsonb END"
    return f"""WITH remaining AS (SELECT {budget['seconds'] * 1000}-
      extract(epoch FROM clock_timestamp()-transaction_timestamp())*1000 AS ms),
    s AS (SELECT {STATE} AS s,ms FROM remaining), saved AS MATERIALIZED (
      SELECT {save_setting('state',expired)} AS state,
      set_config('statement_timeout',greatest(1,least({statement_timeout_ms},floor(ms)))::int::text,true) AS timeout FROM s)
    SELECT 1 AS checked FROM saved \\gset deadline_"""


def page_state(budget):
    return f"{STATE} || CASE WHEN NOT ({STATE}->>'ok')::boolean THEN '{{}}'::jsonb WHEN extract(epoch FROM clock_timestamp()-transaction_timestamp())>={budget['seconds']} THEN '{{\"ok\":false,\"reason\":\"unknown-time-budget\"}}'::jsonb WHEN ({STATE}->>'pages')::int>={budget['pages']} THEN '{{\"ok\":false,\"reason\":\"unknown-page-budget\"}}'::jsonb ELSE '{{}}'::jsonb END"


def page_graph_sql(index, name, reg, key, budget, *, first=False, previous_ids=()):
    seek = 'true' if first else f':table_{index}_seek'
    source_predicate = native_scan_predicate(name, previous_ids)
    # MATERIALIZED PK page comes before ANY snapshot/payload expression. No
    # all-table source/proof CTE and no timestamp/OFFSET pagination.
    base = f"""WITH s AS MATERIALIZED (SELECT {page_state(budget)} AS s),
    page_keys AS MATERIALIZED (SELECT :table_{index}_order_pk FROM {reg} t
      WHERE ({source_predicate}) AND {seek} AND (SELECT (s->>'ok')::boolean FROM s)
      ORDER BY :table_{index}_order_pk LIMIT {budget['page_rows']}),
    page AS MATERIALIZED (SELECT to_jsonb(t) AS j FROM page_keys k CROSS JOIN LATERAL
      (SELECT :table_{index}_projection FROM {reg} t WHERE :table_{index}_join_pk LIMIT 1) t),
    measured AS (SELECT COALESCE(jsonb_agg(j),'[]'::jsonb) AS rows,count(*) AS n FROM page),
    c AS (SELECT s,rows,n,octet_length(rows::text) AS bytes,
      (SELECT :table_{index}_cursor_value FROM page_keys t ORDER BY :table_{index}_reverse_pk LIMIT 1) AS cursor FROM measured,s),
    checked AS (SELECT *,CASE WHEN NOT (s->>'ok')::boolean THEN s->>'reason'
      WHEN (s->>'pages')::bigint+1>{budget['pages']} THEN 'unknown-page-budget'
      WHEN (s->>'scanRows')::bigint+n>{budget['scan_rows']} THEN 'unknown-scan-budget'
      WHEN bytes>{budget['page_bytes']} THEN 'unknown-page-byte-limit'
      WHEN (s->>'graphBytes')::bigint+bytes>{budget['graph_bytes']} THEN 'unknown-graph-byte-limit'
      ELSE '' END AS reason FROM c),
    saved AS MATERIALIZED (SELECT
      {save_setting('graph_'+str(index), f"CASE WHEN reason='' THEN {setting('graph_'+str(index))} || rows ELSE {setting('graph_'+str(index))} END")},
      {save_setting('cursor', "COALESCE(cursor,'[]'::jsonb)")},
      {save_setting('state', "s || jsonb_build_object('ok',reason='','reason',reason,'pages',(s->>'pages')::int+CASE WHEN (s->>'ok')::boolean THEN 1 ELSE 0 END,'scanRows',(s->>'scanRows')::int+n,'graphBytes',(s->>'graphBytes')::bigint+bytes)")} AS state
      FROM checked)
    SELECT jsonb_build_object('kind','page','phase','graph','table',{literal(name)},
      'count',n,'bytes',bytes,'ok',reason='') FROM saved,checked;"""
    # The closure metadata is bounded per page; global ledger/billing hashes are
    # also accumulated in PK pages, not a separate unbounded table aggregate.
    if name not in ['app_ledger', 'app_billing_operations']:
        return base
    leaf = "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')"
    leaves = "SELECT j->>'_ledgerRowSha256' AS h FROM page" if name == 'app_ledger' else f"SELECT h FROM page_keys k CROSS JOIN LATERAL (SELECT {leaf} AS h FROM {reg} t WHERE :table_{index}_join_pk LIMIT 1) h"
    hash_cte = f""", leaves AS MATERIALIZED ({leaves}),
    sums AS (SELECT count(*) AS n,COALESCE(sum(('x'||substr(h,1,16))::bit(64)::bigint::numeric),0) AS a,
      COALESCE(sum(('x'||substr(h,17,16))::bit(64)::bigint::numeric),0) AS b FROM leaves),
    saved_summary AS MATERIALIZED (SELECT {save_setting('summary_'+str(index), f"jsonb_build_object('count',({setting('summary_'+str(index))}->>'count')::bigint+n,'sumA',(({setting('summary_'+str(index))}->>'sumA')::numeric+a)::text,'sumB',(({setting('summary_'+str(index))}->>'sumB')::numeric+b)::text,'algorithm','sha256-leaf-two-64bit-sums')")} FROM sums)"""
    return base.replace('\n    SELECT jsonb_build_object(\'kind\',\'page\'', hash_cte + '\n    SELECT jsonb_build_object(\'kind\',\'page\'').replace('FROM saved,checked;', 'FROM saved,checked,saved_summary;')


def proof_row_sql(name, projection):
    if projection == 'full' or name == 'app_image_jobs':
        return 'j'
    fields = ','.join(literal(v) for v in PROOF_FIELDS)
    result = f"COALESCE((SELECT jsonb_object_agg(k,j->k) FROM unnest(ARRAY[{fields}]::text[]) e(k) WHERE j ? k),'{{}}'::jsonb) || jsonb_build_object('_preservationProof',true,'_frozenDigest',encode(sha256(convert_to(({sql_frozen()})::text,'UTF8')),'hex'),'snapshot',jsonb_build_object('status',j#>'{{snapshot,status}}','paidOperations',COALESCE(j#>'{{snapshot,paidOperations}}','{{}}'::jsonb)))"
    if name == 'app_ledger':
        result += " || jsonb_build_object('_ledgerRowSha256',encode(sha256(convert_to(j::text,'UTF8')),'hex'))"
    if name == 'app_release_activities' and ACTIVITY_INSTANCE_SCOPE:
        result += " || jsonb_build_object('instance_id',j->'instance_id','_frozenDigest',encode(sha256(convert_to((("+sql_frozen()+") || jsonb_build_object('instance_id',j->'instance_id'))::text,'UTF8')),'hex'))"
    return result


def page_proof_sql(index, name, reg, key, projection, budget, row_limit):
    # Exact original identity keys (also after completion) become typed native
    # probes. No cast of the indexed column and no status projection of history.
    fields = key_fields(key)
    # Catalog types are obtained from the table row type by jsonb_populate_record.
    # SQL receives only key fields, never any media or payload.
    obj = 'jsonb_build_object(' + ','.join(literal(f)+',value' + (f'::jsonb->{i}' if key.startswith('composite:') else '') for i,f in enumerate(fields)) + ')'
    condition = ' AND '.join('t."'+f+'"=k."'+f+'"' for f in fields)
    columns=f':table_{index}_proof_projection' if projection=='proof' and name!='app_ledger' else 't.*'
    # LIMIT 2 keeps parameterized native-key probes from being flattened into
    # a repeated all-table hash scan, and detects duplicate business identities.
    source=f'(SELECT t.* FROM keys k CROSS JOIN LATERAL (SELECT {columns} FROM {reg} t WHERE {condition} LIMIT 2) t)'
    return f"""WITH s AS MATERIALIZED (SELECT {page_state(budget)} AS s),
    picked AS MATERIALIZED (SELECT value FROM jsonb_array_elements_text({setting('selected_'+str(index))}) WITH ORDINALITY e(value,n)
      WHERE n>({setting('proof_offset')})::int AND n<=({setting('proof_offset')})::int+{budget['page_rows']}
      AND (SELECT (s->>'ok')::boolean FROM s)),
    keys AS MATERIALIZED (SELECT r.* FROM picked CROSS JOIN LATERAL jsonb_populate_record(null::{reg},{obj}) r),
    native AS MATERIALIZED (SELECT to_jsonb(t) AS j FROM {source} t),
    proof AS MATERIALIZED (SELECT {proof_row_sql(name,projection)} AS j FROM native),
    measured AS (SELECT COALESCE(jsonb_agg(j ORDER BY {sql_key(key)}),'[]'::jsonb) AS rows,count(*) AS n FROM proof),
    checked AS (SELECT s,rows,n,octet_length(rows::text) AS bytes,CASE
      WHEN NOT (s->>'ok')::boolean THEN s->>'reason'
      WHEN (s->>'pages')::int+1>{budget['pages']} THEN 'unknown-page-budget'
      WHEN n<>(SELECT count(*) FROM picked) THEN 'unknown-proof-identity'
      WHEN octet_length(rows::text)>{budget['page_bytes']} THEN 'unknown-page-byte-limit'
      WHEN (s->>'proofBytes')::bigint+octet_length(rows::text)>{budget['proof_bytes']} THEN 'unknown-byte-limit'
      WHEN {str(projection=='full').lower()} AND (SELECT COALESCE(sum(octet_length(j::text)),0) FROM jsonb_array_elements({setting('rows_'+str(index))} || rows) e(j))>524288 THEN 'unknown-byte-limit'
      ELSE '' END AS reason FROM measured,s),
    saved AS MATERIALIZED (SELECT
      {save_setting('rows_'+str(index), f"CASE WHEN reason='' THEN {setting('rows_'+str(index))} || rows ELSE {setting('rows_'+str(index))} END")},
      {save_setting('proof_offset', f"({setting('proof_offset')})::int+{budget['page_rows']}")},
      {save_setting('state', "s || jsonb_build_object('ok',reason='','reason',reason,'pages',(s->>'pages')::int+CASE WHEN (s->>'ok')::boolean THEN 1 ELSE 0 END,'proofBytes',(s->>'proofBytes')::bigint+bytes)")} AS state FROM checked)
    SELECT jsonb_build_object('kind','page','phase','proof','table',{literal(name)},'count',n,'bytes',bytes,'ok',reason='') FROM saved,checked;"""


def build_sql(*, previous=None, schema='public', row_limit=1000, projection='full', statement_timeout_ms=5000, budget=None):
    if not re.fullmatch('[a-z_][a-z0-9_]{0,62}', schema) or type(row_limit) is not int or not 1<=row_limit<=5000:
        raise ValueError('BOUNDED_SQL_SCOPE_REQUIRED')
    if projection not in ['full','proof']:
        raise ValueError('UNKNOWN_TASK_PROJECTION')
    if type(statement_timeout_ms) is not int or not 1000<=statement_timeout_ms<=15000:
        raise ValueError('BOUNDED_STATEMENT_TIMEOUT_REQUIRED')
    b=budgets(budget)
    if projection=='full':
        b['page_bytes']=min(b['page_bytes'],524288)
    prior=tracked_ids(previous)
    if sum(map(len,prior.values()))>b['selected_rows'] or any(len(v)>row_limit or any(len(k)>512 for k in v) for v in prior.values()):
        raise ValueError('TRACKED_IDS_EXCEEDED')
    state={'ok':True,'reason':'','pages':0,'scanRows':0,'graphBytes':0,'proofBytes':0,'selectedRows':0}
    lines=[r'\set ON_ERROR_STOP on','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
      f"SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='{min(statement_timeout_ms,b['seconds']*1000)}ms'; SET LOCAL idle_in_transaction_session_timeout='{min(5000,b['seconds']*1000)}ms';",
      "SET LOCAL search_path=pg_catalog; SET LOCAL standard_conforming_strings=on;",
      "SELECT jsonb_build_object('kind','begin','database',current_database(),'observedAt',transaction_timestamp(),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'snapshot',txid_current_snapshot()::text);",
      f"SELECT {save_setting('state',literal(json.dumps(state))+'::jsonb')} AS state \\gset initial_"]
    empty_array="'[]'::jsonb"
    empty_summary="'{\"count\":0,\"sumA\":\"0\",\"sumB\":\"0\",\"algorithm\":\"sha256-leaf-two-64bit-sums\"}'::jsonb"
    for i,(name,key) in enumerate(KEYS.items()):
        reg=schema+'.'+name
        source_predicate=native_scan_predicate(name,prior.get(name,[]))
        source_fields=(('instance_id','state') if name=='app_release_activities' else ('phase',)) if name in ['app_release_activities','app_worker_tick_receipts'] and ACTIVITY_INSTANCE_SCOPE else ()
        scan_guard=f"{STATE} || CASE WHEN :table_{i}_scan_count+({STATE}->>'scanRows')::int>{b['scan_rows']} THEN '{{\"ok\":false,\"reason\":\"unknown-scan-budget\"}}'::jsonb ELSE '{{}}'::jsonb END"
        lines += [deadline_sql(b,statement_timeout_ms),f"SELECT {save_setting('graph_'+str(i),empty_array)} AS graph, {save_setting('rows_'+str(i),empty_array)} AS rows, {save_setting('selected_'+str(i),empty_array)} AS selected \\gset init_{i}_",
          f"SELECT to_regclass({literal(reg)}) IS NOT NULL AS exists \\gset table_{i}_",f'\\if :table_{i}_exists',
          catalog_sql(reg,key,source_fields)+f' \\gset table_{i}_', f'\\if :table_{i}_key_verified',
          graph_projection_sql(reg)+f' \\gset table_{i}_']
        if projection=='proof' and name!='app_ledger':lines += [proof_projection_sql(reg)+f' \\gset table_{i}_']
        lines += [deadline_sql(b,statement_timeout_ms),
          f"SELECT count(*) AS scan_count FROM (SELECT :table_{i}_order_pk FROM {reg} t WHERE ({source_predicate}) AND ({STATE}->>'ok')::boolean ORDER BY :table_{i}_order_pk LIMIT {b['scan_rows']+1}) q \\gset table_{i}_",
          f"SELECT {save_setting('state',scan_guard)} \\gset scan_gate_{i}_",
          f"SELECT {save_setting('cursor',empty_array)} \\gset cursor_{i}_"]
        if name in ['app_ledger','app_billing_operations']:
            lines += [f"SELECT {save_setting('summary_'+str(i),empty_summary)} \\gset summary_{i}_"]
        # Render query templates with catalog fragments in psql, not SQL values.
        # \gexec itself only executes SQL; no generated psql meta commands.
        first=page_graph_sql(i,name,reg,key,b,first=True,previous_ids=prior.get(name,[]))
        more=page_graph_sql(i,name,reg,key,b,previous_ids=prior.get(name,[]))
        lines += [deadline_sql(b,statement_timeout_ms),first]
        lines += generated_pages(more,i,f'ceil(:table_{i}_scan_count::numeric/{b["page_rows"]})::int-1',b,statement_timeout_ms)
        lines += ['\\endif','\\endif']
    # Fixed point over bounded graph metadata, no arbitrary four-pass truncation.
    sources=[];nodes=[]
    for i,(name,key) in enumerate(KEYS.items()):
        active=SPECS.get(name,(None,'false'))[1]
        prior_sql=','.join(literal(v) for v in prior.get(name,[])) or 'NULL'
        sources.append(f"SELECT {i} AS t,j FROM jsonb_array_elements({setting('graph_'+str(i))}) e(j)")
        nodes.append(f"SELECT {i} AS t,{sql_key(key)} AS key,'row:{i}:'||({sql_key(key)}) AS vertex,({active}) OR {sql_key(key)} IN ({prior_sql}) AS seed,{graph_links(name)} AS links,{graph_out(key)} AS outgoing FROM source WHERE t={i}")
    root_cap=min(b['roots'],row_limit*8)
    closure=f"""WITH RECURSIVE source AS MATERIALIZED ({' UNION ALL '.join(sources)}),
    nodes AS MATERIALIZED ({' UNION ALL '.join(nodes)}),
    edges AS MATERIALIZED (SELECT 'root:'||v AS a,vertex AS z FROM nodes CROSS JOIN LATERAL jsonb_array_elements_text(links) x(v) WHERE v IS NOT NULL AND v<>''
      UNION SELECT vertex,'root:'||v FROM nodes CROSS JOIN LATERAL jsonb_array_elements_text(outgoing) x(v) WHERE v IS NOT NULL AND v<>''),
    walk(v) AS (SELECT vertex FROM nodes WHERE seed UNION SELECT e.z FROM walk w JOIN edges e ON e.a=w.v),
    bounded AS MATERIALIZED (SELECT v FROM walk LIMIT {root_cap+b['selected_rows']+1}),
    chosen AS MATERIALIZED (SELECT n.t,n.key FROM nodes n JOIN bounded w ON n.vertex=w.v),
    stats AS (SELECT (SELECT count(*) FROM bounded WHERE v LIKE 'root:%') AS roots,(SELECT count(*) FROM chosen) AS chosen),
    checked AS (SELECT CASE WHEN NOT ({STATE}->>'ok')::boolean THEN {STATE}->>'reason'
      WHEN EXISTS(SELECT 1 FROM chosen c JOIN source d ON d.t=c.t AND {sql_key('id')}=c.key
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(d.j#>'{{snapshot,childJobIds}}','[]'::jsonb)) x(id)
        WHERE c.t=0 AND NOT EXISTS(SELECT 1 FROM nodes target WHERE target.t=0 AND target.key=x.id)) THEN 'unknown-child-missing'
      WHEN roots>{root_cap} THEN 'unknown-root-limit' WHEN chosen>{b['selected_rows']} THEN 'unknown-selected-budget'
      WHEN EXISTS(SELECT 1 FROM chosen GROUP BY t HAVING count(*)>{row_limit}) THEN 'unknown-row-limit'
      WHEN (SELECT count(*) FROM bounded)>{root_cap+b['selected_rows']} THEN 'unknown-closure-limit' ELSE '' END AS reason,stats.* FROM stats),
    saved AS MATERIALIZED (SELECT {save_setting('state', f"{STATE} || jsonb_build_object('ok',reason='','reason',reason,'selectedRows',chosen,'roots',roots)")} AS state,
      {','.join(save_setting('selected_'+str(i),f"COALESCE((SELECT jsonb_agg(key ORDER BY key) FROM chosen WHERE t={i}),'[]'::jsonb)")+f' AS selected_{i}' for i in range(len(KEYS)))} FROM checked)
    SELECT jsonb_build_object('kind','coverage','phase','closure','state',state::jsonb) FROM saved;"""
    lines += [deadline_sql(b,statement_timeout_ms),closure]
    for i,(name,key) in enumerate(KEYS.items()):
        reg=schema+'.'+name
        lines += [deadline_sql(b,statement_timeout_ms),f'\\if :table_{i}_exists',f'\\if :table_{i}_key_verified',
                  f"SELECT {save_setting('proof_offset','0')} \\gset offset_{i}_"]
        proof=page_proof_sql(i,name,reg,key,projection,b,row_limit)
        lines += generated_pages(proof,i,f"ceil(jsonb_array_length({setting('selected_'+str(i))})::numeric/{b['page_rows']})::int",b,statement_timeout_ms)
        lines += ['\\endif','\\endif']
    lines += [deadline_sql(b,statement_timeout_ms)]
    for i,(name,key) in enumerate(KEYS.items()):
        summary=setting('summary_'+str(i)) if name in ['app_ledger','app_billing_operations'] else 'null::jsonb'
        global_ledger = f"COALESCE((SELECT jsonb_object_agg(j->>'id',j->>'_ledgerRowSha256') FROM jsonb_array_elements({setting('graph_'+str(i))}) e(j)),'{{}}'::jsonb)" if name=='app_ledger' else 'null::jsonb'
        active=SPECS.get(name,(None,'false'))[1]
        lines += [deadline_sql(b,statement_timeout_ms),f'\\if :table_{i}_exists',f'\\if :table_{i}_key_verified',
          f"SELECT jsonb_build_object('kind','table','table',{literal(name)},'status',CASE WHEN ({STATE}->>'ok')::boolean THEN 'observed' ELSE {STATE}->>'reason' END,'rows',{setting('rows_'+str(i))},'selectedCount',jsonb_array_length({setting('selected_'+str(i))}),'activeCount',(SELECT count(*) FROM jsonb_array_elements({setting('graph_'+str(i))}) e(j) WHERE {active}),'allSummary',{summary},'globalLedger',{global_ledger});",
          '\\else',f"SELECT jsonb_build_object('kind','table','table',{literal(name)},'status','unknown-unverified-primary-key','rows','[]'::jsonb);",'\\endif',
          '\\else',f"SELECT jsonb_build_object('kind','table','table',{literal(name)},'status','unknown-table-missing','rows','[]'::jsonb);",'\\endif']
    lines += [deadline_sql(b,statement_timeout_ms),f"SELECT jsonb_build_object('kind','end','database',current_database(),'readOnly',current_setting('transaction_read_only'),'snapshot',txid_current_snapshot()::text,'coverage',{STATE},'elapsedMs',extract(epoch FROM clock_timestamp()-transaction_timestamp())*1000,'budget',{literal(json.dumps(b))}::jsonb);",'COMMIT;']
    # Bound every emitted SQL statement after state initialization, including
    # catalog/scan/result queries between pages. Never reuse a previous query's
    # full allowance. Generated page batches carry the same guard per statement.
    guarded=[]; initialized=False; guard=deadline_sql(b,statement_timeout_ms)
    for line in lines:
        if initialized and not line.startswith('\\') and line!='COMMIT;' and line!=guard:
            if not guarded or guarded[-1]!=guard:guarded.append(guard)
        guarded.append(line)
        if '\\gset initial_' in line:initialized=True
    return ('\n'.join(guarded)+'\n').encode()


def generated_pages(query,index,count,budget,statement_timeout_ms):
    # Replace only known catalog placeholders; catalog fragments are quoted SQL
    # data until psql executes the generated page. Other query text is literal.
    parts=re.split(r'(:table_\d+_[a-z_]+)',query)
    value=' || '.join((":'"+p[1:]+"'" if p.startswith(':table_') else literal(p)) for p in parts if p)
    # PostgreSQL budgets every generated statement against transaction age.
    guard=f"SELECT jsonb_build_object('kind','budget','timeout',set_config('statement_timeout',greatest(1,least({statement_timeout_ms},{budget['seconds']*1000}-floor(extract(epoch FROM clock_timestamp()-transaction_timestamp())*1000)))::int::text,true));"
    return [deadline_sql(budget,statement_timeout_ms),f"SELECT {literal(guard)} || {value} FROM generate_series(1,least({count},{budget['pages']})) WHERE ({STATE}->>'ok')::boolean \\gexec"]


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
        if valid and status=='observed' and item.get('selectedCount')!=len(rows):
            status='unknown-incomplete-rows'
        if name=='app_image_jobs' and any(unverified_image_proof(row) for row in rows if isinstance(row,dict)):
            status='unknown-image-proof'
        if name=='app_ledger' and private.get('collection',{}).get('version')==PROOF_VERSION and ledger_leaves(item) is None:
            status='unknown-ledger-proof'
        if private.get('collection',{}).get('status','complete')!='complete' and status=='observed':
            status='unknown-incomplete-collection'
        if valid and (len(rows) > row_limit or item.get('selectedCount', 0) > row_limit):
            status = 'unknown-row-limit'
        identities = sorted(sha([name, row_key(row, key)]) for row in rows) if valid else []
        tables[name] = {'status': status, 'selectedCount': item.get('selectedCount'), 'activeCount': item.get('activeCount'),
                        'identityHashes': identities, 'rowsSha256': sha(rows), 'allProtectedSummary': item.get('allSummary'),
                        'globalLedgerSha256': sha(item['globalLedger']) if isinstance(item.get('globalLedger'),dict) else None,
                        'frozenContextsSha256': sha([frozen(row) for row in rows]) if valid else None,
                        'supplierBindingsSha256': sha([supplier_bindings(row) for row in rows]) if valid else None}
    return {'schemaVersion': 1, 'kind': 'read-only-task-preservation-not-drain', 'databaseIdentitySha256': private.get('databaseIdentitySha256'),
            'observedAt': private.get('observedAt'), 'tables': tables, 'privateRowsSha256': sha(private),
            'preservationComplete': bool(tables) and all(item['status'] in ['observed','confirmed-absent-additive'] for item in tables.values()),
            'drainProven': False, 'unknownRemainsUnknown': True, 'collection': private.get('collection')}


def unverified_image_proof(row):
    snap=row.get('snapshot',{})
    if not isinstance(snap,dict):return True
    if row.get('_preservationProof') and snap.get('_proofVersion')!=PROOF_VERSION:return True
    if snap.get('_unverified'):return True
    def invalid(parts,depth=0):
        if not isinstance(parts,dict) or depth>1:return True
        return any(not isinstance(v,dict) or v.get('_unverified') or
                   (v.get('state') is not None and not isinstance(v['state'],str)) or
                   ('children' in v and invalid(v['children'],depth+1)) for v in parts.values())
    children=snap.get('children',{})
    if not isinstance(children,dict) or any(not isinstance(v,dict) or
        'jobId' in v and not isinstance(v['jobId'],str) for v in children.values()):return True
    return invalid(snap.get('paidOperations',{}))


def ledger_leaves(table):
    leaves,summary=table.get('globalLedger'),table.get('allSummary')
    if not isinstance(leaves,dict) or not isinstance(summary,dict) or summary.get('count')!=len(leaves):
        return None
    return leaves if all(isinstance(k,str) and isinstance(v,str) and re.fullmatch('[a-f0-9]{64}',v) for k,v in leaves.items()) else None


def paid_states(row):
    snapshot=row.get('snapshot')
    if not isinstance(snapshot,dict) or not isinstance(snapshot.get('paidOperations',{}),dict):return {}
    result={}
    def visit(parts,path=()):
        for key,part in parts.items():
            if not isinstance(part,dict):continue
            result[json.dumps([*path,key],ensure_ascii=False)]=part.get('state')
            if not path and isinstance(part.get('children'),dict):visit(part['children'],(*path,key))
    visit(snapshot.get('paidOperations',{}))
    return result


def paid_transition_allowed(before,after):
    if before==after:return True
    # A first dispatch may defer started->queued without sending. The snapshot
    # lacks durable nonacceptance evidence, so that transition is not proven here.
    return isinstance(before,str) and isinstance(after,str) and after in {
        'queued':{'started','done','rejected'}, 'started':{'done','rejected'},
    }.get(before,set())


def observed_state(row,field):
    if field=='snapshot.status':
        snapshot=row.get('snapshot')
        return snapshot.get('status') if isinstance(snapshot,dict) else None
    return row.get(field)


def supplier_bindings(row):
    fields = ['batch_id', 'upstream_id', 'upstream_video_id', 'provider_id', 'channel_id', 'account_id', 'task_id', 'request_id', 'child_operation_id', 'operation_id', 'attempt_id', 'parent_call_id', 'billing_unit_id', 'public_model_id', 'model', 'actual_model', 'supplier_ref_hash']
    values = {key: row[key] for key in fields if row.get(key) not in [None, '']}
    snapshot = row.get('snapshot') or {}
    if isinstance(snapshot, dict):
        paid = snapshot.get('paidOperations', {})
        if isinstance(paid, dict):
            flattened={}
            def visit(parts,path=()):
                for key,part in parts.items():
                    if not isinstance(part,dict):continue
                    # JSON path tuple avoids collisions with colon/slash in IDs.
                    flattened[json.dumps([*path,key],ensure_ascii=False)]={name:part.get(name) for name in ['model','replayable','gatewayIdentity']}
                    if not path and isinstance(part.get('children'),dict):visit(part['children'],(*path,key))
            visit(paid)
            values['paidOperations']=flattened
        children=snapshot.get('children',{})
        if isinstance(children,dict):
            values['childJobs']={key:part['jobId'] for key,part in children.items() if isinstance(part,dict) and part.get('jobId')}
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


def collect_task_snapshot(command, db_identity, private_save=None, *, previous=None, schema='public', expected_database=None, row_limit=1000, projection='full', allow_absent_tables=(), statement_timeout_ms=5000, budget=None):
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
    effective_budget = budgets(budget)
    if projection=='full':
        effective_budget['page_bytes']=min(effective_budget['page_bytes'],524288)
    sql = build_sql(previous=previous, schema=schema, row_limit=row_limit, projection=projection, statement_timeout_ms=statement_timeout_ms, budget=effective_budget)
    args = ['docker', 'exec', '-i', db_identity['id'], 'psql', '-X', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database]
    def failure(reason):
        record={'kind':'task-preservation-incomplete-v2','status':'incomplete',
                'reason':reason,'preservationVerified':False,'unknownRemainsUnknown':True,
                'sqlSha256':sha(sql),'budget':effective_budget,
                'previousSha256':sha(previous.private if isinstance(previous,Snapshot) else previous) if previous is not None else None}
        if private_save:
            try:
                private_save('task-snapshot-incomplete-'+sha(sql)[:20]+'.json',canonical(record)+b'\n')
            except Exception:
                raise ValueError('PRIVATE_TASK_SNAPSHOT_PERSIST_FAILED') from None
    try:
        raw = run_bytes(command, args, stdin=sql, timeout=effective_budget['seconds']+10)
    except ValueError:
        failure('TASK_SNAPSHOT_READ_UNAVAILABLE')
        raise
    try:
        lines = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
        first, last = lines[0], lines[-1]
        if first.get('kind') != 'begin' or last.get('kind') != 'end' or first.get('database') != database or last.get('database') != database or first.get('readOnly') != 'on' or last.get('readOnly') != 'on' or first.get('isolation') != 'repeatable read' or first.get('snapshot') != last.get('snapshot'):
            raise ValueError()
        tables = {item['table']: item for item in lines[1:-1] if item.get('kind') == 'table'}
        if set(tables) != set(KEYS) or sum(item.get('kind')=='table' for item in lines)!=len(KEYS) or any(item.get('kind') not in ['begin','end','table','page','budget','coverage'] for item in lines) or not isinstance(last.get('coverage'),dict) or last.get('budget')!=effective_budget or type(last['coverage'].get('ok')) is not bool or not isinstance(last.get('elapsedMs'),(int,float)):
            raise ValueError()
        if last['elapsedMs']>effective_budget['seconds']*1000:
            raise ValueError()
        for name in allow_absent_tables:
            if tables[name].get('status') == 'unknown-table-missing':
                tables[name].update(status='confirmed-absent-additive', rows=[], selectedCount=0, activeCount=None,
                                    absenceEvidence='to_regclass-null-in-repeatable-read-transaction')
    except (ValueError, KeyError, TypeError, IndexError):
        failure('TASK_SNAPSHOT_TRANSACTION_UNVERIFIED')
        raise ValueError('TASK_SNAPSHOT_TRANSACTION_UNVERIFIED') from None
    # Re-pin DB container after transaction; no observations from a replacement DB are mixed.
    try:
        after = json.loads(run_bytes(command, ['docker', 'inspect', db_identity['id']]))
        unchanged = len(after) == 1 and public_identity(after[0]) == db_identity
    except (ValueError, KeyError, TypeError, IndexError):
        unchanged = False
    if not unchanged:
        failure('DATABASE_BASELINE_CHANGED')
        raise ValueError('DATABASE_BASELINE_CHANGED')
    private = {'kind': 'task-preservation-private-v1', 'databaseIdentitySha256': sha({'container': db_identity, 'database': database, 'schema': schema}),
               'observedAt': first.get('observedAt'), 'snapshot': first.get('snapshot'), 'rowLimit': row_limit,
               'rowProjection': projection, 'tables': tables,
               'collection': {'version':PROOF_VERSION,'status':'complete' if last['coverage'].get('ok') else 'incomplete',
                              'consistency':'bounded-repeatable-read','coverage':last['coverage'],
                              'elapsedMs':last.get('elapsedMs'),'budget':effective_budget,
                              'pageEvidence':[item for item in lines if item.get('kind')=='page']}}
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
    if any(value.get('collection') for value in [before,after]) and any(
            value.get('collection',{}).get('version')!=PROOF_VERSION or value.get('collection',{}).get('status')!='complete'
            for value in [before,after]):
        unknown.extend(KEYS)  # New coverage cannot be retroactively asserted for a legacy baseline.
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
        if name=='app_ledger' and (prior_summary or later_summary or old.get('globalLedger') is not None or new.get('globalLedger') is not None):
            old_leaves,new_leaves=ledger_leaves(old),ledger_leaves(new)
            if old_leaves is None or new_leaves is None:
                unknown.append(name)  # Counts, even growing counts, do not prove original rows.
            else:
                for identifier,digest in old_leaves.items():
                    if new_leaves.get(identifier)!=digest:
                        violations.append({'table':name,'identitySha256':sha([name,identifier]),'reason':'ORIGINAL_GLOBAL_LEDGER_ROW_CHANGED'})
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
                valid = all(new_bindings.get(field_name, {}).get(operation) == binding for operation,binding in value.items()) if field_name in ['paidOperations','childJobs'] else new_bindings.get(field_name) == value
                if not valid:
                    violations.append({**ref, 'reason': 'ORIGINAL_SUPPLIER_BINDING_CHANGED', 'field': field_name})
            if frozen(row) != frozen(latest):
                violations.append({**ref, 'reason': 'FROZEN_CONTEXT_CHANGED'})
            if name == 'app_ledger' and row != latest:
                violations.append({**ref, 'reason': 'ORIGINAL_LEDGER_ROW_CHANGED'})
            old_paid,new_paid=paid_states(row),paid_states(latest)
            for operation,state in old_paid.items():
                # Missing operations already violate immutable bindings. Keep
                # the existing audited completed-image exception narrow.
                if operation in new_paid and not paid_transition_allowed(state,new_paid[operation]):
                    violations.append({**ref,'reason':'PAID_STATE_TRANSITION_UNPROVEN','operationSha256':sha(operation)})
            for stamp in ['created_at', 'updated_at']:
                if row.get(stamp) and latest.get(stamp) and latest[stamp] < row[stamp]:
                    violations.append({**ref, 'reason': 'ROW_TIMESTAMP_REGRESSION', 'field': stamp})
            for mutable_state in ['state', 'status', 'phase', 'snapshot.status']:
                prior_state,next_state=observed_state(row,mutable_state),observed_state(latest,mutable_state)
                if prior_state != next_state:
                    if prior_state=='unknown':
                        violations.append({**ref,'reason':'UNKNOWN_STATE_TRANSITION_UNPROVEN','field':mutable_state})
                    elif prior_state in ['done', 'completed', 'succeeded', 'settled', 'released', 'cancelled']:
                        violations.append({**ref, 'reason': 'TERMINAL_STATE_REGRESSION'})
                    else:completions += 1
    return {'schemaVersion': 1, 'noMissingJobs': not any(v['reason'] == 'PRESERVED_ROW_MISSING' for v in violations),
            'noOriginalSupplierMutation': not any(v['reason'] == 'ORIGINAL_SUPPLIER_BINDING_CHANGED' for v in violations),
            'preservationVerified': not violations and not unknown, 'violations': violations, 'unknownTables': sorted(set(unknown)),
            'newRowsAllowed': additions, 'stateTransitionsAllowed': completions, 'drainProven': False}
