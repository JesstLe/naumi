import json,os,subprocess,sys,types,unittest,uuid
import release47_task_snapshot as current

@unittest.skipUnless(os.environ.get('NAUMI_VERIFY_ISOLATED_DB')=='1','isolated fixture only')
class ProjectionEquivalence(unittest.TestCase):
    def test_full_and_proof_preserve_exact_selected_content(self):
        source=subprocess.check_output(['git','show','888f5e2f:scripts/ops/release47_task_snapshot.py']).decode()
        baseline=types.ModuleType('snapshot_projection_baseline');sys.modules[baseline.__name__]=baseline;exec(compile(source,'baseline.py','exec'),baseline.__dict__)
        container=os.environ.get('NAUMI_TASK_SNAPSHOT_TEST_CONTAINER','naumi-bi-perf-20261021');inspect=json.loads(subprocess.check_output(['docker','inspect',container]))[0];identity=current.public_identity(inspect)
        env=dict(v.split('=',1) for v in inspect['Config']['Env'] if '=' in v);user=env.get('POSTGRES_USER','postgres');database=env['POSTGRES_DB']
        schema='projection_'+uuid.uuid4().hex
        def command(args,stdin=None,timeout=120):return subprocess.run(args,input=stdin,capture_output=True,timeout=timeout)
        def sql(q):
            r=command(['docker','exec','-i',container,'psql','-XqAt','-U',user,'-d',database,'-v','ON_ERROR_STOP=1'],stdin=q.encode());self.assertEqual(r.returncode,0,r.stderr.decode());return r.stdout.decode().strip()
        try:
            sql(f"""CREATE SCHEMA {schema};CREATE TABLE {schema}.app_image_jobs(id text primary key,email text,kind text,snapshot jsonb,payload jsonb,plans jsonb,parameters jsonb,cost int);
                INSERT INTO {schema}.app_image_jobs VALUES('job','fixture@test','generate',jsonb_build_object('status','pending','paidOperations',jsonb_build_object('op',jsonb_build_object('model','wire','gatewayIdentity','identity','replayable',false,'unrelatedReceipt',repeat('x',200000))),'images',repeat('z',200000)),jsonb_build_object('p',jsonb_build_object('model','raw','ref','private-reference'),'callId','call'), '[{{"state":"waiting","prompt":"preserve"}}]', '{{"billingResolution":"4K","upstreamStarted":true}}',12);
                CREATE TABLE {schema}.app_supplier_calls(id text primary key,operation_id text,state text,request_body text);INSERT INTO {schema}.app_supplier_calls VALUES('call','op','accepted','frozen body');
                CREATE TABLE {schema}.app_ledger(id text primary key,delta int,extra text);INSERT INTO {schema}.app_ledger VALUES('led-image-job',-12,'entire-row-hash');""")
            for mode in ['full','proof']:
                before=baseline.collect_task_snapshot(command,identity,schema=schema,projection=mode)
                after=current.collect_task_snapshot(command,identity,schema=schema,projection=mode)

                if os.environ.get('NAUMI_SNAPSHOT_EQUIVALENCE_EVIDENCE'):
                    from pathlib import Path
                    evidence=Path(os.environ['NAUMI_SNAPSHOT_EQUIVALENCE_EVIDENCE']);evidence.mkdir(parents=True,exist_ok=True)
                    (evidence/(mode+'.json')).write_text(json.dumps({'before':before.private,'after':after.private},indent=2),encoding='utf8')
                # Compare the same business payload; v3 adds independently asserted
                # ledger leaves and richer paid-state evidence, not false equality.
                if mode=='full':
                    common={name:{key:value for key,value in table.items() if key!='globalLedger'} for name,table in after.private['tables'].items()}
                    self.assertEqual(before.private['tables'],common,mode)
                    self.assertEqual(after.private['tables']['app_ledger']['globalLedger'],{'led-image-job':sql(f"SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM {schema}.app_ledger t WHERE id='led-image-job';")})
                else:
                    for name,table in before.private['tables'].items():
                        current_table=after.private['tables'][name]
                        self.assertEqual(table['status'],current_table['status'],name)
                        if table['status']!='observed':continue
                        for key in ['count','selectedCount','activeCount','allSummary']:self.assertEqual(table.get(key),current_table.get(key),(name,key))
                        self.assertEqual(len(table['rows']),len(current_table['rows']),name)
                        for old,new in zip(table['rows'],current_table['rows']):
                            self.assertEqual({k:v for k,v in old.items() if k!='snapshot'},{k:v for k,v in new.items() if k!='snapshot'},name)
                            if name=='app_image_jobs':
                                self.assertEqual(new['snapshot']['status'],old['snapshot']['status'])
                                self.assertEqual(new['snapshot']['_proofVersion'],current.PROOF_VERSION)
                                self.assertFalse(new['snapshot']['_unverified'])
                                for operation,part in old['snapshot']['paidOperations'].items():
                                    self.assertEqual({key:new['snapshot']['paidOperations'][operation][key] for key in part},part)
                                    self.assertIsNone(new['snapshot']['paidOperations'][operation]['state'])
                                    self.assertEqual(new['snapshot']['paidOperations'][operation]['children'],{})
                    self.assertEqual(set(after.private['tables']['app_ledger']['globalLedger']),{'led-image-job'})
                next_=current.collect_task_snapshot(command,identity,schema=schema,projection=mode,previous=before.private)
                self.assertEqual(after.private['tables'],next_.private['tables'],mode+' previous graph')
                self.assertEqual(after.private['collection']['version'],current.PROOF_VERSION)
                self.assertEqual(after.private['collection']['status'],'complete')
                self.assertFalse(current.compare_task_snapshots(before.private,next_.private)['preservationVerified'],'legacy proof never acquires v3 evidence retroactively')
        finally:sql(f'DROP SCHEMA {schema} CASCADE')

if __name__=='__main__':unittest.main()
