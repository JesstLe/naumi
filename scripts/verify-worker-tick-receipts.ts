/** Explicit local PostgreSQL + local HTTP only. Synthetic scanner/job; never imports or starts a business worker. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Pool } from "pg";
import { createWorkerTickReceiptStore, runReceiptedWorkerTick, TICK_HEADERS, tickIdentity, workerTickWebIdentity, WorkerTickReceiptError, type TickIdentity, type WorkerTickReceiptStore } from "../src/lib/release-runtime/worker-tick-receipts";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw Error("Requires explicit isolated localhost PostgreSQL");
  const commit="a".repeat(40),secret="fixture-worker-receipt-secret-0123456789abcdef",schema="worker_receipt_test_"+randomUUID().replace(/-/g,"");
  Object.assign(process.env,{VIDEO_WORKER_SECRET:secret,NAUMI_INSTANCE_ID:"fixture-web",SOURCE_COMMIT:commit,PGOPTIONS:`-c search_path=${schema}`});
  const admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`,max:4});
  const store=createWorkerTickReceiptStore(pool),web=workerTickWebIdentity();
  let checks=0,scans=0,jobPosts=0,tickPosts=0,tickGets=0,loseResponse=true,origin="";
  const is=(a:unknown,b:unknown)=>{assert.equal(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
  const identity=():TickIdentity=>({tickId:randomUUID(),workerInstanceId:"fixture-worker",workerBootId:randomUUID(),workerCommit:commit,targetWebInstanceId:web.instanceId});
  const tickHeaders=(input:TickIdentity)=>Object.fromEntries([...[...Object.entries(TICK_HEADERS)].map(([key,header])=>[header,input[key as keyof TickIdentity]]),["x-video-worker-secret",secret]]);
  const scan=async()=>{scans++;const response=await fetch(origin+"/fixture/job",{method:"POST"});assert.equal(response.status,200);return {ok:true,processed:1,at:new Date().toISOString()};};
  const http=createServer(async(req,res)=>{
    try {
      if(req.url==="/fixture/job"){assert.equal(req.method,"POST");jobPosts++;res.writeHead(200,{"content-type":"application/json"});res.end('{"ok":true}');return;}
      const request=new Request(origin+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([,v])=>typeof v==="string") as [string,string][])});
      assert.equal(request.headers.get("x-video-worker-secret"),secret);
      const input=tickIdentity(request);assert.ok(input);
      let receipt,duplicate=false;
      if(req.method==="GET"){tickGets++;assert.equal(new URL(request.url).searchParams.get("tickId"),input.tickId);receipt=await store.read(input,web);}
      else {tickPosts++;const result=await runReceiptedWorkerTick(store,input,web,scan);receipt=result.receipt;duplicate=result.duplicate;if(loseResponse){loseResponse=false;res.destroy();return;}}
      res.writeHead(receipt.phase==="completed"?200:202,{"content-type":"application/json"});res.end(JSON.stringify({ok:receipt.phase==="completed",receipt,server:web,duplicate}));
    }catch(error){res.writeHead(error instanceof WorkerTickReceiptError?error.status:503,{"content-type":"application/json"});res.end(JSON.stringify({error:error instanceof WorkerTickReceiptError?error.code:"fixture-failure"}));}
  });
  await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));origin=`http://127.0.0.1:${(http.address() as {port:number}).port}`;
  let coreDb:typeof import("../src/lib/db")|undefined;
  try {
    const blank=identity();is(tickIdentity(new Request(origin)),null);
    assert.throws(()=>tickIdentity(new Request(origin,{headers:{[TICK_HEADERS.tickId]:blank.tickId}})),/INVALID_WORKER_TICK_IDENTITY/);checks++;
    await assert.rejects(store.read(blank,web));checks++;
    is((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=$1",[schema])).rows[0].n,0);
    const claimed=await store.accept(blank,web);is(claimed.accepted,true);is(claimed.receipt.phase,"running");
    const double=await runReceiptedWorkerTick(store,blank,web,scan);is(double.duplicate,true);is(scans,0);
    await assert.rejects(store.read({...blank,workerBootId:randomUUID()},web),/IDENTITY_CONFLICT/);checks++;
    await assert.rejects(store.accept({...blank,targetWebInstanceId:"wrong-web"},web),/WEB_IDENTITY_MISMATCH/);checks++;
    await assert.rejects(store.complete(blank,{...web,bootId:randomUUID()},{ok:true}),/COMPLETION_CONFLICT/);checks++;
    const finished=await store.complete(blank,web,{ok:true,processed:0});is(finished.phase,"completed");ok(finished.completedAt);
    await assert.rejects(store.complete(blank,web,{ok:true}),/COMPLETION_CONFLICT/);checks++;
    const rebootRead=await store.read(blank,{...web,bootId:randomUUID()});is(rebootRead.web.bootId,web.bootId);is(rebootRead.phase,"completed");
    const race=identity(),raceResults=await Promise.all(Array.from({length:5},()=>runReceiptedWorkerTick(store,race,web,scan)));
    is(raceResults.filter(item=>!item.duplicate).length,1);is(scans,1);is(jobPosts,1);
    const unknown=identity();await assert.rejects(runReceiptedWorkerTick(store,unknown,web,async()=>{throw Error("fixture scanner crashed")}));checks++;
    is((await store.read(unknown,web)).phase,"unknown");is((await runReceiptedWorkerTick(store,unknown,web,scan)).duplicate,true);is(scans,1);
    const failedWrite=identity();let completionAttempts=0;
    const broken:WorkerTickReceiptStore={...store,async complete(){completionAttempts++;throw Error("receipt disk unavailable");}};
    await assert.rejects(runReceiptedWorkerTick(broken,failedWrite,web,scan),/unavailable/);checks++;is(completionAttempts,1);is((await store.read(failedWrite,web)).phase,"unknown");
    const before=scans;is((await runReceiptedWorkerTick(store,failedWrite,web,scan)).duplicate,true);is(scans,before);
    const failedAccept=identity();await assert.rejects(runReceiptedWorkerTick({...store,async accept(){throw Error("database offline")}},failedAccept,web,scan),/offline/);checks++;is(scans,before);
    // Bounded locks: a locked completion row must fail in ~500ms, not wait behind ongoing work.
    const locked=identity();await store.accept(locked,web);const lock=await pool.connect();await lock.query("BEGIN");await lock.query("SELECT * FROM app_worker_tick_receipts WHERE tick_id=$1 FOR UPDATE",[locked.tickId]);
    const start=Date.now();await assert.rejects(store.complete(locked,web,{ok:true}));checks++;ok(Date.now()-start<2500);await lock.query("ROLLBACK");lock.release();is((await store.read(locked,web)).phase,"running");
    // Real runner loses a completed HTTP reply, restarts, reconciles via GET only, then stays paused.
    const {WorkerRuntime}=await import("./worker-runtime.mjs");let state:any=null;
    const durable={async read(){return structuredClone(state);},async write(value:any){state=structuredClone(value);}};
    const worker=new WorkerRuntime({origin,secret,instanceId:"fixture-worker",commit,targetInstanceId:web.instanceId,store:durable as any,startPaused:false});await worker.init();
    const jobBefore=jobPosts;await worker.tick();is(worker.snapshot().phase,"UNKNOWN");is(jobPosts,jobBefore+1);const originalTick=worker.snapshot().lastTick;
    const restarted=new WorkerRuntime({origin,secret,instanceId:"fixture-worker",commit,targetInstanceId:web.instanceId,store:durable as any,startPaused:false});await restarted.init();is(restarted.snapshot().phase,"UNKNOWN");
    const command={action:"reconcile",operationId:randomUUID(),bootId:restarted.bootId,expectedRevision:restarted.snapshot().revision,tickId:originalTick.id};
    const reconciled=await restarted.control(command);is(reconciled.state.phase,"QUIESCENT");is(reconciled.state.paused,true);is(reconciled.receipt.originalWorkerBootId,originalTick.workerBootId);
    const getsBefore=tickGets;is((await restarted.control(command)).duplicate,true);is(tickGets,getsBefore);await restarted.tick();is(jobPosts,jobBefore+1);is(tickPosts,1);
    const repeated=await fetch(origin+"/api/video/worker/tick",{method:"POST",headers:tickHeaders({tickId:originalTick.id,workerInstanceId:originalTick.workerInstanceId,workerBootId:originalTick.workerBootId,workerCommit:originalTick.workerCommit,targetWebInstanceId:originalTick.targetWebInstanceId})});
    is(repeated.status,200);is((await repeated.json()).duplicate,true);is(jobPosts,jobBefore+1);
    // Actual Next GET route enforces worker auth + exact query identity and never invokes scan.
    coreDb=await import("../src/lib/db");const route=await import("../src/app/api/video/worker/tick/route");
    is((await route.GET(new Request(origin+"/api/video/worker/tick?tickId="+blank.tickId))).status,401);
    const query=new Request(origin+"/api/video/worker/tick?tickId="+blank.tickId,{headers:tickHeaders(blank)});
    const queried=await route.GET(query);is(queried.status,200);is((await queried.json()).receipt.phase,"completed");
    const noScan=await route.POST(new Request(origin+"/api/video/worker/tick",{method:"POST",headers:tickHeaders(blank)}));is(noScan.status,200);is((await noScan.json()).duplicate,true);is(jobPosts,jobBefore+1);
    is((await route.POST(new Request(origin+"/api/video/worker/tick",{method:"POST",headers:{"x-video-worker-secret":secret,[TICK_HEADERS.tickId]:blank.tickId}}))).status,400);
    is((await route.GET(new Request(origin+"/api/video/worker/tick?tickId="+randomUUID(),{headers:tickHeaders(blank)}))).status,400);
    is((await route.GET(new Request(origin+"/api/video/worker/tick?tickId="+blank.tickId,{headers:tickHeaders({...blank,workerInstanceId:"another"})}))).status,409);
    const missing=identity();is((await route.GET(new Request(origin+"/api/video/worker/tick?tickId="+missing.tickId,{headers:tickHeaders(missing)}))).status,404);
    const rows=await pool.query("SELECT count(*)::int n FROM app_worker_tick_receipts");ok(rows.rows[0].n>=6);
    const schemas=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1",[schema]);is(schemas.rows.length,1); // No general app schema/claim initialization.
    const ddl=await admin.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1",[schema]);is(ddl.rows[0].table_name,"app_worker_tick_receipts");
    console.log(`WORKER_TICK_RECEIPTS=PASS CHECKS=${checks} STORAGE=ISOLATED_POSTGRES RESPONSE_LOST=READONLY_RECONCILE DUPLICATE_TICK=NO_RESCAN RESTART=ORIGINAL_BOOT PAUSED=YES HTTP_TICK_POSTS=${tickPosts} HTTP_TICK_GETS=${tickGets} FIXTURE_JOB_POSTS=${jobPosts} REAL_SUPPLIER_CALLS=0`);
  }finally{http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));await coreDb?.getPool().end();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
