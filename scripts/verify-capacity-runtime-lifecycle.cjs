'use strict';
// Parent review closure. Actual worker/queue and AST-extracted, unedited recovery
// functions; controlled due/fetch/admission. Actual pg pools for close generations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process'),net=require('node:net'),pg=require('pg');
const ROOT=path.resolve(__dirname,'..'),SOURCE=path.resolve(process.argv[2]||ROOT),mode=process.argv[3]||'modified';
assert(['baseline','candidate','modified'].includes(mode));const fixed=mode==='modified',baseline=mode==='baseline';
const read=f=>fs.readFileSync(fs.existsSync(path.join(SOURCE,f))?path.join(SOURCE,f):path.join(ROOT,f),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=async()=>{for(let n=0;n<100;n++)await Promise.resolve();};let cases=0;
async function test(name,fn){await fn();cases++;console.log('PASS '+name);}
function exec(source,file,globals={},imports={}){
 const m={exports:{}};const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:m,exports:m.exports,console,AbortSignal,AbortController,Date,URL,process:{env:{}},...globals,require(id){if(id==='server-only')return {};if(Object.hasOwn(imports,id))return imports[id];throw Error('UNMOCKED_IMPORT:'+file+':'+id);}});return m.exports;
}
const integer=exec(read('src/lib/runtime/positive-integer.ts'),'integer');
const queue=exec(read('src/lib/image-job-queue.ts'),'queue',{}, {'./runtime/positive-integer':integer});
const recoveryAst=ts.createSourceFile('durable',read('src/lib/durable-image-jobs.ts'),ts.ScriptTarget.Latest,true);
const recoveryFunctions=recoveryAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&['recoverDurableImageJobsLocal','recoverDurableImageJobs'].includes(n.name?.text));assert.equal(recoveryFunctions.length,2);
const recoveryText=recoveryFunctions.map(n=>n.getText(recoveryAst)).join('\n');
const background=async(_scope,_key,_admission,run)=>run();
function recovery(send,options={}){
 const counts={due:0,batch:0,delivery:0,signals:[]};
 const api=exec('let recoveryScan;\n'+recoveryText,'actual-recovery-callers',{dbEnabled:true,repository:{dueImageJobs:async()=>{counts.due++;return options.due?options.due():Array.from({length:12},(_,n)=>({kind:'generate',id:'fixture-'+n}));}},dispatchImageQueue:queue.dispatchImageQueue,fetch:(url,init)=>{counts.signals.push(init.signal);return send(url,init);},withBackgroundActivity:background,randomUUID},{'./imagegen/batch':{recoverImagegenBatches:async()=>{counts.batch++;if(options.batch)await options.batch();return 2;}},'./imagegen/stored-delivery':{recoverStoredDeliveries:async()=>{counts.delivery++;return 3;}}});
 return {api,counts};
}
function worker(runtime,recoveryApi,video=async()=>0){
 const timers={intervals:new Set(),timeouts:new Set()};const make=(set,fn,ms)=>{const t={fn,ms,unref(){}};set.add(t);return t;};
 const settings=exec(read('src/lib/video/worker-settings.ts'),'settings',{process:runtime},{'../runtime/positive-integer':integer});
 const api=exec(read('src/lib/video/worker.ts'),'worker',{process:runtime,setInterval:(fn,ms)=>make(timers.intervals,fn,ms),setTimeout:(fn,ms)=>make(timers.timeouts,fn,ms),clearInterval:t=>timers.intervals.delete(t),clearTimeout:t=>timers.timeouts.delete(t)},{'@/lib/release-runtime/background-activity':{withBackgroundActivity:background},'@/lib/db':{dbEnabled:true},'@/lib/video/service':{recoverDueVideoTasks:video},'@/lib/durable-image-jobs':recoveryApi,'@/lib/supplier-cost/worker':{scanSupplierCostsOnce:async()=>0},'./workflow':{recoverVideoWorkflows:async()=>0},'./worker-settings':settings,'../reference-workbench/service':{recoverReferenceWorkbench:async()=>0}});
 return {api,timers,cycle(){const t=[...timers.intervals][0];assert(t);t.fn();}};
}
async function callsites(){
 await test('helper cancellation retains started promises',async()=>{
  const g=deferred(),controller=new AbortController();let started=0,settled=false;
  const run=queue.dispatchImageQueue(Array.from({length:12}),async()=>{started++;await g.promise;return true;},()=>{},4,{signal:controller.signal}).then(n=>{settled=true;return n;});
  await flush();controller.abort();assert.equal(started,4);assert.equal(settled,false);g.resolve();const count=await run;assert.equal(count,baseline?12:4);
  console.log(`HELPER_CANCELLATION started=4 afterAbort=${started} waitedStarted=1`);
 });
 await test('actual recovery caller passes cancellation without aborting accepted sends',async()=>{
  const gate=deferred();let started=0;const r=recovery(async()=>{started++;await gate.promise;return {ok:true};});
  const runtime={env:{}},w=worker(runtime,r.api);w.api.startVideoWorker();w.cycle();await flush();assert.equal(started,4);
  if(baseline){gate.resolve();await flush();assert.equal(started,12);console.log('CALLER_STOP_API=ABSENT started=12');return;}
  let stopped=false;const stop=w.api.stopVideoWorker().then(()=>{stopped=true;});await flush();assert.equal(stopped,false);
  assert(r.counts.signals.every(s=>!s.aborted)); // Local cancellation is not a fetch abort/nonacceptance proof.
  w.api.startVideoWorker();assert.equal(w.timers.intervals.size,0); // no restart during drain
  gate.resolve();await stop;assert.equal(started,fixed?4:12);assert.equal(r.counts.batch,fixed?0:1);assert.equal(r.counts.delivery,fixed?0:1);
  assert.equal(w.timers.intervals.size,0);assert.equal(w.timers.timeouts.size,0);
  console.log(`CALLER_STOP startedBeforeStop=4 startedAfterStop=${started} stopWaited=1 timers=0 originalSendSignals=active`);
  let videoCalls=0;const reload=worker(runtime,r.api,async()=>{videoCalls++;return 1;});
  assert.equal(await reload.api.scanVideoWorkerOnce(),fixed?0:1);assert.equal(videoCalls,fixed?0:1);
  console.log(`POST_STOP awaitedStop=1 explicitRestart=0 newScanResult=${videoCalls}`);
  reload.api.startVideoWorker();assert.equal(await reload.api.scanVideoWorkerOnce(),1);await reload.api.stopVideoWorker();
 });
 await test('first external scan works without timers; stopped scan requires explicit restart',async()=>{
  const runtime={env:{NAUMI_VIDEO_WORKER:'0'}},w=worker(runtime,{recoverDurableImageJobs:async()=>0},async()=>1);
  w.api.startVideoWorker();assert.equal(w.timers.intervals.size,0);assert.equal(await w.api.scanVideoWorkerOnce(),1);
  if(!baseline){await w.api.stopVideoWorker();assert.equal(await w.api.scanVideoWorkerOnce(),fixed?0:1);w.api.startVideoWorker();assert.equal(await w.api.scanVideoWorkerOnce(),1);assert.equal(w.timers.intervals.size,0);await w.api.stopVideoWorker();}
 });
 await test('aborted recovery admits no new due read or dispatch',async()=>{
  const controller=new AbortController();controller.abort();let sent=0;const r=recovery(async()=>{sent++;return {ok:true};});
  const n=await r.api.recoverDurableImageJobs({signal:controller.signal});assert.equal(sent,fixed?0:12);assert.equal(r.counts.due,fixed?0:1);assert.equal(n,fixed?0:17);
 });
 await test('cancel during due query skips backlog and later phases',async()=>{
  const due=deferred(),controller=new AbortController();let sent=0;const r=recovery(async()=>{sent++;return {ok:true};},{due:()=>due.promise});
  const run=r.api.recoverDurableImageJobs({signal:controller.signal});await flush();controller.abort();due.resolve([{kind:'generate',id:'fixture'}]);
  assert.equal(await run,fixed?0:6);assert.equal(sent,fixed?0:1);assert.equal(r.counts.batch,fixed?0:1);
 });
 await test('cancel during started batch waits it but skips new delivery phase',async()=>{
  const batch=deferred(),controller=new AbortController(),r=recovery(async()=>({ok:true}),{batch:()=>batch.promise});
  let done=false;const run=r.api.recoverDurableImageJobs({signal:controller.signal}).then(n=>{done=true;return n;});await flush();assert.equal(r.counts.batch,1);controller.abort();assert.equal(done,false);batch.resolve();
  assert.equal(await run,fixed?14:17);assert.equal(r.counts.delivery,fixed?0:1);
 });
 await test('uncancelled recovery remains single flight and preserves response counts',async()=>{
  const gate=deferred();let sent=0;const r=recovery(async()=>{const n=sent++;await gate.promise;return {ok:n!==0};});
  const a=r.api.recoverDurableImageJobs(),b=r.api.recoverDurableImageJobs();await flush();assert.equal(sent,4);gate.resolve();const results=await Promise.all([a,b]);assert.equal(results[0],16);assert.equal(results[1],16);assert.equal(sent,12);assert.equal(r.counts.due,1);assert.equal(r.counts.batch,1);assert.equal(r.counts.delivery,1);
 });
 await test('local stop cannot cancel an earlier externally owned scan it joined',async()=>{
  const gate=deferred();let sent=0;const r=recovery(async()=>{sent++;await gate.promise;return {ok:true};});
  const external=r.api.recoverDurableImageJobs();await flush();const w=worker({env:{}},r.api);w.api.startVideoWorker();w.cycle();await flush();assert.equal(sent,4);
  let done=false;const stop=baseline?Promise.resolve():w.api.stopVideoWorker().then(()=>{done=true;});await flush();if(!baseline)assert.equal(done,false);
  gate.resolve();assert.equal(await external,17);await stop;assert.equal(sent,12);assert.equal(r.counts.due,1);
  console.log('EXTERNAL_OWNER joinedScan=1 localAbortForeignOwner=0 started=12 waited=1');
 });
 await test('failed started send is observed once, without retry or aborted sibling promises',async()=>{
  const gate=deferred(),controller=new AbortController();let sent=0;const r=recovery(async()=>{const n=sent++;await gate.promise;if(n===0)throw Error('fixture-send');return {ok:true};});
  const run=r.api.recoverDurableImageJobs({signal:controller.signal});await flush();assert.equal(sent,4);controller.abort();assert(r.counts.signals.every(s=>!s.aborted));gate.resolve();assert.equal(await run,fixed?3:16);assert.equal(sent,fixed?4:12);
 });
}
async function poolLifecycle(){
 const label='runtime-parent-'+randomUUID(),pools=new Set();let cid,port,ready;
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();
 const tcp=p=>new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port:p});s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));s.setTimeout(300,()=>{s.destroy();resolve(false)});});
 class Pool extends pg.Pool{constructor(options){super(options);pools.add(this);}}
 try{
  cid=docker(['run','-d','--label','naumi.fixture='+label,'--memory','256m','--cpus','1','-p','127.0.0.1::5432','-e','POSTGRES_USER=runtime_fixture','-e','POSTGRES_PASSWORD=runtime_local_only','-e','POSTGRES_DB=runtime_clients_fixture','postgres:16-alpine']);
  const info=JSON.parse(docker(['inspect',cid]))[0];assert.equal(info.Config.Labels['naumi.fixture'],label);port=Number(info.NetworkSettings.Ports['5432/tcp'][0].HostPort);
  const connectionString=`postgresql://runtime_fixture:runtime_local_only@127.0.0.1:${port}/runtime_clients_fixture`;
  ready=new pg.Pool({connectionString,connectionTimeoutMillis:500});const deadline=Date.now()+30000;
  for(;;){try{await ready.query('SELECT 1');break;}catch(e){if(Date.now()>deadline)throw e;await new Promise(r=>setTimeout(r,100));}}
  console.log(`PG_FIXTURE label=${label} port=${port} TCP_SQL_READY=1 memory=256MiB cpus=1`);
  function instance(){const process={env:{DATABASE_URL:connectionString}},db=exec(read('src/lib/db/connection.ts'),'db',{process},{pg:{Pool}}),coord=()=>exec(read('src/lib/video/coordination-pool.ts'),'coord',{process},{'node:process':process,pg:{Pool},'../db':db,'../db/connection':db});return{process,db,coord};}
  await test('actual PG closing drains lock holder, shares promise and recreates correct budget generation',async()=>{
   const x=instance(),a=x.coord(),b=x.coord(),old=a.getVideoCoordinationPool();assert.equal(b.getVideoCoordinationPool(),old);
   const held=await a.acquireVideoCoordinationLock('parent-held');assert(held.acquired);let complete=false;
   const closing=fixed?a.closeVideoCoordinationPool():old.end();closing.then(()=>{complete=true;});await flush();assert.equal(complete,false);
   if(fixed){assert.equal(b.closeVideoCoordinationPool(),closing);await assert.rejects(a.acquireVideoCoordinationLock('while-closing'),{code:'VIDEO_COORDINATION_UNAVAILABLE',status:503});assert.throws(()=>b.getVideoCoordinationPool(),/VIDEO_COORDINATION_POOL_CLOSING/);}
   await held.release();await held.release();await closing;assert.equal(old.ended,true);assert.equal(old[Symbol.for('naumi.video.coordination.slots.v1')],0);
   await x.db.closeDatabasePools();x.process.env.NAUMI_VIDEO_COORDINATION_POOL_MAX='3';x.process.env.NAUMI_DB_POOL_BUDGET='16';
   assert.equal((await x.db.getPool().query('SELECT 1 n')).rows[0].n,1);
   const fresh=b.getVideoCoordinationPool();assert.equal(fresh===old,!fixed);
   if(fixed){assert.equal(fresh.options.max,3);const l=await b.acquireVideoCoordinationLock('after-close');assert(l.acquired);await l.release();await a.closeVideoCoordinationPool();}
   else await assert.rejects(a.acquireVideoCoordinationLock('after-close'),{code:'VIDEO_COORDINATION_UNAVAILABLE',status:503});
   console.log(`PG_GENERATION mode=${mode} ordinaryRecreated=1 videoSameEndedPool=${Number(fresh===old)} actualMax=${fresh.options.max} afterClose=${fixed?'ACQUIRED':'503'}`);
   await x.db.closeDatabasePools();
  });
  if(fixed)await test('empty close allocates nothing; failed close keeps shared fence and original error',async()=>{
   const x=instance(),a=x.coord(),b=x.coord(),before=pools.size;await a.closeVideoCoordinationPool();assert.equal(pools.size,before);
   const old=a.getVideoCoordinationPool(),end=old.end.bind(old),original={fixture:'close-error'};old.end=()=>{throw original;};
   const close=a.closeVideoCoordinationPool();assert.equal(close,b.closeVideoCoordinationPool());await assert.rejects(close,e=>e===original);
   const count=pools.size;assert.equal(a.closeVideoCoordinationPool(),close);assert.throws(()=>b.getVideoCoordinationPool(),/VIDEO_COORDINATION_POOL_CLOSING/);
   await assert.rejects(b.acquireVideoCoordinationLock('failed-close'),{code:'VIDEO_COORDINATION_UNAVAILABLE',status:503});assert.equal(pools.size,count);
   // Test-only cleanup of the still-live PG pool; do not clear the product fence.
   old.end=end;await end();await x.db.closeDatabasePools();console.log('PG_FAILED_CLOSE originalIdentity=1 sharedFence=1 replacements=0');
  });
 }finally{
  for(const p of pools){for(const c of p._clients||[])await c.end().catch(()=>{});if(!p.ending&&!p.ended)await p.end();}
  if(ready)await ready.end();if(cid){assert.equal(JSON.parse(docker(['inspect',cid]))[0].Config.Labels['naumi.fixture'],label);docker(['rm','-f','-v',cid]);assert.equal(docker(['ps','-aq','--filter','label=naumi.fixture='+label]),'');assert.equal(await tcp(port),false);}
  console.log('PG_FIXTURE_REMOVED=1 TCP_CLOSED=1');
 }
}
(async()=>{await callsites();await poolLifecycle();console.log(`RUNTIME_LIFECYCLE=${mode.toUpperCase()} PASS CASES=${cases} REAL_PG=1 SUPPLIER_CALLS=0`);})().catch(e=>{console.error(e);process.exitCode=1;});
