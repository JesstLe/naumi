#!/usr/bin/env python3
"""Seal the runtime-settings slice; test source, preimage and guarded-copy rollback.

No checkout, server/container lifecycle, dotenv, production DB or supplier I/O.
Dependencies live in the task's own evidence/tooling directory.
"""
import argparse
import difflib
import hashlib
import io
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASELINE = 'c328f01c5a1854bce271fa53e64d324986df9329'
FILES = [
    'scripts/ops/release47_controls.py', 'scripts/video-worker-with-media.mjs',
    'scripts/verify-imagegen-parent-completion.cjs', 'scripts/verify-video-coordination-pool.cjs',
    'src/lib/db/connection.ts', 'src/lib/image-job-queue.ts',
    'src/lib/runtime/positive-integer.ts', 'src/lib/video/coordination-pool.ts',
    'src/lib/video/worker-settings.ts', 'src/lib/video/worker.ts', 'src/lib/video/workflow.ts',
]
ALLOW_ENV = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC',
             'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA'}
sha = lambda raw: hashlib.sha256(raw).hexdigest()

ROLLBACK_PY = '''import hashlib, json, os, pathlib, sys, tempfile
base = pathlib.Path(__file__).resolve().parent
manifest = json.loads((base / "SOURCE_HASHES.json").read_text(encoding="utf-8"))
sha = lambda raw: hashlib.sha256(raw).hexdigest()
if len(sys.argv) != 2:
    print("ROLLBACK_TARGET_COPY_REQUIRED writes=0"); raise SystemExit(3)
root = pathlib.Path(sys.argv[1]).resolve()
if root == pathlib.Path(manifest["sourceRoot"]).resolve() or (root / ".git").exists() or not (root / ".capacity-runtime-fixture").is_file():
    print("ROLLBACK_TARGET_COPY_REQUIRED writes=0"); raise SystemExit(3)
lock = root / ".capacity-runtime-rollback.lock"
try: descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print("ROLLBACK_COPY_BUSY writes=0"); raise SystemExit(3)
os.close(descriptor)
staged = []
try:
    entries = []
    def preflight():
        for row in manifest["files"]:
            target = root / row["path"]
            original = base / "baseline" / row["path"]
            if target.is_symlink() or not target.resolve().is_relative_to(root) or not target.is_file() or sha(target.read_bytes()) != row["modifiedSha256"]:
                print("ROLLBACK_PREFLIGHT_FAILED " + row["path"] + " writes=0"); raise SystemExit(3)
            if row["baselineSha256"] and (not original.is_file() or sha(original.read_bytes()) != row["baselineSha256"]):
                print("ROLLBACK_ORIGINAL_HASH_FAILED " + row["path"] + " writes=0"); raise SystemExit(3)
    preflight()
    for row in manifest["files"]:
        target = root / row["path"]
        original = (base / "baseline" / row["path"]).read_bytes() if row["baselineSha256"] else None
        entries.append((target, original, target.read_bytes()))
        if original is not None:
            fd, temporary = tempfile.mkstemp(prefix=".runtime-rollback-", dir=target.parent)
            with os.fdopen(fd, "wb") as stream: stream.write(original)
            staged.append(pathlib.Path(temporary))
        else: staged.append(None)
    preflight()  # all hashes again, before the first source write
    applied = []
    try:
        for (target, original, current), temporary in zip(entries, staged):
            if temporary is None: target.unlink()
            else: os.replace(temporary, target)
            applied.append((target, current))
    except BaseException:
        for target, current in reversed(applied): target.write_bytes(current)
        raise
    for target, original, _ in entries:
        assert (not target.exists()) if original is None else target.read_bytes() == original
    print("ROLLBACK_APPLIED files=" + str(len(entries)) + " restored=baseline")
finally:
    for temporary in staged:
        if temporary is not None: temporary.unlink(missing_ok=True)
    lock.unlink(missing_ok=True)
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bash', default='D:/DEV/Git/bin/bash.exe')
    args = parser.parse_args()
    evidence = ROOT / 'audit-artifacts/capacity-runtime-settings'
    evidence.mkdir(parents=True, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if k.upper() in ALLOW_ENV}
    env.update(PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1',
               NODE_PATH=str(evidence / 'tooling/node_modules'))
    node = shutil.which('node', path=env.get('PATH', env.get('Path')))
    assert node and pathlib.Path(args.bash).is_file()
    runs = []
    def run(label, command, expected):
        result = subprocess.run(command, cwd=ROOT, env=env, encoding='utf-8', errors='strict', capture_output=True, timeout=90)
        record = {'label': label, 'command': command, 'cwd': str(ROOT), 'input': 'synthetic fixtures embedded in the named test script; environment allowlist, no stdin',
                  'stdout': result.stdout, 'stderr': result.stderr, 'exitStatus': result.returncode}
        runs.append(record)
        (evidence / (label + '.log')).write_text(result.stdout + result.stderr, encoding='utf-8')
        (evidence / 'RUNS.json').write_text(json.dumps(runs, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(label + ' exit=' + str(result.returncode), flush=True)
        if result.stdout: print(result.stdout.rstrip().splitlines()[-1], flush=True)
        assert result.returncode == expected, label + ' unexpected exit; see task evidence log'
        return record

    manifest = {'baselineCommit': BASELINE, 'sourceRoot': str(ROOT), 'files': []}
    patch = []
    for name in FILES:
        git = subprocess.run(['git', 'show', BASELINE + ':' + name], cwd=ROOT, env=env, capture_output=True)
        saved = evidence / 'baseline' / name
        if git.returncode == 0:
            if not saved.exists():
                saved.parent.mkdir(parents=True, exist_ok=True)
                saved.write_bytes(git.stdout)
            before = saved.read_bytes()
            assert before.replace(b'\r\n', b'\n') == git.stdout.replace(b'\r\n', b'\n'), 'ORIGINAL_SOURCE_DRIFT:' + name
        else:
            assert git.returncode == 128 and not saved.exists(), 'BASELINE_LOOKUP_FAILED:' + name
            before = None
        after = (ROOT / name).read_bytes()
        manifest['files'].append({'path': name, 'baselineSha256': sha(before) if before is not None else None,
                                  'modifiedSha256': sha(after)})
        patch.extend(difflib.unified_diff((before or b'').decode('utf-8').splitlines(keepends=True), after.decode('utf-8').splitlines(keepends=True),
                                         fromfile='a/' + name if before is not None else '/dev/null', tofile='b/' + name))
    (evidence / 'SOURCE_HASHES.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    # The inherited parent-completion suite requires these whole unchanged
    # modules even before it reaches queue imports. Preserve a raw-base overlay
    # to distinguish its pre-existing loader failure from this slice.
    for name in ['src/lib/durable-image-jobs.ts', 'src/lib/imagegen/dispatch.ts', 'src/lib/release-runtime/background-activity.ts']:
        original = subprocess.run(['git', 'show', BASELINE + ':' + name], cwd=ROOT, env=env, capture_output=True, check=True).stdout
        assert (ROOT / name).read_bytes().replace(b'\r\n', b'\n') == original.replace(b'\r\n', b'\n')
        out = evidence / 'baseline' / name; out.parent.mkdir(parents=True, exist_ok=True)
        if not out.exists(): out.write_bytes(original)
        assert out.read_bytes() == original
    (evidence / 'DIFF_FILE.patch').write_text(''.join(patch), encoding='utf-8')
    with tarfile.open(evidence / 'MODIFIED_FILE.tar', 'w') as archive:
        for name in FILES:
            raw = (ROOT / name).read_bytes()
            info = tarfile.TarInfo(name); info.size = len(raw); info.mode = 0o644
            archive.addfile(info, io.BytesIO(raw))
    (evidence / 'rollback.py').write_text(ROLLBACK_PY, encoding='utf-8', newline='\n')
    rollback = evidence / 'ROLLBACK.sh'
    rollback.write_text('#!/usr/bin/env bash\nset -euo pipefail\nhere="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nexec python -X utf8 "$here/rollback.py" "$@"\n', encoding='utf-8', newline='\n')
    rollback.chmod(0o755)

    run('ROLLBACK_EXECUTABLE', [args.bash, '-c', 'test -x "$1" && printf "ROLLBACK_EXECUTABLE=PASS\\n"', 'runtime-fixture', str(rollback)], 0)
    base_node = run('BASELINE', [node, 'scripts/verify-capacity-runtime-settings.cjs', '--source', str(evidence / 'baseline')], 1)
    run('BASELINE_CONTROLS', [sys.executable, '-X', 'utf8', 'scripts/ops/test_capacity_runtime_settings.py', '--source', str(evidence / 'baseline')], 1)
    run('MODIFIED', [node, 'scripts/verify-capacity-runtime-settings.cjs'], 0)
    run('MODIFIED_CONTROLS', [sys.executable, '-X', 'utf8', 'scripts/ops/test_capacity_runtime_settings.py'], 0)
    run('FOCUSED_TYPES', [node, 'scripts/typecheck-capacity-runtime-settings.cjs'], 0)
    run('COMBINED_EXISTING', [node, 'scripts/verify-video-worker-with-media.mjs'], 0)
    run('CONTROLS_EXISTING', [sys.executable, '-X', 'utf8', '-m', 'unittest', 'discover', '-s', 'scripts/ops', '-p', 'test_release47_controls.py'], 0)
    parent_before = run('BASELINE_PARENT_EXISTING', [node, 'scripts/verify-imagegen-parent-completion.cjs', '--source-root', str(evidence / 'baseline'), '--output-root', str(evidence / 'parent-baseline')], 1)
    parent_after = run('MODIFIED_PARENT_EXISTING', [node, 'scripts/verify-imagegen-parent-completion.cjs', '--output-root', str(evidence / 'parent-modified')], 1)
    for record in [parent_before, parent_after]:
        assert 'UNMOCKED_IMPORT:src/lib/imagegen/dispatch.ts:../canvas/image-version-store' in record['stdout'] + record['stderr']
        assert 'IMAGEGEN_PARENT_COMPLETION=FAIL CASES=25 FAILED=25 SUPPLIER_POST=0 SETTLE_CALLS=0 NETWORK=0 EXIT=1' in record['stdout']

    def copy_fixture(name):
        target = evidence / name
        # Never reset/delete an older copy or somebody else's fixture.
        target.mkdir(exist_ok=False)
        (target / '.capacity-runtime-fixture').write_text('synthetic source rollback copy\n', encoding='utf-8')
        for file in FILES:
            out = target / file; out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes((ROOT / file).read_bytes())
        return target
    suffix = str(len(list(evidence.glob('rollback-copy-*'))) + 1)
    target = copy_fixture('rollback-copy-' + suffix)
    guard = copy_fixture('rollback-guard-' + suffix)
    # Drift at the LAST entry proves the whole preflight precedes every write.
    last = guard / FILES[-1]; last.write_bytes(last.read_bytes() + b'\n// later fixture edit\n')
    guard_before = {name: sha((guard / name).read_bytes()) for name in FILES}
    run('ROLLBACK_HASHGUARD', [args.bash, str(rollback), str(guard)], 3)
    assert guard_before == {name: sha((guard / name).read_bytes()) for name in FILES}
    run('ROLLBACK_APPLY', [args.bash, str(rollback), str(target)], 0)
    restored = run('ROLLBACK', [node, 'scripts/verify-capacity-runtime-settings.cjs', '--source', str(target)], 1)
    run('ROLLBACK_CONTROLS', [sys.executable, '-X', 'utf8', 'scripts/ops/test_capacity_runtime_settings.py', '--source', str(target)], 1)
    assert base_node['stdout'] == restored['stdout'], 'ROLLBACK_BEHAVIOR_NOT_BASELINE'
    for row in manifest['files']:
        assert sha((ROOT / row['path']).read_bytes()) == row['modifiedSha256']
        out = target / row['path']
        assert (not out.exists()) if row['baselineSha256'] is None else sha(out.read_bytes()) == row['baselineSha256']
    # Reopen all claimed artifacts; verify each archived member, not just length.
    with tarfile.open(evidence / 'MODIFIED_FILE.tar') as archive:
        assert archive.getnames() == FILES
        for row in manifest['files']:
            assert sha(archive.extractfile(row['path']).read()) == row['modifiedSha256']
    assert (evidence / 'DIFF_FILE.patch').read_text(encoding='utf-8') == ''.join(patch)
    assert rollback.read_text(encoding='utf-8').startswith('#!/usr/bin/env bash\n')
    headers = ['CAPACITY_RUNTIME_SETTINGS_TRANSACTION=PASS', 'BASELINE_COMMIT=' + BASELINE,
               'BRANCH_FIELDS=image dispatch budget/cancellation; video scan settings/shared lanes; video coordination reservation; child libuv environment; tick cadence propagation; workflow error isolation',
               'MODIFIED_SOURCE_RETAINED=PASS', 'ROLLBACK_RESTORED_HASHES_AND_BASELINE_BEHAVIOR=PASS',
               'HASHGUARD_ALL_FILES_PREFLIGHT=PASS writes_on_drift=0',
               'INHERITED_PARENT_SUITE=baseline and modified both fail before execution: UNMOCKED_IMPORT:src/lib/imagegen/dispatch.ts:../canvas/image-version-store; 25 cases not accepted',
               'EVIDENCE_TIER=local actual source + simulated DB boundaries + loopback HTTP + Node child environment; no PostgreSQL/server/supplier acceptance',
               'RESOURCES_CREATED=owned local HTTP server and synchronous Node children, all closed; PG=0 containers=0',
               'ENVIRONMENT=case-insensitive OS allowlist including SYSTEMROOT; PYTHONUTF8=1; PYTHONDONTWRITEBYTECODE=1; NODE_PATH=' + env['NODE_PATH'],
               'FIXTURE_INPUTS=defaults; lane 23/invalid; dispatch 4/6/9/12 and budget 8/12, 40/42 item backlog; cancellation; video 3/2 and 12/7, interval 33; pool 2/3/4 with total 15/16/17; original admin 0/false/13; combined media1/uv2/cadence9000',
               'MODIFIED_FILE=' + str(evidence / 'MODIFIED_FILE.tar'), 'DIFF_FILE=' + str(evidence / 'DIFF_FILE.patch'),
               'VERIFICATION=' + str(evidence / 'VERIFICATION.txt'), 'ROLLBACK=' + str(rollback), '']
    for record in runs:
        headers += [record['label'], 'COMMAND=' + subprocess.list2cmdline(record['command']),
                    'INPUT=' + record['input'], 'STDOUT_LITERAL:\n' + record['stdout'], 'STDERR_LITERAL:\n' + record['stderr'],
                    'EXIT_STATUS=' + str(record['exitStatus']), '']
    headers += ['SOURCE_HASHES_LITERAL:', json.dumps(manifest, indent=2), 'ARTIFACT_REOPEN=PASS']
    verification = evidence / 'VERIFICATION.txt'
    verification.write_text('\n'.join(headers) + '\n', encoding='utf-8')
    assert verification.read_text(encoding='utf-8').endswith('ARTIFACT_REOPEN=PASS\n')
    print('CAPACITY_RUNTIME_SETTINGS_TRANSACTION=PASS')
    print('MODIFIED_SOURCE_RETAINED=PASS ROLLBACK_RESTORED=PASS HASHGUARD_WRITES=0 ARTIFACT_REOPEN=PASS')


if __name__ == '__main__':
    main()
