#!/usr/bin/env python3
"""Finite offline fixtures; no real Docker stop or production collector claims."""
import copy
import datetime
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_legacy_ui_retirement as r


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.pin={'id':'a'*64,'image':'sha256:'+'b'*64,'name':'fixture-readonly-ui','startedAt':'2026-10-16T00:00:00Z'}
        self.raw={'Id':self.pin['id'],'Image':self.pin['image'],'Name':'/'+self.pin['name'],'State':{'StartedAt':self.pin['startedAt'],'Running':True,'Paused':False,'OOMKilled':False,'ExitCode':0},'Config':{'Cmd':['node','server.js'],'Env':['NAUMI_VIDEO_WORKER=0']},'Mounts':[],'HostConfig':{'PortBindings':{'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'13999'}]},'RestartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0}},'NetworkSettings':{'Networks':{'fixture':{'IPAddress':'127.0.0.2','Aliases':[]}}}}
        self.gateway=b'fixture-maintenance-nginx-T';self.static=b'old static exact'
        static=self.put('static/a.js',self.static)
        self.manifest={'schemaVersion':1,'target':'103.30.76.93','hostIdentitySha256':'c'*64,'identity':self.pin,'immutableSha256':r.immutable(self.raw),'networkSha256':r.network_binding(self.raw),'authorization':{'kind':'explicit-one-time-maintenance-retirement','containerId':self.pin['id'],'userRequestSha256':'d'*64,'expiresAt':'2099-01-01T00:00:00Z'},'legacyCoverage':'partial-nonpersisted-observation','ordinaryDrainReceipt':None,'maintenance':{'dumpSha256':r.digest(self.gateway),'report':self.put('gateway.json',{'kind':'103-maintenance-gateway','runtimeTopology':'unified-web-three-ui'}),'allOriginalUrls':['/_next/static/a.js'],'staticAssets':[{'url':'/_next/static/a.js','file':static,'installedPath':'/var/www/fixture/_next/static/a.js'}]},'expectedCommit':'e'*40,'expectedVersion':'1790000000'}
        self.manifest['maintenance']['originalStaticManifest']=self.put('original-static-manifest.json',{'assets':[{'url':'/_next/static/a.js','sha256':r.digest(self.static)}]})
        route=self.put('routes.json',{'containerId':self.pin['id'],'onlyReviewedReadMethods':True,'unsafeApiRoutes':[],'originalDeploymentRecords':[self.put('creation-record.txt',b'fixture creation allowlist')]})
        ingress=self.put('ingress.json',{'defaultDeny':True,'onlyIngress':['reviewed-nginx'],'otherNetworkCallers':[],'directHostAccess':'enforced-deny','enforcedPolicyBytes':self.put('network-policy.txt',b'default-deny GET HEAD')})
        source=self.put('source.json',{'image':self.pin['image'],'videoTimerDisabled':True,'otherAutonomousTimers':[],'agentOrTaskStartupPaths':[],'actualAppPathsManifest':self.put('app-paths.json',{'/page':'app/page.js','/api/health/route':'app/api/health/route.js'}),'actualServerActionsManifest':self.put('actions.json',{'node':{},'edge':{}}),'moduleGraphCoverage':'entire-executable-startup-and-route-closure','unresolvedDynamicImports':[],'moduleFiles':[self.put('entry.js',b'export function readOnly(){return 1;}')]})
        self.manifest['roleEvidence']=self.put('role.json',{'containerId':self.pin['id'],'image':self.pin['image'],'observedThrough':'2026-10-16T01:00:31Z','epochs':[{'from':self.pin['startedAt'],'to':'2026-10-16T01:00:31Z','routeAllowlist':route,'ingressPolicy':ingress,'sourceTimerAudit':source}]})
        self.proof={'coverage':'complete-persisted-ownership','targetOwnedAcceptedTasks':[],'targetOwnedAgentSessions':[],'unknownOwnership':[],'preservationSha256':'f'*64}
        self.obs={'observedAt':'2026-10-16T01:00:31Z','identity':self.pin,'immutableSha256':r.immutable(self.raw),'networkSha256':r.network_binding(self.raw),'maintenanceDumpSha256':r.digest(self.gateway),'staticHashesVerified':True,'cmd':['node','server.js'],'videoWorker':'0','sourceTimersMatch':True,'processTree':['node server.js'],'socketNonIdle':[],'socketCoverage':'all-target-network-namespace','databaseCoverage':'all-target-container-ips-and-application-identities','databaseActiveOrTransactions':[],'referenceCoverage':'all-docker-effective-systemd-internal-configs','references':[],'taskProof':self.proof,'rawEvidence':[self.put('observation-raw.json',{'fixture':True})]}
        self.observations=[dict(self.obs,monotonicNs=0),dict(self.obs,monotonicNs=31_000_000_000)]

    def tearDown(self):self.tmp.cleanup()

    def put(self,name,value):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);raw=value if isinstance(value,bytes) else json.dumps(value).encode();p.write_bytes(raw)
        return {'path':name,'sha256':r.digest(raw)}

    def test_documents_only_and_unknown_ownership_hold_no_fake_drain(self):
        m=copy.deepcopy(self.manifest);m.pop('roleEvidence')
        result=r.audit(m,self.observations,self.root)
        self.assertEqual(result['status'],'HOLD');self.assertIn('UNPROVEN_VOLATILE_WORK',result['reasons']);self.assertIsNone(result['ordinaryDrainReceipt'])
        obs=copy.deepcopy(self.observations);obs[1]['taskProof']['unknownOwnership']=['existing-task']
        self.assertIn('UNPROVEN_VOLATILE_WORK',r.audit(self.manifest,obs,self.root)['reasons'])

    def test_actual_full_next_agent_api_rejects_role_declaration(self):
        self.put('app-paths.json',{'/api/agent/route':'agent.js'})
        self.assertEqual(r.audit(self.manifest,self.observations,self.root)['status'],'HOLD')

    def test_interval_gateway_db_socket_process_reference_negative_cases(self):
        for key,value in [('monotonicNs',29_000_000_000),('maintenanceDumpSha256','wrong'),('socketNonIdle',['ESTAB']),('databaseActiveOrTransactions',[{'state':'idle in transaction'}]),('processTree',['node server.js','node agent']),('references',['other-container-env']),('rawEvidence',[])]:
            obs=copy.deepcopy(self.observations);obs[1][key]=value
            self.assertEqual(r.audit(self.manifest,obs,self.root)['status'],'HOLD',key)

    def test_complete_synthetic_readonly_fixture_eligible_not_real_drain(self):
        result=r.audit(self.manifest,self.observations,self.root)
        self.assertEqual(result['status'],'ELIGIBLE_FOR_EXPLICIT_MAINTENANCE_RETIREMENT',result)
        self.assertEqual(result['legacyCoverage'],'partial-nonpersisted-observation');self.assertIsNone(result['ordinaryDrainReceipt'])

    def tx(self):
        fixture=self
        class Tx:
            def __init__(self):self.stack=True;self.target=fixture.manifest['target'];self.folder=fixture.root;self.lock_fds=[1];self.row=copy.deepcopy(fixture.raw);self.commands=[]
            def inspect(self,cid):assert cid==fixture.pin['id'];return copy.deepcopy(self.row)
            def save(self,name,value):return fixture.put(name,value)
            def run(self,args,**kw):
                self.commands.append(args)
                if args==['nginx','-T']:return fixture.gateway
                if args[:2]==['cat','--']:return fixture.static
                if args[:2]==['python3','-c']:return b'INSTALLED_STATIC=PASS COUNT=1\n'
                if args==['cat','/proc/meminfo']:return b'MemAvailable: 4000000 kB\nSwapFree: 0 kB\nSwapTotal: 1000 kB\n'
                if args[:2]==['docker','update']:self.row['HostConfig']['RestartPolicy']['Name']=args[2].split('=',1)[1];return b''
                if args[:2]==['docker','stop']:
                    assert args[2]=='--time=-1';self.row['State']['Running']=False;return b''
                if args[:2]==['docker','start']:self.row['State']['Running']=True;return b''
                raise AssertionError(args)
        return Tx()

    def test_explicit_single_stop_and_single_original_cid_restore_fixture(self):
        tx=self.tx()
        with patch.object(r,'require_lock'),patch.object(r.time,'sleep'),patch.object(r.time,'monotonic_ns',side_effect=[0,31_000_000_000]):
            result=r.retire_one(tx,self.manifest,self.root,lambda *a:copy.deepcopy(self.obs),lambda *a:copy.deepcopy(self.proof))
        self.assertTrue(result['stopped']);self.assertEqual(sum(c[:2]==['docker','stop'] for c in tx.commands),1)
        intent=json.loads((self.root/('legacy-retire-intent-'+self.pin['id'][:12]+'.json')).read_text())
        with patch.object(r,'require_lock'):
            restored=r.restore_one(tx,self.manifest,intent,lambda *a:{'version':self.manifest['expectedVersion'],'commit':self.manifest['expectedCommit'],'health':True,'staticHashVerified':True},required_available_mib=2048)
        self.assertTrue(restored['restored']);self.assertFalse(restored['originalGatewayReloaded']);self.assertEqual(tx.row['HostConfig']['RestartPolicy']['Name'],'unless-stopped')
        self.assertFalse(any('rm' in cmd or '-f' in cmd for cmd in tx.commands))

    def test_unproven_never_mutates_and_no_real_lock_rejects(self):
        tx=self.tx();m=copy.deepcopy(self.manifest);m.pop('roleEvidence')
        with patch.object(r,'require_lock'),patch.object(r.time,'sleep'),patch.object(r.time,'monotonic_ns',side_effect=[0,31_000_000_000]):
            with self.assertRaises(r.RetirementHold):r.retire_one(tx,m,self.root,lambda *a:copy.deepcopy(self.obs),lambda *a:copy.deepcopy(self.proof))
        self.assertFalse(any(cmd[0]=='docker' for cmd in tx.commands))
        with self.assertRaises(r.RetirementHold):r.require_lock(type('Tx',(),{'stack':None})(),self.manifest)


if __name__=='__main__':unittest.main()
