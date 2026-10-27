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
 const baseline=false; const deliveryBaseline=process.argv.includes("--delivery-baseline");
 const out=resolve("output/2k-delivery-fix-20261027/local-route");await mkdir(out,{recursive:true});let calls=0;
 const large=process.env.DELIVERY_FIXTURE_PNG?await readFile(process.env.DELIVERY_FIXTURE_PNG):await sharp(randomBytes(2304*2048*3),{raw:{width:2304,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer();
 const tiny=await sharp({create:{width:80,height:96,channels:3,background:"#63a871"}}).png().toBuffer();
 assert.ok(large.length>0);
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
  const request={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"Large owned PNG fixture",inputs:[],parameters:{quality:"medium",resolution:"2K",ratio:"3:4"},variants:1};
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
  console.log(JSON.stringify({result:"REAL_HANDLER_PASS",status:result.status,width:result.artifacts[0].width,height:result.artifacts[0].height,supplierFixtureCalls:calls,realSupplierCalls:0}));
 }finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await db.getPool().end();await f.cleanup();}
}
main().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
