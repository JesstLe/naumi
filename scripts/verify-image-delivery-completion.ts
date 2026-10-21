/** Real handlers + isolated PG + exactly one loopback image response. */
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {createServer} from "node:http";
import {mkdtemp,mkdir,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 const baseline=false; const deliveryBaseline=process.argv.includes("--delivery-baseline");
 const out=resolve("output/image-delivery-complete47-20261021/routes");await mkdir(out,{recursive:true});let calls=0;
 const large=process.env.DELIVERY_FIXTURE_PNG?await readFile(process.env.DELIVERY_FIXTURE_PNG):await sharp(randomBytes(2304*2048*3),{raw:{width:2304,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer();
 const tiny=await sharp({create:{width:80,height:96,channels:3,background:"#63a871"}}).png().toBuffer();
 assert.ok(large.length>12*1024*1024);
 const f=await createModelFixture(async(req,res)=>{
  for await(const _ of req){};res.setHeader("content-type","application/json");
  if(req.url?.includes("/images/")){calls++;return res.end(JSON.stringify({data:[{b64_json:large.toString("base64")}]}));}
  res.statusCode=404;res.end("{}");
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-delivery-long-token",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-delivery-long-envelope-key",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"delivery-recovery-")),VIDEO_WORKER_SECRET:"fixture-worker-secret-delivery-recovery-only"});
 f.config.upstreamModels[0].model="gpt-image-2";f.config.upstreamModels[0].parameterMap.resolution={};f.config.upstreamModels[0].capabilities.nativeResolutions=[];
 await f.repo.current();
 const db=await import("../src/lib/db"),gen=await import("../src/app/api/generate-image/route"),imagegen=await import("../src/app/api/imagegen/route"),plans=await import("../src/app/api/imagegen/plan/route"),recover=baseline?{POST:async()=>Response.json({}, {status:404})}:await import("../src/app/api/imagegen/recover-delivery/route");
 let origin="";const app=createServer(async(req,res)=>{
  try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(","):v);
   const request=new Request(new URL(req.url!,origin),{method:req.method,headers,...(req.method==="POST"?{body:Buffer.concat(chunks)}:{})});
   const handler=req.url?.startsWith("/api/imagegen/recover-delivery")?recover.POST:req.url?.startsWith("/api/imagegen/plan")?plans.POST:req.url?.startsWith("/api/generate-image")?(req.method==="POST"?gen.POST:gen.GET):(req.method==="POST"?imagegen.POST:imagegen.GET);
   const response=await handler(request);res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
 });
 await new Promise<void>(r=>app.listen(0,"127.0.0.1",r));origin=`http://127.0.0.1:${(app.address() as {port:number}).port}`;process.env.INTERNAL_APP_ORIGIN=origin;
 const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");const owner=`delivery-${randomUUID()}@example.test`,other=`other-${randomUUID()}@example.test`;let checks=0;const check=(x:unknown)=>{assert.ok(x);checks++;};
 const json=async(path:string,body?:unknown,actor=owner,expected=200)=>{const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",headers:{origin,cookie:`${USER_COOKIE}=${signUserSession(actor,Date.now())}`,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;};
 const get=async(id:string)=>json("/api/imagegen?operationId="+id);
 const wait=async(id:string)=>{let result:any;for(let i=0;i<500;i++){result=await get(id);if(["succeeded","failed","needs_attention"].includes(result.status))return result;await new Promise(r=>setTimeout(r,50));}throw Error(JSON.stringify(result));};
 try{
  await db.getOrCreateUser(owner,"Fixture");await db.getOrCreateUser(other,"Other fixture");
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"isolated delivery",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const request={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"Large owned PNG fixture",inputs:[],parameters:{quality:"medium",resolution:"1K",ratio:"9:8"},variants:1};
  const plan=await json("/api/imagegen/plan",request);const accepted=await json("/api/imagegen",{...request,confirmation:{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true}});const result=await wait(request.operationId);
  if(baseline){
   check(result.status==="failed"&&result.artifacts.length===0&&result.chargedCredits===0&&result.error?.message==="对象超过大小限制");
   const billed=await db.getPool().query("SELECT c.snapshot->>'status' AS status,(SELECT sum(charged_credits)::int FROM app_billing_operations b WHERE b.id=c.id) AS charged FROM app_image_jobs p,jsonb_each(p.snapshot->'children') e JOIN app_image_jobs c ON c.id=e.value->>'jobId' WHERE p.id=$1",[accepted.jobId]);
   check(billed.rows[0].status==="done"&&billed.rows[0].charged>0&&calls===1);
   console.log("BASELINE_ROUTES=REPRODUCED LARGE_PNG_PARENT=FAILED CHILD=DONE PARENT_CHARGE=0 CHILD_CHARGE=POSITIVE LOOPBACK_POSTS=1 REAL_SUPPLIER_CALLS=0");return;
  }
  check(result.status==="succeeded"&&result.artifacts.length===1&&result.chargedCredits>0);check(calls===1);
  const {readManagedObject}=await import("../src/lib/storage");const saved=(await readManagedObject(result.artifacts[0].url,64*1024*1024)).bytes;
  check(createHash("sha256").update(saved).digest("hex")===createHash("sha256").update(large).digest("hex"));
  const rawParent=(await db.getPool().query("SELECT * FROM app_image_jobs WHERE id=$1",[accepted.jobId])).rows[0];const childId=(Object.values(rawParent.snapshot.children)[0] as {jobId:string}).jobId;
  const rawChild=(await db.getPool().query("SELECT * FROM app_image_jobs WHERE id=$1",[childId])).rows[0];
  async function seedParent(snapshot:any,payload:any){const id=randomUUID(),parent="imagegen-"+id;payload=structuredClone(payload);payload.plan.request.operationId=id;snapshot=structuredClone(snapshot);snapshot.result.operationId=id;snapshot.result.jobId=parent;await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,0,false)",[parent,owner,JSON.stringify(snapshot),JSON.stringify(payload)]);return id;}
  const old=structuredClone(rawParent.snapshot);old.status="error";old.result={...old.result,status:"failed",chargedCredits:0,artifacts:[],error:{code:"EXECUTION_FAILED",message:"对象超过大小限制"}};
  const oldId=await seedParent(old,rawParent.payload),beforeOld=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",["imagegen-"+oldId])).rows[0].snapshot;
  const oldRead=await get(oldId);check(oldRead.status==="succeeded"&&oldRead.chargedCredits===result.chargedCredits);check(oldRead.artifacts[0].width===2304);
  assert.deepEqual((await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",["imagegen-"+oldId])).rows[0].snapshot,beforeOld);checks++;
  // Force one unreadable image while retaining another and its actual child charge.
  const badId="bad-"+randomUUID();await db.addArtworks(owner,[{id:badId,title:"Missing fixture",category:"main",status:"completed",prompt:"",image:"/media/missing-fixture.png",gradient:""}]);
  const partial=structuredClone(rawParent.snapshot);partial.status="pending";partial.result={...partial.result,status:"pending",artifacts:[],chargedCredits:0};partial.children.generate.ids=[badId,result.artifacts[0].artworkId];
  const partialId=await seedParent(partial,rawParent.payload),partialResult=await wait(partialId);
  check(partialResult.status==="failed"&&partialResult.artifacts.length===1&&partialResult.chargedCredits===result.chargedCredits&&partialResult.billingStatus==="confirmed");
  const {createImageJob}=await import("../src/lib/image-job-repository");
  async function seedCheckpoint(format="png",state="done",reserve=false,resolution="1K"){
   const child="job-"+randomUUID(),operation=randomUUID(),parent="imagegen-"+operation,payload=structuredClone(rawChild.payload);
   payload.p={...payload.p,resolution,count:1};
   const snapshot={status:"needs_attention",paidOperationVersion:1,paidOperations:{[child]:{state,replayable:false,model:"gpt-image-2",...(state==="done"?{result:[{url:"data:image/png;base64,"+tiny.toString("base64"),execution:{quality:"medium",platformFunded:true}}]}:{})}}};
   if(reserve)await createImageJob(child,owner,"generate",snapshot,payload,payload.cost,true,payload.billingQuote);
   else await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered,billing_settled) VALUES($1,$2,'generate',$3::jsonb,$4::jsonb,0,false,true)",[child,owner,JSON.stringify(snapshot),JSON.stringify(payload)]);
   const snap=structuredClone(rawParent.snapshot);snap.status="needs_attention";snap.children={generate:{state:"submitted",jobId:child}};snap.result={...snap.result,status:"needs_attention",operationId:operation,jobId:parent,artifacts:[],chargedCredits:0,error:{code:"EXECUTION_FAILED",message:"结果保存未完成"}};
   const pay=structuredClone(rawParent.payload);pay.plan.request.operationId=operation;pay.plan.request.output.format=format;pay.plan.request.parameters.resolution=resolution;
   await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,0,false)",[parent,owner,JSON.stringify(snap),JSON.stringify(pay)]);return {operation,parent,child};
  }
  const {recoverStoredDelivery}=await import("../src/lib/imagegen/stored-delivery");
  const {readImagegenReceipt}=await import("../src/lib/imagegen/dispatch");
  const high=await seedCheckpoint("png","done",true,"2K");
  const original=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[high.child])).rows[0].snapshot;
  const reserved=(await db.getPool().query("SELECT reserved_credits FROM app_billing_operations WHERE id=$1",[high.child])).rows[0].reserved_credits;
  check(reserved>0);
  const untouched=await readImagegenReceipt(high.operation,owner);check(untouched?.recoveryAvailable===true);
  await recoverStoredDelivery(high.parent,owner);
  const first=await readImagegenReceipt(high.operation,owner);
  if(deliveryBaseline){
   check(first?.status==="needs_attention");
   const b=(await db.getPool().query("SELECT reserved_credits,charged_credits FROM app_billing_operations WHERE id=$1",[high.child])).rows[0];check(b.reserved_credits>0&&b.charged_credits===0);
   console.log("BASELINE=REPRODUCED RAW_2K=STUCK RESERVED=UNRELEASED SUPPLIER_POSTS=1");return;
  }
  check(first?.status==="succeeded"&&Math.max(first.artifacts[0].width,first.artifacts[0].height)===2048);
  await recoverStoredDelivery(high.parent,owner);
  const rows=(await db.getPool().query("SELECT snapshot,billing_settled FROM app_image_jobs WHERE id=$1",[high.child])).rows[0];check(rows.snapshot.status==="done"&&rows.billing_settled);assert.deepEqual(rows.snapshot.paidOperations,original.paidOperations);
  const billed=(await db.getPool().query("SELECT reserved_credits,charged_credits FROM app_billing_operations WHERE id=$1",[high.child])).rows[0];check(billed.reserved_credits===0&&billed.charged_credits===result.chargedCredits);
  const auto=await seedCheckpoint("png","done",true,"4K"),delivered=await get(auto.operation);check(delivered.status==="succeeded"&&Math.max(delivered.artifacts[0].width,delivered.artifacts[0].height)===4096);
  check((await get(auto.operation)).artifacts[0].artworkId===delivered.artifacts[0].artworkId);
  const prior=await seedCheckpoint("png","done",true,"2K"),originalId=`art-${prior.child}-0`;
  await db.addArtworks(owner,[{id:originalId,title:"Earlier partial recovery",category:"main",prompt:"",status:"completed",image:"data:image/png;base64,"+tiny.toString("base64"),gradient:"",width:80,height:96}]);
  await db.getPool().query("UPDATE app_image_jobs SET snapshot=snapshot || $2::jsonb WHERE id=$1",[prior.child,JSON.stringify({deliveryRecovery:{ids:[originalId],complete:false}})]);
  const resumed=await get(prior.operation);check(resumed.status==="succeeded"&&resumed.artifacts[0].artworkId===originalId+"-delivery"&&resumed.artifacts[0].height===2048);
  check((await db.listArtworksByIds(owner,[originalId]))[0].width===80);
  const unknown=await seedCheckpoint("png","started");await assert.rejects(recoverStoredDelivery(unknown.parent,owner));checks++;
  const wrongOwner=await seedCheckpoint();await assert.rejects(recoverStoredDelivery(wrongOwner.parent,other));checks++;
  const leased=await seedCheckpoint();await db.getPool().query("UPDATE app_image_jobs SET lease_token=$2,lease_until=now()+interval '1 hour' WHERE id=$1",[leased.child,randomUUID()]);await assert.rejects(recoverStoredDelivery(leased.parent,owner));checks++;
  const deleted=await seedCheckpoint();await db.addArtworks(owner,[{id:`art-${deleted.child}-0`,title:"Deleted",category:"main",status:"completed",prompt:"",image:"/media/deleted.png",gradient:""}]);await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE id=$1",[`art-${deleted.child}-0`]);await assert.rejects(recoverStoredDelivery(deleted.parent,owner));checks++;
  const raced=await seedCheckpoint("png","done",true);const races=await Promise.allSettled([recoverStoredDelivery(raced.parent,owner),recoverStoredDelivery(raced.parent,owner)]);check(races.some(r=>r.status==="fulfilled"));
  check((await db.getPool().query("SELECT count(*)::int n FROM app_artworks WHERE id=$1",[`art-${raced.child}-0`])).rows[0].n===1);
  const readback=await get(raced.operation),raw=(await readManagedObject(readback.artifacts[0].url,64*1024*1024)).bytes;check(Buffer.compare(raw,tiny)===0);
  const sweep=await seedCheckpoint("png","done",true);
  await db.getPool().query("UPDATE app_image_jobs SET snapshot=snapshot || '{\"deliveryAttempts\":3}'::jsonb WHERE id=$1",[sweep.child]);
  await db.getPool().query("UPDATE app_image_jobs SET updated_at=now()-interval '1 minute' WHERE id=$1",[sweep.parent]);
  const {recoverStoredDeliveries}=await import("../src/lib/imagegen/stored-delivery");check(await recoverStoredDeliveries()===1);check((await get(sweep.operation)).status==="succeeded");
  const {DurableImageJobs}=await import("../src/lib/durable-image-jobs");
  const durable=new DurableImageJobs<any>("imagegen"),patchId="patch-"+randomUUID();
  await durable.create(patchId,owner,{status:"pending"},{},0,false);
  const normalSet=durable.set.bind(durable);let transient=true;
  durable.set=async(id,value)=>{if(transient){transient=false;throw Error("synthetic write loss");}return normalSet(id,value)};
  let resolveDone!:()=>void;const patched=new Promise<void>(r=>resolveDone=r);
  await durable.kick(patchId,async()=>{await assert.rejects(durable.patch(patchId,{status:"pending"}));await durable.patch(patchId,{status:"done"});resolveDone();});
  await Promise.race([patched,new Promise((_,reject)=>setTimeout(()=>reject(Error("patch recovery timed out")),10000))]);
  check((await durable.get(patchId))?.status==="done");
  check(calls===1);
  console.log(`MODIFIED=PASS CHECKS=${checks} RAW_2K=2048 RAW_4K=4096 PARTIAL_RESUMED=YES PARENT_CHILD=DONE BILLING=ONCE UNKNOWN_POST=0 SUPPLIER_POSTS=${calls} REAL_SUPPLIER_CALLS=0`);
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
