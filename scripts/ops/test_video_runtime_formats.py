"""Pinned-package format contract and immutable task/workflow rollback rules."""
import copy
import hashlib
import json
import pathlib
import unittest

import release47_video_profile_guard as guard
from release47_host import Hold
from test_release47_video_profile_guard import observation, NOW

ROOT = pathlib.Path(__file__).resolve().parents[2]


def contract():
    return {'schemaVersion': 1, 'taskParameterVersions': [0, 2, 3],
            'compiledPlanVersions': [1, 2, 3, 4, 5], 'workflowExecutionVersions': [0, 1],
            'workflowCompiledVersions': [1],
            'publishedProfileVersions': dict.fromkeys(['json-video', 'native-video', 'workflow-video'], 1)}


def formats(tasks=(), workflows=()):
    return {'taskCount': sum(x['count'] for x in tasks), 'taskFormats': list(tasks),
            'workflowCount': sum(x['count'] for x in workflows), 'workflowFormats': list(workflows)}


def task(**changes):
    return {'version': 3, 'planVersion': 1, 'count': 1, 'hasCompiledPlan': True,
            'hasPlanDigest': True, **changes}


class RuntimeFormats(unittest.TestCase):
    def test_baseline_counterexample_unknown_profile_escapes_six_name_guard(self):
        sample = observation(bindings=[])
        sample['formatSummary'] = formats([task(planVersion=5)], [{'version': 1, 'count': 1}])
        before = copy.deepcopy(sample)
        result = guard.evaluate(sample, now=NOW)
        self.assertFalse(result['safe'])
        self.assertEqual(len(result['formatCompatibility']['blockers']), 2)
        self.assertEqual(sample, before)

    def test_all_actual_plan_formats_and_history_require_modern_reader(self):
        for version in range(1, 6):
            summary = formats([task(planVersion=version, count=100)])
            self.assertFalse(guard.assess_formats(summary)['safe'])
            self.assertTrue(guard.assess_formats(summary, contract())['safe'])

    def test_legacy_v2_and_unversioned_do_not_need_modern_descriptor(self):
        self.assertTrue(guard.assess_formats(formats([{'version': 0, 'count': 2},
                                                     {'version': 2, 'count': 3}]))['safe'])

    def test_future_task_and_workflow_versions_not_guessed(self):
        for summary in [formats([task(version=4)]), formats(workflows=[{'version': 2, 'count': 1}])]:
            self.assertFalse(guard.assess_formats(summary, contract())['safe'])

    def test_malformed_or_partial_version_markers_never_fall_back(self):
        for changes in [{'version': True}, {'version': '3'}, {'version': None}, {'version': 2},
                        {'hasCompiledPlan': False}, {'hasPlanDigest': False}, {'planVersion': None},
                        {'planVersion': True}, {'planVersion': 0}, {'planVersion': 6}]:
            with self.subTest(changes=changes):
                self.assertFalse(guard.assess_formats(formats([task(**changes)]), contract())['safe'])

    def test_encrypted_workflow_cannot_assume_only_json_or_plan_v1(self):
        summary = formats(workflows=[{'version': 1, 'count': 1}])
        self.assertFalse(guard.assess_formats(summary)['safe'])
        self.assertTrue(guard.assess_formats(summary, contract())['safe'])
        for field, value in [('compiledPlanVersions', [1, 2, 3, 4]),
                             ('workflowCompiledVersions', [2]),
                             ('publishedProfileVersions', {'json-video': 1})]:
            self.assertFalse(guard.assess_formats(summary, {**contract(), field: value})['safe'])

    def test_runtime_descriptor_does_not_override_legacy_wire_barrier(self):
        from test_release47_video_profile_guard import row
        result = guard.evaluate(observation([row()]), now=NOW, runtime_formats=contract())
        self.assertFalse(result['safe'])

    def test_no_summary_is_unknown_not_zero(self):
        with self.assertRaisesRegex(Hold, 'VIDEO_FORMAT_SCAN_MISSING'):
            guard.assess_formats(None)

    def test_scan_counts_truncation_duplicates_and_boolean_rejected(self):
        for sample in [dict(formats(), taskCount=1), dict(formats(), taskCount=True),
                       formats([task(), task()]), formats([task(count=0)]),
                       formats(workflows=[{'version': 1, 'count': -1}])]:
            with self.assertRaises(Hold):
                guard.assess_formats(sample, contract())

    def test_runtime_contract_strict_versions(self):
        for field, value in [('schemaVersion', True), ('taskParameterVersions', [True]),
                             ('compiledPlanVersions', [1, 1]), ('compiledPlanVersions', []),
                             ('workflowExecutionVersions', None), ('publishedProfileVersions', {'json-video': True})]:
            with self.assertRaises(Hold):
                guard.assess_formats(formats(), {**contract(), field: value})

    def test_actual_query_reads_terminal_history_and_workflow_execution_version(self):
        sql = guard.build_readonly_sql(dict.fromkeys(guard.SCHEMA_KEYS, True))
        tail = sql[sql.index('task_formats AS'):]
        self.assertIn("v.capability_snapshot->'planVersion'", tail)
        self.assertIn("to_jsonb(r.execution_version)", sql)
        self.assertNotIn('status', tail)
        self.assertNotIn('LIMIT', tail)
        self.assertNotIn('frozen_nodes_enc', sql)
        self.assertNotIn('active_version', sql)
        self.assertNotIn('UPDATE ', sql)

    def test_same_prior_web_package_is_bound_at_both_rollback_checks(self):
        text = (ROOT/'scripts/ops/release47_normal_rollback.py').read_text()
        self.assertEqual(text.count("video_profile_guard.check_live(tx,config,prior=pm['web'])"), 2)
        self.assertIn('video_profile_guard.enforce(video_proof,retain_compatible_executor)', text)

    def test_package_probe_uses_fixed_image_not_prior_container_writable_layer(self):
        events = []
        class Tx:
            def inspect(self, identity):
                return {'Image': 'sha256:'+'b'*64, 'State': {'Running': False}}
            def run(self, argv, **kwargs):
                events.append(argv)
                return json.dumps({'schemaVersion': 1, 'bundleVerified': True,
                                   'videoRuntimeFormats': contract()})
        actual = guard.read_runtime_formats(Tx(), {'id': 'a'*64, 'image': 'sha256:'+'b'*64})
        self.assertEqual(actual, contract())
        argv = events[0]
        self.assertIn('--network=none', argv)
        self.assertIn('--read-only', argv)
        self.assertIn('sha256:'+'b'*64, argv)
        self.assertNotIn('docker.sock', ' '.join(argv))
        self.assertNotIn('start', argv)

    def test_package_drift_running_slot_and_unverified_claim_rejected(self):
        prior = {'id': 'a'*64, 'image': 'sha256:'+'b'*64}
        for image, running, result in [('sha256:'+'c'*64, False, {}),
                                       (prior['image'], True, {}),
                                       (prior['image'], False, {'schemaVersion': 1, 'bundleVerified': False})]:
            class Tx:
                def inspect(self, identity): return {'Image': image, 'State': {'Running': running}}
                def run(self, *args, **kwargs): return json.dumps(result)
            with self.assertRaises(Hold): guard.read_runtime_formats(Tx(), prior)

    def test_modern_bundle_descriptor_is_not_generic_claim_of_safe_rollback(self):
        self.assertNotIn('drain', json.dumps(contract()))
        self.assertNotIn('verified', json.dumps(contract()))


if __name__ == '__main__': unittest.main()
