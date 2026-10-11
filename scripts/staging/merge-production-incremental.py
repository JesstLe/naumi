#!/usr/bin/env python3
"""Offline three-way staging merge. Never connects to the production host.

Use the immutable original snapshot as the ancestor. Retain staging edits,
deletions, schema additions, configuration and divergent wallets. Archive
conflicts in a private schema; freeze all source task/billing history.
"""
import argparse
import collections
import decimal
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/opt/naumi-staging/evidence/data-sync-20261012')
CONTAINER = 'naumi-staging-db-1'
SOURCE = 'naumi_sync_source_20261012'
ANCESTOR = 'naumi_snapshot_reference'
GUARD = {
    'app_image_jobs': 'id', 'app_canvas_image_tasks': 'id',
    'app_video_tasks': 'id', 'app_billing_operations': 'id',
    'app_gen_reservations': 'job_id', 'app_ledger': 'id',
    'app_supplier_calls': 'id', 'app_supplier_cost_jobs': 'key',
    'app_media_postprocess': 'operation_id',
}


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def sql(db, command):
    r = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X',
                        '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'naumi_staging',
                        '-d', db], input=command, text=True, capture_output=True)
    if r.returncode:
        # PostgreSQL DETAIL can contain full credentials/customer rows.
        raise RuntimeError('PSQL_FAILED_' + db + ': ' +
                           next((x for x in r.stderr.splitlines()
                                 if x.startswith('ERROR:')), 'exit ' + str(r.returncode)))
    return r.stdout


def read(db):
    tables = sql(db, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    query = ';\n'.join('SELECT json_build_object(\'table\',' + literal(t) +
                        ',\'row\',to_jsonb(r)) FROM public.' + ident(t) + ' r'
                        for t in tables) + ';'
    rows = collections.defaultdict(list)
    for line in sql(db, query).splitlines():
        item = json.loads(line, parse_float=decimal.Decimal)
        rows[item['table']].append(item['row'])
    return rows


def canonical(row):
    # Do not round PostgreSQL numeric prices or nested JSON parameters via float.
    if isinstance(row, decimal.Decimal):
        return str(row)
    if isinstance(row, dict):
        return '{' + ','.join(canonical(k) + ':' + canonical(row[k]) for k in sorted(row)) + '}'
    if isinstance(row, (list, tuple)):
        return '[' + ','.join(canonical(x) for x in row) + ']'
    return json.dumps(row, ensure_ascii=False, separators=(',', ':'))


def protected(table):
    return (table.startswith('app_model_') or table in {
        'app_settings', 'app_billing_config_versions', 'app_projects',
        'app_templates', 'app_supplier_accounts', 'app_supplier_admin_audit',
        'app_supplier_variable_costs', 'app_supplier_query_limits',
        'app_supplier_usage_buckets', 'app_supplier_usage_runs',
        'app_supplier_callback_inbox',
    })


def prepare(target):
    meta = json.loads((ROOT / 'schema-inventory.json').read_text())
    columns = collections.defaultdict(list)
    keys = collections.defaultdict(list)
    for c in meta['old']['COLUMNS']:
        columns[c['table_name']].append(c['column_name'])
    for k in meta['old']['PKS']:
        keys[k['table_name']].append(k['column_name'])
    current = read(target)
    source = read(SOURCE)
    ancestor = read(ANCESTOR)
    def key(table, row):
        return canonical([row[k] for k in keys[table]])
    cm = {t: {key(t, r): r for r in rr} for t, rr in current.items() if t in keys}
    am = {t: {key(t, r): r for r in rr} for t, rr in ancestor.items() if t in keys}
    divergent_wallets = set()
    for k, user in cm.get('app_users', {}).items():
        base = am.get('app_users', {}).get(k)
        if base is None or any(user[x] != base[x] for x in ('credits_total', 'credits_used')):
            divergent_wallets.add(user['email'])
    for table in ('app_credit_batches',):
        before = collections.defaultdict(list)
        after = collections.defaultdict(list)
        for r in ancestor.get(table, []):
            before[r['email']].append(canonical(r))
        for r in current.get(table, []):
            after[r['email']].append(canonical({k: r[k] for k in columns[table]}))
        for email in after:
            if sorted(after[email]) != sorted(before[email]):
                divergent_wallets.add(email)
    plan = []; summary = collections.defaultdict(collections.Counter)
    preserved = {}
    for table in sorted(columns):
        assert keys[table], 'PRIMARY_KEY_REQUIRED_' + table
        before_map = am.get(table, {}); target_map = cm.get(table, {})
        for row in source.get(table, []):
            k = key(table, row); old = before_map.get(k); live = target_map.get(k)
            common = {c: live[c] for c in columns[table]} if live is not None else None
            if protected(table):
                action = 'protected'
            elif table == 'app_credit_batches' and row['email'] in divergent_wallets:
                action = 'wallet-conflict'
            elif live is None:
                action = 'deleted-in-staging' if old is not None else 'insert'
            elif common == row:
                action = 'same'
            elif common == old:
                action = 'update'
            elif row == old:
                action = 'staging-only'
            else:
                action = 'conflict'
            # Never alter the wallet fields of a divergent staging customer.
            if table == 'app_users' and row['email'] in divergent_wallets and action == 'update':
                row = dict(row, credits_total=live['credits_total'], credits_used=live['credits_used'])
            summary[table][action] += 1
            if action in ('insert', 'update', 'conflict', 'wallet-conflict', 'deleted-in-staging'):
                plan.append({'table': table, 'key': k, 'action': action,
                             'source': row, 'target': live, 'ancestor': old})
        for k, live in target_map.items():
            item = next((p for p in plan if p['table'] == table and p['key'] == k and p['action'] == 'update'), None)
            if item is None:
                preserved[table + '\n' + k] = hashlib.sha256(canonical(live).encode()).hexdigest()
    # Include every newer table in preservation, including metadata and imports.
    for table, rows in current.items():
        if table not in columns:
            preserved['NEW_TABLE\n' + table] = hashlib.sha256(canonical(sorted(canonical(r) for r in rows)).encode()).hexdigest()
    dependencies = collections.defaultdict(set)
    selected = {p['table'] for p in plan if p['action'] in ('insert', 'update')}
    for f in meta['new']['FKS'] or []:
        if f['child'] in selected and f['parent'] in selected and f['child'] != f['parent']:
            dependencies[f['child']].add(f['parent'])
    order = []
    while selected:
        ready = sorted(t for t in selected if not (dependencies[t] & selected))
        assert ready, 'CYCLIC_FOREIGN_KEYS'
        order.extend(ready); selected.difference_update(ready)
    result = {'plan': plan, 'summary': {k: dict(v) for k, v in summary.items()},
              'preserved': preserved, 'columns': columns, 'keys': keys,
              'order': order, 'wallets_preserved': len(divergent_wallets)}
    (ROOT / (target + '.plan.json')).write_text(canonical(result))
    print('PLAN=' + canonical({'target': target, 'actions': dict(sum(summary.values(), collections.Counter())),
                               'divergent_wallets': len(divergent_wallets)}))
    return result


def apply(target, plan):
    assert target in ('naumi_staging', 'naumi_sync_trial_20261012'), 'TARGET_NOT_STAGING'
    assert sql(target, "SELECT to_regclass('naumi_staging_guard.origin_rows')").strip(), 'HISTORY_GUARD_REQUIRED'
    assert not sql(target, "SELECT to_regclass('naumi_sync_20261012.changed_rows')").strip(), 'ALREADY_APPLIED_REUSE_EVIDENCE'
    if target == 'naumi_staging':
        assert sql(target, 'SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()').strip() == '0', 'STOP_STAGING_WRITERS_FIRST'
    source_hash = hashlib.sha256((ROOT / 'production.database.dump').read_bytes()).hexdigest()
    statements = ['BEGIN;', 'SET LOCAL lock_timeout=\'15s\';',
                  'CREATE SCHEMA IF NOT EXISTS naumi_sync_20261012;',
                  'CREATE TABLE IF NOT EXISTS naumi_sync_20261012.conflicts(table_name text, row_key text, reason text, source_row jsonb, target_row jsonb, ancestor_row jsonb, PRIMARY KEY(table_name,row_key));',
                  'CREATE TABLE IF NOT EXISTS naumi_sync_20261012.changed_rows(table_name text,row_key text, action text, before_row jsonb, after_row jsonb, PRIMARY KEY(table_name,row_key));',
                  'REVOKE ALL ON SCHEMA naumi_sync_20261012 FROM PUBLIC;']
    statements.append('LOCK TABLE ' + ','.join('public.' + ident(t) for t in plan['order']) + ' IN SHARE ROW EXCLUSIVE MODE;')
    touched = set()
    for t in plan['order']:
        if t in GUARD:
            statements.append('ALTER TABLE ' + ident(t) + ' DISABLE TRIGGER naumi_staging_history_freeze;')
            touched.add(t)
        for item in (p for p in plan['plan'] if p['table'] == t and p['action'] in ('insert', 'update')):
            cols = plan['columns'][t]
            row = literal(canonical(item['source'])) + '::jsonb'
            fields = ','.join(ident(c) for c in cols)
            rec = 'jsonb_populate_record(NULL::public.' + ident(t) + ',' + row + ')'
            if item['action'] == 'insert':
                statements.append('INSERT INTO public.' + ident(t) + '(' + fields + ') SELECT ' + fields + ' FROM ' + rec + ';')
            else:
                where = ' AND '.join('d.' + ident(k) + '=s.' + ident(k) for k in plan['keys'][t])
                assignments = ','.join(ident(c) + '=s.' + ident(c) for c in cols if c not in plan['keys'][t])
                preimage = literal(canonical(item['target'])) + '::jsonb'
                tag = '$sync_' + hashlib.sha256((row + preimage).encode()).hexdigest()[:24] + '$'
                assert tag not in row + preimage
                statements.append('DO ' + tag + ' DECLARE n integer; BEGIN UPDATE public.' + ident(t) + ' d SET ' + assignments + ' FROM ' + rec + ' s WHERE ' + where + ' AND to_jsonb(d)=' + preimage + '; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION \'CONCURRENT_ROW_CHANGE\'; END IF; END ' + tag + ';')
            statements.append('INSERT INTO naumi_sync_20261012.changed_rows VALUES(' +
                              ','.join([literal(t), literal(item['key']), literal(item['action']),
                                        literal(canonical(item['target'])) + '::jsonb', row]) + ');')
    for item in (p for p in plan['plan'] if p['action'] not in ('insert', 'update')):
        statements.append('INSERT INTO naumi_sync_20261012.conflicts VALUES(' +
                          ','.join(literal(canonical(item[k])) + '::jsonb' if k in ('source', 'target', 'ancestor') else literal(item[k])
                                    for k in ('table', 'key', 'action', 'source', 'target', 'ancestor')) + ') ON CONFLICT DO NOTHING;')
    for t in plan['order']:
        key_expr = 'jsonb_build_array(' + ','.join('d.' + ident(k) for k in plan['keys'][t]) + ')'
        statements.append('UPDATE naumi_sync_20261012.changed_rows a SET after_row=to_jsonb(d) FROM public.' +
                          ident(t) + ' d WHERE a.table_name=' + literal(t) + ' AND a.row_key::jsonb=' + key_expr + ';')
    for t, k in GUARD.items():
        # Freeze only source rows actually present in the working copy.
        for item in (p for p in plan['plan'] if p['table'] == t and p['action'] in ('insert', 'update')):
            statements.append('INSERT INTO naumi_staging_guard.origin_rows(table_name,key_column,row_key,snapshot_sha256) VALUES(' +
                              ','.join(literal(v) for v in (t, k, str(item['source'][k]), source_hash)) + ') ON CONFLICT DO NOTHING;')
        if t in touched:
            statements.append('ALTER TABLE ' + ident(t) + ' ENABLE TRIGGER naumi_staging_history_freeze;')
    for c in json.loads((ROOT / 'schema-inventory.json').read_text())['new']['COLUMNS']:
        if c['table_name'] in plan['order'] and c['column_default'] and 'nextval(' in c['column_default']:
            t = c['table_name']; k = c['column_name']
            statements.append('SELECT setval(pg_get_serial_sequence(' + literal(t) + ',' + literal(k) + '),GREATEST((SELECT COALESCE(max(' + ident(k) + '),1) FROM ' + ident(t) + '),(SELECT last_value FROM ' + ident(t + '_' + k + '_seq') + ')),true);')
    statements.append('COMMIT;')
    migration = '\n'.join(statements) + '\n'
    (ROOT / (target + '.apply.private.sql')).write_text(migration)
    sql(target, migration)
    print('APPLY=PASS TARGET=' + target)


def verify(target, plan, running=False):
    current = read(target); errors = []
    def key(t, row):
        return canonical([row[k] for k in plan['keys'][t]])
    maps = {t: {key(t, r): r for r in rows} for t, rows in current.items() if t in plan['keys']}
    for token, digest in plan['preserved'].items():
        t, k = token.split('\n', 1)
        # After writers resume, staging-only task schedulers legitimately update
        # their timestamps. Full preservation was verified before startup;
        # keep strict checks for configuration and all imported source rows.
        if running and t != 'NEW_TABLE' and not protected(t):
            continue
        if t == 'NEW_TABLE':
            actual = canonical(sorted(canonical(r) for r in current.get(k, [])))
        else:
            actual = canonical(maps.get(t, {}).get(k))
        if hashlib.sha256(actual.encode()).hexdigest() != digest:
            errors.append('PRESERVATION_' + t)
    for p in plan['plan']:
        if p['action'] in ('insert', 'update'):
            r = maps[p['table']].get(p['key'])
            if not r or any(r[c] != p['source'][c] for c in plan['columns'][p['table']]):
                errors.append('SOURCE_FIELDS_' + p['table'])
            if p['action'] == 'update' and any(r[c] != v for c, v in p['target'].items() if c not in plan['columns'][p['table']]):
                errors.append('NEW_COLUMNS_CHANGED_' + p['table'])
    assert not errors, canonical(collections.Counter(errors))
    # All copied execution/billing rows must have provenance before any app resumes.
    assert sql(target, "SELECT count(*) FROM pg_trigger WHERE tgname='naumi_staging_history_freeze' AND tgenabled='D'").strip() == '0'
    for t, k in GUARD.items():
        n = sum(1 for p in plan['plan'] if p['table'] == t and p['action'] in ('insert', 'update'))
        if n:
            assert sql(target, 'SELECT count(*) FROM naumi_staging_guard.origin_rows WHERE table_name=' + literal(t) + ' AND snapshot_sha256=' + literal(hashlib.sha256((ROOT / 'production.database.dump').read_bytes()).hexdigest())).strip() == str(n)
    print(('VERIFY_RUNTIME' if running else 'VERIFY') + '=PASS TARGET=' + target +
          (' CONFIG_PRESERVED=1' if running else ' PRESERVED=' + str(len(plan['preserved']))) +
          ' SOURCE_FIELDS=EXACT HISTORY_GUARD=ENABLED')


def rollback(target, plan):
    assert target in ('naumi_sync_trial_20261012', 'naumi_staging')
    if target == 'naumi_staging':
        assert sql(target, 'SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()').strip() == '0', 'STOP_STAGING_WRITERS_FIRST'
    rows = [json.loads(line, parse_float=decimal.Decimal) for line in sql(target,
        'SELECT to_jsonb(r) FROM naumi_sync_20261012.changed_rows r').splitlines()]
    current = read(target)
    maps = {t: {canonical([r[k] for k in plan['keys'][t]]): r for r in rr}
            for t, rr in current.items() if t in plan['keys']}
    for item in rows:
        # This also catches writes occurring after the merge; never clobber them.
        assert maps[item['table_name']].get(item['row_key']) == item['after_row'], 'POST_SYNC_DATA_CHANGED'
    statements = ['BEGIN;', "SET LOCAL lock_timeout='15s';"]
    for t in plan['order']:
        if t in GUARD:
            statements.append('ALTER TABLE ' + ident(t) + ' DISABLE TRIGGER naumi_staging_history_freeze;')
        for item in (r for r in rows if r['table_name'] == t and r['action'] == 'update'):
            cols = list(item['before_row'])
            assignments = ','.join(ident(c) + '=s.' + ident(c) for c in cols if c not in plan['keys'][t])
            join = ' AND '.join('d.' + ident(k) + '=s.' + ident(k) for k in plan['keys'][t])
            statements.append('UPDATE ' + ident(t) + ' d SET ' + assignments + ' FROM jsonb_populate_record(NULL::' + ident(t) + ',' + literal(canonical(item['before_row'])) + '::jsonb) s WHERE ' + join + ';')
    for t in reversed(plan['order']):
        for item in (r for r in rows if r['table_name'] == t and r['action'] == 'insert'):
            keys = json.loads(item['row_key'])
            where = ' AND '.join(ident(k) + '=' + literal(str(v)) for k, v in zip(plan['keys'][t], keys))
            statements.append('DELETE FROM ' + ident(t) + ' WHERE ' + where + ';')
        if t in GUARD:
            statements.append('ALTER TABLE ' + ident(t) + ' ENABLE TRIGGER naumi_staging_history_freeze;')
    source_hash = hashlib.sha256((ROOT / 'production.database.dump').read_bytes()).hexdigest()
    statements.append('DELETE FROM naumi_staging_guard.origin_rows WHERE snapshot_sha256=' + literal(source_hash) + ';')
    statements.append('DROP SCHEMA naumi_sync_20261012 CASCADE; COMMIT;')
    sql(target, '\n'.join(statements))
    print('ROLLBACK=PASS TARGET=' + target + ' SOURCE_INSERTS_REMOVED=1 STAGING_PREIMAGES_RESTORED=1')


def main():
    p = argparse.ArgumentParser(); p.add_argument('mode', choices=['plan', 'apply', 'verify', 'verify-runtime', 'rollback']); p.add_argument('target')
    args = p.parse_args()
    assert 'ENVIRONMENT=staging' in pathlib.Path('/opt/naumi-staging/ENVIRONMENT').read_text().splitlines()
    assert not pathlib.Path('/opt/naumi/current').exists()
    assert args.target in ('naumi_staging', 'naumi_sync_trial_20261012')
    if args.mode == 'plan':
        prepare(args.target)
    else:
        plan = json.loads((ROOT / (args.target + '.plan.json')).read_text(), parse_float=decimal.Decimal)
        if args.mode == 'apply': apply(args.target, plan)
        elif args.mode == 'verify': verify(args.target, plan)
        elif args.mode == 'verify-runtime': verify(args.target, plan, running=True)
        else: rollback(args.target, plan)


if __name__ == '__main__':
    main()
