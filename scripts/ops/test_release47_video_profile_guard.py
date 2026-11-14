"""Compatibility examples for unfinished paid tasks and encrypted workflow stages."""
import copy
import datetime as dt
import json
import pathlib
import unittest

import release47_video_profile_guard as guard
from release47_host import Hold


NOW = dt.datetime(2026, 10, 23, 6, tzinfo=dt.timezone.utc)


def row(**changes):
    return {'id': 'vid-example', 'status': 'processing', 'profiles': [None, None, None],
            'versions': [135, 135], 'publicModelIds': ['video-kling'],
            'upstreamIds': ['apib-kling-v3'], 'wireModelIds': ['kling-v3'], **changes}


def observation(tasks=(), workflows=(), bindings=None):
    return {'schemaVersion': 1, 'complete': True, 'readOnly': 'on', 'observedAt': NOW.isoformat(),
            'bindings': bindings if bindings is not None else [{
                'source': 'frozen', 'profile': 'apimart-apib-kling', 'modelVersion': 135,
                'upstreamId': 'apib-kling-v3', 'wireModelId': 'kling-v3',
                'publicModelIds': ['video-kling'], 'digestMatches': True,
                'knownUpstreamIds': ['apib-kling-v3', 'legacy-kling'],
                'knownWireModelIds': ['kling-v3', 'legacy-model'],
                'knownPublicModelIds': ['video-kling', 'legacy-video']}],
            'taskCount': len(tasks), 'taskRows': list(tasks),
            'workflowCount': len(workflows), 'workflowRows': list(workflows),
            'formatSummary': {'taskCount': 0, 'taskFormats': [], 'workflowCount': 0, 'workflowFormats': []}}


class VideoProfileGuard(unittest.TestCase):
    def evaluate(self, value, scope=None):
        return guard.evaluate(value, scope, now=NOW)

    def test_every_new_profile_blocks_even_without_config_or_defaults(self):
        for profile in guard.PROFILES:
            with self.subTest(profile=profile):
                result = self.evaluate(observation([row(profiles=[profile], versions=[],
                    publicModelIds=[], upstreamIds=[], wireModelIds=[])], bindings=[]))
                self.assertFalse(result['safe'])
                self.assertEqual(result['blockers'][0]['reason'], 'unfinished-new-wire-profile')

    def test_frozen_defaults_pin_old_version_after_active_config_rollback(self):
        result = self.evaluate(observation([row()]))
        self.assertFalse(result['safe'])
        self.assertEqual(result['modelVersions'], [135])
        self.assertEqual(result['bindingCount'], 1)

    def test_all_nonterminal_states_including_unknown_paid_submission_block(self):
        for status in ['queued', 'processing', 'needs_attention', '', 'unexpected-upstream-state']:
            with self.subTest(status=status):
                self.assertFalse(self.evaluate(observation([row(status=status)]))['safe'])

    def test_terminal_tasks_no_longer_need_old_wire_executor(self):
        for status in ['completed', 'failed', 'cancelled']:
            self.assertTrue(self.evaluate(observation([row(status=status,
                profiles=['apimart-apib-kling'])]))['safe'])

    def test_encrypted_workflow_without_task_is_protected_by_frozen_quote_version(self):
        stage = row(id='run:node', status='pending', versions=[135], profiles=[],
                    upstreamIds=[], wireModelIds=[], planMatches=1)
        for status in ['pending', 'processing', 'needs_confirmation', 'needs_attention']:
            with self.subTest(status=status):
                self.assertFalse(self.evaluate(observation(workflows=[{**stage, 'status': status}]))['safe'])

    def test_relevant_workflow_missing_or_duplicate_plan_identity_is_unknown(self):
        for matches in [0, 2, None]:
            stage = row(id='run:node', versions=[135], upstreamIds=[], profiles=[],
                        publicModelIds=[], wireModelIds=[], planMatches=matches)
            result = self.evaluate(observation(workflows=[stage]))
            self.assertFalse(result['safe'])
            self.assertEqual(result['blockers'][0]['reason'], 'workflow-frozen-model-identity-unknown')

    def test_missing_model_identity_at_related_version_cannot_mean_unrelated(self):
        self.assertFalse(self.evaluate(observation([row(publicModelIds=[],
            upstreamIds=[], wireModelIds=[])]))['safe'])

    def test_old_exact_upstream_is_not_confused_with_shared_alias_or_wire_name(self):
        result = self.evaluate(observation([row(upstreamIds=['legacy-kling'], profiles=['kie-kling'])]))
        self.assertTrue(result['safe'])

    def test_unknown_identity_at_related_version_is_not_claimed_unrelated(self):
        self.assertFalse(self.evaluate(observation([row(upstreamIds=['unrecognized-upstream'])]))['safe'])
        self.assertFalse(self.evaluate(observation([row(upstreamIds=[],
            publicModelIds=['unrecognized-public-model'])]))['safe'])

    def test_unrelated_known_public_model_at_same_version_can_rollback(self):
        self.assertTrue(self.evaluate(observation([row(upstreamIds=[],
            publicModelIds=['legacy-video'], profiles=['kie-kling'])]))['safe'])

    def test_conflicting_frozen_versions_are_unknown(self):
        self.assertFalse(self.evaluate(observation([row(versions=[135, 134])]))['safe'])

    def test_unrelated_historical_incident_is_not_reclassified(self):
        historical = row(status='needs_attention', versions=[115], profiles=['kie-kling'],
                         upstreamIds=['legacy-kling'])
        value = observation([historical]); before = copy.deepcopy(value)
        result = self.evaluate(value)
        self.assertTrue(result['safe'])
        self.assertEqual(result['unrelatedNonterminalRows'], 1)
        self.assertFalse(result['historicalRowsChanged'])
        self.assertEqual(value, before)

    def test_unrelated_old_version_with_no_new_profiles_can_rollback(self):
        self.assertTrue(self.evaluate(observation([row(versions=[115],
            profiles=['kie-kling'])], bindings=[]))['safe'])

    def test_optional_release_scope_strengthens_dynamic_binding(self):
        extra = {'modelVersions': [136], 'publicModelIds': ['video-kling'],
                 'upstreamIds': ['apib-kling-v3'], 'wireModelIds': ['kling-v3']}
        self.assertFalse(self.evaluate(observation([row(versions=[136])], bindings=[]), extra)['safe'])

    def test_incomplete_binding_or_wrong_digest_is_unknown(self):
        for key, value in [('modelVersion', None), ('upstreamId', ''),
                           ('wireModelId', ''), ('digestMatches', False)]:
            sample = observation(); sample['bindings'][0][key] = value
            with self.subTest(key=key), self.assertRaises(Hold):
                self.evaluate(sample)

    def test_stale_truncated_or_writable_scan_never_proves_zero(self):
        for key, value in [('complete', False), ('readOnly', 'off'), ('taskCount', 2),
                           ('observedAt', (NOW - dt.timedelta(seconds=31)).isoformat())]:
            sample = observation(); sample[key] = value
            with self.subTest(key=key), self.assertRaises(Hold):
                self.evaluate(sample)

    def test_bad_marker_types_are_not_silently_omitted(self):
        for change in [{'versions': ['135']}, {'versions': [True]}, {'profiles': [5]},
                       {'publicModelIds': None}]:
            with self.subTest(change=change), self.assertRaises(Hold):
                self.evaluate(observation([row(**change)]))

    def test_query_reads_all_frozen_versions_and_never_uses_current_active(self):
        sql = guard.build_readonly_sql(dict.fromkeys(guard.SCHEMA_KEYS, True))
        self.assertIn('REPEATABLE READ READ ONLY', sql)
        self.assertIn('app_video_model_defaults', sql)
        self.assertIn("d.value->>'profile'", sql)
        self.assertIn('app_model_config_versions', sql)
        self.assertIn('r.public_frozen_nodes', sql)
        self.assertIn("{modelExecutions,video,video,profile}", sql)
        self.assertNotIn('active_version', sql)
        self.assertNotIn('frozen_nodes_enc', sql)
        self.assertNotIn('UPDATE ', sql)

    def test_confirmed_absent_legacy_optional_tables_are_not_created(self):
        tables = dict.fromkeys(guard.SCHEMA_KEYS, True)
        tables.update(defaults=False, runs=False, nodes=False)
        sql = guard.build_readonly_sql(tables)
        self.assertNotIn('FROM app_video_model_defaults', sql)
        self.assertNotIn('FROM app_video_workflow_run_nodes', sql)
        self.assertIn('FROM app_model_config_versions', sql)
        tables['runs'] = True
        with self.assertRaises(Hold):
            guard.build_readonly_sql(tables)

    def test_live_wrapper_only_projects_nonsecret_read_only_markers(self):
        class Fixture:
            def __init__(self): self.inputs = []
            def inspect(self, _name):
                return {'Id': 'db-fixture', 'Config': {'Env': ['POSTGRES_USER=fixture', 'POSTGRES_DB=fixture']}}
            def run(self, _command, *, stdin, **_options):
                self.inputs.append(stdin.decode())
                value = observation(bindings=[])
                value['observedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
                return json.dumps(dict.fromkeys(guard.SCHEMA_KEYS, True) if len(self.inputs) == 1 else value).encode()
        fixture = Fixture()
        self.assertTrue(guard.check_live(fixture, {})['safe'])
        self.assertEqual(len(fixture.inputs), 2)
        self.assertTrue(all('READ ONLY' in sql for sql in fixture.inputs))

    def test_apply_rechecks_after_drain_before_starting_prior_worker(self):
        text = (pathlib.Path(__file__).parent / 'release47_normal_rollback.py').read_text()
        self.assertEqual(text.count("video_profile_guard.check_live(tx,config,prior=pm['web'])"), 2)
        self.assertLess(text.index("wait(drained,'CURRENT_EXECUTION_DRAIN_PENDING')"),
                        text.index("'video-profile-rollback-drained-'"))
        self.assertLess(text.index("'video-profile-rollback-drained-'"),
                        text.index("step('start-prior-'"))
        self.assertIn('video_profile_guard.enforce(video_proof,retain_compatible_executor)', text)

    def test_late_hold_restores_same_compatible_executor_before_refusing_rollback(self):
        events = []
        with self.assertRaisesRegex(Hold, 'NEW_VIDEO_PROFILE_REQUIRES_COMPATIBLE_EXECUTOR_NOT_OLD_WORKER'):
            guard.enforce({'safe': False}, lambda: events.append('current-version-resumed'))
        self.assertEqual(events, ['current-version-resumed'])
        guard.enforce({'safe': True}, lambda: events.append('unexpected-resume'))
        self.assertEqual(events, ['current-version-resumed'])

    def test_unknown_resume_cannot_be_reported_as_restored(self):
        def unresolved(): raise Hold('ORIGINAL_CONTROL_UUID_UNKNOWN')
        with self.assertRaisesRegex(Hold, 'ORIGINAL_CONTROL_UUID_UNKNOWN'):
            guard.enforce({'safe': False}, unresolved)


if __name__ == '__main__':
    unittest.main()
