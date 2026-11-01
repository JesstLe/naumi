import copy
import datetime as dt
import json
import os
import subprocess
import sys
import time
import unittest
import uuid

import release47_row_fingerprints as m


def output(rows=None, *, missing=(), budget=None):
    b=m.budgets(budget); rows=rows or {}; now='2026-11-01T15:00:00+00:00'
    identity={'database':'fixture','databaseOid':'123','systemIdentifier':'456','serverVersion':'160015',
              'schema':'public','snapshot':'1:2:','readOnly':'on','isolation':'repeatable read','observedAt':now}
    records=[{'kind':'begin','version':m.VERSION,**identity,'budget':b}];total=0;total_bytes=0
    for name,key in m.TABLES.items():
        fields=m._keys(key);values=rows.get(name,[])
        records.append({'kind':'table','table':name,'status':'unknown-table-missing' if name in missing else 'observed',
                        'primaryKey':fields,'businessKey':fields,'schemaSha256':'a'*64})
        records.append({'kind':'table-count','table':name,'count':len(values),'exact':name not in missing})
        page_count=0;table_bytes=0
        for start in range(0,len(values),m.PAGE_ROWS):
            page_count+=1;parts=[];page_rows=[]
            for index,hash_value in enumerate(values[start:start+m.PAGE_ROWS],start):
                parts=[str(index)]*len(fields)
                page_rows.append({'kind':'row','table':name,'key':parts,'businessKey':parts,'sha256':hash_value})
            records.extend(page_rows);size=sum(len(json.dumps(r).encode())+1 for r in page_rows);table_bytes+=size
            records.append({'kind':'page','table':name,'page':page_count,'count':len(page_rows),'rowBytes':size,'ok':True,'lastKey':parts})
        count=len(values);total+=count;total_bytes+=table_bytes
        records.append({'kind':'table-end','table':name,'count':count,'expectedCount':count,'pages':page_count,'rowBytes':table_bytes,'ok':name not in missing})
    wire_bytes=sum(len(json.dumps(r).encode())+1 for r in records if r['kind'] in ['row','page'])
    records.append({'kind':'end',**identity,'budget':b,'ok':True,'elapsedMs':1,'rows':total,'rowBytes':total_bytes,'wireBytes':wire_bytes})
    return records


def item(records,kind,index=0):
    return [r for r in records if r['kind']==kind][index]


def encode(records):
    return ('\n'.join(json.dumps(r) for r in records)+'\n').encode()


def parse(records, **kwargs):
    return m.parse_output(encode(records),**kwargs)


class FingerprintTests(unittest.TestCase):
    def test_all_business_inventory_including_ledger_is_covered(self):
        self.assertEqual(set(m.TABLES),set(m.tasks.KEYS)-m.EXCLUDED_OBSERVATIONS)
        self.assertIn('app_ledger',m.TABLES)
        self.assertTrue(m.compare(parse(output()),parse(output()))['preservationVerified'])

    def test_full_row_change_fails_even_legitimate_pending_to_done(self):
        before=parse(output({'app_image_jobs':['a'*64]}));after=parse(output({'app_image_jobs':['b'*64]}))
        result=m.compare(before,after)
        self.assertFalse(result['preservationVerified']);self.assertEqual(len(result['changed']),1)
        self.assertFalse(result['paidOutcomesInferred'])

    def test_original_row_removal_fails(self):
        result=m.compare(parse(output({'app_ledger':['a'*64]})),parse(output()))
        self.assertFalse(result['preservationVerified']);self.assertEqual(len(result['missing']),1)

    def test_new_rows_are_reported_not_hidden(self):
        result=m.compare(parse(output({'app_image_jobs':['a'*64]})),parse(output({'app_image_jobs':['a'*64,'b'*64]})))
        self.assertTrue(result['preservationVerified']);self.assertEqual(len(result['added']),1)

    def test_missing_core_table_is_unknown(self):
        snap=parse(output(missing=['app_ledger']))
        self.assertEqual(snap['collection']['status'],'incomplete')
        self.assertFalse(m.compare(snap,snap)['preservationVerified'])

    def test_only_explicit_source_audited_additive_absence(self):
        name='app_reference_operations';raw=output(missing=[name])
        before=parse(raw,allow_absent_tables=[name]);after=parse(output({name:['a'*64]}))
        self.assertEqual(before['collection']['status'],'complete')
        self.assertTrue(m.compare(before,after)['preservationVerified'])
        with self.assertRaisesRegex(ValueError,'UNREVIEWED_ABSENT_TABLE'):
            parse(output(missing=['app_ledger']),allow_absent_tables=['app_ledger'])

    def test_schema_and_primary_key_changes_fail(self):
        a=output();b=copy.deepcopy(a)
        b[1]['schemaSha256']='b'*64
        result=m.compare(parse(a),parse(b))
        self.assertFalse(result['preservationVerified']);self.assertEqual(result['schemaChanged'],['app_image_jobs'])

    def test_missing_primary_key_column_is_incomplete(self):
        data=output();data[1]['status']='unknown-key-or-relation';data[1]['primaryKey']=[];item(data,'table-end')['ok']=False
        self.assertEqual(parse(data)['collection']['status'],'incomplete')

    def test_duplicate_pk_rejected(self):
        data=output({'app_image_jobs':['a'*64,'b'*64]});item(data,'row',1)['key']=item(data,'row')['key']
        with self.assertRaisesRegex(ValueError,'DUPLICATE_KEY'):parse(data)

    def test_null_key_business_key_or_hash_rejected(self):
        for field,value in [('key',[None]),('businessKey',[None]),('sha256',None),('sha256','x'*64)]:
            data=output({'app_image_jobs':['a'*64]});item(data,'row')[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'ROW_INVALID'):parse(data)

    def test_wrong_row_table_or_count_rejected(self):
        data=output({'app_image_jobs':['a'*64]});item(data,'row')['table']='app_ledger'
        with self.assertRaisesRegex(ValueError,'ROW_INVALID'):parse(data)
        data=output({'app_image_jobs':['a'*64]});item(data,'table-end')['count']=2
        with self.assertRaisesRegex(ValueError,'TABLE_END_INVALID'):parse(data)

    def test_transaction_or_database_identity_drift(self):
        for field,value in [('snapshot','2:3:'),('readOnly','off'),('isolation','read committed'),('systemIdentifier','999')]:
            data=output();data[-1][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'TRANSACTION_CHANGED'):parse(data)
        with self.assertRaisesRegex(ValueError,'DATABASE_UNVERIFIED'):parse(output(),expected_database='other')

    def test_collection_database_change_blocks_compare(self):
        data=output();data[0]['systemIdentifier']=data[-1]['systemIdentifier']='999'
        self.assertIn('DATABASE_IDENTITY_CHANGED',m.compare(parse(output()),parse(data))['problems'])

    def test_truncated_extra_and_reordered_table_outputs(self):
        for data in [output()[:-1],output()[1:],output()+[{'kind':'end'}],output()[:1]+output()[3:]]:
            with self.assertRaises(ValueError):parse(data)

    def test_elapsed_or_budget_mutation_rejected(self):
        for delta in [{'elapsedMs':60001},{'budget':{}},{'rows':1},{'rowBytes':1}]:
            data=output();data[-1].update(delta)
            with self.assertRaises(ValueError):parse(data)
        with self.assertRaisesRegex(ValueError,'INVALID_FINGERPRINT_BUDGET'):m.build_sql(budget={'rows':10000000})

    def test_suppliers_unknown_is_not_reclassified(self):
        data=parse(output({'app_supplier_calls':['a'*64]}))
        self.assertTrue(m.compare(data,copy.deepcopy(data))['preservationVerified'])
        self.assertFalse(m.compare(data,data)['paidOutcomesInferred'])

    def test_changed_serialized_proof_cannot_be_promoted_to_complete(self):
        value=parse(output(missing=['app_ledger']));value['collection']['status']='complete'
        self.assertFalse(m.compare(value,value)['preservationVerified'])
        value=parse(output({'app_image_jobs':['a'*64]}));value['tables']['app_image_jobs']['rows']={}
        self.assertFalse(m.compare(value,value)['preservationVerified'])

    def test_collect_repins_database_and_uses_distinct_evidence_names(self):
        identity={'id':'1'*64,'name':'db','image':'sha256:'+'2'*64,'running':True,'startedAt':'2026-11-01T00:00:00Z','restartPolicy':'no'}
        row={'Id':identity['id'],'Name':'/db','Image':identity['image'],'State':{'Running':True,'StartedAt':identity['startedAt']},'HostConfig':{'RestartPolicy':{'Name':'no'}},'Config':{'Env':['POSTGRES_USER=postgres','POSTGRES_DB=fixture']}}
        def command(args,**kwargs):
            if args[:2]==['docker','inspect']:return json.dumps([row]).encode()
            self.assertIn('READ ONLY',kwargs['stdin'].decode());return encode(output())
        saved={}
        def save(name,data):
            self.assertNotIn(name,saved);saved[name]=data
        first=m.collect(command,identity,save);second=m.collect(command,identity,save)
        self.assertEqual(len(saved),4);self.assertTrue(m.compare(first,second)['preservationVerified'])
        calls=0
        def drift(args,**kwargs):
            nonlocal calls
            if args[:2]==['docker','inspect']:
                calls+=1;changed=copy.deepcopy(row)
                if calls==2:changed['State']['StartedAt']='2026-11-02T00:00:00Z'
                return json.dumps([changed]).encode()
            return encode(output())
        with self.assertRaisesRegex(ValueError,'DATABASE_BASELINE_CHANGED'):m.collect(drift,identity)

    def test_sql_is_single_readonly_rr_and_hashes_entire_row(self):
        sql=m.build_sql().decode()
        self.assertEqual(sql.count('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'),1)
        self.assertEqual(sql.count('COMMIT;'),1)
        self.assertIn('sha256(convert_to(to_jsonb(t)::text',sql)
        self.assertNotIn('OFFSET ',sql);self.assertNotIn('WITH RECURSIVE',sql)
        self.assertNotRegex(sql,r'(?i)\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER|COPY)\b')
        self.assertIn('ORDER BY %s',sql)
        self.assertIn('page_keys AS MATERIALIZED',sql)
        self.assertIn('LIMIT 128',sql)
        self.assertNotIn("='null' OR",sql)

    def test_missing_page_marker_count_or_cursor_rejected(self):
        for mutate in [lambda d:d.remove(item(d,'page')),lambda d:item(d,'page').update(count=0),
                       lambda d:item(d,'page').update(lastKey=['wrong']),lambda d:item(d,'table-count').update(count=2)]:
            data=output({'app_image_jobs':['a'*64]});mutate(data)
            with self.assertRaises(ValueError):parse(data)


@unittest.skipUnless('--postgres' in sys.argv or os.environ.get('NAUMI_ROW_FINGERPRINT_PG')=='1','explicit isolated Postgres run')
class RealPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name='naumi-row-proof-'+uuid.uuid4().hex[:10];cls.label='io.naumi.row-fingerprint-test='+cls.name
        p=subprocess.run(['docker','run','-d','--network','none','--restart','no','--memory','512m','--cpus','1','--label',cls.label,
                          '--name',cls.name,'-e','POSTGRES_PASSWORD=fixture-only','-e','POSTGRES_DB=fixture','postgres:16-alpine'],capture_output=True,text=True,check=True)
        cls.container=p.stdout.strip();cls.addClassCleanup(cls.cleanup)
        for _ in range(80):
            if subprocess.run(['docker','exec',cls.container,'pg_isready','-U','postgres','-d','fixture'],capture_output=True).returncode==0:break
            time.sleep(.2)
        else:raise RuntimeError('FIXTURE_PG_NOT_READY')

    @classmethod
    def cleanup(cls):
        row=json.loads(subprocess.check_output(['docker','inspect',cls.container]))[0]
        assert row['Id']==cls.container and row['Config']['Labels'].get('io.naumi.row-fingerprint-test')==cls.name
        subprocess.run(['docker','stop','--time','10',cls.container],check=True,stdout=subprocess.DEVNULL)
        subprocess.run(['docker','rm',cls.container],check=True,stdout=subprocess.DEVNULL)

    @classmethod
    def psql(cls,sql,check=True):
        p=subprocess.run(['docker','exec','-i',cls.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','fixture'],
                         input=sql if isinstance(sql,bytes) else sql.encode(),capture_output=True,timeout=75)
        if check and p.returncode:raise AssertionError(p.stderr.decode())
        return p

    def setUp(self):
        self.schema='fp_'+uuid.uuid4().hex[:10]
        statements=['CREATE SCHEMA '+self.schema]
        for name,key in m.TABLES.items():
            fields=m._keys(key)
            columns=','.join('"'+k+'" text NOT NULL' for k in fields)
            statements.append('CREATE TABLE '+self.schema+'.'+name+' (native_id bigint PRIMARY KEY,'+columns+',state text,payload jsonb)')
        self.psql(';'.join(statements)+';')

    def take(self,**kwargs):
        return m.parse_output(self.psql(m.build_sql(schema=self.schema,budget=kwargs.get('budget'))).stdout,
                              schema=self.schema,expected_database='fixture',**kwargs)

    def test_whole_row_hash_native_key_and_real_mutation(self):
        self.psql(f"INSERT INTO {self.schema}.app_image_jobs VALUES(2,'j2','unknown','{{\"paid\":\"started\"}}'),(10,'j10','pending','{{\"reference\":\"fixture\"}}');")
        first=self.take();second=self.take()
        self.assertTrue(m.compare(first,second)['preservationVerified'])
        self.assertEqual(first['tables']['app_image_jobs']['primaryKey'],['native_id'])
        self.assertEqual(list(first['tables']['app_image_jobs']['rows']),['["2"]','["10"]'])
        self.psql(f"UPDATE {self.schema}.app_image_jobs SET state='done' WHERE native_id=2;")
        changed=self.take();self.assertEqual(len(m.compare(first,changed)['changed']),1)
        self.psql(f"DELETE FROM {self.schema}.app_image_jobs WHERE native_id=10; INSERT INTO {self.schema}.app_image_jobs VALUES(3,'j3','pending','{{}}');")
        result=m.compare(first,self.take());self.assertEqual(len(result['missing']),1);self.assertEqual(len(result['added']),1)

    def test_missing_key_and_absent_additive_are_not_assumed_empty(self):
        self.psql(f'DROP TABLE {self.schema}.app_reference_operations;')
        self.assertEqual(self.take()['collection']['status'],'incomplete')
        self.assertEqual(self.take(allow_absent_tables=['app_reference_operations'])['collection']['status'],'complete')
        self.psql(f'ALTER TABLE {self.schema}.app_ledger DROP CONSTRAINT app_ledger_pkey;')
        self.assertEqual(self.take(allow_absent_tables=['app_reference_operations'])['collection']['status'],'incomplete')

    def test_global_row_budget_fails_closed_with_bounded_output(self):
        self.psql(f"INSERT INTO {self.schema}.app_image_jobs SELECT n,'job-'||n,'unknown','{{}}'::jsonb FROM generate_series(1,3)n;")
        value=self.take(budget={'rows':2})
        self.assertEqual(value['collection']['status'],'incomplete')
        self.assertEqual(value['tables']['app_image_jobs']['rows'],{})

    def test_full_row_payload_and_schema_drift(self):
        self.psql(f"INSERT INTO {self.schema}.app_supplier_calls VALUES(1,'call','unknown','{{\"task_id\":\"original\",\"blob\":\"large-ish\"}}');")
        first=self.take()
        self.psql(f"UPDATE {self.schema}.app_supplier_calls SET payload=jsonb_set(payload,'{{task_id}}','\"other\"');")
        self.assertEqual(len(m.compare(first,self.take())['changed']),1)
        self.psql(f'ALTER TABLE {self.schema}.app_supplier_calls ADD COLUMN extra text;')
        self.assertIn('app_supplier_calls',m.compare(first,self.take())['schemaChanged'])

    def test_global_output_budget_is_enforced_before_transferring_rows(self):
        self.psql(f"INSERT INTO {self.schema}.app_image_jobs SELECT n,repeat('x',700)||n,'unknown','{{}}'::jsonb FROM generate_series(1,10000)n;")
        value=self.take(budget={'bytes':2*1024*1024})
        self.assertEqual(value['collection']['status'],'incomplete')
        # Valid earlier pages remain evidence; the offending page's bodies do
        # not cross the connection. The table never receives a complete mark.
        self.assertLess(value['collection']['outputBytes'],2*1024*1024)
        self.assertLess(value['tables']['app_image_jobs']['rowCount'],10000)

    def test_one_hundred_thousand_small_fingerprints(self):
        self.psql(f"INSERT INTO {self.schema}.app_image_jobs SELECT n,'job-'||n,'unknown',jsonb_build_object('originalTask',n,'paidState','started') FROM generate_series(1,100000)n;")
        value=self.take()
        self.assertEqual(value['collection']['status'],'complete')
        self.assertEqual(value['collection']['rows'],100000)
        self.assertLess(value['collection']['outputBytes'],m.DEFAULT_BUDGET['bytes'])
        print('FINGERPRINT_SCALE='+json.dumps({'rows':value['collection']['rows'],'bytes':value['collection']['outputBytes'],'sqlElapsedMs':value['collection']['elapsedMs'],'realPostgres':True,'productionActions':0}),flush=True)

    def test_large_payload_whole_statement_times_out_but_pages_complete(self):
        # 1 GiB of real logical JSON payload, TOAST-compressible fixture bytes.
        # Both paths use a stricter 1 s statement deadline, not an enlarged one.
        self.psql(f"INSERT INTO {self.schema}.app_image_jobs SELECT n,'job-'||n,'unknown',jsonb_build_object('original',repeat(md5(n::text),16384),'paidState','started') FROM generate_series(1,2048)n;")
        baseline=self.psql(f"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='1000ms'; WITH rows AS MATERIALIZED (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM {self.schema}.app_image_jobs t ORDER BY native_id) SELECT sum(length(h)) FROM rows; COMMIT;",check=False)
        self.assertEqual(baseline.returncode,3)
        self.assertIn(b'statement timeout',baseline.stderr)
        value=self.take(budget={'statement_ms':1000})
        self.assertEqual(value['collection']['status'],'complete')
        self.assertEqual(value['collection']['rows'],2048)
        self.assertEqual(len(value['tables']['app_image_jobs']['pageEvidence']),16)
        print('FINGERPRINT_LARGE_PAYLOAD='+json.dumps({'baselineExit':baseline.returncode,'baselineReason':'statement timeout','logicalPayloadMiB':1024,
              'modifiedStatus':value['collection']['status'],'pages':16,'rows':2048,'sqlElapsedMs':value['collection']['elapsedMs'],'statementMs':1000,'totalSeconds':60,'realPostgres':True}),flush=True)

    def test_full_types_jsonb_bytea_numeric_utf8_are_not_dropped(self):
        table=f'{self.schema}.app_ledger'
        self.psql(f"ALTER TABLE {table} ADD COLUMN bytes bytea, ADD COLUMN precise numeric(40,18), ADD COLUMN unicode text; INSERT INTO {table} SELECT n,'ledger-'||n,'unknown','{{\"嵌套\":[null,true,12.345]}}',decode('00ff0102','hex'),12345678901234567890.123456789012345678,'画布🙂' FROM generate_series(1,3)n;")
        before=self.take()
        self.psql(f"UPDATE {table} SET bytes=decode('00ff0103','hex') WHERE native_id=1; UPDATE {table} SET precise=precise+0.000000000000000001 WHERE native_id=2; UPDATE {table} SET unicode='画布🙃' WHERE native_id=3;")
        result=m.compare(before,self.take());self.assertEqual(len(result['changed']),3);self.assertFalse(result['preservationVerified'])


if __name__=='__main__':
    if '--postgres' in sys.argv:
        os.environ['NAUMI_ROW_FINGERPRINT_PG']='1';sys.argv.remove('--postgres')
    unittest.main(verbosity=2)
