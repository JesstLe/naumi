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
 const raw=Buffer.alloc(1024*1536*4);for(let y=0;y<1536;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4;raw[i]=255;raw[i+1]=80;raw[i+2]=20;raw[i+3]=x>100&&x<924&&y>100&&y<924?255:0;}
 const png=await sharp(raw,{raw:{width:1024,height:1536,channels:4}}).png().toBuffer();
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
 f.config.upstreamModels[0].capabilities.textAccuracy=true;
 f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1K","2K":"2K"}}};
 await f.repo.current().catch(async error=>{await f.cleanup();throw error;});
 const db=await import("../src/lib/db");
 try{
   const owner=`imagegen-exec-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"Fixture");
   const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"isolated imagegen fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
   const {uploadImage}=await import("../src/lib/storage"),{readCanvasImage}=await import("../src/lib/canvas-image-input");
   const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
   const source=await sharp({create:{width:1200,height:1600,channels:3,background:"#dbeafe"}}).png().toBuffer();
   const nodeId=`aspect-${randomUUID()}`,sourceUrl=await uploadImage(source,"image/png",`aspect/${randomUUID()}.png`,undefined,owner);
   await db.addArtworks(owner,[{id:nodeId,title:"比例测试",prompt:"原图",category:"main",status:"completed",image:sourceUrl,gradient:"",origin:"canvas",source:"canvas-add",groupId:nodeId,width:1200,height:1600,ratio:"1:1",resolution:"1K"}]);
   const headers=(operationId:string)=>({cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,"x-naumi-project-context":`tree:${nodeId}`,"x-naumi-workspace":"personal","x-naumi-billing-operation-id":operationId});
   const checks:string[]=[],pass=(name:string)=>{checks.push(name);console.log('CHECK='+name)};
   async function verifyOutput(id:string){const art=(await db.listArtworksByIds(owner,[id]))[0];assert.ok(art);assert.equal(art.width,1024);assert.equal(art.height,1536);assert.equal(art.ratio,'2:3');assert.equal(art.parentId,nodeId);const bytes=(await readCanvasImage(art.image,'http://internal',owner)).buffer;assert.deepEqual(await sharp(bytes).ensureAlpha().raw().toBuffer(),await sharp(png).ensureAlpha().raw().toBuffer());return art;}
   const {POST:annotate}=await import('../src/app/api/canvas/annotate/route');
   const aid=randomUUID(),annotation=()=>{const form=new FormData();form.set('artworkId',nodeId);form.set('quality','medium');form.set('image',new File([new Uint8Array(source)],'annotation.png',{type:'image/png'}));form.set('annotations',JSON.stringify([{type:'brush',note:'移除指定物体，保持其余画面'}]));return new Request('http://internal/api/canvas/annotate',{method:'POST',headers:headers(aid),body:form})};
   const ar=await annotate(annotation()),av=await ar.json();assert.equal(ar.status,200,JSON.stringify(av));assert.equal(av.width,1024);assert.equal(av.height,1536);await verifyOutput(av.id);assert.equal(bodies[0].aspect_ratio,'3:4');assert.equal(calls,1);pass('annotate-real-route-preserves-pixels-and-reports-actual-frame');
   const replay=await annotate(annotation()),replayed=await replay.json();assert.equal(replayed.id,av.id);assert.equal(calls,1);pass('annotate-idempotent-replay-does-not-submit-again');
   const {POST:textEdit}=await import('../src/app/api/canvas/text-edit/route');
   const tid=randomUUID(),payload={artworkId:nodeId,oldText:'旧标题',newText:'新标题',box:{x:20,y:20,width:180,height:80},quality:'medium'};
   const tr=await textEdit(new Request('http://internal/api/canvas/text-edit',{method:'POST',headers:{...headers(tid),'content-type':'application/json'},body:JSON.stringify(payload)})),tv=await tr.json();assert.equal(tr.status,200,JSON.stringify(tv));assert.equal(tv.width,1024);assert.equal(tv.height,1536);await verifyOutput(tv.id);assert.equal(bodies[1].aspect_ratio,'3:4');assert.equal(calls,2);pass('text-edit-real-route-preserves-pixels-and-reports-actual-frame');
   const {POST:enqueue}=await import('../src/app/api/canvas/image-tasks/route'),{processCanvasImageTask}=await import('../src/lib/canvas-image-tasks');
   const operationId=randomUUID(),request=()=>new Request('http://internal/api/canvas/image-tasks',{method:'POST',headers:{...headers(operationId),'content-type':'application/json'},body:JSON.stringify({...payload,kind:'text-edit',operationId})});
   const qr=await enqueue(request()),qv=await qr.json();assert.equal(qr.status,202,JSON.stringify(qv));const task=await db.claimNextCanvasImageTask();assert.equal(task?.id,qv.taskId);await processCanvasImageTask(task!);const done=await db.getCanvasImageTask(owner,qv.taskId);assert.equal(done?.status,'completed',JSON.stringify(done));await verifyOutput(done!.resultArtworkId!);assert.equal(bodies[2].aspect_ratio,'3:4');assert.equal(calls,3);pass('durable-text-edit-worker-preserves-frame-and-settles-once');
   const duplicate=await enqueue(request()),dv=await duplicate.json();assert.equal(dv.taskId,qv.taskId);assert.equal(calls,3);pass('durable-submission-replay-retains-original-task');
   const recoveredOperation=randomUUID(),rr=await enqueue(new Request('http://internal/api/canvas/image-tasks',{method:'POST',headers:{...headers(recoveredOperation),'content-type':'application/json'},body:JSON.stringify({...payload,operationId:recoveredOperation})})),rv=await rr.json();assert.equal(rr.status,202,JSON.stringify(rv));
   const checkpoint=await uploadImage(png,'image/png',`aspect/${randomUUID()}-provider.png`,undefined,owner);
   await db.getPool().query("UPDATE app_canvas_image_tasks SET parameters=parameters || $2::jsonb WHERE id=$1",[rv.taskId,JSON.stringify({upstreamStarted:true,upstreamResult:checkpoint})]);
   const resumed=await db.claimNextCanvasImageTask();assert.equal(resumed?.id,rv.taskId);await processCanvasImageTask(resumed!);const recovered=await db.getCanvasImageTask(owner,rv.taskId);assert.equal(recovered?.status,'completed',JSON.stringify(recovered));await verifyOutput(recovered!.resultArtworkId!);assert.equal(calls,3);pass('saved-provider-checkpoint-recovers-without-upstream-replay');
   const ops=(await db.getPool().query("SELECT feature,quote->'facts'->>'ratio' ratio,state FROM app_billing_operations WHERE email=$1 AND feature IN ('canvas.annotate','canvas.text-edit','canvas.image')",[owner])).rows;
   assert.equal(ops.length,4,JSON.stringify(ops));assert.ok(ops.every(op=>op.state==='settled'),JSON.stringify(ops));assert.ok(ops.every(op=>op.ratio==='3:4'),JSON.stringify(ops));pass('quote-execution-and-settlement-share-source-aspect');
   const original=(await db.listArtworksByIds(owner,[nodeId]))[0];assert.equal(original.image,sourceUrl);assert.equal(original.width,1200);assert.equal(original.height,1600);assert.deepEqual((await readCanvasImage(sourceUrl,'http://internal',owner)).buffer,source);pass('original-media-remains-unchanged');
   console.log(`EDIT_PIPELINE=PASS CASES=${checks.length} LOCAL_SUPPLIER_CALLS=${calls} REAL_SUPPLIER_CALLS=0 SETTLED_OPERATIONS=4`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
