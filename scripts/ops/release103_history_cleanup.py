"""103-only explicit historical UI removal; never a normal drain receipt.

The caller supplies fresh exact identities. No discovery-based deletion, force
stop/remove, volume removal, image pruning, DB restore or task replay exists.
Private rollback specs recreate a stopped container from a retained snapshot.
"""
import copy
import http.client
import json
import pathlib
import re
import socket
import time

import release103_authorized_ui_retirement as old
from release47_host import HostTransaction, environment, public_identity

AUTHORIZATION = '直接删了就行，历史那些好久不用了'
THREAD = 'da1fb6c5-ffa9-4da4-97eb-d71dc858b418'


def rollback_body(row, snapshot_image):
    old.require(re.fullmatch(r'sha256:[a-f0-9]{64}', snapshot_image), 'SNAPSHOT_IMAGE_REQUIRED')
    old.require(not row['HostConfig'].get('AutoRemove'), 'AUTO_REMOVE_NOT_SUPPORTED')
    body = copy.deepcopy(row['Config'])
    body['Image'] = snapshot_image
    host = copy.deepcopy(row['HostConfig'])
    host['RestartPolicy'] = {'Name': 'no', 'MaximumRetryCount': 0}
    body['HostConfig'] = host
    endpoints = {}
    for name, net in row['NetworkSettings']['Networks'].items():
        endpoints[name] = {k: copy.deepcopy(net[k]) for k in ('IPAMConfig', 'Aliases', 'Links', 'DriverOpts', 'GwPriority') if net.get(k) is not None}
        if 'Aliases' in endpoints[name]:
            endpoints[name]['Aliases'] = [a for a in endpoints[name]['Aliases'] if a not in (row['Id'], row['Id'][:12])]
    body['NetworkingConfig'] = {'EndpointsConfig': endpoints}
    return body


class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')


def api(method, path, body=None):
    connection = UnixHTTP('localhost', timeout=120)
    try:
        raw = None if body is None else json.dumps(body).encode()
        connection.request(method, path, body=raw, headers={'Content-Type': 'application/json'})
        response = connection.getresponse(); result = response.read()
        old.require(200 <= response.status < 300, 'DOCKER_API_HTTP_' + str(response.status))
        return json.loads(result) if result else None
    finally:
        connection.close()


def check_plan(plan):
    old.require(plan.get('authorization') == AUTHORIZATION and plan.get('thread') == THREAD and plan.get('target') == '103.30.76.93', 'CURRENT_EXPLICIT_AUTHORIZATION_REQUIRED')
    old.require(plan.get('historicalVolatileStateAccepted') is True and plan.get('ordinaryDrainReceipt') is None, 'NOT_AN_ORDINARY_DRAIN')
    pins = plan['candidates']
    old.require(pins and len({p['id'] for p in pins}) == len(pins), 'DUPLICATE_OR_EMPTY_TARGETS')
    old.require(not ({p['id'] for p in pins} & {p['id'] for p in plan['protectedContainers']}), 'PROTECTED_TARGET')
    old.require(plan.get('deleteVolumes') is False and plan.get('deleteImages') is False, 'DATA_AND_IMAGES_MUST_REMAIN')


def eligible(row, pin):
    if pin['running']:
        old.eligible(row, pin)
        return
    old.require(public_identity(row) == {k: pin[k] for k in ('id', 'image', 'running', 'startedAt', 'restartPolicy')} | {'name': pin['name'].lstrip('/')}, 'STOPPED_IDENTITY_CHANGED')
    old.require(row['Name'] == pin['name'] and not row['State']['Running'] and row['State']['Status'] == 'exited', 'STOPPED_EXIT_REQUIRED')
    old.require(row['Config']['Cmd'] == ['node', 'server.js'] and environment(row).get('NAUMI_VIDEO_WORKER') == '0', 'STOPPED_STANDARD_UI_REQUIRED')
    old.require(13014 <= pin['port'] <= 13037 and pin['port'] not in old.PROTECTED_PORTS and row['HostConfig']['PortBindings'] == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(pin['port'])}]}, 'STOPPED_PORT_CHANGED')


def review_mounts(row, pin):
    overlays = {}
    for mount in row['Mounts']:
        if mount['Type'] == 'bind' and (mount['Destination'] == '/data' or mount['Destination'].startswith('/data/')):
            continue
        reviewed = pin.get('reviewedReadOnlyMounts', {}).get(mount['Destination'])
        old.require(mount['Type'] == 'bind' and mount['RW'] is False and reviewed is not None and reviewed['source'] == mount['Source'], 'NON_DATA_MOUNTS_REQUIRE_REVIEW')
        path = pathlib.Path(mount['Source'])
        old.require(path.is_file() and not path.is_symlink(), 'REVIEWED_OVERLAY_FILE_REQUIRED')
        raw = path.read_bytes()
        old.require(old.sha(raw) == reviewed['sha256'], 'REVIEWED_OVERLAY_CHANGED')
        overlays[mount['Destination']] = raw
    return overlays


def execute(plan):
    check_plan(plan)
    results = []
    with HostTransaction('103.30.76.93', old.MACHINE, plan['evidenceDirectory']) as tx:
        tx.save('authorization-and-plan.json', plan)
        old.protected_health(tx, plan['protectedContainers'])
        db = tx.inspect(old.DB)
        old.require(db['State']['Running'], 'DATABASE_NOT_RUNNING')
        originals = []
        for pin in plan['candidates']:
            row = tx.inspect(pin['id']); eligible(row, pin); old.no_references(tx, row)
            overlays = review_mounts(row, pin)
            for index, raw in enumerate(overlays.values()):
                tx.save('private-overlay-' + pin['id'][:12] + '-' + str(index) + '.bin', raw)
            originals.append(row)
        tx.save('private-original-inspects.json', originals)
        tx.save('private-nginx-original.txt', old.gateway(tx))
        tx.backup_database(public_identity(db))
        before = old.available(tx)
        for pin, original in zip(plan['candidates'], originals):
            cid = pin['id']
            for _ in range(2):
                row = tx.inspect(cid); eligible(row, pin); old.no_references(tx, row)
                review_mounts(row, pin)
                old.require(old.immutable(row) == old.immutable(original), 'CONTAINER_BINDING_CHANGED')
                if pin['running']:
                    old.require(old.serving_connections(row) == 0 and old.active_db(tx, row, db) == 0, 'CURRENT_ACTIVITY_PRESENT')
                time.sleep(2)
            old.protected_health(tx, plan['protectedContainers'])
            tx.save('stop-intent-' + cid[:12] + '.json', {'identity': public_identity(original), 'ordinaryDrainReceipt': None, 'historicalVolatileStateAccepted': True})
            tx.run(['docker', 'update', '--restart=no', cid])
            if pin['running']:
                tx.run(['docker', 'stop', '--time=-1', cid], timeout=120)
            row = tx.inspect(cid)
            old.require(not row['State']['Running'], 'STOP_NOT_CONFIRMED')
            if pin['running']:
                old.require(not row['State'].get('OOMKilled') and row['State']['ExitCode'] != 137, 'GRACEFUL_STOP_UNCONFIRMED')
            old.require(old.immutable(row) == old.immutable(original), 'STOPPED_CONTAINER_CHANGED')
            old.no_references(tx, row)
            # Preserve writable-layer changes, including legacy one-off scripts.
            tag = 'naumi:history103-rollback-' + cid[:12]
            snapshot = tx.run(['docker', 'commit', cid, tag]).decode().strip()
            old.require(re.fullmatch(r'sha256:[a-f0-9]{64}', snapshot), 'SNAPSHOT_COMMIT_UNKNOWN')
            saved = json.loads(tx.run(['docker', 'image', 'inspect', snapshot]))[0]
            old.require(saved['Id'] == snapshot, 'SNAPSHOT_REOPEN_FAILED')
            spec = {'originalId': cid, 'name': original['Name'].lstrip('/'), 'originalImage': original['Image'], 'snapshotImage': snapshot, 'originalRestartPolicy': original['HostConfig']['RestartPolicy'], 'body': rollback_body(original, snapshot), 'startAutomatically': False, 'databaseRestoreAllowed': False, 'taskReplayAllowed': False}
            tx.save('private-rollback-' + cid[:12] + '.json', spec)
            # Real rollback-copy check: recreate unstarted, inspect bindings,
            # then remove ONLY this owned stopped fixture (never its volumes).
            copy_name = 'naumi-history103-rollback-check-' + cid[:12]
            tx.save('rollback-copy-intent-' + cid[:12] + '.json', {'name': copy_name, 'snapshotImage': snapshot})
            created = api('POST', '/containers/create?name=' + copy_name, spec['body'])
            copy_id = created['Id']; copied = tx.inspect(copy_id)
            old.require(copied['Name'] == '/' + copy_name and not copied['State']['Running'] and copied['State']['Status'] == 'created', 'ROLLBACK_COPY_NOT_STOPPED')
            old.require(copied['Image'] == snapshot and copied['Config']['Env'] == original['Config']['Env'] and copied['Config']['Cmd'] == original['Config']['Cmd'], 'ROLLBACK_COPY_PROGRAM_CHANGED')
            old.require(copied['HostConfig']['PortBindings'] == original['HostConfig']['PortBindings'] and copied['HostConfig']['Memory'] == original['HostConfig']['Memory'], 'ROLLBACK_COPY_RESOURCES_CHANGED')
            old.require(copied['HostConfig']['RestartPolicy']['Name'] == 'no', 'ROLLBACK_COPY_AUTO_START')
            for key in ('Binds', 'Mounts'):
                old.require(copied['HostConfig'].get(key) == original['HostConfig'].get(key), 'ROLLBACK_COPY_DATA_BINDING_CHANGED')
            tx.run(['docker', 'rm', copy_id])
            tx.save('rollback-copy-pass-' + cid[:12] + '.json', {'copyId': copy_id, 'copyName': copy_name, 'status': 'PASS', 'started': False, 'databaseRestored': False, 'volumesRemoved': False})
            # Default rollback only recreates STOPPED; never resume unknown work.
            tx.save('remove-intent-' + cid[:12] + '.json', {'id': cid, 'snapshotImage': snapshot, 'deleteVolumes': False, 'force': False})
            tx.run(['docker', 'rm', cid])
            ids = tx.run(['docker', 'ps', '-aq', '--no-trunc']).decode().split()
            old.require(cid not in ids, 'REMOVAL_NOT_CONFIRMED')
            versions = old.protected_health(tx, plan['protectedContainers'])
            entry = {'id': cid, 'name': spec['name'], 'port': pin['port'], 'snapshotImage': snapshot, 'removed': True, 'volumesDeleted': False, 'imagesDeleted': False, 'exitCode': row['State']['ExitCode'], 'availableMiB': old.available(tx), 'versions': versions}
            tx.save('removed-' + cid[:12] + '.json', entry); results.append(entry)
            print(json.dumps({'removedPort': pin['port'], 'availableMiB': entry['availableMiB']}), flush=True)
        final = {'status': 'HISTORICAL_UI_REMOVED', 'beforeAvailableMiB': before, 'afterAvailableMiB': old.available(tx), 'removedCount': len(results), 'containers': results, 'gatewayUnchanged': True, 'ordinaryDrainReceipt': None, 'historicalVolatileStateAccepted': True, 'databaseRestored': False, 'taskReplayed': False, 'applicationReleased': False}
        tx.save('CLEANUP_ACCEPTANCE.json', final)
        return final
