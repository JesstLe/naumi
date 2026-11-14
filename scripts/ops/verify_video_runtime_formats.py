#!/usr/bin/env python3
"""Local isolated PG + actual fixed-package rollback compatibility evidence.

No site operations, paid requests or schema changes outside a random fixture.
The generated query is the actual release guard, not a replacement evaluator.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile
import shutil
import uuid

import release47_video_profile_guard as guard


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=pathlib.Path, required=True)
    parser.add_argument('--bundle', type=pathlib.Path, required=True)
    parser.add_argument('--pg-container', default='naumi-video-compiler-pg-20261114')
    parser.add_argument('--historical-image', default='sha256:ae302f798c03ec9e1ad8fae82e07d2bcc542dcd5c1fd240ed63198ec48c290bb')
    parser.add_argument('--modern-image')
    args = parser.parse_args()
    assert args.pg_container == 'naumi-video-compiler-pg-20261114', 'LOCAL_FIXTURE_DB_ONLY'
    assert args.historical_image.startswith('sha256:') and len(args.historical_image) == 71
    args.evidence.mkdir(parents=True, exist_ok=True)
    schema = 'video_formats_' + uuid.uuid4().hex
    checks, commands = [], []

    def run(argv, stdin=None):
        result = subprocess.run(argv, input=stdin, capture_output=True)
        commands.append({'command': argv, 'exit': result.returncode,
                         'inputSha256': hashlib.sha256(stdin).hexdigest() if stdin else None,
                         'output': result.stdout.decode(errors='replace'),
                         'stderr': result.stderr.decode(errors='replace')})
        assert result.returncode == 0, result.stderr.decode(errors='replace')
        return result.stdout.decode()

    def pg(sql):
        return run(['docker', 'exec', '-i', args.pg_container, 'psql', '-U', 'postgres',
                    '-d', 'video_compiler_fixture', '-XqAt', '-v', 'ON_ERROR_STOP=1'],
                   ('SET search_path TO '+schema+';'+sql).encode())

    def check(name, ok):
        assert ok, name
        checks.append(name)

    try:
        pg('CREATE SCHEMA '+schema+''';
CREATE TABLE app_video_tasks(id text PRIMARY KEY,status text,provider_snapshot jsonb,parameters jsonb,capability_snapshot jsonb,model text);
CREATE TABLE app_model_config_versions(version integer,digest text,config jsonb);
CREATE TABLE app_video_workflow_runs(id uuid PRIMARY KEY,execution_version integer,plan jsonb,public_frozen_nodes jsonb,frozen_nodes_enc text);
CREATE TABLE app_video_workflow_run_nodes(run_id uuid,node_id text,status text);
INSERT INTO app_video_tasks VALUES ('legacy','completed','{}','{}','{}','old'),
('v2','needs_attention','{}','{"version":2,"submissionState":"sending"}','{}','old');
''')
        for version in range(1, 6):
            parameters = json.dumps({'version': 3, 'compiledPlanEnc': 'NEVER_DUMP_CIPHERTEXT',
                                     'compiledPlanDigest': 'a'*64, 'submissionState': 'sending'})
            pg("INSERT INTO app_video_tasks VALUES ('v3-%d','completed','{}','%s','{\"planVersion\":%d}','new');" %
               (version, parameters, version))
        pg("INSERT INTO app_video_workflow_runs VALUES ('%s',1,'{\"nodes\":[]}','{}','NEVER_DUMP_WORKFLOW');" % uuid.uuid4())
        tables = dict.fromkeys(guard.SCHEMA_KEYS, True); tables['defaults'] = False

        def snapshot():
            value = pg(guard.build_readonly_sql(tables))
            check('NO_SECRETS_IN_SCAN_'+str(len(checks)), 'NEVER_DUMP' not in value)
            return json.loads(value)

        def immutable_hash():
            value = pg("SELECT jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM app_video_tasks t),'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM app_video_workflow_runs r));")
            return hashlib.sha256(value.encode()).hexdigest()

        before = immutable_hash()
        sample = snapshot()
        (args.evidence/'SNAPSHOT.json').write_text(json.dumps(sample, indent=2))
        check('ACTUAL_READ_ONLY_SNAPSHOT', sample['readOnly'] == 'on')
        check('TERMINAL_V3_HISTORY_INCLUDED', sample['taskCount'] == 1 and sample['formatSummary']['taskCount'] == 7)
        check('ENCRYPTED_WORKFLOW_WITHOUT_STAGE_OR_TASK_INCLUDED', sample['workflowCount'] == 0 and sample['formatSummary']['workflowCount'] == 1)
        check('MISSING_PRIOR_DESCRIPTOR_BLOCKS', not guard.evaluate(sample)['safe'])
        modern_result = json.loads(run(['node', '--input-type=commonjs', '-e', guard.RUNTIME_PACKAGE_PROBE,
                                       str(args.bundle.resolve())]))
        contract = modern_result['videoRuntimeFormats']
        check('ACTUAL_MODIFIED_BUNDLE_HASH_AND_DESCRIPTOR', modern_result['bundleVerified'] and contract is not None)
        check('CURRENT_READERS_ACCEPT_ALL_FIVE_PLANS_AND_WORKFLOW', guard.evaluate(sample, runtime_formats=contract)['safe'])
        old_result = json.loads(run(['docker', 'run', '--rm', '--network=none', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--memory=256m', '--pids-limit=32',
            '-e', 'NODE_OPTIONS=', '--entrypoint=node', args.historical_image,
            '--input-type=commonjs', '-e', guard.RUNTIME_PACKAGE_PROBE]))
        check('REAL_FIXED_PRIOR_HAS_NO_DESCRIPTOR', old_result['videoRuntimeFormats'] is None)
        check('REAL_FIXED_PRIOR_NOT_CERTIFIED_FOR_V3', not guard.evaluate(sample, runtime_formats=old_result['videoRuntimeFormats'])['safe'])
        if args.modern_image:
            assert args.modern_image.startswith('sha256:') and len(args.modern_image) == 71
            name = 'naumi-video-format-metadata-' + uuid.uuid4().hex[:12]
            identity = run(['docker', 'create', '--network=none', '--entrypoint=node', '--name', name,
                            args.modern_image, '-e', 'process.exit(0)']).strip()
            try:
                class Tx:
                    def inspect(self, target): return json.loads(run(['docker', 'inspect', target]))[0]
                    def run(self, argv, **kwargs): return run(argv)
                actual = guard.read_runtime_formats(Tx(), {'id': identity, 'image': args.modern_image})
                check('REAL_EXISTING_GUARD_READS_PINNED_STOPPED_PACKAGE', actual == contract)
                check('PINNED_MODERN_IMAGE_ACCEPTS_FORMATS_ONLY', guard.evaluate(sample, runtime_formats=actual)['safe'])
            finally:
                run(['docker', 'rm', identity])
        # Keep the actual bundled external dependencies resolvable. Otherwise
        # a missing pg module would be mistaken for descriptor-drift rejection.
        with tempfile.TemporaryDirectory(prefix='naumi-video-format-tamper-', dir=args.bundle.resolve().parent) as folder:
            target = pathlib.Path(folder)
            for name in ['manifest.json', 'application.cjs']:
                shutil.copyfile(args.bundle/name, target/name)
            manifest = json.loads((target/'manifest.json').read_text())
            manifest['videoRuntimeFormats']['compiledPlanVersions'] = [1]
            (target/'manifest.json').write_text(json.dumps(manifest))
            command = ['node', '--input-type=commonjs', '-e', guard.RUNTIME_PACKAGE_PROBE, str(target)]
            result = subprocess.run(command, capture_output=True)
            check('ACTUAL_DESCRIPTOR_FORGERY_REJECTED', result.returncode != 0 and b'VIDEO_RUNTIME_DESCRIPTOR_DRIFT' in result.stderr)
            (target/'application.cjs').write_bytes(b'not the pinned application bundle')
            result = subprocess.run(command, capture_output=True)
            check('ACTUAL_BUNDLE_BYTE_DRIFT_REJECTED', result.returncode != 0 and b'VIDEO_RUNTIME_BUNDLE_HASH_CHANGED' in result.stderr)
        check('UNKNOWN_AND_ALL_HISTORY_BYTES_UNCHANGED', immutable_hash() == before)
        pg('ALTER TABLE app_video_workflow_runs DROP COLUMN execution_version;')
        tables['workflowExecutionVersion'] = False
        sample = snapshot()
        check('CONFIRMED_OLD_COLUMN_ABSENCE_READS_VERSION_ZERO', sample['formatSummary']['workflowFormats'] == [{'version': 0, 'count': 1}])
        check('V3_HISTORY_STILL_BLOCKS_WITH_OLD_WORKFLOW_SCHEMA', not guard.evaluate(sample)['safe'])
        result = {'status': 'PASS', 'checks': checks, 'count': len(checks), 'schema': schema,
                  'modernPackage': modern_result, 'historicalPackage': old_result,
                  'immutableBefore': before, 'siteWrites': 0, 'paidCalls': 0, 'taskReplay': 0}
        (args.evidence/'RESULT.json').write_text(json.dumps(result, indent=2))
        print('VIDEO_FORMAT_PG_PACKAGE=PASS CHECKS='+str(len(checks))+' TASK_FORMATS=7 WORKFLOW_WITHOUT_STAGE=1 PAID_CALLS=0 SITE_WRITES=0')
    finally:
        pg('DROP SCHEMA '+schema+' CASCADE;')
        (args.evidence/'COMMANDS.json').write_text(json.dumps(commands, indent=2))
        print('VIDEO_FORMAT_FIXTURE_CLEANUP=PASS SCHEMA_DROPPED=1')


if __name__ == '__main__': main()
