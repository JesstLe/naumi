import copy,datetime as dt,unittest
from unittest.mock import patch
import release47_enterprise_history as release
from release47_host import Hold

class HistoryReleaseTests(unittest.TestCase):
    def config(self):
        return {'target':'47.105.59.142','authorization':release.AUTHORIZATION,'releaseId':'release47-site-control-history-20261029-r1','evidenceRoot':'/opt/naumi-staging/evidence/release47-site-control-history-20261029-r1','webEnvironment':{},'workspaceModules':[],'webMemoryMiB':2560,'workerMemoryMiB':1024,'restoreDatabase':False,'replayAcceptedTasks':False,'commit':'a'*40,'image':'sha256:'+'b'*64,'date':dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'oldNames':{'web':'old-web','worker':'old-worker'},'newNames':{'web':'new-web','worker':'new-worker'},'oldPort':13122,'newPort':13123}
    def test_scope(self):
        c=self.config();release.validate(c)
        for key,value in [('target','103.30.76.93'),('authorization',''),('webEnvironment',{'FLEET_CONTROL_ENABLED':'1'}),('workspaceModules',['tasks']),('restoreDatabase',True),('replayAcceptedTasks',True),('newPort',13122)]:
            changed=copy.deepcopy(c);changed[key]=value
            with self.subTest(key=key),self.assertRaises(Hold):release.validate(changed)
    def test_full_peak_and_reserve_without_extra_services(self):
        r=release.Release.__new__(release.Release);r.new={}
        with patch.object(release.base,'available',return_value=4608):self.assertEqual(r.memory()['remainingPeakMiB'],3584)
        with patch.object(release.base,'available',return_value=4607),self.assertRaises(Hold):r.memory()
    def test_combined_media_cannot_be_stopped_while_active(self):
        r=release.Release.__new__(release.Release);r.old={'worker':{}};r.worker=lambda *_:{'mediaWorker':{'running':1,'queued':0}}
        with patch.object(release.shared.Release,'drain',return_value={}),self.assertRaises(Hold):r.drain()
    def test_current_pair_does_not_narrow_business_tasks(self):
        c=release.prior.current_activity_collector(['naumi47-web-old','naumi47-web-new'])
        for name,spec in release.tasks.SPECS.items():
            if name!='app_release_activities':self.assertEqual(c.SPECS[name],spec)

if __name__=='__main__':unittest.main()
