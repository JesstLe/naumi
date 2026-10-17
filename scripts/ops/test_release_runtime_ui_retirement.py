import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import release_runtime_ui_retirement as r

class RuntimeFixture(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        cid,image,started=r.PINS[13028]
        self.pin={'id':cid,'image':'sha256:'+image,'startedAt':started,'name':'naumi-image-cache-ui-b243f5ed703c'}
        self.row={'Id':cid,'Image':self.pin['image'],'Name':'/'+self.pin['name'],'State':{'Running':True,'StartedAt':started,'Pid':100,'Paused':False,'Restarting':False,'OOMKilled':False,'ExitCode':0},'Config':{'Cmd':['node','server.js'],'Env':['NAUMI_VIDEO_WORKER=0']},'Mounts':[],'HostConfig':{'PortBindings':{'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'13028'}]},'RestartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0}},'NetworkSettings':{'Networks':{'fixture':{'IPAddress':'172.21.0.2'}}}}
        self.raw=self.put('raw.json',{'fixture':True})
        module=self.put('source/runtime.ts',b'const SESSIONS = new Map<string, Session>();\nconst CREATING = new Map<string, Promise<Session>>();\nif(process.env.NAUMI_VIDEO_WORKER === "0") return;')
        source={'containerId':cid,'image':self.pin['image'],'coverage':'entire-executable-startup-and-route-closure','unresolvedDynamicImports':[],'unreviewedExecutableFiles':[],'moduleFiles':[module],'nativeMapConstruction':{'globalMapUnmodified':True,'prototypeUnmodified':True,'coverage':'all-runtime-map-construction-and-global-writes','modulePath':module['path']},'autonomousAuditComplete':True,'unknownAutonomousSites':[],'autonomousSites':[{'kind':'video-worker','modulePath':module['path'],'exactSource':'if(process.env.NAUMI_VIDEO_WORKER === "0") return;','disposition':'disabled-by-explicit-env','environment':{'NAUMI_VIDEO_WORKER':'0'}}]}
        self.m={'bindingHashFormat':r.old.BINDING_HASH_FORMAT,'schemaVersion':1,'target':'103.30.76.93','port':13028,'hostIdentitySha256':'b'*64,'identity':self.pin,'immutableSha256':r.immutable(self.row),'networkSha256':r.network_binding(self.row),'ordinaryDrainReceipt':None,'policy':'legacy-ui-runtime-maintenance-v1','authorization':{'kind':'explicit-one-time-maintenance-retirement','containerId':cid,'userRequestSha256':'a'*64,'expiresAt':'2099-01-01T00:00:00Z'},'sourceAudit':self.put('source.json',source),'expectedVersion':'1790000000','expectedCommit':'a'*40}
        self.proof={'coverage':'complete-persisted-ownership','targetOwnedAcceptedTasks':[],'unknownOwnership':[],'preservationSha256':'f'*64}
        self.obs={'processTree':['node server.js'],'socketCoverage':'all-target-network-namespace','socketNonIdle':[],'databaseCoverage':'all-target-container-ips-and-application-identities','databaseActiveOrTransactions':[],'referenceCoverage':'all-docker-effective-systemd-internal-configs','references':[],'staticHashesVerified':True,'rawEvidence':[self.raw]}
        self.report={'schemaVersion':1,'kind':'legacy-node-inspector-map-observation','coverage':'all-enumerated-context-native-map-prototypes','contextMapEnumerationComplete':True,'sourceConfirmedNativeMapConstructionRequired':True,'countsSemantics':'per-context-sum-upper-bound','workerDiscoveryAvailable':True,'workerTargets':0,'targetPid':1,'status':'OBSERVED_MAPS_IDLE','inspectorOpenedByAudit':True,'inspectorClosedConfirmed':True,'ordinaryDrainReceipt':None,'applicationMethodsCalled':False,'heapSnapshotTaken':False,'debuggerPausedByAudit':False,'contexts':[{'contextId':1,'maps':2,'emptyMaps':2,'scannedEntries':0,'sessions':0,'creatingPromises':0}], 'counts':dict.fromkeys((*r.ZERO_FIELDS,'sessions','tmp'),0),'sessionObservations':[],'identityHashes':[],'creatingObservations':[]}
        self.m['inspectorAuditorSha256']='c'*64
        self.report.update(containerIdentity=dict(self.pin,running=True,restartPolicy='unless-stopped'),hostPid=100,namespaceTargetPid=1,auditorSha256='c'*64)
        self.report_desc=self.put('inspector.json',self.report)
        asset=self.put('static.js',b'exact-old-static')
        self.m['maintenance']={'report':self.put('maintenance.json',{'kind':'103-maintenance-gateway','runtimeTopology':'unified-web-three-ui'}),'originalStaticManifest':self.put('static-manifest.json',{'assets':[{'url':'/_next/a.js','sha256':asset['sha256']}]}),'allOriginalUrls':['/_next/a.js'],'staticAssets':[{'url':'/_next/a.js','file':asset,'installedPath':'/var/www/fixture/a.js'}]}
    def tearDown(self):self.tmp.cleanup()
    def put(self,name,value):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);raw=value if isinstance(value,bytes) else json.dumps(value).encode();p.write_bytes(raw);return {'path':name,'sha256':r.digest(raw)}
    def tx(self):
        owner=self
        class Tx:
            def __init__(self):self.folder=owner.root;self.row=copy.deepcopy(owner.row);self.commands=[];self.fail=None
            def inspect(self,cid):assert cid==owner.pin['id'];return copy.deepcopy(self.row)
            def save(self,name,value):return owner.put(name,value)
            def run(self,args,**kw):
                self.commands.append(args)
                if self.fail==args[1]:raise RuntimeError('private failure')
                if args==['cat','/proc/meminfo']:return b'MemAvailable: 4000000 kB\nSwapTotal: 9999999 kB\nSwapFree: 9999999 kB\n'
                if args[:2]==['docker','update']:
                    flag=args[2].split('=',1)[1];parts=flag.split(':');self.row['HostConfig']['RestartPolicy']={'Name':parts[0],'MaximumRetryCount':int(parts[1]) if len(parts)>1 else 0};return b''
                if args[:2]==['docker','stop']:self.row['State']['Running']=False;return b''
                if args[:2]==['docker','start']:self.row['State'].update(Running=True,StartedAt='2026-10-16T10:00:00Z');return b''
                raise AssertionError(args)
        return Tx()
    def retire(self,tx):
        with patch.object(r,'require_lock'),patch.object(r,'fresh_gateway_and_static'),patch.object(r.time,'sleep'),patch.object(r.time,'monotonic_ns',side_effect=[0,31_000_000_000]):
            return r.retire_one(tx,self.m,self.root,lambda *a:copy.deepcopy(self.obs),lambda *a:copy.deepcopy(self.proof),lambda *a:self.report_desc,lambda *a:copy.deepcopy(self.obs))
    def test_single_exact_cid_stop_and_restore_original_policy(self):
        tx=self.tx();result=self.retire(tx);self.assertTrue(result['stopped']);self.assertEqual([c for c in tx.commands if c[:2]==['docker','stop']],[['docker','stop','--time=-1',self.pin['id']]])
        intent=json.loads((self.root/r.journal_name(self.m,'intent')).read_text())
        with patch.object(r,'require_lock'):
            restored=r.restore_one(tx,self.m,intent,lambda *a:{'health':True,'staticHashVerified':True,'version':self.m['expectedVersion'],'commit':self.m['expectedCommit']},required_available_mib=2048)
        self.assertTrue(restored['restored']);self.assertEqual(tx.row['HostConfig']['RestartPolicy'],intent['originalRestartPolicy']);self.assertFalse(restored['originalGatewayReloaded']);self.assertIsNone(restored['ordinaryDrainReceipt'])
    def test_fixed_host_port_image_boot_rejected(self):
        for key,value in [('target','47.105.59.142'),('port',13012)]:
            m=copy.deepcopy(self.m);m[key]=value
            with self.assertRaises(r.Hold):r.check_manifest(m)
        for key in ('id','image','startedAt'):
            m=copy.deepcopy(self.m);m['identity'][key]='wrong'
            with self.assertRaises(r.Hold):r.check_manifest(m)
    def test_native_map_source_is_required_not_latest_registry(self):
        source=json.loads((self.root/'source.json').read_text());source['nativeMapConstruction']['globalMapUnmodified']=False;self.m['sourceAudit']=self.put('changed-source.json',source)
        with self.assertRaises(r.Hold):self.retire(self.tx())
    def test_partial_context_unclosed_worker_and_pending_hold(self):
        for key,value in [('coverage','partial-heap-map-shape-observation'),('contextMapEnumerationComplete',False),('workerDiscoveryAvailable',False),('workerTargets',1),('inspectorClosedConfirmed',False)]:
            report=copy.deepcopy(self.report);report[key]=value
            with self.assertRaises(r.Hold):r.inspector_check(report,pid=1)
        for key in r.ZERO_FIELDS:
            report=copy.deepcopy(self.report);report['counts'][key]=1
            with self.assertRaises(r.Hold):r.inspector_check(report,pid=1)
    def test_idle_and_tmp_content_never_inferred_from_db(self):
        for tmp in (False,True):
            report=copy.deepcopy(self.report);report['counts'].update(sessions=1,tmp=int(tmp));report['sessionObservations']=[{'keyHash':'e'*64,'running':False,'canvasExecuting':False,'tmp':tmp}]
            with self.assertRaisesRegex(r.Hold,'IDLE_SESSION_CONTENT'):r.inspector_check(report,pid=1)
    def test_active_socket_transaction_reference_child_raw_missing_hold(self):
        for key,value in [('socketNonIdle',['ESTAB']),('databaseActiveOrTransactions',[{'state':'idle in transaction'}]),('references',['internal']),('processTree',['node server.js','child']),('rawEvidence',[])]:
            obs=copy.deepcopy(self.obs);obs[key]=value;obs['taskProof']=self.proof
            with self.assertRaises(r.Hold):r.observation_check(obs,self.m,self.root)
    def test_unknown_stop_never_retry_or_kill(self):
        tx=self.tx();tx.fail='stop'
        with self.assertRaisesRegex(r.Hold,'STOP_OUTCOME_UNKNOWN'):self.retire(tx)
        tx.fail=None
        with self.assertRaisesRegex(r.Hold,'EXPLICIT_RECONCILIATION'):self.retire(tx)
        self.assertEqual(sum(c[:2]==['docker','stop'] for c in tx.commands),1);self.assertFalse(any('kill' in c or '--time=0' in c for c in tx.commands))
    def test_task_change_after_stop_hold_and_intent_preserved(self):
        tx=self.tx();calls=[0]
        def proof(*a):
            calls[0]+=1;result=copy.deepcopy(self.proof)
            if calls[0]==3:result['preservationSha256']='e'*64
            return result
        with patch.object(r,'require_lock'),patch.object(r,'fresh_gateway_and_static'),patch.object(r.time,'sleep'),patch.object(r.time,'monotonic_ns',side_effect=[0,31_000_000_000]):
            with self.assertRaisesRegex(r.Hold,'POST_STOP_TASK'):r.retire_one(tx,self.m,self.root,lambda *a:copy.deepcopy(self.obs),proof,lambda *a:self.report_desc,lambda *a:copy.deepcopy(self.obs))
        self.assertTrue((self.root/r.journal_name(self.m,'intent')).is_file());self.assertFalse(tx.row['State']['Running'])
    def test_on_failure_policy_exact_and_start_unknown_no_repeat(self):
        tx=self.tx();tx.row['HostConfig']['RestartPolicy']={'Name':'on-failure','MaximumRetryCount':3};self.retire(tx)
        intent=json.loads((self.root/r.journal_name(self.m,'intent')).read_text());tx.fail='start'
        with patch.object(r,'require_lock'):
            with self.assertRaisesRegex(r.Hold,'RESTORE_OUTCOME_UNKNOWN'):r.restore_one(tx,self.m,intent,lambda *a:{},required_available_mib=2048)
            with self.assertRaisesRegex(r.Hold,'EXPLICIT_RECONCILIATION'):r.restore_one(tx,self.m,intent,lambda *a:{},required_available_mib=2048)
        self.assertEqual(sum(c[:2]==['docker','start'] for c in tx.commands),1)
    def test_restore_runtime_endpoint_change_allowed_config_change_rejected(self):
        for changed in (False,True):
            tx=self.tx();self.retire(tx)
            intent=json.loads((self.root/r.journal_name(self.m,'intent')).read_text())
            tx.row['NetworkSettings']['Networks']['fixture']['EndpointID']='new-runtime-endpoint'
            if changed:tx.row['NetworkSettings']['Networks']['fixture']['Aliases']=['changed-alias']
            with patch.object(r,'require_lock'):
                if changed:
                    with self.assertRaisesRegex(r.Hold,'NETWORK_CONFIGURATION'):r.restore_one(tx,self.m,intent,lambda *a:{},required_available_mib=1024)
                else:
                    result=r.restore_one(tx,self.m,intent,lambda *a:{'health':True,'staticHashVerified':True,'version':self.m['expectedVersion'],'commit':self.m['expectedCommit']},required_available_mib=1024)
                    self.assertTrue(result['networkRuntimeAllocationsChanged'])
            for path in self.root.glob('runtime-ui-*.json'):path.unlink()

    def test_inspector_host_namespace_identity_mismatch_holds(self):
        for key,value in [('hostPid',1),('namespaceTargetPid',100),('auditorSha256','d'*64)]:
            report=copy.deepcopy(self.report);report[key]=value;self.report_desc=self.put('wrong-inspector.json',report)
            tx=self.tx()
            with self.assertRaises(r.Hold):self.retire(tx)
            self.assertFalse(any(c[:2]==['docker','stop'] for c in tx.commands))

    def test_complete_old_static_union_required(self):
        self.m['maintenance']['allOriginalUrls']=[]
        with self.assertRaisesRegex(r.Hold,'FULL_STATIC'):self.retire(self.tx())

    def test_interval_and_exit137_oom_hold(self):
        tx=self.tx()
        with patch.object(r,'require_lock'),patch.object(r,'fresh_gateway_and_static'),patch.object(r.time,'sleep'),patch.object(r.time,'monotonic_ns',side_effect=[0,29_000_000_000]):
            with self.assertRaisesRegex(r.Hold,'INTERVAL'):r.retire_one(tx,self.m,self.root,lambda *a:copy.deepcopy(self.obs),lambda *a:copy.deepcopy(self.proof),lambda *a:self.report_desc,lambda *a:copy.deepcopy(self.obs))
        self.assertFalse(any(c[:2]==['docker','stop'] for c in tx.commands))
        for field,value in [('ExitCode',137),('OOMKilled',True)]:
            tx=self.tx();tx.row['State'][field]=value
            with self.assertRaisesRegex(r.Hold,'GRACEFUL_STOP'):self.retire(tx)
            # The second independent fixture uses another artifact directory.
            for path in self.root.glob('runtime-ui-*.json'):path.unlink()

    def test_original_on_failure_policy_successfully_restored(self):
        tx=self.tx();tx.row['HostConfig']['RestartPolicy']={'Name':'on-failure','MaximumRetryCount':3};self.retire(tx)
        intent=json.loads((self.root/r.journal_name(self.m,'intent')).read_text())
        with patch.object(r,'require_lock'):
            r.restore_one(tx,self.m,intent,lambda *a:{'health':True,'staticHashVerified':True,'version':self.m['expectedVersion'],'commit':self.m['expectedCommit']},required_available_mib=1024)
        self.assertEqual(tx.row['HostConfig']['RestartPolicy'],{'Name':'on-failure','MaximumRetryCount':3})

    @unittest.skipUnless(__import__('os').name=='posix','real HostTransaction kernel locks require Linux')
    def test_actual_host_transaction_all_flock_fds(self):
        import os
        import release47_host as host
        base=Path('/opt/naumi-staging/evidence/runtime-ui-local-lock-fixture')
        machine=Path('/etc/machine-id')
        if not machine.exists() or not machine.read_bytes().strip():machine.write_bytes(b'a'*32+b'\n')
        machine_sha=host.sha(machine.read_bytes().strip())
        with tempfile.TemporaryDirectory() as temp:
            locks=[str(Path(temp)/'first.lock'),str(Path(temp)/'second.lock')]
            transaction=host.HostTransaction('103.30.76.93',machine_sha,base)
            transaction.spec={'locks':locks}
            manifest=dict(self.m,hostIdentitySha256=machine_sha)
            with transaction:
                r.require_lock(transaction,manifest)
                original=transaction.lock_fds[:]
                transaction.lock_fds=original[:1]
                with self.assertRaisesRegex(r.Hold,'WHOLE_TRANSACTION'):r.require_lock(transaction,manifest)
                transaction.lock_fds=original
            with self.assertRaises(r.Hold):r.require_lock(transaction,manifest)

    def test_actual_lock_primitive_rejects_forged_object(self):
        with self.assertRaises(r.Hold):r.require_lock(type('Tx',(),{'stack':None})(),self.m)

if __name__=='__main__':unittest.main()

