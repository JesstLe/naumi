import copy,unittest
from release47_host import Hold
from release47_quarantine_dead_boot import quarantined_snapshot
class Isolation(unittest.TestCase):
 def test_exact_paid_result_retained(self):
  for state in ['started','done']:
   s={'status':'pending','paidOperations':{'job-a':{'state':state,'replayable':False,'result':[{'url':'data:image/png;base64,test'}]}},'images':[],'prompt':'original'}
   old=copy.deepcopy(s);r=quarantined_snapshot(s,'release47-resolution-20261020')
   self.assertEqual(s,old);self.assertEqual(r['paidOperations'],s['paidOperations']);self.assertEqual(r['status'],'needs_attention');self.assertFalse(r['releaseQuarantine']['retryAllowed'])
 def test_reject_other_states_and_images(self):
  for status,images in [('done',[]),('error',[]),('needs_attention',[]),('pending',[{'url':'/media/result.png'}])]:
   with self.subTest(status=status),self.assertRaises(Hold):quarantined_snapshot({'status':status,'images':images,'paidOperations':{'job':{'state':'started'}}},'release47-test')
 def test_unknown_paid_shape_is_not_overwritten(self):
  for attempts in [{},{'j':{'state':'rejected'}},{'j':{'state':'started'},'k':{'state':'done'}}]:
   with self.assertRaises(Hold):quarantined_snapshot({'status':'pending','paidOperations':attempts},'release47-test')
if __name__=='__main__':unittest.main()
