"""Synthetic values only. Real PostgreSQL JSONB semantics; never opens a live host."""
import copy
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
import uuid
from decimal import Decimal
from urllib.parse import urlsplit
import release47_preserved_unknown as m

TASK = 'vid-synthetic-unknown'
CALL = '11111111-1111-4111-8111-111111111111'
PROVIDER = {'id':'synthetic-provider','baseUrl':'https://synthetic.invalid/v1'}

class LocalPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get('NAUMI_VERIFY_ISOLATED_DB') != '1':
            raise unittest.SkipTest('explicit local isolated PostgreSQL marker required')
        dsn = urlsplit(os.environ.get('DATABASE_URL',''))
        if dsn.hostname != '127.0.0.1' or 'fixture' not in dsn.path:
            raise RuntimeError('LOCAL_FIXTURE_DSN_REQUIRED')
        cls.psql = os.environ.get('NAUMI_TEST_PSQL', r'C:\Program Files\PostgreSQL\16\bin\psql.exe' if os.name == 'nt' else 'psql')
        cls.env = {k:v for k,v in os.environ.items() if k.lower() in {'path','systemroot','windir','temp','tmp'}}
        cls.env.update(PGHOST='127.0.0.1',PGPORT=str(dsn.port or 5432),PGUSER=dsn.username or 'postgres',PGDATABASE=dsn.path[1:],PGCONNECT_TIMEOUT='5')
        if dsn.password: cls.env['PGPASSWORD'] = dsn.password
        cls.db = 'preserved_unknown_fixture_' + uuid.uuid4().hex
        cls.execute('CREATE DATABASE ' + cls.db)
        cls.env['PGDATABASE'] = cls.db

    @classmethod
    def execute(cls, query, readonly=False):
        if readonly: query = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='5s';" + query + 'COMMIT;'
        p = subprocess.run([cls.psql,'-XqAt','-v','ON_ERROR_STOP=1'],input=query.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=cls.env,timeout=20)
        if p.returncode: raise RuntimeError('SYNTHETIC_SQL_FAILED')  # never echo rows or SQL
        return [json.loads(line,parse_float=Decimal) for line in p.stdout.splitlines() if line.startswith(b'{')]

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls,'db'):
            cls.env['PGDATABASE']='postgres'
            cls.execute('DROP DATABASE ' + cls.db + ' WITH (FORCE)')

    def setUp(self):
        if hasattr(self,'temp'): self.temp.cleanup()
        self.temp=tempfile.TemporaryDirectory(prefix='naumi-preserved-unknown-fixture-')
        self.root=pathlib.Path(self.temp.name)
        self.execute('''DROP SCHEMA public CASCADE; CREATE SCHEMA public;
        CREATE TABLE app_video_tasks(id text PRIMARY KEY,progress numeric,parameters jsonb,poll_lock_until timestamptz,next_poll_at timestamptz,provider_snapshot jsonb,idempotency_key text,source_id text,nullable text,updated_at timestamptz);
        CREATE TABLE app_billing_operations(id text PRIMARY KEY,ledger_id text,quote jsonb,state text);
        CREATE TABLE app_gen_reservations(job_id text PRIMARY KEY,cost integer);
        CREATE TABLE app_supplier_calls(id uuid PRIMARY KEY,operation_id text,parent_call_id uuid,task_id text,amount_micros numeric(30,0),parameters jsonb,state text);
        CREATE TABLE app_supplier_variable_costs(id uuid,operation_id text,amount_cny_micros numeric(30,0));
        CREATE TABLE app_billing_reconciliations(id text,operation_id text,charge numeric);
        CREATE TABLE app_billing_api_cost_reviews(id text,operation_id text,refund_credits integer);
        CREATE TABLE app_ledger(id text,delta integer,reason text);
        CREATE TABLE app_supplier_cost_jobs(key text PRIMARY KEY,payload jsonb,state text,lease_id uuid,lease_until timestamptz);
        CREATE TABLE app_supplier_cost_adjustments(id uuid,call_id uuid,kind text,before_receipt jsonb,after_receipt jsonb);
        CREATE TABLE app_supplier_call_outputs(call_id uuid,output_index int,state text);
        CREATE TABLE app_billing_intents(id text PRIMARY KEY,response jsonb,response_status integer);
        CREATE TABLE app_release_activities(id uuid,work_key text,admission_key text,detail text,state text);
        CREATE TABLE app_model_provider_leases(identity text,token uuid,expires_at timestamptz);
        CREATE TABLE app_model_capacity_accounts(alias text,identity text);
        CREATE TABLE app_model_execution_stages(id uuid,operation_id text,phase text,state text,estimated_cost_cny_micros numeric(30,0));
        CREATE TABLE app_model_config_state(singleton boolean,active_version bigint);
        CREATE TABLE app_model_config_versions(version bigint,digest text,config jsonb);
        CREATE TABLE app_billing_config_versions(version bigint,config jsonb);
        CREATE TABLE app_settings(k text,v text);
        INSERT INTO app_model_config_state VALUES(true,1);
        INSERT INTO app_model_config_versions VALUES(1,'synthetic-digest','{}');
        INSERT INTO app_billing_config_versions VALUES(1,'{}'),(2,'{"unpublished":true}');
        INSERT INTO app_settings VALUES('billing_config_version','1');
        ''')
        self.execute(f"""INSERT INTO app_video_tasks VALUES({m.literal(TASK)},0,'{{"n":12345678901234567890.12345678901234567890,"empty":"","nil":null}}',NULL,NULL,{m.literal(m.exact_json(PROVIDER))}::jsonb,'synthetic-idem','synthetic-node',NULL,'2026-10-01T00:00:00Z');
        INSERT INTO app_billing_operations VALUES({m.literal(TASK)},'synthetic-ledger','{{"n":123456789012345678901234567890}}','reserved');
        INSERT INTO app_gen_reservations VALUES({m.literal(TASK)},3);
        INSERT INTO app_supplier_calls VALUES('{CALL}',{m.literal(TASK)},NULL,NULL,123456789012345678901234567890,NULL,'submitting');
        INSERT INTO app_model_execution_stages VALUES('22222222-2222-4222-8222-222222222222',{m.literal(TASK)},'generation','submitted',17);
        """)
        self.baseline=self.make_baseline()
        self.cfg={'baselinePath':str(self.root/'original.private.json'),'baselineSha256':hashlib.sha256((self.root/'original.private.json').read_bytes()).hexdigest(),'supplementalPath':str(self.root/'CASE05_SUPPLEMENT.private.json'),'allowedAdditiveColumns':{}}
        self.saved=[]

    def tearDown(self): self.temp.cleanup()

    def make_baseline(self):
        tables={}
        for name in m.CORE:
            row=self.execute(f"SELECT json_build_object('columns',(SELECT jsonb_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid='{name}'::regclass AND attnum>0 AND NOT attisdropped),'rowsRaw',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY {('job_id' if name=='app_gen_reservations' else 'id')}),'[]')::text FROM {name} t));")[0]
            rows=json.loads(row['rowsRaw'],parse_float=Decimal)
            tables[name]={'columns':row['columns'],'rows':rows,'sha256':hashlib.sha256(row['rowsRaw'].encode()).hexdigest()}
        v={'taskId':TASK,'tables':tables,'model':{'version':'1','digest':'synthetic-digest','config_md5':'99914b932bd37a50b983c5e7c90ae93b'},'billing':{'version':'1','config_md5':'99914b932bd37a50b983c5e7c90ae93b'},'leases':{'pollLockPresent':False,'pollLockFuture':False,'nextPollPresent':False},'activity':[],'generationPosts':0,'readOnly':True}
        (self.root/'original.private.json').write_text(m.exact_json(v),encoding='utf8')
        return v

    def save(self,name,value):
        raw=value if isinstance(value,bytes) else (m.exact_json(value)+'\n').encode()
        with (self.root/name).open('xb') as output: output.write(raw)
        self.saved.append((name,raw))

    def guard(self,cfg=None): return m.Guard(cfg or self.cfg,lambda query:self.execute(query,readonly=True),self.save)

    def test_unchanged_exact_numbers_empty_null_and_current_pointer(self):
        g=self.guard();self.assertEqual(g.establish()['status'],'MATCH')
        for stage in ['candidate','switch','pre-retire-web','final','failure-before','failure-after']:
            self.assertEqual(g.check(stage)['status'],'MATCH')
        supplement=(self.root/'CASE05_SUPPLEMENT.private.json').read_text()
        self.assertIn('123456789012345678901234567890',m.exact_json(self.baseline))
        self.assertIsInstance(json.loads(supplement)['tables']['app_model_execution_stages']['rowsRaw'],str)
        for name,raw in self.saved:
            if not name.endswith('.private.json'): self.assertNotIn(b'synthetic-provider',raw);self.assertNotIn(b'submitting',raw)
        self.assertTrue(g.check('post-counter-is-declarative')['generationPostsDeclarationOnly'])

    def test_core_progress_null_empty_numeric_add_delete_are_all_holds(self):
        mutations=["UPDATE app_video_tasks SET progress=1", "UPDATE app_video_tasks SET progress=0.0", "UPDATE app_video_tasks SET nullable=''", "UPDATE app_video_tasks SET updated_at=updated_at+interval '1 microsecond'", "UPDATE app_supplier_calls SET amount_micros=amount_micros+1", "INSERT INTO app_ledger VALUES('synthetic-ledger',0,'empty set changed')", f"INSERT INTO app_billing_api_cost_reviews VALUES('new',{m.literal(TASK)},0)", "DELETE FROM app_gen_reservations", "UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{n}','12345678901234567890.12345678901234567891')"]
        for change in mutations:
            with self.subTest(change=change):
                self.setUp() if change!=mutations[0] else None
                g=self.guard();g.establish();self.execute(change)
                with self.assertRaises(m.Hold):g.check('mutated')
                self.assertTrue(g.held)

    def test_original_must_match_before_supplement_and_cannot_be_rebased(self):
        self.execute("UPDATE app_video_tasks SET progress=1")
        with self.assertRaises(m.Hold):self.guard().establish()
        self.assertFalse((self.root/'CASE05_SUPPLEMENT.private.json').exists())
        self.execute("UPDATE app_video_tasks SET progress=0")
        self.assertFalse(self.guard().established)

    def test_missing_table_column_type_and_unapproved_new_column(self):
        cases=['ALTER TABLE app_video_tasks DROP COLUMN nullable','DROP TABLE app_supplier_call_outputs','ALTER TABLE app_gen_reservations ALTER COLUMN cost TYPE bigint','ALTER TABLE app_video_tasks ADD COLUMN tenant_id uuid']
        for i,change in enumerate(cases):
            if i:self.setUp()
            g=self.guard();g.establish();self.execute(change)
            with self.assertRaises(m.Hold):g.check('schema-changed')

    def test_reviewed_additive_column_type_and_constant_checked_separately(self):
        cfg=copy.deepcopy(self.cfg);cfg['allowedAdditiveColumns']={'app_video_tasks':{'tenant_id':{'pgType':'uuid','jsonValue':None}}}
        g=self.guard(cfg);g.establish();self.execute('ALTER TABLE app_video_tasks ADD COLUMN tenant_id uuid')
        self.assertEqual(g.check('approved-null')['status'],'MATCH')
        self.execute("UPDATE app_video_tasks SET tenant_id='33333333-3333-4333-8333-333333333333'")
        with self.assertRaises(m.Hold):g.check('unsafe-new-value')

    def test_additive_false_zero_empty_are_not_null(self):
        self.execute('ALTER TABLE app_video_tasks ADD COLUMN safe_flag boolean DEFAULT false')
        cfg=copy.deepcopy(self.cfg);cfg['allowedAdditiveColumns']={'app_video_tasks':{'safe_flag':{'pgType':'boolean','jsonValue':False}}}
        g=self.guard(cfg);g.establish();self.execute('UPDATE app_video_tasks SET safe_flag=NULL')
        with self.assertRaises(m.Hold):g.check('false-is-not-null')

    def test_extra_closure_cost_intent_attempt_activity_and_leases(self):
        alias=m.sha((PROVIDER['id']+'\nhttps://synthetic.invalid').encode())
        changes=[f"INSERT INTO app_supplier_cost_jobs VALUES('task:{CALL}','{{}}','queued',NULL,NULL)",f"INSERT INTO app_supplier_cost_jobs VALUES('router:synthetic','{{\"context\":{{\"operationId\":\"{TASK}\"}}}}','queued',NULL,NULL)",f"INSERT INTO app_supplier_cost_adjustments VALUES(gen_random_uuid(),'{CALL}','refund','{{}}','{{}}')",f"INSERT INTO app_supplier_call_outputs VALUES('{CALL}',0,'delivered')", "INSERT INTO app_billing_intents VALUES('intent-synthetic-idem','{}',200)",f"INSERT INTO app_release_activities VALUES(gen_random_uuid(),'{TASK}:poll',NULL,'','active')", f"INSERT INTO app_model_provider_leases VALUES('{alias}',gen_random_uuid(),now()+interval '1 hour')",f"INSERT INTO app_release_activities VALUES(gen_random_uuid(),'{TASK}',NULL,'','finished')",f"INSERT INTO app_model_execution_stages VALUES(gen_random_uuid(),'{TASK}','generation','submitted',0)"]
        for i,change in enumerate(changes):
            if i:self.setUp()
            g=self.guard();g.establish();self.execute(change)
            with self.assertRaises(m.Hold):g.check('related-addition')

    def test_preexisting_extra_is_captured_once_not_claimed_original(self):
        self.execute(f"INSERT INTO app_supplier_cost_jobs VALUES('task:{CALL}','{{}}','needs-attention',NULL,NULL)")
        g=self.guard();g.establish();self.execute("UPDATE app_supplier_cost_jobs SET state='done'")
        with self.assertRaises(m.Hold):g.check('supplement-change')
        with self.assertRaises(m.Hold):self.guard().establish()

    def test_shared_identity_leases_and_original_poll_lock(self):
        alias=m.sha((PROVIDER['id']+'\nhttps://synthetic.invalid').encode())
        self.execute(f"INSERT INTO app_model_capacity_accounts VALUES('{alias}','synthetic-shared')")
        g=self.guard();g.establish();self.execute("INSERT INTO app_model_provider_leases VALUES('synthetic-shared',gen_random_uuid(),now()+interval '1 hour')")
        with self.assertRaises(m.Hold):g.check('shared-active-lease')

    def test_tamper_supplement_baseline_stage_and_hold_latch(self):
        g=self.guard();g.establish()
        with self.assertRaises(m.Hold):g.establish()
        with self.assertRaises(m.Hold):g.check('cannot-clear-hold')
        path=self.root/'CASE05_SUPPLEMENT.private.json';path.write_bytes(path.read_bytes()+b' ')
        with self.assertRaises(m.Hold):g.check('tampered')

    def test_sql_evidence_and_original_sha_fail_closed_without_raw_error(self):
        cfg=copy.deepcopy(self.cfg);cfg['baselineSha256']='f'*64
        with self.assertRaisesRegex(m.Hold,'BASELINE_CHANGED'):self.guard(cfg).establish()
        self.assertFalse((self.root/'CASE05_SUPPLEMENT.private.json').exists())
        g=m.Guard(self.cfg,lambda q:(_ for _ in ()).throw(RuntimeError('synthetic-private-error-not-for-output')),self.save)
        with self.assertRaises(m.Hold) as raised:g.establish()
        self.assertNotIn('synthetic-private-error',str(raised.exception));self.assertTrue(g.held)

    def test_dependency_holds_also_latch_and_never_emit_private_errors(self):
        g=m.Guard(self.cfg,lambda q:(_ for _ in ()).throw(m.Hold('synthetic-private-dependency')),self.save)
        with self.assertRaisesRegex(m.Hold,'READ_ONLY_SQL_UNAVAILABLE'):g.establish()
        self.assertTrue(g.held)
        self.assertTrue(any(b'"status":"HOLD"' in raw for _,raw in self.saved))
        self.setUp()
        def blocked_save(name,value):raise m.Hold('synthetic-private-evidence-denial')
        g=m.Guard(self.cfg,lambda q:self.execute(q,readonly=True),blocked_save)
        with self.assertRaisesRegex(m.Hold,'DEPENDENCY_HOLD'):g.establish()
        self.assertTrue(g.held);self.assertFalse(g.established)

    def test_numeric_one_to_one_point_zero_is_not_jsonb_equality_waiver(self):
        # A fresh synthetic baseline, never the original production file.
        self.execute('UPDATE app_video_tasks SET progress=1')
        self.make_baseline();cfg=copy.deepcopy(self.cfg)
        cfg['baselineSha256']=hashlib.sha256((self.root/'original.private.json').read_bytes()).hexdigest()
        g=self.guard(cfg);g.establish();self.execute('UPDATE app_video_tasks SET progress=1.0')
        with self.assertRaises(m.Hold):g.check('numeric-scale-change')

    def test_unrelated_activity_and_global_nonpointer_config_do_not_change_case(self):
        g=self.guard();g.establish();self.execute("INSERT INTO app_supplier_cost_jobs VALUES('unrelated','{}','queued',NULL,NULL); INSERT INTO app_release_activities VALUES(gen_random_uuid(),'unrelated',NULL,'','active'); UPDATE app_billing_config_versions SET config='{\"unpublished\":false}' WHERE version=2")
        self.assertEqual(g.check('unrelated')['status'],'MATCH')
        self.execute("UPDATE app_settings SET v='2' WHERE k='billing_config_version'")
        with self.assertRaises(m.Hold):g.check('pointer-changed')


class PureContract(unittest.TestCase):
    def test_decimal_and_sql_literal_are_exact(self):
        self.assertEqual(m.exact_json({'n':Decimal('12345678901234567890.12345678901234567890'),'z':0,'f':False}),'{"f":false,"n":12345678901234567890.12345678901234567890,"z":0}')
        with self.assertRaises(ValueError):m.exact_json(1.2)
        self.assertEqual(m.literal("a'b"),"'a''b'")
        with self.assertRaises(ValueError):m.ident('table;DROP')

if __name__=='__main__':unittest.main()
