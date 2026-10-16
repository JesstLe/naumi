/** Actual Next middleware + actual receipt route, isolated localhost PG only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const database="postgresql://postgres:fixture-only-local@127.0.0.1:55438/release_fixture";
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1" || process.env.DATABASE_URL!==database)throw Error("ISOLATED_APP_DRAIN_FIXTURE_REQUIRED");
  const root=process.cwd(),dir=resolve(root,"output/integrated-regression-9138/worker-next-fixture"),port=43219;
  const secret="fixture-worker-receipt-secret-0123456789abcdef",commit="a".repeat(40);
  Object.assign(process.env,{VIDEO_WORKER_SECRET:secret,SETTINGS_SECRET:"fixture-settings-secret-never-production-32",NAUMI_VIDEO_WORKER:"0",NAUMI_INSTANCE_ID:"fixture-worker-web",SOURCE_COMMIT:commit});
  delete process.env.FLEET_PORTAL_ONLY;
  const db=await import("../src/lib/db");await db.ensureSchema();
  await mkdir(resolve(dir,"src/app/api/video/worker/tick"),{recursive:true});
  await mkdir(resolve(dir,"src/app/api/video/config"),{recursive:true});
  await copyFile(process.env.RELEASE_FIXTURE_MIDDLEWARE_SOURCE||resolve(root,"src/middleware.ts"),resolve(dir,"src/middleware.ts"));
  await copyFile(resolve(root,"src/app/api/video/worker/tick/route.ts"),resolve(dir,"src/app/api/video/worker/tick/route.ts"));
  await writeFile(resolve(dir,"src/app/api/video/config/route.ts"),"export function GET(){return Response.json({unexpected:true})}");
  await writeFile(resolve(dir,"package.json"),JSON.stringify({name:"worker-middleware-fixture",private:true}));
  await writeFile(resolve(dir,"tsconfig.json"),JSON.stringify({compilerOptions:{target:"es2017",lib:["dom","esnext"],jsx:"preserve",module:"esnext",moduleResolution:"bundler",esModuleInterop:true,skipLibCheck:true,baseUrl:root,paths:{"@/*":["./src/*"]}}}));
  await writeFile(resolve(dir,"next.config.mjs"),"export default {serverExternalPackages:['pg'],experimental:{cpus:1,externalDir:true}};");
  await writeFile(resolve(dir,"src/app/layout.tsx"),"export default function Layout({children}){return <html><body>{children}</body></html>}");
  await writeFile(resolve(dir,"src/app/page.tsx"),"export default function Page(){return <main>fixture</main>}");
  const runner=resolve(dir,"server.cjs");
  await writeFile(runner,`process.chdir(${JSON.stringify(dir)});const http=require('node:http');const next=require(${JSON.stringify(resolve(root,"node_modules/next"))});const app=next({dev:true,dir:${JSON.stringify(dir)},hostname:'127.0.0.1',port:${port}});app.prepare().then(()=>http.createServer(app.getRequestHandler()).listen(${port},'127.0.0.1',()=>console.log('WORKER_NEXT_READY'))).catch(e=>{console.error(e);process.exit(1)});`);
  const child=spawn(process.execPath,["--max-old-space-size=1536",runner],{cwd:root,env:{...process.env,NODE_OPTIONS:"",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",b=>process.stdout.write(b));child.stderr.on("data",b=>process.stderr.write(b));
  let checks=0;const is=(a:unknown,b:unknown)=>{assert.equal(a,b);checks++;};
  try{
    await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(Error("WORKER_NEXT_START_TIMEOUT")),90000);child.stdout.on("data",b=>{if(String(b).includes("WORKER_NEXT_READY")){clearTimeout(timer);done();}});child.once("exit",code=>{clearTimeout(timer);reject(Error("WORKER_NEXT_EXIT_"+code));});});
    const origin=`http://127.0.0.1:${port}`,path="/api/video/worker/tick";
    const receipts=await import("../src/lib/release-runtime/worker-tick-receipts");
    const tick={tickId:randomUUID(),workerInstanceId:"fixture-worker",workerBootId:randomUUID(),workerCommit:commit,targetWebInstanceId:"fixture-worker-web"};
    const headers=Object.fromEntries([...Object.entries(receipts.TICK_HEADERS).map(([k,v])=>[v,tick[k as keyof typeof tick]]),["x-video-worker-secret",secret]]);
    const read=(query="?tickId="+tick.tickId,h:Record<string,string>=headers,p=path)=>fetch(origin+p+query,{headers:h,signal:AbortSignal.timeout(90000)});
    is((await read(undefined,{})).status,401);
    is((await read(undefined,{...headers,"x-video-worker-secret":"invalid"})).status,401);
    is((await read("")).status,401);
    is((await read("?tickId=not-a-uuid")).status,401);
    is((await read("",headers,"/api/video/config")).status,401);
    const before=await db.getPool().query("SELECT to_regclass('app_worker_tick_receipts')::text name");
    const preRead=await read();
    if(process.env.RELEASE_FIXTURE_EXPECT_BASELINE==="1"){
      is(preRead.status,401);console.log(`WORKER_TICK_MIDDLEWARE_BASELINE=REPRODUCED CHECKS=${checks} VALID_RECEIPT_GET=401 BEFORE_ROUTE REAL_SUPPLIER_CALLS=0`);return;
    }
    is(preRead.status,503);
    is((await db.getPool().query("SELECT to_regclass('app_worker_tick_receipts')::text name")).rows[0].name,before.rows[0].name);
    const store=receipts.createWorkerTickReceiptStore(db.getPool()),web=receipts.workerTickWebIdentity();
    await store.accept(tick,web);await store.complete(tick,web,{ok:true,processed:0});
    const response=await read(),body=await response.json();is(response.status,200);is(body.receipt.tickId,tick.tickId);is(body.receipt.phase,"completed");is(body.receipt.worker.bootId,tick.workerBootId);
    is((await read("?tickId="+randomUUID(),{...headers,[receipts.TICK_HEADERS.tickId]:randomUUID()})).status,400);
    const missing=randomUUID();is((await read("?tickId="+missing,{...headers,[receipts.TICK_HEADERS.tickId]:missing})).status,404);
    is((await read(undefined,{...headers,[receipts.TICK_HEADERS.targetWebInstanceId]:"other-web"})).status,409);
    is((await read(undefined,{"x-video-worker-secret":secret})).status,400);
    const posted=await fetch(origin+path,{method:"POST",headers,signal:AbortSignal.timeout(90000)});is(posted.status,200);is((await posted.json()).duplicate,true);
    is(Number((await db.getPool().query("SELECT count(*) n FROM app_worker_tick_receipts")).rows[0].n),1);
    // A synthetic accepted tick loses its response; the real runner restarts and
    // reconciles through actual Next middleware/GET, never through direct route calls.
    const {WorkerRuntime}=await import("./worker-runtime.mjs");let state:any=null;
    const durable={async read(){return structuredClone(state);},async write(value:any){state=structuredClone(value);}};
    const common={origin,secret,instanceId:"fixture-worker",commit,targetInstanceId:web.instanceId,store:durable as any,startPaused:false};
    const original=new WorkerRuntime({...common,fetchImpl:async(url:any,init:any)=>{
      const accepted=receipts.tickIdentity(new Request(url,init))!;
      await store.accept(accepted,web);await store.complete(accepted,web,{ok:true,processed:0});
      throw Error("synthetic accepted tick response lost");
    }});await original.init();await original.tick();is(original.snapshot().phase,"UNKNOWN");
    const originalBoot=original.bootId,restarted=new WorkerRuntime(common);await restarted.init();
    const snap=restarted.snapshot();is(snap.phase,"UNKNOWN");
    const reconciled=await restarted.control({action:"reconcile",operationId:randomUUID(),bootId:restarted.bootId,expectedRevision:snap.revision,tickId:snap.lastTick.id});
    is(reconciled.state.phase,"QUIESCENT");is(reconciled.state.paused,true);is(reconciled.receipt.originalWorkerBootId,originalBoot);
    is(Number((await db.getPool().query("SELECT count(*) n FROM app_worker_tick_receipts")).rows[0].n),2);
    console.log(`WORKER_TICK_MIDDLEWARE=PASS CHECKS=${checks} ACTUAL_NEXT_MIDDLEWARE=YES ACTUAL_ROUTE=YES COMPLETED_GET=200 BAD_SECRET=401 OTHER_GET=401 GET_DDL=NONE DUPLICATE_POST=NO_SCAN REAL_SUPPLIER_CALLS=0`);
  }finally{child.kill("SIGKILL");await db.getPool().query("DROP TABLE IF EXISTS app_worker_tick_receipts");await db.getPool().end();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
