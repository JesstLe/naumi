import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import {createModelFixture} from "./model-config-fixture";
import {imagegenRequestSchema} from "../src/lib/imagegen/schema";
import {parseImagegenJsonl} from "../src/lib/imagegen/jsonl";
import {imagegenFilename,streamImagegenZip} from "../src/lib/imagegen/zip";
import {planImagegenBatch,submitImagegenBatch,runImagegenBatchTick,readImagegenBatch,cancelImagegenBatch} from "../src/lib/imagegen/batch";

async function main(){
 assert.equal(parseImagegenJsonl('{"prompt":"第一格"}\n{"prompt":"第二格","name":"分镜2"}').length,2);
 for(const text of ['{"prompt":"x","url":"https://evil.example"}','{"prompt":"x","key":"same"}\n{"prompt":"y","key":"same"}',Array.from({length:101},()=>'{"prompt":"x"}').join('\n'),"x".repeat(262145)])assert.throws(()=>parseImagegenJsonl(text));
 assert.equal(parseImagegenJsonl(Array.from({length:100},()=>'{"prompt":"x"}').join('\n')).length,100);
 const zipChunks:Buffer[]=[];async function* originals(){yield {name:imagegenFilename("../CON",1,"png"),bytes:Buffer.from("original-bytes")};}
 for await(const part of streamImagegenZip(originals()))zipChunks.push(part);
 const pureZip=await JSZip.loadAsync(Buffer.concat(zipChunks));assert.equal(await Object.values(pureZip.files)[0].async("string"),"original-bytes");assert.ok(!Object.keys(pureZip.files)[0].includes("/"));
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:"#ff8833"}}).png().toBuffer();let digest="";const calls=new Map<string,number>();
 const f=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};res.setHeader("content-type","application/json");
  if(req.url?.startsWith("/internal/config")){if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));if(req.url.endsWith("activate")){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}return res.end(JSON.stringify({digest}));}
  if(req.url?.endsWith("/images/generations")){
   const key=["白底产品","背面草图","拒绝样本","未提交样本","取消A","取消B","重试样本","变体样本"].find(k=>String(body.prompt).includes(k))||"other";calls.set(key,(calls.get(key)||0)+1);
   if(key==="拒绝样本"||key==="重试样本"&&calls.get(key)===1){res.statusCode=400;return res.end(JSON.stringify({error:{message:"Fixture definite rejection"},billing_status:"not_charged"}));}
   return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
  }res.statusCode=404;res.end(JSON.stringify({error:"Unknown fixture endpoint"}));
 });
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;Object.assign(process.env,{NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-batch-router-token-independent-1234",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-batch-envelope-secret-independent-5678",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:`${f.origin}/v1`,OPENAI_IMAGE_QUALITY:"medium",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"naumi-imagegen-batch-"))});
 const db=await import("../src/lib/db");
 try{
  await f.repo.current();const owner=`batch-${randomUUID()}@example.test`;await db.getOrCreateUser(owner);
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"isolated batch fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"workbench",mode:"batch",modelId:"image-a",prompt:"批次",parameters:{quality:"medium",resolution:"1K",ratio:"1:1"},batch:{items:["白底产品","背面草图","拒绝样本","未提交样本"].map((prompt,i)=>({key:`item-${i}`,name:i?prompt:"../原图",prompt})),concurrency:1,maxAttempts:1,failFast:true}});
  const preview=await planImagegenBatch(request,owner),confirmation={billingVersion:preview.billingVersion,modelVersion:preview.modelVersion,credits:preview.totalCredits,confirmed:true};
  const created=await submitImagegenBatch(request,owner,confirmation),again=await submitImagegenBatch(request,owner);assert.deepEqual(again,created);assert.equal(calls.size,0,"Submission persists a queue, without running suppliers first");
  await assert.rejects(()=>submitImagegenBatch({...request,prompt:"different"},owner),/编号|请求/);
  const deadline=Date.now()+Math.max(200000,Number(process.env.NAUMI_VERIFY_TIMEOUT_MS)||0);let result;
  while(Date.now()<deadline){await Promise.all([runImagegenBatchTick(created.id),runImagegenBatchTick(created.id)]);result=await readImagegenBatch(created.id,owner);if(result&&!['running','cancelling'].includes(result.status))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(result?.status,"partial",JSON.stringify(result));assert.deepEqual(result.items.map(i=>i.result.status),["succeeded","succeeded","failed","cancelled"]);assert.equal(calls.get("白底产品"),1);assert.equal(calls.get("背面草图"),1);assert.equal(calls.get("拒绝样本"),1);assert.equal(calls.get("未提交样本")||0,0);
  assert.equal(result.chargedCredits,result.items.reduce((n,i)=>n+i.result.chargedCredits,0));assert.ok(result.chargedCredits>0);assert.equal(await readImagegenBatch(created.id,"other@example.test"),null);
  const {GET}=await import("../src/app/api/imagegen/batches/[id]/download/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
  const cookie=(email:string)=>`${USER_COOKIE}=${signUserSession(email,Date.now())}`;
  const zipResponse=await GET(new Request(`http://internal/api/imagegen/batches/${created.id}/download`,{headers:{cookie:cookie(owner)}}),{params:Promise.resolve({id:created.id})});assert.equal(zipResponse.status,200);
  const zip=await JSZip.loadAsync(await zipResponse.arrayBuffer());const images=Object.values(zip.files).filter(file=>file.name.endsWith(".png"));assert.equal(images.length,2);assert.ok(images.every(file=>!file.name.includes("/")));
  const {readCanvasImage}=await import("../src/lib/canvas-image-input"),works=await db.listArtworksByIds(owner,result.items[0].result.artifacts.map(a=>a.artworkId));
  assert.deepEqual(await images[0].async("nodebuffer"),(await readCanvasImage(works[0].image!,"http://internal",owner)).buffer,"Download contains full original bytes");assert.ok(zip.files["results.jsonl"]);
  const foreign=`other-${randomUUID()}@example.test`;await db.getOrCreateUser(foreign);const denied=await GET(new Request("http://internal",{headers:{cookie:cookie(foreign)}}),{params:Promise.resolve({id:created.id})});assert.equal(denied.status,404);
  const cancelReq=imagegenRequestSchema.parse({...request,operationId:randomUUID(),batch:{...request.batch!,items:[{key:"a",name:"a",prompt:"取消A"},{key:"b",name:"b",prompt:"取消B"}]}}),cancelPlan=await planImagegenBatch(cancelReq,owner);
  for(const sample of [{prompt:"重试样本",variants:1,attempts:2},{prompt:"变体样本",variants:4,attempts:1}]){
   const raw=imagegenRequestSchema.parse({...request,operationId:randomUUID(),variants:sample.variants,batch:{items:[{key:"sample",name:sample.prompt,prompt:sample.prompt}],concurrency:1,maxAttempts:sample.attempts,failFast:false}}),preview=await planImagegenBatch(raw,owner),accepted=await submitImagegenBatch(raw,owner,{billingVersion:preview.billingVersion,modelVersion:preview.modelVersion,credits:preview.totalCredits,confirmed:true});
   let sampleResult;for(let n=0;n<400;n++){await runImagegenBatchTick(accepted.id);sampleResult=await readImagegenBatch(accepted.id,owner);if(sampleResult&&!['running','cancelling'].includes(sampleResult.status))break;await new Promise(r=>setTimeout(r,50));}
   assert.equal(sampleResult?.status,"succeeded",JSON.stringify(sampleResult));assert.equal(sampleResult.items[0].attempts,sample.attempts);assert.equal(sampleResult.items[0].result.artifacts.length,sample.variants);assert.equal(calls.get(sample.prompt),sample.prompt==="重试样本"?2:4);assert.ok(sampleResult.chargedCredits>0);
  }
  const cancellable=await submitImagegenBatch(cancelReq,owner,{billingVersion:cancelPlan.billingVersion,modelVersion:cancelPlan.modelVersion,credits:cancelPlan.totalCredits,confirmed:true});
  const barrier=await f.sql.connect();await barrier.query("BEGIN");await barrier.query("SELECT id FROM app_imagegen_batches WHERE id=$1 FOR UPDATE",[cancellable.id]);const pid=(await barrier.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const cancelling=cancelImagegenBatch(cancellable.id,owner);let blocked=false;
  for(let i=0;i<100&&!blocked;i++){blocked=Number((await f.sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pg_blocking_pids(pid) @> ARRAY[$1::int]",[pid])).rows[0].n)>0;if(!blocked)await new Promise(r=>setTimeout(r,25));}
  assert.equal(blocked,true,"Cancellation is waiting on the exact parent row lock");const competing=runImagegenBatchTick(cancellable.id);await barrier.query("COMMIT");barrier.release();await Promise.all([cancelling,competing]);await runImagegenBatchTick(cancellable.id);
  assert.equal((await readImagegenBatch(cancellable.id,owner))?.status,"cancelled");assert.equal(calls.get("取消A")||0,0);assert.equal(calls.get("取消B")||0,0);await runImagegenBatchTick(cancellable.id);assert.equal(calls.get("取消A")||0,0);
  console.log("PASS imagegen batch: two ticks, stable children, partial/fail-fast billing, cancel row barrier, restart stop, private original ZIP64 and JSONL limits");
 }catch(error){console.error("Imagegen batch fixture assertion:",error);throw error;}finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
