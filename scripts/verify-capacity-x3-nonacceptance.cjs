/** Only the task-owned loopback PostgreSQL container and synthetic scans are used. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{createServer}=require('node:http'),{spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url'),{transformSync}=require('esbuild'),{Pool}=require('pg');
const root=path.resolve(process.argv[2]||'.'),mode=process.argv[3]||'baseline';
const database='postgresql://postgres@127.0.0.1:55469/naumi_x3_negative_fixture?sslmode=disable',container=process.env.NAUMI_X3_FIXTURE_CONTAINER||'naumi-x3-negative-4608267e';
for(const k of Object.keys(process.env))if(k.startsWith('PG')||k==='DATABASE_URL'||k==='NODE_OPTIONS'||k.startsWith('NAUMI_DB_')||k==='NAUMI_TICK_POOL_MAX')delete process.env[k];
const schema='negative_'+randomUUID().replaceAll('-',''),commit='a'.repeat(40),secret='negative-fixture-secret-0123456789abcdef',boot=randomUUID();
Object.assign(process.env,{DATABASE_URL:database,PGOPTIONS:'-c search_path='+schema,SOURCE_COMMIT:commit,NAUMI_INSTANCE_ID:'negative-web',VIDEO_WORKER_SECRET:secret,NAUMI_RELEASE_BOOT_SOURCE:'preload',NAUMI_RELEASE_BOOT_ID:boot});
require('./server-only-register.cjs');require('tsx/cjs');
const actualAuth=require('../src/lib/durable-image-jobs.ts').imageWorkerAuthorized;
function load(file,bindings={}){const filename=path.join(root,file),module={exports:{}};
 const code=transformSync(fs.readFileSync(filename,'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(name=>name==='server-only'?{}:name in bindings?bindings[name]:require(name),module,module.exports);return module.exports;}
function loadBaseline(file,bindings={}){
 const revision='a65a65d02b0fc5fd46a0eafa5f0f015559446c1c',source=spawnSync('git',['show',revision+':'+file],{encoding:'utf8'});assert.equal(source.status,0,source.stderr);
 const filename=revision+':'+file,module={exports:{}},code=transformSync(source.stdout,{loader:'ts',format:'cjs',target:'es2022'}).code;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(name=>name==='server-only'?{}:name in bindings?bindings[name]:require(name),module,module.exports);return module.exports;
}
const connection=require('../src/platform/db/pool.ts');
const api=load('src/lib/release-runtime/worker-tick-receipts.ts');
let scans=0,paidCallbacks=0,scanGate;
const scan=async()=>{scans++;paidCallbacks++;if(scanGate)await scanGate.promise;return {ok:true,processed:1};};
const bindings={'@/platform/db/pool':connection,'@/lib/worker/scan':{scanApplicationWorkerOnce:scan},'@/lib/worker/authorization':{imageWorkerAuthorized:actualAuth},'@/lib/application/task-execution':{applicationTasksRunHere:()=>true},'@/lib/db':{dbEnabled:true},'@/lib/db/connection':connection,'@/lib/release-runtime/worker-tick-receipts':api,
 '@/lib/video/worker':{scanVideoWorkerOnce:scan},'@/lib/canvas-image-tasks':{recoverCanvasImageTasks:async()=>0},
 '@/lib/durable-image-jobs':{recoverDurableImageJobs:async()=>0,imageWorkerAuthorized:actualAuth},
 '@/lib/supplier-cost/worker':{scanSupplierCostsOnce:async()=>0},'@/lib/worker/media-recovery':{scheduleMediaRecovery:async()=>({})},
 '@/lib/worker/tick-scan':{scanWorkerTick:scan}};
const route=load('src/app/api/video/worker/tick/route.ts',bindings);
let v2,protocol;
if(mode==='modified'){
 protocol=load('src/lib/release-runtime/worker-tick-protocol.ts',{'./worker-tick-receipts':api,'@/lib/settings-secret':require('../src/lib/settings-secret.ts')});
 v2=load('src/app/api/video/worker/tick/v2/route.ts',{...bindings,'@/lib/release-runtime/worker-tick-protocol':protocol});
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){const r=await fn().catch(()=>null);if(r)return r;await sleep(30);}throw Error('fixture wait deadline');}
const cases=[];async function check(name,fn){await fn();cases.push(name);console.log('PASS '+name);}

function docker(action){const label=spawnSync('docker',['inspect','--format','{{index .Config.Labels "io.naumi.fixture"}}',container],{encoding:'utf8'});assert.equal(label.stdout.trim(),'x3-negative-4608267e');const r=spawnSync('docker',[action,...(action==='stop'?['--time','1']:[]),container],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);}
async function ready(){for(let n=0;n<60;n++){const p=new Pool({connectionString:database,max:1,connectionTimeoutMillis:500});try{await p.query('SELECT 1');return;}catch{await new Promise(r=>setTimeout(r,100));}finally{await p.end();}}throw Error('fixture PG not ready');}
async function main(){const owned=spawnSync('docker',['inspect',container],{encoding:'utf8'});assert.equal(owned.status,0);const info=JSON.parse(owned.stdout)[0];assert.equal(info.Config.Labels['io.naumi.fixture'],'x3-negative-4608267e');assert.deepEqual(info.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55469'}]);await ready();const admin=new Pool({connectionString:database,max:1});await admin.query('CREATE SCHEMA '+schema);
 const web=api.workerTickWebIdentity(),id=()=>({tickId:randomUUID(),workerInstanceId:'negative-worker',workerBootId:randomUUID(),workerCommit:commit,targetWebInstanceId:web.instanceId});
 let store=api.createWorkerTickReceiptStore(connection.getWorkerTickPool());await store.accept(id(),web);
 let origin,wireMode='normal',acceptGate,proofGate,delayedAccept=[],proofRequests=0,acceptRequests=0,receiptReads=0;
 const server=createServer(async(req,res)=>{try{
   const request=new Request(origin+req.url,{method:req.method,headers:req.headers}),url=new URL(request.url),isV2=url.pathname.endsWith('/v2');
   const action=url.searchParams.get('action'),isAccept=isV2&&req.method==='POST'&&action==='accept',isProof=isV2&&req.method==='POST'&&action==='prove-not-accepted';
   if(isAccept)acceptRequests++;if(isProof)proofRequests++;if(isV2&&req.method==='GET'&&action!=='capability')receiptReads++;
   if(isAccept&&wireMode==='defer-accept'){res.destroy();await acceptGate.promise;}
   if(isAccept&&wireMode==='drop-before'){res.destroy();return;}
   if(isAccept&&wireMode==='lose-accept-running')res.destroy();
   const result=await (isV2?v2:route)[req.method](request);
   if(isAccept&&wireMode==='defer-accept')delayedAccept.push(result.status);
   if(isProof&&proofGate)await proofGate.promise;
   if((isProof&&wireMode==='lose-proof')||(isAccept&&wireMode==='lose-completed')){res.destroy();return;}
   let body=Buffer.from(await result.arrayBuffer());
   if(isProof&&wireMode==='corrupt-proof')body=Buffer.from('{broken');
   if(isProof&&wireMode==='wrong-proof'){const data=JSON.parse(body);if(data.receipt)data.receipt.worker.bootId=randomUUID();body=Buffer.from(JSON.stringify(data));}
   if(!res.destroyed){res.writeHead(result.status,Object.fromEntries(result.headers));res.end(body);}
 }catch(e){if(!res.destroyed)res.writeHead(500).end(String(e));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;

 async function modified(){
  store=api.createWorkerTickReceiptStore(connection.getWorkerTickPool());
  const {WorkerRuntime,fileStateStore}=await import(pathToFileURL(path.join(root,'scripts/worker-runtime.mjs')));
  const create=async(extra={})=>{let state;const w=new WorkerRuntime({origin,secret,instanceId:'negative-worker',commit,targetInstanceId:web.instanceId,
    tickProtocol:2,timeoutMs:4000,store:{read:async()=>state,write:async v=>{state=structuredClone(v);}},startPaused:false,...extra});await w.init();return w;};
  const command=(w,action='prove-nonacceptance',extra={})=>({action,operationId:randomUUID(),bootId:w.bootId,expectedRevision:w.snapshot().revision,tickId:w.snapshot().lastTick?.id,...extra});
  const input=w=>{const t=w.snapshot().lastTick;return {tickId:t.id,workerInstanceId:t.workerInstanceId,workerBootId:t.workerBootId,workerCommit:t.workerCommit,targetWebInstanceId:t.targetWebInstanceId,protocolVersion:2,targetWebBootId:t.targetWebBootId,targetWebCommit:t.targetWebCommit};};
  const unknown=async()=>{wireMode='drop-before';const w=await create();await w.tick();assert.equal(w.snapshot().phase,'UNKNOWN');wireMode='normal';return w;};
  const req=async(w,action='accept',headers=w.tickHeaders(w.snapshot().lastTick))=>fetch(origin+'/api/video/worker/tick/v2?action='+action,{method:'POST',headers,redirect:'error'});
  await check('v2-purpose-auth-legacy-cannot-accept-even-if-URL-rewritten',async()=>{
   assert.equal((await fetch(origin+'/api/video/worker/tick/v2?action=capability')).status,401);
   assert.equal((await fetch(origin+'/api/video/worker/tick/v2?action=capability',{headers:{'x-video-worker-secret':secret}})).status,401);
   const w=await unknown(),headers=w.tickHeaders(w.snapshot().lastTick);assert.equal(headers['x-video-worker-secret'],undefined);
   assert.equal((await fetch(origin+'/api/video/worker/tick',{method:'POST',headers})).status,401);
   const oldApi=loadBaseline('src/lib/release-runtime/worker-tick-receipts.ts');
   const oldRoute=loadBaseline('src/app/api/video/worker/tick/route.ts', {...bindings,'@/lib/release-runtime/worker-tick-receipts':oldApi});
   assert.equal((await oldRoute.POST(new Request(origin+'/api/video/worker/tick',{method:'POST',headers}))).status,401);
   await assert.rejects(worker.control(command(worker)),/FENCE_NOT_SUPPORTED/);assert.equal(worker.snapshot().phase,'UNKNOWN');
   console.log('OLD_URL_REWRITE=401 OLD_V1_UNKNOWN=RETAINED');
  });
  await check('actual-middleware-auth-v2-capability-and-proof',async()=>{
   const {NextRequest}=require('next/server'),{middleware}=require('../src/middleware.ts');const w=await unknown();
   const request=new NextRequest(origin+'/api/video/worker/tick/v2?action=prove-not-accepted',{method:'POST',headers:w.tickHeaders(w.snapshot().lastTick)});
   const reply=await middleware(request);assert.equal(reply.headers.get('x-middleware-next'),'1');
  });
  await check('real-PG-preaccept-503-and-read404-never-authorize-recovery',async()=>{
   const w=await create();await connection.closeDatabasePools();docker('stop');await w.tick();assert.equal(w.snapshot().lastTick.httpStatus,503);
   assert.equal(w.snapshot().phase,'UNKNOWN');docker('start');await ready();store=api.createWorkerTickReceiptStore(connection.getWorkerTickPool());
   await assert.rejects(w.control(command(w,'reconcile')),/RECONCILE_UNVERIFIED/);
   await assert.rejects(w.control(command(w,'reconcile-nonacceptance')),/NONACCEPTANCE_UNVERIFIED/);
   assert.equal(w.snapshot().phase,'UNKNOWN');const before=scans;
   const proof=await w.control(command(w));assert.equal(proof.state.lastTick.phase,'not_accepted');assert.equal(proof.state.paused,true);assert.equal(scans,before);
   assert.equal(proof.receipt.originalUnknown.phase,'unknown');assert.equal(proof.receipt.serverReceipt.acceptedAt,null);
   const pool=connection.getWorkerTickPool();const row=(await pool.query('SELECT * FROM app_worker_tick_receipts WHERE tick_id=$1',[input(w).tickId])).rows[0];
   assert.equal(row.phase,'unknown');assert.ok(row.nonacceptance_at);assert.equal(row.protocol_version,2);
  });
  await check('negative-fence-wins-against-real-delayed-original-POST',async()=>{
   acceptGate=deferred();delayedAccept=[];wireMode='defer-accept';const w=await create();const before=scans;await w.tick();
   const id=w.snapshot().lastTick.id,result=await w.control(command(w));assert.equal(result.state.lastTick.id,id);assert.equal(result.state.lastTick.phase,'not_accepted');
   acceptGate.resolve();await until(async()=>delayedAccept.length);wireMode='normal';assert.deepEqual(delayedAccept,[409]);assert.equal(scans,before);
   assert.equal((await req(w)).status,409);const a=await (await req(w,'prove-not-accepted')).json(),b=await (await req(w,'prove-not-accepted')).json();
   assert.deepEqual(a.receipt,b.receipt);assert.equal(scans,before);
   const oldApi=loadBaseline('src/lib/release-runtime/worker-tick-receipts.ts');
   const oldStore=oldApi.createWorkerTickReceiptStore(connection.getWorkerTickPool());const legacy=await oldApi.runReceiptedWorkerTick(oldStore,input(w),web,scan);
   assert.equal(legacy.duplicate,true);assert.equal(legacy.receipt.phase,'unknown');assert.equal(scans,before);
   console.log('DELAYED_ACCEPT=409 LEGACY_DUPLICATE=unknown SCAN_DELTA=0');
  });
  await check('accept-commit-wins-negative-rejected-running-completed-unknown',async()=>{
   wireMode='lose-accept-running';scanGate=deferred();const before=scans,w=await create();await w.tick();await until(async()=>scans===before+1);
   assert.equal((await req(w,'prove-not-accepted')).status,409);assert.equal((await store.readFenced(input(w),web)).phase,'running');
   const pool=connection.getWorkerTickPool();assert.equal(pool.totalCount,pool.idleCount,'scan must hold zero control connections');
   scanGate.resolve();scanGate=null;wireMode='normal';await until(async()=>(await store.readFenced(input(w),web)).phase==='completed');
   await w.control(command(w,'reconcile'));assert.equal(w.snapshot().paused,true);assert.equal(scans,before+1);assert.equal((await req(w,'prove-not-accepted')).status,409);
   const bad={...input(w),tickId:randomUUID()};await store.acceptFenced(bad,web);await store.unknown(bad,web);
   await assert.rejects(store.proveNotAccepted(bad,web),/ALREADY_ACCEPTED/);assert.equal((await store.readFenced(bad,web)).phase,'unknown');
   console.log('ACCEPT_COMMITTED=1 NEGATIVE=409 RECONCILE=completed SCAN_DELTA=1');
  });
  await check('concurrent-unique-index-fence-both-orders-no-double-scan',async()=>{
   let accepted=0,negative=0;const w=await unknown();
   for(let n=0;n<12;n++){
    const ident={...input(w),tickId:randomUUID()},before=scans;
    const a=()=>api.runFencedWorkerTick(store,ident,web,scan),b=()=>store.proveNotAccepted(ident,web);
    const outcomes=await Promise.allSettled(n%2?[a(),b(),a(),b()]:[b(),a(),b(),a()]);
    const r=await store.readFenced(ident,web);
    if(r.phase==='not_accepted'){negative++;assert.equal(scans,before);assert.ok(outcomes.every(o=>o.status==='fulfilled'));}
    else {accepted++;assert.equal(r.phase,'completed');assert.equal(scans,before+1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,2);}
   }
   assert.ok(accepted>0&&negative>0);console.log('RACE_ACCEPTED='+accepted+' RACE_FENCED='+negative+' DUPLICATE_SCANS=0');
  });
  await check('negative-commit-lost-response-readonly-reconcile-and-idempotency',async()=>{
   const w=await unknown(),before=scans,cmd=command(w);wireMode='lose-proof';await assert.rejects(w.control(cmd),/NONACCEPTANCE_UNVERIFIED/);
   assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal((await store.readFenced(input(w),web)).phase,'not_accepted');
   wireMode='normal';const read=command(w,'reconcile-nonacceptance'),posts=proofRequests;
   const result=await w.control(read);assert.equal(result.state.paused,true);assert.equal(result.receipt.originalUnknown.id,cmd.tickId);assert.equal(proofRequests,posts);
   assert.equal((await w.control(read)).duplicate,true);await w.tick();assert.equal(scans,before);
   assert.equal((await req(w)).status,409);
  });
  await check('accepted-commit-complete-lost-response-GET-only-no-rescan',async()=>{
   wireMode='lose-completed';const w=await create(),before=scans;await w.tick();assert.equal(w.snapshot().phase,'UNKNOWN');
   const posts=acceptRequests;wireMode='normal';await w.control(command(w,'reconcile'));assert.equal(w.snapshot().lastTick.phase,'complete');assert.equal(w.snapshot().paused,true);
   await w.tick();assert.equal(acceptRequests,posts);assert.equal(scans,before+1);
  });
  await check('fixed-protocol-owner-web-boot-commit-and-readonly-GET',async()=>{
   const w=await unknown(),ident=input(w),p=connection.getWorkerTickPool(),before=(await p.query('SELECT count(*)::int n FROM app_worker_tick_receipts')).rows[0].n;
   const headers=w.tickHeaders(w.snapshot().lastTick),url=origin+'/api/video/worker/tick/v2?tickId='+ident.tickId;
   assert.equal((await fetch(url,{headers})).status,404);assert.equal((await p.query('SELECT count(*)::int n FROM app_worker_tick_receipts')).rows[0].n,before);
   for(const change of [{targetWebBootId:randomUUID()},{targetWebCommit:'b'.repeat(40)},{protocolVersion:1}])await assert.rejects(store.proveNotAccepted({...ident,...change},web));
   process.env.NAUMI_RELEASE_BOOT_ID=randomUUID();assert.equal((await req(w,'prove-not-accepted')).status,409);process.env.NAUMI_RELEASE_BOOT_ID=boot;
   process.env.SOURCE_COMMIT='b'.repeat(40);assert.equal((await req(w,'prove-not-accepted')).status,409);process.env.SOURCE_COMMIT=commit;
   process.env.NAUMI_RELEASE_BOOT_SOURCE='process-fallback';assert.equal((await req(w,'prove-not-accepted')).status,503);process.env.NAUMI_RELEASE_BOOT_SOURCE='preload';
   await store.proveNotAccepted(ident,web);await assert.rejects(store.proveNotAccepted({...ident,workerBootId:randomUUID()},web),/IDENTITY_CONFLICT/);
   await assert.rejects(store.proveNotAccepted({...ident,workerInstanceId:'wrong-owner'},web),/IDENTITY_CONFLICT/);
   assert.equal((await fetch(url,{headers:{...headers,'x-naumi-worker-target-boot-id':randomUUID()}})).status,409);
  });
  await check('new-Web-boot-can-only-read-existing-proof-or-completion',async()=>{
   const w=await unknown();await store.proveNotAccepted(input(w),web);const newBoot=randomUUID();process.env.NAUMI_RELEASE_BOOT_ID=newBoot;
   try {assert.equal((await req(w,'prove-not-accepted')).status,409);await w.control(command(w,'reconcile-nonacceptance'));assert.equal(w.snapshot().paused,true);}
   finally{process.env.NAUMI_RELEASE_BOOT_ID=boot;}
   wireMode='lose-completed';const complete=await create();await complete.tick();wireMode='normal';process.env.NAUMI_RELEASE_BOOT_ID=newBoot;
   try {await complete.control(command(complete,'reconcile'));assert.equal(complete.snapshot().lastTick.phase,'complete');assert.equal(complete.snapshot().paused,true);}
   finally{process.env.NAUMI_RELEASE_BOOT_ID=boot;}
   const absent=await unknown();process.env.NAUMI_RELEASE_BOOT_ID=newBoot;
   try {await assert.rejects(absent.control(command(absent,'reconcile-nonacceptance')),/UNVERIFIED/);assert.equal(absent.snapshot().phase,'UNKNOWN');}
   finally{process.env.NAUMI_RELEASE_BOOT_ID=boot;}
  });
  await check('read-proof-budget-and-reused-operation-fingerprint',async()=>{
   const w=await unknown(),cmd=command(w);wireMode='lose-proof';await assert.rejects(w.control(cmd),/UNVERIFIED/);wireMode='normal';
   await assert.rejects(w.control({...cmd,action:'drain'}),/OPERATION_CONFLICT/);
   const noProof=await unknown();for(let n=0;n<3;n++)await assert.rejects(noProof.control(command(noProof,'reconcile-nonacceptance')),/UNVERIFIED/);
   const before=receiptReads;await assert.rejects(noProof.control(command(noProof,'reconcile-nonacceptance')),/BUDGET_EXHAUSTED/);assert.equal(receiptReads,before);
  });
  await check('manual-drain-wins-during-proof-network-and-control-CAS',async()=>{
   const w=await unknown();proofGate=deferred();const before=proofRequests,pending=w.control(command(w));await until(async()=>proofRequests>before);
   const active=await Promise.allSettled([w.control(command(w)),w.control(command(w,'drain'))]);
   assert.equal(active[0].status,'rejected');assert.match(active[0].reason.message,/PROOF_IN_FLIGHT/);assert.equal(active[1].status,'fulfilled');
   proofGate.resolve();proofGate=null;await assert.rejects(pending,/REVISION_CONFLICT/);assert.equal(w.snapshot().phase,'UNKNOWN');assert.equal(w.snapshot().paused,true);
   const read=await w.control(command(w,'reconcile-nonacceptance'));assert.equal(read.state.paused,true);assert.equal(read.state.lastTick.phase,'not_accepted');
   await assert.rejects(w.control(command(w,'resume',{expectedRevision:0})),/REVISION_CONFLICT/);assert.equal(w.snapshot().automaticRecoveryEligible,false);
  });
  await check('proof-budget-persisted-across-restart-and-corrupt-response-fail-closed',async()=>{
   const w=await unknown();for(const m of ['corrupt-proof','wrong-proof','lose-proof']){wireMode=m;await assert.rejects(w.control(command(w)),/NONACCEPTANCE_UNVERIFIED/);assert.equal(w.snapshot().phase,'UNKNOWN');}
   wireMode='normal';const calls=proofRequests;await assert.rejects(w.control(command(w)),/BUDGET_EXHAUSTED/);assert.equal(proofRequests,calls);
   const restarted=await create({store:w.store});await assert.rejects(restarted.control(command(restarted)),/BUDGET_EXHAUSTED/);assert.equal(restarted.snapshot().lastTick.nonacceptanceAttempts.length,3);
   await restarted.control(command(restarted,'reconcile-nonacceptance'));assert.equal(restarted.snapshot().paused,true);
  });
  await check('durable-attempt-and-proof-persistence-failures-never-resume',async()=>{
   const w=await unknown(),requests=proofRequests;w.store.write=async()=>{throw Error('fixture disk failure');};
   await assert.rejects(w.control(command(w)),/disk failure/);assert.equal(proofRequests,requests);assert.equal(w.snapshot().phase,'UNKNOWN');
   const later=await unknown(),write=later.store.write;let writes=0;later.store.write=async value=>{if(++writes===2)throw Error('fixture resolution failure');return write(value);};
   const cmd=command(later);await assert.rejects(later.control(cmd),/resolution failure/);assert.equal(later.snapshot().phase,'UNKNOWN');
   await assert.rejects(later.control(command(later,'resume')),/CONTROL_FAULT/);await assert.rejects(later.control(cmd),/CONTROL_FAULT/);
   const restart=await create({store:later.store});assert.equal(restart.snapshot().phase,'UNKNOWN');assert.equal(restart.snapshot().lastTick.id,cmd.tickId);
  });
  await check('proof-database-outage-counts-attempt-no-row-until-explicit-retry',async()=>{
   const w=await unknown(),cmd=command(w),before=scans;await connection.closeDatabasePools();docker('stop');
   try{await assert.rejects(w.control(cmd),/NONACCEPTANCE_UNVERIFIED/);assert.equal(w.snapshot().phase,'UNKNOWN');}
   finally{docker('start');await ready();store=api.createWorkerTickReceiptStore(connection.getWorkerTickPool());}
   await assert.rejects(store.readFenced(input(w),web),/NOT_FOUND/);assert.equal(w.snapshot().lastTick.nonacceptanceAttempts.length,1);
   const proof=await w.control(cmd);assert.equal(proof.state.lastTick.phase,'not_accepted');assert.equal(proof.state.lastTick.nonacceptanceAttempts.length,2);assert.equal(scans,before);
  });
  await check('actual-proof-HTTP-timeout-is-bounded-and-durable-proof-remains',async()=>{
   const w=await unknown(),before=scans;proofGate=deferred();const gate=proofGate,begin=Date.now();
   try{await assert.rejects(w.control(command(w)),/NONACCEPTANCE_UNVERIFIED/);assert.ok(Date.now()-begin>=3500&&Date.now()-begin<6500);assert.equal(w.snapshot().phase,'UNKNOWN');}
   finally{gate.resolve();proofGate=null;}
   assert.equal((await store.readFenced(input(w),web)).phase,'not_accepted');await w.control(command(w,'reconcile-nonacceptance'));assert.equal(w.snapshot().paused,true);assert.equal(scans,before);
   console.log('PROOF_HTTP_DEADLINE=4000ms TIMEOUT_STATE=UNKNOWN DURABLE_NEGATIVE=READ_ONLY_RECONCILED');
  });
  await check('real-PG-row-lock-timeout-proof-rollback-no-scan',async()=>{
   const w=await unknown(),ident=input(w);await store.acceptFenced({...ident,tickId:randomUUID()},web);
   const client=await connection.getWorkerTickPool().connect();await client.query('BEGIN');
   await client.query(`INSERT INTO app_worker_tick_receipts(tick_id,worker_instance_id,worker_boot_id,worker_commit,web_instance_id,web_boot_id,web_commit,phase,protocol_version)
     VALUES($1,$2,$3,$4,$5,$6,$4,'running',2)`,[ident.tickId,ident.workerInstanceId,ident.workerBootId,commit,web.instanceId,web.bootId]);
   const begin=Date.now(),before=scans;try{assert.equal((await req(w,'prove-not-accepted')).status,503);assert.ok(Date.now()-begin<4000);}finally{await client.query('ROLLBACK');client.release();}
   assert.equal(scans,before);await assert.rejects(store.readFenced(ident,web),/NOT_FOUND/);await w.control(command(w));assert.equal(w.snapshot().lastTick.phase,'not_accepted');
  });
  await check('real-worker-process-restart-original-boot-proof-and-manual-resume',async()=>{
   const {spawn}=require('node:child_process'),{once}=require('node:events');
   const dir=path.resolve('output/capacity-x3-nonacceptance/process-'+randomUUID());fs.mkdirSync(dir,{recursive:true});
   const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
   let child,log='',startCount=0;
   const childEnv={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,NAUMI_APP_ORIGIN:origin,VIDEO_WORKER_SECRET:secret,VIDEO_WORKER_INTERVAL_MS:'5000',
    SOURCE_COMMIT:commit,NAUMI_INSTANCE_ID:'negative-worker',NAUMI_WORKER_TARGET_INSTANCE_ID:web.instanceId,NAUMI_WORKER_TICK_PROTOCOL:'2',NAUMI_WORKER_RELEASE_CONTROL:'1',
    NAUMI_WORKER_START_PAUSED:'0',NAUMI_WORKER_CONTROL_PORT:String(port),NAUMI_WORKER_STATE_FILE:path.join(dir,'worker.json')};
   const request=async body=>{const r=await fetch('http://127.0.0.1:'+port+(body?'/control':'/status'),{method:body?'POST':'GET',headers:{'x-video-worker-secret':secret},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});return {status:r.status,data:await r.json()};};
   const start=async()=>{child=spawn(process.execPath,[path.join(root,'scripts/video-worker.mjs')],{env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});startCount++;child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);return until(async()=>{const r=await request();return r.status===200?r.data:null;});};
   const stop=async signal=>{if(child&&child.exitCode===null&&child.signalCode===null){child.kill(signal);await once(child,'exit');}};
   const cmd=(s,action)=>({action,operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision,tickId:s.lastTick?.id});
   try{
    wireMode='drop-before';const before=scans;await start();const lost=await until(async()=>{const s=(await request()).data;return s.phase==='UNKNOWN'?s:null;});
    assert.equal(scans,before);await stop('SIGKILL');wireMode='normal';const second=await start();assert.notEqual(second.bootId,lost.bootId);assert.equal(second.lastTick.workerBootId,lost.bootId);assert.equal(second.lastTick.id,lost.lastTick.id);
    assert.equal((await request(cmd(second,'resume'))).status,409);assert.equal((await request({...cmd(second,'prove-nonacceptance'),bootId:lost.bootId})).status,409);
    const lostProof=cmd(second,'prove-nonacceptance');wireMode='lose-proof';assert.equal((await request(lostProof)).status,409);assert.equal(scans,before);
    await stop('SIGKILL');wireMode='normal';const third=await start();assert.equal(third.lastTick.phase,'unknown');assert.equal(third.lastTick.nonacceptanceAttempts.length,1);
    const proofCommand=cmd(third,'reconcile-nonacceptance'),proof=await request(proofCommand);assert.equal(proof.status,200);assert.equal(proof.data.state.paused,true);
    await stop('SIGKILL');const fourth=await start();assert.equal(fourth.lastTick.phase,'not_accepted');assert.equal(fourth.paused,true);const count=proofRequests;
    assert.equal((await request(proofCommand)).data.duplicate,true);assert.equal(proofRequests,count);
    assert.equal((await request(cmd(fourth,'resume'))).status,200);const finished=await until(async()=>{const s=(await request()).data;return s.lastTick?.phase==='complete'?s:null;});
    assert.equal(scans,before+1);assert.notEqual(finished.lastTick.id,lost.lastTick.id);assert.equal((await request(cmd(finished,'drain'))).status,200);
    const saved=JSON.parse(fs.readFileSync(childEnv.NAUMI_WORKER_STATE_FILE));assert.equal(saved.operations[proofCommand.operationId].originalUnknown.id,lost.lastTick.id);
    await stop('SIGTERM');assert.ok(child.exitCode===0||process.platform==='win32'&&child.signalCode==='SIGTERM');console.log('PROCESS_STARTS='+startCount+' ORIGINAL_BOOT=RETAINED PROOF_REPLAY_HTTP=0 MANUAL_RESUME_SCAN_DELTA=1 EXIT='+child.exitCode+' SIGNAL='+child.signalCode);
   }finally{await stop('SIGKILL');fs.writeFileSync(path.join(dir,'process.log'),log);wireMode='normal';}
  });
  assert.equal(scans,paidCallbacks);console.log('AUDIT_COUNTS SCANS='+scans+' PAID_CALLBACKS='+paidCallbacks+' ACCEPT_REQUESTS='+acceptRequests+' PROOF_REQUESTS='+proofRequests+' RECEIPT_GETS='+receiptReads);
 }
 const {WorkerRuntime}=await import(pathToFileURL(path.join(root,'scripts/worker-runtime.mjs')));let saved;const durable={read:async()=>saved,write:async v=>{saved=structuredClone(v);}};
 const worker=new WorkerRuntime({origin,secret,instanceId:'negative-worker',commit,targetInstanceId:web.instanceId,store:durable,startPaused:false,timeoutMs:5000});
 try{await worker.init();await connection.closeDatabasePools();await admin.end();docker('stop');await worker.tick();
 assert.equal(worker.snapshot().phase,'UNKNOWN');assert.equal(worker.snapshot().lastTick.httpStatus,503);assert.equal(scans,0);docker('start');await ready();
 const tick=worker.snapshot().lastTick;const response=await fetch(origin+'/api/video/worker/tick?tickId='+tick.id,{headers:worker.tickHeaders(tick)});assert.equal(response.status,404);
 await assert.rejects(worker.control({action:'reconcile',tickId:tick.id,operationId:randomUUID(),bootId:worker.bootId,expectedRevision:0}),/RECONCILE_UNVERIFIED/);
 await worker.tick();assert.equal(scans,0);assert.equal(worker.snapshot().phase,'UNKNOWN');assert.equal(worker.snapshot().lastTick.id,tick.id);
 console.log('PREACCEPT_CONNECTION_FAILURE HTTP=503 GET=404 STATE=UNKNOWN ORIGINAL_UUID=RETAINED SCANS=0 PAID_CALLBACKS=0');
 if(mode==='modified')await modified();
 else {assert.equal(store.proveNotAccepted,undefined);assert.equal(fs.existsSync(path.join(root,'src/app/api/video/worker/tick/v2/route.ts')),false);console.log('RECOVERY_PROTOCOL=ABSENT FENCE_API=undefined');}
 console.log('X3_NEGATIVE_'+mode.toUpperCase()+'=PASS CASES='+cases.length+' REAL_PG=1 ACTUAL_ROUTE_AUTH=1 HTTP=LOCAL SCANS='+scans+' PAID_CALLBACKS='+paidCallbacks+' SUPPLIER_CALLS=0');
 }finally{docker('start');await ready();server.closeAllConnections();await new Promise(r=>server.close(r));await connection.closeDatabasePools();if(!admin.ended)await admin.end();const cleanup=new Pool({connectionString:database,max:1});await cleanup.query('DROP SCHEMA '+schema+' CASCADE');await cleanup.end();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
