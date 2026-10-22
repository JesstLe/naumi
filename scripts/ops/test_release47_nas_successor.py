import copy,unittest
from unittest.mock import patch
import release47_task_snapshot as tasks
from release47_nas_successor import predecessor_check,AUTHORIZATION,memory_growth_budget,reviewed_reservations
from release47_host import Hold

class NasPredecessor(unittest.TestCase):
 def test_settlement_review_only_accepts_decoded_once_charged_exact_jobs(self):
  rows=[{'id':str(i),'_preservationProof':True,'_frozenDigest':'a'*64,'snapshot':{'status':'error','paidOperations':{}},'billing_settled':False,'reserved_cost':6}for i in range(4)]
  after=copy.deepcopy(rows)
  for r in after:r['snapshot']['status']='done';r['billing_settled']=True
  before={'tables':{'app_image_jobs':{'rows':rows}}};later={'tables':{'app_image_jobs':{'rows':after}}}
  proof=[{'id':str(i),'imagesDecoded':True,'images':[{'bytes':1234,'width':64,'height':64}],'billingSettled':True,'ledgerCount':1,'charged':6,'reservationCount':0}for i in range(4)]
  base={'violations':[{'table':'app_gen_reservations','identitySha256':tasks.sha(['app_gen_reservations',str(i)]),'reason':'PRESERVED_ROW_MISSING'}for i in range(4)],'unknownTables':[]}
  with patch.object(tasks,'compare_task_snapshots',return_value=base):
   self.assertTrue(reviewed_reservations(before,later,proof)['preservationVerified'])
   bad=copy.deepcopy(proof);bad[0]['charged']=12
   with self.assertRaises(Hold):reviewed_reservations(before,later,bad)
   base['violations'].append({'table':'app_image_jobs','reason':'PRESERVED_ROW_MISSING','identitySha256':'b'*64})
   self.assertFalse(reviewed_reservations(before,later,proof)['preservationVerified'])
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
