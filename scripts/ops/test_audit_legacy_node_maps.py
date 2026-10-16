#!/usr/bin/env python3
"""Real isolated Docker/Node inspector fixtures. No production access or stop."""
import argparse, hashlib, json, subprocess, time
from pathlib import Path

HERE=Path(__file__).resolve().parent
IMAGE='naumi:evening-0614f9ae6f91-hk'

def run(args,**kw):
    return subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);a=parser.parse_args()
    output=Path(a.output);output.mkdir(parents=True,exist_ok=True)
    results=[]
    modes=['empty','idle','mixed','getter','pending','shared','subclass','alternate','title']
    script=(HERE/'audit_legacy_node_maps.mjs').read_bytes()
    for mode in modes:
        name='naumi-map-audit-test-'+mode
        p=run(['docker','run','-d','--name',name,'--label','io.naumi.map-audit-fixture=local','--network','none','--memory','192m','--cpus','.5','-e','NODE_OPTIONS=','-e','FIXTURE_MAP_MODE='+mode,'-v',str(HERE)+':/fixture:ro','--entrypoint','node',IMAGE,'/fixture/fixture_legacy_node_maps.cjs'])
        assert p.returncode==0,p.stderr.decode()
        try:
            for _ in range(50):
                p=run(['docker','logs',name])
                if b'FIXTURE_READY' in p.stdout:break
                time.sleep(.1)
            flags=['--pid','1','--allow-sigusr1','--accept-full-gc','--allowed-target-listen-ports','9081']
            command=['docker','exec','-i','-e','NODE_OPTIONS=',name,'node','--input-type=module','-',*flags]
            p=run(command,input=script);raw=p.stdout.decode();data=json.loads(raw)
            assert 'fixture-private' not in raw and 'ag-idle' not in raw and '@' not in raw
            if mode=='alternate':
                assert p.returncode==2 and data['holdReason']=='UNEXPECTED_TARGET_LISTENER_POSSIBLE_EXISTING_INSPECTOR'
                assert not data['inspectorOpenedByAudit']
            else:
                assert p.returncode==0 and data['contextMapEnumerationComplete'] and data['inspectorClosedConfirmed'],data
                assert data['protocolMethods']['Runtime.releaseObjectGroup']==len(data['contexts'])
            c=data['counts']
            if mode=='empty':assert c['sessions']==0 and data['status']=='OBSERVED_MAPS_IDLE'
            if mode=='idle':assert c['sessions']==2 and data['status']=='OBSERVED_MAPS_IDLE'
            if mode=='mixed':assert (c['sessions'],c['running'],c['canvasExecuting'],c['tmp'],c['pendingCreating'],c['settledCreating'])==(5,1,1,1,1,1)
            if mode=='getter':assert c['unknownSessionLike']==2 and data['status']=='OBSERVED_ACTIVE_OR_UNKNOWN'
            if mode=='pending':assert c['pendingPersist']==1 and c['pendingToolResults']==1
            if mode=='shared':assert c['sessions']==2 and len(data['contexts'])==3 and not data['uniqueCountsGuaranteed']
            if mode=='subclass':assert c['sessions']==1 and c['running']==1
            status=run(['docker','exec',name,'node','-e',"fetch('http://127.0.0.1:9081').then(x=>x.text()).then(console.log)"])
            assert status.returncode==0 and not json.loads(status.stdout)['getterInvoked']
            data['fixtureCommand']=command;data['fixtureExitStatus']=p.returncode
            (output/(mode+'.json')).write_text(json.dumps(data,indent=2),encoding='utf-8')
            if mode=='empty':
                # Same live process, two observations >=30 seconds apart. This
                # is observation evidence, not authorization to retire it.
                first=time.monotonic();time.sleep(30.1)
                p2=run(command,input=script);second=json.loads(p2.stdout)
                assert p2.returncode==0 and second['status']=='OBSERVED_MAPS_IDLE' and second['inspectorClosedConfirmed']
                (output/'empty-second.json').write_text(json.dumps(second,indent=2),encoding='utf-8')
                assert time.monotonic()-first>=30
                bounded=run(command+['--max-maps','1'],input=script);b=json.loads(bounded.stdout)
                assert bounded.returncode==2 and b['holdReason']=='MAP_SCAN_LIMIT_OR_ACCESS_ERROR' and b['inspectorClosedConfirmed']
                (output/'bounded.json').write_text(json.dumps(b,indent=2),encoding='utf-8')
            state=json.loads(run(['docker','inspect',name]).stdout)[0]['State']
            assert state['Running'] and not state['OOMKilled']
            results.append({'mode':mode,'status':'PASS','exitStatus':p.returncode,'elapsedMs':data['elapsedMs'],'fixtureAlive':True,'oomKilled':False})
        finally:
            # Only this test's newly created, explicitly labelled container.
            raw=json.loads(run(['docker','inspect',name]).stdout)[0]
            assert raw['Config']['Labels']['io.naumi.map-audit-fixture']=='local'
            run(['docker','rm','-f',name])
    summary={'status':'PASS','fixtures':results,'toolSha256':hashlib.sha256(script).hexdigest(),'realInspectorObservations':10,'productionConnections':0}
    (output/'RESULT.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(json.dumps(summary))

if __name__=='__main__':main()
