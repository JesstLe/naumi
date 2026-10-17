import datetime as dt
import unittest

import release47_maintenance as authorization
from release47_host import Hold
from release_maintenance_session import valid_plan
from test_release_video_media import video_plan


class LatestAuthorization(unittest.TestCase):
    def spec(self):
        return {
            "mode": "latest-103-20261017",
            "target": "103.30.76.93",
            "scope": "latest-unified-release",
            "goalThread": authorization.LATEST_103_THREAD,
            "userAcknowledgement": authorization.LATEST_103_ACK,
            "date": "2026-10-17",
            "notBefore": authorization.LATEST_103_NOT_BEFORE,
            "restoreDatabase": False,
            "replayAcceptedTasks": False,
        }

    def test_actual_request(self):
        authorization.authorize(self.spec(), dt.datetime.fromisoformat("2026-10-17T12:33:53+08:00"))
        self.assertTrue(authorization.independent_hk(self.spec()))
        self.assertTrue(authorization.canvas_video_hk(self.spec()))

    def test_wrong_authorization(self):
        changes = [
            {"target": "47.105.59.142"}, {"target": "120.27.162.85"},
            {"goalThread": authorization.VIDEO_GOAL},
            {"userAcknowledgement": authorization.VIDEO_HK_ACK},
            {"scope": "canvas-video-fusion"}, {"date": "2026-10-16"},
            {"notBefore": "2026-10-17T00:00:00Z"},
            {"restoreDatabase": True}, {"replayAcceptedTasks": True},
        ]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(Hold):
                authorization.authorize(dict(self.spec(), **change),
                    dt.datetime.fromisoformat("2026-10-17T12:34:00+08:00"))

    def test_expiry(self):
        for now in ["2026-10-16T23:59:59+08:00", "2026-10-17T12:33:52+08:00",
                    "2026-10-18T00:00:00+08:00"]:
            with self.subTest(now=now), self.assertRaises(Hold):
                authorization.authorize(self.spec(), dt.datetime.fromisoformat(now))

    def test_full_media_path(self):
        plan = video_plan()
        plan["authorization"] = self.spec()
        plan["releaseId"] = "latest103-fixture"
        self.assertEqual(valid_plan(plan)["mediaWorker"]["memoryMiB"], 3072)
        plan["releaseId"] = "canvas-video-fusion-fixture"
        with self.assertRaises(Hold):
            valid_plan(plan)


if __name__ == "__main__":
    unittest.main()
