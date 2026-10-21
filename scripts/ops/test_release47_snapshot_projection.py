import json,os,subprocess,sys,types,unittest,uuid
import release47_task_snapshot as current

@unittest.skipUnless(os.environ.get('NAUMI_VERIFY_ISOLATED_DB')=='1','isolated fixture only')
class ProjectionEquivalence(unittest.TestCase):
    def test_full_and_proof_preserve_exact_selected_content(self):
        source=subprocess.check_output(['git','show','888f5e2f:scripts/ops/release47_task_snapshot.py']).decode()
        baseline=types.ModuleType('snapshot_projection_baseline');sys.modules[baseline.__name__]=baseline;exec(compile(source,'baseline.py','exec'),baseline.__dict__)
        container='naumi-bi-perf-20261021';identity=current.public_identity(json.loads(subprocess.check_output(['docker','inspect',container]))[0])
        schema='projection_'+uuid.uuid4().hex
        def command(args,stdin=None,timeout=120):return subprocess.run(args,input=stdin,capture_output=True,timeout=timeout)
        def sql(q):
            r=command(['docker','exec','-i',container,'psql','-XqAt','-U','postgres','-d','bi_fixture','-v','ON_ERROR_STOP=1'],stdin=q.encode());self.assertEqual(r.returncode,0,r.stderr.decode())
        try:
            sql(f"""CREATE SCHEMA {schema};CREATE TABLE {schema}.app_image_jobs(id text primary key,email text,kind text,snapshot jsonb,payload jsonb,plans jsonb,parameters jsonb,cost int);
                INSERT INTO {schema}.app_image_jobs VALUES('job','fixture@test','generate',jsonb_build_object('status','pending','paidOperations',jsonb_build_object('op',jsonb_build_object('model','wire','gatewayIdentity','identity','replayable',false,'unrelatedReceipt',repeat('x',200000))),'images',repeat('z',200000)),jsonb_build_object('p',jsonb_build_object('model','raw','ref','private-reference'),'callId','call'), '[{{"state":"waiting","prompt":"preserve"}}]', '{{"billingResolution":"4K","upstreamStarted":true}}',12);
                CREATE TABLE {schema}.app_supplier_calls(id text primary key,operation_id text,state text,request_body text);INSERT INTO {schema}.app_supplier_calls VALUES('call','op','accepted','frozen body');
                CREATE TABLE {schema}.app_ledger(id text primary key,delta int,extra text);INSERT INTO {schema}.app_ledger VALUES('led-image-job',-12,'entire-row-hash');""")
            for mode in ['full','proof']:
                before=baseline.collect_task_snapshot(command,identity,schema=schema,projection=mode)
                after=current.collect_task_snapshot(command,identity,schema=schema,projection=mode)
                self.assertEqual(before.private['tables'],after.private['tables'],mode)
                next_=current.collect_task_snapshot(command,identity,schema=schema,projection=mode,previous=before.private)
                self.assertEqual(before.private['tables'],next_.private['tables'],mode+' previous graph')
        finally:sql(f'DROP SCHEMA {schema} CASCADE')

if __name__=='__main__':unittest.main()
