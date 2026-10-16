// Real child-process test; fake local App, no DB/media/credentials/suppliers.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url)),directory=await mkdtemp(path.join(tmpdir(),'naumi-worker-handoff-'));
const secret='fixture-no-production-secret'.padEnd(40,'-'),commit='a'.repeat(40);
let calls=0,held=null,child=null,stderr='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const app=http.createServer((req,res)=>{
 assert.equal(req.method,'POST');assert.equal(req.url,'/api/video/worker/tick');
 assert.equal(req.headers['x-video-worker-secret'],secret);calls++;held=res;
});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
const appPort=app.address().port;
const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const controlPort=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
async function until(read,test,label,timeout=12000) {
 const end=Date.now()+timeout;
 while(Date.now()<end) {try{const v=await Promise.race([read(),sleep(100).then(()=>{throw Error('pending');})]);if(test(v))return v;}catch{}await sleep(30);}
 throw Error('TIMEOUT '+label+' '+stderr);
}
const status=async()=>{
 const response=await fetch(`http://127.0.0.1:${controlPort}/status`,{headers:{'x-video-worker-secret':secret},signal:AbortSignal.timeout(1000)});
 assert.equal(response.status,200);return response.json();
};
const control=async(action,s)=>{
 const response=await fetch(`http://127.0.0.1:${controlPort}/control`,{method:'POST',headers:{'x-video-worker-secret':secret},
  body:JSON.stringify({action,operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision})});
 assert.equal(response.status,200);return response.json();
};
async function start() {
 const p=spawn(process.execPath,[path.join(root,'video-worker.mjs')],{env:{...process.env,NAUMI_APP_ORIGIN:`http://127.0.0.1:${appPort}`,
  VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'1',
  NAUMI_WORKER_STATE_FILE:path.join(directory,'worker.json'),NAUMI_INSTANCE_ID:'fixture-worker-1',SOURCE_COMMIT:commit,
  NAUMI_WORKER_CONTROL_PORT:String(controlPort)},stdio:['ignore','pipe','pipe']});
 p.on('error',error=>{stderr+=String(error);});p.stderr.on('data',b=>{stderr+=b;});
 p.stdout.on('data',()=>{});p.done=new Promise(resolve=>p.on('exit',(code,signal)=>resolve({code,signal})));child=p;
 return until(status,s=>s.instanceId==='fixture-worker-1','worker start');
}
try {
 let s=await start();assert.equal(s.phase,'QUIESCENT');await sleep(100);assert.equal(calls,0);
 const unauthorized=await fetch(`http://127.0.0.1:${controlPort}/status`);assert.equal(unauthorized.status,401);
 await control('resume',s);await until(async()=>calls,n=>n===1,'first tick');
 s=await status();assert.equal(s.activeTicks,1);s=(await control('drain',s)).state;assert.equal(s.phase,'DRAINING');
 child.kill('SIGTERM');await sleep(150);assert.equal(child.exitCode,null);assert.equal(held.destroyed,false);
 assert.equal(calls,1);held.writeHead(200,{'content-type':'application/json'});held.end(JSON.stringify({ok:true,processed:1,at:'fixture'}));
 const stopped=await until(()=>child.done,()=>true,'graceful exit');assert.equal(stopped.code,0);
 s=await start();assert.equal(s.phase,'QUIESCENT');await sleep(100);assert.equal(calls,1);
 await control('resume',s);await until(async()=>calls,n=>n===2,'crash tick');
 child.kill('SIGKILL');await child.done;
 const saved=JSON.parse(await readFile(path.join(directory,'worker.json'),'utf8'));assert.equal(saved.lastTick.phase,'dispatched');
 held.destroy();s=await start();assert.equal(s.phase,'UNKNOWN');assert.equal(s.unresolvedTicks,1);assert.equal(s.tickDrainComplete,false);
 const rejected=await fetch(`http://127.0.0.1:${controlPort}/control`,{method:'POST',headers:{'x-video-worker-secret':secret},
  body:JSON.stringify({action:'resume',operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision})});
 assert.equal(rejected.status,409);assert.equal((await rejected.json()).error,'UNRESOLVED_TICK_BLOCKS_RESUME');
 await sleep(100);assert.equal(calls,2);assert.equal(s.workerLeases,null);assert.equal(s.acceptedTasks,null);assert.equal(s.agentSessions,null);
 child.kill('SIGTERM');const unknown=await child.done;assert.equal(unknown.code,2);
 console.log('WORKER_HANDOFF_PROCESS=PASS PAUSED_START=YES NO_ABORT_ON_DRAIN=YES RESTART_PAUSED=YES CRASH=UNKNOWN NO_REPLAY=YES CALLS=2_FIXTURE SUPPLIER_CALLS=0 EXIT=0');
} finally {
 if(child&&child.exitCode===null) {child.kill('SIGKILL');await child.done;}
 held?.destroy();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});
}
