"""Real projection + existing release creator; no live host configuration."""
import copy
import json
import pathlib
import subprocess
import tempfile
import unittest
import datetime
from unittest.mock import Mock, patch

import release47_controls as controls
from release47_host import Hold, environment, public_identity
from test_release47_controls import CombinedMediaControls

ROOT = pathlib.Path(__file__).resolve().parents[2]


class DirectRelease(unittest.TestCase):
    def setUp(self):
        f = CombinedMediaControls(); f.setUp()
        self.web, self.worker = f.web, f.worker
        self.values = environment(self.web)
        self.values.update(NAUMI_APPLICATION_TASK_EXECUTION='worker', DATABASE_URL='postgresql://fixture',
            SETTINGS_SECRET='fixture-'+40*'s', MEDIA_DIR='/data/media', STORAGE_DRIVER='s3',
            S3_ACCESS_KEY_ID='fixture-key', S3_SECRET_ACCESS_KEY='fixture-secret', NAUMI_NAS_DEFER_UPLOAD='1',
            RELEASE_CONTROL_SECRET='web-only-not-scanner', UNRELATED_TOKEN='unreviewed')
        self.web['Config']['Env'] = [k+'='+v for k,v in self.values.items()]
        self.web['Mounts'].append({'Type':'bind','Destination':'/data','Source':'/fixture/media','RW':True})
        self.projection = self.project()

    def project(self):
        script = "import {directWorkerEnvironment as project} from "+json.dumps((ROOT/'scripts/direct-worker-settings.mjs').as_uri())+";console.log(JSON.stringify(project(JSON.parse(process.argv[1]))));"
        return json.loads(subprocess.check_output(['node','--input-type=module','-e',script,json.dumps(self.values)]))

    def create(self, combined=True, mutate=None):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.calls = []; tx = Mock(); tx.folder=pathlib.Path(self.temp.name)
        tx.pin.side_effect=lambda identity:self.web if identity['id']==self.web['Id'] else self.worker
        def run(args, **options):
            self.calls.append(args)
            if args[:2] == ['docker','exec']: return json.dumps(self.projection).encode()
            if args[:2] == ['docker','create']:
                settings=dict(line.split('=',1) for line in pathlib.Path(args[args.index('--env-file')+1]).read_text().splitlines())
                self.worker['Config']['Env']=[k+'='+v for k,v in settings.items()]
                self.worker['Config']['Cmd']=args[-2:]; self.worker['Config']['User']='0:0' if combined else '1001:1001'
                self.worker['HostConfig']['PidsLimit']=160 if combined else 128
                self.worker['HostConfig']['CapAdd']=list(controls.COMBINED_WORKER_CAPS) if combined else []
                self.worker['HostConfig']['Tmpfs']={args[i+1].split(':',1)[0]:args[i+1].split(':',1)[1] for i in range(len(args)-1) if args[i]=='--tmpfs'}
                self.worker['Mounts']=[m for m in self.worker['Mounts'] if m['Destination']=='/release-state']
                if combined:self.worker['Mounts'].insert(0,copy.deepcopy(self.web['Mounts'][0]))
                self.worker['Mounts'].append(copy.deepcopy(self.web['Mounts'][1]))
                if mutate:mutate(self.worker)
                return (self.worker['Id']+'\n').encode()
            if args[:2] == ['docker','start']:self.worker['State']['Running']=True
            return b''
        tx.run.side_effect=run
        tx.inspect.side_effect=lambda name:self.web if name==self.web['Name'].lstrip('/') else self.worker
        real=pathlib.Path; state='/opt/naumi-staging/releases/fixture/direct-worker'
        fake=Mock();fake.is_absolute.return_value=True;fake.is_symlink.return_value=False;fake.resolve.return_value.is_relative_to.return_value=True
        if not combined:
            self.values.pop('NAUMI_MEDIA_WORKER');self.web['Config']['Env']=[k+'='+v for k,v in self.values.items()]
        with patch.object(controls.pathlib,'Path',side_effect=lambda value:fake if str(value)==state else real(value)),patch.object(controls.os,'chown',create=True):
            result=controls.clone_worker(tx,public_identity(self.web),name=self.worker['Name'].lstrip('/'),
                memory_mib=1024,cpu=1,state_dir=state,reviewed_combined_media=combined)
        return tx,result

    def test_combined_clone_projects_real_allowlist_and_shares_only_media(self):
        self.create();env=environment(self.worker)
        self.assertEqual(env['NAUMI_WORKER_EXECUTION'],'direct')
        self.assertEqual(env['NAUMI_WORKER_TARGET_INSTANCE_ID'],self.worker['Name'].lstrip('/'))
        for key in ['DATABASE_URL','SETTINGS_SECRET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','NAUMI_NAS_DEFER_UPLOAD']:
            self.assertEqual(env[key],self.values[key])
            if key!='NAUMI_NAS_DEFER_UPLOAD':self.assertNotIn(self.values[key], ' '.join(x for args in self.calls for x in args))
        self.assertNotIn('UNRELATED_TOKEN',env);self.assertNotIn('RELEASE_CONTROL_SECRET',env)
        self.assertNotIn('/data',self.worker['HostConfig']['Tmpfs'])

    def test_combined_direct_start_rechecks_projection_and_reserved_ram(self):
        tx,result=self.create()
        with self.assertRaisesRegex(Hold,'MEMORY'):controls.start_worker(tx,result,2047,reviewed_combined_media=True)
        self.assertTrue(controls.start_worker(tx,result,2048,reviewed_combined_media=True)['running'])

    def test_plain_direct_clone_nonroot_and_start(self):
        tx,result=self.create(combined=False)
        self.assertEqual(self.worker['Config']['User'],'1001:1001')
        self.assertTrue(controls.start_worker(tx,result,2048)['running'])

    def test_plain_direct_drift_is_rejected_before_start(self):
        for key,value in [('DATABASE_URL','changed'),('NAUMI_WORKER_TARGET_INSTANCE_ID',self.web['Name'].lstrip('/')),
                          ('NAUMI_WORKER_EXECUTION','http'),('UNRELATED_TOKEN','bad')]:
            with self.subTest(key=key):
                self.setUp();tx,result=self.create(False);env=environment(self.worker);env[key]=value
                self.worker['Config']['Env']=[k+'='+v for k,v in env.items()]
                with self.assertRaises(Hold):controls.start_worker(tx,public_identity(self.worker),2048)

    def test_combined_direct_credentials_or_target_drift_rejected(self):
        for key,value in [('SETTINGS_SECRET','changed'),('RELEASE_CONTROL_SECRET','unreviewed'),
                          ('NAUMI_WORKER_TARGET_INSTANCE_ID',self.web['Name'].lstrip('/'))]:
            self.setUp();tx,result=self.create();env=environment(self.worker);env[key]=value
            self.worker['Config']['Env']=[k+'='+v for k,v in env.items()]
            with self.assertRaises(Hold):controls.start_worker(tx,public_identity(self.worker),2048,reviewed_combined_media=True)

    def test_missing_or_ambiguous_media_mounts_and_database_are_not_silently_local(self):
        for mounts in [[],[{'Type':'bind','Destination':'/data','Source':'/x','RW':False}],
                       self.web['Mounts']+[{'Type':'bind','Destination':'/data/media','Source':'/other','RW':True}]]:
            row=copy.deepcopy(self.web);row['Mounts']=mounts
            with self.assertRaises(Hold):controls.direct_media_mount(row)
        self.values.pop('DATABASE_URL');self.web['Config']['Env']=[k+'='+v for k,v in self.values.items()]
        with self.assertRaisesRegex(Hold,'DATABASE_AND_ENCRYPTION'):controls.direct_worker_environment(Mock(),self.web)

    def test_canonical_combined_plan_keeps_database_out_of_media_child(self):
        script="import {combinedWorkerPlan} from "+json.dumps((ROOT/'scripts/video-worker-with-media.mjs').as_uri())+";const plan=combinedWorkerPlan(JSON.parse(process.argv[1]),{platform:'linux',uid:0,pid:1});console.log(JSON.stringify({db:!!plan.scanner.env.DATABASE_URL,mediaDB:!!plan.media.env.DATABASE_URL,mediaSettings:!!plan.media.env.SETTINGS_SECRET,nas:plan.scanner.env.NAUMI_NAS_DEFER_UPLOAD}));"
        values={**self.values,'NAUMI_WORKER_EXECUTION':'direct',
            'NAUMI_WORKER_STATE_FILE':'/release-state/worker.json','NAUMI_WORKER_RELEASE_CONTROL':'1'}
        actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',script,json.dumps(values)]))
        self.assertEqual(actual,{'db':True,'mediaDB':False,'mediaSettings':False,'nas':'1'})

    def test_supervisor_direct_observation_cannot_accept_web_target(self):
        from release47_recovery_supervisor import Adapter, static_pin
        env={**environment(self.worker),'NAUMI_WORKER_EXECUTION':'direct'}
        self.worker['Config']['Env']=[k+'='+v for k,v in env.items()]
        tx=Mock();tx.inspect.return_value=self.worker
        spec={**public_identity(self.worker),'role':'worker','staticSha256':static_pin(self.worker)}
        adapter=Adapter(tx,{'image':self.worker['Image']})
        status={'schemaVersion':1,'instanceId':self.worker['Name'].lstrip('/'),'commit':self.values['SOURCE_COMMIT'],
            'origin':env['NAUMI_APP_ORIGIN'],'bootId':str(__import__('uuid').uuid4()),'revision':0,'durableControl':True,
            'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':'QUIESCENT','activeTicks':0,
            'unresolvedTicks':0,'executionMode':'direct','executorRole':'worker','targetInstanceId':self.web['Name'].lstrip('/'),
            'backgroundTasks':0}
        with patch.object(adapter,'request',return_value=status):
            with self.assertRaisesRegex(Hold,'DIRECT_WORKER'):adapter.status(spec)

    def test_recovery_combined_unknown_check_precedes_any_mutating_journal(self):
        source=(ROOT/'scripts/ops/release47_normal_rollback.py').read_text()
        self.assertLess(source.index('COMBINED_PRIOR_UNKNOWN_REQUIRES_EXACT_RECOVERY'),source.index("journal=ROOT/'rollback-operation.json'"))

    def test_web_clone_explicit_role_is_only_on_new_slot(self):
        from release47_host import HostTransaction
        source=copy.deepcopy(self.web);source['Mounts']=[];before=copy.deepcopy(source)
        with tempfile.TemporaryDirectory() as tmp:
            folder=pathlib.Path(tmp);captured={};created=copy.deepcopy(source)
            created.update(Id='3'*64,Name='/naumi47-direct-new-web',State={'Running':False,'StartedAt':''})
            def command(argv,**options):
                if argv[:2]==['docker','create']:
                    captured.update(dict(line.split('=',1) for line in pathlib.Path(argv[argv.index('--env-file')+1]).read_text().splitlines()))
                    created['Config']['Env']=[k+'='+v for k,v in captured.items()];return (created['Id']+'\n').encode()
                return b''
            tx=HostTransaction('47.105.59.142','c'*64,folder,command=command);tx.stack=True
            tx.pin=Mock(return_value=source);tx.inspect=Mock(return_value=created);tx.save=Mock()
            state='/opt/naumi-staging/releases/fixture/direct-web';real=pathlib.Path;fake=Mock()
            fake.is_absolute.return_value=True;fake.is_symlink.return_value=False;fake.resolve.return_value.is_relative_to.return_value=True
            fake.stat.return_value.st_mode=0o40700
            with patch.object(controls.pathlib,'Path',side_effect=lambda value:fake if str(value)==state else real(value)),patch.object(controls.os,'chown',create=True):
                tx.clone_web(public_identity(source),name='naumi47-direct-new-web',port=13122,image=source['Image'],commit='b'*40,
                    memory_mib=2048,cpu=1,release_secret='r'*40,state_dir=state,build_version='1792700000',application_task_execution='local')
            self.assertEqual(captured['NAUMI_APPLICATION_TASK_EXECUTION'],'local');self.assertEqual(source,before)


if __name__=='__main__':unittest.main()
