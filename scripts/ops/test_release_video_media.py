import copy
import datetime as dt
import hashlib
import json
import pathlib
import tempfile
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import release47_maintenance as authorization
import release_maintenance_session as session
import release_video_media as media
from release47_host import Hold
from test_release_maintenance_session import plan, FixtureAdapter


def video_plan():
    value = plan('103.30.76.93')
    value.update(releaseId='canvas-video-fusion-fixture', runtimeTopology='unified-web-three-ui')
    value['webs'] = value['webs'][:1]
    value['webs'][0]['requiredChecks'] += ['desktop-ui', 'enterprise-ui']
    value['authorization'] = {'mode': 'canvas-video-fusion-103', 'target': '103.30.76.93',
        'scope': 'canvas-video-fusion', 'goalThread': authorization.VIDEO_GOAL,
        'userAcknowledgement': authorization.VIDEO_HK_ACK, 'restoreDatabase': False, 'replayAcceptedTasks': False}
    value['mediaWorker'] = {'name': 'naumi-video-media-' + value['commit'][:12],
        'image': value['webs'][0]['image'], 'memoryMiB': 3072, 'cpu': 1}
    value.pop('predecessor47')
    return value


class VideoMediaTests(unittest.TestCase):
    def old_baseline(self):
        operation=str(uuid.uuid4())
        return {'schemaVersion':1,'releaseId':'old-readonly-fixture','target':'103.30.76.93','phase':'BASELINED','status':'PREPARED',
            'revision':2,'operations':{operation:{'phase':'ACKNOWLEDGED','request':{'action':'baseline'}}},
            'history':[{'operationId':operation,'action':'baseline','result':'ACKNOWLEDGED'}],
            'webs':{},'retired':[],'databaseRestored':False,'tasksReplayed':False}

    def test_explicit_pinned_baseline_supersession_preserves_original_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);state=root/'state';state.mkdir(mode=0o700)
            old=self.old_baseline();raw=(json.dumps(old,indent=2)+'\n').encode();(state/'current.json').write_bytes(raw)
            spec=video_plan();spec['supersedesUnpublished']={'releaseId':old['releaseId'],'stateSha256':hashlib.sha256(raw).hexdigest()}
            tx=SimpleNamespace(stack=True,folder=root)
            current=session.MaintenanceSession(tx,spec,adapter=FixtureAdapter(),state_root=state)
            self.assertEqual(current.state['phase'],'NEW');self.assertFalse(current.state['supersededUnpublished']['workloadsChanged'])
            self.assertEqual((state/(old['releaseId']+'.baseline-original.json')).read_bytes(),raw)
            self.assertEqual(json.loads((state/(old['releaseId']+'.json')).read_bytes())['phase'],'ABORTED')

    def test_supersession_rejects_unknown_or_applied_effects_and_preserves_current(self):
        for change in ['unknown','history','candidate','backup','target','phase','schema','field','admission-marker']:
            with self.subTest(change=change),tempfile.TemporaryDirectory() as directory:
                root=pathlib.Path(directory);state=root/'state';state.mkdir(mode=0o700);old=self.old_baseline()
                if change=='unknown':next(iter(old['operations'].values()))['phase']='UNKNOWN'
                if change=='history':old['history'].append({'action':'maintenance','result':'ACKNOWLEDGED'})
                if change=='candidate':old['webs']={'main':{'created':{}}}
                if change=='backup':old['backup']={}
                if change=='target':old['target']='47.105.59.142'
                if change=='phase':old['phase']='MAINTENANCE'
                if change=='schema':old['schemaVersion']=99
                if change=='field':old['unknown-effect']={}
                if change=='admission-marker':old['app-open-main']={}
                raw=json.dumps(old).encode();(state/'current.json').write_bytes(raw)
                spec=video_plan();spec['supersedesUnpublished']={'releaseId':old['releaseId'],'stateSha256':hashlib.sha256(raw).hexdigest()}
                with self.assertRaises(Hold):session.MaintenanceSession(SimpleNamespace(stack=True,folder=root),spec,adapter=FixtureAdapter(),state_root=state)
                self.assertEqual((state/'current.json').read_bytes(),raw)
                self.assertFalse((state/(old['releaseId']+'.baseline-original.json')).exists())

    def test_interrupted_either_archive_publication_is_retryable_without_partial_final_files(self):
        for fail_at in [1,2]:
            with self.subTest(fail_at=fail_at),tempfile.TemporaryDirectory() as directory:
                root=pathlib.Path(directory);state=root/'state';state.mkdir(mode=0o700)
                old=self.old_baseline();raw=json.dumps(old).encode();(state/'current.json').write_bytes(raw)
                spec=video_plan();spec['supersedesUnpublished']={'releaseId':old['releaseId'],'stateSha256':hashlib.sha256(raw).hexdigest()}
                actual_link=session.os.link;calls=[]
                def interrupted(source,destination):
                    calls.append(destination)
                    if len(calls)==fail_at:raise OSError('simulated interrupted archive publication')
                    return actual_link(source,destination)
                with patch.object(session.os,'link',side_effect=interrupted),self.assertRaises(OSError):
                    session.MaintenanceSession(SimpleNamespace(stack=True,folder=root),spec,adapter=FixtureAdapter(),state_root=state)
                self.assertEqual((state/'current.json').read_bytes(),raw)
                self.assertFalse(pathlib.Path(calls[-1]).exists())
                current=session.MaintenanceSession(SimpleNamespace(stack=True,folder=root),spec,adapter=FixtureAdapter(),state_root=state)
                self.assertEqual(current.state['phase'],'NEW')
                self.assertEqual((state/(old['releaseId']+'.baseline-original.json')).read_bytes(),raw)

    def test_supersession_requires_explicit_matching_state_sha(self):
        for descriptor in [None,{'releaseId':'old-readonly-fixture','stateSha256':'0'*64}]:
            with tempfile.TemporaryDirectory() as directory:
                root=pathlib.Path(directory);state=root/'state';state.mkdir(mode=0o700)
                raw=json.dumps(self.old_baseline()).encode();(state/'current.json').write_bytes(raw)
                spec=video_plan()
                if descriptor:spec['supersedesUnpublished']=descriptor
                with self.assertRaises(Hold):session.MaintenanceSession(SimpleNamespace(stack=True,folder=root),spec,adapter=FixtureAdapter(),state_root=state)
                self.assertEqual((state/'current.json').read_bytes(),raw)

    def test_session_rolls_back_from_maintenance_before_sidecar_preparation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory); spec=video_plan(); adapter=FixtureAdapter()
            tx=SimpleNamespace(stack=True,folder=root,target='103.30.76.93',run=lambda _args:b'')
            adapter.rollback_media=lambda:media.MediaLifecycle(tx,spec).rollback()
            # The production rollback now seals ingress even when the media
            # sidecar has not yet been created. This fixture must observe the
            # same phase order; it is not a production drain receipt.
            adapter.prepare_rollback_ingress=lambda state: {'fromCandidate':False,'fixtureOnly':True}
            adapter.seal_rollback_ingress=lambda state, operation, reconcile: {'fixtureOnly':True}
            adapter.assert_rollback_ingress=lambda state: None
            current=session.MaintenanceSession(tx,spec,adapter=adapter,state_root=root/'state')
            for action in ['baseline','backup','maintenance','rollback']:
                current.step({'action':action,'operationId':str(uuid.uuid4()),'expectedRevision':current.state['revision']})
            self.assertEqual(current.state['phase'],'ROLLED_BACK')
            self.assertTrue(current.state['rollbackMedia']['mediaNotCreated'])
            self.assertFalse(current.state['rollbackMedia']['scratchDeleted'])

    def test_this_goal_does_not_read_or_depend_on_47_release_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            with patch.object(session, 'relative_artifact', side_effect=AssertionError('Unexpected 47 dependency')):
                current = session.MaintenanceSession(SimpleNamespace(stack=True, folder=root), video_plan(),
                    adapter=FixtureAdapter(), state_root=root/'state')
            self.assertEqual(current.state['target'], '103.30.76.93')
            self.assertEqual(current.state['phase'], 'NEW')

    def test_standing_authorization_is_only_for_this_goal_and_103(self):
        spec = video_plan()['authorization']
        authorization.authorize(spec, dt.datetime(2026, 10, 17, tzinfo=dt.timezone.utc))
        self.assertTrue(authorization.independent_hk(spec))
        for change in [dict(target='47.105.59.142'), dict(target='120.27.162.85'), dict(goalThread='another-goal'),
                       dict(scope='all-updates'), dict(userAcknowledgement='someone else said yes'),
                       dict(restoreDatabase=True), dict(replayAcceptedTasks=True)]:
            with self.assertRaises(Hold): authorization.authorize(dict(spec, **change))

    def test_media_cannot_be_attached_to_the_old_authorization_or_another_image(self):
        value = video_plan(); session.valid_plan(value)
        for mutate in [lambda v: v['authorization'].update(mode='one-time-maintenance'),
                       lambda v: v['mediaWorker'].update(image='sha256:' + 'b' * 64),
                       lambda v: v['mediaWorker'].update(memoryMiB=1024),
                       lambda v: v['mediaWorker'].update(cpu=True),
                       lambda v: v.update(runtimeTopology='separate-compiled-variants')]:
            bad = copy.deepcopy(value); mutate(bad)
            with self.assertRaises(Hold): session.valid_plan(bad)

    def test_media_memory_is_reserved_before_maintenance_and_swap_is_not_used(self):
        value = video_plan(); adapter = session.LiveAdapter(SimpleNamespace(), value)
        adapter.legacy_safety = lambda **_kwargs: None
        required = 1024 + 128 + 1024 + 3072
        adapter.available = lambda: required
        result = adapter.preflight('fixture')
        self.assertEqual(result['requiredMiB'], required); self.assertEqual(result['mediaBudgetMiB'], 3072)
        self.assertFalse(result['swapIncluded'])
        adapter.available = lambda: required - 1
        with self.assertRaisesRegex(Hold, 'MEMORY'): adapter.preflight('fixture')

    def test_app_admissions_close_before_media_drain_and_open_after_media_resume(self):
        adapter = session.LiveAdapter(SimpleNamespace(), video_plan()); calls = []
        instance = SimpleNamespace(mode=lambda action: calls.append('media-' + action))
        with patch.object(adapter, 'media', return_value=instance), patch.object(session.controls, 'control_app',
                side_effect=lambda _tx, _identity, action, _operation: calls.append('app-' + action)):
            adapter.app_control({}, 'drain', 'fixture'); adapter.app_control({}, 'resume', 'fixture')
        self.assertEqual(calls, ['app-drain', 'media-drain', 'media-resume', 'app-resume'])

    def test_busy_media_holds_after_app_drains(self):
        adapter = session.LiveAdapter(SimpleNamespace(), video_plan()); calls = []
        def busy(_action): raise Hold('MEDIA_JOBS_NOT_DRAINED')
        with patch.object(adapter, 'media', return_value=SimpleNamespace(mode=busy)), patch.object(session.controls, 'control_app',
                side_effect=lambda *_args: calls.append('app-drain')):
            with self.assertRaisesRegex(Hold, 'NOT_DRAINED'): adapter.app_control({}, 'drain', 'fixture')
        self.assertEqual(calls, ['app-drain'])

    def test_binding_preserves_database_and_denies_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory); scratch = folder / 'media-scratch'; scratch.mkdir()
            binding = {'name': 'naumi-video-media-' + 'a' * 12, 'commit': 'a' * 40,
                       'secret': 'b' * 64, 'scratch': str(scratch)}
            env = {'DATABASE_URL': 'synthetic-fixture-only', 'SETTINGS_SECRET': 'synthetic-existing-key'}; args = []
            media.apply_binding(env, args, binding, folder, 'a' * 40)
            self.assertEqual(env['DATABASE_URL'], 'synthetic-fixture-only')
            self.assertEqual(env['SETTINGS_SECRET'], 'synthetic-existing-key')
            self.assertEqual(env['MEDIA_JOB_DIR'], '/scratch')
            bad = dict(binding, scratch=str(folder))
            with self.assertRaisesRegex(Hold, 'SCRATCH'): media.apply_binding(env, [], bad, folder, 'a' * 40)


if __name__ == '__main__': unittest.main()
