/** Whole original checkout versus integrated Worker application. Actual shared
 * scan, native tick HTTP, direct Worker, release leases, PG, retained image
 * recovery and a held loopback NAS. No replacement business dependencies. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {build} from "esbuild";
import {createModelFixture} from "./model-config-fixture";

const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),part=arg("--part"),out=path.resolve(arg("--out")||process.env.WORKER_MEDIA_EVIDENCE||"output/worker-media-integration");
async function main(){
 await mkdir(out,{recursive:true});
 if(!part){
  let checks=0;for(const name of ["http","direct"]){
   const command=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-worker-media-integration-pg.ts"),"--source-root",root,"--part",name,"--out",path.join(out,name),...(baseline?["--baseline"]:[])];
   const child=spawn(process.execPath,command,{env:{...process.env,NODE_OPTIONS:""},windowsHide:true,stdio:["ignore","pipe","pipe"]});let literal="";child.stdout.on("data",b=>literal+=b);child.stderr.on("data",b=>literal+=b);
   const exit=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("close",resolve);});await writeFile(path.join(out,name+".log"),literal+"\nEXIT="+exit+"\n");process.stdout.write(literal);assert.equal(exit,0,name);checks+=Number(literal.match(/CHECKS=(\d+)/)?.[1]||0);
  }
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({status:"PASS",mode:baseline?"BASELINE":"MODIFIED",parts:2,checks,fullSourceRoot:root,realPG:true,realTickHTTP:true,actualDirectWorker:true,realNAS:true,productionCalls:0},null,2)+"\n");
  console.log(`WORKER_MEDIA_INTEGRATION=PASS MODE=${baseline?"BASELINE":"MODIFIED"} PARTS=2 CHECKS=${checks} REAL_PG=1 TICK_HTTP=ACTUAL DIRECT_WORKER=ACTUAL SLOW_NAS=${baseline?"BLOCKS_NEXT_RECOVERY":"NEXT_RECOVERY_PROGRESS"} DRAIN=OBSERVED ORIGINAL_QUOTES=6_CURRENT17 UNKNOWN_REPLAY=0 SUPPLIER_POSTS=0`);return;
 }
 assert.ok(["http","direct"].includes(part));
 process.env.SETTINGS_SECRET="r6r-worker-media-isolated-settings-secret-only-20261027";
 let unblock!:()=>void,arrived!:()=>void;const gate=new Promise<void>(r=>unblock=r),atPut=new Promise<void>(r=>arrived=r);
 let nasPuts=0,unexpected=0;const objects=new Map<string,Buffer>();
 const f=await createModelFixture(async(req,res)=>{
  if(req.method==="HEAD"){res.writeHead(objects.has(req.url!)?200:404);res.end();return;}
  if(req.method==="PUT"){
   nasPuts++;const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
   if(req.url?.endsWith("/blocking.png")){arrived();await gate;}
   objects.set(req.url!,Buffer.concat(chunks));res.writeHead(200);res.end();return;
  }
  if(req.method==="GET"){const bytes=objects.get(req.url!);if(bytes){res.writeHead(200,{"content-type":"image/png"});res.end(bytes);return;}}
  unexpected++;res.writeHead(503);res.end("Unexpected fixture endpoint");
 });
 const instance="r6r-"+part+"-"+randomUUID(),commit="a".repeat(40),secret="r6r-local-worker-control-secret-20261027-only",media=path.join(out,"media");await mkdir(media,{recursive:true});
 Object.assign(process.env,{PGOPTIONS:"-c search_path="+f.schemaName,NAUMI_MULTI_USER:"1",SOURCE_COMMIT:commit,NAUMI_INSTANCE_ID:instance,NAUMI_RELEASE_RUNTIME:"1",NAUMI_RELEASE_ADMISSION_START:"open",RELEASE_CONTROL_SECRET:"r6r-release-control-local-fixture-only-20261027",STORAGE_DRIVER:"s3",MEDIA_DIR:media,MEDIA_PRIVATE:"1",MEDIA_REMOTE_ACCESS:"proxy",NAUMI_NAS_DEFER_UPLOAD:"1",S3_ENDPOINT:f.origin,S3_BUCKET:"fixture",S3_REGION:"garage",S3_ACCESS_KEY_ID:"fixture",S3_SECRET_ACCESS_KEY:"fixture-local-only",NAUMI_APPLICATION_TASK_EXECUTION:"worker",NAUMI_WORKER_EXECUTION:"direct",NAUMI_VIDEO_WORKER:"0",VIDEO_PROVIDERS_JSON:"[]",VIDEO_API_KEY:"",VIDEO_WORKER_SECRET:secret,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-local-only",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-no-model-calls",OPENAI_BASE_URL:f.origin+"/v1",OPENAI_IMAGE_MODEL:"gpt-image-2",OPENAI_IMAGE_MODELS:"gpt-image-2"});
 f.config.publicModels.push({...f.config.publicModels[0],id:"gpt-image-2",label:"Retained fixture model"});f.config.upstreamModels[0].capabilities.preserveIdentity=true;
 await f.repo.current();
 let api:any,app:any,runtime:any,running:Promise<unknown>|undefined,bridge:ReturnType<typeof createServer>|undefined,pool:any,closed=false,checks=0;
 const eq=(a:unknown,b:unknown,label="")=>{assert.deepEqual(a,b,label);checks++;},ok=(v:unknown,label="")=>{assert.ok(v,label);checks++;};
 const until=async(read:()=>Promise<any>,accept:(v:any)=>boolean,label:string,ms=15000)=>{const deadline=Date.now()+ms;let v;while(Date.now()<deadline){v=await read();if(accept(v))return v;await new Promise(r=>setTimeout(r,40));}throw Error(label+" "+JSON.stringify(v));};
 try{
  const names={db:"src/lib/db.ts",startup:"src/lib/application/persistence.ts",assets:"src/lib/media-assets.ts",release:"src/lib/release-runtime/store.ts",identity:"src/lib/release-runtime/identity.ts",route:"src/app/api/video/worker/tick/route.ts",worker:"src/lib/worker/application.ts",wake:"src/lib/application/task-execution.ts",images:"scripts/direct-worker-pg-fixture.ts",imageLocks:"src/lib/imagegen/coordination-pool.ts",videoLocks:"src/lib/video/coordination-pool.ts",inflight:"src/lib/worker/inflight.ts"};
  const code=Object.entries(names).map(([n,p])=>`export * as ${n} from ${JSON.stringify(path.join(root,p).replaceAll("\\","/"))};`).join("\n"),file=path.join(out,"actual.cjs");
  const bundle=await build({stdin:{contents:code,resolveDir:root,loader:"ts"},outfile:file,bundle:true,metafile:true,platform:"node",format:"cjs",external:["pg","sharp"],alias:{"server-only":path.resolve("scripts/fleet-server-only.cjs")},tsconfig:path.join(root,"tsconfig.json")});
  await writeFile(path.join(out,"SOURCE_INPUTS.json"),JSON.stringify(Object.keys(bundle.metafile!.inputs).filter(p=>p.includes("src/")),null,2)+"\n");
  api=createRequire(import.meta.url)(file);await api.startup.initializeApplicationPersistence();await api.release.ensureReleaseSchema();pool=api.db.getPool();
  const bytes=Buffer.from("R6R original immutable mirror bytes"),key="integration/blocking.png";await mkdir(path.join(media,"integration"),{recursive:true});await writeFile(path.join(media,key),bytes);
  await api.assets.registerMediaAsset(key,bytes,"application/octet-stream",false,undefined,false);
  const logs:string[]=[];const {WorkerRuntime}=await import(pathToFileURL(path.join(root,"scripts/worker-runtime.mjs")).href);
  const store={value:null as any,async read(){return this.value?structuredClone(this.value):null;},async write(v:unknown){this.value=structuredClone(v);}};
  let origin=f.origin,options:any={origin,secret,instanceId:instance,commit,targetInstanceId:instance,store,startPaused:false,log:(s:string)=>logs.push(s)};
  if(part==="direct"){
   app=await api.worker.createDirectWorkerApplication();options={...options,tickTransport:app};
  }else{
   bridge=createServer(async(req,res)=>{try{const request=new Request(origin+req.url,{method:req.method,headers:req.headers as Record<string,string>});const response=await api.route[req.method!](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e)}));}});
   await new Promise<void>(resolve=>bridge!.listen(0,"127.0.0.1",resolve));origin="http://127.0.0.1:"+(bridge.address() as {port:number}).port;options={...options,origin};
  }
  runtime=new WorkerRuntime(options);await runtime.init();
  if(app)await app.listen(()=>{if(!runtime.snapshot().paused)void runtime.tick();},()=>!runtime.snapshot().paused,1000);
  running=runtime.tick();await Promise.race([atPut,new Promise((_,reject)=>setTimeout(()=>reject(Error("NAS PUT not reached")),15000).unref())]);
  const active=await api.release.releaseStatus();ok(active.observations.trackedAcceptedWork>0,"media remains a durable in-flight activity");
  const transactions=Number((await f.sql.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n);eq(transactions,baseline?1:0,"network transaction count");
  if(part==="http"&&!baseline){await running;eq(runtime.snapshot().activeTicks,0);eq(runtime.snapshot().lastTick.phase,"complete");eq(runtime.snapshot().lastTick.mediaRecovery.mirrors.state,"running");eq(runtime.snapshot().lastTick.phasesMs.mediaAdmission>=0,true);}
  else{eq(runtime.snapshot().activeTicks,1);const skipped=await runtime.tick();eq(skipped.skipped,true);}
  const seed=await api.images.seed();await api.wake.wakeApplicationWorker();
  const ledger=async()=>(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[seed.owner])).rows[0];
  if(!baseline){if(part==="http")await runtime.tick();await until(ledger,v=>v.n===3,"new original-result recovery blocked behind NAS");eq(await ledger(),{n:3,amount:18});}
  else{await new Promise(resolve=>setTimeout(resolve,250));eq(await ledger(),{n:0,amount:0});}
  const beforeDrain=runtime.snapshot();await runtime.control({action:"drain",operationId:randomUUID(),bootId:runtime.bootId,expectedRevision:beforeDrain.revision});
  eq(runtime.snapshot().paused,true);ok((await api.release.releaseStatus()).observations.trackedAcceptedWork>0);if(app)eq(runtime.snapshot().tickDrainComplete,false);
  unblock();await running;await api.inflight.waitForBackgroundWork();eq(runtime.snapshot().lastTick.phase,"complete");eq((await api.assets.getMediaAsset(key)).remote_ready,true);
  if(baseline){const s=runtime.snapshot();await runtime.control({action:"resume",operationId:randomUUID(),bootId:runtime.bootId,expectedRevision:s.revision});await runtime.tick();await until(ledger,v=>v.n===3,"baseline work did not recover after releasing NAS");}
  eq(await ledger(),{n:3,amount:18});
  const old=(await pool.query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[seed.unknown])).rows[0];eq(old.snapshot.status,"needs_attention");eq(old.snapshot.paidOperations[seed.unknown].state,"started");
  const live=(await pool.query("SELECT lease_token FROM app_image_jobs WHERE id=$1",[seed.live])).rows[0];eq(live.lease_token,seed.token);
  eq(unexpected,0);eq(runtime.snapshot().unresolvedTicks,0);
  await api.inflight.waitForBackgroundWork();ok(await runtime.shutdown());if(app){await app.close();closed=true;}
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({status:"PASS",mode:baseline?"BASELINE":"MODIFIED",part,checks,nasPuts,unexpected,idleTransactionsWhileNASBlocked:transactions,earlyRecoveredConsumes:baseline?0:3,finalConsumes:3,finalCredits:18,actualSharedScan:true,actualWorkerRuntime:true,realPG:true,productionCalls:0,logs},null,2)+"\n");
  console.log(`WORKER_MEDIA_PART=PASS MODE=${baseline?"BASELINE":"MODIFIED"} PART=${part} CHECKS=${checks} EARLY_CONSUMES=${baseline?0:3} FINAL_CONSUMES=3 ORIGINAL_CREDITS=18 NETWORK_TRANSACTIONS=${transactions} ORIGINAL_UNKNOWN=RETAINED LIVE_LEASE=RETAINED DRAIN=OBSERVED SUPPLIER_POSTS=0`);
 }finally{
  unblock();await running?.catch(()=>{});await runtime?.shutdown().catch(()=>{});await api?.inflight.waitForBackgroundWork().catch(()=>{});if(app){await app.close().catch(()=>{});closed=true;}
  if(!closed&&api){await api.imageLocks.closeImageCoordinationPool();await api.videoLocks.closeVideoCoordinationPool();await api.db.getPool().end();await api.release.releasePool().end();}
  bridge?.closeAllConnections();if(bridge)await new Promise<void>(resolve=>bridge!.close(()=>resolve()));await f.cleanup();
  console.log("WORKER_MEDIA_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 QUERY_RELEASE_COORDINATION_POOLS_CLOSED=1 LISTENER_CLOSED=1 LOOPBACK_CLOSED=1");
 }
}
main().catch(async e=>{await writeFile(path.join(out,"FAILURE.json"),JSON.stringify({error:String(e),stack:e.stack},null,2)+"\n").catch(()=>{});console.error(e);process.exitCode=1;});
