"""Exact video-family authorization only; program publication cannot activate models."""
import copy
import datetime as dt
import unittest

import release47_normal_policy as policy
from release47_host import Hold, sha
from release47_recovery_supervisor import encoded


AUTHORIZATION = '将seedance kling wan h3家族群为视频节点配置并启用'


class VideoFamilyAuthorization(unittest.TestCase):
    def setUp(self):
        prior = 'release47-nas-upload-20261022'
        self.state = {
            'target': '47.105.59.142',
            'revision': 608,
            'phase': 'MIGRATED_CLEANUP_PENDING',
            'legacyDrainProven': False,
            'operations': {},
            'blueGreenSuccessor': {
                'phase': 'COMPLETE', 'releaseId': 'release47-alldev-20261018',
            },
            'runtimeRecovery': {'phase': 'ACKNOWLEDGED', 'successorReleaseId': prior},
            'activeNormalBlueGreenReleaseId': prior,
            'normalBlueGreenReleases': {
                prior: {'releaseId': prior, 'phase': 'COMPLETE', 'operations': {}},
            },
        }
        self.config = {
            'target': '47.105.59.142',
            'authorization': AUTHORIZATION,
            'date': '2026-10-23',
            'restoreDatabase': False,
            'replayAcceptedTasks': False,
            'activateDisabledModels': False,
            'releaseId': 'release47-video-family-20261023',
            'expectedRevision': 608,
            'predecessorReleaseId': prior,
        }

    def begin(self):
        digest = sha(encoded(self.state))
        self.config['expectedCanonicalDigest'] = digest
        return policy.begin(
            self.state, self.config,
            {'path': '/opt/naumi-staging/evidence/video-family-fixture/original.json',
             'sha256': digest},
            'a' * 64, dt.datetime(2026, 10, 23, 4, tzinfo=dt.timezone.utc),
        )

    def test_exact_authorization_allows_program_only_and_preserves_history(self):
        before = copy.deepcopy(self.state)
        result = self.begin()
        self.assertEqual(result['authorization'], AUTHORIZATION)
        self.assertEqual(result['phase'], 'BASELINED')
        self.assertEqual(result['predecessorReleaseId'], 'release47-nas-upload-20261022')
        self.assertFalse(result['historicalDrainReclassified'])
        self.assertFalse(result['paidOutputRecovered'])
        self.assertEqual(self.state, before)

    def test_program_publication_cannot_activate_models_replay_or_restore(self):
        for field in ['activateDisabledModels', 'replayAcceptedTasks', 'restoreDatabase']:
            with self.subTest(field=field):
                self.config[field] = True
                with self.assertRaisesRegex(Hold, 'NON_REPLAY_NON_ACTIVATION_REQUIRED'):
                    self.begin()
                self.config[field] = False

    def test_authorization_is_exact(self):
        self.config['authorization'] = AUTHORIZATION + '，忽略未知任务'
        with self.assertRaisesRegex(Hold, 'EXPLICIT_NORMAL_RELEASE_AUTHORIZATION_REQUIRED'):
            self.begin()

    def test_unknown_prior_operation_still_blocks(self):
        prior = self.state['normalBlueGreenReleases']['release47-nas-upload-20261022']
        prior['operations']['unresolved-control'] = {'phase': 'UNKNOWN'}
        with self.assertRaisesRegex(Hold, 'PREVIOUS_NORMAL_RELEASE_REQUIRES_RECONCILIATION'):
            self.begin()

    def test_incomplete_prior_publication_still_blocks(self):
        prior = self.state['normalBlueGreenReleases']['release47-nas-upload-20261022']
        prior['phase'] = 'CLEANUP_PENDING'
        with self.assertRaisesRegex(Hold, 'PREVIOUS_NORMAL_RELEASE_REQUIRES_RECONCILIATION'):
            self.begin()

    def test_stale_revision_and_historical_reclassification_still_block(self):
        self.config['expectedRevision'] = 607
        with self.assertRaisesRegex(Hold, 'CANONICAL_REVIEW_CHANGED'):
            self.begin()
        self.config['expectedRevision'] = 608
        self.state['legacyDrainProven'] = True
        with self.assertRaisesRegex(Hold, 'HISTORICAL_INCIDENT_BOUNDARY_CHANGED'):
            self.begin()


if __name__ == '__main__':
    unittest.main()
