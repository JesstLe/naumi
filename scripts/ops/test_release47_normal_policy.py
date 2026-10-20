import copy,datetime as dt,json,pathlib,tempfile,unittest
from unittest.mock import patch
import release47_normal_policy as m
import release47_normal_controller as ctl
import release47_normal_rollback as rb
from test_release47_authorized_successor import IncidentContinuation
from release47_host import Hold,sha
from release47_recovery_supervisor import encoded

class NormalPolicy(unittest.TestCase):
 def setUp(self):
  self.s=dict(target='47.105.59.142',revision=74,releaseId='release47-window-20261016-main7bd',phase='MIGRATED_CLEANUP_PENDING',legacyDrainProven=False,operations={},runtimeRecovery=dict(phase='ACKNOWLEDGED',successorReleaseId='release47-alldev-20261018'),blueGreenSuccessor=dict(phase='COMPLETE',releaseId='release47-alldev-20261018'))
  self.cfg=dict(target=self.s['target'],authorization='合并所有分支，然后上线服务器，退役旧容器',date='2026-10-19',restoreDatabase=False,replayAcceptedTasks=False,activateDisabledModels=False,releaseId='release47-alldev-20261019',expectedRevision=74,expectedCanonicalDigest=sha(encoded(self.s)),predecessorReleaseId='release47-alldev-20261018')
  self.fixture=IncidentContinuation();self.fixture.setUp()
 def begin(self):
  self.cfg['expectedCanonicalDigest']=sha(encoded(self.s));return m.begin(self.s,self.cfg,dict(path='/opt/naumi-staging/evidence/test/original.json',sha256=sha(encoded(self.s))),self.fixture.digest,dt.datetime(2026,10,19,tzinfo=dt.timezone.utc))
 def drain(self,**kw):
  f=self.fixture;a=copy.deepcopy(f.app);a['observations']['unknownLeases']=0
  return m.current_drained(kw.get('app',a),kw.get('domain',f.domain),kw.get('worker',f.worker),kw.get('owners',[]),kw.get('rows',f.rows),kw.get('held',f.held),f.digest)
 def test_begin_preserves_historical_state(self):
  old=copy.deepcopy(self.s);r=self.begin();self.assertEqual(old,self.s);self.assertEqual(r['phase'],'BASELINED');self.assertFalse(r['paidOutputRecovered'])
 def test_authorization_and_non_replay(self):
  for k,v in [('target','103.30.76.93'),('date','2026-10-15'),('restoreDatabase',True),('replayAcceptedTasks',True),('activateDisabledModels',True),('authorization','继续'),('expectedRevision',73),('releaseId','other')]:
   old=self.cfg[k];self.cfg[k]=v
   with self.subTest(k=k),self.assertRaises(Hold):self.begin()
   self.cfg[k]=old
 def test_current_merge_and_deploy_authorization(self):
  self.cfg['authorization']='合并分支，上线服务器'
  self.assertEqual(self.begin()['authorization'],'合并分支，上线服务器')
 def test_normal_followup_allowed(self):
  rid='release47-alldev-20261019-previous';self.s['normalBlueGreenReleases']={rid:dict(releaseId=rid,phase='COMPLETE',operations={})};self.s['activeNormalBlueGreenReleaseId']=rid;self.s['runtimeRecovery']['successorReleaseId']=rid;self.cfg['predecessorReleaseId']=rid
  self.assertEqual(self.begin()['predecessorReleaseId'],rid)
 def test_release_first_authorization(self):
  self.cfg['authorization']='你先上线一次服务器，然后再进行接下来的修复和优化'
  self.assertEqual(self.begin()['authorization'],self.cfg['authorization'])
 def test_duplicate_and_incomplete_release_block(self):
  for phase in ['READY','SWITCHED','UNKNOWN']:
   self.s['normalBlueGreenReleases']={'earlier':dict(phase=phase,operations={})}
   with self.subTest(phase=phase),self.assertRaises(Hold):self.begin()
  self.s['normalBlueGreenReleases']={self.cfg['releaseId']:dict(phase='COMPLETE',operations={})}
  with self.assertRaises(Hold):self.begin()
 def test_unresolved_prior_operation_blocks(self):
  for field in ['operations','normalBlueGreenReleases']:
   self.s[field]={'earlier':dict(phase='UNKNOWN')}
   with self.assertRaises(Hold):self.begin()
   self.s[field]={}
 def test_historical_flags_cannot_close(self):
  for key,val in [('phase','COMPLETE'),('legacyDrainProven',True)]:
   old=self.s[key];self.s[key]=val
   with self.assertRaises(Hold):self.begin()
   self.s[key]=old
 def test_current_drain_unknown_zero_not_legacy_two(self):
  self.assertTrue(self.drain()['currentExecutableWorkDrained'])
  with self.assertRaises(Hold):self.drain(app=self.fixture.app)
 def test_every_current_observation_blocks(self):
  for key in self.fixture.app['observations']:
   a=copy.deepcopy(self.fixture.app);a['observations']['unknownLeases']=0;a['observations'][key]=1
   with self.subTest(key=key),self.assertRaises(Hold):self.drain(app=a)
 def test_every_domain_counter_blocks(self):
  for key in self.fixture.domain['counts']:
   d=copy.deepcopy(self.fixture.domain);d['counts'][key]=1
   with self.subTest(key=key),self.assertRaises(Hold):self.drain(domain=d)
 def test_worker_and_owner_unknown_block(self):
  with self.assertRaises(Hold):self.drain(worker={**self.fixture.worker,'unresolvedTicks':1})
  with self.assertRaises(Hold):self.drain(owners=[{'state':'running'}])
 def test_historical_evidence_must_be_exact(self):
  with self.assertRaises(Hold):self.drain(rows=[])
  with self.assertRaises(Hold):self.drain(held={**self.fixture.held,'job_sha256':'changed'})
 def test_unknown_operation_original_id_persisted(self):
  c=object.__new__(ctl.Controller);c.succ={'operations':{}};c.persist=lambda:None
  def fail(op):raise TimeoutError('fixture')
  with self.assertRaises(TimeoutError):c.op('fixture',fail)
  first=copy.deepcopy(c.succ['operations']['fixture']);self.assertEqual(first['phase'],'UNKNOWN')
  with self.assertRaises(Hold):c.op('fixture',lambda op:{})
  self.assertEqual(c.succ['operations']['fixture'],first)
 def test_billing_real_schema_fields(self):
  c=object.__new__(ctl.Controller);c.sql=lambda q:q;q=c.configuration_facts();self.assertIn('t.k',q);self.assertNotIn('t.key',q);self.assertIn('app_billing_config_versions',q)
 def test_rollback_historical_successor_immutable(self):
  s=pathlib.Path(rb.__file__).read_text();self.assertNotIn("s['blueGreenSuccessor'].update",s);self.assertIn("s['normalBlueGreenReleases'][config['releaseId']]",s)
 def test_no_old_port_or_consumed_controller(self):
  s=pathlib.Path(ctl.__file__).read_text();self.assertNotIn("'13101'",s);self.assertNotIn('release47_successor_controller',s);self.assertIn('unknownLeases\']==0',s)
class WorkerReceipt(unittest.TestCase):
 def test_missing_first_tick_waits(self):
  self.assertFalse(m.worker_completed({'lastTick':None,'unresolvedTicks':0}))
  self.assertFalse(m.worker_completed({'unresolvedTicks':0}))
  self.assertFalse(m.worker_completed({'lastTick':{'phase':'unknown'},'unresolvedTicks':1}))
  self.assertTrue(m.worker_completed({'lastTick':{'phase':'complete'},'unresolvedTicks':0}))
class SnapshotBudget(unittest.TestCase):
 def test_default_and_bounded_override(self):
  import release47_task_snapshot as t
  self.assertIn(b"statement_timeout='5000ms'",t.build_sql())
  self.assertIn(b"statement_timeout='15000ms'",t.build_sql(statement_timeout_ms=15000))
  for value in [0,15001,True,'15000']:
   with self.assertRaises(ValueError):t.build_sql(statement_timeout_ms=value)
if __name__=='__main__':unittest.main()
