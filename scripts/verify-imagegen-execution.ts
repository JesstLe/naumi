import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {imagegenRequestSchema} from "../src/lib/imagegen/schema";
import {planImagegen} from "../src/lib/imagegen/plan";
import {submitImagegen,getImagegenResult} from "../src/lib/imagegen/dispatch";

async function main(){
 let calls=0,digest="";const bodies:Record<string,unknown>[]=[];
 const raw=Buffer.alloc(1024*1024*4);for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4;raw[i]=255;raw[i+1]=80;raw[i+2]=20;raw[i+3]=x>100&&x<924&&y>100&&y<924?255:0;}
 const png=await sharp(raw,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{
   const pieces:Buffer[]=[];for await(const c of req)pieces.push(Buffer.from(c));const bytes=Buffer.concat(pieces);
   const body=bytes.length&&req.headers["content-type"]?.includes("json")?JSON.parse(bytes.toString()):{};
   res.setHeader("content-type","application/json");
   if(req.url?.startsWith("/internal/config")){
     if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
     if(req.url.endsWith("activate")){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
     return res.end(JSON.stringify({digest}));
   }
   if(req.url?.endsWith("/images/generations")||req.url?.endsWith("/images/edits")){
     if(req.headers["content-type"]?.includes("multipart")){const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":req.headers["content-type"]},body:bytes}).formData();Object.assign(body,Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==="string")));body.hasMask=form.get("mask") instanceof File;body.inputCount=form.getAll("image[]").length||form.getAll("image").length;}
     calls++;bodies.push(body);
     if(String(body.prompt).includes("UNCERTAIN_FIXTURE")){res.destroy();return;}
     return res.end(JSON.stringify({created:1,data:[{b64_json:png.toString("base64")}]}));
   }
   res.statusCode=404;res.end(JSON.stringify({error:"Fixture route does not exist"}));
 });
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-token-independent-123456789",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-independent-key-123456789",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,
  OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:`${f.origin}/v1`,OPENAI_IMAGE_QUALITY:"medium",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"naumi-imagegen-execution-"))});
 f.config.upstreamModels[0].capabilities.transparent=true;
 f.config.upstreamModels[0].capabilities.preserveIdentity=true;
 f.config.upstreamModels[0].capabilities.imagegen={mask:{state:"supported",source:"Controlled HTTP fixture",checkedAt:"2026-10-13"}};
 await f.repo.current().catch(async error=>{await f.cleanup();throw error;});
 const db=await import("../src/lib/db");
 try{
   const owner=`imagegen-exec-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"Fixture");
   const req=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"画一只透明底鹈鹕",modelId:"image-a",parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}});
   const before=(await db.getPool().query("SELECT count(*)::int AS n FROM app_image_jobs")).rows[0].n;
   const plan=await planImagegen(req,owner);assert.equal(plan.intent.background,"transparent");assert.equal(plan.steps[0].modelId,"image-a");assert.equal(calls,0);
   assert.equal((await db.getPool().query("SELECT count(*)::int AS n FROM app_image_jobs")).rows[0].n,before,"Preview cannot create billed tasks");
   const first=await submitImagegen(req,owner,{billingVersion:plan.billingVersion,credits:plan.totalCredits,modelVersion:plan.modelVersion,confirmed:true});
   const duplicate=await submitImagegen(req,owner);assert.equal(first.jobId,duplicate.jobId);
   let result=first;for(let i=0;i<600&&!['succeeded','failed','needs_attention'].includes(result.status);i++){await new Promise(r=>setTimeout(r,100));result=(await getImagegenResult(req.operationId,owner))!;}
   assert.equal(result.status,"succeeded",JSON.stringify(result));assert.equal(calls,1);assert.equal(bodies[0].model,"wire-image-one");assert.equal(bodies[0].background,"transparent");assert.ok(result.artifacts[0].transparentPixels>0);
   assert.equal(await getImagegenResult(req.operationId,"another@example.test"),null);
   await assert.rejects(()=>submitImagegen({...req,prompt:"画一棵树"},owner),/冲突|编号/);
   assert.equal(calls,1);
   const operations=(await db.getPool().query("SELECT count(*)::int AS n FROM app_billing_operations WHERE email=$1 AND state='settled' AND feature IN ('image.generate','canvas.image')",[owner])).rows[0].n;
   assert.equal(operations,1,"Parent orchestration cannot reserve or charge a second time");
   await assert.rejects(()=>planImagegen({...req,operationId:randomUUID(),inputs:[{artworkId:"another-owners-private-mask",role:"mask"}]},owner));
   assert.equal((await db.getPool().query("SELECT reserved_cost FROM app_image_jobs WHERE id=$1",[first.jobId])).rows[0].reserved_cost,0);
   const unknown=imagegenRequestSchema.parse({...req,operationId:randomUUID(),prompt:"UNCERTAIN_FIXTURE: draw a bird",output:{}});
   const unknownPlan=await planImagegen(unknown,owner);await submitImagegen(unknown,owner,{billingVersion:unknownPlan.billingVersion,credits:unknownPlan.totalCredits,modelVersion:unknownPlan.modelVersion,confirmed:true});
   let pending;for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,100));pending=await getImagegenResult(unknown.operationId,owner);if(pending&&['failed','needs_attention'].includes(pending.status))break;}
   assert.ok(pending&&['failed','needs_attention'].includes(pending.status));assert.equal(calls,2);
   await submitImagegen(unknown,owner);await getImagegenResult(unknown.operationId,owner);assert.equal(calls,2,"Unknown acceptance must never cause a resubmission");
   const targetId=`target-${randomUUID()}`,maskId=`mask-${randomUUID()}`;
   for(const id of [targetId,maskId])await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','fixture','completed',$3,'from-white','canvas')",[id,owner,`data:image/png;base64,${png.toString("base64")}`]);
   const edit=imagegenRequestSchema.parse({...req,operationId:randomUUID(),mode:"edit",prompt:"局部修改：把红色主体改成蓝色",output:{},inputs:[{artworkId:targetId,role:"edit-target"},{artworkId:maskId,role:"mask"}]});
   const editPlan=await planImagegen(edit,owner);await submitImagegen(edit,owner,{billingVersion:editPlan.billingVersion,credits:editPlan.totalCredits,modelVersion:editPlan.modelVersion,confirmed:true});
   let editResult;for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,100));editResult=await getImagegenResult(edit.operationId,owner);if(editResult&&['succeeded','failed','needs_attention'].includes(editResult.status))break;}
   assert.equal(editResult?.status,"succeeded",JSON.stringify(editResult));assert.equal(calls,3);assert.equal(bodies[2].hasMask,true);assert.equal(bodies[2].inputCount,1);
   await assert.rejects(()=>planImagegen(edit,"other@example.test"),/无权|不存在/);assert.equal(calls,3);
   const {POST}=await import("../src/app/api/generate-image/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
   const legacy=await POST(new Request("http://internal/api/generate-image",{method:"POST",headers:{"content-type":"application/json",cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"x-naumi-billing-operation-id":randomUUID(),"x-naumi-model-version":String(plan.modelVersion),"x-naumi-billing-version":String(plan.billingVersion),"x-naumi-billing-credits":String(plan.totalCredits)},body:JSON.stringify({prompt:"画一只透明底鹈鹕",model:"image-a",origin:"canvas",count:1,quality:"medium",resolution:"1K",ratio:"1:1"})}));
   const legacyBody=await legacy.json();assert.equal(legacy.ok,true,JSON.stringify(legacyBody));
   for(let i=0;i<600;i++){const state=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[legacyBody.jobId])).rows[0]?.snapshot;if(state?.status==="done"){assert.ok(state.images.length);break;}assert.notEqual(state?.status,"error",state?.error);await new Promise(r=>setTimeout(r,100));}
   assert.equal(calls,4);assert.equal(bodies[3].background,"transparent","Legacy node prompts require no capability button");
   console.log("PASS imagegen execution: readonly plan, native prompt trigger, frozen wire fields, owned results and one billed child");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
