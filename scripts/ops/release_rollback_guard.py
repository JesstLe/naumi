#!/usr/bin/env python3
"""Conservative post-open fallback: unchanged durable business state, never replay.

Completed empty scans may add tick/activity receipts. They do not permit new
business rows, new Agent ownership, an unfinished lease, or a different boot.
This proves only the unchanged-state fallback, not general task migration.
"""
import json
import re

from release47_host import environment, require
from release47_task_snapshot import literal, run_bytes, sha

ROW_LIMIT = 25000
OPERATIONAL = {'app_release_boots', 'app_release_controls',
               'app_release_activities', 'app_worker_tick_receipts'}
REQUIRED = {'app_release_boots', 'app_release_controls', 'app_release_activities',
            'app_release_session_owners', 'app_worker_tick_receipts'}
ZERO_FIELDS = ('activeRequests', 'trackedRequests', 'trackedAcceptedWork', 'agentRuns', 'unknownLeases')


def runtime_binding(plan, state, statuses):
    bindings = {}
    for spec in plan['webs']:
        variant = spec['variant']; slot = state['webs'][variant]; status = statuses[variant]
        require(status.get('identity') == slot['verified']['app']['identity'] and
                status.get('admission', {}).get('mode') == 'draining' and
                status.get('transport', {}).get('verified') is True and
                status.get('transport', {}).get('transport', {}).get('accountingFault') is False,
                'ROLLBACK_APP_BOOT_OR_ADMISSION_UNVERIFIED')
        require(all(type(status.get('observations', {}).get(k)) is int and
                    status['observations'][k] == 0 for k in ZERO_FIELDS),
                'ROLLBACK_APP_WORK_NOT_QUIESCENT')
        bindings[variant] = {'container': slot['running'], 'app': status['identity']}
    return {'releaseId': plan['releaseId'], 'commit': plan['commit'], 'buildVersion': plan['buildVersion'],
            'database': plan['database'], 'webs': bindings,
            'worker': state['worker']['running']}


def build_sql(instances, worker_instance):
    require(instances and all(isinstance(v, str) and v for v in instances) and
            isinstance(worker_instance, str) and worker_instance, 'ROLLBACK_INSTANCE_BINDINGS_REQUIRED')
    candidates = ','.join(literal(v) for v in sorted(set(instances)))
    # Names come only from pg_catalog and are quoted by PostgreSQL format(%I).
    # The limited subquery bounds both hashing work and output even for huge tables.
    template = """SELECT jsonb_build_object('kind','table','table',%L,'count',count(*),
      'digest',encode(sha256(convert_to(COALESCE(string_agg(h,',' ORDER BY h COLLATE "C"),''),'UTF8')),'hex'))
      FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') h
      FROM %I.%I t LIMIT 25001) bounded;"""
    excluded = ','.join(literal(v) for v in sorted(OPERATIONAL))
    return f"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='8s';
SET LOCAL idle_in_transaction_session_timeout='8s';
DO $rollback_catalog$
BEGIN
 IF (SELECT count(*) FROM (SELECT 1 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') LIMIT 513) bounded)>512 THEN
  RAISE EXCEPTION 'ROLLBACK_CATALOG_BOUND_EXCEEDED';
 END IF;
END
$rollback_catalog$;
SELECT jsonb_build_object('kind','begin','database',current_database(),
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'snapshot',txid_current_snapshot()::text);
SELECT jsonb_build_object('kind','catalog','tables',COALESCE(jsonb_agg(c.relname ORDER BY c.relname),'[]'::jsonb),
 'schemaDigest',encode(sha256(convert_to(COALESCE(string_agg(c.relname||':'||(
 SELECT COALESCE(string_agg(a.attnum::text||':'||a.attname||':'||a.atttypid::text||':'||a.atttypmod::text||':'||a.attnotnull::text,
 ',' ORDER BY a.attnum),'') FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 ),';' ORDER BY c.relname),''),'UTF8')),'hex'))
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p');
SELECT format({literal(template)},c.relname,n.nspname,c.relname)
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname NOT IN ({excluded}) ORDER BY c.relname
\\gexec
SELECT jsonb_build_object('kind','activities','count',count(*),'unfinished',count(*) FILTER (WHERE COALESCE(j->>'state','')<>'finished'),
 'agentCount',count(*) FILTER (WHERE j->>'activity_kind'='agent-run'),
 'agentDigest',encode(sha256(convert_to(COALESCE(string_agg(
 encode(sha256(convert_to(j::text,'UTF8')),'hex'),',' ORDER BY j::text COLLATE "C")
 FILTER (WHERE j->>'activity_kind'='agent-run'),''),'UTF8')),'hex'))
 FROM (SELECT to_jsonb(t) j FROM public.app_release_activities t WHERE instance_id IN ({candidates}) LIMIT 25001) x;
SELECT jsonb_build_object('kind','ticks','count',count(*),
 'unfinished',count(*) FILTER (WHERE COALESCE(j->>'phase','')<>'completed'))
 FROM (SELECT to_jsonb(t) j FROM public.app_worker_tick_receipts t
 WHERE web_instance_id IN ({candidates}) OR worker_instance_id={literal(worker_instance)} LIMIT 25001) x;
SELECT jsonb_build_object('kind','owners','unfinished',count(*) FILTER (WHERE COALESCE(state,'')<>'idle'))
 FROM public.app_release_session_owners WHERE instance_id IN ({candidates});
SELECT jsonb_build_object('kind','end','database',current_database(),
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'snapshot',txid_current_snapshot()::text);
ROLLBACK;
""".encode()


def parse(raw, database):
    try:
        rows = [json.loads(line) for line in raw.decode('utf-8').splitlines() if line.strip()]
        first, last = rows[0], rows[-1]
        require(first['kind'] == 'begin' and last['kind'] == 'end' and
                first['database'] == last['database'] == database and
                first['readOnly'] == last['readOnly'] == 'on' and
                first['isolation'] == last['isolation'] == 'repeatable read' and
                isinstance(first['snapshot'], str) and first['snapshot'] == last['snapshot'],
                'ROLLBACK_READ_TRANSACTION_UNVERIFIED')
        groups = {kind: [r for r in rows[1:-1] if r.get('kind') == kind]
                  for kind in ('catalog', 'activities', 'ticks', 'owners')}
        require(all(len(v) == 1 for v in groups.values()), 'ROLLBACK_OBSERVATIONS_INCOMPLETE')
        catalog = groups['catalog'][0]['tables']
        require(isinstance(catalog, list) and len(catalog) == len(set(catalog)) and
                REQUIRED <= set(catalog) and len(catalog) <= 512, 'ROLLBACK_CATALOG_INCOMPLETE')
        schema_digest = groups['catalog'][0]['schemaDigest']
        require(re.fullmatch('[a-f0-9]{64}', schema_digest), 'ROLLBACK_SCHEMA_UNVERIFIED')
        tables = [r for r in rows[1:-1] if r.get('kind') == 'table']
        require(len(rows) == len(tables) + 6 and len(tables) == len({r['table'] for r in tables}) and
                {r['table'] for r in tables} == set(catalog) - OPERATIONAL, 'ROLLBACK_TABLE_COVERAGE_INCOMPLETE')
        require(all(type(r['count']) is int and 0 <= r['count'] <= ROW_LIMIT and
                    re.fullmatch('[a-f0-9]{64}', r['digest']) for r in tables), 'ROLLBACK_TABLE_BOUND_EXCEEDED')
        for kind in ('activities', 'ticks', 'owners'):
            require(type(groups[kind][0]['unfinished']) is int and groups[kind][0]['unfinished'] == 0,
                    'ROLLBACK_DURABLE_WORK_NOT_QUIESCENT')
        activities = groups['activities'][0]; ticks = groups['ticks'][0]
        require(type(activities['agentCount']) is int and 0 <= activities['agentCount'] <= ROW_LIMIT and
                re.fullmatch('[a-f0-9]{64}', activities['agentDigest']) and
                type(activities['count']) is int and 0 <= activities['count'] <= ROW_LIMIT and
                type(ticks['count']) is int and 0 <= ticks['count'] <= ROW_LIMIT,
                'ROLLBACK_OPERATIONAL_BOUND_EXCEEDED')
        return {'catalog': sorted(catalog), 'schemaDigest': schema_digest,
                'tables': {r['table']: {'count': r['count'], 'digest': r['digest']} for r in tables},
                'agents': {'count': activities['agentCount'], 'digest': activities['agentDigest']},
                'snapshot': first['snapshot'], 'rawSha256': sha(raw)}
    except (ValueError, KeyError, TypeError, IndexError):
        raise ValueError('ROLLBACK_SNAPSHOT_MALFORMED') from None


def capture(tx, plan, state, statuses, private_save):
    require(tx.stack is not None, 'ROLLBACK_TRANSACTION_LOCK_REQUIRED')
    binding = runtime_binding(plan, state, statuses)
    row = tx.pin(plan['database']); env = environment(row)
    user = env.get('POSTGRES_USER') or 'postgres'; database = env.get('POSTGRES_DB') or user
    require(all(re.fullmatch('[A-Za-z_][A-Za-z0-9_.-]{0,62}', v) for v in (user, database)),
            'ROLLBACK_DATABASE_NAME_UNVERIFIED')
    instances = [s['identity']['instanceId'] for s in statuses.values()]
    sql = build_sql(instances, plan['worker']['name'])
    raw = run_bytes(tx.run, ['docker', 'exec', '-i', plan['database']['id'], 'psql', '-X', '-qAt',
                    '--no-password', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database], stdin=sql, timeout=120)
    observed = parse(raw, database)
    tx.pin(plan['database'])
    result = {'kind': 'unchanged-business-rollback-boundary-v1', 'binding': binding,
              'databaseNameSha256': sha(database.encode()), 'sqlSha256': sha(sql), 'observed': observed}
    private_save('rollback-boundary.json', result)
    return result


def compare(before, after):
    require(all(isinstance(v, dict) and v.get('kind') == 'unchanged-business-rollback-boundary-v1'
                for v in (before, after)), 'ROLLBACK_ORIGINAL_BOUNDARY_REQUIRED')
    require(all(before.get(k) == after.get(k) for k in ('binding', 'databaseNameSha256', 'sqlSha256')),
            'ROLLBACK_BOUNDARY_BINDING_CHANGED')
    require(all(before['observed'][k] == after['observed'][k] for k in ('catalog', 'schemaDigest', 'tables', 'agents')),
            'ROLLBACK_BUSINESS_OR_AGENT_STATE_CHANGED')
    return {'kind': 'unchanged-business-fallback-v1', 'boundarySha256': sha(before),
            'freshObservationSha256': sha(after), 'unchangedBusinessTables': len(after['observed']['tables']),
            'tasksMigrated': False, 'tasksReplayed': False, 'databaseRestored': False}
