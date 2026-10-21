import unittest,copy
from unittest.mock import patch
import release47_image_delivery_successor as mod

class Drain(unittest.TestCase):
 def test_only_owned_new_image_fences_excluded(self):
  for unowned,transactions,expect in [(0,0,True),(1,0,False),(0,1,False)]:
   op=mod.ImageDeliveryController.__new__(mod.ImageDeliveryController);op.web={'name':'old'};op.newweb={'name':'new'};op.worker={};op.cfg={'newWebName':'new','commit':'a'*40};op.incident_digest='x'
   raw={'counts':{'imageJobs':2,'canvasImages':0,'videoPolls':0,'supplierCosts':0,'imagegenItems':0},'activeFences':2,'activeTransactions':transactions,'advisoryLocks':0,'drained':False}
   op.request=lambda *_:copy.deepcopy(raw);op.worker_control=lambda *_:{'state':{}};op.incidents=lambda:([],[]);op.owners=lambda:[];op.sql=lambda q:[{'total':2,'unowned':unowned}]
   def status(tx,web):return {'identity':{'instanceId':'new','bootId':'b','commit':'a'*40}}
   op.tx=None
   with patch.object(mod.controls,'app_status',status),patch.object(mod.normal,'current_drained',lambda a,d,*args:d):
    result=op.drain_proof();self.assertEqual(result['drained'],expect);self.assertEqual(result['activeTransactions'],transactions)
   self.assertEqual(raw['counts']['imageJobs'],2)
 def test_other_domains_never_excluded(self):
  op=mod.ImageDeliveryController.__new__(mod.ImageDeliveryController);op.web={};op.newweb={};op.worker={};op.cfg={};op.tx=None;op.incident_digest='x'
  raw={'counts':{'imageJobs':0,'canvasImages':1},'activeFences':1,'activeTransactions':0,'advisoryLocks':0,'drained':False}
  op.request=lambda *_:copy.deepcopy(raw);op.worker_control=lambda *_:{'state':{}};op.incidents=lambda:([],[]);op.owners=lambda:[]
  with patch.object(mod.controls,'app_status',lambda *_:{}),patch.object(mod.normal,'current_drained',lambda a,d,*args:d):self.assertEqual(op.drain_proof(),raw)
if __name__=='__main__':unittest.main()
