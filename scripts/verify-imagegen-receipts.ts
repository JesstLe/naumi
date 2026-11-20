import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {imagegenRequestSchema} from "../src/lib/imagegen/schema";
import {planImagegen} from "../src/lib/imagegen/plan";
import {getImagegenResult} from "../src/lib/imagegen/dispatch";
import {planImagegenBatch,submitImagegenBatch,runImagegenBatchTick,readImagegenBatch} from "../src/lib/imagegen/batch";

async function main(){
 let invalidOutput=false;let digest="",calls=0;const opaque=await sharp({create:{width:512,height:512,channels:4,background:"#4488cc"}}).png().toBuffer();const png=await sharp({create:{width:512,height:512,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:256,height:256,channels:4,background:"#4488cc"}}).png().toBuffer(),left:128,top:128}]).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{const parts:Buffer[]=[];for await(const p of req)parts.push(Buffer.from(p));let body:any={};if(parts.length){const raw=Buffer.concat(parts);if(String(req.headers['content-type']).includes('multipart/form-data')){const form=await new Request('http://fixture',{method:'POST',headers:{'content-type':String(req.headers['content-type'])},body:raw}).formData();body=Object.fromEntries([...form].filter(([,v])=>typeof v==='string'));}else body=JSON.parse(raw.toString());}res.setHeader("content-type","application/json");if(req.url?.startsWith("/internal/config")){if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));if(req.url.endsWith("activate")){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}return res.end(JSON.stringify({digest}));}if((req.url?.endsWith("/images/generations")||req.url?.endsWith("/images/edits"))){calls++;return res.end(JSON.stringify({data:[{b64_json:(invalidOutput?opaque:png).toString("base64")}]}));}res.statusCode=404;res.end("{}");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"receipt-fixture-router-only-123456789",MODEL_CONFIG_ENVELOPE_SECRET:"receipt-fixture-envelope-only-123456789",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:`${f.origin}/v1`,STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"naumi-imagegen-receipts-"))});
 f.config.upstreamModels[0].capabilities.imagegen={inputFidelity:{state:"supported",values:["high"],source:"fixture",checkedAt:"2026-10-13"}};f.config.upstreamModels[0].parameterMap.imagegen={inputFidelity:"input_fidelity",transparent:"background"};f.config.upstreamModels[0].capabilities.transparent=true;
 f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u-cut",model:"fixture-cutout",capabilities:{...f.config.upstreamModels[0].capabilities,transparent:true}});
 f.config.publicModels.push({...structuredClone(f.config.publicModels[0]),id:"image-cut",label:"fixture cutout",target:{type:"upstream",id:"u-cut"}});f.config.bindings["image.cutout"]="image-cut";
 f.config.pools.push({id:"pool",modality:"image",strategy:"priority",candidates:["u1"],rules:[]});f.config.publicModels.push({...structuredClone(f.config.publicModels[0]),id:"image-pool",label:"fixture pool",target:{type:"pool",id:"pool"}});
 const db=await import("../src/lib/db");
 try{
  await f.repo.current();const owner=`receipts-${randomUUID()}@example.test`;await db.getOrCreateUser(owner);
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"isolated receipt fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const req=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"商品图",modelId:"image-a",parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}}),plan=await planImagegen(req,owner);
  await assert.rejects(()=>planImagegen({...req,operationId:randomUUID(),modelId:"image-pool",parameters:{...req.parameters,inputFidelity:"high"}},owner),/Router/,"Unsupported Router wire fields must fail in read-only preview");
  await db.getPool().query(`CREATE FUNCTION fixture_claim_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='imagegen-${req.operationId}' AND NEW.lease_token IS NOT NULL THEN RAISE EXCEPTION 'fixture claim failure after durable receipt'; END IF; RETURN NEW; END$$; CREATE TRIGGER fixture_claim_failure BEFORE UPDATE ON app_image_jobs FOR EACH ROW EXECUTE FUNCTION fixture_claim_failure()`);
  const {POST}=await import("../src/app/api/imagegen/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
  const response=await POST(new Request("http://internal/api/imagegen",{method:"POST",headers:{"content-type":"application/json",origin:"http://internal",cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`},body:JSON.stringify({...req,confirmation:{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true}})}));
  const recovered=await response.json();
  assert.equal(response.status,200);assert.equal(recovered.jobId,`imagegen-${req.operationId}`,"claim failure after persistence returns the original durable receipt, not permission to submit again");assert.equal(recovered.operationId,req.operationId);assert.equal(recovered.status,"queued");assert.equal(calls,0);
  await db.getPool().query("DROP TRIGGER fixture_claim_failure ON app_image_jobs; DROP FUNCTION fixture_claim_failure()");let result;for(let n=0;n<300;n++){result=await getImagegenResult(req.operationId,owner);if(result?.status==="succeeded")break;await new Promise(r=>setTimeout(r,50));}assert.equal(result?.status,"succeeded",JSON.stringify(result));assert.equal(calls,1);assert.equal(result.chargedCredits,plan.totalCredits);assert.equal((await db.getPool().query("SELECT count(*)::int AS n FROM app_image_jobs WHERE kind='generate' AND email=$1",[owner])).rows[0].n,1);
  // Native background removal is one ordinary edited child, not a generate+cutout pipeline.
  const sourceId='source-'+randomUUID();await db.addArtworks(owner,[{id:sourceId,title:'Native removal source',category:'main',status:'completed',prompt:'',image:'data:image/png;base64,'+png.toString('base64'),gradient:'',width:512,height:512}]);
  const raw=imagegenRequestSchema.parse({...req,operationId:randomUUID(),mode:'batch',prompt:'抠图',inputs:[{artworkId:sourceId,role:'edit-target'}],batch:{items:[{key:'one',name:'产品',prompt:'抠图，保留主体，输出真实透明PNG'}],maxAttempts:3,concurrency:1,failFast:false}}),quoted=await planImagegenBatch(raw,owner);
  assert.equal(quoted.children![0].plan.steps.length,1);assert.equal(quoted.children![0].plan.steps[0].modelId,'image-a');assert.equal(quoted.children![0].plan.steps[0].operation,'edit');
  const confirmation={billingVersion:quoted.billingVersion,modelVersion:quoted.modelVersion,credits:quoted.totalCredits,confirmed:true};
  const batch=await submitImagegenBatch(raw,owner,confirmation);let output;for(let n=0;n<300;n++){await runImagegenBatchTick(batch.id);output=await readImagegenBatch(batch.id,owner);if(output?.status==='succeeded')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(output?.status,'succeeded',JSON.stringify(output));assert.equal(output.items[0].attempts,1);assert.equal(calls,2,'one ordinary generation and one native edit');assert.equal(output.items[0].result.artifacts.length,1);assert.equal(output.chargedCredits,quoted.totalCredits,'native edit charged exactly its single quote');assert.ok(output.items[0].result.artifacts[0].fullyTransparentPixels!>0);
  const beforeReplay=calls;const replay=await submitImagegenBatch(raw,owner,confirmation);assert.equal(replay.id,batch.id);for(let n=0;n<3;n++)await readImagegenBatch(batch.id,owner);assert.equal(calls,beforeReplay,'original receipt recovery never calls the supplier again');
  assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_billing_operations WHERE email=$1 AND feature='tool.cutout'",[owner])).rows[0].n,0,'new edits never create a legacy cutout billing operation');
  invalidOutput=true;
  const bad=imagegenRequestSchema.parse({...req,operationId:randomUUID(),mode:'edit',useCase:'product-mockup',prompt:'商品样机，抠图，输出透明PNG',inputs:[{artworkId:sourceId,role:'edit-target'}]}),badPlan=await planImagegen(bad,owner);
  const badResponse=await POST(new Request("http://internal/api/imagegen",{method:"POST",headers:{"content-type":"application/json",origin:"http://internal",cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`},body:JSON.stringify({...bad,confirmation:{billingVersion:badPlan.billingVersion,modelVersion:badPlan.modelVersion,credits:badPlan.totalCredits,confirmed:true}})}));assert.equal(badResponse.status,200);
  let rejected;for(let n=0;n<300;n++){rejected=await getImagegenResult(bad.operationId,owner);if(rejected?.status==='failed')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(rejected?.status,'failed',JSON.stringify(rejected));assert.ok(rejected.error?.message.includes('透明主体'));assert.equal(calls,3);assert.ok(rejected.artifacts.length>0,'accepted opaque result retained, never disguised as missing acceptance');assert.ok(rejected.artifacts.every(a=>!a.fullyTransparentPixels));
  for(let n=0;n<3;n++)await getImagegenResult(bad.operationId,owner);assert.equal(calls,3,'invalid accepted output is never automatically purchased again');
  console.log('PASS imagegen receipts: durable-parent claim failure recovery, native-transparent single edited child, original batch replay, one charge per task, no legacy cutout billing, opaque output rejected and original preserved; external calls=0');

 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
