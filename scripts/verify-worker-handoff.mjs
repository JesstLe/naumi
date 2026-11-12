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
let calls=0,held=null,child=null,stderr='',heldTick=null;const receipts=new Map(),webBootId=randomUUID();
const makeReceipt=req=>({schemaVersion:1,tickId:req.headers['x-naumi-worker-tick-id'],
 worker:{instanceId:req.headers['x-naumi-worker-instance-id'],bootId:req.headers['x-naumi-worker-boot-id'],commit:req.headers['x-naumi-worker-commit']},
 web:{instanceId:'fixture-web-1',commit,bootId:webBootId},phase:'running',acceptedAt:new Date().toISOString(),completedAt:null,result:null});
const envelope=receipt=>({ok:receipt.phase==='completed',receipt,server:{instanceId:'fixture-web-1',commit,bootId:webBootId}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const app=http.createServer((req,res)=>{
 assert.equal(req.headers['x-video-worker-secret'],secret);
 if(req.method==='GET') {const id=new URL(req.url,'http://fixture').searchParams.get('tickId');const receipt=receipts.get(id);assert.ok(receipt);assert.equal(req.headers['x-naumi-worker-boot-id'],receipt.worker.bootId);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(envelope(receipt)));return;}
 assert.equal(req.method,'POST');assert.equal(req.url,'/api/video/worker/tick');calls++;held=res;heldTick=makeReceipt(req);receipts.set(heldTick.tickId,heldTick);
});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
const appPort=app.address().port;
const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const controlPort=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
async function until(read,test,label,timeout=12000) {
 const end=Date.now()+timeout;
 while(Date.now()<end) {try{const v=await Promise.race([read(),sleep(100).then(()=>{throw Error('pending');})]);if(test(v))return v;}catch{}await sleep(30);}
 throw Error('TIMEOUT '+label+' '+stderr+' '+JSON.stringify({exitCode:child?.exitCode,signalCode:child?.signalCode,output:child?.output}));
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
 const ipcShutdown=process.platform==='win32';
 const p=spawn(process.execPath,[path.join(root,'video-worker.mjs')],{env:{...process.env,NAUMI_APP_ORIGIN:`http://127.0.0.1:${appPort}`,
  VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'1',
  NAUMI_WORKER_STATE_FILE:path.join(directory,'worker.json'),NAUMI_INSTANCE_ID:'fixture-worker-1',SOURCE_COMMIT:commit,
  NAUMI_WORKER_TARGET_INSTANCE_ID:'fixture-web-1',
  NAUMI_WORKER_PARENT_START:ipcShutdown?'1':'0',
  NAUMI_WORKER_CONTROL_PORT:String(controlPort)},windowsHide:true,stdio:ipcShutdown?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
 p.on('error',error=>{stderr+=String(error);});p.stderr.on('data',b=>{stderr+=b;});
 p.output='';p.stdout.on('data',b=>{p.output+=b;});p.done=new Promise(resolve=>p.on('exit',(code,signal)=>resolve({code,signal})));child=p;
 const state=await until(status,s=>s.instanceId==='fixture-worker-1','worker start');
 if(ipcShutdown) {
  const id=randomUUID();let acknowledged=false;
  p.on('message',message=>{if(message?.type==='naumi-worker-gate-ack'&&message.id===id&&message.allowed===true&&message.started===true)acknowledged=true;});
  p.send({type:'naumi-worker-gate',id,allowed:true,start:true});
  await until(async()=>acknowledged,Boolean,'parent start acknowledgement');
 }
 return state;
}
function requestShutdown() {
 // Windows kill('SIGTERM') terminates forcibly; the existing supervisor IPC
 // disconnect invokes the same graceful stop handler without aborting the tick.
 if(process.platform==='win32')child.disconnect();else assert.equal(child.kill('SIGTERM'),true);
}
async function gracefulExit() {
 const stopped=await until(()=>child.done,()=>true,'graceful exit');
 assert.equal(stopped.code,0);assert.equal(stopped.signal,null);
 await until(async()=>child.output,output=>output.includes('WORKER_TICK_DRAIN=COMPLETE'),'drain acknowledgement');
 assert.match(child.output,/WORKER_TICK_DRAIN=COMPLETE/);
}
try {
 let s=await start();assert.equal(s.phase,'QUIESCENT');await sleep(100);assert.equal(calls,0);
 const unauthorized=await fetch(`http://127.0.0.1:${controlPort}/status`);assert.equal(unauthorized.status,401);
 await control('resume',s);await until(async()=>calls,n=>n===1,'first tick');
 s=await status();assert.equal(s.activeTicks,1);s=(await control('drain',s)).state;assert.equal(s.phase,'DRAINING');
 requestShutdown();await sleep(150);assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);assert.equal(held.destroyed,false);
 assert.equal(calls,1);Object.assign(heldTick,{phase:'completed',completedAt:new Date().toISOString(),result:{ok:true,processed:1,at:'fixture'}});held.writeHead(200,{'content-type':'application/json'});held.end(JSON.stringify(envelope(heldTick)));
 await gracefulExit();
 s=await start();assert.equal(s.phase,'QUIESCENT');await sleep(100);assert.equal(calls,1);
 await control('resume',s);await until(async()=>calls,n=>n===2,'crash tick');
 child.kill('SIGKILL');await child.done;
 const saved=JSON.parse(await readFile(path.join(directory,'worker.json'),'utf8'));assert.equal(saved.lastTick.phase,'dispatched');
 held.destroy();s=await start();assert.equal(s.phase,'UNKNOWN');assert.equal(s.unresolvedTicks,1);assert.equal(s.tickDrainComplete,false);
 const rejected=await fetch(`http://127.0.0.1:${controlPort}/control`,{method:'POST',headers:{'x-video-worker-secret':secret},
  body:JSON.stringify({action:'resume',operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision})});
 assert.equal(rejected.status,409);assert.equal((await rejected.json()).error,'UNRESOLVED_TICK_BLOCKS_RESUME');
 await sleep(100);assert.equal(calls,2);assert.equal(s.workerLeases,null);assert.equal(s.acceptedTasks,null);assert.equal(s.agentSessions,null);
 const command={action:'reconcile',tickId:s.lastTick.id,operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision};
 const reconcile=()=>fetch(`http://127.0.0.1:${controlPort}/control`,{method:'POST',headers:{'x-video-worker-secret':secret},body:JSON.stringify(command)});
 assert.equal((await reconcile()).status,409); // Running is not completion evidence.
 Object.assign(heldTick,{phase:'completed',completedAt:new Date().toISOString(),result:{ok:true,processed:1,at:'fixture-lost-response'}});
 const reconciled=await reconcile();assert.equal(reconciled.status,200);s=(await reconciled.json()).state;assert.equal(s.phase,'QUIESCENT');assert.equal(s.paused,true);assert.equal(s.tickDrainComplete,true);
 assert.equal((await(await reconcile()).json()).duplicate,true);assert.equal(calls,2);
 requestShutdown();await gracefulExit();
 s=await start();assert.equal(s.phase,'QUIESCENT');assert.equal(s.lastTick.phase,'complete');assert.equal(calls,2);
 requestShutdown();await gracefulExit();
 console.log('WORKER_HANDOFF_PROCESS=PASS PAUSED_START=YES NO_ABORT_ON_DRAIN=YES RESTART_PAUSED=YES CRASH=UNKNOWN READONLY_RECONCILE=YES NO_REPLAY=YES CALLS=2_FIXTURE SUPPLIER_CALLS=0 EXIT=0');
} finally {
 if(child&&child.exitCode===null) {child.kill('SIGKILL');await child.done;}
 held?.destroy();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});
}
