"""Read-only --check for the owned Linux rollback rehearsal, never a live publisher."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

OWNER = 'canvas-video-fusion-20261013'
BASELINES = {
    '8af8ee6ee83579fed34a01ac5db86326f9602e3e': 'sha256:7b33a2d9af996b10152a732c5cda0d36257e296eedbbef21530f1044e1c88726',
    'c05a923e830d27aafcb1c0856dc15181dc21d92b': 'sha256:5aa9408f331996f4773743dd96c751cb0ef1df43ddc8cbbb26fa56e2ccd9691c',
}
CANDIDATE = 'e997b290b39fc9df63e4c3b6387fa008b7b0e18d'
LEGACY_KEYS = set(('modes durationResolutionMap aspectRatios audio limits defaultDurationSeconds defaultResolution defaultAspectRatio supportsAutoDuration requiresPrompt supportsFirstFrame supportsLastFrame supportsNegativePrompt supportsWatermark supportsMultiShot supportsElements supportsCamera supportsExactSize supportsCancellation maxPromptChars maxNegativePromptChars maxShots maxElements maxElementReferences providerOptions').split())


def command(*args):
    return subprocess.check_output(args, text=True, timeout=30).strip()


def file_digest(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', required=True)
    parser.add_argument('descriptor', type=Path)
    args = parser.parse_args()
    data = json.loads(args.descriptor.read_text())
    assert data['owner'] == OWNER and data['scope'] == 'isolated-linux-fixture'
    assert data['baselineCommit'] in BASELINES and data['candidateCommit'] == CANDIDATE
    assert data['baselineImage'] == BASELINES[data['baselineCommit']]
    for key, commit in [('baselineImage', data['baselineCommit']), ('candidateImage', CANDIDATE)]:
        assert re.fullmatch(r'sha256:[a-f0-9]{64}', data[key])
        info = json.loads(command('docker', 'image', 'inspect', data[key]))[0]
        assert info['Id'] == data[key]
        environment = dict(value.split('=', 1) for value in info['Config']['Env'])
        assert environment['SOURCE_COMMIT'] == commit
    assert file_digest(data['databaseBackup']) == data['backupSha256']
    assert file_digest(data['candidateSourceArchive']) == data['candidateSourceSha256']
    container = data['databaseContainer']
    assert container == 'video-fusion-linux-db-20261017'
    assert command('docker', 'inspect', container, '--format', '{{index .Config.Labels "owner"}}') == OWNER
    assert command('docker', 'inspect', 'video-fusion-linux-sdk-20261017', '--format', '{{.HostConfig.NetworkMode}}') == 'none'
    database, schema = data['database'], data['schema']
    assert re.fullmatch(r'naumi_video_fixture_restore_[a-f0-9]{32}', database)
    assert re.fullmatch(r'video_run_[a-f0-9]{32}', schema)

    def query(sql):
        return command('docker', 'exec', '-e', f'PGOPTIONS=-c default_transaction_read_only=on -c search_path={schema}', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'video_fixture', '-d', database, '-Atc', sql)

    assert query('SELECT owner FROM public.naumi_video_fixture_guard') == OWNER
    assert query('SELECT current_database()') == database
    snapshot = "SELECT md5(COALESCE(string_agg(value::text,',' ORDER BY model_version,upstream_id),'')) FROM app_video_model_defaults"
    before = query(snapshot)
    keys = set(query("SELECT DISTINCT jsonb_object_keys(value->'definition') FROM app_video_model_defaults").splitlines())
    assert keys and keys <= LEGACY_KEYS, 'ROLLBACK_INCOMPATIBLE_NEW_VIDEO_DEFINITION'
    active = int(query("SELECT count(*) FROM app_video_tasks WHERE status IN ('queued','processing','running','creating','submitted','creation_unknown')"))
    assert active == 0, 'ROLLBACK_TASKS_NOT_DRAINED'
    assert before == query(snapshot)
    print(json.dumps({'ok': True, 'scope': data['scope'], 'readOnlyCheck': True, 'runtimeImagesPinned': True, 'backupAndSourceHashesVerified': True, 'legacyDefinitionCompatible': True, 'activeTasks': active, 'frozenDefaultsHashUnchanged': True, 'productionBaselineRefreshed': False}))


if __name__ == '__main__':
    main()
