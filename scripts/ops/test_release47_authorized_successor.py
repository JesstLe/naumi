import copy
import datetime as dt
import unittest
from unittest.mock import patch
import release47_authorized_successor as m
from release47_host import Hold


class IncidentContinuation(unittest.TestCase):
    def setUp(self):
        self.auth = dict(target=m.TARGET,date='2026-10-18',acknowledgement=m.ACK,
                         restoreDatabase=False,replayAcceptedTasks=False,
                         historicalDrainReclassified=False,paidOutputRecovered=False)
        self.rows=[dict(id=m.PAID_ACTIVITY,state='unknown',activity_kind='accepted-work',work_scope='durable-image',
                        work_key='generate:'+m.PAID_JOB,outcome='owner-terminated:paid-output-not-durable-held'),
                   dict(id=m.SCAN_ACTIVITY,state='unknown',activity_kind='accepted-work',work_scope='supplier-scan',
                        work_key='supplier-cost-scan',outcome='background-promise-unconfirmed',claim_token=None)]
        self.held=dict(id=m.PAID_JOB,status='needs_attention',paid_state='started',billing_state='hold',
                       billing_settled=False,ledger_count=0,images_count=0,live_lease=False)
        self.digest=m.check_incidents(self.rows,self.held)
        self.app=dict(transport=dict(verified=True,transport=dict(completeFromProcessStart=True,accountingFault=False,
                          activeRequests=0,startedRequests=5,finishedRequests=5)),admission=dict(mode='draining'),
                      observations=dict(activeRequests=0,trackedRequests=0,trackedAcceptedWork=0,agentRuns=0,unknownLeases=2))
        self.domain=dict(drained=True,absentTables=[],counts=dict(imageJobs=0,canvasImages=0,videoPolls=0,supplierCosts=0,imagegenItems=0),activeFences=0,activeTransactions=0,advisoryLocks=0)
        self.worker=dict(paused=True,activeTicks=0,unresolvedTicks=0,phase='QUIESCENT',lastTick=dict(phase='complete'))

    def test_authorization_not_generic_go(self):
        m.authorization(self.auth,dt.datetime(2026,10,18,tzinfo=dt.timezone.utc))
        self.auth['acknowledgement']='上线'
        with self.assertRaises(Hold):m.authorization(self.auth)

    def test_expired_authorization(self):
        with self.assertRaises(Hold):m.authorization(self.auth,dt.datetime(2026,10,19,tzinfo=dt.timezone.utc))

    def test_incident_set_cannot_be_extended(self):
        with self.assertRaises(Hold):m.check_incidents(self.rows+[self.rows[0]],self.held)

    def test_paid_and_unknown_unchanged(self):
        for key,value in [('status','done'),('paid_state','done'),('ledger_count',1),('images_count',1),('billing_state','settled'),('live_lease',True)]:
            v={**self.held,key:value}
            with self.assertRaises(Hold):m.check_incidents(self.rows,v)

    def test_exact_frozen_bytes(self):
        self.held['snapshot_sha256']='changed'
        with self.assertRaisesRegex(Hold,'BYTES_CHANGED'):m.check_incidents(self.rows,self.held,self.digest)

    def test_current_drain_is_not_historical_complete(self):
        original=copy.deepcopy(self.rows)
        r=m.current_execution_drained(self.app,self.domain,self.worker,[{'state':'idle'}],self.rows,self.held,self.digest)
        self.assertFalse(r['historicalDrainProven']);self.assertFalse(r['paidOutputRecovered']);self.assertEqual(self.rows,original)

    def test_new_work_or_unknown_still_blocks(self):
        for key,value in [('agentRuns',1),('trackedAcceptedWork',1),('unknownLeases',3),('activeRequests',None)]:
            app=copy.deepcopy(self.app);app['observations'][key]=value
            with self.assertRaises(Hold):m.current_execution_drained(app,self.domain,self.worker,[],self.rows,self.held,self.digest)
        for key,value in [('activeFences',1),('advisoryLocks',1),('activeTransactions',1),('drained',False)]:
            with self.assertRaises(Hold):m.current_execution_drained(self.app,{**self.domain,key:value},self.worker,[],self.rows,self.held,self.digest)
        with self.assertRaises(Hold):m.current_execution_drained(self.app,self.domain,self.worker,[{'state':'running'}],self.rows,self.held,self.digest)

    def test_worker_unknown_blocks(self):
        for key,value in [('unresolvedTicks',1),('paused',False),('activeTicks',1),('phase','UNKNOWN')]:
            with self.assertRaises(Hold):m.current_execution_drained(self.app,self.domain,{**self.worker,key:value},[],self.rows,self.held,self.digest)

    def test_preserve_original_canonical_not_relabel_complete(self):
        s=dict(target=m.TARGET,releaseId=m.HISTORICAL_RELEASE,phase='MIGRATED_CLEANUP_PENDING',legacyDrainProven=False,operations={},runtimeRecovery={'phase':'ACKNOWLEDGED'})
        original=copy.deepcopy(s);archive={'path':'/opt/naumi-staging/evidence/test/original.json','sha256':m.sha(m.encoded(s))}
        with patch.object(m,'authorization'):
            r=m.begin(s,self.auth,successor_id='new',incident_digest=self.digest,archive=archive)
        self.assertEqual(s,original);self.assertEqual(r['predecessorPhase'],'MIGRATED_CLEANUP_PENDING')


if __name__=='__main__':unittest.main()
