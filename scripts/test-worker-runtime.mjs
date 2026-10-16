import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorkerRuntime,fileStateStore,createWorkerControlServer} from './worker-runtime.mjs';

const id='11111111-1111-4111-8111-111111111111', op=()=>crypto.randomUUID();
const commit='a'.repeat(40), secret='worker-secret-47-'.padEnd(40,'x');
const response=body=>({ok:true,status:200,json:async()=>body});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};

test('paused durable worker resumes once and drains without duplicate tick',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-runtime-'));
 try {
  const store=fileStateStore(path.join(dir,'state.json')),calls=[];
  const w=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,store,startPaused:true,
    fetchImpl:async(url,init)=>{calls.push({url,init});return response({ok:true,processed:1,at:'fixture'});}});
  await w.init();assert.equal(w.snapshot().phase,'QUIESCENT');assert.deepEqual(await w.tick(),{skipped:true});assert.equal(calls.length,0);
  const result=await w.control({action:'resume',operationId:op(),bootId:w.bootId,expectedRevision:0});assert.equal(result.receipt.revision,1);
  await w.tick();assert.equal(calls.length,1);assert.equal(calls[0].url,'http://candidate:3000/api/video/worker/tick');
  const duplicate=await w.control({action:'resume',operationId:Object.keys(w.state.operations)[0],bootId:w.bootId,expectedRevision:0});assert.equal(duplicate.duplicate,true);
  const drained=await w.control({action:'drain',operationId:op(),bootId:w.bootId,expectedRevision:1});assert.equal(drained.state.paused,true);
  assert.equal(await w.shutdown(),true);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('unknown tick outcome persists an unresolved pause across restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-runtime-'));
 try {
  const filename=path.join(dir,'state.json'),store=fileStateStore(filename);
  const bad=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,store,startPaused:false,
    fetchImpl:async()=>{throw Error('timeout')}});await bad.init();
  await bad.tick();assert.equal(bad.snapshot().phase,'UNKNOWN');assert.equal(bad.snapshot().unresolvedTicks,1);
  const restarted=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,store,startPaused:false,
    fetchImpl:async()=>response({ok:true})});await restarted.init();assert.equal(restarted.snapshot().phase,'UNKNOWN');
  await assert.rejects(()=>restarted.control({action:'resume',operationId:op(),bootId:restarted.bootId,expectedRevision:restarted.state.revision}),/UNRESOLVED_TICK_BLOCKS_RESUME/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('control HTTP is authenticated and idempotent',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-runtime-'));
 try {
  const w=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,store:fileStateStore(path.join(dir,'state.json')),startPaused:true});await w.init();
  const server=await createWorkerControlServer(w,{port:0}),address=server.address(),port=address.port;
  const post=async(headers,body)=>fetch(`http://127.0.0.1:${port}/control`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  let res=await post({'x-video-worker-secret':'wrong'},{action:'resume',operationId:op(),bootId:w.bootId,expectedRevision:0});assert.equal(res.status,401);
  const operationId=op();res=await post({'x-video-worker-secret':secret},{action:'resume',operationId,bootId:w.bootId,expectedRevision:0});assert.equal(res.status,200);const receipt=await res.json();
  res=await post({'x-video-worker-secret':secret},{action:'resume',operationId,bootId:w.bootId,expectedRevision:0});assert.equal((await res.json()).duplicate,true);assert.equal(receipt.receipt.revision,1);
  await new Promise(resolve=>server.close(resolve));
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('drain does not claim completion while a tick is in flight',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-runtime-'));
 try {
  const gate=deferred(),w=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,store:fileStateStore(path.join(dir,'state.json')),startPaused:false,fetchImpl:async()=>gate.promise});await w.init();
  const running=w.tick();await new Promise(r=>setTimeout(r,10));const r=await w.control({action:'drain',operationId:op(),bootId:w.bootId,expectedRevision:0});assert.equal(r.state.phase,'DRAINING');assert.equal(r.state.tickDrainComplete,false);
  gate.resolve(response({ok:true}));await running;assert.equal(w.snapshot().tickDrainComplete,true);
  await w.shutdown();
 } finally {await rm(dir,{recursive:true,force:true});}
});

const memoryStore=()=>{
 let value=null;return {async read(){return value&&structuredClone(value);},async write(v){value=structuredClone(v);}};
};
const options=store=>({origin:'http://candidate:3000',secret,instanceId:id,commit,store,startPaused:true,
 fetchImpl:async()=>response({ok:true})});

test('concurrent controls enforce one revision winner',async()=>{
 const w=new WorkerRuntime(options(memoryStore()));await w.init();
 const results=await Promise.allSettled(['resume','drain'].map(action=>w.control({action,operationId:op(),bootId:w.bootId,expectedRevision:0})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
 assert.equal(w.state.revision,1);
});

test('successful resume persists across clean restart; boot fence rejects new stale commands',async()=>{
 const store=memoryStore(),w=new WorkerRuntime(options(store));await w.init();
 const command={action:'resume',operationId:op(),bootId:w.bootId,expectedRevision:0};await w.control(command);
 const next=new WorkerRuntime(options(store));await next.init();assert.equal(next.snapshot().phase,'IDLE');
 assert.equal((await next.control(command)).duplicate,true);
 await assert.rejects(()=>next.control({...command,action:'drain',operationId:op(),expectedRevision:1}),/BOOT_CHANGED/);
});

test('same UUID cannot mutate different actions',async()=>{
 const w=new WorkerRuntime(options(memoryStore()));await w.init();const command={action:'resume',operationId:op(),bootId:w.bootId,expectedRevision:0};
 await w.control(command);await assert.rejects(()=>w.control({...command,action:'drain'}),/OPERATION_CONFLICT/);
});

test('identity/origin drift cannot reuse durable control state',async()=>{
 const store=memoryStore(),w=new WorkerRuntime(options(store));await w.init();
 for(const changed of [{origin:'http://other:3000'},{instanceId:'other-worker'},{commit:'b'.repeat(40)}]) {
  await assert.rejects(()=>new WorkerRuntime({...options(store),...changed}).init(),/IDENTITY_MISMATCH/);
 }
 assert.throws(()=>new WorkerRuntime({...options(store),origin:'http://user:password@candidate:3000'}),/INVALID_WORKER_ORIGIN/);
});

test('persisting tick intent fails closed before any network dispatch',async()=>{
 const store=memoryStore(),w=new WorkerRuntime({...options(store),startPaused:false});await w.init();
 let calls=0;w.fetch=async()=>{calls++;return response({ok:true});};store.write=async()=>{throw Error('disk full');};
 await w.tick();assert.equal(calls,0);assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().tickDrainComplete,false);
});

test('failed drain persistence is not acknowledged on duplicate operation',async()=>{
 const store=memoryStore(),w=new WorkerRuntime(options(store));await w.init();
 const command={action:'drain',operationId:op(),bootId:w.bootId,expectedRevision:0};store.write=async()=>{throw Error('disk full');};
 await assert.rejects(()=>w.control(command),/disk full/);await assert.rejects(()=>w.control(command),/WORKER_CONTROL_FAULT/);
 assert.equal(w.snapshot().tickDrainComplete,false);
});

test('lost process after dispatch cannot become idle after restart',async()=>{
 const store=memoryStore(),w=new WorkerRuntime({...options(store),startPaused:false});await w.init();
 w.state.lastTick={id:op(),phase:'dispatched',startedAt:new Date().toISOString()};await w.persist();
 const restarted=new WorkerRuntime(options(store));await restarted.init();assert.equal(restarted.snapshot().phase,'UNKNOWN');
 assert.equal(restarted.snapshot().activeTicks,0);assert.equal(restarted.snapshot().unresolvedTicks,1);assert.equal(restarted.snapshot().tickDrainComplete,false);
});

test('uncertain HTTP/body response cannot cause another tick',async()=>{
 for(const fetchImpl of [async()=>({ok:false,status:500}),async()=>response({bad:true}),async()=>{throw Error('network');}]) {
  let calls=0;const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});await w.init();
  await w.tick();await w.tick();assert.equal(calls,1);assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().tickDrainComplete,false);
 }
});

test('legacy mode remains single-flight and retries scans but has no false quiescence',async()=>{
 let calls=0;const w=new WorkerRuntime({...options(null),startPaused:false,stopOnUncertain:false,fetchImpl:async()=>{calls++;throw Error('legacy');}});await w.init();
 await w.tick();await w.tick();assert.equal(calls,2);assert.equal(w.snapshot().durableControl,false);assert.equal(w.snapshot().tickDrainComplete,false);
 await assert.rejects(()=>w.control({action:'drain',operationId:op(),bootId:w.bootId,expectedRevision:0}),/DURABLE_CONTROL_NOT_ENABLED/);
});

test('shutdown rejects a racing new resume and preserves pause',async()=>{
 const w=new WorkerRuntime(options(memoryStore()));await w.init();await w.shutdown();
 await assert.rejects(()=>w.control({action:'resume',operationId:op(),bootId:w.bootId,expectedRevision:0}),/WORKER_STOPPING/);
 assert.equal(w.snapshot().paused,true);
});

test('unknown durable phase is not sanitized by uncertain=false',async()=>{
 const store=memoryStore(),w=new WorkerRuntime(options(store));await w.init();
 w.state.lastTick={id:op(),phase:'unknown'};w.state.uncertain=false;await w.persist();
 const restarted=new WorkerRuntime(options(store));await restarted.init();assert.equal(restarted.snapshot().phase,'UNKNOWN');assert.equal(restarted.snapshot().tickDrainComplete,false);
});
