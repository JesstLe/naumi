import datetime as dt
import unittest
from release47_host import Hold
import release103_staged as m
import release47_maintenance as auth

class StagedTests(unittest.TestCase):
 def test_stage1_counts_web_caller_reserve_no_started_media(self):
  self.assertEqual(m.stage_gate(2688)['requiredMiB'],2688)
  self.assertTrue(m.stage_gate(2688)['ok']);self.assertFalse(m.stage_gate(2687)['ok'])
 def test_media_stage_cannot_assume_retirement(self):
  with self.assertRaises(Hold):m.stage_gate(8000,media_started=True)
  self.assertFalse(m.stage_gate(5759,media_started=True,old_ui_stopped=True)['ok'])
  self.assertTrue(m.stage_gate(5760,media_started=True,old_ui_stopped=True)['ok'])
 def test_resident_pages_not_double_reserved(self):
  r=m.remaining_peak_gate(5060,dict(web=600,worker=60,media=40))
  self.assertEqual(r['requiredRemainingMiB'],5060);self.assertTrue(r['ok']);self.assertFalse(r['swapIncluded'])
 def test_missing_or_overcap_memory_holds(self):
  for u in [dict(web=0,worker=0),dict(web=1537,worker=0,media=0)]:
   with self.assertRaises(Hold):m.remaining_peak_gate(9000,u)
 def test_latest_authorization_is_target_date_and_action_bound(self):
  a={'mode':'latest-103-20261020','target':m.TARGET,'scope':'latest-unified-release','goalThread':auth.LATEST_103_THREAD,'userAcknowledgement':'上线','date':'2026-10-20','restoreDatabase':False,'replayAcceptedTasks':False}
  auth.authorize(a,dt.datetime(2026,10,20,8,tzinfo=dt.timezone.utc))
  for k,v in [('target','47.105.59.142'),('replayAcceptedTasks',True),('userAcknowledgement','old')]:
   with self.assertRaises(Hold):auth.authorize({**a,k:v},dt.datetime(2026,10,20,8,tzinfo=dt.timezone.utc))
  with self.assertRaises(Hold):auth.authorize(a,dt.datetime(2026,10,21,8,tzinfo=dt.timezone.utc))

if __name__=='__main__':unittest.main()
