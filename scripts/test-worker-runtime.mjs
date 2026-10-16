import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorkerRuntime,fileStateStore,createWorkerControlServer} from './worker-runtime.mjs';

const id='11111111-1111-4111-8111-111111111111', op=()=>crypto.randomUUID();
const commit='a'.repeat(40), secret='worker-secret-47-'.padEnd(40,'x');
const response=body=>({ok:true,status:200,json:async()=>body});
const targetInstanceId='fixture-web',webBootId='22222222-2222-4222-8222-222222222222';
const completed=(init,result={ok:true})=>response({ok:true,server:{instanceId:targetInstanceId,commit,bootId:webBootId},receipt:{schemaVersion:1,
 tickId:init.headers['x-naumi-worker-tick-id'],worker:{instanceId:init.headers['x-naumi-worker-instance-id'],bootId:init.headers['x-naumi-worker-boot-id'],commit},
 web:{instanceId:targetInstanceId,commit,bootId:webBootId},phase:'completed',acceptedAt:'2026-10-16T00:00:00.000Z',completedAt:'2026-10-16T00:00:01.000Z',result}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};

test('paused durable worker resumes once and drains without duplicate tick',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-runtime-'));
 try {
  const store=fileStateStore(path.join(dir,'state.json')),calls=[];
  const w=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,targetInstanceId,store,startPaused:true,
    fetchImpl:async(url,init)=>{calls.push({url,init});return completed(init,{ok:true,processed:1,at:'fixture'});}});
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
  const bad=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,targetInstanceId,store,startPaused:false,
    fetchImpl:async()=>{throw Error('timeout')}});await bad.init();
  await bad.tick();assert.equal(bad.snapshot().phase,'UNKNOWN');assert.equal(bad.snapshot().unresolvedTicks,1);
  const restarted=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,targetInstanceId,store,startPaused:false,
    fetchImpl:async()=>response({ok:true})});await restarted.init();assert.equal(restarted.snapshot().phase,'UNKNOWN');
  await assert.rejects(()=>restarted.control({action:'resume',operationId:op(),bootId:restarted.bootId,expectedRevision:restarted.state.revision}),/UNRESOLVED_TICK_BLOCKS_RESUME/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('control HTTP is authenticated and idempotent',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worker-runtime-'));
 try {
  const w=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,targetInstanceId,store:fileStateStore(path.join(dir,'state.json')),startPaused:true});await w.init();
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
  let tickInit;const gate=deferred(),w=new WorkerRuntime({origin:'http://candidate:3000',secret,instanceId:id,commit,targetInstanceId,store:fileStateStore(path.join(dir,'state.json')),startPaused:false,fetchImpl:async(_url,init)=>{tickInit=init;return gate.promise;}});await w.init();
  const running=w.tick();const deadline=Date.now()+2000;while(!tickInit){assert.ok(Date.now()<deadline,'tick must reach the mocked HTTP boundary');await new Promise(r=>setTimeout(r,5));}const r=await w.control({action:'drain',operationId:op(),bootId:w.bootId,expectedRevision:0});assert.equal(r.state.phase,'DRAINING');assert.equal(r.state.tickDrainComplete,false);
  gate.resolve(completed(tickInit));await running;assert.equal(w.snapshot().tickDrainComplete,true);
  await w.shutdown();
 } finally {await rm(dir,{recursive:true,force:true});}
});

const memoryStore=()=>{
 let value=null;return {async read(){return value&&structuredClone(value);},async write(v){value=structuredClone(v);}};
};
const options=store=>({origin:'http://candidate:3000',secret,instanceId:id,commit,targetInstanceId,store,startPaused:true,
 fetchImpl:async(_url,init)=>completed(init)});

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

test('lost response reconciles only via GET against original boot and remains paused across restart',async()=>{
 const store=memoryStore(),calls=[];let saved;
 const first=new WorkerRuntime({...options(store),startPaused:false,fetchImpl:async(url,init)=>{calls.push(init.method);saved=await completed(init).json();throw Error('response lost');}});await first.init();await first.tick();
 const originalBoot=first.bootId,id=first.snapshot().lastTick.id;
 const next=new WorkerRuntime({...options(store),fetchImpl:async(url,init)=>{calls.push(init.method);assert.equal(init.method,'GET');assert.equal(new URL(url).searchParams.get('tickId'),id);assert.equal(init.headers['x-naumi-worker-boot-id'],originalBoot);return response(saved);}});await next.init();
 assert.notEqual(next.bootId,originalBoot);const command={action:'reconcile',operationId:op(),tickId:id,bootId:next.bootId,expectedRevision:0};
 const result=await next.control(command);assert.equal(result.state.phase,'QUIESCENT');assert.equal(result.state.paused,true);assert.equal(result.state.unresolvedTicks,0);assert.equal(result.state.tickDrainComplete,true);
 assert.equal(result.receipt.originalWorkerBootId,originalBoot);assert.equal(result.receipt.serverReceipt.tickId,id);
 assert.equal((await next.control(command)).duplicate,true);assert.deepEqual(calls,['POST','GET']);await next.tick();assert.deepEqual(calls,['POST','GET']);
 const restarted=new WorkerRuntime(options(store));await restarted.init();assert.equal(restarted.snapshot().phase,'QUIESCENT');assert.equal(restarted.snapshot().paused,true);assert.equal((await restarted.control(command)).duplicate,true);
});

test('wrong/missing/running/corrupt/unreachable receipts cannot reconcile or replay a tick',async()=>{
 const mutations=[data=>({...data,server:{...data.server,commit:'b'.repeat(40)}}),data=>({...data,server:{...data.server,instanceId:'wrong-web'}}),
  data=>({...data,receipt:{...data.receipt,tickId:op()}}),data=>({...data,receipt:{...data.receipt,worker:{...data.receipt.worker,bootId:op()}}}),
  data=>({...data,receipt:{...data.receipt,worker:{...data.receipt.worker,instanceId:'wrong-worker'}}}),
  data=>({...data,receipt:{...data.receipt,web:{...data.receipt.web,commit:'b'.repeat(40)}}}),
  data=>({...data,receipt:{...data.receipt,phase:'running',completedAt:null,result:null}}),data=>({...data,receipt:{...data.receipt,phase:'unknown'}}),
  data=>({...data,receipt:{...data.receipt,completedAt:null}}),()=>({ok:true}),()=>null];
 for(const mutate of mutations) {
  let data,posts=0,gets=0;const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async(_url,init)=>{
   if(init.method==='POST'){posts++;data=await completed(init).json();throw Error('lost');}gets++;return response(mutate(data));}});await w.init();await w.tick();
  const command={action:'reconcile',operationId:op(),tickId:w.state.lastTick.id,bootId:w.bootId,expectedRevision:0};
  await assert.rejects(()=>w.control(command),/RECONCILE_UNVERIFIED/);await w.tick();assert.equal(posts,1);assert.equal(gets,1);assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().revision,0);assert.equal(w.snapshot().paused,true);
 }
 for(const fetchResult of [async()=>({ok:false,status:404}),async()=>{throw Error('offline');},async()=>({ok:true,status:200,json:async()=>{throw Error('bad JSON');}})]) {
  const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async()=>{throw Error('lost')}});await w.init();await w.tick();w.fetch=fetchResult;
  await assert.rejects(()=>w.control({action:'reconcile',operationId:op(),tickId:w.state.lastTick.id,bootId:w.bootId,expectedRevision:0}),/RECONCILE_UNVERIFIED/);assert.equal(w.snapshot().phase,'UNKNOWN');
 }
});

test('reconcile completion with changed Web boot is accepted only when full persisted tick identities match',async()=>{
 let data;const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async(_url,init)=>{data=await completed(init).json();throw Error('lost');}});await w.init();await w.tick();
 data.server.bootId=op();w.fetch=async()=>response(data);
 const result=await w.control({action:'reconcile',operationId:op(),tickId:w.state.lastTick.id,bootId:w.bootId,expectedRevision:0});assert.equal(result.state.phase,'QUIESCENT');assert.notEqual(result.receipt.web.bootId,result.receipt.observedServer.bootId);
});

test('reconcile CAS/concurrency/idempotency and durable write failure remain fenced',async()=>{
 const store=memoryStore();let data;const w=new WorkerRuntime({...options(store),startPaused:false,fetchImpl:async(_url,init)=>{data=await completed(init).json();throw Error('lost')}});await w.init();await w.tick();w.fetch=async()=>response(data);
 const command={action:'reconcile',operationId:op(),tickId:w.state.lastTick.id,bootId:w.bootId,expectedRevision:0};
 await assert.rejects(()=>w.control({...command,expectedRevision:1}),/REVISION_CONFLICT/);
 await assert.rejects(()=>w.control({...command,bootId:op()}),/BOOT_CHANGED/);
 await assert.rejects(()=>w.control({...command,tickId:op()}),/NOT_UNRESOLVED/);
 const results=await Promise.allSettled([w.control(command),w.control({...command,operationId:op()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(()=>w.control({...command,tickId:op()}),/OPERATION_CONFLICT/);
 const faultyStore=memoryStore(),faulty=new WorkerRuntime({...options(faultyStore),startPaused:false,fetchImpl:async(_url,init)=>{data=await completed(init).json();throw Error('lost')}});await faulty.init();await faulty.tick();faulty.fetch=async()=>response(data);faultyStore.write=async()=>{throw Error('disk full')};
 const failed={action:'reconcile',operationId:op(),tickId:faulty.state.lastTick.id,bootId:faulty.bootId,expectedRevision:0};await assert.rejects(()=>faulty.control(failed),/disk full/);
 assert.equal(faulty.snapshot().phase,'UNKNOWN');assert.equal(faulty.snapshot().tickDrainComplete,false);await assert.rejects(()=>faulty.control(failed),/CONTROL_FAULT/);
});

test('controlled POST never trusts legacy plain success or mismatched server commit',async()=>{
 for(const bad of [()=>({ok:true}),data=>({...data,server:{...data.server,commit:'b'.repeat(40)}})]) {
  let posts=0;const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async(_url,init)=>{posts++;return response(bad(await completed(init).json()));}});await w.init();await w.tick();await w.tick();assert.equal(posts,1);assert.equal(w.snapshot().phase,'UNKNOWN');
 }
});

test('controlled workers cannot opt out of UNKNOWN pause with stopOnUncertain=false',async()=>{
 let posts=0;const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,stopOnUncertain:false,fetchImpl:async()=>{posts++;throw Error('lost');}});await w.init();await w.tick();await w.tick();assert.equal(posts,1);assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().paused,true);
});

test('reconcile cannot erase an actually active request even when marked uncertain',async()=>{
 const gate=deferred(),w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async()=>gate.promise});await w.init();const running=w.tick();await new Promise(r=>setTimeout(r,1));w.state.lastTick.phase='unknown';w.state.uncertain=true;w.state.paused=true;
 await assert.rejects(()=>w.control({action:'reconcile',operationId:op(),tickId:w.state.lastTick.id,bootId:w.bootId,expectedRevision:0}),/STILL_ACTIVE/);gate.resolve(response({ok:false,status:500}));await running;assert.equal(w.snapshot().phase,'UNKNOWN');
});

test('controlled unauthenticated-looking HTTP responses cannot clear uncertainty without exact receipt identity',async()=>{
 for(const status of [401,403]) {let calls=0;const w=new WorkerRuntime({...options(memoryStore()),startPaused:false,fetchImpl:async()=>{calls++;return {ok:false,status};}});await w.init();await w.tick();await w.tick();assert.equal(calls,1);assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().paused,true);}
});
