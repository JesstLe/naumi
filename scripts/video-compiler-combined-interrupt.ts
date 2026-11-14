import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import type {Pool} from 'pg';

export function combinedInterruptPeer(){
 const held=new Map<string,Array<{release:()=>void;enteredAt:number}>>();
 let target:string|undefined;
 return {
  hold(name:string){target=name;},
  async wait(name:string){if(target===undefined||name!==target)return;await new Promise<void>(resolve=>{const rows=held.get(name)||[];rows.push({release:resolve,enteredAt:Date.now()});held.set(name,rows);});},
  entered(name:string){return held.get(name);},
  release(name:string){for(const row of held.get(name)||[])row.release();held.delete(name);target=undefined;},
  releaseAll(){for(const rows of held.values())for(const row of rows)row.release();held.clear();target=undefined;},
 };
}

/** Actual fixed-package Web/PG/supplier, plus a separate root PID1 combined
 * supervisor container. Only host Docker lifecycle is controlled by file RPC. */
export async function verifyCombinedInterrupt(input:{root:string;pool:Pool;actor:string;origin:string;secret:string;commit:string;initialTaskId:string;base:any;peer:ReturnType<typeof combinedInterruptPeer>;
 http:(url:string,body?:unknown)=>Promise<{status:number;value:any}>;posts:Array<{body:any}>;polls:Array<{id:string}>;setPollsComplete:()=>void}){
 const {root,pool,actor,peer}=input,commands=path.join(root,'combined-commands');await mkdir(commands,{recursive:true});
 const stateFile=path.join(root,'combined-state.json');let state=stateFile,instance='combined-original',checks=0;const observations:any[]=[];
 const rpc=async(action:string,extra:Record<string,unknown>={})=>{
  const id=randomUUID(),file=path.join(commands,'cmd-'+id+'.json'),temp=file+'.tmp';await writeFile(temp,JSON.stringify({action,...extra}));await rename(temp,file);
  const deadline=Date.now()+120000;
  for(;;){try{const receipt=JSON.parse(await readFile(path.join(commands,'result-'+id+'.json'),'utf8'));assert(receipt.ok,receipt.error);observations.push({action,...extra,receipt:receipt.value});return receipt.value;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(Date.now()>deadline)throw Error('Combined host lifecycle deadline');await new Promise(resolve=>setTimeout(resolve,100));}
 };
 const until=async<T>(name:string,read:()=>Promise<T>,accept:(value:T)=>boolean,ms=90000)=>{const deadline=Date.now()+ms;let value:T|undefined;for(;;){value=await read();if(accept(value))return value;if(Date.now()>deadline)throw Error(name+' '+JSON.stringify(value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>['id','status','error_code','poll_lock_until','phase','paused'].includes(key))):value));await new Promise(resolve=>setTimeout(resolve,100));}};
 const row=async(id:string)=>(await pool.query('SELECT * FROM app_video_tasks WHERE email=$1 AND id=$2',[actor,id])).rows[0];
 const ledger=async(id:string)=>(await pool.query('SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE id=$1',['led-video-'+id])).rows[0];
 const orphan=async(id:string)=>(await pool.query("SELECT id,instance_id,boot_id,state,work_key,admission_key FROM app_release_activities WHERE activity_kind='accepted-work' AND work_scope='video-poll' AND admission_key=$1 AND state IN ('active','unknown') ORDER BY started_at,id",[id])).rows;
 const status=async()=>{try{const r=await fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':input.secret},signal:AbortSignal.timeout(1500)});return r.ok?await r.json():null;}catch{return null;}};
 const control=async(action:string,expect=200)=>{const s=await status();assert(s);const r=await fetch('http://127.0.0.1:3001/control',{method:'POST',headers:{'x-video-worker-secret':input.secret,'content-type':'application/json'},body:JSON.stringify({action,bootId:s.bootId,operationId:randomUUID(),expectedRevision:s.revision,...(action==='reconcile'?{tickId:s.lastTick.id}:{})})});const value=await r.json();assert.equal(r.status,expect,JSON.stringify(value));return value;};
 const start=async()=>{
  const {directWorkerEnvironment}=await import('./direct-worker-settings.mjs');
  const env={...directWorkerEnvironment({...process.env,NAUMI_APP_ORIGIN:input.origin}),NAUMI_MEDIA_WORKER:'1',NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'1',NAUMI_WORKER_STATE_FILE:state,NAUMI_INSTANCE_ID:instance,NAUMI_WORKER_CONTROL_PORT:'3001',MEDIA_WORKER_PORT:'3002',MEDIA_WORKER_SECRET:input.secret,VIDEO_WORKER_SECRET:input.secret,MEDIA_JOB_DIR:'/scratch',MEDIA_WORKER_ORIGIN:'http://127.0.0.1:3002',NAUMI_APP_ORIGIN:input.origin,SOURCE_COMMIT:input.commit,VIDEO_WORKER_INTERVAL_MS:'5000'};
  await rpc('start',{env});const s=await until('combined ready',status,s=>!!s?.durableControl&&s.mediaWorker?.sandbox===true,45000);
  assert.equal(s.executionMode,'direct');assert.equal(s.instanceId,instance);return s;
 };
 const pass=(name:string)=>{checks++;console.log('COMBINED_INTERRUPT_CHECK='+name+' PASS');};
 const waitLease=async(id:string)=>{const before=await row(id);assert(before.poll_lock_until);const expires=before.poll_lock_until.getTime();await until('original lease naturally expires',async()=>Date.now(),now=>now>expires+25,Math.max(1000,expires-Date.now()+10000));observations.push({event:'lease-natural-expiry',id,expiresAt:new Date(expires).toISOString(),observedAt:new Date().toISOString(),writes:0});};
 const prepare=async(prompt:string)=>{const r=await input.http('/api/video/generate',{...input.base,prompt,references:[],idempotencyKey:randomUUID()});assert.equal(r.status,200,JSON.stringify(r));return r.value.taskId as string;};
 const posts=(prompt:string)=>input.posts.filter(p=>p.body.prompt===prompt).length;
 await writeFile(path.join(root,'COMBINED_SESSION.json'),JSON.stringify({root,commands,commit:input.commit}));
 try{
  peer.hold('Process preview');const first=await start();assert.equal(first.paused,true);assert.equal(first.mediaWorker.draining,true);assert.equal(input.posts.length,0);
  const processView=await rpc('inspect');assert(processView.processes.some((p:any)=>p.pid===1&&p.uid===0&&p.cmd.includes('/app/scripts/video-worker-with-media.mjs')));assert(processView.processes.some((p:any)=>p.uid===1001&&p.cmd.includes('/app/scripts/video-worker.mjs')));assert(processView.processes.some((p:any)=>p.uid===0&&p.cmd.includes('/app/scripts/video-media-worker.mjs')));pass('actual-root-pid1-combined-paused-scanner-and-native-media');
  await control('resume');await until('original supplier POST held',async()=>peer.entered('Process preview'),Boolean);
  const active=await until('scanner actual paid callback active',status,s=>s?.activeTicks===1&&s.backgroundTasks>0);assert.equal(active.tickDrainComplete,false);
  const sent=await row(input.initialTaskId);assert.equal(sent.parameters.submissionState,'sending');assert(!sent.upstream_id);assert.equal(posts('Process preview'),1);
  await rpc('signal',{signal:'SIGTERM'});await new Promise(resolve=>setTimeout(resolve,13500));const still=await rpc('inspect');assert.equal(still.running,true);assert.equal(posts('Process preview'),1);assert.deepEqual(await ledger(input.initialTaskId),{n:0,amount:0});pass('sigterm-during-real-send-waits-beyond12s-without-forcekill-or-doublepost');
  peer.release('Process preview');const stopped=await rpc('wait');assert.equal(stopped.exitCode,0);const accepted=await row(input.initialTaskId);assert(accepted.upstream_id);assert.equal(accepted.status,'processing');
  const saved=JSON.parse(await readFile(state,'utf8'));assert.equal(saved.lastTick.phase,'complete');assert.equal(saved.uncertain,false);pass('graceful-active-send-persists-original-upstream-receipt-before-combined-exit');
  input.setPollsComplete();const restarted=await start();assert.notEqual(restarted.bootId,first.bootId);assert.equal(restarted.paused,true);assert.equal(restarted.mediaWorker.draining,true);
  // Respect the real scheduled poll, not a direct handler call or edited lease.
  await control('resume');const done=await until('original receipt GET and settlement',()=>row(input.initialTaskId),r=>r.status==='completed',120000);await control('drain');await until('combined drained',status,s=>s?.tickDrainComplete===true);
  assert.equal(posts('Process preview'),1);assert(input.polls.some(p=>p.id===accepted.upstream_id));assert.equal(done.upstream_id,accepted.upstream_id);assert.equal(done.parameters.compiledPlanDigest,sent.parameters.compiledPlanDigest);assert.deepEqual(await ledger(done.id),{n:1,amount:7});pass('restart-polls-original-frozen-receipt-and-settles-once-at7');
  const hard=await prepare('COMBINED_HARD_POST');peer.hold('COMBINED_HARD_POST');await control('resume');await until('second supplier POST held',async()=>peer.entered('COMBINED_HARD_POST'),Boolean);
  const hardBefore=await row(hard),hardState=await until('hard crash tick active',status,s=>s?.activeTicks===1&&s.backgroundTasks>0);assert.equal(hardBefore.parameters.submissionState,'sending');await rpc('signal',{signal:'SIGKILL'});assert.equal((await rpc('wait')).exitCode,137);peer.release('COMBINED_HARD_POST');
  const crashed=JSON.parse(await readFile(state,'utf8'));assert.equal(crashed.lastTick.id,hardState.lastTick.id);assert.equal(crashed.lastTick.phase,'dispatched');
  const unknown=await start();assert.equal(unknown.phase,'UNKNOWN');assert.equal(unknown.paused,true);assert.equal(unknown.lastTick.id,hardState.lastTick.id);assert.equal(unknown.mediaWorker.draining,true);await control('resume',409);
  await new Promise(resolve=>setTimeout(resolve,5500));assert.equal(posts('COMBINED_HARD_POST'),1);assert.deepEqual(await ledger(hard),{n:0,amount:0});assert.equal((await row(hard)).poll_lock_until.getTime(),hardBefore.poll_lock_until.getTime());pass('sigkill-before-receipt-restores-original-unknown-paused-media-and-no-repost');
  const retry=await input.http('/api/video/tasks/'+hard+'/retry',{idempotencyKey:randomUUID()});assert.equal(retry.status,409);await rpc('signal',{signal:'SIGTERM'});assert.equal((await rpc('wait')).exitCode,2);
  const retained=await readFile(state),orphanBefore=await orphan(hard);assert(orphanBefore.length>0);await waitLease(hard);instance='combined-replacement';state=path.join(root,'replacement-state.json');await start();await control('resume');const attention=await until('expired original sending task becomes review',()=>row(hard),r=>r.status==='needs_attention');await control('drain');await until('replacement drained',status,s=>s?.tickDrainComplete===true);
  assert.equal(attention.error_code,'creation_unknown');assert.equal(posts('COMBINED_HARD_POST'),1);assert.deepEqual(await ledger(hard),{n:0,amount:0});assert.deepEqual(await readFile(stateFile),retained);assert.deepEqual(await orphan(hard),orphanBefore);observations.push({event:'orphan-release-activities-preserved',rows:orphanBefore});pass('replacement-honors-natural-210s-lease-and-retains-original-worker-unknown-file');
  const pollTask=await prepare('COMBINED_HARD_POLL');await control('resume');
  const polling=await until('new receipt persisted',()=>row(pollTask),r=>!!r.upstream_id);const pollKey='poll:'+polling.upstream_id;await until('real original GET poll held',async()=>peer.entered(pollKey),Boolean);
  const pollingState=await until('scanner owns the targeted GET callback',status,s=>s?.activeTicks===1&&s.backgroundTasks>0);const claimedPoll=await row(pollTask);assert(claimedPoll.poll_lock_until);await rpc('signal',{signal:'SIGKILL'});assert.equal((await rpc('wait')).exitCode,137);peer.release(pollKey);
  const pollUnknown=await start();assert.equal(pollUnknown.phase,'UNKNOWN');assert.equal(pollUnknown.lastTick.id,pollingState.lastTick.id);await control('resume',409);await rpc('signal',{signal:'SIGTERM'});assert.equal((await rpc('wait')).exitCode,2);const pollStateFile=state,pollStateBytes=await readFile(state);pass('sigkill-during-real-get-retains-receipt-and-blocks-unverified-worker-resume');
  await waitLease(pollTask);instance='combined-poll-replacement';state=path.join(root,'poll-replacement-state.json');await start();await control('resume');const final=await until('GET-only continuation after natural lease',()=>row(pollTask),r=>r.status==='completed',120000);await control('drain');await until('final combined drain',status,s=>s?.tickDrainComplete===true);
  assert.equal(final.upstream_id,polling.upstream_id);assert.equal(posts('COMBINED_HARD_POLL'),1);assert.deepEqual(await ledger(pollTask),{n:1,amount:17});assert(final.artwork_id&&final.result_storage_key&&final.video_url);const asset=(await pool.query('SELECT email,status,image_url FROM app_artworks WHERE id=$1',[final.artwork_id])).rows[0];assert.equal(asset.email,actor);assert.equal(asset.status,'completed');assert.equal(asset.image_url,final.video_url);assert.deepEqual(await readFile(pollStateFile),pollStateBytes);assert.equal((await row(hard)).status,'needs_attention');pass('replacement-get-only-restores-original-result-asset-and-single17-settlement');
  await rpc('signal',{signal:'SIGTERM'});assert.equal((await rpc('wait')).exitCode,0);
  await writeFile(path.join(root,'COMBINED_INTERRUPT_RESULT.json'),JSON.stringify({ok:true,checks,actualPid1Supervisor:true,actualSupplierRequests:true,originalId:input.initialTaskId,hardPost:hard,hardPoll:pollTask,ledger:[await ledger(input.initialTaskId),await ledger(hard),await ledger(pollTask)],observations,paidCalls:0,productionWrites:0},null,2));
  console.log('COMBINED_INTERRUPT=PASS CHECKS='+checks+' SIGTERM_ACTIVE=1 SIGKILL_POST=1 SIGKILL_POLL=1 NATURAL_LEASE_EXPIRIES=2 PAID_CALLS=0');
 }finally{peer.releaseAll();await rpc('cleanup');}
}
