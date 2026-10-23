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
 let digest="",calls=0;const png=await sharp({create:{width:512,height:512,channels:3,background:"#4488cc"}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{const parts:Buffer[]=[];for await(const p of req)parts.push(Buffer.from(p));const body=parts.length?JSON.parse(Buffer.concat(parts).toString()):{};res.setHeader("content-type","application/json");if(req.url?.startsWith("/internal/config")){if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));if(req.url.endsWith("activate")){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}return res.end(JSON.stringify({digest}));}if(req.url?.endsWith("/images/generations")){calls++;return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}res.statusCode=404;res.end("{}");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"receipt-fixture-router-only-123456789",MODEL_CONFIG_ENVELOPE_SECRET:"receipt-fixture-envelope-only-123456789",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:`${f.origin}/v1`,STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"naumi-imagegen-receipts-"))});
 f.config.upstreamModels[0].capabilities.imagegen={inputFidelity:{state:"supported",values:["high"],source:"fixture",checkedAt:"2026-10-13"}};f.config.upstreamModels[0].parameterMap.imagegen={inputFidelity:"input_fidelity"};
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
  // Actual generation succeeds, but its following cutout is rejected locally before a paid call.
  const {rateLimit}=await import("../src/lib/rate-limit");for(let n=0;n<60;n++)rateLimit("cutout:null",60,600000);
  const raw=imagegenRequestSchema.parse({...req,operationId:randomUUID(),mode:"batch",prompt:"批次",batch:{items:[{key:"one",name:"产品",prompt:"画一张透明底商品图"}],maxAttempts:3,concurrency:1,failFast:false}}),quoted=await planImagegenBatch(raw,owner);assert.equal(quoted.children![0].plan.steps.length,2);
  const batch=await submitImagegenBatch(raw,owner,{billingVersion:quoted.billingVersion,modelVersion:quoted.modelVersion,credits:quoted.totalCredits,confirmed:true});let output;for(let n=0;n<300;n++){await runImagegenBatchTick(batch.id);output=await readImagegenBatch(batch.id,owner);if(output?.status==="failed")break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(output?.status,"failed",JSON.stringify(output));assert.equal(output.items[0].attempts,1,"Never restart an item that has completed a paid step");assert.equal(calls,2,"Only one generation per accepted item");assert.equal(output.items[0].result.artifacts.length,1);assert.equal(output.chargedCredits,quoted.children![0].plan.steps[0].credits,"Keep the original generation charge in batch totals");assert.equal(output.items[0].result.error?.code,"PARTIAL_EXECUTION_REJECTED");
  console.log("PASS imagegen receipts: durable-parent claim failure/4xx recovery, one billed child, partial pipeline rejection retains original fees/output, Router rejection before charge; external calls=0");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
