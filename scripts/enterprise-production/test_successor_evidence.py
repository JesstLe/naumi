import copy
import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('audit', pathlib.Path(__file__).with_name('successor-evidence.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    image = 'sha256:' + 'a' * 64
    rows = [{'id': 'activity-one'}, {'id': 'activity-two'}]
    held = {'id': 'held-job', 'payload': 'PRIVATE_SHOULD_NOT_ESCAPE'}
    frozen = dict(rows=rows, held=held, sha256=m.digest(m.encoded(dict(rows=rows, held=held))))
    ids = {'web': '1' * 64, 'worker': '2' * 64}
    retired = ['3' * 64, '4' * 64]
    containers = {}
    manifest = dict(image=image, commit='b' * 40, gatewayDumpSha256='c' * 64, successorReleaseId=m.RELEASE)
    identities = {}
    for role, ident in ids.items():
        c = dict(Id=ident, Name='/new-' + role, Image=image, Config={'Env': ['PRIVATE_SECRET=NEVER_OUTPUT']}, HostConfig={'RestartPolicy': {'Name': 'no'}}, Mounts=[], NetworkSettings={'Networks': {'private': {}}}, State={'Running': True})
        containers[ident] = c
        pin = {k: c[k] for k in ['Id', 'Name', 'Image', 'Config', 'HostConfig', 'Mounts']}
        pin['Networks'] = ['private']
        identities[role] = {'id': ident, 'image': image, 'name': 'new-' + role, 'running': True}
        manifest[role] = {**identities[role], 'staticSha256': m.digest(m.encoded(pin))}
    operations = {name: {'phase': 'ACKNOWLEDGED'} for name in ['database-backup', 'gateway-switch', 'web-create', 'web-start', 'worker-create', 'worker-start', 'new-web-open', 'old-web-drain', 'old-worker-drain', 'new-worker-resume']}
    operations['gateway-switch']['receipt'] = {'afterDumpSha256': 'c' * 64}
    for ident, role in zip(retired, ['web', 'worker']):
        containers[ident] = dict(Id=ident, State={'Running': False}, HostConfig={'RestartPolicy': {'Name': 'no'}})
        operations['retire-' + ident[:12]] = {'phase': 'ACKNOWLEDGED', 'receipt': {'id': ident, 'name': 'old-' + role, 'running': False}}
    successor = dict(releaseId=m.RELEASE, phase='COMPLETE', commit='b' * 40, image=image, buildVersion='123', completedAt='2026-10-18T04:42:24Z', carriedActivityIds=[x['id'] for x in rows], heldJobId=held['id'], incidentSha256=frozen['sha256'], retired=retired, operations=operations, historicalDrainReclassified=False, paidOutputRecovered=False, **identities)
    successor['authorization'] = dict(target='47.105.59.142', date='2026-10-18', acknowledgement='保留未结事件，继续新版蓝绿', restoreDatabase=False, replayAcceptedTasks=False, historicalDrainReclassified=False, paidOutputRecovered=False)
    state = dict(target='47.105.59.142', releaseId=m.PREDECESSOR, phase='MIGRATED_CLEANUP_PENDING', legacyDrainProven=False, blueGreenSuccessor=successor, runtimeRecovery={'manifestPath': str(m.ROOT / 'supervisor-manifest.json'), 'manifestSha256': m.digest(m.encoded(manifest)), 'successorReleaseId': m.RELEASE})
    receipt = dict(phase='COMPLETE', commit=successor['commit'], image=image, version='123', historicalDrainProven=False, paidOutputRecovered=False, databaseRestored=False, supplierGenerationReplays=0, carriedIncidents=2, **identities)
    drain = dict(kind='composite-current-execution-with-preserved-incidents', currentExecutableWorkDrained=True, historicalDrainProven=False, unknownObservationsPreserved=2, incidentSha256=frozen['sha256'], rawApp={'identity': {'instanceId': 'old-web'}, 'admission': {'mode': 'draining'}, 'transport': {'verified': True, 'transport': {'completeFromProcessStart': True, 'accountingFault': False, 'activeRequests': 0, 'startedRequests': 10, 'finishedRequests': 10}}, 'observations': {**dict.fromkeys(['activeRequests', 'trackedRequests', 'trackedAcceptedWork', 'agentRuns'], 0), 'unknownLeases': 2}}, rawDomain=dict(drained=True, absentTables=[], counts=dict.fromkeys(['imageJobs', 'canvasImages', 'videoPolls', 'supplierCosts', 'imagegenItems'], 0), activeFences=0, activeTransactions=0, advisoryLocks=0), rawWorker=dict(instanceId='old-worker', paused=True, activeTicks=0, unresolvedTicks=0, phase='QUIESCENT', lastTick={'phase': 'complete'}), rawOwners=[{'state': 'idle'}])
    artifacts = {'transaction/PUBLICATION_RECEIPT.json': receipt, 'transaction/task-preservation-comparison.json': dict(preservationVerified=True, noMissingJobs=True, noOriginalSupplierMutation=True, unknownTables=[], violations=[]), 'transaction/current-execution-drain.json': drain, 'transaction/preserved-incidents.json': frozen, 'supervisor-manifest.json': manifest}
    return state, artifacts, containers


class EvidenceTests(unittest.TestCase):
    def run_audit(self, state, artifacts, containers, gateway='c' * 64):
        return m.verify_successor(state, lambda path: m.encoded(artifacts[path.relative_to(m.ROOT).as_posix()]), lambda ident: containers[ident], gateway)

    def test_complete_successor_preserves_history_and_never_authorizes_next(self):
        f = fixture()
        before = copy.deepcopy(f)
        r = self.run_audit(*f)
        self.assertTrue(r['verified'], r['errors'])
        self.assertFalse(r['historicalDrainProven'])
        self.assertFalse(r['nextReleaseAuthorized'])
        self.assertFalse(r['liveIncidentReconciliation'])
        self.assertEqual(len(r['artifacts']), 5)
        self.assertEqual(f, before)
        self.assertNotIn('PRIVATE_', json.dumps(r))

    def test_missing_successor_does_not_invent_completion(self):
        state, files, containers = fixture()
        del state['blueGreenSuccessor']
        self.assertFalse(self.run_audit(state, files, containers)['verified'])

    def test_bad_raw_drain_not_overridden_by_top_level_pass(self):
        for section, key in [('rawDomain', 'activeTransactions'), ('rawWorker', 'activeTicks')]:
            for value in [None, False, '0', 1]:
                with self.subTest(section=section, value=value):
                    state, files, containers = fixture()
                    files['transaction/current-execution-drain.json'][section][key] = value
                    self.assertFalse(self.run_audit(state, files, containers)['verified'])

    def test_rejects_mutations(self):
        changes = [
            lambda s, f, c: s['blueGreenSuccessor'].update(phase='READY'),
            lambda s, f, c: s['blueGreenSuccessor'].update(historicalDrainReclassified=True),
            lambda s, f, c: s['blueGreenSuccessor']['operations']['new-web-open'].update(phase='UNKNOWN'),
            lambda s, f, c: f.pop('transaction/PUBLICATION_RECEIPT.json'),
            lambda s, f, c: f['transaction/PUBLICATION_RECEIPT.json'].update(commit='d' * 40),
            lambda s, f, c: f['transaction/task-preservation-comparison.json'].update(violations=['lost']),
            lambda s, f, c: f['transaction/current-execution-drain.json']['rawApp']['transport']['transport'].update(finishedRequests=9),
            lambda s, f, c: f['transaction/current-execution-drain.json']['rawOwners'][0].update(state='active'),
            lambda s, f, c: f['transaction/current-execution-drain.json']['rawWorker'].update(instanceId='unrelated'),
            lambda s, f, c: f['transaction/preserved-incidents.json']['held'].update(payload='changed'),
            lambda s, f, c: s['blueGreenSuccessor'].update(heldJobId='wrong'),
            lambda s, f, c: s['runtimeRecovery'].update(manifestPath='/etc/secrets'),
            lambda s, f, c: s['runtimeRecovery'].update(manifestSha256='0' * 64),
            lambda s, f, c: c['1' * 64]['State'].update(Running=False),
            lambda s, f, c: c['1' * 64]['Config'].update(Env=['CHANGED']),
            lambda s, f, c: c['3' * 64]['State'].update(Running=True),
            lambda s, f, c: c['4' * 64]['HostConfig']['RestartPolicy'].update(Name='always'),
            lambda s, f, c: c.pop('3' * 64),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                state, files, containers = fixture()
                change(state, files, containers)
                r = self.run_audit(state, files, containers)
                self.assertFalse(r['verified'])
                self.assertTrue(r['errors'])
        self.assertFalse(self.run_audit(*fixture(), gateway='d' * 64)['verified'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
