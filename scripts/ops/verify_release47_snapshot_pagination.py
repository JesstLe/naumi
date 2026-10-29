"""Real isolated PG regression for release preservation. No env files or suppliers.

python scripts/ops/verify_release47_snapshot_pagination.py --phase MODIFIED --output output/snapshot-test
An optional --fixture-id must name an exact local container created with the
naumi.fixture=capacity-release-snapshot label. Every subprocess uses a case-
insensitive Windows environment allowlist; the runner never discovers a DB URL.
"""
import argparse
import copy
import hashlib
import importlib.util
import inspect
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import uuid

ENV_KEYS = {'SYSTEMROOT','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','COMSPEC',
            'PROGRAMDATA','LOCALAPPDATA','APPDATA'}
ENV = {k:v for k,v in os.environ.items() if k.upper() in ENV_KEYS}
LABEL = 'capacity-release-snapshot'


def load(path):
    spec=importlib.util.spec_from_file_location('snapshot_under_test',path)
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    return module


class Fixture:
    def __init__(self, args):
        self.args=args;self.out=Path(args.output).resolve();self.out.mkdir(parents=True,exist_ok=True)
        self.owned=not args.fixture_id;self.calls=0;self.logs=[];self.passed=[];self.failed=[]
        self.m=load(Path(args.module).resolve());self.supports_budget='budget' in inspect.signature(self.m.collect_task_snapshot).parameters
        if self.owned:
            name='naumi-snapshot-fixture-'+uuid.uuid4().hex[:10]
            self.cid=self.command(['docker','run','-d','--name',name,'--label','naumi.fixture='+LABEL,
                '--memory','768m','--cpus','2','-p','127.0.0.1::5432','-e','POSTGRES_USER=fixture',
                '-e','POSTGRES_DB=snapshot_fixture','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']).stdout.decode().strip()
        else:self.cid=args.fixture_id
        if len(self.cid)!=64 or any(c not in '0123456789abcdef' for c in self.cid):raise ValueError('EXACT_FIXTURE_ID_REQUIRED')
        row=json.loads(self.command(['docker','inspect',self.cid]).stdout)[0]
        assert row['Config']['Labels'].get('naumi.fixture')==LABEL,'FIXTURE_LABEL_REQUIRED'
        assert row['Name'].startswith('/naumi-snapshot-fixture-'),'FIXTURE_NAME_REQUIRED'
        assert all(p['HostIp']=='127.0.0.1' for ports in row['HostConfig']['PortBindings'].values() for p in ports),'LOOPBACK_ONLY'
        env=dict(v.split('=',1) for v in row['Config']['Env'] if '=' in v)
        assert env.get('POSTGRES_DB')=='snapshot_fixture' and env.get('POSTGRES_USER')=='fixture'
        self.identity=self.m.public_identity(row)
        self.pg=['docker','exec','-i',self.cid,'psql','-XqAt','-U','fixture','-d','snapshot_fixture','-v','ON_ERROR_STOP=1']
        for _ in range(60):
            if self.command(['docker','exec',self.cid,'pg_isready','-U','fixture','-d','snapshot_fixture']).returncode==0:break
            time.sleep(.1)
        self.schema='snapshot_'+uuid.uuid4().hex[:12]

    def command(self,args,*,stdin=None,timeout=120):
        result=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout,env=ENV)
        self.calls+=1;stem=f'{self.calls:04d}'
        if stdin is not None:(self.out/(stem+'.sql')).write_bytes(stdin)
        (self.out/(stem+'.stdout')).write_bytes(result.stdout);(self.out/(stem+'.stderr')).write_bytes(result.stderr)
        self.logs.append({'argv':args,'input':stem+'.sql' if stdin is not None else None,'stdout':stem+'.stdout',
                          'stderr':stem+'.stderr','exit':result.returncode})
        return result

    def sql(self,sql):
        result=self.command(self.pg,stdin=sql.encode());assert result.returncode==0,result.stderr.decode();return result.stdout

    def seed(self):
        s=self.schema
        self.sql('CREATE SCHEMA '+s+';')
        # Native identity types/order: uuid + int composite coverage is separate.
        fields=sorted(set(self.m.GRAPH_FIELDS+self.m.PROOF_FIELDS+self.m.FROZEN_FIELDS+['parameters','plans','batch_id','instance_id']))
        json_fields={'snapshot','payload','parameters','plans','billing_quote','provider_snapshot','capability_snapshot','quote','plan','request','request_body','inputs','body','video_references','procurement','fx'}
        for table,key in self.m.KEYS.items():
            pk=['batch_id','key'] if table=='app_imagegen_batch_items' else (key[10:].split(',') if key.startswith('composite:') else [key])
            defs=','.join('"'+f+'" '+('jsonb' if f in json_fields else 'text') for f in fields)
            self.sql(f'CREATE TABLE {s}.{table}({defs},PRIMARY KEY({",".join(pk)}));')
        self.sql(f'''INSERT INTO {s}.app_image_jobs(id,snapshot,payload,created_at) VALUES
          ('imagegen-parent','{{"status":"pending","children":{{"s":{{"jobId":"gen-child","state":"submitted"}}}}}}','{{"prompt":"frozen"}}','2000-01-01'),
          ('gen-child','{{"status":"done","paidOperations":{{"paid-root":{{"model":"wire","gatewayIdentity":"root-bind","children":{{"paid-child":{{"model":"wire","gatewayIdentity":"child-bind","state":"unknown"}}}}}}}}}}','{{"prompt":"frozen-child"}}','2000-01-01');
          INSERT INTO {s}.app_billing_operations(id,state,quote) VALUES ('paid-root','settled','{{"price":3}}'),('paid-child','settled','{{"price":2}}');
          INSERT INTO {s}.app_ledger(id,delta) VALUES ('led-image-paid-root','-3'),('led-image-paid-child','-2'),('unrelated','1');
          INSERT INTO {s}.app_supplier_calls(id,state,operation_id,account_id) VALUES ('call-child','unknown','paid-child','account-original');
          INSERT INTO {s}.app_supplier_accounts(id,base_url,credential_ref) VALUES ('account-original','https://fixture.invalid','synthetic-ref');
          INSERT INTO {s}.app_supplier_call_outputs(call_id,output_index,state) VALUES ('call-child','0','unknown');
          INSERT INTO {s}.app_video_tasks(id,status,created_at,parameters) SELECT 'v-'||lpad(i::text,5,'0'),'processing','2000-01-01','{{"prompt":"same"}}' FROM generate_series(1,301)i;
          INSERT INTO {s}.app_release_activities(id,state,instance_id) VALUES ('old-unseen','unknown','naumi47-web-older'),('current','running','naumi47-web-a');''')
        self.sql(f'''INSERT INTO {s}.app_image_jobs(id,snapshot,payload,created_at)
          SELECT 'historic-'||lpad(i::text,5,'0'),jsonb_build_object('status','done','images',repeat(md5(i::text),32768),
            'paidOperations',jsonb_build_object('historic-paid-'||i,jsonb_build_object('model','wire','result',repeat('r',262144)))),
            '{{}}'::jsonb,'2000-01-01' FROM generate_series(1,256)i; ANALYZE {s}.app_image_jobs;''')

    def collect(self,previous=None,**opts):
        options={'schema':self.schema,'projection':'proof','row_limit':5000,'statement_timeout_ms':15000,'previous':previous}
        options.update(opts)
        if not self.supports_budget:options.pop('budget',None)
        return self.m.collect_task_snapshot(self.command,self.identity,lambda name,b:(self.out/name).write_bytes(b),**options)

    def check(self,name,fn):
        try:fn();self.passed.append(name);print('PASS '+name,flush=True)
        except Exception as ex:self.failed.append({'name':name,'error':str(ex)});print('FAIL '+name+' '+str(ex),flush=True)

    def require(self,value,message):
        assert value,message

    def ids(self,snap,table):return {self.m.row_key(row,self.m.KEYS[table]) for row in snap.private['tables'][table]['rows']}

    def run(self):
        m=self.m;s=self.schema;self.seed()
        before=self.collect(budget={'page_rows':32})
        self.before=before
        self.test_explain()
        self.check('paged_large_snapshot_and_duplicate_timestamps',lambda:self.require(
          len(self.ids(before,'app_video_tasks'))==301 and before.public['preservationComplete'] and
          before.private.get('collection',{}).get('coverage',{}).get('scanRows',0)>550 and
          max(p['count'] for p in before.private['collection']['pageEvidence'])<=32,'fixed native PK pages and complete coverage required'))
        self.check('terminal_child_and_nested_operation_closure',lambda:self.require(
          {'imagegen-parent','gen-child'}<=self.ids(before,'app_image_jobs') and {'paid-root','paid-child'}<=self.ids(before,'app_billing_operations') and
          {'led-image-paid-root','led-image-paid-child'}<=self.ids(before,'app_ledger'),'original terminal child/billing/ledger absent'))
        self.check('unchanged_proof_verified_not_drain',lambda:self.require(m.compare_task_snapshots(before,before)['preservationVerified'] and not before.public['drainProven'],'unchanged complete proof'))
        # A terminal parent must be recovered from its active child's reverse edge.
        self.sql(f'''UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{status}}','"done"') WHERE id='imagegen-parent';
          UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{status}}','"pending"') WHERE id='gen-child';''')
        reverse=self.collect()
        self.check('reverse_parent_child_closure',lambda:self.require('imagegen-parent' in self.ids(reverse,'app_image_jobs'),'reverse parent absent'))
        self.sql(f'''UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{status}}','"pending"') WHERE id='imagegen-parent';
          UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{status}}','"done"') WHERE id='gen-child';''')
        # Same IDs/counts do not prove frozen context or nested acceptance binding.
        self.sql(f'''UPDATE {s}.app_image_jobs SET payload='{{"prompt":"changed"}}',snapshot=jsonb_set(snapshot,'{{paidOperations,paid-root,children,paid-child,gatewayIdentity}}','"mutated"') WHERE id='gen-child';''')
        changed=self.collect(previous=before)
        reasons={v['reason'] for v in m.compare_task_snapshots(before,changed)['violations']}
        self.check('nested_binding_and_frozen_mutation',lambda:self.require({'ORIGINAL_SUPPLIER_BINDING_CHANGED','FROZEN_CONTEXT_CHANGED'}<=reasons,'ID set hid mutation: '+str(reasons)))
        self.sql(f'''UPDATE {s}.app_image_jobs SET payload='{{"prompt":"frozen-child"}}',snapshot=jsonb_set(snapshot,'{{paidOperations,paid-root,children,paid-child,gatewayIdentity}}','"child-bind"') WHERE id='gen-child';
          UPDATE {s}.app_video_tasks SET status='completed' WHERE id='v-00001';
          INSERT INTO {s}.app_video_tasks(id,status,created_at,parameters) VALUES ('new-earlier-key','processing','1900-01-01','{{"prompt":"new"}}');''')
        after=self.collect(previous=before)
        self.check('previous_ids_direct_read_after_completion_and_new_rows',lambda:self.require(
          'v-00001' in self.ids(after,'app_video_tasks') and 'new-earlier-key' in self.ids(after,'app_video_tasks') and m.compare_task_snapshots(before,after)['preservationVerified'],'terminal original/new same-key chronology'))
        self.sql(f"DELETE FROM {s}.app_video_tasks WHERE id='v-00002';")
        deleted=self.collect(previous=after);result=m.compare_task_snapshots(after,deleted)
        self.check('deletion_is_not_preserved',lambda:self.require(not result['preservationVerified'] and not result['noMissingJobs'],'deleted old row was closed'))
        self.sql(f"DELETE FROM {s}.app_release_activities WHERE id='old-unseen';")
        absent=self.collect(previous=deleted);result=m.compare_task_snapshots(deleted,absent)
        self.check('unseen_old_unknown_not_closed',lambda:self.require(not result['preservationVerified'] and any(v.get('table')=='app_release_activities' and v['reason']=='PRESERVED_ROW_MISSING' for v in result['violations']),'unobserved UNKNOWN closed'))
        # Longer than legacy four passes, edges run opposite table scan order.
        self.sql(f"INSERT INTO {s}.app_supplier_calls(id,state,parent_call_id,operation_id) SELECT 'chain-'||lpad(i::text,2,'0'),CASE WHEN i=9 THEN 'unknown' ELSE 'completed' END,CASE WHEN i>0 THEN 'chain-'||lpad((i-1)::text,2,'0') ELSE null END,'op-chain-'||i FROM generate_series(0,9)i;")
        chain=self.collect()
        self.check('fixed_point_beyond_four_passes',lambda:self.require(all('chain-'+str(i).zfill(2) in self.ids(chain,'app_supplier_calls') for i in range(10)),'four-pass closure truncated'))
        self.test_edge_contracts()
        self.test_budgets(chain)
        self.test_native_keys()
        self.test_missing_child()
        self.test_concurrency()
        self.test_scoped_caller()
        self.test_exact_row_limit()
        self.test_full_projection_small_budget()

    def test_explain(self):
        m=self.m;reg=self.schema+'.app_image_jobs'
        if self.supports_budget:
            b=m.budgets({'page_rows':32})
            state={'ok':True,'reason':'','pages':0,'scanRows':0,'graphBytes':0,'proofBytes':0,'selectedRows':0}
            prefix="BEGIN READ ONLY; SET LOCAL search_path=pg_catalog;\nSELECT "+m.save_setting('state',m.literal(json.dumps(state))+'::jsonb')+" AS state,"+m.save_setting('graph_0',"'[]'::jsonb")+" AS graph \\gset init_\n"
            prefix+=m.catalog_sql(reg,'id')+' \\gset table_0_\n'+m.graph_projection_sql(reg)+' \\gset table_0_\n'
            query=prefix+'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+m.page_graph_sql(0,'app_image_jobs',reg,'id',b,first=True)+'\nROLLBACK;'
        else:
            catalog=json.loads(self.sql('SELECT row_to_json(x) FROM ('+m.graph_projection_sql(reg)+')x;'))
            query="EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) WITH source AS MATERIALIZED (SELECT to_jsonb(t) AS j FROM (SELECT "+catalog['projection']+" FROM "+reg+")t) SELECT j->>'id' FROM source WHERE COALESCE(j#>>'{snapshot,status}','') NOT IN ('done','error');"
        raw=self.sql(query);plan=json.loads(raw)[0]
        (self.out/'EXPLAIN.json').write_bytes(raw);(self.out/'EXPLAIN.sql').write_text(query,encoding='utf8')
        def walk(node):
            yield node
            for child in node.get('Plans',[]):yield from walk(child)
        materialized={n['Subplan Name']:n.get('Actual Rows') for n in walk(plan['Plan']) if n.get('Subplan Name','').startswith('CTE ')}
        self.check('explain_page_before_snapshot_projection',lambda:self.require(materialized.get('CTE page_keys')==32 and materialized.get('CTE page')==32,'materialized rows '+str(materialized)))

    def test_edge_contracts(self):
        s=self.schema;m=self.m
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{status}}','\"pending\"') WHERE id='gen-child';")
        observed=self.collect()
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{paidOperations,paid-root,children,paid-child,gatewayIdentity}}','\"mutated-nested-only\"') WHERE id='gen-child';")
        changed=self.collect(previous=observed)
        self.check('observed_child_nested_binding_only',lambda:self.require(not m.compare_task_snapshots(observed,changed)['noOriginalSupplierMutation'],'observed nested binding lost'))
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{paidOperations,paid-root,children,paid-child,gatewayIdentity}}','\"child-bind\"') WHERE id='gen-child';")
        # Unsupported deeper paid nesting is unknown, not silently discarded.
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{paidOperations,paid-root,children,paid-child,children}}','{{}}') WHERE id='gen-child';")
        self.check('unsupported_nested_paid_evidence_unknown',lambda:self.require(not self.collect().public['preservationComplete'],'deeper schema silently ignored'))
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=snapshot #- '{{paidOperations,paid-root,children,paid-child,children}}' WHERE id='gen-child';")
        # No index or migration is created to paper over an unverifiable cursor.
        self.sql(f'ALTER TABLE {s}.app_video_tasks DROP CONSTRAINT app_video_tasks_pkey;')
        self.check('missing_primary_key_unknown',lambda:self.require(not self.collect().public['preservationComplete'],'unverified heap cursor accepted'))
        self.sql(f'ALTER TABLE {s}.app_video_tasks ADD PRIMARY KEY(id);')
        # Original global ledger digest, not just the selected identity set.
        before=self.collect();self.sql(f"UPDATE {s}.app_ledger SET delta='9' WHERE id='unrelated';")
        after=self.collect(previous=before)
        self.check('global_ledger_summary_regression',lambda:self.require(any(v['reason']=='PROTECTED_GLOBAL_COUNT_OR_HASH_REGRESSION' for v in m.compare_task_snapshots(before,after)['violations']),'unrelated immutable ledger changed'))
        self.sql(f"UPDATE {s}.app_ledger SET delta='1' WHERE id='unrelated';")
        # Old proof rows do not retrospectively assert new parent/child coverage.
        legacy=copy.deepcopy(before.private)
        for row in legacy['tables']['app_image_jobs']['rows']:row.get('snapshot',{}).pop('_proofVersion',None)
        self.check('legacy_image_proof_not_recertified',lambda:self.require(not m.compare_task_snapshots(legacy,before)['preservationVerified'],'legacy proof recertified'))

    def test_budgets(self,prior):
        for key,value in [('pages',1),('scan_rows',10),('graph_bytes',200),('page_bytes',40),('proof_bytes',200),('selected_rows',2),('roots',2)]:
            def test(k=key,v=value):
                snap=self.collect(budget={k:v});r=self.m.compare_task_snapshots(snap,snap)
                self.require(not snap.public['preservationComplete'] and not r['preservationVerified'] and snap.private.get('collection',{}).get('status')=='incomplete','budget ignored '+k)
            self.check('global_budget_'+key,test)
        def row_limit():
            snap=self.collect(row_limit=2)
            self.require(not self.m.compare_task_snapshots(snap,snap)['preservationVerified'],'row limit')
        self.check('selected_per_table_limit',row_limit)
        def timeout():
            # Force a local read delay in the actual generated SQL, not a fake PG
            # response. This transaction belongs solely to the fixture process.
            saved=[]
            def slow(args,stdin=None,timeout=120):
                if stdin and b'BEGIN ISOLATION' in stdin:
                    stdin=stdin.replace(b"SELECT jsonb_build_object('kind','begin'",b"SELECT pg_sleep(1.2); SELECT jsonb_build_object('kind','begin'",1)
                return self.command(args,stdin=stdin,timeout=timeout)
            try:
                opts={'schema':self.schema,'projection':'proof','statement_timeout_ms':1000}
                if self.supports_budget:opts['budget']={'seconds':1}
                self.m.collect_task_snapshot(slow,self.identity,lambda n,b:saved.append(json.loads(b)),**opts)
            except ValueError:
                self.require(saved and saved[0].get('preservationVerified') is False and saved[0]['status']=='incomplete','timeout lost failure evidence')
                return
            raise AssertionError('timeout did not fail closed')
        self.check('timeout_failure_retained',timeout)
        def unknown():
            partial=copy.deepcopy(prior.private);partial['tables']['app_image_jobs']['status']='unknown-unobserved';partial['tables']['app_image_jobs']['rows']=[]
            self.require(not self.m.compare_task_snapshots(prior,partial)['preservationVerified'],'partial became preservation')
        self.check('partial_observation_never_closes',unknown)

    def test_native_keys(self):
        s=self.schema
        self.sql(f'DROP TABLE {s}.app_supplier_call_outputs; CREATE TABLE {s}.app_supplier_call_outputs(call_id uuid,output_index int,state text,PRIMARY KEY(call_id,output_index));')
        self.sql(f"INSERT INTO {s}.app_supplier_call_outputs SELECT '11111111-1111-1111-1111-111111111111',i,'unknown' FROM generate_series(0,10)i;")
        previous={'kind':'task-preservation-private-v1','tables':{'app_supplier_call_outputs':{'rows':[{'call_id':'11111111-1111-1111-1111-111111111111','output_index':i} for i in range(11)]}}}
        def check():
            snap=self.collect(previous=previous,budget={'page_rows':3})
            self.require(len(snap.private['tables']['app_supplier_call_outputs']['rows'])==11 and snap.public['preservationComplete'],'native UUID/int tuple ordering skipped keys')
        self.check('native_uuid_integer_composite_pagination',check)
        # Batch identity differs from actual PK: pagination still uses batch/key.
        self.sql(f"INSERT INTO {s}.app_imagegen_batch_items(batch_id,key,child_operation_id,state) SELECT 'batch',i::text,'child-op-'||i,'queued' FROM generate_series(0,10)i;")
        self.check('business_identity_differs_from_primary_key',lambda:self.require(len(self.collect(budget={'page_rows':3}).private['tables']['app_imagegen_batch_items']['rows'])==11,'batch PK vs identity'))
        original=self.collect()
        self.sql(f"UPDATE {s}.app_imagegen_batch_items SET batch_id='different-parent' WHERE child_operation_id='child-op-0';")
        moved=self.collect(previous=original)
        self.check('original_batch_parent_binding_preserved',lambda:self.require(not self.m.compare_task_snapshots(original,moved)['noOriginalSupplierMutation'],'same child operation moved between parents'))

    def test_missing_child(self):
        s=self.schema
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{children,s,jobId}}','\"missing-child\"') WHERE id='imagegen-parent';")
        self.check('explicit_missing_child_incomplete',lambda:self.require(not self.collect().public['preservationComplete'],'referenced absent child passed'))
        self.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{children,s,jobId}}','\"gen-child\"') WHERE id='imagegen-parent';")

    def test_concurrency(self):
        # Synchronize on pg_stat_activity for OUR collector's application_name.
        # Updates happen after its first RR snapshot, while later pages wait.
        marker='snapshot_concurrency_'+uuid.uuid4().hex[:8]
        seen=[];changed=threading.Event();stop=threading.Event();errors=[]
        def writer():
            try:
                for _ in range(80):
                    if stop.is_set():return
                    raw=self.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name="+self.m.literal(marker)+" AND wait_event='PgSleep';")
                    if int(raw)==1:
                        self.sql(f"DELETE FROM {self.schema}.app_video_tasks WHERE id='v-00301'; INSERT INTO {self.schema}.app_video_tasks(id,status) VALUES('concurrent-new','processing');")
                        changed.set();return
                    time.sleep(.03)
                errors.append('writer did not observe fixture sleep')
            except Exception as e:errors.append(str(e))
        def delayed(args,stdin=None,timeout=120):
            if stdin and b'BEGIN ISOLATION' in stdin:
                stdin=stdin.replace(b'BEGIN ISOLATION',('SET application_name='+self.m.literal(marker)+'; BEGIN ISOLATION').encode(),1)
                # First result fixes the RR snapshot; delay before catalog/pages.
                end=stdin.index(b'\n',stdin.index(b"'kind','begin'"))
                stdin=stdin[:end]+b'\nSELECT pg_sleep(2);'+stdin[end:]
            result=self.command(args,stdin=stdin,timeout=timeout)
            # The injected sleep has an empty output line only.
            return result
        thread=threading.Thread(target=writer);thread.start()
        try:
            opts={'schema':self.schema,'projection':'proof','row_limit':5000,'statement_timeout_ms':15000}
            if self.supports_budget:opts['budget']={'page_rows':16}
            snap=self.m.collect_task_snapshot(delayed,self.identity,**opts)
            self.check('concurrent_insert_delete_same_mvcc_snapshot',lambda:self.require(changed.is_set() and not errors and 'v-00301' in self.ids(snap,'app_video_tasks') and 'concurrent-new' not in self.ids(snap,'app_video_tasks'),'mixed pages '+str(errors)))
            next_=self.collect(previous=snap)
            result=self.m.compare_task_snapshots(snap,next_)
            self.check('next_snapshot_detects_concurrent_delete_and_addition',lambda:self.require(not result['preservationVerified'] and not result['noMissingJobs'] and 'concurrent-new' in self.ids(next_,'app_video_tasks'),'changed DB hidden'))
        finally:stop.set();thread.join(5)

    def test_full_projection_small_budget(self):
        s=self.schema
        self.sql(';'.join('TRUNCATE '+s+'.'+name for name in self.m.KEYS)+';')
        self.sql(f"TRUNCATE {s}.app_image_jobs; INSERT INTO {s}.app_image_jobs(id,snapshot,payload) VALUES('full-small','{{\"status\":\"pending\"}}','{{\"prompt\":\"frozen\"}}');")
        snap=self.collect(projection='full')
        self.check('legacy_full_projection_small_rows',lambda:self.require(snap.public['preservationComplete'] and snap.private['tables']['app_image_jobs']['rows'][0]['payload']=={'prompt':'frozen'},'full small row changed'))
        self.sql(f"UPDATE {s}.app_image_jobs SET payload=jsonb_build_object('prompt',repeat('x',600000));")
        large=self.collect(projection='full')
        self.check('legacy_full_projection_byte_ceiling_retained',lambda:self.require(not large.public['preservationComplete'],'full 512KiB ceiling widened'))

    def test_exact_row_limit(self):
        s=self.schema
        self.sql(f'TRUNCATE {s}.app_image_jobs;')
        self.sql(f"INSERT INTO {s}.app_image_jobs(id,snapshot) SELECT 'limit-'||lpad(i::text,5,'0'),'{{\"status\":\"pending\"}}' FROM generate_series(1,5000)i;")
        exact=self.collect()
        self.check('exact_5000_rows_all_proved',lambda:self.require(exact.public['preservationComplete'] and len(self.ids(exact,'app_image_jobs'))==5000,'exact 5000 lost coverage'))
        self.sql(f"INSERT INTO {s}.app_image_jobs(id,snapshot) VALUES('limit-05001','{{\"status\":\"pending\"}}');")
        over=self.collect()
        self.check('row_5001_incomplete_not_truncated_pass',lambda:self.require(not over.public['preservationComplete'] and not self.m.compare_task_snapshots(over,over)['preservationVerified'],'5001 accepted'))
        self.sql(f"TRUNCATE {s}.app_image_jobs; INSERT INTO {s}.app_image_jobs(id,snapshot) VALUES('oversized',jsonb_build_object('status','pending','paidOperations',jsonb_build_object('op',jsonb_build_object('gatewayIdentity',repeat('x',9*1024*1024)))));")
        oversized=self.collect()
        self.check('oversized_selected_proof_incomplete',lambda:self.require(not oversized.public['preservationComplete'] and not self.m.compare_task_snapshots(oversized,oversized)['preservationVerified'],'oversize proof accepted'))

    def test_scoped_caller(self):
        import release47_site_single as caller
        original=caller.tasks
        try:
            caller.tasks=self.m
            collector=caller.current_activity_collector(['naumi47-web-a','naumi47-web-b'])
        finally:caller.tasks=original
        def check():
            opts={'schema':self.schema,'projection':'proof','row_limit':5000}
            if self.supports_budget:opts['budget']={'page_rows':32}
            snap=collector.collect_task_snapshot(self.command,self.identity,**opts)
            self.require(snap.public['preservationComplete'] and self.ids(snap,'app_release_activities')=={'current'} and {'imagegen-parent','gen-child'}<=self.ids(snap,'app_image_jobs'),'caller scope leaked into business coverage')
        self.check('current_pair_scope_only_release_activities',check)

    def close(self):
        if hasattr(self,'schema'):
            self.sql('DROP SCHEMA '+self.schema+' CASCADE;')
        if self.owned:self.command(['docker','stop',self.cid]);self.command(['docker','rm',self.cid])
        report={'phase':self.args.phase,'passed':self.passed,'failed':self.failed,'fixture':self.identity,
                'envKeys':sorted(ENV),'commands':self.logs}
        (self.out/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
        print(f"{self.args.phase} passed={len(self.passed)} failed={len(self.failed)} realPostgres=true productionActions=0",flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--phase',required=True);p.add_argument('--output',required=True)
    p.add_argument('--module',default=str(Path(__file__).with_name('release47_task_snapshot.py')));p.add_argument('--fixture-id')
    args=p.parse_args();f=Fixture(args)
    try:f.run()
    except Exception as e:f.failed.append({'name':'runner','error':str(e)});print('RUNNER_ERROR '+str(e),flush=True)
    finally:f.close()
    return 1 if f.failed else 0


if __name__=='__main__':sys.exit(main())
