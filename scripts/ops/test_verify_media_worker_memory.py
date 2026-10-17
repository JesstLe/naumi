import unittest
import verify_media_worker_memory as verifier


def sample(oom=0, killed=0, grouped=0):
    return {'events': f'low 0\nhigh 0\nmax 0\noom {oom}\noom_kill {killed}\noom_group_kill {grouped}\n'}


class OomEvidence(unittest.TestCase):
    def test_sample_and_final_snapshot_both_zero(self):
        verifier.verify_oom_free([sample(), sample()], sample())

    def test_oom_without_kill_is_not_success(self):
        with self.assertRaisesRegex(RuntimeError, 'OOM_EVENTS_OBSERVED'):
            verifier.verify_oom_free([sample(oom=1)], sample())

    def test_late_oom_after_sampling_is_not_success(self):
        with self.assertRaisesRegex(RuntimeError, 'OOM_EVENTS_OBSERVED'):
            verifier.verify_oom_free([sample()], sample(oom=1))

    def test_each_kill_counter_is_required_to_be_zero(self):
        for final in [sample(killed=1), sample(grouped=1)]:
            with self.subTest(final=final):
                with self.assertRaisesRegex(RuntimeError, 'OOM_EVENTS_OBSERVED'):
                    verifier.verify_oom_free([sample()], final)

    def test_missing_final_evidence_holds(self):
        with self.assertRaisesRegex(RuntimeError, 'FINAL_CGROUP_EVIDENCE_REQUIRED'):
            verifier.verify_oom_free([sample()], None)

    def test_missing_history_holds(self):
        with self.assertRaisesRegex(RuntimeError, 'FINAL_CGROUP_EVIDENCE_REQUIRED'):
            verifier.verify_oom_free([], sample())

    def test_unknown_or_invalid_counter_is_not_zero(self):
        for raw in ['oom_kill 0\n', 'oom unknown\noom_kill 0\noom_group_kill 0\n', 'oom -1\noom_kill 0\noom_group_kill 0\n']:
            with self.subTest(raw=raw):
                with self.assertRaises(RuntimeError):
                    verifier.verify_oom_free([sample()], {'events': raw})


if __name__ == '__main__':
    unittest.main()
