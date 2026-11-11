import copy
import json
import pathlib
import unittest
from verify_public_case_catalog import verify

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "content/public-cases-collection"


class CollectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((DATA / "catalog.json").read_text(encoding="utf8"))
        cls.cases = json.loads((DATA / "verified-cases.json").read_text(encoding="utf8"))

    def test_targets_and_contract(self):
        verify(self.catalog)
        self.assertGreaterEqual(sum(c["kind"] == "image" for c in self.catalog), 220)
        self.assertGreaterEqual(sum(c["kind"] == "video" for c in self.catalog), 80)

    def test_empty_rollback(self):
        self.assertEqual(verify([], 0, 0), "CATALOG_PASS cases=0 images=0 videos=0")

    def test_unknown_license_rejected(self):
        fixture = copy.deepcopy(self.catalog[:1])
        fixture[0]["source"]["license"] = "UNKNOWN"
        with self.assertRaises(AssertionError):
            verify(fixture, 1)

    def test_duplicate_identity_rejected(self):
        with self.assertRaises(AssertionError):
            verify([self.catalog[0], self.catalog[0]], 1)

    def test_missing_source_rejected(self):
        fixture = copy.deepcopy(self.catalog[:1])
        fixture[0]["source"].pop("licenseUrl")
        with self.assertRaises(AssertionError):
            verify(fixture, 1)

    def test_parent_18_excluded(self):
        exclusions = json.loads((DATA / "exclusions.json").read_text(encoding="utf8"))
        self.assertFalse({c["id"] for c in self.cases} & set(exclusions["parentIds"]))
        self.assertFalse({c["originalSha256"] for c in self.cases} & set(exclusions["parentOriginalSha256"]))

    def test_no_duplicate_original_or_prompt(self):
        self.assertEqual(len({c["originalSha256"] for c in self.cases}), len(self.cases))
        self.assertEqual(len({" ".join((c["originalPrompt"] or c["id"]).lower().split()) for c in self.cases}), len(self.cases))

    def test_prompt_provenance_and_media_evidence(self):
        for c in self.cases:
            self.assertFalse(c["naumiGenerationVerified"])
            self.assertNotEqual(c["originalPrompt"], c["naumiPrompt"])
            self.assertTrue((DATA / c["licenseEvidenceFile"]).is_file())
            self.assertTrue(c["licenseStatus"].startswith("verified"))
            self.assertEqual(c["mediaStatus"], "verified")
            if c["kind"] == "video":
                self.assertEqual(c["mediaVerification"]["fullOriginalVideoDecode"], "PASS")

    def test_motion_comics_are_narrative_not_generated(self):
        comics = [c for c in self.cases if c["sourceKey"] == "pepper-carrot"]
        self.assertGreaterEqual(len(comics), 3)
        for c in comics:
            self.assertTrue(c["narrative"])
            self.assertIsNone(c["originalPrompt"])
            self.assertEqual(c["narrativeForm"], "漫画改编动态漫 / motion comic")
            self.assertGreater(len(c["storyBeats"]), 3)
            self.assertIn("original audio retained", c["transform"])


if __name__ == "__main__":
    unittest.main()
