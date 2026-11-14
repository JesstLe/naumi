import copy
import unittest
from video_release_lifecycle_fixture import fixture_drain_counts

def sample():
 return [dict(transport={'verified':True,'transport':{'completeFromProcessStart':True,'accountingFault':False,'activeRequests':0,'startedRequests':4,'finishedRequests':4}},admission={'mode':'draining'},observations=dict.fromkeys(['trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases'],0),coverage={'allAgentExecutions':False}),dict(drained=True,absentTables=[],counts=dict.fromkeys(['imageJobs','canvasImages','videoPolls','supplierCosts','imagegenItems'],0),activeFences=0,activeTransactions=0,advisoryLocks=0),dict(paused=True,activeTicks=0,unresolvedTicks=0,phase='QUIESCENT',mediaWorker={'ok':True,'draining':True,'running':0,'queued':0}),[{'state':'idle'}]]

class Drain(unittest.TestCase):
 def test_closed_world_receipts_keep_source_and_partial_coverage(self):
  values=sample();before=copy.deepcopy(values);out=fixture_drain_counts(*values);self.assertEqual(values,before);self.assertFalse(values[0]['coverage']['allAgentExecutions']);self.assertEqual({k:v for k,v in out.items() if k!='observedAt'},dict.fromkeys(['connections','agentSessions','acceptedTasks','workerLeases','newAdmissions'],0))
 def test_missing_unknown_active_boolean_and_string_never_zero(self):
  for key in ['trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases']:
   for bad in [None,False,'0',1]:
    with self.subTest(key=key,bad=bad):
     values=sample();values[0]['observations'][key]=bad
     with self.assertRaises(AssertionError):fixture_drain_counts(*values)
 def test_http_fault_and_incomplete_accounting(self):
  for key,bad in [('completeFromProcessStart',False),('accountingFault',True),('activeRequests',1),('activeRequests',False),('finishedRequests',3)]:
   values=sample();values[0]['transport']['transport'][key]=bad
   with self.assertRaises(AssertionError):fixture_drain_counts(*values)
 def test_database_unknown_and_absent_table(self):
  for key,bad in [('drained',False),('absentTables',['app_video_tasks']),('activeFences',None),('activeTransactions',1),('advisoryLocks','0')]:
   values=sample();values[1][key]=bad
   with self.assertRaises(AssertionError):fixture_drain_counts(*values)
 def test_database_counts_must_be_complete_true_integers(self):
  for change in ['missing','unknown','boolean']:
   values=sample()
   if change=='missing':del values[1]['counts']['videoPolls']
   else:values[1]['counts']['videoPolls']=None if change=='unknown' else False
   with self.assertRaises(AssertionError):fixture_drain_counts(*values)
 def test_worker_unresolved_tick_and_media_queue(self):
  for key,bad in [('paused',False),('activeTicks',None),('unresolvedTicks',1),('phase','UNKNOWN'),('controlFault','unknown')]:
   values=sample();values[2][key]=bad
   with self.assertRaises(AssertionError):fixture_drain_counts(*values)
  for key,bad in [('ok',False),('draining',False),('running',1),('queued',None)]:
   values=sample();values[2]['mediaWorker'][key]=bad
   with self.assertRaises(AssertionError):fixture_drain_counts(*values)
 def test_active_unknown_owners_and_open_admission(self):
  for state in ['running','unknown']:
   values=sample();values[3][0]['state']=state
   with self.assertRaises(AssertionError):fixture_drain_counts(*values)
  values=sample();values[0]['admission']['mode']='open'
  with self.assertRaises(AssertionError):fixture_drain_counts(*values)

if __name__=='__main__':unittest.main()
