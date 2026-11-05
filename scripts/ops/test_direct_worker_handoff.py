import datetime
import types
import unittest

import worker_handoff as handoff


class DirectWorkerHandoff(unittest.TestCase):
    def setUp(self):
        self.args = types.SimpleNamespace(expected_commit='a' * 40, expected_origin='http://web:3000')
        self.status = {
            'schemaVersion': 1, 'instanceId': 'worker', 'commit': 'a' * 40, 'origin': 'http://web:3000',
            'bootId': '11111111-1111-4111-8111-111111111111', 'revision': 0, 'durableControl': True,
            'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'phase': 'QUIESCENT',
            'activeTicks': 0, 'unresolvedTicks': 0, 'executionMode': 'direct', 'executorRole': 'worker',
            'targetInstanceId': 'worker', 'backgroundTasks': 0,
        }

    def test_actual_worker_executor_identity_required(self):
        self.assertIs(handoff.verify_status(self.status, self.args, 'worker', direct=True), self.status)

    def test_http_state_not_mistaken_for_direct_role(self):
        del self.status['executionMode']
        with self.assertRaises(Exception):
            handoff.verify_status(self.status, self.args, 'worker', direct=True)

    def test_web_target_or_wrong_role_rejected(self):
        for key, value in [('targetInstanceId', 'web'), ('executorRole', 'web')]:
            with self.subTest(key=key), self.assertRaises(Exception):
                handoff.verify_status({**self.status, key: value}, self.args, 'worker', direct=True)

    def test_background_observation_is_a_real_nonnegative_integer(self):
        for value in [None, True, -1, '0']:
            with self.subTest(value=value), self.assertRaises(Exception):
                handoff.verify_status({**self.status, 'backgroundTasks': value}, self.args, 'worker', direct=True)
