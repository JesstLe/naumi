#!/usr/bin/env python3
"""Actual isolated Node inspector tests; no DB/supplier/production connection."""
import argparse
import base64
import hashlib
import gzip
import json
from pathlib import Path
import subprocess
import time
import uuid


def run(argv, **kwargs):
    result = subprocess.run(argv, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(str(argv[:3]) + ': ' + result.stderr.decode()[-1000:])
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    root = Path(args.output).resolve()
    root.mkdir(exist_ok=False, parents=True)
    compiled = root / 'compiled'
    compiled.mkdir()
    entry = root / 'server.cjs'
    entry.write_text("const vm=require('node:vm');global.realms=Array.from({length:280},()=>vm.createContext({}));for(const realm of global.realms)vm.runInContext('globalThis.marker=1',realm);if(process.env.FIXTURE_LOAD==='1')require('./compiled/agent.cjs');require('node:http').createServer((q,s)=>s.end('fixture')).listen(9081,'127.0.0.1');console.log('FIXTURE_READY');")
    agent = compiled / 'agent.cjs'
    agent.write_text("global.agentSessions=new Map([['fixture-private@example.invalid::ag-default',{id:'ag-default',email:'fixture-private@example.invalid',agent:{},running:false,lastUsedAt:0,canvasExecuting:false}]]);")
    catalogue = [{'path': '/fixture/' + p.relative_to(root).as_posix(), 'size': p.stat().st_size,
                  'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [entry, agent]]
    script = Path(__file__).with_name('audit_legacy_node_realms.mjs').read_bytes()
    results = []
    for mode in ('loaded', 'lazy', 'changed-catalogue'):
        name = 'video-realm-fixture-' + uuid.uuid4().hex[:12]
        label = 'io.naumi.realm-fixture=' + name
        try:
            run(['docker', 'run', '-d', '--name', name, '--label', label, '--network', 'none',
                 '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '-e', 'NODE_OPTIONS=',
                 '-e', 'FIXTURE_LOAD=' + ('1' if mode == 'loaded' else '0'),
                 '-v', str(root) + ':/fixture:ro', '--entrypoint', 'node', args.image, '/fixture/server.cjs'])
            for _ in range(60):
                if b'FIXTURE_READY' in run(['docker', 'logs', name]):
                    break
                time.sleep(.1)
            else:
                raise RuntimeError('FIXTURE_READINESS_TIMEOUT')
            selected = [dict(row) for row in catalogue]
            if mode == 'changed-catalogue':
                selected[0]['sha256'] = '0' * 64
            command = ['docker', 'exec', '-i', '-e', 'NODE_OPTIONS=', name, 'node', '--input-type=module', '-',
                       '--pid', '1', '--allow-sigusr1', '--compiled-root', '/fixture/compiled', '--entry', '/fixture/server.cjs',
                       '--allowed-target-listen-ports', '9081', '--catalogue-gzip-base64' if mode == 'loaded' else '--catalogue-base64', base64.b64encode(gzip.compress(json.dumps(selected).encode()) if mode == 'loaded' else json.dumps(selected).encode()).decode()]
            observed = subprocess.run(command, input=script, capture_output=True, timeout=60)
            report = json.loads(observed.stdout)
            assert 'fixture-only' not in observed.stdout.decode()
            assert report['heapScanPerformed'] is False and report['heapSnapshotTaken'] is False
            assert report['applicationMethodsCalled'] is False and report['ordinaryDrainReceipt'] is None
            assert report['sourceClosureProven'] is False and report['debuggerPausedByAudit'] is False
            if mode == 'changed-catalogue':
                assert observed.returncode == 2 and report['holdReason'] == 'COMPILED_BYTES_CHANGED'
                assert report['inspectorOpenedByAudit'] is False
            else:
                assert observed.returncode == 0 and report['status'] == 'OBSERVED_SCRIPT_REALMS', report
                assert len(report['executionContexts']) >= 281 and report['inspectorClosedConfirmed'] is True
                assert len(report['agentRuntimeModules']) == 1
                if mode == 'loaded':
                    assert len(report['agentScripts']) == 1 and len(report['agentRuntimeContextIds']) == 1
                    assert report['unloadedAgentModules'] == []
                else:
                    assert report['agentScripts'] == [] and report['agentRuntimeContextIds'] == []
                    assert len(report['unloadedAgentModules']) == 1
            if mode == 'loaded':
                map_script = Path(__file__).with_name('audit_legacy_node_maps.mjs').read_bytes()
                map_command = ['docker','exec','-i','-e','NODE_OPTIONS=',name,'node','--input-type=module','-',
                    '--pid','1','--allow-sigusr1','--accept-full-gc','--allowed-target-listen-ports','9081',
                    '--context-ids',str(report['agentRuntimeContextIds'][0])]
                selected = subprocess.run(map_command,input=map_script,capture_output=True,timeout=60)
                maps = json.loads(selected.stdout)
                assert selected.returncode == 0 and maps['counts']['sessions'] == 1, maps
                assert maps['coverage'] == 'selected-context-native-map-prototypes'
                assert maps['contextMapEnumerationComplete'] is False and maps['contextSelection'] == 'explicit-subset-not-complete'
                assert maps['observedExecutionContexts'] >= 281 and maps['inspectorClosedConfirmed'] is True
                assert 'fixture-private' not in selected.stdout.decode() and 'ag-default' not in selected.stdout.decode()
                (root/'selected-maps.json').write_text(json.dumps(maps,indent=2))
            info = json.loads(run(['docker', 'inspect', name]))[0]
            assert info['State']['Running'] and not info['State']['OOMKilled']
            (root / (mode + '.json')).write_text(json.dumps(report, indent=2))
            results.append({'mode': mode, 'passed': True, 'productionConnections': 0})
        finally:
            info = subprocess.run(['docker', 'inspect', name], capture_output=True)
            if info.returncode == 0:
                row = json.loads(info.stdout)[0]
                assert row['Config']['Labels'].get('io.naumi.realm-fixture') == name
                run(['docker', 'rm', '-f', row['Id']])
    summary = {'status': 'PASS', 'cases': results, 'auditorSha256': hashlib.sha256(script).hexdigest(),
               'productionConnections': 0, 'productionLocksUsed': False}
    (root / 'RESULT.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
