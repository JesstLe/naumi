import copy
import unittest
from release47_host import Hold
from release47_persisted_parent_receipt import recovered_snapshot


class Receipt(unittest.TestCase):
    def setUp(self):
        self.p = {'email': 'owner', 'payload': {'plan': {'steps': [{'operation': 'edit'}],
                  'intent': {'background': None}, 'request': {'output': {'format': 'png'}, 'inputs': []}}},
                  'snapshot': {'status': 'error', 'result': {'error': {'message': '对象超过大小限制'}},
                               'children': {'generate': {'state': 'done', 'jobId': 'child', 'ids': ['art']}}}}
        self.c = {'id': 'child', 'kind': 'generate', 'email': 'owner', 'billing_settled': True,
                  'snapshot': {'status': 'done', 'images': [{'id': 'art', 'url': '/media/a.png', 'width': 4096, 'height': 4096}]}}
        self.x = dict(format='png', bytes=16_833_862, width=4096, height=4096,
                      totalPixels=16777216, transparentPixels=0, fullyTransparentPixels=0, visiblePixels=16777216)

    def test_only_receipt_changes_no_new_charge(self):
        before = copy.deepcopy(self.c); result = recovered_snapshot(self.p, self.c, self.x, 6)
        self.assertEqual(result['result']['chargedCredits'], 6)
        self.assertEqual(result['status'], 'done'); self.assertNotIn('error', result['result'])
        self.assertEqual(self.c, before); self.assertEqual(self.p['snapshot']['status'], 'error')

    def test_owner_settlement_and_state_are_mandatory(self):
        for field, value in [('email', 'other'), ('billing_settled', False)]:
            c = dict(self.c, **{field: value})
            with self.assertRaises(Hold): recovered_snapshot(self.p, c, self.x, 6)

    def test_no_mask_or_extra_output_processing(self):
        self.p['payload']['plan']['request']['output']['downscaleMaxDim'] = 1024
        with self.assertRaises(Hold): recovered_snapshot(self.p, self.c, self.x, 6)

    def test_no_unknown_child_or_dimensions(self):
        self.x['width'] = 1024
        with self.assertRaises(Hold): recovered_snapshot(self.p, self.c, self.x, 6)


if __name__ == '__main__': unittest.main()
