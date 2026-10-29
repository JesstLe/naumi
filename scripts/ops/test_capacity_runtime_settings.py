"""Cadence environment propagation only; all host/container I/O is mocked."""
import argparse
import copy
import importlib.util
import io
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

import release47_controls
from release47_host import Hold, environment, public_identity
from test_release47_controls import CombinedMediaControls

M = release47_controls


class RuntimeSettings(unittest.TestCase):
    def setUp(self):
        fixture = CombinedMediaControls()
        fixture.setUp()
        self.web, self.worker = fixture.web, fixture.worker

    def set_env(self, row, **values):
        env = environment(row)
        env.update(values)
        row['Config']['Env'] = [k + '=' + v for k, v in env.items()]

    def test_default_remains_absent_and_config_is_exact(self):
        self.assertEqual(M.worker_interval_settings({}), {})
        for value in ['5000', '9000', '15000', '2147483647']:
            self.assertEqual(M.worker_interval_settings({'VIDEO_WORKER_INTERVAL_MS': value}),
                             {'VIDEO_WORKER_INTERVAL_MS': value})
        for value in ['', '0', '-1', '4999', '1.5', '1e4', '2147483648', 'private-fixture']:
            with self.subTest(value=value), self.assertRaisesRegex(Hold, '^INVALID_WORKER_INTERVAL$'):
                M.worker_interval_settings({'VIDEO_WORKER_INTERVAL_MS': value})

    def test_validation_accepts_matching_cadence_rejects_drift(self):
        M._validate_combined_worker(self.worker, self.web)
        self.set_env(self.web, VIDEO_WORKER_INTERVAL_MS='9000')
        self.set_env(self.worker, VIDEO_WORKER_INTERVAL_MS='9000')
        M._validate_combined_worker(self.worker, self.web)
        self.set_env(self.worker, VIDEO_WORKER_INTERVAL_MS='15000')
        with self.assertRaisesRegex(Hold, 'COMBINED_WORKER_INTERVAL_CHANGED'):
            M._validate_combined_worker(self.worker, self.web)

    def test_invalid_cadence_precedes_state_directory_and_create(self):
        self.set_env(self.web, VIDEO_WORKER_INTERVAL_MS='not-a-number')
        tx = Mock()
        tx.pin.return_value = self.web
        with patch.object(M.pathlib, 'Path') as path, self.assertRaisesRegex(Hold, '^INVALID_WORKER_INTERVAL$'):
            M.clone_worker(tx, public_identity(self.web), name=self.worker['Name'].lstrip('/'),
                           memory_mib=1024, cpu=1, state_dir='/unused-fixture', reviewed_combined_media=True)
        path.assert_not_called()
        tx.run.assert_not_called()

    def test_clone_forwards_only_reviewed_cadence_and_keeps_bounded_profile(self):
        self.set_env(self.web, VIDEO_WORKER_INTERVAL_MS='9000', DATABASE_URL='synthetic-not-copied')
        self.worker['State']['Running'] = False
        with tempfile.TemporaryDirectory() as directory:
            tx = Mock()
            tx.folder = pathlib.Path(directory)
            tx.pin.return_value = self.web
            def run(args):
                self.assertEqual(args[:2], ['docker', 'create'])
                env = dict(line.split('=', 1) for line in pathlib.Path(args[args.index('--env-file') + 1]).read_text().splitlines())
                self.worker['Config']['Env'] = [k + '=' + v for k, v in env.items()]
                return (self.worker['Id'] + '\n').encode()
            tx.run.side_effect = run
            tx.inspect.return_value = self.worker
            real_path = pathlib.Path
            state = '/opt/naumi-staging/releases/fixture/runtime-worker'
            fake = Mock()
            fake.is_absolute.return_value = True
            fake.is_symlink.return_value = False
            fake.resolve.return_value.is_relative_to.return_value = True
            with patch.object(M.pathlib, 'Path', side_effect=lambda value: fake if str(value) == state else real_path(value)), patch.object(M.os, 'chown', create=True):
                M.clone_worker(tx, public_identity(self.web), name=self.worker['Name'].lstrip('/'),
                               memory_mib=1024, cpu=1, state_dir=state,
                               reviewed_combined_media=True, reviewed_runtime_memory=True)
            env = environment(self.worker)
            self.assertEqual(env['VIDEO_WORKER_INTERVAL_MS'], '9000')
            self.assertEqual(env['UV_THREADPOOL_SIZE'], '2')
            self.assertEqual(env['MEDIA_WORKER_CONCURRENCY'], '1')
            self.assertNotIn('DATABASE_URL', env)
            self.assertEqual(list(pathlib.Path(directory).iterdir()), [])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=pathlib.Path)
    args = parser.parse_args()
    if args.source:
        spec = importlib.util.spec_from_file_location('runtime_controls_source', args.source / 'scripts/ops/release47_controls.py')
        M = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(M)
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream, verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(RuntimeSettings))
    for test, _ in result.failures + result.errors:
        print('FAIL ' + test._testMethodName)
    failures = len(result.failures) + len(result.errors)
    print(f'CAPACITY_RUNTIME_CONTROLS passed={result.testsRun - failures} failed={failures}')
    if failures:
        print(stream.getvalue())
    raise SystemExit(0 if result.wasSuccessful() else 1)
