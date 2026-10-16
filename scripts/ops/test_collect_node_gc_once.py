#!/usr/bin/env python3
"""One fresh isolated Node fixture; no production connection."""
import json, subprocess, time, hashlib
from pathlib import Path

here=Path(__file__).resolve().parent
out=here.parents[1]/'output'/'node-gc-once-fixture';out.mkdir(parents=True,exist_ok=True)
name='naumi-one-gc-verified-fixture'
def run(args,**kw):return subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
created=run(['docker','run','-d','--name',name,'--label','io.naumi.gc-fixture=local','--network','none','--memory','384m','--cpus','.5','-e','NODE_OPTIONS=','-v',str(here)+':/fixture:ro','--entrypoint','node','naumi:evening-0614f9ae6f91-hk','/fixture/fixture_node_gc_once.cjs'])
assert created.returncode==0,created.stderr.decode()
try:
    for _ in range(50):
        if b'GC_FIXTURE_READY' in run(['docker','logs',name]).stdout:break
        time.sleep(.1)
    probe=['docker','exec','-u','1001',name,'node','-e',"fetch('http://127.0.0.1:9081').then(r=>r.text()).then(console.log)"]
    before=run(probe);assert before.returncode==0
    code=(here/'collect_node_gc_once.mjs').read_bytes()
    command=['docker','exec','-i','-u','1001','-e','NODE_OPTIONS=',name,'node','--max-old-space-size=64','--input-type=module','-','--pid','1','--allow-sigusr1','--accept-full-gc','--allowed-target-listen-ports','9081']
    result=run(command,input=code);data=json.loads(result.stdout)
    after=run(probe);assert after.returncode==0 and json.loads(before.stdout)==json.loads(after.stdout)
    assert data['status']=='GC_COMPLETED_NOT_DRAIN' and data['gcCalls']==1 and data['inspectorClosedConfirmed'] and result.returncode==0
    assert data['protocolMethods']=={'Runtime.evaluate':2,'Runtime.getHeapUsage':2,'HeapProfiler.collectGarbage':1}
    assert data['heapAfter']['usedSize']<data['heapBefore']['usedSize']
    state=json.loads(run(['docker','inspect',name]).stdout)[0]['State'];assert state['Running'] and not state['OOMKilled']
    (out/'GC_RESULT.json').write_text(json.dumps(data,indent=2))
    summary={'status':'PASS','toolSha256':hashlib.sha256(code).hexdigest(),'command':command,'input':'tool via stdin; reachable sentinel 40000 rows + pending task + unreachable garbage','before':json.loads(before.stdout),'after':json.loads(after.stdout),'exitStatus':result.returncode,'fixtureAlive':True,'oomKilled':False,'productionConnections':0}
    (out/'RESULT.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
finally:
    raw=json.loads(run(['docker','inspect',name]).stdout)[0];assert raw['Config']['Labels']['io.naumi.gc-fixture']=='local'
    run(['docker','rm','-f',name])
