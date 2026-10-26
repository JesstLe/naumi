/** R5A full-checkout A/B: actual task runtimes, PG, HTTP adapters and saved
 * results. No provider replay. A loopback server exposes the real old handlers;
 * modern recovery must finish without any re-entry HTTP request. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool} from "pg";
import sharp from "sharp";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/fixture/);
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part"),out=path.resolve(process.env.WORKER_RECOVERY_EVIDENCE||"output/refactor-r5a-20261026");await mkdir(out,{recursive:true});
 if(!part){let checks=0;for(const p of ["recovery","unreachable","tick","frozen","release"]){
  const cmd=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-worker-recovery-boundary-pg.ts"),"--source-root",root,"--part",p,...(baseline?["--baseline"]:[])];
  const cp=spawn(process.execPath,cmd,{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});let literal="";cp.stdout.on("data",b=>literal+=b);cp.stderr.on("data",b=>literal+=b);const code=await new Promise<number|null>((resolve,reject)=>{cp.once("error",reject);cp.once("close",resolve);});await writeFile(path.join(out,`PG_${mode}_${p}.log`),literal+`\nEXIT=${code}\n`);process.stdout.write(literal);assert.equal(code,0,p);checks+=Number(literal.match(/CHECKS=(\d+)/)?.[1]||0);
 }console.log(`WORKER_RECOVERY_BOUNDARY_PG=PASS mode=${mode} parts=5 checks=${checks} SOURCE=FULL_CHECKOUT RUNTIMES=ACTUAL HANDLERS=ACTUAL PG=ACTUAL FOUR_KINDS=1 RECOVERY_HTTP=${baseline?"REQUIRED":"ZERO"} FROZEN_SCOPE=ORIGINAL FROZEN_PRICE=6 CURRENT_PRICE=17 CONSUME=ONCE LIVE_LEASE=RETAINED UNKNOWN=NO_REPLAY RELEASE_DRAIN=OBSERVED EXTERNAL=0`);return;}
 const nextOrigin=arg("--next-origin"),owned=!nextOrigin,load=(f:string)=>import(pathToFileURL(path.join(root,f)).href),schema=arg("--next-schema")||"worker_recovery_"+randomUUID().replaceAll("-","");assert.match(schema,/^worker_recovery_[a-f0-9]+$/);
 const admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});if(owned)await admin.query(`CREATE SCHEMA ${schema}`);
 const media=arg("--next-media")||await mkdtemp(path.join(out,`media-${mode.toLowerCase()}-`));
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:"worker-recovery-fixture-01234567890123456789",NAUMI_MULTI_USER:"1",STORAGE_DRIVER:"local",MEDIA_DIR:media,MEDIA_PRIVATE:"0",NAUMI_ROUTER_MANAGEMENT_URL:"",NAUMI_ROUTER_MANAGEMENT_TOKEN:"",OPENAI_API_KEY:"fixture-no-provider-calls",OPENAI_IMAGE_MODEL:"gpt-image-2",OPENAI_IMAGE_MODELS:"gpt-image-2",NEW_API_IMAGE_BASE_URL:"",NEW_API_IMAGE_API_KEY:"",VIDEO_API_KEY:"",VIDEO_PROVIDERS_JSON:"[]",NAUMI_RELEASE_RUNTIME:"0",NAUMI_INSTANCE_ID:"fixture-recovery-web",SOURCE_COMMIT:"a".repeat(40),VIDEO_WORKER_SECRET:"worker-recovery-loopback-secret-0123456789012345",NAUMI_VIDEO_WORKER:"0",MEDIA_WORKER_ORIGIN:""});
 delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 let checks=0,reentry=0,provider=0,external=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 let sql:Pool|undefined,release:typeof import("../src/lib/release-runtime/store")|undefined;const realFetch=globalThis.fetch;
 const routes:Record<string,{POST:(r:Request)=>Promise<Response>;GET?:(r:Request)=>Promise<Response>}>={};let origin="";
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url!,origin).pathname;if(!pathname.startsWith("/api/")){provider++;res.writeHead(500);res.end("Unexpected fixture provider request");return;}
  reentry++;if(part==="unreachable"){res.writeHead(503,{"content-type":"application/json"});res.end('{"error":"fixture Web unavailable"}');return;}
  const route=routes[pathname];assert.ok(route,pathname);const chunks:Buffer[]=[];for await(const b of req)chunks.push(Buffer.from(b));
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers as Record<string,string>,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  const response=await route.POST(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500,{"content-type":"application/json"});res.end(JSON.stringify({error:String(e)}));}});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));origin=nextOrigin||`http://127.0.0.1:${(server.address() as {port:number}).port}`;assert.equal(new URL(origin).hostname,"127.0.0.1");process.env.INTERNAL_APP_ORIGIN=origin;process.env.OPENAI_BASE_URL=origin+"/v1";
 globalThis.fetch=(async(input,init)=>{const u=new URL(input instanceof Request?input.url:String(input));if(u.origin!==origin){external++;throw Error("External request forbidden in Worker recovery fixture");}return realFetch(input,init);}) as typeof fetch;
 try{
  const db=await load("src/lib/db.ts");sql=db.getPool();await db.ensureSchema();
  const billing=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime(),cfg=await billing.config.current(),config=structuredClone(cfg.config);config.switches.metering="on";
  if(part==="frozen")for(const key of ["image.generate","image.suite","image.aplus"]){config.features[key].pricing={mode:"fixed",credits:6};config.features[key].rules=[];}
  const frozenConfig=await billing.config.publish({id:randomUUID(),actor:"fixture",reason:"Worker recovery billing",expectedVersion:cfg.version,config});
  const owner="worker-owner@fixture.test",other="worker-other@fixture.test";await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  await sql!.query("DELETE FROM app_ledger WHERE email=$1",[owner]);await sql!.query("DELETE FROM app_credit_batches WHERE email=$1",[owner]);await sql!.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[owner]);await db.addCreditBatch(owner,100,{source:"admin",reason:"Worker fixture"});
  const legacy=await load("src/lib/durable-image-jobs.ts"),Jobs=legacy.DurableImageJobs;
  if(!baseline){eq(Jobs,(await load("src/lib/image-jobs/runtime.ts")).DurableImageJobs);eq(legacy.imageWorkerAuthorized,(await load("src/lib/worker/authorization.ts")).imageWorkerAuthorized);eq(legacy.recoverDurableImageJobs,(await load("src/lib/worker/image-recovery.ts")).recoverDurableImageJobs);}
  if(part==="release"){
   Object.assign(process.env,{NAUMI_RELEASE_RUNTIME:"1",NAUMI_RELEASE_ADMISSION_START:"open"});release=await load("src/lib/release-runtime/store.ts");
   const store=new Jobs("imagegen"),id="release-held-"+randomUUID(),second="release-second-"+randomUUID();let entered!:()=>void,finish!:()=>void,calls=0;
   const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>finish=resolve);
   await store.create(id,owner,{status:"queued"},{},0,false);await store.kick(id,async()=>{calls++;entered();await gate;await store.patch(id,{status:"done"});});await started;
   try{
    const status=await release!.releaseStatus();eq(status.observations.trackedAcceptedWork,1);const activity=(await release!.releasePool().query("SELECT work_key,claim_token FROM app_release_activities WHERE state='active' AND work_scope='durable-image'")).rows[0],token=(await sql!.query("SELECT lease_token FROM app_image_jobs WHERE id=$1",[id])).rows[0].lease_token;eq(typeof token,"string");eq(activity.claim_token,token);eq(activity.work_key,"imagegen:"+id);
    await store.kick(id,async()=>{calls++;});eq(calls,1);await release!.controlAdmission({instanceId:status.identity.instanceId,bootId:status.identity.bootId,expectedRevision:status.admission.revision,operationId:randomUUID(),action:"drain"});
    await store.create(second,owner,{status:"queued"},{},0,false);await store.kick(second,async()=>{calls++;});eq((await sql!.query("SELECT lease_token FROM app_image_jobs WHERE id=$1",[second])).rows[0].lease_token,null);eq(calls,1);eq((await release!.releaseStatus()).observations.trackedAcceptedWork,1);
   }finally{finish();}
   const deadline=Date.now()+10000;let status;do{status=await release!.releaseStatus();if(status.observations.trackedAcceptedWork===0)break;await sleep(20);}while(Date.now()<deadline);eq(status.observations.trackedAcceptedWork,0);eq(status.observations.unknownLeases,0);eq((await sql!.query("SELECT snapshot->>'status' AS status,lease_token FROM app_image_jobs WHERE id=$1",[id])).rows[0],{status:"done",lease_token:null});
   console.log(`WORKER_RECOVERY_PART=release MODE=${mode} CHECKS=${checks} RESULT=PASS DETACHED_PROMISE=OBSERVED ORIGINAL_TOKEN=EXACT DRAIN_NEW_CLAIMS=0 ORIGINAL_CALLBACKS=1 UNKNOWN=0`);return;
  }
  const pixels=await sharp({create:{width:32,height:32,channels:3,background:"#aaccee"}}).png().toBuffer(),storage=await load("src/lib/storage.ts"),imageUrl=await storage.uploadImage(pixels,"image/png","fixture/result.png",undefined,owner),hash=createHash("sha256").update(pixels).digest("hex");
  const p={prompt:"fixture",userPrompt:"fixture",category:"main",ratio:"1:1",resolution:"1K",style:"",quality:"medium",count:1,transparent:false,ratiogen:false,email:owner,images:[],parentId:"",parentIds:[],templateId:"",templateImage:"",templatePrompt:"",origin:"generate",projectGroupId:"",model:"gpt-image-2",targetWidth:0,targetHeight:0};
  const ids={generate:"recover-gen-"+randomUUID(),suite:"recover-suite-"+randomUUID(),aplus:"recover-aplus-"+randomUUID(),imagegen:"imagegen-"+randomUUID()},now=Date.now();
  const genImage={id:`art-${ids.generate}-0`,url:imageUrl,gradient:"",prompt:"fixture",ratio:"1:1",createdAt:new Date(now).toISOString()};
  const frozenScope={actorEmail:owner,scopeKind:"personal",tenantId:null,parentContext:"tree:original-fixture"};
  const quote=part==="frozen"?(await load("src/lib/billing/quote.ts")).quote:undefined;
  const frozenQuotes=quote?Object.fromEntries(["generate","suite","aplus"].map(kind=>[kind,quote(frozenConfig,{feature:"image."+kind,quantity:kind==="generate"?1:2,quality:"medium",resolution:"1K",modelId:"gpt-image-2",metered:true,byok:false,paidFen:0,userGroup:"user"})])):undefined;
  await new Jobs("generate").create(ids.generate,owner,{status:"pending",images:[genImage],createdAt:now},{p,cost:6,byok:false,creationScope:frozenScope},6,true,frozenQuotes?.generate);
  const shots=(id:string)=>[{id:id+"-0",label:"Retained",role:"main",ratio:"1:1",prompt:"fixture",text:"",status:"done",url:imageUrl,gradient:""},{id:id+"-1",label:"Already failed",role:"sub",ratio:"1:1",prompt:"fixture",text:"",status:"error",gradient:""}];
  await new Jobs("suite").create(ids.suite,owner,{status:"pending",shots:shots(ids.suite),done:2,total:2,createdAt:now,owner,renderingFinished:true},{images:[{buf:pixels,type:"image/png"}],extra:"",platform:"taobao",email:owner,model:"gpt-image-2",cost:12,requested:[],textModel:"fixture-no-call"},12,true,frozenQuotes?.suite);
  await new Jobs("aplus").create(ids.aplus,owner,{status:"pending",stage:"generating",sources:[{id:ids.aplus+"-source",label:"Retained",status:"approved",version:1,url:imageUrl}],sourceInputs:[{buf:pixels,type:"image/png"}],sourceBuffers:[pixels],sourceHistory:[[]],shots:shots(ids.aplus),done:2,total:2,extra:"",platform:"amazon",lang:"zh",format:"1:1",modules:["main","sub"],email:owner,model:"gpt-image-2",textModel:"fixture-no-call",useDb:true,cost:12,generationStarted:true,reserved:true,parentId:"",parentIds:[],origin:"generate",createdAt:now,renderingFinished:true},{},12,true,frozenQuotes?.aplus);
  const retainedChild="retained-child-"+randomUUID(),artifact="retained-art-"+randomUUID();await new Jobs("generate").create(retainedChild,owner,{status:"done",images:[{...genImage,id:artifact}]},{p},0,false);await sql!.query("UPDATE app_image_jobs SET billing_settled=true WHERE id=$1",[retainedChild]);await db.addArtworks(owner,[{id:artifact,title:"Original",category:"main",prompt:"fixture",status:"completed",image:imageUrl,gradient:""}]);
  const op=ids.imagegen.slice(9),plan={request:{operationId:op,mode:"generate",entry:"generate",prompt:"fixture",inputs:[],variants:1,output:{format:"png"}},intent:{background:"opaque"},steps:[{key:"generate",operation:"generate",eligibleUpstreamIds:[],parameters:{},credits:0}],totalCredits:0};
  await new Jobs("imagegen").create(ids.imagegen,owner,{status:"pending",result:{operationId:op,jobId:ids.imagegen,status:"pending",stage:"generating",artifacts:[],chargedCredits:0},fingerprint:"fixture",children:{generate:{state:"done",jobId:retainedChild,ids:[artifact]}}},{plan},0,false);
  const live="live-"+randomUUID(),token=randomUUID();await new Jobs("generate").create(live,owner,{status:"pending",images:[genImage],createdAt:now},{p,cost:6},6,true);await sql!.query("UPDATE app_image_jobs SET lease_token=$2,lease_until=now()+interval '5 minutes' WHERE id=$1",[live,token]);
  const row=async(id:string)=>(await sql!.query("SELECT * FROM app_image_jobs WHERE id=$1",[id])).rows[0],liveBefore=await row(live);
  for(const pathname of ["generate-image","suite","aplus","imagegen"])routes["/api/"+pathname]=await load(`src/app/api/${pathname}/route.ts`);
  if(part==="frozen"){const changed=structuredClone(frozenConfig.config);for(const key of ["image.generate","image.suite","image.aplus"])changed.features[key].pricing={mode:"fixed",credits:17};await billing.config.publish({id:randomUUID(),actor:"fixture",reason:"Current price changed after acceptance",expectedVersion:frozenConfig.version,config:changed});}
  const invoke=()=>legacy.recoverDurableImageJobs();let processed:number;
  if(part==="tick"){
   const tick=nextOrigin?{POST:(r:Request)=>realFetch(r),GET:(r:Request)=>realFetch(r)}:await load("src/app/api/video/worker/tick/route.ts"),receipts=await load("src/lib/release-runtime/worker-tick-receipts.ts"),identity={tickId:randomUUID(),workerInstanceId:"fixture-worker",workerBootId:randomUUID(),workerCommit:process.env.SOURCE_COMMIT!,targetWebInstanceId:process.env.NAUMI_INSTANCE_ID!};
   const headers=Object.fromEntries(Object.entries(receipts.TICK_HEADERS).map(([key,value])=>[String(value),identity[key as keyof typeof identity]]));headers["x-video-worker-secret"]=process.env.VIDEO_WORKER_SECRET!;
   eq((await tick.POST(new Request(origin+"/api/video/worker/tick",{method:"POST"}))).status,401);
   const request=()=>new Request(origin+"/api/video/worker/tick",{method:"POST",headers});const responses=await Promise.all(Array.from({length:5},()=>tick.POST(request())));const values=await Promise.all(responses.map(r=>r.json()));eq(values.filter(v=>!v.duplicate).length,1);eq(values.filter(v=>v.duplicate).length,4);
   const original=values.find(v=>!v.duplicate);eq(original.receipt.phase,"completed");processed=original.receipt.result.generationProcessed;
   const q=await tick.GET(new Request(origin+"/api/video/worker/tick?tickId="+identity.tickId,{headers}));eq(q.status,200);eq((await q.json()).receipt.tickId,identity.tickId);
  }else{
   const creation=await load("src/lib/saas/creation-scope.ts");processed=await creation.withFrozenCreation({actorEmail:other,scopeKind:"tenant",tenantId:randomUUID()},invoke);
  }
  if(nextOrigin){const events=(await readFile(arg("--next-fetch-log")!,"utf8")).trim().split("\n").filter(Boolean).map(s=>JSON.parse(s));reentry=events.filter(e=>e.kind==="reentry").length;provider=events.filter(e=>e.kind==="unexpected").length;}
  eq(processed,baseline&&part==="unreachable"?0:4);eq(reentry,baseline?4:0);
  if(!baseline||part!=="unreachable"){
   for(const [kind,id]of Object.entries(ids)){const deadline=Date.now()+20000;let found;do{found=await row(id);if(found.snapshot.status==="done")break;assert.ok(found.snapshot.status==="pending",JSON.stringify({kind,snapshot:found.snapshot}));await sleep(30);}while(Date.now()<deadline);eq(found.snapshot.status,"done");}
   const billingRow=(await sql!.query("SELECT count(*)::int n,(-sum(delta))::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0];eq(billingRow,{n:3,amount:18});
   const parent=await row(ids.imagegen);eq(parent.snapshot.result.status,"succeeded");eq(parent.snapshot.result.artifacts[0].artworkId,artifact);eq(parent.snapshot.result.chargedCredits,0);
   for(const kind of ["generate","suite","aplus"] as const){const finished=await row(ids[kind]);eq(finished.billing_settled,true);eq((await sql!.query("SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1",[ids[kind]])).rows[0].n,0);}
   eq((await row(ids.generate)).payload.creationScope,frozenScope);
   if(part==="frozen")for(const kind of ["generate","suite","aplus"] as const){const finished=await row(ids[kind]);eq(finished.payload.billingQuote,frozenQuotes![kind]);const op=(await sql!.query("SELECT state,charged_credits,quote FROM app_billing_operations WHERE id=$1",[ids[kind]])).rows[0];eq(op.state,"settled");eq(Number(op.charged_credits),6);eq(op.quote.configVersion,frozenConfig.version);}
   const before=reentry;await invoke();await sleep(100);eq(reentry,before);eq((await sql!.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0].n,3);
  }else{for(const id of Object.values(ids))eq((await row(id)).snapshot.status,"pending");eq((await sql!.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0].n,0);}
  const liveAfter=await row(live);eq(liveAfter.lease_token,token);eq(liveAfter.snapshot,liveBefore.snapshot);eq(liveAfter.payload,liveBefore.payload);
  eq(createHash("sha256").update((await storage.readManagedObject(imageUrl,100000)).bytes).digest("hex"),hash);
  // The original paid-operation guard still retains an unknown checkpoint and
  // never invokes a second supplier callback, independent of entry transport.
  const unknown="unknown-"+randomUUID(),unknownJobs=new Jobs("generate");await unknownJobs.create(unknown,owner,{status:"pending",paidOperations:{[unknown]:{state:"started",model:"gpt-image-2",replayable:false}}},{},0,false);let replay=0;
  await assert.rejects(unknownJobs.paidOperation(unknown,"gpt-image-2",{id:unknown,managedGateway:false},async()=>{replay++;return []; }));checks++;eq(replay,0);eq((await row(unknown)).snapshot.paidOperations[unknown].state,"started");
  eq(provider,0);eq(external,0);
  console.log(`WORKER_RECOVERY_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS RECOVERY_HTTP=${reentry} KINDS=4 CONSUME=${baseline&&part==="unreachable"?0:3} SUPPLIER_POST=0 EXTERNAL=0`);
 }finally{
  globalThis.fetch=realFetch;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  await(await load("src/lib/imagegen/coordination-pool.ts")).closeImageCoordinationPool();if(sql)await sql.end();if(release)await release.releasePool().end();if(owned)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(owned)await rm(media,{recursive:true,force:true});console.log(`WORKER_RECOVERY_CLEANUP=${part} RANDOM_SCHEMA_${owned?"DROPPED":"OWNED_BY_NEXT_PARENT"}=1 POOLS_CLOSED=1 HTTP_CLOSED=1 TEMP_MEDIA_${owned?"REMOVED":"OWNED_BY_NEXT_PARENT"}=1`);
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
