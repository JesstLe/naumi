/** Real planning and legacy handlers; local registry only, no paid submission. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";

async function main(){
 let calls=0;const paths:string[]=[];
 const f=await createModelFixture((req,res)=>{paths.push(`${req.method} ${req.url}`);if(req.url?.includes("/images/")||req.url?.startsWith("/tasks"))calls++;res.writeHead(500);res.end("No supplier execution permitted");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-preflight-router-token-only-long-123456",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-preflight-envelope-only-long-123456",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture",OPENAI_BASE_URL:f.origin+"/v1"});
 f.config.providers[0].options={imageAdapter:"reverse-hub"};
 f.config.upstreamModels[0].model="jimeng/jimeng-image-5.0-pro";
 f.config.upstreamModels[0].parameterMap={};
 f.config.upstreamModels[0].capabilities.preserveIdentity=true;
 await f.repo.current();
 const db=await import("../src/lib/db"),plans=await import("../src/app/api/imagegen/plan/route"),legacy=await import("../src/app/api/generate-image/route");
 const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
 const owner=`preflight-${randomUUID()}@example.test`,headers={origin:"http://internal",cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"content-type":"application/json"};
 try{
  await db.getOrCreateUser(owner);
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");
  await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:100,source:"admin",reason:"isolated preflight",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const initialBilling=(await db.getPool().query("SELECT id,state,reserved_credits,charged_credits FROM app_billing_operations WHERE email=$1 ORDER BY id",[owner])).rows;
  const request={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"Keep full layout",inputs:[],parameters:{quality:"medium",resolution:"1K",ratio:"79:140"},variants:1};
  const plan=await plans.POST(new Request("http://internal/api/imagegen/plan",{method:"POST",headers,body:JSON.stringify(request)}));
  assert.equal(plan.status,422,await plan.clone().text());assert.equal((await plan.json()).code,"IMAGEGEN_RATIO_UNSUPPORTED");
  const valid=await plans.POST(new Request("http://internal/api/imagegen/plan",{method:"POST",headers,body:JSON.stringify({...request,parameters:{...request.parameters,ratio:"9:16"}})}));assert.equal(valid.status,200);
  const direct=await legacy.POST(new Request("http://internal/api/generate-image",{method:"POST",headers,body:JSON.stringify({prompt:"Full layout",model:"image-a",origin:"generate",count:1,quality:"medium",resolution:"1K",ratio:"79:140"})}));
  assert.equal(direct.status,422,await direct.clone().text());assert.equal((await direct.json()).accepted,false);
  const image=await sharp({create:{width:790,height:1400,channels:3,background:"#79a6af"}}).png().toBuffer();
  const form=new FormData();for(const [k,v] of Object.entries({prompt:"Keep original frame",model:"image-a",origin:"canvas",count:"1",quality:"medium",resolution:"1K",ratio:"auto"}))form.set(k,v);
  form.set("image",new File([new Uint8Array(image)],"ref.png",{type:"image/png"}));
  const auto=await legacy.POST(new Request("http://internal/api/generate-image",{method:"POST",headers:{origin:headers.origin,cookie:headers.cookie},body:form}));
  assert.equal(auto.status,422,await auto.clone().text());assert.equal((await auto.json()).code,"IMAGEGEN_RATIO_UNSUPPORTED");
  assert.equal(calls,0,JSON.stringify(paths));assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_image_jobs")).rows[0].n,0);
  assert.deepEqual((await db.getPool().query("SELECT id,state,reserved_credits,charged_credits FROM app_billing_operations WHERE email=$1 ORDER BY id",[owner])).rows,initialBilling);
  console.log("DELIVERY_PREFLIGHT=PASS PLAN_UNSUPPORTED=422 LEGACY_UNSUPPORTED=422 LEGACY_AUTO=422 NATIVE_RATIO=200 JOBS=0 BILLING=0 SUPPLIER_CALLS=0");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
