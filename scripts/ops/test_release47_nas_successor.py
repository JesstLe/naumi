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

if __name__=='__main__':unittest.main()
