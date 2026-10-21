import unittest,tempfile,pathlib,json
from unittest.mock import patch
import release47_admin_query_successor as mod

class Controller(unittest.TestCase):
 def test_backup_required(self):
  op=mod.AdminQueryController.__new__(mod.AdminQueryController);op.succ={'operations':{}}
  with self.assertRaisesRegex(Exception,'READABLE_BACKUP'):op.maintenance_and_import()
 def test_all_reads_and_anonymous_guard(self):
  op=mod.AdminQueryController.__new__(mod.AdminQueryController);op.newweb={};op.cfg={'newPort':13111};calls=[];saved=[]
  class Tx:
   def save(self,*args):saved.append(args)
  op.tx=Tx()
  def request(identity,path,auth=True):
   calls.append((path,auth))
   if not auth:raise RuntimeError('HTTP_404')
   return {'rows':[],'total':0}
  op.request=request
  with patch.object(mod.ImageDeliveryController,'ready',lambda _:{}),patch.object(mod,'anonymous_status',return_value=404):op.ready()
  self.assertEqual(len(calls),len(mod.READS));self.assertEqual(len(saved[0][1]['reads']),len(mod.READS))
 def test_slow_or_malformed_aborts(self):
  for body,elapsed in [([],0),({'rows':None,'total':0},0),({'rows':[],'total':0},3)]:
   op=mod.AdminQueryController.__new__(mod.AdminQueryController);op.newweb={};op.request=lambda *args,**kw:body
   with patch.object(mod.ImageDeliveryController,'ready',lambda _:{}),patch.object(mod.time,'monotonic',side_effect=[0,elapsed]):
    with self.assertRaises(Exception):op.ready()
if __name__=='__main__':unittest.main()
