"""Bounded local fixtures only; opt-in Docker Nginx uses no external network."""
import copy
import datetime as dt
import json
import os
import pathlib
import subprocess
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch

import release47_capacity_binding as m
import release_lifecycle as lifecycle
import test_release47_normal_policy as policy_fixture
from test_release47_recovery_supervisor import Fake
from test_release_client_compat import fixture_files, dump_files, SITE


class CapacityTests(unittest.TestCase):
    def config(self):
        return dict(target=m.TARGET, releaseId=m.RELEASE, evidenceRoot=str(m.ROOT),
                    expectedRevision=728, expectedCanonicalDigest='a'*64,
                    expectedCanonicalFileSha256='b'*64, operatorSource='c'*40,
                    routerStartTicks='1812', routerCmdlineSha256='d'*64,
                    date=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),
                    preservedUnknown=dict(baselinePath=m.CASE05_BASELINE,
                        baselineSha256=m.CASE05_SHA256, allowedAdditiveColumns={}))

    def holder(self, root):
        c=object.__new__(m.CapacityBinding)
        c.state={'revision':728, 'phase':'historical', 'activeNormalBlueGreenReleaseId':m.R1,
                 'normalBlueGreenReleases':{m.R1:{'phase':'COMPLETE','retired':['old1','old2']},
                     m.RELEASE:{'phase':'SWITCHED','kind':'private-router-capacity-binding','operations':{}}}}
        c.prior=copy.deepcopy(c.state['normalBlueGreenReleases'][m.R1])
        c.historical={key:copy.deepcopy(c.state[key]) for key in ('phase','activeNormalBlueGreenReleaseId')}
        c.record=c.state['normalBlueGreenReleases'][m.RELEASE]
        path=root/'current.json';m.controls._atomic_private(path,c.state);c.disk=m.sha(path.read_bytes())
        c.tx=type('Tx',(),{'save':lambda *a:None})()
        return c,path

    def test_config_fixed_scope_and_separate_digest_semantics(self):
        m.validate_config(self.config())
        for key,value in [('target','103.30.76.93'),('expectedRevision',729),('expectedCanonicalFileSha256','x'),
                          ('evidenceRoot','/tmp/other'),('preservedUnknown',{}),('port',13052),
                          ('upstream','http://other'),('token','fixture'),('manifestPath','/tmp/m')]:
            with self.subTest(key=key),self.assertRaises(m.Hold):m.validate_config({**self.config(),key:value})

    def test_exact_loopback_configuration_only(self):
        for port in (13052,13952):
            body=m.private_server(port).decode()
            self.assertIn('listen 127.0.0.1:'+str(port)+';',body)
            self.assertIn('location = /api/internal/model-capacity {',body)
            self.assertIn('proxy_pass http://127.0.0.1:13114;',body)
            self.assertIn('Authorization $http_authorization;',body)
            self.assertIn('location / { return 404; }',body)
        for port in (80,13114,True,'13052'):
            with self.assertRaises(m.Hold):m.private_server(port)

    def test_original_canonical_cas_and_history_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            c,path=self.holder(pathlib.Path(folder))
            with patch.object(m.ctl,'CANON',path):
                c.phase('READY');self.assertEqual(json.loads(path.read_bytes())['revision'],729)
                self.assertEqual(c.state['normalBlueGreenReleases'][m.R1],c.prior)
                path.write_text('{}')
                with self.assertRaisesRegex(m.Hold,'CAS_CHANGED'):c.persist()
                self.assertEqual(path.read_text(),'{}')

    def test_history_mutation_rejected_before_write(self):
        with tempfile.TemporaryDirectory() as folder:
            c,path=self.holder(pathlib.Path(folder));before=path.read_bytes();c.state['phase']='COMPLETE'
            with patch.object(m.ctl,'CANON',path),self.assertRaisesRegex(m.Hold,'HISTORY_OR_ACTIVE'):c.persist()
            self.assertEqual(before,path.read_bytes())

    def test_completed_rename_then_directory_fsync_failure_stays_blocking(self):
        with tempfile.TemporaryDirectory() as folder:
            c,path=self.holder(pathlib.Path(folder));real=m.controls._atomic_private
            def renamed_then_failed(target,value):
                real(target,value);raise OSError('fixture directory fsync failure after rename')
            with patch.object(m.ctl,'CANON',path):
                with patch.object(m.controls,'_atomic_private',side_effect=renamed_then_failed),self.assertRaises(OSError):c.phase('COMPLETE')
                self.assertEqual(c.disk,m.sha(path.read_bytes()))
                # The actual run exception handler performs this transition.
                c.record.update(phase='RECOVERY_REQUIRED',lastOperationResult='UNKNOWN');c.persist()
                self.assertEqual(json.loads(path.read_bytes())['normalBlueGreenReleases'][m.RELEASE]['phase'],'RECOVERY_REQUIRED')
                f=policy_fixture.NormalPolicy();f.setUp();f.s['normalBlueGreenReleases']={m.RELEASE:copy.deepcopy(c.record)}
                with self.assertRaisesRegex(m.Hold,'RECONCILIATION'):f.begin()

    def test_write_failure_with_foreign_value_never_claims_or_overwrites(self):
        with tempfile.TemporaryDirectory() as folder:
            c,path=self.holder(pathlib.Path(folder));old=c.disk
            def other_writer(target,value):target.write_bytes(b'{"foreign":true}\n');raise OSError('fixture concurrent value')
            with patch.object(m.ctl,'CANON',path):
                with patch.object(m.controls,'_atomic_private',side_effect=other_writer),self.assertRaises(OSError):c.phase('COMPLETE')
                self.assertEqual(c.disk,old);c.record['phase']='RECOVERY_REQUIRED'
                with self.assertRaisesRegex(m.Hold,'CAS_CHANGED'):c.persist()
                self.assertEqual(path.read_bytes(),b'{"foreign":true}\n')

    def test_unknown_operation_original_uuid_cannot_replay(self):
        c=object.__new__(m.CapacityBinding);c.record={'operations':{}};c.persist=lambda:None
        c.tx=type('Tx',(),{'save':lambda *a:None})()
        def failed():raise OSError('fixture unknown')
        with self.assertRaises(OSError):c.op('private-nginx-reload',failed)
        before=copy.deepcopy(c.record);uuid.UUID(before['operations']['private-nginx-reload']['operationId'])
        self.assertEqual(before['operations']['private-nginx-reload']['phase'],'UNKNOWN')
        with self.assertRaisesRegex(m.Hold,'REPLAY_FORBIDDEN'):c.op('private-nginx-reload',lambda:None)
        self.assertEqual(c.record,before)

    def test_private_journal_pending_or_unknown_blocks_normal_begin(self):
        for phase,operations in [('BASELINED',{}),('READY',{}),('SWITCHED',{}),('RECOVERY_REQUIRED',{}),
                                 ('COMPLETE',{'reload':{'phase':'UNKNOWN'}})]:
            f=policy_fixture.NormalPolicy();f.setUp();f.s['normalBlueGreenReleases']={m.RELEASE:dict(kind='private-router-capacity-binding',phase=phase,operations=operations)}
            with self.subTest(phase=phase),self.assertRaisesRegex(m.Hold,'RECONCILIATION'):f.begin()

    def test_current_full_dump_include_and_maintenance_preserves_private_route(self):
        files=fixture_files();files['/etc/nginx/nginx.conf']=files['/etc/nginx/nginx.conf'].replace('http {','http { include /etc/nginx/conf.d/*.conf;')
        original=dump_files(files);m.required_include(original)
        files[str(m.CONF)]=m.private_server(13052).decode();dump=dump_files(files)
        with self.assertRaisesRegex(m.Hold,'ALREADY_LOADED'):m.required_include(dump)
        selected=m.selected_public_servers(dump);self.assertEqual(len(selected),2)
        with tempfile.TemporaryDirectory() as folder:
            spec=dict(kind='saas-controlled-maintenance-recovery',expectedDumpSha256=m.sha(dump.encode()),servers=selected,restoreDatabase=False,replayAcceptedTasks=False,compatibleBusinessRollback=False)
            report=m.render(dump,spec,pathlib.Path(folder)/'bundle',source_files={p:b.encode()for p,b in files.items()})
            self.assertNotIn(str(m.CONF),[p['path']for p in report['patches']])
            after=m.compat.Dump((pathlib.Path(folder)/'bundle/nginx.after.txt').read_text())
            self.assertEqual(after.files[str(m.CONF)],m.compat.Dump(dump).files[str(m.CONF)])

    def test_supervisor_readonly_cannot_restart_resume_or_write_journal(self):
        with tempfile.TemporaryDirectory() as folder:
            fake=Fake();manifest=dict(commit='commit',journalDir=folder,web=dict(role='web',id='web',name='web'),worker=dict(role='worker',id='worker',name='worker'))
            supervisor=m.ReadOnlySupervisor(manifest,fake);supervisor.once()
            self.assertEqual(list(pathlib.Path(folder).iterdir()),[])
            self.assertEqual(fake.starts,[]);self.assertEqual(fake.controls,[])
            for change in ('stopped','drained','unknown'):
                fake=Fake()
                if change=='stopped':fake.rows['web']['State']['Running']=False
                elif change=='drained':fake.app['admission']['mode']='draining'
                else:fake.worker.update(paused=True,unresolvedTicks=1)
                with self.subTest(change=change),self.assertRaises(m.Hold):m.ReadOnlySupervisor(manifest,fake).once()
                self.assertEqual(fake.starts,[]);self.assertEqual(fake.controls,[])

    def test_lifecycle_dispatch_and_invalid_flags(self):
        with patch.object(lifecycle.os,'name','posix'),patch.object(m,'main') as execute:
            self.assertEqual(lifecycle.main(['bind47-capacity','--config','fixture.json']),0)
            execute.assert_called_once_with(pathlib.Path('fixture.json'))
        for args in (['bind47-capacity'],['bind47-capacity','--config','fixture.json','--apply'],['bind47-capacity','--config','fixture.json','--review','r.json']):
            with patch.object(m,'main') as execute:
                self.assertEqual(lifecycle.main(args),2);execute.assert_not_called()


@unittest.skipUnless(os.environ.get('NAUMI_LOCAL_CAPACITY_NGINX')=='1','opt-in local Docker Nginx fixture')
class ActualNginx(unittest.TestCase):
    def test_five_real_http_groups_authorization_and_exact_location(self):
        self.assertEqual(os.name,'posix')
        tag=uuid.uuid4().hex[:10];nginx='capacity-nginx-fixture-'+tag;backend='capacity-upstream-fixture-'+tag
        created=[]
        def run(*args):
            result=subprocess.run(list(args),capture_output=True,text=True,timeout=35)
            self.assertEqual(result.returncode,0,result.stderr[-1500:]);return result.stdout.strip()
        with tempfile.TemporaryDirectory(prefix='naumi-capacity-fixture-') as folder:
            root=pathlib.Path(folder);(root/'nginx.conf').write_bytes(b'events {}\nhttp { access_log off;\n'+m.private_server(13952)+b'\n}\n')
            # Standard mock Web: no database, task or lease engine; no external network.
            (root/'upstream.cjs').write_text("""const http=require('node:http');const token='isolated-capacity-fixture-token-32';let calls=[];
http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{calls.push({method:req.method,url:req.url,body});
if(req.url!='/api/internal/model-capacity'){res.writeHead(599);res.end();return;}
res.writeHead(req.method==='GET'?405:req.headers.authorization==='Bearer '+token&&body==='{}'?400:404);res.end();});}).listen(13114,'127.0.0.1');
""")
            (root/'client.cjs').write_text("""const http=require('node:http');const cases=[['GET','/api/internal/model-capacity',false,405],['POST','/api/internal/model-capacity',false,404],['POST','/api/internal/model-capacity',true,400],['GET','/admin',false,404],['GET','/api/internal/model-capacity/',false,404]];
(async()=>{let out=[];for(const [method,path,auth,want]of cases){const status=await new Promise((ok,bad)=>{let r=http.request({host:'127.0.0.1',port:13952,path,method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer isolated-capacity-fixture-token-32'}:{})}},s=>{s.resume();s.on('end',()=>ok(s.statusCode));});r.on('error',bad);r.setTimeout(3000,()=>r.destroy(Error('timeout')));r.end(method==='POST'?'{}':undefined);});if(status!==want)throw Error('status mismatch');out.push({method,authenticated:auth,status});}console.log(JSON.stringify({fixture:true,checks:out}));})().catch(()=>process.exit(1));
""")
            try:
                run('docker','run','-d','--pull=never','--name',nginx,'--network','none','--memory','64m','--pids-limit','32','-v',folder+':/fixture:ro','nginx:1.27-alpine','nginx','-c','/fixture/nginx.conf','-g','daemon off;');created.append(nginx)
                run('docker','run','-d','--pull=never','--name',backend,'--network','container:'+nginx,'--memory','64m','--pids-limit','32','-v',folder+':/fixture:ro','node:24-bookworm-slim','node','/fixture/upstream.cjs');created.append(backend)
                run('docker','exec',nginx,'nginx','-t','-c','/fixture/nginx.conf')
                for _ in range(30):
                    result=subprocess.run(['docker','exec',backend,'node','/fixture/client.cjs'],capture_output=True,text=True,timeout=20)
                    if result.returncode==0:break
                    time.sleep(.1)
                self.assertEqual(result.returncode,0,'five-group actual HTTP fixture failed')
                receipt=json.loads(result.stdout);self.assertEqual([c['status']for c in receipt['checks']],[405,404,400,404,404])
                print('ACTUAL_NGINX_LOCAL_FIXTURE='+json.dumps(receipt,sort_keys=True))
            finally:
                for name in reversed(created):run('docker','rm','-f',name)


if __name__=='__main__':unittest.main()
