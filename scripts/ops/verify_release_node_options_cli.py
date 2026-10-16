#!/usr/bin/env python3
"""Real local fixture: preload belongs to PID1, never to extra Node CLI helpers."""
import json, pathlib, subprocess, time
from types import SimpleNamespace
import release47_controls as controls
import release_maintenance_session as session
import worker_handoff

def main():
    folder=pathlib.Path(__file__).resolve().parents[2]/'output'/'cli-node-options-fixture';folder.mkdir(parents=True,exist_ok=True)
    (folder/'preload.cjs').write_text("if(process.argv[1]!=='/fixture/service.cjs')throw Error('FIXTURE_PRELOAD_REJECTS_EXTRA_CLI');global.observerReady=true;\n")
    (folder/'service.cjs').write_text(r'''
const http=require('node:http');if(!global.observerReady)throw Error('PID1_OBSERVER_REQUIRED');
const boot='22222222-2222-4222-8222-222222222222';global.pending=new Promise(()=>{});
const app={schemaVersion:1,identity:{instanceId:'cli-fixture',bootId:boot,commit:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',bootSource:'preload'},admission:{mode:'draining',revision:0},transport:{verified:true}};
function serve(req,res){res.setHeader('content-type','application/json');let result;
if(req.url==='/api/health')result={db:{ok:true}};
else if(req.url==='/api/version')result={commit:app.identity.commit,version:'1792148400'};
else if(req.url==='/fixture-state')result={pid:process.pid,observerReady:global.observerReady,pending:global.pending instanceof Promise};
else if(req.url.startsWith('/api/internal/release/')){if(req.headers['x-release-control-secret']!=='fixture-only-control'){res.writeHead(401);res.end('{}');return;}result={...app,observedAt:new Date().toISOString()};}
else if(req.url==='/status'){if(req.headers['x-video-worker-secret']!=='fixture-only-worker'){res.writeHead(401);res.end('{}');return;}result={schemaVersion:1,fixtureWorker:true};}
else {res.writeHead(404);res.end('{}');return;}res.end(JSON.stringify(result));}
http.createServer(serve).listen(3000,'127.0.0.1');http.createServer(serve).listen(3001,'127.0.0.1');console.log('CLI_FIXTURE_READY');
''')
    name='naumi-cli-preload-fixture';image='naumi:evening-0614f9ae6f91-hk'
    def run(cmd,**kw):return subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
    created=run(['docker','run','-d','--name',name,'--label','io.naumi.cli-fixture=local','--network','none','--memory','192m','-e','NODE_OPTIONS=--require=/fixture/preload.cjs','-e','NAUMI_RELEASE_RUNTIME=1','-e','NAUMI_INSTANCE_ID=cli-fixture','-e','SOURCE_COMMIT='+'b'*40,'-e','RELEASE_CONTROL_SECRET=fixture-only-control','-e','NAUMI_WORKER_RELEASE_CONTROL=1','-e','VIDEO_WORKER_SECRET=fixture-only-worker','-v',str(folder)+':/fixture:ro','--entrypoint','node',image,'/fixture/service.cjs'])
    assert created.returncode==0,created.stderr.decode()
    try:
        for _ in range(50):
            if b'CLI_FIXTURE_READY' in run(['docker','logs',name]).stdout:break
            time.sleep(.1)
        row=json.loads(run(['docker','inspect',name]).stdout)[0];ident=session.public_identity(row);original_pid=row['State']['Pid']
        bad=run(['docker','exec',name,'node','-e','console.log("MUST_NOT_RUN")'])
        assert bad.returncode!=0 and b'FIXTURE_PRELOAD_REJECTS_EXTRA_CLI' in bad.stderr
        calls=[]
        def command(cmd,**kw):
            calls.append(cmd);r=run(cmd);assert r.returncode==0,r.stderr.decode();return r.stdout
        tx=SimpleNamespace(pin=lambda identity:json.loads(command(['docker','inspect',identity['id']]))[0],run=command)
        got=controls.app_status(tx,ident);assert got['transport']['verified'] and got['identity']['bootSource']=='preload'
        adapter=session.LiveAdapter(tx,{'commit':'b'*40,'buildVersion':'1792148400'})
        verified=adapter.verify({'assetPrefix':''},ident,'fixture-op');assert verified['probe']['health']['db']['ok']
        # Exercise APP_REMOTE's control branch only against this isolated fixture.
        response=command(['docker','exec','-e','NODE_OPTIONS=',ident['id'],'node','--input-type=module','-e',controls.APP_REMOTE,json.dumps({'action':'drain'})]);assert json.loads(response)['transport']['verified']
        assert worker_handoff.remote(lambda cmd:command(cmd).decode(),ident['id'])['fixtureWorker']
        state=json.loads(command(['docker','exec','-e','NODE_OPTIONS=',ident['id'],'node','-e',"fetch('http://127.0.0.1:3000/fixture-state').then(r=>r.text()).then(console.log)"]))
        final=json.loads(command(['docker','inspect',ident['id']]))[0]
        assert state=={'pid':1,'observerReady':True,'pending':True} and final['State']['Pid']==original_pid and final['State']['Running'] and not final['State']['OOMKilled']
        assert 'NODE_OPTIONS=--require=/fixture/preload.cjs' in final['Config']['Env']
        assert all(cmd[2:4]==['-e','NODE_OPTIONS='] for cmd in calls if cmd[:2]==['docker','exec'])
        result={'status':'PASS','unfixedCliExit':bad.returncode,'fixedProbeAndStatus':'PASS','workerStatus':'PASS','pid1ObserverAndPendingPreserved':state,'pidUnchanged':True,'serviceNodeOptionsUnchanged':True,'productionConnections':0}
        (folder/'RESULT.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
    finally:
        raw=json.loads(run(['docker','inspect',name]).stdout)[0];assert raw['Config']['Labels']['io.naumi.cli-fixture']=='local';run(['docker','rm','-f',name])

if __name__=='__main__':main()
