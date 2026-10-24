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
 const baseline=process.argv.includes("--baseline");
 const out=resolve("output/image-delivery-recovery-20261020/routes");await mkdir(out,{recursive:true});let calls=0;
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
  const stored=await seedCheckpoint();const before=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[stored.child])).rows[0].snapshot;
  check((await (await import("../src/lib/imagegen/dispatch")).readImagegenReceipt(stored.operation,owner))?.recoveryAvailable===true);
  await json("/api/imagegen/recover-delivery",{operationId:stored.operation},other,409);
  await json("/api/imagegen/recover-delivery",{operationId:stored.operation});await json("/api/imagegen/recover-delivery",{operationId:stored.operation});
  const restored=await get(stored.operation);check(restored.status==="succeeded"&&restored.artifacts.length===1&&restored.chargedCredits===0);
  const after=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[stored.child])).rows[0].snapshot;assert.deepEqual(after.paidOperations,before.paidOperations);check(after.status==="done");
  const bytes=(await readManagedObject(restored.artifacts[0].url,64*1024*1024)).bytes;check(Buffer.compare(bytes,tiny)===0);
  const webp=await seedCheckpoint("webp");await json("/api/imagegen/recover-delivery",{operationId:webp.operation});const webpResult=await get(webp.operation);check(webpResult.status==="partial"&&webpResult.artifacts.length===1&&webpResult.artifacts[0].mime==="image/png");
  const unknown=await seedCheckpoint("png","started");check(!(await get(unknown.operation)).recoveryAvailable);await json("/api/imagegen/recover-delivery",{operationId:unknown.operation},owner,409);
  const future=await seedCheckpoint("png","done",true);const billBefore=(await db.getPool().query("SELECT * FROM app_billing_operations WHERE id=$1",[future.child])).rows[0];check(billBefore.reserved_credits>0);
  await json("/api/imagegen/recover-delivery",{operationId:future.operation});await json("/api/imagegen/recover-delivery",{operationId:future.operation});
  const billAfter=(await db.getPool().query("SELECT * FROM app_billing_operations WHERE id=$1",[future.child])).rows[0];check(billAfter.charged_credits===result.chargedCredits&&billAfter.reserved_credits===0);check((await get(future.operation)).chargedCredits===billAfter.charged_credits);
  const review=await seedCheckpoint("png","started",false);await db.getPool().query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"pending\"'::jsonb) WHERE id=ANY($1)",[[review.parent,review.child]]);
  const {supplierLedger}=await import("../src/lib/supplier-cost/runtime");const ledger=supplierLedger();const account="fixture-hub-review-"+randomUUID();await ledger.account({id:account,providerId:"fixture-hub",protocol:"openai-images",baseUrl:f.origin,credentialRef:undefined});
  const call=await ledger.begin({operationId:review.child,userEmail:owner,feature:"canvas.image",phase:"generation",attemptId:randomUUID(),accountId:account,providerId:"fixture-hub",model:"jimeng/jimeng-image-5.0-pro"});await ledger.apply(call.id,{state:"reconciling",status:"pending",source:"reverse-hub-task-query",taskId:randomUUID(),evidence:{state:"reconciling"}});
  const reviewBefore=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[review.parent])).rows[0].snapshot;
  for(let n=0;n<3;n++){check((await get(review.operation)).status==="failed");const direct=await json("/api/generate-image?job="+review.child);check(direct.status==="error");}
  assert.deepEqual((await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[review.parent])).rows[0].snapshot,reviewBefore);checks++;
  const {ImageOperationReview}=await import("../src/lib/image-gateway"),{DurableImageJobs}=await import("../src/lib/durable-image-jobs");await new DurableImageJobs<any>("generate").handlePending(review.child,new ImageOperationReview(review.child,"reconciling"));
  check((await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[review.child])).rows[0].snapshot.status==="error");
  check(calls===1);
  const {recoverStoredDelivery}=await import("../src/lib/imagegen/stored-delivery");
  const guarded=await seedCheckpoint();
  const frozen=structuredClone(rawChild.payload.modelExecutions.image),policyConfig=structuredClone(f.config);
  policyConfig.business={"canvas.image":{enabled:true,defaultModelId:"image-a",options:[{modelId:"image-a",enabled:true,sort:0,unit:"image",postprocess:{enabled:true,kind:"resize",processor:"sharp-lanczos3",width:64,height:64,failure:"hold"}}]}};
  const digest=createHash("sha256").update(JSON.stringify(policyConfig)).digest("hex");
  const version=(await db.getPool().query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,'fixture','frozen recovery policy',$2::jsonb,$3) RETURNING version",[randomUUID(),JSON.stringify(policyConfig),digest])).rows[0].version;
  frozen.modelVersion=Number(version);frozen.modelDigest=digest;frozen.feature="canvas.image";
  await db.getPool().query("UPDATE app_image_jobs SET payload=jsonb_set(payload,'{modelExecutions,image}',$2::jsonb) WHERE id=$1",[guarded.child,JSON.stringify(frozen)]);
  await recoverStoredDelivery(guarded.parent,owner);check((await get(guarded.operation)).status==="succeeded");
  const missingVersion=await seedCheckpoint();frozen.modelVersion=9999999;
  await db.getPool().query("UPDATE app_image_jobs SET payload=jsonb_set(payload,'{modelExecutions,image}',$2::jsonb) WHERE id=$1",[missingVersion.child,JSON.stringify(frozen)]);
  await recoverStoredDelivery(missingVersion.parent,owner);check((await get(missingVersion.operation)).status==="partial");
  const leased=await seedCheckpoint();await db.getPool().query("UPDATE app_image_jobs SET lease_token=$2,lease_until=now()+interval '1 hour' WHERE id=$1",[leased.child,randomUUID()]);
  await assert.rejects(recoverStoredDelivery(leased.parent,owner));checks++;
  const deleted=await seedCheckpoint();await db.addArtworks(owner,[{id:`art-${deleted.child}-0`,title:"Deleted",category:"main",status:"completed",prompt:"",image:"/media/deleted.png",gradient:""}]);await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE id=$1",[`art-${deleted.child}-0`]);
  await assert.rejects(recoverStoredDelivery(deleted.parent,owner));checks++;
  const raced=await seedCheckpoint();const races=await Promise.allSettled([recoverStoredDelivery(raced.parent,owner),recoverStoredDelivery(raced.parent,owner)]);
  check(races.some(r=>r.status==="fulfilled"));check((await db.getPool().query("SELECT count(*)::int n FROM app_artworks WHERE id=$1",[`art-${raced.child}-0`])).rows[0].n===1);
  const unknownUrl=await seedCheckpoint();await db.getPool().query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{paidOperations}', $2::jsonb) WHERE id=$1",[unknownUrl.child,JSON.stringify({[unknownUrl.child]:{state:"done",result:[{url:"https://untrusted.invalid/secret"}]}})]);check(!(await get(unknownUrl.operation)).recoveryAvailable);
  await assert.rejects(recoverStoredDelivery(unknownUrl.parent,owner));checks++;
  await writeFile(join(out,"RESULTS.json"),JSON.stringify({checks,largeBytes:large.length,hash:createHash("sha256").update(large).digest("hex"),loopbackSupplierPosts:calls,realSupplierCalls:0,historicalBillingUnchanged:true,recoveryOnce:true,hubReviewNoSupplierQuery:true},null,2));
  console.log(`DELIVERY_ROUTES=PASS CHECKS=${checks} LARGE_PNG=DELIVERED OLD_RECEIPT=READ_ONLY BILLING=INDEPENDENT RAW_CHECKPOINT=RECOVERED OWNER_GUARD=PASS UNKNOWN_REPLAY=0 FORMAT_PARTIAL=HONEST RECOVERY_CHARGE=ONCE HUB_REVIEW=PAUSED LOOPBACK_POSTS=${calls} REAL_SUPPLIER_CALLS=0`);
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
