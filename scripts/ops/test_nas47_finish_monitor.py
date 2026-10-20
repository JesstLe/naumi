import unittest
from nas47_finish_monitor import ready,all_gates
class Monitor(unittest.TestCase):
 def test_only_complete_clean_copy_and_full_readback_ready(self):
  c={'errors':0,'mismatch':0,'tooLarge':0};v={'phase':'ALL_BYTES_VERIFIED','verified':3,'files':3,'errors':0,'missing':0,'mismatch':0,'changed':0}
  self.assertTrue(ready(c,v))
  self.assertFalse(ready(None,v));self.assertFalse(ready(c,None))
  for k in ['errors','mismatch','tooLarge']:self.assertFalse(ready({**c,k:1},v))
  for k in ['errors','missing','mismatch','changed']:self.assertFalse(ready(c,{**v,k:1}))
  self.assertFalse(ready(c,{**v,'verified':2}));self.assertFalse(ready(c,{**v,'phase':'VERIFYING'}))
 def test_tail_and_all_backup_scopes_required(self):
  c={'errors':0,'mismatch':0,'tooLarge':0};v={'phase':'ALL_BYTES_VERIFIED','verified':3,'files':3,'errors':0,'missing':0,'mismatch':0,'changed':0}
  b=[{'phase':'ALL_BACKUPS_READBACK_VERIFIED'}for _ in range(5)]
  self.assertTrue(all_gates(c,v,c,b));self.assertFalse(all_gates(c,v,None,b));self.assertFalse(all_gates(c,v,c,b[:-1]))
  self.assertFalse(all_gates(c,v,c,[None]+b[1:]))
 def test_exact_missing_tail_can_only_enter_final_reconciliation(self):
  c={'errors':0,'mismatch':0,'tooLarge':0};v={'phase':'INCOMPLETE_RETAIN_LOCAL','verified':2,'files':3,'errors':0,'missing':1,'mismatch':0,'changed':0}
  self.assertTrue(ready(c,v));self.assertFalse(ready(c,{**v,'errors':1}));self.assertFalse(ready(c,{**v,'missing':2}))
if __name__=='__main__':unittest.main()
