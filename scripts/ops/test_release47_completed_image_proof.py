import unittest,copy
from unittest.mock import patch
import release47_completed_image_proof as m
class Proof(unittest.TestCase):
 def setUp(self):
  self.id='job-fixture';old={'id':self.id,'snapshot':{'status':'pending','paidOperations':{'x':{'model':'m'}}},'payload':{'p':1},'reserved_cost':8};new={**old,'snapshot':{'status':'done','paidOperations':{}},'billing_settled':True,'lease_token':None}
  self.a={'tables':{'app_image_jobs':{'rows':[old]},'app_gen_reservations':{'rows':[{'job_id':self.id}]},'app_supplier_calls':{'rows':[]},'app_billing_operations':{'rows':[]}}};self.b=copy.deepcopy(self.a);self.b['tables']['app_image_jobs']['rows']=[new];self.b['tables']['app_gen_reservations']['rows']=[]
  self.p={'id':self.id,'imagesDecoded':True,'artworksExist':True,'billingSettled':True,'ledgerCount':1,'charged':8,'reservationCount':0}
  self.result={'violations':[{'table':'app_image_jobs','identitySha256':m.tasks.sha(['app_image_jobs',self.id]),'reason':'ORIGINAL_SUPPLIER_BINDING_CHANGED'},{'table':'app_gen_reservations','identitySha256':m.tasks.sha(['app_gen_reservations',self.id]),'reason':'PRESERVED_ROW_MISSING'}],'unknownTables':[]}
 def test_complete(self):
  with patch.object(m.tasks,'compare_task_snapshots',lambda *_:self.result):
   r=m.reviewed_completion(self.a,self.b,[self.p]);self.assertTrue(r['preservationVerified']);self.assertEqual(len(r['originalViolations']),2)
 def test_bad_evidence(self):
  for k,v in [('imagesDecoded',False),('artworksExist',False),('ledgerCount',2),('charged',9),('reservationCount',1)]:
   with patch.object(m.tasks,'compare_task_snapshots',lambda *_:self.result):
    with self.assertRaises(Exception):m.reviewed_completion(self.a,self.b,[{**self.p,k:v}])
 def test_unrelated_loss_still_blocks(self):
  self.result['violations'].append({'table':'app_image_jobs','identitySha256':'other','reason':'PRESERVED_ROW_MISSING'})
  with patch.object(m.tasks,'compare_task_snapshots',lambda *_:self.result):self.assertFalse(m.reviewed_completion(self.a,self.b,[self.p])['preservationVerified'])
if __name__=='__main__':unittest.main()
