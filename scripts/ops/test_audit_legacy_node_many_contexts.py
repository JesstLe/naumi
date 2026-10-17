#!/usr/bin/env python3
"""Actual isolated V8 all-realm scan; sessions only in the last realm."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid


def run(argv,**kwargs):
    result=subprocess.run(argv,capture_output=True,**kwargs)
    if result.returncode:raise RuntimeError(result.stderr.decode()[-1200:])
    return result.stdout


def main():
    p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--output',required=True)
    p.add_argument('--mode',choices=('idle-last','pending-last','deadline-last','budget-window'));a=p.parse_args()
    root=Path(a.output).resolve();root.mkdir(parents=True,exist_ok=False)
    script=Path(__file__).with_name('audit_legacy_node_maps.mjs').read_bytes();results=[]
    for mode in ([a.mode] if a.mode else ('idle-last','pending-last','deadline-last')):
        name='video-many-map-'+uuid.uuid4().hex[:12];label='io.naumi.many-map-fixture='+name
        code="""const vm=require('node:vm');global.realms=Array.from({length:280},()=>vm.createContext({}));
for(const realm of realms)vm.runInContext('globalThis.marker=[new Map([["a",1]]),new Map([["b",2]]),new Map([["c",3]])]',realm);
vm.runInContext(`globalThis.sessions=new Map([['private-fixture@example.invalid::ag-late',{id:'ag-late',email:'private-fixture@example.invalid',agent:{},running:false,lastUsedAt:0,canvasExecuting:false}]]);`,realms.at(-1));
if(process.env.FIXTURE_PENDING==='1')vm.runInContext(`globalThis.creating=new Map([['private-fixture@example.invalid::tmp-pending',new Promise(()=>{})]]);`,realms.at(-1));
require('node:http').createServer((q,s)=>s.end('fixture')).listen(9081,'127.0.0.1');console.log('FIXTURE_READY');"""
        if mode=='deadline-last':
            code="globalThis.sessions=new Map(Array.from({length:1800},(_,i)=>['private-fixture@example.invalid::ag-'+i,{id:'ag-'+i,email:'private-fixture@example.invalid',agent:{},running:false,lastUsedAt:0,canvasExecuting:false}]));require('node:http').createServer((q,s)=>s.end('fixture')).listen(9081,'127.0.0.1');console.log('FIXTURE_READY');"
        if mode=='budget-window':
            code="globalThis.sessions=new Map([['private-fixture@example.invalid::ag-late',{id:'ag-late',email:'private-fixture@example.invalid',agent:{},running:false,lastUsedAt:0,canvasExecuting:false}]]);require('node:http').createServer((q,s)=>s.end('fixture')).listen(9081,'127.0.0.1');console.log('FIXTURE_READY');"
        entry=root/(mode+'.cjs');entry.write_text(code)
        try:
            run(['docker','run','-d','--name',name,'--label',label,'--network','none','--memory','512m','--memory-swap','512m',
                 '--cpus','1','-e','NODE_OPTIONS=','-e','FIXTURE_PENDING='+('1' if mode=='pending-last' else '0'),
                 '--mount','type=bind,src='+str(entry)+',dst=/fixture.cjs,readonly','--entrypoint','node',a.image,'/fixture.cjs'])
            for _ in range(60):
                if b'FIXTURE_READY' in run(['docker','logs',name]):break
                time.sleep(.1)
            else:raise RuntimeError('FIXTURE_READINESS_TIMEOUT')
            command=['docker','exec','-i','-e','NODE_OPTIONS=',name,'node','--input-type=module','-',
                     '--pid','1','--allow-sigusr1','--accept-full-gc','--allowed-target-listen-ports','9081',
                     '--max-contexts','512','--max-audit-ms','480000']
            if mode=='budget-window':
                command[command.index('--max-audit-ms')+1]='540001'
                rejected=subprocess.run(command+['--accept-many-contexts'],input=script,capture_output=True,timeout=30)
                bad=json.loads(rejected.stdout)
                assert rejected.returncode==2 and bad['holdReason']=='BOUNDED_AUDIT_DEADLINE_REQUIRED'
                assert bad['inspectorOpenedByAudit'] is False
                (root/'above-hard-limit.json').write_text(json.dumps(bad,indent=2))
                command[command.index('--max-audit-ms')+1]='540000'
                observed=subprocess.run(command+['--accept-many-contexts'],input=script,capture_output=True,timeout=60)
                report=json.loads(observed.stdout)
                assert observed.returncode==0 and report['status']=='OBSERVED_MAPS_IDLE' and report['counts']['sessions']==1
                assert report['inspectorClosedConfirmed'] and report['contextMapEnumerationComplete']
                (root/'explicit-window.json').write_text(json.dumps(report,indent=2))
                results.append({'mode':mode,'status':'PASS','explicitMaximumAccepted':540000,'aboveMaximumRejectedBeforeInspector':True})
                print(json.dumps(results[-1]),flush=True)
                continue
            if mode=='deadline-last':
                command[command.index('--max-audit-ms')+1]='1000'
                observed=subprocess.run(command+['--accept-many-contexts'],input=script,capture_output=True,timeout=60)
                report=json.loads(observed.stdout)
                assert observed.returncode==2 and report['holdReason']=='AUDIT_CONTEXT_DEADLINE_EXCEEDED'
                assert report['inspectorClosedConfirmed'] and not report['contextMapEnumerationComplete']
                assert report['observedExecutionContexts']==1 and report['counts']['sessions']>0
                (root/'deadline-last.json').write_text(json.dumps(report,indent=2))
                results.append({'mode':mode,'status':'PASS','deadlineExceededDuringLastRealm':True,
                                'sessionsBeforeDeadline':report['counts']['sessions'],'elapsedMs':report['elapsedMs']})
                print(json.dumps(results[-1]),flush=True)
                continue
            if mode=='idle-last':
                refused=subprocess.run(command,input=script,capture_output=True,timeout=30);report=json.loads(refused.stdout)
                assert refused.returncode==2 and report['holdReason']=='EXPLICIT_MANY_CONTEXTS_OPT_IN_REQUIRED'
                assert report['inspectorOpenedByAudit'] is False
                (root/'missing-opt-in.json').write_text(json.dumps(report,indent=2))
            observed=subprocess.run(command+['--accept-many-contexts'],input=script,capture_output=True,timeout=540)
            report=json.loads(observed.stdout);assert observed.returncode==0,report
            assert 'private-fixture@example.invalid' not in observed.stdout.decode()
            assert report['contextMapEnumerationComplete'] is True and report['coverage']=='all-enumerated-context-native-map-prototypes'
            assert report['observedExecutionContexts']>=281 and len(report['contexts'])>=281
            assert report['counts']['sessions']==1 and report['contexts'][-1]['sessions']==1,report['counts']
            assert report['counts']['pendingCreating']==(1 if mode=='pending-last' else 0)
            assert report['status']==('OBSERVED_ACTIVE_OR_UNKNOWN' if mode=='pending-last' else 'OBSERVED_MAPS_IDLE')
            assert report['inspectorClosedConfirmed'] and not report['applicationMethodsCalled'] and report['ordinaryDrainReceipt'] is None
            assert report['aggregateScan']['maps']<=report['limits']['maxMaps'] and report['aggregateScan']['entries']<=report['limits']['maxEntries']
            (root/(mode+'.json')).write_text(json.dumps(report,indent=2))
            if mode=='idle-last':
                maximum=max(r.get('maps',0) for r in report['contexts']);budget=maximum*2+64
                assert report['aggregateScan']['maps']>budget
                bounded=subprocess.run(command+['--accept-many-contexts','--max-maps',str(budget)],input=script,capture_output=True,timeout=120)
                bound=json.loads(bounded.stdout);assert bounded.returncode==2 and bound['inspectorClosedConfirmed']
                assert bound['holdReason']=='MAP_SCAN_LIMIT_OR_ACCESS_ERROR'
                assert len(bound['contexts'])>0 and bound['aggregateScan']['maps']>0
                assert bound['scanFailure']['maps']<=budget
                (root/'aggregate-bound.json').write_text(json.dumps(bound,indent=2))
            state=json.loads(run(['docker','inspect',name]))[0]['State'];assert state['Running'] and not state['OOMKilled']
            results.append({'mode':mode,'status':'PASS','contexts':len(report['contexts']),'elapsedMs':report['elapsedMs'],
                            'sessions':report['counts']['sessions'],'pendingCreating':report['counts']['pendingCreating']})
            print(json.dumps(results[-1]),flush=True)
        finally:
            row=json.loads(run(['docker','inspect',name]))[0]
            assert row['Config']['Labels'].get('io.naumi.many-map-fixture')==name
            run(['docker','rm','-fv',row['Id']])
    (root/'result.json').write_text(json.dumps({'status':'PASS','results':results,'productionConnections':0,'supplierCalls':0},indent=2))


if __name__=='__main__':main()
