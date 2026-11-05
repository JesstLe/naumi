/** R2 full-tree A/B: actual runtime/recovery/parent readers + isolated PG.
 * Only storage/SQL failures are injected. No supplier transport is executed. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import fs from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {Client} from "pg";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import type {GenParams} from "../src/lib/imagegen/generation-types";
import type {Postprocess} from "../src/lib/model-config/business-schema";

async function main(){
 const baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED";
 let checks=0,transport=0,db:any,closeLocks:(()=>Promise<void>)|undefined;
 const check=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
 const f=await createModelFixture((_req,res)=>{transport++;res.statusCode=500;res.end("supplier disabled");});
 const media=await mkdtemp(join(tmpdir(),"naumi-refactor-r2-"));
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-r2-20261024-local-only-token",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-r2-20261024-local-only-key",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media,OPENAI_API_KEY:"fixture-r2",OPENAI_BASE_URL:f.origin+"/v1"});
 const query=Client.prototype.query,write=fs.writeFile;
 let fault:{name:string;child:string;parent:string;fired:boolean}|undefined;
 const trip=(name:string)=>{if(fault?.name===name&&!fault.fired){fault.fired=true;throw Object.assign(Error("fixture delivery fault"),{code:"R2_INJECTED"});}};
 (Client.prototype as any).query=function(...args:any[]){
  const text=typeof args[0]==="string"?args[0]:args[0]?.text||"",values=args[1]||args[0]?.values||[];
  if(fault&&values[0]===fault.child){
   if(text.includes("UPDATE app_image_jobs SET snapshot=$2")){
    const snap=typeof values[1]==="string"?JSON.parse(values[1]):{};
    if(snap.status==="done")trip("final-receipt");else if(snap.images?.length)trip("image-checkpoint");
   }
   if(text.includes("SET billing_settled=true"))trip("settlement");
  }
  if(fault&&text.includes("INSERT INTO app_artworks")&&String(values[0]).startsWith(`art-${fault.child}-`))trip("artworks");
  if(fault&&values[0]===fault.parent&&text.includes("UPDATE app_image_jobs SET snapshot=snapshot ||"))trip("parent-receipt");
  return (query as any).apply(this,args);
 };
 fs.writeFile=(async(path:any,...args:any[])=>{if(fault&&String(path).includes(fault.child)&&/generations|image-delivery/.test(String(path)))trip("storage");return (write as any)(path,...args);}) as typeof fs.writeFile;
 try{
  f.config.upstreamModels[0].model="gpt-image-2";f.config.upstreamModels[0].capabilities.nativeResolutions=[];f.config.upstreamModels[0].parameterMap.resolution={};
  const version=await f.repo.current();db=await import("../src/lib/db");await db.ensureSchema();await (await import("../src/lib/saas/creation-schema")).ensureCreationSchema();
  closeLocks=(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool;
  const owner=`r2-${randomUUID()}@fixture.test`,other=`r2-other-${randomUUID()}@fixture.test`;await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");
  await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"r2 fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const {quoteForActor}=await import("../src/lib/billing/quotation");
  const originalQuote=await quoteForActor(owner,{feature:"canvas.image",modelId:"image-a",quantity:1,quality:"medium",resolution:"1K",ratio:"1:1"});
  const {imagegenRequestSchema}=await import("../src/lib/imagegen/schema");
  const {imagegenFingerprint}=await import("../src/lib/imagegen/plan");
  const {createImageJob}=await import("../src/lib/image-job-repository");
  const {runJob,JOBS}=await import("../src/lib/imagegen/generation-runtime");
  const {recoverStoredDelivery}=await import("../src/lib/imagegen/stored-delivery");
  const {getImagegenResult,readImagegenReceipt}=await import("../src/lib/imagegen/dispatch");
  const {runModelExecution}=await import("../src/lib/model-config/context");
  const {readCanvasOutput}=await import("../src/lib/canvas-image-input");
  const readManagedObject=async(url:string,_limit:number)=>({bytes:(await readCanvasOutput(url,"http://internal",owner)).buffer});
  const png=await sharp({create:{width:80,height:96,channels:4,background:"#63a871"}}).png().toBuffer();
  const url="data:image/png;base64,"+png.toString("base64"),hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
  async function seed(options:{post?:Postprocess;manual?:boolean;resolution?:string;target?:number;unknown?:boolean;noFrozen?:boolean}={}){
   const operation=randomUUID(),parent="imagegen-"+operation,child="job-"+randomUUID();
   const request=imagegenRequestSchema.parse({version:1,operationId:operation,entry:"canvas",mode:"generate",modelId:"image-a",prompt:"r2 original prompt",inputs:[],parameters:{quality:"medium",resolution:options.resolution||"1K",ratio:"1:1"},variants:1});
   const p:GenParams={prompt:"system fixture prompt",userPrompt:request.prompt,category:"main",ratio:"1:1",resolution:options.resolution||"1K",quality:"medium",count:1,transparent:false,ratiogen:false,email:owner,images:[],parentId:"",parentIds:[],templateId:"",templateImage:"",templatePrompt:"",origin:"canvas",entry:"imagegen",projectGroupId:"fixture-project",model:"image-a",style:"fixture-style",targetWidth:options.target||0,targetHeight:options.target||0,ratioContractVersion:2};
   let modelVersion=version.version,modelDigest=version.digest;
   if(options.post){
    const config=structuredClone(f.config);config.business={"canvas.image":{enabled:true,defaultModelId:"image-a",options:[{modelId:"image-a",enabled:true,sort:0,unit:"image",postprocess:options.post}]}};
    modelDigest=hash(Buffer.from(JSON.stringify(config)));
    modelVersion=Number((await db.getPool().query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,'fixture','immutable r2 post',$2::jsonb,$3) RETURNING version",[randomUUID(),JSON.stringify(config),modelDigest])).rows[0].version);
   }
   const frozen={modelVersion,modelDigest,billingVersion:originalQuote.configVersion,publicModelId:"image-a",feature:"canvas.image",modality:"image" as const,binding:"image.generate",target:{type:"upstream" as const,id:"u1"},credentialRef:f.config.providers[0].credentialRef};
   const quote=structuredClone(originalQuote);quote.modelVersion=modelVersion;
   if(options.manual){quote.tariff.pricing={mode:"api-cost-plus",factorBps:10000,estimateCnyMicros:"100000",authorizationCnyMicros:"1000000",creditsPerCnyMicros:"1000000",rounding:"ceil"};delete quote.imagePreset;}
   const plan={request,intent:{background:null,operation:"generate",conflicts:[],requirements:[]},fingerprint:imagegenFingerprint(request),modelVersion,billingVersion:quote.configVersion,steps:[{key:"generate",operation:"generate",modelId:"image-a",parameters:{},eligibleUpstreamIds:["u1"],credits:quote.requestedCredits,billingQuote:quote}],totalCredits:quote.requestedCredits,confirmationRequired:false,warnings:[]};
   const snapshot={status:"needs_attention",createdAt:Date.now(),paidOperationVersion:1,paidOperations:{[child]:{state:"done",model:"image-a",replayable:false,result:[{url,id:"original",gradient:"",prompt:"r2 user prompt",ratio:"5:6",createdAt:new Date().toISOString(),execution:{quality:"medium",platformFunded:true,upstream:"fixture",reason:"generated"}}]}},...(options.unknown?{deliveryComplete:false}:{} )};
   if(options.unknown)(snapshot.paidOperations as any).uncertain={state:"started",model:"image-a"};
   await createImageJob(child,owner,"generate",snapshot,{p,cost:quote.requestedCredits,...(!options.noFrozen?{modelExecutions:{image:frozen}}:{})},quote.requestedCredits,true,quote);
   await createImageJob(parent,owner,"imagegen",{status:"needs_attention",paidOperationVersion:1,fingerprint:plan.fingerprint,children:{generate:{state:"submitted",jobId:child}},result:{operationId:operation,jobId:parent,status:"needs_attention",stage:"saving",artifacts:[],chargedCredits:0}},{plan},0,false);
   const scope={frozen,connection:{providerId:"p1",wireModel:"gpt-image-2",protocol:"openai-images",baseUrl:f.origin+"/v1",apiKey:"fixture",timeoutMs:120000},capabilities:f.config.upstreamModels[0].capabilities,parameterMap:{},businessOption:options.post?{modelId:"image-a",enabled:true,sort:0,unit:"image" as const,postprocess:options.post}:undefined};
   return {operation,parent,child,p,scope,quote,snapshot};
  }
  const state=async(id:string)=>(await db.getPool().query("SELECT * FROM app_image_jobs WHERE id=$1",[id])).rows[0];
  const run=async(x:Awaited<ReturnType<typeof seed>>)=>{
   await db.getPool().query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"pending\"') WHERE id=$1",[x.child]);
   await runModelExecution(x.scope,()=>runJob(x.child,x.p,"fixture",{id:"image-a",label:"fixture",provider:"openai-images",supportsEdit:true},"","image-a",null,true,x.quote.requestedCredits));
  };
  const finishParent=async(x:Awaited<ReturnType<typeof seed>>)=>{
   const c=await state(x.child);
   await db.getPool().query("UPDATE app_image_jobs SET snapshot=jsonb_set(jsonb_set(snapshot,'{status}','\"pending\"'),'{children}',$2::jsonb) WHERE id=$1",[x.parent,JSON.stringify({generate:{state:"done",jobId:x.child,ids:c.snapshot.images.map((i:any)=>i.id)}})]);
   let receipt;for(let i=0;i<200;i++){receipt=await getImagegenResult(x.operation,owner);if(receipt&&["succeeded","partial","failed"].includes(receipt.status))return receipt;await new Promise(r=>setTimeout(r,25));}throw Error("fixture parent timed out");
  };
  let faults=0;
  for(const name of ["storage","image-checkpoint","artworks","settlement","final-receipt"]){
   const x=await seed();fault={name,child:x.child,parent:x.parent,fired:false};await run(x);check(fault.fired,true,name+" actually injected");fault=undefined;
   const after=await state(x.child);check(after.snapshot.status,"done",name+" local retry completes");check(after.billing_settled,true,name+" actual settlement");
   check(hash((await readManagedObject(after.snapshot.images[0].url,64*1024*1024)).bytes),hash(png),name+" original bytes");
   check((await db.getPool().query("SELECT count(*)::int n FROM app_ledger WHERE id=$1 AND kind='consume'",["led-image-"+x.child])).rows[0].n,1,name+" one consume");
   check(!!after.snapshot.paidOperations,!baseline,name+" raw checkpoint retained at final receipt");faults++;
  }
  const resized=await seed({post:{enabled:true,kind:"resize",processor:"sharp-lanczos3",width:64,height:64,failure:"hold"}});
  // Pretend a prior worker committed only the durable pixel stage.
  const {runPostprocess}=await import("../src/lib/media-postprocess");
  const stage=await runPostprocess({id:resized.child+":postprocess:0",parentId:resized.child,email:owner,modelVersion:resized.scope.frozen.modelVersion,bytes:png,policy:resized.scope.businessOption!.postprocess});
  const stageInput={id:resized.child+":postprocess:0",parentId:resized.child,email:owner,modelVersion:resized.scope.frozen.modelVersion,bytes:png,policy:resized.scope.businessOption!.postprocess};
  const legacyDigest=createHash("sha256").update(png).update(JSON.stringify(stageInput.policy)).digest("hex");
  await db.getPool().query("UPDATE app_media_postprocess SET digest=$2 WHERE operation_id=$1",[stageInput.id,legacyDigest]);
  const reordered={...stageInput,policy:Object.fromEntries(Object.entries(stageInput.policy).reverse()) as Postprocess};
  if(baseline){await assert.rejects(runPostprocess(reordered),/冻结配置/);checks++;}
  else{check((await runPostprocess(reordered)).url,stage.url,"JSONB key order resumes legacy stage");}
  const otherBytes=await sharp({create:{width:80,height:96,channels:4,background:"red"}}).png().toBuffer();
  for(const changed of [{...reordered,bytes:otherBytes},{...reordered,email:other},{...reordered,modelVersion:stageInput.modelVersion+1000},{...reordered,policy:{...reordered.policy,width:128}}]){await assert.rejects(runPostprocess(changed),/冻结配置/);checks++;}
  const attemptsBefore=(await db.getPool().query("SELECT attempts FROM app_media_postprocess WHERE operation_id=$1",[resized.child+":postprocess:0"])).rows[0].attempts;
  const restored=await recoverStoredDelivery(resized.parent,owner);check(restored.complete,true,"frozen resize complete");
  const restoredState=await state(resized.child);check(restoredState.snapshot.images[0].width,64,"frozen width");
  check(hash((await readManagedObject(stage.url,64*1024*1024)).bytes),hash((await readManagedObject(restoredState.snapshot.images[0].url,64*1024*1024)).bytes),"same stage bytes");
  check((await db.getPool().query("SELECT attempts FROM app_media_postprocess WHERE operation_id=$1",[resized.child+":postprocess:0"])).rows[0].attempts,attemptsBefore,"stage not executed twice");
  check((await db.getPool().query("SELECT digest FROM app_media_postprocess WHERE operation_id=$1",[stageInput.id])).rows[0].digest,legacyDigest,"historical stage evidence not rewritten");
  let incomplete=0;
  for(const failure of ["keep-base","hold"] as const){
   const x=await seed({post:{enabled:true,kind:"native",processor:"none",width:64,height:64,failure}});
   const result=await recoverStoredDelivery(x.parent,owner);check(result.complete,baseline,"post failure never means completed");
   check(hash((await readManagedObject((await state(x.child)).snapshot.images[0].url,64*1024*1024)).bytes),hash(png),failure+" retained base");
   const receipt=await readImagegenReceipt(x.operation,owner);check(receipt?.status,baseline?"succeeded":"partial",failure+" honest receipt");
   if(!baseline){check((await state(x.child)).snapshot.deliveryComplete,false,"processing marker");await recoverStoredDelivery(x.parent,owner);check((await readImagegenReceipt(x.operation,owner))?.status,"partial","repeat base is not final output");}
   incomplete++;
  }
  const kept=await seed({post:{enabled:true,kind:"native",processor:"none",width:64,height:64,failure:"keep-base"}});await run(kept);
  check((await finishParent(kept))?.status,baseline?"succeeded":"partial","normal kept-base shares recovery completion rule");
  if(!baseline){const {readGeneration}=await import("../src/lib/imagegen/generation-query");const poll=await readGeneration({active:false,jobId:kept.parent,actor:async()=>owner});check([poll.body.status,poll.body.operationStatus],["done","partial"],"legacy polling stops at honest partial result");}
  const partial=await seed({resolution:"2K"}),id=`art-${partial.child}-0`;
  await db.addArtworks(owner,[{id,title:"User edited title",prompt:"my prompt",category:"main",status:"completed",image:url,gradient:"",width:80,height:96,canvasX:413,canvasY:217}]);
  // Existing positions and labels are not overwritten by continuation.
  await db.getPool().query("UPDATE app_artworks SET canvas_x=413,canvas_y=217 WHERE id=$1",[id]);
  const derivative=await recoverStoredDelivery(partial.parent,owner);check(derivative.artworkIds,[id+"-delivery"],"deterministic derivative");
  const previous=(await db.listArtworksByIds(owner,[id]))[0];check([previous.title,previous.canvasX,previous.canvasY,previous.width],["User edited title",413,217,80],"existing user work immutable");
  check((await state(partial.child)).snapshot.images[0].height,2048,"local 2K");
  await recoverStoredDelivery(partial.parent,owner);check((await db.getPool().query("SELECT count(*)::int n FROM app_artworks WHERE id=ANY($1::text[])",[[id,id+"-delivery"]])).rows[0].n,2,"repeat no extra artifact");
  const finalFault=await seed();fault={name:"parent-receipt",child:finalFault.child,parent:finalFault.parent,fired:false};
  await assert.rejects(recoverStoredDelivery(finalFault.parent,owner));checks++;check(fault.fired,true,"parent receipt fault actually injected");fault=undefined;
  await recoverStoredDelivery(finalFault.parent,owner);check((await db.getPool().query("SELECT count(*)::int n FROM app_ledger WHERE id=$1 AND kind='consume'",["led-image-"+finalFault.child])).rows[0].n,1,"parent retry one consume");
  if(!baseline){
   const derivativeFault=await seed({resolution:"2K"}),oldId=`art-${derivativeFault.child}-0`;
   await db.addArtworks(owner,[{id:oldId,title:"keep old",prompt:"",category:"main",status:"completed",image:url,gradient:""}]);
   fault={name:"parent-receipt",child:derivativeFault.child,parent:derivativeFault.parent,fired:false};await assert.rejects(recoverStoredDelivery(derivativeFault.parent,owner));checks++;check(fault.fired,true,"derived receipt fault injected");fault=undefined;
   const recovered=await recoverStoredDelivery(derivativeFault.parent,owner);check(recovered.artworkIds,[oldId+"-delivery"],"final checkpoint preserves derivative identity");
   check((await state(derivativeFault.child)).snapshot.images[0].height,2048,"final checkpoint preserves derivative pixels");
  }
  const held=await seed({manual:true});await run(held);check((await state(held.child)).billing_settled,false,"actual manual settlement remains unconfirmed");
  const receipt=await finishParent(held);
  check(receipt?.status,"succeeded","manual billing never discards delivered image: "+JSON.stringify(receipt));check(receipt?.billingStatus,baseline?"confirmed":"unavailable","parent uses real settlement");
  const before=await state(held.parent);await readImagegenReceipt(held.operation,owner);check((await state(held.parent)).snapshot,before.snapshot,"billing projection is read-only");
  check((await db.getPool().query("SELECT state FROM app_billing_operations WHERE id=$1",[held.child])).rows[0].state,"manual","manual result exact");
  const unknown=await seed({unknown:true});await assert.rejects(recoverStoredDelivery(unknown.parent,owner));checks++;
  const wrong=await seed();await assert.rejects(recoverStoredDelivery(wrong.parent,other));checks++;
  const leased=await seed();await db.getPool().query("UPDATE app_image_jobs SET lease_token=$2,lease_until=now()+interval '1 hour' WHERE id=$1",[leased.child,randomUUID()]);await assert.rejects(recoverStoredDelivery(leased.parent,owner));checks++;
  const deleted=await seed();await db.addArtworks(owner,[{id:`art-${deleted.child}-0`,title:"deleted",prompt:"",category:"main",status:"completed",image:url,gradient:""}]);await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE id=$1",[`art-${deleted.child}-0`]);await assert.rejects(recoverStoredDelivery(deleted.parent,owner));checks++;
  check(transport,0,"no supplier HTTP");
  console.log(`IMAGE_DELIVERY_CONTINUATION=PASS mode=${mode} checks=${checks} SQL_STORAGE_FAULTS=${faults+1} POST_FAILURES=${incomplete} POST_COMPLETE=${baseline?"FALSE_POSITIVE":"PARTIAL"} RAW_CHECKPOINT=${baseline?"LOST":"RETAINED"} MANUAL_BILLING=${String(receipt.billingStatus).toUpperCase()} ORIGINAL_BYTES=EXACT STAGE_REPLAY=0 CONSUME_REPLAY=0 REAL_PG=1 SUPPLIER_HTTP=${transport}`);
 }finally{
  Client.prototype.query=query;fs.writeFile=write;
  await closeLocks?.();if(db)await db.getPool().end();await f.cleanup();
  assert.ok(media.startsWith(join(tmpdir(),"naumi-refactor-r2-")));await rm(media,{recursive:true,force:true});
  console.log("R2_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOCAL_HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1");
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
