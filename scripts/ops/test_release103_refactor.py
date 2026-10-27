"""Concentrated offline guard tests; not production acceptance."""
import copy, datetime as dt, pathlib, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent))
import release103_refactor as r

class Guards(unittest.TestCase):
    def config(self):
        return {'target':r.TARGET,'authorization':r.ACK,'commit':'a'*40,'image':'sha256:'+'b'*64,'buildVersion':'1793109391','releaseId':'release103-refactor-20261027','oldPort':13104,'newPort':13105,'restoreDatabase':False,'replayAcceptedTasks':False,'date':dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'evidenceRoot':'/opt/naumi-staging/evidence/release103-refactor-20261027'}
    def test_reviewed_target_only(self):
        r.validate_config(self.config())
        for key,value in [('target','47.105.59.142'),('authorization','old maintenance'),('commit','main'),('image','naumi:latest'),('buildVersion','0'),('restoreDatabase',True),('replayAcceptedTasks',True),('oldPort',13103),('newPort',13104),('date','2026-10-20'),('evidenceRoot','/tmp/new-state')]:
            with self.subTest(key=key):
                cfg=self.config();cfg[key]=value
                with self.assertRaises(r.Hold):r.validate_config(cfg)
    def test_peak_budget_excludes_swap(self):
        cap={'web':1536,'worker':128,'media':3072}
        self.assertFalse(r.capacity(5759,{},cap)['ok'])
        self.assertTrue(r.capacity(5760,{},cap)['ok'])
        gate=r.capacity(4992,{'web':768},cap)
        self.assertTrue(gate['ok']);self.assertEqual(gate['remainingPeakMiB'],3968)
        self.assertFalse(gate['swapIncluded'])
    def test_unknown_operations_are_not_acknowledged(self):
        for phase in ['UNKNOWN','INTENT_RECORDED','ROLLBACK_FAILED']:
            self.assertFalse(r.acknowledged({'operations':{'x':{'phase':phase}}}))
        self.assertTrue(r.acknowledged({'operations':{'x':{'phase':'ACKNOWLEDGED'}}}))
    def test_no_fixture_or_target_state_override(self):
        self.assertEqual(r.CANON.as_posix(),'/opt/naumi-staging/releases/release-lifecycle/current.json')
        self.assertEqual(r.TARGET,'103.30.76.93')

if __name__=='__main__':unittest.main()
