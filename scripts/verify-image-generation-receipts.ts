/** Real isolated PG and loopback PNG supplier. Also runs against the pre-refactor source tree. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  let calls=0,digest="",db:any;
  const png=await sharp({create:{width:1024,height:1024,channels:4,background:{r:80,g:120,b:180,alpha:1}}}).png().toBuffer();
  const fixture=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));
    const raw=Buffer.concat(chunks),body=req.headers["content-type"]?.includes("json")&&raw.length?JSON.parse(raw.toString()):{};
    res.setHeader("content-type","application/json");
    if(req.url?.startsWith("/internal/config")){
      if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
      if(req.url.endsWith("activate")){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
      return res.end(JSON.stringify({digest}));
    }
    if(req.url?.endsWith("/images/generations")){calls++;return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}
    res.statusCode=404;res.end("{}");
  });
  const media=await mkdtemp(join(tmpdir(),"naumi-r1-receipts-"));
  process.env.PGOPTIONS=`-c search_path=${fixture.schemaName}`;
  Object.assign(process.env,{NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:fixture.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-only-independent-router-token-20261024",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-only-independent-envelope-20261024",MODEL_CONFIG_TRUSTED_ORIGINS:fixture.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:fixture.origin+"/v1",OPENAI_IMAGE_QUALITY:"medium",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media});
  let checks=0;const check=(actual:unknown,expected:unknown,message:string)=>{assert.deepEqual(actual,expected,message);checks++;};
  try{
    await fixture.repo.current();db=await import("../src/lib/db");
    const owner=`r1-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"R1 fixture");await db.getOrCreateUser("another@example.test","Other fixture");
    const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");
    await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:100,source:"admin",reason:"isolated R1 fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
    const {imagegenRequestSchema}=await import("../src/lib/imagegen/schema"),{planImagegen}=await import("../src/lib/imagegen/plan"),core=await import("../src/lib/imagegen/generation-core"),{billingRequestIdentity}=await import("../src/lib/billing/synchronous"),{compileImagegenPrompt}=await import("../src/lib/imagegen/prompt");
    const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"draw a blue bottle",modelId:"image-a",parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}});
    const original=await planImagegen(request,owner);
    const variant=()=>({...original,request:{...original.request,operationId:randomUUID()}});
    const invoke=async(plan:typeof original,actor=owner)=>{
      const value:any=await core.submitGenerationCore(plan,"generate",actor);
      return value instanceof Response?{status:value.status,body:await value.json()}:value;
    };
    const seed=async(plan:typeof original,response:unknown,email=owner)=>{
      const r=plan.request,step=plan.steps[0],form=new FormData();
      for(const [key,value]of Object.entries({prompt:compileImagegenPrompt(r,core.imagegenStepIntent(plan,"generate"),plan.skillInstructions),userPrompt:r.prompt,model:step.modelId,origin:"canvas",entry:"imagegen",quality:"medium",resolution:"1K",ratio:"1:1",count:"1",transparent:"0",parentId:"",parentIds:"[]"}))if(value!==undefined)form.set(key,value);
      const identity=await billingRequestIdentity(new Request("http://internal/api/generate-image",{method:"POST",headers:{"x-naumi-feature-model":step.modelId||""},body:form}));
      const id=`intent-${core.imagegenStepId(r.operationId,"generate")}`;
      await db.getPool().query("INSERT INTO app_billing_intents(id,email,path,request_fingerprint,response,response_status) VALUES($1,$2,'/api/generate-image',$3,$4::jsonb,200)",[id,email,identity.hash,response===null?null:JSON.stringify(response)]);
      return id;
    };
    const before=(await db.getPool().query("SELECT count(*)::int n FROM app_image_jobs")).rows[0].n;
    const saved=variant();await seed(saved,{jobId:"original-pre-refactor-job"});
    check(await invoke(saved),{status:200,body:{jobId:"original-pre-refactor-job"}},"old multipart receipt survives typed execution");
    check(calls,0,"old receipt does not contact supplier");
    const pending=variant();await seed(pending,null);const pendingResult=await invoke(pending);
    check([pendingResult.status,pendingResult.body.code],[409,"OPERATION_PENDING"],"old unknown receipt remains pending");
    check(calls,0,"unknown never reposts");
    const conflict=await invoke({...saved,request:{...saved.request,prompt:"different input"}});
    check([conflict.status,conflict.body.code],[409,"OPERATION_CONFLICT"],"same ID changed input rejected");
    const other=await invoke(saved,"another@example.test");check([other.status,other.body.code],[409,"OPERATION_CONFLICT"],"receipt owner preserved");
    check((await invoke(variant(),"missing@example.test")).status,401,"missing actor remains denied");
    await db.getPool().query("UPDATE app_users SET account_expires_at=now()-interval '1 minute' WHERE email=$1",[owner]);
    check((await invoke(variant())).status,401,"expired actor remains denied");
    await db.getPool().query("UPDATE app_users SET account_expires_at=NULL,banned=true WHERE email=$1",[owner]);
    check((await invoke(variant())).status,401,"banned actor remains denied");
    await db.getPool().query("UPDATE app_users SET banned=false WHERE email=$1",[owner]);
    check((await db.getPool().query("SELECT count(*)::int n FROM app_image_jobs")).rows[0].n,before,"receipt paths create zero new jobs");
    const {getModelAdministration}=await import("../src/lib/model-config/server"),admin=await getModelAdministration();
    const oldBilling=await admin.billing.current(),newConfig=structuredClone(oldBilling.config);
    newConfig.features["canvas.image"].pricing={mode:"fixed",credits:42};newConfig.features["canvas.image"].rules=[];
    const newBilling=await admin.billing.publish({id:randomUUID(),expectedVersion:oldBilling.version,config:newConfig,actor:"fixture",reason:"R1 old quote after current price change"});
    const models=await fixture.repo.current(),modelConfig=structuredClone(models.config);modelConfig.publicModels[0].label="Changed current label";
    const draft=await fixture.repo.draft("fixture"),savedDraft=await fixture.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:modelConfig,actor:"fixture"});
    const publication=await fixture.repo.stage({id:randomUUID(),draftId:savedDraft.id,expectedRevision:savedDraft.revision,expectedVersion:models.version,actor:"fixture",reason:"R1 old model version"});
    const published=await fixture.repo.markApplied(publication.id,publication.digest);
    check(newBilling.version>original.billingVersion,true,"real billing version changed");
    check(published.version>original.modelVersion,true,"real model version changed");
    const live=variant(),results=await Promise.all([invoke(live),invoke(live)]),winner=results.find(r=>r.status===200);
    assert.ok(winner?.body.jobId);checks++;
    check(results.every(r=>r.status===200&&r.body.jobId===winner.body.jobId||r.status===409&&r.body.code==="OPERATION_PENDING"),true,"concurrent claims converge");
    let row:any;
    for(let i=0;i<600;i++){
      row=(await db.getPool().query("SELECT snapshot,payload,billing_settled FROM app_image_jobs WHERE id=$1",[winner.body.jobId])).rows[0];
      if(row?.snapshot.status==="done"||row?.snapshot.status==="error")break;
      await new Promise(r=>setTimeout(r,50));
    }
    check(row?.snapshot.status,"done","real job completed");check(row.billing_settled,true,"real settlement completed");check(calls,1,"one supplier request");
    check(row.payload.billingQuote,live.steps[0].billingQuote,"complete frozen quote preserved");
    const ledgers=(await db.getPool().query("SELECT count(*)::int n,-sum(delta)::int charged FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0];
    check(ledgers,{n:1,charged:live.steps[0].billingQuote!.requestedCredits},"one original-price consume");
    check((await invoke(live)).body.jobId,winner.body.jobId,"accepted retry retains child");check(calls,1,"retry no duplicate supplier request");
    check((await db.getPool().query("SELECT count(*)::int n FROM app_gen_reservations WHERE email=$1",[owner])).rows[0].n,0,"reservation released by settlement");
    console.log(`IMAGE_GENERATION_RECEIPTS=PASS checks=${checks} OLD_MULTIPART_RECEIPT=1 UNKNOWN_REPOST=0 CONCURRENT_CHILDREN=1 FROZEN_QUOTE=FULL CURRENT_MODEL_PRICE_CHANGED=1 SUPPLIER_LOOPBACK=1 CONSUMES=1 REAL_PG=1 EXTERNAL=0`);
  }finally{
    if(db){const {closeImageCoordinationPool}=await import("../src/lib/imagegen/coordination-pool");await closeImageCoordinationPool();await db.getPool().end();}
    await fixture.cleanup();await rm(media,{recursive:true,force:true});
    console.log("R1_RECEIPT_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1 TEMP_MEDIA_REMOVED=1");
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
