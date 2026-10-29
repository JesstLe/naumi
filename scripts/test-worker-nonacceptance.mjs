import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {WorkerRuntime} from './worker-runtime.mjs';
import {combinedWorkerPlan,createCombinedWorkerControl} from './video-worker-with-media.mjs';
const secret='x3-negative-unit-secret-0123456789abcdef',commit='a'.repeat(40),web={instanceId:'web',bootId:randomUUID(),commit,bootSource:'preload'};
const path='/api/video/worker/tick/v2';
const json=data=>new Response(JSON.stringify(data));
const capability=()=>json({ok:true,protocolVersion:2,endpoint:path,fence:'receipt-primary-key-v2',server:web});
const command=(w,action='prove-nonacceptance')=>({action,operationId:randomUUID(),bootId:w.bootId,expectedRevision:w.state.revision,tickId:w.state.lastTick?.id});
function memory(){let state;return {read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value);}};}
async function worker(fetchImpl,extra={}){const w=new WorkerRuntime({origin:'http://fixture:3000',secret,instanceId:'worker',commit,targetInstanceId:'web',tickProtocol:2,store:memory(),fetchImpl,...extra});await w.init();return w;}
function negative(w){const t=w.state.lastTick;return {ok:true,server:web,receipt:{schemaVersion:2,tickId:t.id,worker:{instanceId:t.workerInstanceId,bootId:t.workerBootId,commit},web,
 phase:'not_accepted',nonacceptanceAt:new Date().toISOString(),acceptedAt:null,completedAt:null,result:null}};}

test('v2 capability failures pause without any POST or legacy credential',async()=>{
 for(const response of [()=>new Response('',{status:404}),()=>json({ok:true}),()=>json({ok:true,protocolVersion:1}),()=>{throw Error('offline');}]){
  let calls=0;const w=await worker(async(url,init)=>{calls++;assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers['x-video-worker-secret'],undefined);return response();});
  const result=await w.tick();assert.equal(result.error,'TICK_NOT_DISPATCHED');assert.equal(w.snapshot().paused,true);assert.equal(w.snapshot().lastTick.phase,'unknown');await w.tick();assert.equal(calls,1);
 }
});
test('capability-bound identity is durably recorded before accept and never upgrades v1 unknown',async()=>{
 let w;w=await worker(async(url,init)=>{
  assert.equal(init.headers['x-video-worker-secret'],undefined);
  assert.equal(init.headers['x-naumi-worker-v2-auth'],createHmac('sha256',secret).update('naumi-worker-tick-v2').digest('hex'));
  if(init.method==='GET')return capability();
  const durable=await w.store.read();assert.equal(durable.lastTick.targetWebBootId,web.bootId);assert.equal(durable.lastTick.targetWebCommit,commit);assert.equal(durable.lastTick.phase,'dispatched');
  throw Error('lost accept');
 });await w.tick();assert.equal(w.snapshot().automaticRecoveryEligible,false);
 const legacy={...w.state.lastTick};delete legacy.protocolVersion;delete legacy.targetWebBootId;delete legacy.targetWebCommit;w.state.lastTick=legacy;
 await assert.rejects(w.control(command(w)),/FENCE_NOT_SUPPORTED/);
});
test('manual drain during capability discovery prevents accept dispatch',async()=>{
 let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let posts=0;
 const w=await worker(async(url,init)=>{if(init.method==='POST')posts++;entered();await gate;return capability();});
 const pending=w.tick();await ready;await w.control(command(w,'drain'));release();await pending;assert.equal(posts,0);assert.equal(w.snapshot().paused,true);
});
test('restart during discovery keeps capability uncertainty paused',async()=>{
 const w=await worker(async()=>capability());w.state.lastTick={id:randomUUID(),phase:'preparing',protocolVersion:2};await w.persist();
 const next=await worker(async()=>{throw Error('no network');},{store:w.store});assert.equal(next.snapshot().paused,true);assert.equal(next.snapshot().lastTick.phase,'unknown');
});
test('failed bound-intent write does not dispatch accept',async()=>{
 let posts=0;const w=await worker(async(url,init)=>{if(init.method==='POST')posts++;return capability();});const write=w.store.write;let n=0;
 w.store.write=async value=>{if(++n===2)throw Error('disk');return write(value);};await w.tick();assert.equal(posts,0);assert.equal(w.snapshot().phase,'UNKNOWN');
});
test('oversize, missing dates, and identity mismatches leave original UNKNOWN',async()=>{
 for(const mutate of [x=>({...x,receipt:{...x.receipt,nonacceptanceAt:0}}),x=>({...x,receipt:{...x.receipt,web:{...web,bootId:randomUUID()}}}),x=>({...x,server:{...web,bootId:randomUUID()}}),x=>({...x,receipt:{...x.receipt,schemaVersion:1}}),()=>('x'.repeat(17000))]){
  const w=await worker(async(url,init)=>{if(init.method==='GET')return capability();throw Error('lost');});await w.tick();const id=w.state.lastTick.id;
  w.fetch=async()=>json(mutate(negative(w)));await assert.rejects(w.control(command(w)),/UNVERIFIED/);assert.equal(w.state.lastTick.id,id);assert.equal(w.snapshot().phase,'UNKNOWN');
 }
});
test('proof HTTP is one bounded attempt; post-proof shutdown cannot revive',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 const w=await worker(async(url,init)=>{if(init.method==='GET')return capability();throw Error('lost');});await w.tick();
 w.fetch=async(url,init)=>{assert.equal(init.redirect,'error');assert.ok(init.signal);const saved=await w.store.read();assert.equal(saved.lastTick.nonacceptanceAttempts.length,1);entered();await gate;return json(negative(w));};
 const result=w.control(command(w));await ready;await w.shutdown();release();await assert.rejects(result,/WORKER_STOPPING/);assert.equal(w.snapshot().phase,'UNKNOWN');
});
test('combined controller forwards protocol choice and never resumes media on proof actions',async()=>{
 const env={NAUMI_MEDIA_WORKER:'1',NAUMI_WORKER_RELEASE_CONTROL:'1',VIDEO_WORKER_SECRET:secret,MEDIA_WORKER_SECRET:secret+'media',SOURCE_COMMIT:commit,
  NAUMI_WORKER_STATE_FILE:'/release-state/worker.json',NAUMI_INSTANCE_ID:'worker',NAUMI_WORKER_TARGET_INSTANCE_ID:'web',NAUMI_APP_ORIGIN:'http://web:3000',NAUMI_WORKER_TICK_PROTOCOL:'2'};
 const plan=combinedWorkerPlan(env,{platform:'linux',uid:0,pid:1});assert.equal(plan.scanner.env.NAUMI_WORKER_TICK_PROTOCOL,'2');
 for(const action of ['prove-nonacceptance','reconcile-nonacceptance']){
  const media=[],permits=[],state={commit,instanceId:'worker',durableControl:true,revision:1,paused:true,phase:'QUIESCENT'};
  const control=createCombinedWorkerControl({plan,scannerPermit:async allowed=>permits.push(allowed),
   scannerRequest:async()=>({status:200,data:{state,receipt:{action,revision:1}}}),
   mediaRequest:async(method,url)=>{media.push(url);return {status:200,data:{ok:true,draining:true,sandbox:true,version:commit,running:0,queued:0,terminal:0,maxActive:1,concurrency:1}};}});
  assert.equal((await control.control(Buffer.from(JSON.stringify({action})))).status,200);assert.deepEqual(permits,[false]);assert.deepEqual(media,['/drain','/health']);
 }
});
