import unittest
from release47_bi_successor import settled_media_observation

class MediaObservation(unittest.TestCase):
    def test_exact_scope_only(self):
        row=dict(instance_id='web',boot_id='boot',activity_kind='accepted-work',work_scope='media-variant',state='unknown',outcome='background-promise-unconfirmed',claim_token=None,finished_at=None)
        self.assertTrue(settled_media_observation(row,'web','boot'))
        for field,value in [('instance_id','other'),('boot_id','old'),('activity_kind','agent-run'),('work_scope','durable-image'),('work_scope','media-job'),('state','active'),('outcome','heartbeat-expired'),('claim_token','paid-lease'),('finished_at','now')]:
            with self.subTest(field=field,value=value):
                self.assertFalse(settled_media_observation({**row,field:value},'web','boot'))

if __name__=='__main__':unittest.main()
