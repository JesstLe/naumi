#!/usr/bin/env python3
"""Add a 4 GiB emergency swap buffer without restarting any application."""
import argparse
import contextlib
import difflib
import fcntl
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path('/opt/naumi-staging/evidence/ssh47-optimization-20261015/swap')
SWAP = pathlib.Path('/swapfile.naumi-emergency')
FSTAB = pathlib.Path('/etc/fstab')
SIZE = 4 * 1024 ** 3
ENTRY = b'/swapfile.naumi-emergency none swap sw,pri=10 0 0\n'
LOCKS = ['/opt/naumi-staging/releases/deploy.lock',
         '/opt/naumi-reverse-hub/releases/deploy.lock',
         '/opt/reference-workbench/deploy.lock']


def run(args, **kw):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=60, **kw)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def modify(original):
    assert SWAP.as_posix().encode() not in original, 'Swap entry already present'
    return original + (b'' if not original or original.endswith(b'\n') else b'\n') + ENTRY


def atomic_fstab(raw):
    st = FSTAB.stat()
    fd, name = tempfile.mkstemp(prefix='.fstab-naumi-', dir='/etc')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(name, st.st_mode & 0o777)
        os.chown(name, st.st_uid, st.st_gid)
        os.replace(name, FSTAB)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def fixture():
    for raw in [b'', b'UUID=fixture / ext4 defaults 0 1', b'# fixture\n']:
        changed = modify(raw)
        assert changed.count(ENTRY) == 1 and changed.startswith(raw)
        try:
            modify(changed)
            raise AssertionError('Duplicate entry accepted')
        except AssertionError as e:
            assert str(e) == 'Swap entry already present'
        with tempfile.TemporaryDirectory() as folder:
            p = pathlib.Path(folder)
            (p / 'original').write_bytes(raw)
            (p / 'modified').write_bytes(changed)
            (p / 'rollback-copy').write_bytes((p / 'original').read_bytes())
            assert (p / 'rollback-copy').read_bytes() == raw
    print('SWAP_FIXTURE=PASS; APPEND_ONLY=PASS; DUPLICATE=REJECTED; ROLLBACK_COPY=EXACT')


def active():
    # /proc is stable across util-linux versions; this host lacks swapon --json.
    rows = []
    for line in pathlib.Path('/proc/swaps').read_text().splitlines()[1:]:
        name, kind, size, used, priority = line.split()
        rows.append({'name': name, 'type': kind, 'size': int(size) * 1024,
                     'used': int(used) * 1024, 'prio': int(priority)})
    return rows


def apply():
    ROOT.mkdir(parents=True, exist_ok=True)
    ROOT.chmod(0o700)
    assert not SWAP.exists() and not active(), 'Existing swap: inspect instead of overwrite'
    assert not (ROOT / 'ORIGINAL_FILE.fstab').exists(), 'Transaction already exists'
    disk = os.statvfs('/')
    assert disk.f_bavail * disk.f_frsize > SIZE + 10 * 1024 ** 3, 'Disk headroom'
    assert run(['findmnt', '-n', '-o', 'FSTYPE', '/']).strip() == b'ext4', 'Filesystem needs separate review'
    original = FSTAB.read_bytes()
    changed = modify(original)
    (ROOT / 'ORIGINAL_FILE.fstab').write_bytes(original)
    (ROOT / 'MODIFIED_FILE.fstab').write_bytes(changed)
    (ROOT / 'ORIGINAL_SHA256.txt').write_text(sha(original) + '\n')
    (ROOT / 'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(
        original.decode().splitlines(True), changed.decode().splitlines(True),
        fromfile='ORIGINAL_FILE.fstab', tofile='MODIFIED_FILE.fstab')))
    print('SWAP_BASELINE=PASS; ACTIVE_SWAP=0; FSTAB_SHA256=' + sha(original), flush=True)
    enabled = False
    try:
        run(['fallocate', '-l', str(SIZE), str(SWAP)])
        SWAP.chmod(0o600)
        run(['mkswap', str(SWAP)])
        # Validate the complete candidate fstab without remounting anything.
        run(['findmnt', '--verify', '--tab-file', str(ROOT / 'MODIFIED_FILE.fstab')])
        assert FSTAB.read_bytes() == original, 'Concurrent fstab change'
        run(['swapon', '--priority', '10', str(SWAP)])
        enabled = True
        atomic_fstab(changed)
        rows = active()
        row = next(r for r in rows if r['name'] == str(SWAP))
        assert row['size'] >= SIZE - 4096 and row['prio'] == 10
        assert FSTAB.read_bytes() == changed
        result = {'swap': row, 'fstabBeforeSHA256': sha(original),
                  'fstabAfterSHA256': sha(changed), 'applicationRestarts': 0,
                  'swappinessUnchanged': run(['sysctl', '-n', 'vm.swappiness']).decode().strip()}
        (ROOT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print('SWAP_MODIFIED=PASS; SIZE=4GiB; PERSISTENT=YES; MODE=0600; APPLICATION_RESTARTS=0', flush=True)
    except Exception:
        # Do not blindly swapoff on a live host: pages may already have moved.
        (ROOT / 'NEEDS_INSPECTION').write_text('enabled=' + str(enabled) + '\n')
        raise


def rollback(copy_only):
    original = (ROOT / 'ORIGINAL_FILE.fstab').read_bytes()
    if copy_only:
        (ROOT / 'ROLLBACK_COPY.fstab').write_bytes(original)
        assert (ROOT / 'ROLLBACK_COPY.fstab').read_bytes() == original
        print('SWAP_ROLLBACK=PASS; COPY=EXACT; LIVE_SWAPOFF=0; LIVE_FSTAB=UNCHANGED')
        return
    changed = (ROOT / 'MODIFIED_FILE.fstab').read_bytes()
    assert FSTAB.read_bytes() == changed, 'Peer fstab change'
    row = next(r for r in active() if r['name'] == str(SWAP))
    # Under user traffic, never page data back to reclaim a nonzero swap buffer.
    assert row['used'] == 0, 'Swap in use: defer removal'
    run(['swapoff', str(SWAP)])
    atomic_fstab(original)
    print('SWAP_ROLLBACK_LIVE=PASS; ORIGINAL_FSTAB=RESTORED; SWAPFILE=RETAINED')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['fixture', 'apply', 'rollback-copy', 'rollback-execute'])
    mode = parser.parse_args().mode
    if mode == 'fixture':
        fixture()
        return
    if mode == 'rollback-copy':
        rollback(True)
        return
    with contextlib.ExitStack() as stack:
        for p in LOCKS:
            f = stack.enter_context(open(p, 'a'))
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if mode == 'apply':
            apply()
        else:
            rollback(False)


if __name__ == '__main__':
    main()
