import copy,unittest
from release47_nas_successor import predecessor_check,AUTHORIZATION,memory_growth_budget
from release47_host import Hold

class NasPredecessor(unittest.TestCase):
 def test_final_memory_requires_real_reserve(self):
  self.assertEqual(memory_growth_budget(4096,1200,3072)['finalMiB'],3072)
  with self.assertRaises(Hold):memory_growth_budget(1800,1200,3072)
  with self.assertRaises(Hold):memory_growth_budget(4096,1200,4096)
 def test_complete_publication_keeps_historical_incidents(self):
  state={'activeNormalBlueGreenReleaseId':'prior','normalBlueGreenReleases':{'prior':{'phase':'COMPLETE','operations':{}}},
    'phase':'MIGRATED_CLEANUP_PENDING','legacyDrainProven':False}
  old=copy.deepcopy(state)
  predecessor_check(state,{'authorization':AUTHORIZATION,'predecessorReleaseId':'prior'})
  self.assertEqual(state,old)
  for phase in ['CLEANUP_PENDING','UNKNOWN','READY','ROLLED_BACK']:
   state['normalBlueGreenReleases']['prior']['phase']=phase
   with self.assertRaises(Hold):predecessor_check(state,{'authorization':AUTHORIZATION,'predecessorReleaseId':'prior'})
 def test_unknown_operation_cannot_be_carried_as_old_incident(self):
  state={'activeNormalBlueGreenReleaseId':'prior','normalBlueGreenReleases':{'prior':{'phase':'COMPLETE','operations':{'x':{'phase':'UNKNOWN'}}}},
    'phase':'MIGRATED_CLEANUP_PENDING','legacyDrainProven':False}
  with self.assertRaises(Hold):predecessor_check(state,{'authorization':AUTHORIZATION,'predecessorReleaseId':'prior'})
 def test_standby_auth_resume_keeps_unknown_operation_gate(self):
  state={'activeNormalBlueGreenReleaseId':'prior','normalBlueGreenReleases':{
   'prior':{'phase':'COMPLETE','operations':{}},
   'current':{'phase':'CANDIDATE','lastError':'RECOVERY_HTTP_CHECK_FAILED','operations':{'create':{'phase':'ACKNOWLEDGED'}}}},
   'phase':'MIGRATED_CLEANUP_PENDING','legacyDrainProven':False}
  cfg={'authorization':AUTHORIZATION,'predecessorReleaseId':'prior','releaseId':'current','resumeReview':{'revision':9}}
  predecessor_check(state,cfg)
  state['normalBlueGreenReleases']['current']['operations']['create']['phase']='UNKNOWN'
  with self.assertRaises(Hold):predecessor_check(state,cfg)

if __name__=='__main__':unittest.main()
