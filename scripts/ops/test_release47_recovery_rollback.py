import copy
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import release47_recovery_rollback as rollback


class Fake:
    def __init__(self):
        self.current = {'bootId': 'workerboot', 'revision': 3, 'paused': False, 'activeTicks': 0,
                       'unresolvedTicks': 0, 'lastTick': {'id': 'original', 'phase': 'complete'}}
        self.requests = []

    def control(self, _, body):
        self.requests.append(body); self.current['paused'] = True
        return {'receipt': {'action': 'drain', 'operationId': body['operationId']}}

    def status(self, spec):
        if spec['role'] == 'web': return {'admission': {'mode': 'open'}}
        return copy.deepcopy(self.current)

    def inspect(self, _): return {'Id': 'web', 'Name': '/web', 'Image': 'image',
        'State': {'Running': True, 'StartedAt': 'same'}, 'HostConfig': {'RestartPolicy': {'Name': 'no'}}}


class Rollback(unittest.TestCase):
    def test_real_rollback_function_disables_only_timer_and_drains_exact_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            adapter = Fake(); calls = []
            class Tx:
                def run(self, argv): calls.append(argv); return b''
            manifest = {'worker': {'role': 'worker'}, 'web': {'role': 'web'}}
            web = rollback.public_identity(adapter.inspect(None))
            with patch.object(rollback, 'check', return_value=(adapter, web, adapter.status({'role': 'worker'}))):
                result = rollback.apply(Tx(), manifest, folder)
                again = rollback.apply(Tx(), manifest, folder)
            self.assertEqual(calls, [['systemctl', 'disable', '--now', 'naumi47-recovery.timer']] * 2)
            self.assertEqual(result['request']['operationId'], again['request']['operationId'])
            self.assertEqual(adapter.requests[0]['action'], 'drain')
            self.assertTrue(result['webUnchanged']); self.assertFalse(result['databaseRestored'])
            self.assertEqual(result['result'], 'SUPERVISOR_DISABLED_SUCCESSOR_PAUSED_WEB_OPEN')

    def test_new_boot_uses_new_rollback_journal_not_stale_uuid(self):
        with tempfile.TemporaryDirectory() as folder:
            adapter = Fake()
            class Tx:
                def run(self, argv): return b''
            manifest = {'worker': {'role': 'worker'}, 'web': {'role': 'web'}}
            web = rollback.public_identity(adapter.inspect(None))
            with patch.object(rollback, 'check', side_effect=lambda *_: (adapter, web, adapter.status({'role': 'worker'}))):
                first = rollback.apply(Tx(), manifest, folder)
                adapter.current.update(bootId='newboot', paused=False)
                second = rollback.apply(Tx(), manifest, folder)
            self.assertNotEqual(first['request']['operationId'], second['request']['operationId'])
            self.assertEqual(len(list(pathlib.Path(folder).glob('rollback-*.json'))), 2)


if __name__ == '__main__': unittest.main()
