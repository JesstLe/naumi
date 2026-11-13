import copy
import unittest

from video_duration_range_plan import plan_duration_ranges, rollback_projection


class DurationRangePlanTests(unittest.TestCase):
    def setUp(self):
        self.base = {"rows": [{"publicId": "video-fixture", "upstreamId": "wire-fixture",
            "providerId": "apib-video", "model": "fixture-model", "protocol": "apimart",
            "profile": "apimart-apib-seedance", "video": {
                "modes": ["text"], "defaultDurationSeconds": 4,
                "durationResolutionMap": [{"durations": [4], "resolutions": ["480p"]}],
                "supportsCamera": False, "limits": {"images": 0}}}]}
        entry = {"publicId": "video-fixture", "providerId": "apib-video", "model": "fixture-model",
            "profile": "apimart-apib-seedance", "definition": copy.deepcopy(self.base["rows"][0]["video"]),
            "documentation": {"sourceURLs": ["https://example.test/document"], "checkedAt": "fixture"}}
        self.smoke = {"items": [entry]}
        self.docs = copy.deepcopy(self.smoke)
        self.docs["items"][0]["definition"]["durationResolutionMap"] = [
            {"durations": list(range(4, 16)), "resolutions": ["480p", "720p"]}]
        self.witness = {"apib": {"proposals": [{"model": "fixture-model",
            "definition": copy.deepcopy(self.docs["items"][0]["definition"])}]}}

    def plan(self, base=None):
        return plan_duration_ranges(base or self.base, self.docs, self.smoke, self.witness)

    def test_only_duration_changes_and_idempotent(self):
        result = self.plan()
        self.assertEqual(result["projection"]["rows"][0]["video"]["durationResolutionMap"],
                         [{"durations": list(range(4, 16)), "resolutions": ["480p"]}])
        self.assertEqual(rollback_projection(result["projection"], result["patches"]), self.base)
        self.assertEqual(self.plan(result["projection"])["patches"], [])

    def test_identity_protocol_and_profile_must_match(self):
        for field in ("model", "providerId", "protocol", "profile"):
            base = copy.deepcopy(self.base)
            base["rows"][0][field] = "unverified"
            with self.assertRaises(ValueError):
                self.plan(base)

    def test_manual_duration_change_is_not_overwritten(self):
        base = copy.deepcopy(self.base)
        base["rows"][0]["video"]["durationResolutionMap"][0]["durations"] = [5]
        with self.assertRaisesRegex(ValueError, "ADMIN_DURATION_EDIT_CONFLICT"):
            self.plan(base)

    def test_resolution_not_added_and_unknown_resolution_rejected(self):
        base = copy.deepcopy(self.base)
        base["rows"][0]["video"]["durationResolutionMap"][0]["resolutions"] = ["4k"]
        with self.assertRaisesRegex(ValueError, "RESOLUTION_NOT_DOCUMENTED"):
            self.plan(base)

    def test_independent_witness_is_required(self):
        self.witness["apib"]["proposals"][0]["definition"]["durationResolutionMap"][0]["durations"] = [4]
        with self.assertRaisesRegex(ValueError, "INDEPENDENT_RESEARCH_DISAGREES"):
            self.plan()

    def test_rollback_rejects_new_edits(self):
        result = self.plan()
        result["projection"]["rows"][0]["video"]["durationResolutionMap"][0]["durations"] = [4, 8]
        with self.assertRaisesRegex(ValueError, "ROLLBACK_FIELD_CHANGED"):
            rollback_projection(result["projection"], result["patches"])

    def test_discrete_values_do_not_become_continuous(self):
        for entry in (self.docs["items"][0], self.witness["apib"]["proposals"][0]):
            entry["definition"]["durationResolutionMap"][0]["durations"] = [4, 10]
        self.assertEqual(self.plan()["projection"]["rows"][0]["video"]["durationResolutionMap"][0]["durations"], [4, 10])


if __name__ == "__main__":
    unittest.main()
