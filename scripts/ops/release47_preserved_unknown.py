"""Exact, read-only preservation of one explicitly skipped UNKNOWN operation.

No repair, refund, resubmission, migration, credential decryption or UNKNOWN clearing.
SQL callbacks return a list of JSON objects, as NormalController.sql does. Private
rowsets are returned as JSONB text strings, never decoded by a float-based adapter.
"""
import hashlib
import json
import pathlib
import re
import os
import stat
from decimal import Decimal
try:
    from .release47_host import Hold
except ImportError:
    from release47_host import Hold

CORE = ('app_video_tasks', 'app_billing_operations', 'app_gen_reservations',
        'app_supplier_calls', 'app_supplier_variable_costs', 'app_billing_reconciliations',
        'app_billing_api_cost_reviews', 'app_ledger')
EXTRA = ('app_supplier_cost_jobs', 'app_supplier_cost_adjustments', 'app_supplier_call_outputs',
         'app_billing_intents', 'app_release_activities', 'app_model_provider_leases',
         'app_model_capacity_accounts', 'app_model_execution_stages')
CONFIG = ('app_model_config_state', 'app_model_config_versions', 'app_billing_config_versions', 'app_settings')
IDENT = re.compile(r'^[a-z_][a-z0-9_]{0,62}$')
MAX = 16 * 1024 * 1024


def exact_json(v):
    """JSON numbers stay exact through PG; no binary float normalization."""
    if v is None: return 'null'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, (int, Decimal)):
        if isinstance(v, Decimal) and not v.is_finite(): raise ValueError('INVALID_NUMBER')
        return str(v)
    if isinstance(v, str): return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list): return '[' + ','.join(exact_json(x) for x in v) + ']'
    if isinstance(v, dict):
        if not all(isinstance(k, str) for k in v): raise ValueError('INVALID_KEYS')
        return '{' + ','.join(exact_json(k) + ':' + exact_json(v[k]) for k in sorted(v)) + '}'
    raise ValueError('INEXACT_JSON_TYPE')


def sha(raw): return hashlib.sha256(raw).hexdigest()
def literal(value): return "'" + str(value).replace("'", "''") + "'"
def ident(value):
    if not isinstance(value, str) or not IDENT.fullmatch(value): raise ValueError('INVALID_IDENTIFIER')
    return '"' + value + '"'


def load_private(path):
    p = pathlib.Path(path)
    if p.is_symlink() or not p.is_file(): raise ValueError('PRIVATE_FILE_REQUIRED')
    before = p.lstat()
    fd = os.open(p, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as source:
        after = os.fstat(source.fileno())
        if not stat.S_ISREG(after.st_mode) or before.st_dev != after.st_dev or before.st_ino != after.st_ino:
            raise ValueError('PRIVATE_FILE_CHANGED')
        raw = source.read(MAX + 1)
    if not 0 < len(raw) <= MAX: raise ValueError('PRIVATE_FILE_SIZE')
    return raw, json.loads(raw, parse_float=Decimal)


class Guard:
    def __init__(self, cfg, sql, save):
        self.cfg = dict(cfg)
        self.sql, self.save = sql, save
        self.established = False
        self.held = False
        self.sequence = 0
        self.supplement_sha = None
        self.original = None
        self.allow = json.loads(exact_json(cfg.get('allowedAdditiveColumns', {})), parse_float=Decimal)
        self.path = pathlib.Path(cfg['supplementalPath'])
        if not re.fullmatch(r'[a-f0-9]{64}', str(cfg.get('baselineSha256', ''))):
            raise Hold('PRESERVED_UNKNOWN_BASELINE_SHA_REQUIRED')

    def _hold(self, code, stage):
        self.held = True
        self.sequence += 1
        try:
            self.save(f'preserved-unknown-{self.sequence:04d}-HOLD.json',
                      {'stage': stage, 'status': 'HOLD', 'code': code, 'readOnly': True})
        except Exception:
            pass  # Evidence failure never turns a preservation failure into success.
        raise Hold('PRESERVED_UNKNOWN_' + code) from None

    def _one(self, query):
        try:
            value = self.sql(query)
        except Exception:
            raise ValueError('READ_ONLY_SQL_UNAVAILABLE') from None
        if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], dict):
            raise ValueError('SQL_RESULT_INVALID')
        return value[0]

    def _catalog(self):
        tables = ','.join(literal(n) for n in CORE + EXTRA + CONFIG)
        result = self._one(f"SELECT json_build_object('catalog',COALESCE(jsonb_object_agg(n,cols),'{{}}'::jsonb)) FROM (SELECT n,(SELECT jsonb_object_agg(attname,format_type(atttypid,atttypmod)) FROM pg_attribute WHERE attrelid=to_regclass(n) AND attnum>0 AND NOT attisdropped) cols FROM unnest(ARRAY[{tables}]::text[]) x(n)) q;")['catalog']
        if any(not isinstance(result.get(n), dict) for n in CORE + EXTRA + CONFIG):
            raise ValueError('TABLE_MISSING')
        return result

    def _read_original(self):
        raw, data = load_private(self.cfg['baselinePath'])
        if sha(raw) != self.cfg['baselineSha256']: raise ValueError('BASELINE_CHANGED')
        if set(data.get('tables', {})) != set(CORE): raise ValueError('BASELINE_TABLES_INVALID')
        if not isinstance(data.get('taskId'), str) or not 1 <= len(data['taskId']) <= 240: raise ValueError('BASELINE_TASK_INVALID')
        for name, table in data['tables'].items():
            cols, rows = table.get('columns'), table.get('rows')
            if not isinstance(cols, list) or not cols or len(cols) != len(set(cols)) or any(not IDENT.fullmatch(c) for c in cols): raise ValueError('BASELINE_COLUMNS_INVALID')
            if not isinstance(rows, list) or any(not isinstance(r, dict) or set(r) != set(cols) for r in rows): raise ValueError('BASELINE_ROWS_INVALID')
            if not re.fullmatch(r'[a-f0-9]{64}',str(table.get('sha256',''))): raise ValueError('BASELINE_TABLE_SHA_REQUIRED')
        calls, tasks = data['tables']['app_supplier_calls']['rows'], data['tables']['app_video_tasks']['rows']
        if len(calls) != 1 or len(tasks) != 1 or tasks[0].get('id') != data['taskId'] or calls[0].get('operation_id') != data['taskId']:
            raise ValueError('BASELINE_UNIQUE_CALL_TASK_REQUIRED')
        if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', str(calls[0].get('id', ''))): raise ValueError('BASELINE_CALL_INVALID')
        self.original = data

    def _predicates(self):
        d = self.original; task = d['taskId']; call = d['tables']['app_supplier_calls']['rows'][0]
        video = d['tables']['app_video_tasks']['rows'][0]
        roots = {task, call['id']}
        for v in (video.get('idempotency_key'), video.get('source_id'), call.get('operation_id'), call.get('task_id')):
            if isinstance(v, str) and v: roots.add(v)
        values = ','.join(literal(v) for v in sorted(roots)); task_lit = literal(task); call_lit = literal(call['id'])
        q = lambda field: ident(field) + '::text IN (' + values + ')'
        ledger = {task, 'led-video-' + task}
        for row in d['tables']['app_billing_operations']['rows']:
            if row.get('ledger_id'): ledger.add(row['ledger_id'])
        def previous(name, key, predicate):
            ids = [r[key] for r in d['tables'][name]['rows'] if r.get(key) is not None]
            return '(' + predicate + ((' OR ' + ident(key) + '::text IN (' + ','.join(literal(x) for x in ids) + ')') if ids else '') + ')'
        result = {
            'app_video_tasks': previous('app_video_tasks','id', q('id')),
            'app_billing_operations': previous('app_billing_operations','id', q('id')),
            'app_gen_reservations': previous('app_gen_reservations','job_id', q('job_id')),
            'app_supplier_calls': previous('app_supplier_calls','id', q('operation_id') + ' OR ' + q('id') + ' OR ' + q('parent_call_id') + ' OR ' + q('task_id')),
            'app_supplier_variable_costs': previous('app_supplier_variable_costs','id', q('operation_id')),
            'app_billing_reconciliations': previous('app_billing_reconciliations','id', q('operation_id')),
            'app_billing_api_cost_reviews': previous('app_billing_api_cost_reviews','id', q('operation_id')),
            'app_ledger': previous('app_ledger','id', 'id::text IN (' + ','.join(literal(x) for x in sorted(ledger)) + ')'),
            'app_supplier_cost_jobs': f"key='task:'||{call_lit} OR payload->>'callId' IN ({values}) OR payload->>'operation' IN ({values}) OR payload->>'operationId' IN ({values}) OR payload->>'taskId' IN ({values}) OR payload#>>'{{context,operationId}}' IN ({values})",
            'app_supplier_cost_adjustments': q('call_id'), 'app_supplier_call_outputs': q('call_id'),
            'app_billing_intents': 'id::text IN (' + ','.join(literal('intent-' + v) for v in sorted(roots)) + ')',
            'app_release_activities': '(' + ' OR '.join(f"({ident(k)}::text IN ({values}) OR EXISTS(SELECT 1 FROM unnest(ARRAY[{values}]::text[]) z(v) WHERE left({ident(k)},length(v)+1)=v||':'))" for k in ('work_key','admission_key','detail')) + ')',
            'app_model_execution_stages': q('operation_id'),
        }
        # A capacity lease has no task FK. Track the frozen provider's shared
        # account identity conservatively; never guess it from a credential.
        provider = video.get('provider_snapshot')
        if not isinstance(provider, dict) or not isinstance(provider.get('id'), str) or not isinstance(provider.get('baseUrl'), str):
            raise ValueError('FROZEN_PROVIDER_REQUIRED')
        from urllib.parse import urlsplit
        url = urlsplit(provider['baseUrl'])
        if url.scheme not in ('http','https') or not url.hostname or url.username or url.password: raise ValueError('FROZEN_PROVIDER_ORIGIN_INVALID')
        port = url.port
        origin = url.scheme + '://' + url.hostname.lower() + ((':' + str(port)) if port and (url.scheme,port) not in [('http',80),('https',443)] else '')
        alias = sha((provider['id'] + '\n' + origin).encode())
        identities = f"SELECT identity FROM app_model_capacity_accounts WHERE alias={literal(alias)} UNION SELECT {literal(alias)}"
        result['app_model_capacity_accounts'] = f"alias={literal(alias)} OR identity IN ({identities})"
        result['app_model_provider_leases'] = f"identity IN ({identities}) AND expires_at>now()"
        return result

    def _validate_catalog(self, catalog, expected):
        for table, columns in expected.items():
            actual = catalog[table]
            if any(c not in actual for c in columns): raise ValueError('COLUMN_MISSING')
            if isinstance(columns, dict) and any(actual[c] != t for c,t in columns.items()): raise ValueError('COLUMN_TYPE_CHANGED')
            for col in set(actual) - set(columns):
                if table in CONFIG: raise ValueError('UNREVIEWED_CONFIGURATION_COLUMN')
                rule = self.allow.get(table, {}).get(col)
                if not isinstance(rule, dict) or set(rule) != {'pgType','jsonValue'} or rule['pgType'] != actual[col]: raise ValueError('UNREVIEWED_ADDITIVE_COLUMN')
                exact_json(rule['jsonValue'])

    def _rowset(self, table, columns, predicate):
        projection = ','.join(ident(c) for c in columns)
        key = ident('job_id' if table == 'app_gen_reservations' else 'id') if table in CORE else None
        sort = 'k' if key else 'j'
        order_field = ',p.' + key + ' k' if key else ''
        return f"SELECT COALESCE(jsonb_agg(j ORDER BY {sort}),'[]'::jsonb) rows FROM (SELECT to_jsonb(p) j{order_field} FROM (SELECT {projection} FROM {ident(table)} WHERE {predicate}) p) t"

    def _compare(self, catalog, tables):
        predicates = self._predicates(); queries = []
        for name, spec in tables.items():
            columns = spec['columns']; expected = spec.get('rowsRaw')
            if expected is None: expected = exact_json(spec['rows'])
            expected_sha = spec.get('sha256') or sha(expected.encode())
            if not re.fullmatch(r'[a-f0-9]{64}',expected_sha): raise ValueError('ROWSET_SHA_REQUIRED')
            actual = self._rowset(name, columns, predicates[name])
            safe = []
            for c in set(catalog[name]) - set(columns):
                rule = self.allow[name][c]
                safe.append(f"NOT EXISTS(SELECT 1 FROM {ident(name)} WHERE ({predicates[name]}) AND COALESCE(to_jsonb({ident(c)}),'null'::jsonb) IS DISTINCT FROM {literal(exact_json(rule['jsonValue']))}::jsonb)")
            safe_sql = ' AND '.join(safe) or 'true'
            expected_sql = f"SELECT {literal(expected)}::jsonb rows" if name in CORE else f"SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb) rows FROM jsonb_array_elements({literal(expected)}::jsonb)"
            queries.append(f"SELECT jsonb_build_object('table',{literal(name)},'count',jsonb_array_length(a.rows),'sha256',encode(sha256(convert_to(a.rows::text,'UTF8')),'hex'),'match',a.rows=e.rows,'hashMatch',encode(sha256(convert_to(a.rows::text,'UTF8')),'hex')={literal(expected_sha)},'additiveSafe',({safe_sql})) x FROM ({actual}) a CROSS JOIN ({expected_sql}) e")
        result = self._one("SELECT json_build_object('tables',jsonb_agg(x)) FROM (" + ' UNION ALL '.join(queries) + ') checks;')
        if len(result.get('tables', [])) != len(tables) or any(r.get('match') is not True or r.get('hashMatch') is not True or r.get('additiveSafe') is not True for r in result['tables']): raise ValueError('EXACT_ROWSET_CHANGED')
        return result

    def _invariants(self):
        d = self.original; task = literal(d['taskId']); predicates = self._predicates()
        # Original configuration anchors are not resampled with a new program.
        expected = {k:d[k] for k in ('model','billing','leases','activity')}
        if d.get('generationPosts') != 0: raise ValueError('POST_DECLARATION_INVALID')
        sql = f"""SELECT jsonb_build_object(
          'model',(SELECT jsonb_build_object('version',v.version::text,'digest',v.digest,'config_md5',md5(v.config::text)) FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton),
          'billing',(SELECT jsonb_build_object('version',v.version::text,'config_md5',md5(v.config::text)) FROM app_settings s JOIN app_billing_config_versions v ON v.version::text=s.v WHERE s.k='billing_config_version'),
          'leases',(SELECT jsonb_build_object('pollLockPresent',poll_lock_until IS NOT NULL,'pollLockFuture',COALESCE(poll_lock_until>now(),false),'nextPollPresent',next_poll_at IS NOT NULL) FROM app_video_tasks WHERE id={task}),
          'activity',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM app_release_activities t WHERE state<>'finished' AND {predicates['app_release_activities']})) = {literal(exact_json(expected))}::jsonb AS match;"""
        # sql callback expects JSON object rows rather than bare SQL booleans.
        result = self._one("SELECT json_build_object('match',q.match) FROM (" + sql.rstrip(';') + ') q;')
        if result.get('match') is not True: raise ValueError('ORIGINAL_INVARIANT_CHANGED')

    def establish(self):
        try:
            if self.established or self.path.exists() or self.path.is_symlink(): raise ValueError('SUPPLEMENT_ALREADY_EXISTS')
            self._read_original(); catalog = self._catalog()
            self._validate_catalog(catalog, {n:t['columns'] for n,t in self.original['tables'].items()})
            core_proof = self._compare(catalog, self.original['tables']); self._invariants()
            predicates = self._predicates(); queries = []
            for name in EXTRA:
                cols = list(catalog[name]); rowset = self._rowset(name, cols, predicates[name])
                queries.append(f"SELECT {literal(name)} n,({rowset})::text raw")
            captured = self._one("SELECT json_build_object('tables',jsonb_object_agg(n,raw)) FROM (" + ' UNION ALL '.join(queries) + ') t;')['tables']
            supplement = {'kind':'preserved-unknown-private-v1','originalSha256':self.cfg['baselineSha256'], 'catalog':catalog,
                          'tables':{n:{'columns':list(catalog[n]),'rowsRaw':captured[n],'sha256':sha(captured[n].encode())} for n in EXTRA}}
            payload = (exact_json(supplement) + '\n').encode()
            self.save(self.path.name, payload)
            disk, stored = load_private(self.path)
            if disk != payload: raise ValueError('SUPPLEMENT_SAVE_MISMATCH')
            self.supplement_sha = sha(disk); self.supplement = stored
            self.established = True
            return self.check('established')
        except Hold as e:
            if str(e).startswith('PRESERVED_UNKNOWN_'): raise
            self._hold('DEPENDENCY_HOLD','establish')
        except Exception as e: self._hold(str(e) if isinstance(e, ValueError) and re.fullmatch(r'[A-Z0-9_]+', str(e)) else 'ESTABLISH_UNAVAILABLE', 'establish')

    def check(self, stage):
        stage = stage if isinstance(stage,str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',stage) else 'invalid-stage'
        try:
            if not self.established: raise ValueError('NOT_ESTABLISHED')
            if stage == 'invalid-stage': raise ValueError('STAGE_INVALID')
            self._read_original(); disk, stored = load_private(self.path)
            if sha(disk) != self.supplement_sha or stored != self.supplement: raise ValueError('SUPPLEMENT_CHANGED')
            catalog = self._catalog(); self._validate_catalog(catalog,self.supplement['catalog'])
            # Original core columns stay authoritative, including their empty sets.
            self._validate_catalog(catalog,{n:t['columns'] for n,t in self.original['tables'].items()})
            core = self._compare(catalog,self.original['tables']); extra = self._compare(catalog,self.supplement['tables']); self._invariants()
            if self.held: raise ValueError('PRIOR_HOLD_LATCHED')
            proof = {'stage':stage,'status':'MATCH','originalSha256':self.cfg['baselineSha256'],
                     'supplementSha256':self.supplement_sha,'generationPostsDeclarationOnly':True,'core':core,'supplement':extra,'readOnly':True}
            self.sequence += 1; self.save(f'preserved-unknown-{self.sequence:04d}-{stage}.json', proof)
            return proof
        except Hold as e:
            if str(e).startswith('PRESERVED_UNKNOWN_'): raise
            self._hold('DEPENDENCY_HOLD',stage)
        except Exception as e: self._hold(str(e) if isinstance(e, ValueError) and re.fullmatch(r'[A-Z0-9_]+', str(e)) else 'CHECK_UNAVAILABLE', stage)
