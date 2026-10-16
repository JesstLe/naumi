#!/usr/bin/env python3
"""Offline lifecycle contract tests: no Docker, network, service or database I/O."""
import copy
import datetime as dt
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import hashlib

spec = importlib.util.spec_from_file_location('release_lifecycle', pathlib.Path(__file__).with_name('release_lifecycle.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
NOW = 1800000000.0
AT = dt.datetime.fromtimestamp(NOW, dt.timezone.utc).isoformat()
OLD_IMAGE = 'sha256:' + 'a' * 64
NEW_IMAGE = 'sha256:' + 'b' * 64
ANCIENT_IMAGE = 'sha256:' + 'c' * 64
COMMIT = '1' * 40


def slot(id, role, image=OLD_IMAGE):
    return dict(id=id, role=role, image=image, commit='0' * 40,
                running=True, restartPolicy='unless-stopped', startedAt=AT)


def plan():
    old = [slot('old-web', 'web'), slot('old-worker', 'worker'), slot('db', 'infra')]
    return {'schemaVersion': 1, 'evidenceMode': 'fixture', 'releaseId': 'fixture-release-1', 'target': 'fixture-host',
            'hostIdentitySha256': 'd' * 64,
            'commit': COMMIT, 'image': NEW_IMAGE, 'baseline': old, 'web': 'new-web',
            'worker': 'new-worker', 'retire': ['old-web', 'old-worker'],
            'baselineRoutes': {k: 'old-web' for k in m.ROUTES},
            'baselineExecutionTargets': {k: 'old-web' for k in m.EXECUTION_PATHS},
            'routingConfigSha256': {'baseline': 'a' * 64, 'unified': 'b' * 64},
            'budget': {'candidatePeakMiB': 1800, 'reservedMiB': 1024, 'minimumAvailableMiB': 1024},
            'affectedFeatures': ['all-live-routes', 'image.generate']}


def bind(p, s):
    s['evidence'] = {}
    fingerprint = m.digest({k: v for k, v in s.items() if k != 'evidence'})
    for kind in ['baseline', 'readiness', 'old-client-compatibility', 'backup-and-rollback',
                 'worker-handoff', 'continuity', 'retirement', 'rollback', 'abort']:
        s['evidence'][kind] = {'ok': True, 'observedAt': s['observedAt'],
                               'releaseId': p['releaseId'], 'planSha256': m.digest(p),
                               'target': p['target'], 'snapshotSha256': fingerprint,
                               'artifact': 'fixture://' + kind}
    return s


def snapshot(p, stage='preflight'):
    s = {'target': p['target'], 'evidenceMode': p['evidenceMode'], 'releaseId': p['releaseId'], 'planSha256': m.digest(p),
         'observedAt': AT, 'locksHeld': ['naumi', 'hub', 'reference-workbench'],
         'containers': copy.deepcopy(p['baseline']), 'routes': dict(p['baselineRoutes']),
         'executionTargets': dict(p['baselineExecutionTargets']),
         'routingConfigSha256': p['routingConfigSha256']['baseline'],
         'memory': {'availableMiB': 4096}, 'retainedReleases': [
             {'image': OLD_IMAGE, 'materialsReadable': True},
             {'image': ANCIENT_IMAGE, 'materialsReadable': True}], 'drain': {}}
    if stage in ['ready', 'switched', 'finish']:
        new = slot(p['web'], 'web', NEW_IMAGE); new['commit'] = COMMIT
        s['containers'].append(new)
    if stage in ['switched', 'finish']:
        s['routingConfigSha256'] = p['routingConfigSha256']['unified']
        s['routes'] = {k: p['web'] for k in m.ROUTES}
        s['executionTargets'] = {k: p['web'] for k in m.EXECUTION_PATHS}
    if stage == 'finish':
        new = slot(p['worker'], 'worker', NEW_IMAGE); new['commit'] = COMMIT
        s['containers'].append(new)
        for row in s['containers']:
            if row['id'] in p['retire']:
                row.update(running=False, restartPolicy='no')
                s['drain'][row['id']] = {k: 0 for k in m.DRAIN_FIELDS}
                s['drain'][row['id']]['observedAt'] = AT
    return bind(p, s)


class Lifecycle(unittest.TestCase):
    def setUp(self):
        self.p = plan()

    def blocked(self, stage, mutate, code, rebind=True):
        s = snapshot(self.p, stage)
        mutate(s)
        if rebind:
            bind(self.p, s)
        with self.assertRaisesRegex(m.Blocked, code):
            m.check(self.p, s, stage, NOW, NOW if stage == 'finish' else None)

    def test_all_valid_stages(self):
        for stage in ['preflight', 'ready', 'switched', 'finish', 'rollback', 'abort']:
            m.check(self.p, snapshot(self.p, stage), stage, NOW)

    def test_release_requires_full_commit(self):
        self.p['commit'] = 'short'
        with self.assertRaisesRegex(m.Blocked, 'FIXED_COMMIT'):
            m.valid_plan(self.p)

    def test_fixed_image_required(self):
        self.p['image'] = 'latest'
        with self.assertRaisesRegex(m.Blocked, 'FIXED_IMAGE'):
            m.valid_plan(self.p)

    def test_incomplete_route_manifest(self):
        del self.p['baselineRoutes']['canvas']
        with self.assertRaisesRegex(m.Blocked, 'COMPLETE_BASELINE'):
            m.valid_plan(self.p)

    def test_no_route_only_hotfix_plan(self):
        self.p['affectedFeatures'] = ['image.generate']
        with self.assertRaisesRegex(m.Blocked, 'FULL_APPLICATION'):
            m.valid_plan(self.p)

    def test_internal_execution_manifest_required(self):
        del self.p['baselineExecutionTargets']['worker-image-recovery']
        with self.assertRaisesRegex(m.Blocked, 'EXECUTION_GRAPH'):
            m.valid_plan(self.p)

    def test_all_old_apps_accounted_for(self):
        self.p['retire'] = ['old-web']
        with self.assertRaisesRegex(m.Blocked, 'UNACCOUNTED_LEGACY'):
            m.valid_plan(self.p)

    def test_infra_not_retired(self):
        self.p['retire'].append('db')
        with self.assertRaisesRegex(m.Blocked, 'INVALID_RETIRE'):
            m.valid_plan(self.p)

    def test_stale_snapshot(self):
        self.blocked('ready', lambda s: s.update(observedAt='2026-01-01T00:00:00Z'), 'STALE_OR_FUTURE')

    def test_future_snapshot(self):
        self.blocked('ready', lambda s: s.update(observedAt='2036-01-01T00:00:00Z'), 'STALE_OR_FUTURE')

    def test_timezone_required(self):
        self.blocked('ready', lambda s: s.update(observedAt='2026-01-01T00:00:00'), 'TIMEZONE')

    def test_unknown_memory(self):
        self.blocked('preflight', lambda s: s['memory'].update(availableMiB=None), 'MEM_AVAILABLE_UNKNOWN')

    def test_swap_does_not_count_as_ram(self):
        self.blocked('preflight', lambda s: s.update(memory={'availableMiB': 900, 'swapFreeMiB': 32768}), 'INSUFFICIENT_HOST_MEMORY')

    def test_candidate_peak_headroom(self):
        self.blocked('preflight', lambda s: s['memory'].update(availableMiB=2000), 'INSUFFICIENT_HOST_MEMORY')

    def test_forged_boolean_memory(self):
        self.blocked('ready', lambda s: s['memory'].update(availableMiB=True), 'MEM_AVAILABLE_UNKNOWN')

    def test_unknown_foreign_candidate(self):
        self.blocked('preflight', lambda s: s['containers'].append(slot('colleague-slot', 'web')), 'UNREGISTERED_INSTANCE')

    def test_duplicate_identity(self):
        self.blocked('ready', lambda s: s['containers'].append(s['containers'][0]), 'DUPLICATE_CONTAINER')

    def test_infra_restart(self):
        self.blocked('ready', lambda s: s['containers'][2].update(startedAt='changed'), 'PROTECTED_INFRA_CHANGED')

    def test_baseline_image_drift(self):
        self.blocked('ready', lambda s: s['containers'][0].update(image=ANCIENT_IMAGE), 'BASELINE_IDENTITY_CHANGED')

    def test_missing_third_lock(self):
        self.blocked('ready', lambda s: s.update(locksHeld=['naumi', 'hub']), 'THREE_LOCKS_REQUIRED')

    def test_candidate_wrong_commit(self):
        self.blocked('ready', lambda s: s['containers'][-1].update(commit='2' * 40), 'CANDIDATE_VERSION_MISMATCH')

    def test_no_readiness_receipt(self):
        self.blocked('ready', lambda s: s['evidence'].pop('readiness'), 'MISSING_OR_UNBOUND', False)

    def test_receipt_bound_to_snapshot(self):
        self.blocked('ready', lambda s: s['memory'].update(availableMiB=4000), 'MISSING_OR_UNBOUND', False)

    def test_old_frontend_receipt_required(self):
        self.blocked('ready', lambda s: s['evidence'].pop('old-client-compatibility'), 'MISSING_OR_UNBOUND', False)

    def test_worker_handoff_receipt_required(self):
        self.blocked('ready', lambda s: s['evidence'].pop('worker-handoff'), 'MISSING_OR_UNBOUND', False)

    def test_split_nginx_route(self):
        self.blocked('switched', lambda s: s['routes'].update(canvas='old-web'), 'SPLIT_APPLICATION_ROUTING')

    def test_internal_worker_bypassing_nginx(self):
        self.blocked('switched', lambda s: s['executionTargets'].update(**{'worker-image-recovery': 'old-web'}), 'SPLIT_EXECUTION_PATHS')

    def test_old_web_running(self):
        self.blocked('finish', lambda s: s['containers'][0].update(running=True), 'OLD_WEB_STILL_RUNNING')

    def test_old_slot_restart_enabled(self):
        self.blocked('finish', lambda s: s['containers'][0].update(restartPolicy='unless-stopped'), 'OLD_SLOT_NOT_RETIRED')

    def test_unknown_or_active_drain(self):
        for value in [None, 1, False, '0']:
            self.blocked('finish', lambda s: s['drain']['old-web'].update(agentSessions=value), 'DRAIN_UNKNOWN_OR_ACTIVE')

    def test_missing_drain_counter(self):
        self.blocked('finish', lambda s: s['drain']['old-web'].pop('acceptedTasks'), 'DRAIN_UNKNOWN_OR_ACTIVE')

    def test_drain_predates_cutover(self):
        self.blocked('finish', lambda s: s['drain']['old-web'].update(observedAt=dt.datetime.fromtimestamp(NOW - 30, dt.timezone.utc).isoformat()), 'EVIDENCE_PREDATES_TRANSITION')

    def test_old_worker_running(self):
        self.blocked('finish', lambda s: s['containers'][1].update(running=True), 'OLD_WORKER_STILL_RUNNING')

    def test_different_worker_image(self):
        self.blocked('finish', lambda s: s['containers'][-1].update(image=OLD_IMAGE), 'WORKER_VERSION_MISMATCH')

    def test_current_plus_one_old_not_two_rollbacks(self):
        self.blocked('finish', lambda s: s['retainedReleases'][1].update(image=NEW_IMAGE), 'TWO_ROLLBACK_RELEASES_REQUIRED')

    def test_unreadable_backup(self):
        self.blocked('finish', lambda s: s['retainedReleases'][0].update(materialsReadable=False), 'TWO_ROLLBACK_RELEASES_REQUIRED')

    def test_rollback_must_restore_internal_execution(self):
        self.blocked('rollback', lambda s: s['executionTargets'].update(**{'worker-image-recovery': 'new-web'}), 'ROLLBACK_EXECUTION_NOT_RESTORED')

    def test_rollback_allows_restarted_application(self):
        s = snapshot(self.p, 'rollback')
        s['containers'][0]['startedAt'] = 'restored-process-start'
        bind(self.p, s)
        m.check(self.p, s, 'rollback', NOW)

    def test_abort_candidate_auto_restart_blocked(self):
        new = slot('new-web', 'web', NEW_IMAGE); new['running'] = False
        self.blocked('abort', lambda s: s['containers'].append(new), 'CANDIDATE_STILL_RUNNING')

    def test_active_web_restart_disabled(self):
        self.blocked('finish', lambda s: s['containers'][-2].update(restartPolicy='no'), 'ACTIVE_ROLE_RESTART_POLICY')

    def test_fixture_not_live_evidence(self):
        self.blocked('ready', lambda s: s.update(evidenceMode='live'), 'EVIDENCE_MODE_MISMATCH')

    def test_missing_artifact_rejected_by_cli_boundary(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(m.Blocked, 'EVIDENCE_FILE_MISSING'):
                m.artifacts(snapshot(self.p), pathlib.Path(folder))

    def test_artifact_traversal_rejected(self):
        s=snapshot(self.p);s['evidence']['baseline']['artifact']='../outside.json'
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(m.Blocked, 'EVIDENCE_FILE_MISSING'):
                m.artifacts(s,pathlib.Path(folder))

    def test_failed_live_probe_marks_state_unknown(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            m.change(root,'begin',self.p,snapshot(self.p),now=NOW)
            m.change(root,'ready',self.p,snapshot(self.p,'ready'),0,NOW)
            m.record_failed_observation(root,'switched',self.p,1,'live graph changed')
            state=json.loads((root/'current.json').read_text('utf-8'))
            self.assertEqual(state['status'],'UNKNOWN')
            self.assertEqual(state['revision'],2)

    def test_complete_and_restart_persistence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            for action, stage, revision in [('begin','preflight',None),('ready','ready',0),('switched','switched',1),('finish','finish',2)]:
                result = m.change(root, action, self.p, snapshot(self.p, stage), revision, NOW)
            self.assertEqual(result['status'], 'COMPLETE')
            self.assertEqual(json.loads((root/'current.json').read_text('utf-8'))['status'], 'COMPLETE')

    def started(self, root):
        m.change(root,'begin',self.p,snapshot(self.p),now=NOW)
        m.change(root,'ready',self.p,snapshot(self.p,'ready'),0,NOW)
        m.change(root,'switched',self.p,snapshot(self.p,'switched'),1,NOW)

    def test_cleanup_debt_blocks_next_and_can_finish_later(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);self.started(root)
            s=snapshot(self.p,'finish');s['containers'][0]['running']=True;bind(self.p,s)
            with self.assertRaisesRegex(m.Blocked,'OLD_WEB_STILL_RUNNING'):
                m.change(root,'finish',self.p,s,2,NOW)
            state=json.loads((root/'current.json').read_text('utf-8'));self.assertEqual(state['status'],'CLEANUP_PENDING')
            other=plan();other['releaseId']='next'
            with self.assertRaisesRegex(m.Blocked,'UNFINISHED_RELEASE'):
                m.change(root,'begin',other,snapshot(other),now=NOW)
            result=m.change(root,'finish',self.p,snapshot(self.p,'finish'),3,NOW)
            self.assertEqual(result['status'],'COMPLETE')

    def test_failed_rollback_is_durable(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);self.started(root)
            with self.assertRaisesRegex(m.Blocked,'ROLLBACK_'):
                m.change(root,'rollback',self.p,snapshot(self.p,'switched'),2,NOW)
            self.assertEqual(json.loads((root/'current.json').read_text('utf-8'))['status'],'ROLLBACK_FAILED')

    def test_unknown_switch_is_durable(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            m.change(root,'begin',self.p,snapshot(self.p),now=NOW)
            m.change(root,'ready',self.p,snapshot(self.p,'ready'),0,NOW)
            s=snapshot(self.p,'switched');s['routes']['canvas']='old-web';bind(self.p,s)
            with self.assertRaisesRegex(m.Blocked,'SPLIT_APPLICATION'):
                m.change(root,'switched',self.p,s,1,NOW)
            self.assertEqual(json.loads((root/'current.json').read_text('utf-8'))['status'],'UNKNOWN')

    def test_cas_prevents_concurrent_or_stale_writer(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);m.change(root,'begin',self.p,snapshot(self.p),now=NOW)
            with self.assertRaisesRegex(m.Blocked,'REVISION_CONFLICT'):
                m.change(root,'ready',self.p,snapshot(self.p,'ready'),7,NOW)

    def test_rollback_exact_state_without_mutating_input(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);self.started(root)
            s=snapshot(self.p,'rollback');before=copy.deepcopy(s)
            result=m.change(root,'rollback',self.p,s,2,NOW)
            self.assertEqual(result['status'],'ROLLED_BACK');self.assertEqual(s,before)

    def test_root_lock_rejects_second_writer(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            with m.file_lock(root):
                with self.assertRaises(OSError):
                    m.change(root,'begin',self.p,snapshot(self.p),now=NOW)


class HostObservation(unittest.TestCase):
    def observed(self, stage, alter=None):
        p=plan();machine=b'fixture-machine-id';config=b'fixture nginx -T\n'
        p['hostIdentitySha256']=hashlib.sha256(machine).hexdigest()
        p['routingConfigSha256']={k:hashlib.sha256(config).hexdigest()for k in ['baseline','unified']}
        s=snapshot(p,stage);raw=[]
        for row in s['containers']:
            env=['SOURCE_COMMIT='+row['commit']]
            if row['role']=='worker':env.append('NAUMI_APP_ORIGIN=http://'+('new-web'if row['id']=='new-worker'else'old-web')+':3000')
            raw.append({'Id':row['id'],'Name':'/'+row['id'],'Image':row['image'],
                        'Config':{'Env':env},'State':{'Running':row['running'],'StartedAt':row['startedAt']},
                        'HostConfig':{'RestartPolicy':{'Name':row['restartPolicy']}}})
        if alter:alter(p,s,raw)
        def command(args,**kwargs):
            if args[:2]==['docker','ps']:return ' '.join(row['Id']for row in raw).encode()
            if args[:2]==['docker','inspect']:return json.dumps(raw).encode()
            if args==['nginx','-T']:return config
            raise AssertionError(args)
        with mock.patch.object(m.subprocess,'check_output',side_effect=command),mock.patch.object(m.pathlib.Path,'read_bytes',return_value=machine),mock.patch.object(m.pathlib.Path,'read_text',return_value='MemAvailable: 8388608 kB\nSwapFree: 8388608 kB\n'):
            m.verify_live(p,s,stage)

    def test_actual_inventory_baseline(self):
        self.observed('preflight')

    def test_actual_inventory_finished(self):
        self.observed('finish')

    def test_live_worker_still_on_old_web(self):
        with self.assertRaisesRegex(m.Blocked,'LIVE_WORKER_RECOVERY_TARGET_UNVERIFIED'):
            self.observed('switched')

    def test_foreign_live_slot_blocks(self):
        def alter(p,s,raw):
            other=copy.deepcopy(raw[0]);other['Id']='foreign';raw.append(other)
        with self.assertRaisesRegex(m.Blocked,'UNREGISTERED_LIVE_INSTANCE'):
            self.observed('preflight',alter)

    def test_actual_gateway_differs(self):
        with self.assertRaisesRegex(m.Blocked,'LIVE_GATEWAY_SNAPSHOT_MISMATCH'):
            self.observed('preflight',lambda p,s,r:s.update(routingConfigSha256='0'*64))

    def test_actual_image_differs(self):
        with self.assertRaisesRegex(m.Blocked,'LIVE_CONTAINER_SNAPSHOT_MISMATCH'):
            self.observed('preflight',lambda p,s,r:r[0].update(Image=NEW_IMAGE))

    def test_actual_machine_differs(self):
        with self.assertRaisesRegex(m.Blocked,'LOCAL_HOST_TARGET_NOT_VERIFIED'):
            self.observed('preflight',lambda p,s,r:p.update(hostIdentitySha256='0'*64))


if __name__ == '__main__':
    unittest.main()
