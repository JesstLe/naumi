"""103-only mapping branch successor; preserve site identity and all business data.

Reuse the locked site-control transaction, candidate, backup and acceptance
primitives. This operator replaces exactly one Web/combined-Worker pair; it does
not bootstrap a site, publish supplier configuration, or call suppliers. A lost
operation receipt remains UNKNOWN and requires original-operation review.
"""
import datetime as dt
import json
import pathlib
import re
import shutil
import time
import urllib.request

import release_site_control as shared
import release103_refactor as base
import release47_controls as controls
import release47_task_snapshot as tasks
import release_runtime_recovery as startup
from release47_host import HostTransaction, Hold, require, public_identity, environment, sha, file_sha

TARGET = '103.30.76.93'
BRANCH = 'codex/model-mapping-103-20261029'
AUTHORIZATION = '模型映射独立分支仅发布103，保留数据媒体，蓝绿验证，不合入main'


def validate(c):
    require(c.get('target') == TARGET and c.get('authorization') == AUTHORIZATION,
            'EXPLICIT_103_MAPPING_AUTHORIZATION_REQUIRED')
    require(c.get('branch') == BRANCH and c.get('releaseMode') == 'BLUE_GREEN',
            'ISOLATED_MAPPING_BRANCH_REQUIRED')
    require(c.get('taskActivityScope') == 'nonfinished-and-prior', 'EXPLICIT_103_TASK_ACTIVITY_SCOPE_REQUIRED')
    require(c.get('abortedPredecessor') is None or re.fullmatch(r'release103-mapping-[a-z0-9-]{6,50}', c['abortedPredecessor']),
            'EXPLICIT_ABORTED_MAPPING_PREDECESSOR_REQUIRED')
    require(re.fullmatch(r'release103-mapping-[a-z0-9-]{6,50}', c.get('releaseId', '')),
            'MAPPING_RELEASE_ID_REQUIRED')
    require(c.get('evidenceRoot') == '/opt/naumi-staging/evidence/' + c['releaseId'],
            'EVIDENCE_PATH_REQUIRED')
    require(c.get('webEnvironment') == {} and c.get('workspaceModules') == [],
            'NO_SITE_CONFIGURATION_CHANGE')
    require(c.get('restoreDatabase') is False and c.get('replayAcceptedTasks') is False,
            'NO_RESTORE_OR_REPLAY')
    require(not any(c.get(k) for k in ['resumeFinal', 'resumeCandidate']),
            'ORIGINAL_TRANSACTION_RECONCILIATION_REQUIRED')
    require(all(re.fullmatch(r'[a-f0-9]{40}', c.get(k, '')) for k in ['commit', 'oldCommit']) and
            all(re.fullmatch(r'sha256:[a-f0-9]{64}', c.get(k, '')) for k in ['image', 'oldImage']),
            'FIXED_BRANCH_IMAGE_REQUIRED')
    require(re.fullmatch(r'[0-9]{10}', c.get('buildVersion', '')), 'FIXED_VERSION_REQUIRED')
    require(all(re.fullmatch(r'[a-f0-9]{64}', c.get(k, '')) for k in
                ['archiveSha256', 'storageProbeSha256', 'canonicalSha256', 'nginxSha256']) and
            type(c.get('canonicalRevision')) is int and c['canonicalRevision'] >= 0,
            'FIXED_REVIEW_HASHES_REQUIRED')
    require(c.get('date') == dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),
            'FRESH_REVIEW_REQUIRED')
    require(c.get('webMemoryMiB') == 1536 and c.get('workerMemoryMiB') == 1024,
            'SAME_RESOURCE_LIMITS_REQUIRED')
    require(all(type(c.get(k)) is int and 13000 <= c[k] <= 13999 for k in ['oldPort', 'newPort']) and
            c['newPort'] != c['oldPort'], 'DISTINCT_PRIVATE_PORTS_REQUIRED')
    require(all(isinstance(c.get(k), dict) and set(c[k]) == {'web', 'worker'} for k in
                ['oldNames', 'newNames', 'oldPins']), 'EXACT_TWO_ROLE_PAIR_REQUIRED')
    names = [*c['oldNames'].values(), *c['newNames'].values()]
    require(all(isinstance(n, str) and re.fullmatch(r'naumi103-[a-z0-9-]{6,80}', n) for n in names) and
            len(set(names)) == 4, 'UNIQUE_103_SLOT_NAMES_REQUIRED')
    require(isinstance(c.get('runningIds'), list) and c['runningIds'] and
            len(c['runningIds']) == len(set(c['runningIds'])) and
            all(re.fullmatch('[a-f0-9]{64}', i) for i in c['runningIds']), 'FIXED_RUNNING_IDS_REQUIRED')


def fresh_tick(status, commit, resumed_at):
    """A retained previous boot/tick is not a receipt for this resume."""
    tick = status.get('lastTick') or {}
    try:
        at = dt.datetime.fromisoformat(tick['startedAt'].replace('Z', '+00:00'))
        return (at.tzinfo is not None and at.timestamp() >= resumed_at and
                tick.get('phase') == 'complete' and bool(status.get('bootId')) and
                tick.get('workerBootId') == status['bootId'] and
                tick.get('workerCommit') == status.get('commit') == commit)
    except (ValueError, TypeError, KeyError):
        return False


class Release(shared.Release):
    def __init__(self, tx, c):
        validate(c)
        super().__init__(tx, c)
        require(c['releaseId'] not in self.state.get('siteControlReleases', {}),
                'ORIGINAL_TRANSACTION_RECONCILIATION_REQUIRED')
        require(all(name not in self.byname for name in c['newNames'].values()),
                'CANDIDATE_NAME_ALREADY_EXISTS')
        require(all(row['State']['Running'] for row in self.old.values()), 'OLD_PAIR_NOT_RUNNING')
        self.record.update(taskKind='model-mapping-103', branch=BRANCH, releaseMode='BLUE_GREEN',
                           supplierSubmissions=0, configurationPublication=False)

    def prepare(self):
        # Run cheap gates before recording any new lifecycle/backup intent.
        self.memory()
        require(shutil.disk_usage(self.root).free >= 10 * 1024**3, 'TEN_GIB_FREE_REQUIRED')
        require(file_sha(self.root / 'image.tar.gz') == self.c['archiveSha256'], 'IMAGE_ARCHIVE_CHANGED')
        for role, limit in [('web', 1536), ('worker', 1024)]:
            require(self.old[role]['HostConfig']['Memory'] == limit * 1024**2,
                    'OLD_RESOURCE_LIMIT_CHANGED')
        web, worker = self.old['web'], self.old['worker']
        require(web['HostConfig']['PortBindings'].get('3000/tcp') ==
                [{'HostIp': '127.0.0.1', 'HostPort': str(self.c['oldPort'])}], 'OLD_PRIVATE_PORT_CHANGED')
        old_origin = 'http://' + self.c['oldNames']['web'] + ':3000'
        require(environment(worker).get('NAUMI_APP_ORIGIN') == old_origin and
                environment(web).get('INTERNAL_APP_ORIGIN') == 'http://127.0.0.1:3000',
                'OLD_EXECUTION_GRAPH_CHANGED')
        scratch = [[m['Source'] for m in row['Mounts'] if m['Destination'] == '/scratch']
                   for row in [web, worker]]
        require(len(scratch[0]) == 1 and scratch[0] == scratch[1], 'OLD_COMBINED_SCRATCH_CHANGED')
        super().prepare()
        # The collector intentionally returns incomplete coverage as evidence.
        # Reject that baseline before creating a candidate, not after cutover.
        coverage = tasks.compare_task_snapshots(self.task_before, self.task_before)
        self.tx.save('task-baseline-coverage.json', coverage)
        require(coverage['preservationVerified'], 'TASK_BASELINE_COVERAGE_INCOMPLETE')

    def drain(self, group=None):
        result = super().drain(group)
        media = result['worker'].get('mediaWorker', {})
        require(media.get('running') == media.get('queued') == 0, 'COMBINED_MEDIA_NOT_DRAINED')
        return result

    def switch(self):
        self.wait(lambda: self.marker('browser-before.json'), 'CANDIDATE_BROWSER', 600)
        self.op('pause-old-worker', lambda _: self.worker(self.old['worker'], 'drain'))
        self.worker_paused = True
        self.wait(lambda: (lambda s: s['paused'] and s['activeTicks'] == s['unresolvedTicks'] == 0 and
                  s.get('backgroundTasks', 0) == 0)(self.worker(self.old['worker'], 'status')),
                  'OLD_WORKER_QUIESCENT', 120)
        self.op('open-new-web', lambda op: controls.control_app(self.tx, public_identity(self.new['web']), 'resume', op))
        self.op('gateway-switch', lambda _: self.gateway())
        self.switched = True
        self.phase('SWITCHED')
        self.op('drain-old-web', lambda op: controls.control_app(self.tx, public_identity(self.old['web']), 'drain', op))
        self.app_drained = True
        self.tx.save('old-drain.json', self.wait(self.drain, 'OLD_EXECUTION', 180))
        port = str(self.c['oldPort'])
        require(not self.tx.run(['ss', '-Htn', 'state', 'established',
                '( sport = :' + port + ' or dport = :' + port + ' )']).strip(), 'OLD_HTTP_CONNECTIONS_ACTIVE')
        for role in ['worker', 'web']:
            self.op('retire-' + role, lambda _, role=role: self.retire(role))
        self.old_stopped = True
        self.op('cold-media-receipt-handoff', lambda _: self.handoff_media())
        self.resumed_at = time.time()
        self.op('resume-new-worker', lambda _: self.worker(self.new['worker'], 'resume'))
        self.phase('PUBLIC_ACCEPTANCE')

    def retire(self, role):
        row = self.old[role]
        self.tx.pin(public_identity(row))
        self.tx.run(['docker', 'update', '--restart=no', row['Id']])
        self.tx.run(['docker', 'stop', '--time', '60', row['Id']], timeout=75)
        actual = self.tx.inspect(row['Id'])
        require(not actual['State']['Running'] and actual['State']['ExitCode'] in [0, 143] and
                not actual['State']['OOMKilled'] and actual['HostConfig']['RestartPolicy']['Name'] == 'no',
                'OLD_SLOT_STOP_REQUIRED')
        return public_identity(actual)

    def finish(self):
        self.wait(lambda: fresh_tick(self.worker(self.new['worker'], 'status'), self.c['commit'],
                  self.resumed_at), 'NEW_WORKER_RECEIPT', 120)
        self.wait(lambda: self.marker('browser-after.json'), 'PUBLIC_BROWSER', 600)
        self.acceptance()
        self.op('proof-worker-barrier', lambda _: self.worker(self.new['worker'], 'drain'))
        self.wait(lambda: (lambda s: s['paused'] and s['activeTicks'] == s['unresolvedTicks'] == 0 and
                  s.get('backgroundTasks', 0) == 0)(self.worker(self.new['worker'], 'status')),
                  'TASK_PROOF_BARRIER', 120)
        after = tasks.collect_task_snapshot(self.tx.run, public_identity(self.db), self.tx.save,
                    previous=self.task_before.private, projection='proof', row_limit=5000,
                    allow_absent_tables=tasks.ADDITIVE_TABLES, statement_timeout_ms=15000,
                    activity_scope=self.c.get('taskActivityScope','all'))
        proof = tasks.compare_task_snapshots(self.task_before, after)
        self.tx.save('task-preservation.json', proof)
        require(proof['preservationVerified'], 'TASK_PRESERVATION_FAILED')
        self.resumed_at = time.time()
        self.op('proof-worker-resume', lambda _: self.worker(self.new['worker'], 'resume'))
        self.wait(lambda: fresh_tick(self.worker(self.new['worker'], 'status'), self.c['commit'],
                  self.resumed_at), 'FINAL_WORKER_RECEIPT', 120)
        request = urllib.request.Request('http://127.0.0.1/api/version', headers={'Host': TARGET})
        with urllib.request.urlopen(request, timeout=15) as response:
            public = json.loads(response.read())
        require(public == {'version': self.c['buildVersion'], 'commit': self.c['commit']},
                'PUBLIC_GATEWAY_VERSION_DRIFT')
        self.tx.save('public-version.json', {'at': base.now(), 'version': public, 'probe': 'HTTP-gateway'})
        self.router_binding(live=True)
        self.op('activate-persistent-startup', lambda _: self.activate_startup())
        require(self.config() == self.configuration, 'MODEL_OR_BILLING_CHANGED')
        self.tx.save('capacity-final.json', self.memory())
        for row in self.old.values():
            actual = self.tx.inspect(row['Id'])
            require(not actual['State']['Running'] and actual['HostConfig']['RestartPolicy']['Name'] == 'no',
                    'OLD_SLOT_RUNNING')
        expected_running = set(self.c['runningIds']) - {v['Id'] for v in self.old.values()} | {
            v['Id'] for v in self.new.values()}
        require(set(self.tx.run(['docker', 'ps', '-q', '--no-trunc']).decode().split()) == expected_running,
                'UNREVIEWED_RUNNING_INSTANCE')
        require(all(op['phase'] == 'ACKNOWLEDGED' for op in self.record['operations'].values()),
                'UNACKNOWLEDGED_RELEASE_OPERATION')
        self.phase('COMPLETE', completedAt=base.now(),
                   new={k: public_identity(self.tx.inspect(v['Id'])) for k, v in self.new.items()},
                   old={k: public_identity(self.tx.inspect(v['Id'])) for k, v in self.old.items()},
                   sameWebWorkerImage=True, configurationPreserved=True, taskPreservationVerified=True,
                   legacyHistoricalUncertaintyRetained=True)
        self.tx.save('FINAL_STATUS.json', self.record)

    def activate_startup(self):
        web = self.tx.inspect(self.new['web']['Id'])
        state = next(m['Source'] for m in web['Mounts'] if m['Destination'] == '/release-state')
        spec = {'releaseId': self.c['releaseId'], 'commit': self.c['commit'],
                'buildVersion': self.c['buildVersion'], 'releaseSecret': environment(web)['RELEASE_CONTROL_SECRET']}
        startup.verify_launcher(state, release_id=self.c['releaseId'], commit=self.c['commit'],
                                version=self.c['buildVersion'], instance=self.c['newNames']['web'])
        marker = startup.activation_marker(spec, public_identity(web), True)
        startup.write_activation(pathlib.Path(state) / 'activation.json', marker)
        require(json.loads((pathlib.Path(state) / 'activation.json').read_bytes()) == marker,
                'ACTIVATION_MARKER_REOPEN_FAILED')
        for role, row in list(self.new.items()):
            self.tx.run(['docker', 'update', '--restart=unless-stopped', row['Id']])
            actual = self.tx.inspect(row['Id'])
            require(actual['State']['Running'] and actual['Image'] == self.c['image'] and
                    environment(actual).get('SOURCE_COMMIT') == self.c['commit'] and
                    actual['HostConfig']['RestartPolicy']['Name'] == 'unless-stopped', 'ACTIVE_PAIR_CHANGED')
            self.new[role] = actual
        return {'launcherVerified': True, 'activationEnabled': True, 'sameImage': True}

    def rollback(self):
        # Do not manufacture a rollback: after ingress changes the new Web may
        # have accepted work. Keep it and the original receipts for reconciliation.
        observed = sha(self.tx.run(['nginx', '-T']))
        unknown = any(op.get('phase') in ['UNKNOWN', 'INTENT_RECORDED']
                      for op in self.record['operations'].values())
        if not self.switched and observed == self.c['nginxSha256'] and self.worker_paused and not unknown:
            self.op('resume-original-worker', lambda _: self.worker(self.old['worker'], 'resume'))
        phase = ('UNKNOWN' if unknown or not self.switched and observed != self.c['nginxSha256']
                 else 'CLEANUP_PENDING' if self.new or self.switched else 'ABORTED')
        self.phase(phase, gatewaySwitched=self.switched, gatewayObservedSha256=observed,
                   rollbackEntryRestored=False, candidatesRetained=bool(self.new),
                   databaseRestored=False, tasksReplayed=False)


def main(config):
    import fcntl
    c = json.loads(pathlib.Path(config).read_bytes())
    validate(c)
    with HostTransaction(TARGET, shared.HOSTS[TARGET], c['evidenceRoot']) as tx:
        with open(shared.CANON.parent / '.lifecycle.lock', 'a+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            release = Release(tx, c)
            try:
                release.prepare()
                release.candidates()
                release.acceptance()
                release.assets()
                release.switch()
                release.finish()
            except BaseException as error:
                code = str(error) if isinstance(error, Hold) and re.fullmatch('[A-Z0-9_]{1,160}', str(error)) else 'INSPECT_PRIVATE_RECEIPT'
                tx.save('FAILURE.json', {'at': base.now(), 'type': type(error).__name__,
                                       'code': code, 'phase': release.record['phase']})
                if c['releaseId'] in release.state.get('siteControlReleases', {}):
                    try:
                        release.rollback()
                    except BaseException:
                        release.phase('UNKNOWN', failureReconciliationIncomplete=True,
                                      databaseRestored=False, tasksReplayed=False)
                raise


if __name__ == '__main__':
    import sys
    main(sys.argv[1])
