"""Whole existing-business-row preservation, not task recovery or a drain proof.

The graph collector's incomplete result stays incomplete. This independent,
bounded READ ONLY snapshot fingerprints every existing row in its business table
inventory. A changed row (even a legitimate completion) requires separate review.
No row body, credentials, prompt, supplier response or model call is emitted.
"""
import datetime as dt
import hashlib
import json
import re
import uuid

try:
    from . import release47_task_snapshot as tasks
    from .release47_host import public_identity
except ImportError:
    import release47_task_snapshot as tasks
    from release47_host import public_identity

EXCLUDED_OBSERVATIONS = {'app_release_activities', 'app_release_session_owners', 'app_worker_tick_receipts'}
TABLES = {name: key for name, key in tasks.KEYS.items() if name not in EXCLUDED_OBSERVATIONS}
ADDITIVE_TABLES = tasks.ADDITIVE_TABLES - EXCLUDED_OBSERVATIONS
DEFAULT_BUDGET = {'rows': 250000, 'bytes': 64 * 1024 * 1024, 'seconds': 60, 'statement_ms': 15000}
PREFIX = 'naumi.row_fingerprint.'
VERSION = 2
PAGE_ROWS = 128


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


def _require(value, reason):
    if not value:
        raise ValueError(reason)


def budgets(overrides=None):
    overrides = overrides or {}
    _require(isinstance(overrides, dict) and not set(overrides) - set(DEFAULT_BUDGET), 'UNKNOWN_FINGERPRINT_BUDGET')
    value = {**DEFAULT_BUDGET, **overrides}
    _require(all(type(v) is int and 0 < v <= DEFAULT_BUDGET[k] for k, v in value.items()), 'INVALID_FINGERPRINT_BUDGET')
    _require(value['bytes'] >= 2 * 1024 * 1024 and value['statement_ms'] <= value['seconds'] * 1000,
             'FINGERPRINT_BUDGET_TOO_SMALL')
    return value


def _keys(key):
    return key[10:].split(',') if key.startswith('composite:') else [key]


def _lit(value):
    return tasks.literal(value)


def _setting(name):
    return f"current_setting('{PREFIX}{name}')"


def _catalog(schema, name):
    reg = schema + '.' + name
    required = _keys(TABLES[name])
    names = ','.join(_lit(v) for v in required)
    return f"""WITH relation AS (SELECT oid,relkind FROM pg_class WHERE oid=to_regclass({_lit(reg)})),
 cols AS (SELECT a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
   pg_get_expr(d.adbin,d.adrelid) AS default_expression
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=to_regclass({_lit(reg)}) AND a.attnum>0 AND NOT a.attisdropped),
 pk AS (SELECT a.attname,a.type,k.n FROM pg_index i
   CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,n)
   JOIN cols a ON a.attnum=k.attnum
   WHERE i.indrelid=to_regclass({_lit(reg)}) AND i.indisprimary AND i.indisvalid),
 catalog AS (SELECT
   CASE WHEN NOT EXISTS(SELECT 1 FROM relation) THEN 'unknown-table-missing'
     WHEN NOT EXISTS(SELECT 1 FROM relation WHERE relkind IN ('r','p')) OR NOT EXISTS(SELECT 1 FROM pk)
       OR (SELECT count(*) FROM cols WHERE attname IN ({names}))<>{len(required)} THEN 'unknown-key-or-relation'
     ELSE 'observed' END AS status,
   COALESCE((SELECT jsonb_agg(attname ORDER BY n) FROM pk),'[]'::jsonb) AS primary_key,
   (SELECT string_agg('t.'||quote_ident(attname),',' ORDER BY n) FROM pk) AS ordering,
   (SELECT string_agg(quote_ident(attname),',' ORDER BY n) FROM pk) AS pk_sql,
   (SELECT string_agg('t.'||quote_ident(attname)||' DESC',',' ORDER BY n) FROM pk) AS reverse_ordering,
   (SELECT string_agg('t.'||quote_ident(attname)||'=k.'||quote_ident(attname),' AND ' ORDER BY n) FROM pk) AS join_sql,
   (SELECT 'ROW('||string_agg('t.'||quote_ident(attname),',' ORDER BY n)||') > ROW('||
      string_agg('('||{_lit(_setting('cursor'))}||'::jsonb->>'||(n-1)::text||')::'||type,',' ORDER BY n)||')' FROM pk) AS seek_sql,
   (SELECT 'jsonb_build_array('||string_agg('t.'||quote_ident(attname)||'::text',',' ORDER BY n)||')' FROM pk) AS key_sql,
   encode(sha256(convert_to(jsonb_build_object('columns',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY attnum) FROM cols c),'[]'::jsonb),
      'primaryKey',COALESCE((SELECT jsonb_agg(attname ORDER BY n) FROM pk),'[]'::jsonb))::text,'UTF8')),'hex') AS schema_sha)
"""


def _deadline(budget):
    elapsed = f"extract(epoch FROM clock_timestamp()-{_setting('started')}::timestamptz)*1000"
    return f"SELECT set_config('statement_timeout',GREATEST(1,LEAST({budget['statement_ms']},floor({budget['seconds'] * 1000}-({elapsed})))::int)::text||'ms',true) AS ignored \\gset\n"


def build_sql(*, schema='public', budget=None):
    """One RR transaction; native typed keyset pages bound each hashing statement."""
    _require(re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,62}', schema or ''), 'INVALID_FINGERPRINT_SCHEMA')
    b = budgets(budget)
    sql = ["\\set ON_ERROR_STOP on\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;",
           "SET LOCAL lock_timeout='1000ms'; SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO,YMD'; SET LOCAL intervalstyle='postgres'; SET LOCAL extra_float_digits=3;",
           f"SET LOCAL statement_timeout='{b['statement_ms']}ms';",
           f"SELECT set_config('{PREFIX}started',clock_timestamp()::text,true),set_config('{PREFIX}rows','0',true),set_config('{PREFIX}bytes','0',true),set_config('{PREFIX}wire_bytes','0',true),set_config('{PREFIX}failed','0',true) \\gset init_",
           f"SELECT jsonb_build_object('kind','begin','version',{VERSION},'database',current_database(),'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'serverVersion',current_setting('server_version_num'),'schema',{_lit(schema)},'snapshot',txid_current_snapshot()::text,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'observedAt',clock_timestamp(),'budget',{_lit(json.dumps(b))}::jsonb);"]
    for name, logical_key in TABLES.items():
        catalog = _catalog(schema, name)
        sql += [_deadline(b), catalog + f"SELECT jsonb_build_object('kind','table','table',{_lit(name)},'status',status,'primaryKey',primary_key,'businessKey',{_lit(json.dumps(_keys(logical_key)))}::jsonb,'schemaSha256',schema_sha) FROM catalog;"]
        business = 'jsonb_build_array(' + ','.join('t."' + k + '"::text' for k in _keys(logical_key)) + ')'
        # The count only touches native keys. Exact count and all hashes share
        # this MVCC snapshot; overflow is explicitly not an exact table count.
        count_query = f"""WITH bounded AS MATERIALIZED (SELECT 1 FROM %I.%I WHERE {_setting('failed')}='0' LIMIT GREATEST(0,{b['rows']}-{_setting('rows')}::int)+1),
 stats AS MATERIALIZED (SELECT count(*)::int AS count FROM bounded),
 saved AS MATERIALIZED (SELECT *,{_setting('failed')}='0' AND count<={b['rows']}-{_setting('rows')}::int AS exact,
   set_config('{PREFIX}table_rows','0',true),set_config('{PREFIX}table_bytes','0',true),set_config('{PREFIX}page','0',true),
   set_config('{PREFIX}cursor','null',true),set_config('{PREFIX}expected',count::text,true),
   set_config('{PREFIX}failed',CASE WHEN {_setting('failed')}='0' AND count<={b['rows']}-{_setting('rows')}::int THEN '0' ELSE '1' END,true)
   FROM stats)
 SELECT jsonb_build_object('kind','table-count','table',{_lit(name)},'count',count,'exact',exact) FROM saved;"""
        sql.append(catalog + f"SELECT CASE WHEN status='observed' THEN format({_lit(count_query)},{_lit(schema)},{_lit(name)}) ELSE " +
                   _lit(f"SELECT jsonb_build_object('kind','table-count','table',{_lit(name)},'count',0,'exact',false);") + " END FROM catalog \\gexec")
        # A MATERIALIZED key-only page prevents full-row hash evaluation before
        # LIMIT. Both filtering and joins use actual native PK types, no OFFSET.
        query = f"""WITH page_keys AS MATERIALIZED (
 SELECT %s FROM %I.%I t WHERE {_setting('failed')}='0' AND %s ORDER BY %s LIMIT {PAGE_ROWS}),
 rows AS MATERIALIZED (SELECT %s AS pk,{business} AS business_key,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash
   FROM page_keys k JOIN %I.%I t ON %s ORDER BY %s),
 lines AS MATERIALIZED (SELECT jsonb_build_object('kind','row','table',{_lit(name)},'key',pk,'businessKey',business_key,'sha256',hash)::text AS line FROM rows),
 stats AS MATERIALIZED (SELECT count(*)::int AS count,COALESCE(sum(octet_length(line)+1),0)::bigint AS bytes FROM lines),
 marked AS MATERIALIZED (SELECT *,jsonb_build_object('kind','page','table',{_lit(name)},'page',{_setting('page')}::int+1,'count',count,'rowBytes',bytes,'ok',true,
   'lastKey',(SELECT %s FROM page_keys t ORDER BY %s LIMIT 1)) AS marker FROM stats),
 checked AS MATERIALIZED (SELECT *,{_setting('failed')}='0' AND count+{_setting('rows')}::int<={b['rows']} AND
   bytes+octet_length(marker::text)+1+{_setting('wire_bytes')}::bigint<={b['bytes']-1024*1024} AS ok FROM marked),
 emitted AS MATERIALIZED (SELECT *,CASE WHEN ok THEN marker ELSE jsonb_set(marker,'{{ok}}','false'::jsonb) END AS actual_marker FROM checked),
 saved AS MATERIALIZED (SELECT *,set_config('{PREFIX}rows',(count+{_setting('rows')}::int)::text,true),
   set_config('{PREFIX}bytes',(bytes+{_setting('bytes')}::bigint)::text,true),
   set_config('{PREFIX}wire_bytes',({_setting('wire_bytes')}::bigint+CASE WHEN ok THEN bytes ELSE 0 END+octet_length(actual_marker::text)+1)::text,true),
   set_config('{PREFIX}table_rows',(count+{_setting('table_rows')}::int)::text,true),
   set_config('{PREFIX}table_bytes',(bytes+{_setting('table_bytes')}::bigint)::text,true),
   set_config('{PREFIX}page',({_setting('page')}::int+1)::text,true) AS page_number,
   set_config('{PREFIX}cursor',COALESCE((marker->'lastKey')::text,{_setting('cursor')}),true),
   set_config('{PREFIX}failed',CASE WHEN ok THEN '0' ELSE '1' END,true) FROM emitted)
 SELECT line FROM lines CROSS JOIN saved WHERE saved.ok
 UNION ALL SELECT actual_marker::text FROM saved;"""
        # psql executes each generated row separately. Re-arm the *remaining*
        # global deadline before each page, never a fresh unbounded 15 seconds.
        # This DO only changes a session-local timeout and emits no output.
        deadline_sql = f"SELECT set_config('statement_timeout',GREATEST(1,LEAST({b['statement_ms']},floor({b['seconds'] * 1000}-(extract(epoch FROM clock_timestamp()-{_setting('started')}::timestamptz)*1000)))::int)::text||'ms',true);"
        deadline_sql = "DO $deadline$ BEGIN PERFORM " + deadline_sql[len('SELECT '):-1] + "; END $deadline$;"
        page_format = f"format({_lit(query)},pk_sql,{_lit(schema)},{_lit(name)},CASE WHEN n=1 THEN 'true' ELSE seek_sql END,ordering,key_sql,{_lit(schema)},{_lit(name)},join_sql,ordering,key_sql,reverse_ordering)"
        sql.append(catalog + f"SELECT command FROM catalog CROSS JOIN LATERAL generate_series(1,CASE WHEN status='observed' AND {_setting('failed')}='0' THEN ceil({_setting('expected')}::numeric/{PAGE_ROWS})::int ELSE 0 END) p(n) CROSS JOIN LATERAL (VALUES(0,{_lit(deadline_sql)}),(1,{page_format})) commands(part,command) ORDER BY n,part \\gexec")
        end_query = f"SELECT jsonb_build_object('kind','table-end','table',{_lit(name)},'count',{_setting('table_rows')}::int,'expectedCount',{_setting('expected')}::int,'rowBytes',{_setting('table_bytes')}::bigint,'pages',{_setting('page')}::int,'ok',{_setting('failed')}='0' AND {_setting('table_rows')}::int={_setting('expected')}::int);"
        sql.append(catalog + f"SELECT CASE WHEN status='observed' THEN {_lit(end_query)} ELSE " +
                   _lit(f"SELECT jsonb_build_object('kind','table-end','table',{_lit(name)},'count',0,'expectedCount',0,'rowBytes',0,'pages',0,'ok',false);") + " END FROM catalog \\gexec")
    sql += [_deadline(b), f"SELECT jsonb_build_object('kind','end','database',current_database(),'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'serverVersion',current_setting('server_version_num'),'schema',{_lit(schema)},'snapshot',txid_current_snapshot()::text,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'observedAt',clock_timestamp(),'elapsedMs',extract(epoch FROM clock_timestamp()-{_setting('started')}::timestamptz)*1000,'rows',{_setting('rows')}::int,'rowBytes',{_setting('bytes')}::bigint,'wireBytes',{_setting('wire_bytes')}::bigint,'budget',{_lit(json.dumps(b))}::jsonb,'ok',{_setting('failed')}='0');", "COMMIT;"]
    return ('\n'.join(sql) + '\n').encode()


def _hash(value):
    return isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value) is not None


def _integer(value):
    return type(value) is int and value >= 0


def parse_output(raw, *, schema='public', expected_database=None, budget=None, allow_absent_tables=()):
    b = budgets(budget)
    _require(set(allow_absent_tables) <= ADDITIVE_TABLES, 'UNREVIEWED_ABSENT_TABLE')
    _require(isinstance(raw, bytes) and len(raw) <= b['bytes'], 'FINGERPRINT_OUTPUT_TOO_LARGE')
    try:
        raw_lines = [line for line in raw.splitlines() if line.strip()]
        records = [json.loads(line) for line in raw_lines]
    except (ValueError, UnicodeError):
        raise ValueError('FINGERPRINT_OUTPUT_INVALID') from None
    _require(len(records) >= 2 and all(isinstance(v, dict) for v in records), 'FINGERPRINT_OUTPUT_TRUNCATED')
    first, last = records[0], records[-1]
    _require(first.get('kind') == 'begin' and first.get('version') == VERSION and last.get('kind') == 'end', 'FINGERPRINT_BOUNDARY_MISSING')
    identity_fields = ['database', 'databaseOid', 'systemIdentifier', 'serverVersion', 'schema', 'snapshot', 'readOnly', 'isolation']
    _require(all(first.get(k) is not None and first[k] == last.get(k) for k in identity_fields), 'FINGERPRINT_TRANSACTION_CHANGED')
    _require(first['schema'] == schema and first['readOnly'] == 'on' and first['isolation'] == 'repeatable read' and
             (expected_database is None or first['database'] == expected_database), 'FINGERPRINT_DATABASE_UNVERIFIED')
    _require(all(isinstance(first[k], str) and first[k].isdigit() for k in ['databaseOid', 'systemIdentifier', 'serverVersion']) and
             isinstance(first['database'], str) and bool(first['database']) and re.fullmatch(r'\d+:\d+:[\d,]*', first['snapshot']), 'FINGERPRINT_IDENTITY_INVALID')
    _require(first.get('budget') == last.get('budget') == b and type(last.get('ok')) is bool and
             type(last.get('elapsedMs')) in (int, float) and 0 <= last['elapsedMs'] <= b['seconds'] * 1000, 'FINGERPRINT_BUDGET_UNVERIFIED')
    try:
        begin_at = dt.datetime.fromisoformat(first['observedAt'].replace('Z', '+00:00'))
        end_at = dt.datetime.fromisoformat(last['observedAt'].replace('Z', '+00:00'))
        _require(begin_at.tzinfo and end_at.tzinfo and 0 <= (end_at-begin_at).total_seconds() <= b['seconds']+1, 'FINGERPRINT_TIME_INVALID')
    except (KeyError, AttributeError, TypeError, ValueError):
        raise ValueError('FINGERPRINT_TIME_INVALID') from None
    tables, cursor, total, row_bytes = {}, 1, 0, 0
    for name, business in TABLES.items():
        _require(cursor < len(records)-1, 'FINGERPRINT_TABLE_MISSING')
        meta = records[cursor]; cursor += 1
        _require(meta.get('kind') == 'table' and meta.get('table') == name and meta.get('businessKey') == _keys(business), 'FINGERPRINT_TABLE_ORDER_OR_KEY_CHANGED')
        status, pk = meta.get('status'), meta.get('primaryKey')
        _require(status in ['observed', 'unknown-table-missing', 'unknown-key-or-relation'] and isinstance(pk, list) and
                 all(isinstance(k, str) and k for k in pk) and len(pk) == len(set(pk)) and _hash(meta.get('schemaSha256')), 'FINGERPRINT_CATALOG_INVALID')
        _require(status != 'observed' or bool(pk), 'FINGERPRINT_PRIMARY_KEY_MISSING')
        _require(cursor < len(records)-1, 'FINGERPRINT_COUNT_MISSING')
        count_record=records[cursor];cursor+=1
        _require(count_record.get('kind')=='table-count' and count_record.get('table')==name and
                 _integer(count_record.get('count')) and type(count_record.get('exact')) is bool, 'FINGERPRINT_COUNT_INVALID')
        rows, pages, pending_rows, page_bytes, hashed_count = {}, [], [], 0, 0
        while cursor < len(records)-1 and records[cursor].get('kind') in ['row','page']:
            row = records[cursor]; cursor += 1
            if row['kind']=='page':
                _require(status=='observed' and row.get('table')==name and row.get('page')==len(pages)+1 and
                         _integer(row.get('count')) and row['count']<=PAGE_ROWS and _integer(row.get('rowBytes')) and
                         type(row.get('ok')) is bool, 'FINGERPRINT_PAGE_INVALID')
                if row['ok']:
                    _require(len(pending_rows)==row['count'] and row['rowBytes']==page_bytes and
                             (not pending_rows or row.get('lastKey')==pending_rows[-1]), 'FINGERPRINT_PAGE_COVERAGE_CHANGED')
                else:
                    _require(not pending_rows, 'FINGERPRINT_FAILED_PAGE_EMITTED_ROWS')
                pages.append(row);hashed_count+=row['count'];pending_rows=[];page_bytes=0
                continue
            key, logical = row.get('key'), row.get('businessKey')
            _require(status == 'observed' and row.get('table') == name and isinstance(key, list) and len(key) == len(pk) and
                     isinstance(logical, list) and len(logical) == len(_keys(business)) and
                     all(isinstance(k, str) and len(k.encode('utf8')) <= 2048 for k in key+logical) and _hash(row.get('sha256')), 'FINGERPRINT_ROW_INVALID')
            encoded = canonical(key).decode()
            _require(encoded not in rows, 'FINGERPRINT_DUPLICATE_KEY')
            rows[encoded] = {'sha256': row['sha256'], 'businessKey': logical}
            pending_rows.append(key);page_bytes+=len(raw_lines[cursor-1])+1
            _require(len(pending_rows)<=PAGE_ROWS,'FINGERPRINT_PAGE_TOO_LARGE')
        _require(not pending_rows and cursor < len(records)-1, 'FINGERPRINT_TABLE_END_MISSING')
        end = records[cursor]; cursor += 1
        _require(end.get('kind') == 'table-end' and end.get('table') == name and _integer(end.get('count')) and
                 _integer(end.get('expectedCount')) and end['expectedCount']==count_record['count'] and
                 end.get('pages')==len(pages) and end['count']==hashed_count and
                 _integer(end.get('rowBytes')) and end['rowBytes']==sum(v['rowBytes'] for v in pages) and
                 type(end.get('ok')) is bool, 'FINGERPRINT_TABLE_END_INVALID')
        if end['ok']:
            _require(status == 'observed' and count_record['exact'] and all(v['ok'] for v in pages) and
                     end['count'] == len(rows) == count_record['count'], 'FINGERPRINT_ROW_COUNT_CHANGED')
        elif status == 'observed':
            status = 'unknown-budget'
        if status == 'unknown-table-missing' and name in allow_absent_tables:
            status = 'confirmed-absent-additive'
        tables[name] = {**meta, 'status': status, 'rows': rows, 'rowCount': len(rows), 'reportedCount': end['count'], 'expectedCount':count_record['count'], 'pageEvidence':pages, 'rowBytes': end['rowBytes']}
        total += end['count']; row_bytes += end['rowBytes']
    _require(cursor == len(records)-1 and _integer(last.get('rows')) and _integer(last.get('rowBytes')) and
             total == last['rows'] and row_bytes == last['rowBytes'] and _integer(last.get('wireBytes')) and
             last['wireBytes']==sum(len(line)+1 for line,record in zip(raw_lines,records) if record.get('kind') in ['row','page']), 'FINGERPRINT_OUTPUT_COVERAGE_CHANGED')
    complete = last['ok'] and total <= b['rows'] and last['wireBytes'] <= b['bytes']-1024*1024 and all(t['status'] in ['observed','confirmed-absent-additive'] for t in tables.values())
    db_identity = {k: first[k] for k in identity_fields if k not in ['snapshot', 'readOnly', 'isolation']}
    value = {'kind': 'whole-business-row-fingerprints-v2', 'version': VERSION, 'database': db_identity,
            'databaseIdentitySha256': digest(db_identity), 'observedAt': first['observedAt'], 'snapshot': first['snapshot'],
            'tables': tables, 'excludedObservations': sorted(EXCLUDED_OBSERVATIONS),
            'allowAbsentTables': sorted(allow_absent_tables), 'rawSha256': digest(raw),
            'collection': {'status': 'complete' if complete else 'incomplete', 'consistency': 'read-only-repeatable-read',
                           'elapsedMs': last['elapsedMs'], 'rows': total, 'rowBytes': row_bytes, 'wireBytes':last['wireBytes'], 'outputBytes': len(raw), 'budget': b}}
    value['contentSha256'] = digest(value)
    return value


def compare(before, after):
    """No allowed-progress inference: every changed original row fails closed."""
    problems, missing, changed, added, schema_changed, unknown = [], [], [], [], [], []
    for label, value in [('before', before), ('after', after)]:
        if not isinstance(value, dict) or value.get('kind') != 'whole-business-row-fingerprints-v2' or value.get('version') != VERSION or value.get('collection', {}).get('status') != 'complete' or set(value.get('tables', {})) != set(TABLES) or value.get('contentSha256') != digest({k:v for k,v in value.items() if k!='contentSha256'}):
            problems.append(label + ':INCOMPLETE_FINGERPRINT')
    if problems:
        return {'preservationVerified': False, 'problems': problems, 'missing': missing, 'changed': changed, 'added': added, 'schemaChanged': schema_changed, 'unknownTables': unknown, 'paidOutcomesInferred': False}
    if before.get('databaseIdentitySha256') != after.get('databaseIdentitySha256') or before.get('database') != after.get('database'):
        problems.append('DATABASE_IDENTITY_CHANGED')
    for name in TABLES:
        old, new = before['tables'][name], after['tables'][name]
        if old['status'] == 'confirmed-absent-additive' and name in before['allowAbsentTables'] and new['status'] in ['observed','confirmed-absent-additive']:
            added.extend({'table': name, 'key': key} for key in new['rows'])
            continue
        if old['status'] != 'observed' or new['status'] != 'observed':
            unknown.append(name); continue
        if any(old.get(k) != new.get(k) for k in ['schemaSha256','primaryKey','businessKey']):
            schema_changed.append(name)
        for key, original in old['rows'].items():
            if key not in new['rows']: missing.append({'table': name, 'key': key})
            elif original != new['rows'][key]: changed.append({'table': name, 'key': key, 'beforeSha256': original['sha256'], 'afterSha256': new['rows'][key]['sha256']})
        added.extend({'table': name, 'key': key} for key in new['rows'] if key not in old['rows'])
    return {'preservationVerified': not (problems or missing or changed or schema_changed or unknown),
            'problems': problems, 'missing': missing, 'changed': changed, 'added': added,
            'schemaChanged': schema_changed, 'unknownTables': unknown, 'paidOutcomesInferred': False,
            'beforeSha256': digest(before), 'afterSha256': digest(after),
            'originalRows': sum(t['rowCount'] for t in before['tables'].values())}


def collect(command, db_identity, private_save=None, *, schema='public', expected_database=None, budget=None, allow_absent_tables=(), evidence_label=None):
    """Adapter for HostTransaction.run; caller owns deploy locks and private files."""
    b = budgets(budget)
    label = evidence_label or uuid.uuid4().hex
    _require(isinstance(label,str) and re.fullmatch('[A-Za-z0-9_-]{1,64}',label), 'INVALID_FINGERPRINT_EVIDENCE_LABEL')
    _require(isinstance(db_identity, dict) and re.fullmatch('[a-f0-9]{64}', db_identity.get('id','')) and db_identity.get('running') is True, 'FIXED_DATABASE_IDENTITY_REQUIRED')
    initial = json.loads(command(['docker','inspect',db_identity['id']]))
    _require(len(initial) == 1 and public_identity(initial[0]) == db_identity, 'DATABASE_BASELINE_CHANGED')
    env = dict(v.split('=',1) for v in initial[0]['Config'].get('Env',[]) if '=' in v)
    user, database = env.get('POSTGRES_USER'), env.get('POSTGRES_DB')
    _require(all(isinstance(v,str) and re.fullmatch('[A-Za-z_][A-Za-z0-9_.-]{0,62}',v) for v in [user,database]) and
             (expected_database is None or database == expected_database), 'DATABASE_CONFIG_UNVERIFIED')
    sql = build_sql(schema=schema, budget=b)
    if private_save: private_save('row-fingerprints-'+label+'.sql',sql)
    raw = command(['docker','exec','-i',db_identity['id'],'psql','-X','-qAt','--no-password','-v','ON_ERROR_STOP=1','-U',user,'-d',database],stdin=sql,timeout=b['seconds']+10)
    value = parse_output(raw,schema=schema,expected_database=database,budget=b,allow_absent_tables=allow_absent_tables)
    ending = json.loads(command(['docker','inspect',db_identity['id']]))
    _require(len(ending) == 1 and public_identity(ending[0]) == db_identity, 'DATABASE_BASELINE_CHANGED')
    value['database']['container'] = db_identity
    value['databaseIdentitySha256'] = digest(value['database'])
    value['sqlSha256'] = digest(sql)
    value.pop('contentSha256', None)
    value['contentSha256'] = digest(value)
    if private_save: private_save('row-fingerprints-'+label+'.json',canonical(value)+b'\n')
    return value
