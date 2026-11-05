import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
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
 const opaque=await sharp(png).flatten({background:"#fff"}).png().toBuffer();
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
     return res.end(JSON.stringify({created:1,data:[{b64_json:(String(body.prompt).includes("INVALID_ALPHA_FIXTURE")?opaque:png).toString("base64")}]}));
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
   const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"isolated imagegen fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
   const {uploadImage}=await import("../src/lib/storage"),{withFrozenCreation}=await import("../src/lib/saas/creation-context");
   const nodeId=`node-${randomUUID()}`,image=await uploadImage(opaque,"image/png",`fixture/${randomUUID()}.png`,undefined,owner);
   await db.addArtworks(owner,[{id:nodeId,title:"窗台小熊",prompt:"原始小熊",category:"main",status:"completed",image,gradient:"",origin:"canvas",source:"canvas-add",groupId:nodeId,canvasX:160,canvasY:90,canvasWidth:300,canvasHeight:300,width:1024,height:1024}]);
   await db.setArtworkCanvasLayout(owner,nodeId,160,90,300,300);
   const scope={actorEmail:owner,scopeKind:"personal" as const,tenantId:null,parentContext:`tree:${nodeId}`};
   const run=<T>(fn:()=>Promise<T>)=>withFrozenCreation(scope,fn);
   const req=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"橙色小熊趴在窗台",modelId:"image-a",sourceNodeId:nodeId,canvasTarget:{nodeId,expectedImage:image,expectedRevision:0},parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}});
   const plan=await run(()=>planImagegen(req,owner));assert.equal(calls,0);
   await run(()=>submitImagegen(req,owner,{billingVersion:plan.billingVersion,credits:plan.totalCredits,modelVersion:plan.modelVersion,confirmed:true}));
   let result;for(let i=0;i<600;i++){result=await run(()=>getImagegenResult(req.operationId,owner));if(result&&['succeeded','failed','needs_attention'].includes(result.status))break;await new Promise(r=>setTimeout(r,100));}
   assert.equal(result?.status,"succeeded",JSON.stringify(result));assert.equal(calls,1);assert.equal(result?.canvasAttachment?.nodeId,nodeId);assert.equal(result?.canvasAttachment?.applied,true);
   const fresh=(await db.listArtworksByIds(owner,[nodeId]))[0];assert.equal(fresh.image,result!.artifacts[0].url);assert.equal(fresh.canvasX,160);assert.equal(fresh.canvasY,90);assert.equal(fresh.prompt,req.prompt);assert.equal(fresh.canvasImageRevision,1);
   assert.equal((await db.listArtworksByIds(owner,[nodeId],{original:true}))[0].image,image);assert.equal((await db.listArtworks(owner)).length,1);
   const duplicate=await run(()=>submitImagegen(req,owner));assert.equal(duplicate.jobId,result?.jobId);assert.equal(calls,1);
   const {GET}=await import("../src/app/api/generate-image/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
   const response=await GET(new Request(`http://internal/api/generate-image?job=${result?.jobId}`,{headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"x-naumi-workspace":"personal","x-naumi-project-context":scope.parentContext}}));
   const receipt=await response.json();assert.equal(response.status,200,JSON.stringify(receipt));assert.equal(receipt.status,'done');assert.equal(receipt.canvasAttachment.versionId,result?.artifacts[0].artworkId);
   assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_billing_operations WHERE email=$1 AND state='settled' AND feature IN ('image.generate','canvas.image')",[owner])).rows[0].n,1);
   const {listCanvasImageVersions}=await import("../src/lib/canvas/image-version-store");assert.equal((await run(()=>listCanvasImageVersions(owner,nodeId))).versions.length,2);
   // A fresh uncertain upstream is never treated as permission for a replacement purchase.
   const uncertain=imagegenRequestSchema.parse({...req,operationId:randomUUID(),prompt:'UNCERTAIN_FIXTURE: draw a bird',canvasTarget:{nodeId,expectedRevision:1,expectedImage:fresh.image}});
   await run(()=>submitImagegen(uncertain,owner));let unknown;for(let i=0;i<600;i++){unknown=await run(()=>getImagegenResult(uncertain.operationId,owner));if(unknown&&['failed','needs_attention'].includes(unknown.status))break;await new Promise(r=>setTimeout(r,100));}
   assert.ok(unknown&&['failed','needs_attention'].includes(unknown.status));assert.equal(calls,2);assert.equal((await db.listArtworksByIds(owner,[nodeId]))[0].image,fresh.image);
   await run(()=>submitImagegen(uncertain,owner));await run(()=>getImagegenResult(uncertain.operationId,owner));assert.equal(calls,2);
   console.log('PIPELINE=PASS SAME_NODE=1 IMMUTABLE_ORIGINAL=1 HTTP_RECEIPT=1 SETTLED_OPERATIONS=1 UNKNOWN_REPLAY_POSTS=0 LOCAL_SUPPLIER_CALLS=2 REAL_SUPPLIER_CALLS=0');
 }finally{const {closeImageCoordinationPool}=await import('../src/lib/imagegen/coordination-pool');await closeImageCoordinationPool();await db.getPool().end();await f.cleanup();await rm(process.env.MEDIA_DIR!,{recursive:true,force:true});console.log('PIPELINE_CLEANUP=PASS ownSchemaDropped=true poolsClosed=true fixtureClosed=true temporaryMediaRemoved=true');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
