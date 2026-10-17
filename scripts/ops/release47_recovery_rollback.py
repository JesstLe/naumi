#!/usr/bin/env python3
"""Rollback the recovery supervisor only, retaining online Web and paid evidence.

--apply disables the timer and drains its exact successor scanner. It does not
resume the original UNKNOWN Worker or change application/DB/media/config/image.
The original 896MiB Web plan is NOT an executable crash-recovery rollback.
"""
import argparse
import json
import pathlib
import time
import uuid

from release47_host import HostTransaction, require, public_identity
from release47_controls import _atomic_private
from release47_recovery_supervisor import Adapter, recovery_binding, now


def check(tx, manifest):
    recovery_binding(json.loads(pathlib.Path(manifest['canonicalPath']).read_bytes()), manifest)
    adapter = Adapter(tx, manifest)
    web, worker = adapter.inspect(manifest['web']), adapter.inspect(manifest['worker'])
    require(web['State']['Running'] and worker['State']['Running'] and
            web['HostConfig']['Memory'] >= 2147483648, 'ROLLBACK_RUNTIME_NOT_CURRENT')
    app = adapter.status(manifest['web'])
    require(app['admission']['mode'] == 'open', 'ROLLBACK_WEB_NOT_OPEN')
    return adapter, public_identity(web), adapter.status(manifest['worker'])


def apply(tx, manifest, folder):
    adapter, web, status = check(tx, manifest)
    folder = pathlib.Path(folder)
    path = folder / ('rollback-' + status['bootId'] + '.json')
    if path.exists():
        log = json.loads(path.read_bytes())
        require(log['request']['bootId'] == status['bootId'], 'ROLLBACK_BOOT_CHANGED')
    else:
        log = {'at': now(), 'phase': 'INTENT_RECORDED', 'web': web,
               'request': {'action': 'drain', 'operationId': str(uuid.uuid4()),
                           'bootId': status['bootId'], 'expectedRevision': status['revision']}}
        _atomic_private(path, log)
    tx.run(['systemctl', 'disable', '--now', 'naumi47-recovery.timer'])
    receipt = adapter.control(manifest['worker'], log['request'])
    for _ in range(45):
        current = adapter.status(manifest['worker'])
        if current['activeTicks'] == 0: break
        time.sleep(1)
    require(current['paused'] and current['activeTicks'] == 0, 'ROLLBACK_SCANNER_DRAIN_PENDING')
    require(public_identity(adapter.inspect(manifest['web'])) == web and
            adapter.status(manifest['web'])['admission']['mode'] == 'open', 'ROLLBACK_WEB_CHANGED')
    log.update(phase='ACKNOWLEDGED', receipt=receipt, worker=current,
               webUnchanged=True, databaseRestored=False, tasksReplayed=False,
               result='SUPERVISOR_DISABLED_SUCCESSOR_PAUSED_WEB_OPEN')
    _atomic_private(path, log)
    return log


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=pathlib.Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    require(args.manifest.stat().st_uid == 0 and not args.manifest.stat().st_mode & 0o077,
            'PRIVATE_ROOT_MANIFEST_REQUIRED')
    manifest = json.loads(args.manifest.read_bytes())
    with HostTransaction(manifest['target'], manifest['hostIdentitySha256'], manifest['evidenceDir']) as tx:
        if args.apply:
            apply(tx, manifest, pathlib.Path(manifest['journalDir']))
            print('ROLLBACK=PASS SUPERVISOR_DISABLED WORKER_PAUSED WEB_OPEN DB_RESTORED=NO TASKS_REPLAYED=NO')
        else:
            check(tx, manifest)
            print('ROLLBACK_CHECK=PASS CURRENT_IDENTITIES_BOUND WEB_MEMORY_2G NO_MUTATION')


if __name__ == '__main__': main()
