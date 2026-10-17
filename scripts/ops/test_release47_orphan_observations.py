import copy
import unittest
from release47_host import Hold
from release47_orphan_observations import resolutions


class Orphans(unittest.TestCase):
    def setUp(self):
        self.row = dict(id='activity', boot_id='old', activity_kind='accepted-work', state='active',
                        work_scope='durable-image', work_key='generate:job', claim_token='token')
        self.job = dict(kind='generate', lease_token='token', expired=True,
                        snapshot={'images': [{'id': 'art-job-0', 'url': '/media/result.png'}],
                                  'paidOperations': {'job': {'state': 'done'}}})
        self.kw = dict(old_boot='old', new_boot='new', dead_owner=True, jobs={'job': self.job},
                       empty_canvas=True, supplier_leases=0)

    def test_only_process_observation_resolved(self):
        before = copy.deepcopy(self.job)
        result = resolutions([self.row], **self.kw)
        self.assertEqual(len(result), 1); self.assertEqual(self.job, before)
        self.assertIn('persisted-result-continuation', result[0][1])

    def test_started_without_results_keeps_fence(self):
        self.job['snapshot'] = {'paidOperations': {'job': {'state': 'started'}}}
        self.assertEqual(resolutions([self.row], **self.kw), [])

    def test_expired_lease_alone_not_paid_retry_permission(self):
        self.job['snapshot'] = {'paidOperations': {'job': {'state': 'done', 'responseHash': 'hash'}}}
        self.assertEqual(resolutions([self.row], **self.kw), [])

    def test_live_process_and_claim_drift_block(self):
        self.kw['dead_owner'] = False
        with self.assertRaises(Hold): resolutions([self.row], **self.kw)
        self.kw['dead_owner'] = True; self.job['lease_token'] = 'other'
        with self.assertRaises(Hold): resolutions([self.row], **self.kw)

    def test_unclaimed_canvas_scanner_only(self):
        self.row.update(work_scope='canvas-image', work_key='claim:0', claim_token=None)
        self.assertEqual(len(resolutions([self.row], **self.kw)), 1)
        self.kw['empty_canvas'] = False
        with self.assertRaises(Hold): resolutions([self.row], **self.kw)

    def test_supplier_query_live_lease_blocks(self):
        self.row.update(work_scope='supplier-scan', work_key='supplier-cost-scan', claim_token=None)
        self.assertEqual(len(resolutions([self.row], **self.kw)), 1)
        self.kw['supplier_leases'] = 1
        with self.assertRaises(Hold): resolutions([self.row], **self.kw)


if __name__ == '__main__': unittest.main()
