/** Real route handlers, private local PG, loopback-only supplier. Never replay a customer task. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createServer} from "node:http";
import {mkdtemp,writeFile,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 const mode=process.argv[2]||"MODIFIED",out=resolve(process.argv[3]||"output/chiyu-ratio-repair47-20261016");
 assert.ok(["BASELINE","MODIFIED","ROLLBACK"].includes(mode));
 await mkdir(out,{recursive:true});
 let calls=0;const wire:Array<Record<string,unknown>>=[];
 const W=1024,H=1536,raw=Buffer.alloc(W*H*3);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*3;raw[i]=y<90?255:20;raw[i+1]=y>H-91?255:60;raw[i+2]=x<70||x>W-71?255:100;}
 const original=await sharp(raw,{raw:{width:W,height:H,channels:3}}).png().toBuffer();
 const reference=await sharp(original).resize(750,1000,{fit:"fill"}).png().toBuffer();
 await writeFile(join(out,"EDGE_FIXTURE.png"),original);
 const f=await createModelFixture(async(req,res)=>{
  try{
   const parts:Buffer[]=[];for await(const c of req)parts.push(Buffer.from(c));const bytes=Buffer.concat(parts);
   const body=req.headers["content-type"]?.includes("json")?JSON.parse(bytes.toString()||"{}"):{};
   res.setHeader("content-type","application/json");
   if(req.url?.startsWith("/internal/config"))return res.end(JSON.stringify({id:body.id,digest:body.digest,phase:req.url.endsWith("prepare")?"prepared":"applied"}));
   if(req.url?.endsWith("/images/edits")||req.url?.endsWith("/images/generations")){
    if(req.headers["content-type"]?.includes("multipart")){
     const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":req.headers["content-type"]},body:bytes}).formData();
     Object.assign(body,Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==="string")));
     body.referenceCount=form.getAll("image[]").length||form.getAll("image").length;
    }
    calls++;wire.push({...body,path:req.url});return res.end(JSON.stringify({created:1,data:[{b64_json:original.toString("base64")}] }));
   }
   res.statusCode=404;res.end(JSON.stringify({error:"fixture route absent"}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
 });
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-token-independent-123456789",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-independent-key-123456789",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,
  OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:`${f.origin}/v1`,OPENAI_IMAGE_QUALITY:"medium",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"chiyu-ratio-media-")),VIDEO_WORKER_SECRET:"fixture-worker-image-recovery-20261016-only"});
 f.config.upstreamModels[0].capabilities.preserveIdentity=true;
 f.config.upstreamModels[0].capabilities.nativeResolutions=["1K","4K"];
 f.config.upstreamModels[0].parameterMap.resolution={"4K":"1024x1536"};
 // gpt-image-2 matches the user's adapter path. This name is local fixture data, not a supplier call.
 f.config.upstreamModels[0].model="gpt-image-2";
 await f.repo.current();
 const db=await import("../src/lib/db"),gen=await import("../src/app/api/generate-image/route"),imagegen=await import("../src/app/api/imagegen/route"),planRoute=await import("../src/app/api/imagegen/plan/route");
 const {imageWorkerAuthorized,recoverDurableImageJobs}=await import("../src/lib/durable-image-jobs");
 const app=createServer(async(req,res)=>{
  try{
   const parts:Buffer[]=[];for await(const c of req)parts.push(Buffer.from(c));const bytes=Buffer.concat(parts),url=new URL(req.url||"/",origin);
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(","):v);
   const request=new Request(url,{method:req.method,headers,...(req.method!=="GET"&&req.method!=="HEAD"?{body:bytes}:{})});
   let response:Response;
   if(url.pathname==="/api/generate-image")response=await (req.method==="GET"?gen.GET:gen.POST)(request);
   else if(url.pathname==="/api/imagegen")response=await (req.method==="GET"?imagegen.GET:imagegen.POST)(request);
   else if(url.pathname==="/api/imagegen/plan")response=await planRoute.POST(request);
   else if(url.pathname==="/fixture/worker-image-recovery")response=imageWorkerAuthorized(request)?Response.json({processed:await recoverDurableImageJobs()}):Response.json({error:"unauthorized"},{status:401});
   else response=Response.json({error:"fixture path absent"},{status:404});
   res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
 });
 let origin="";
 await new Promise<void>(r=>app.listen(0,"127.0.0.1",r));origin=`http://127.0.0.1:${(app.address() as {port:number}).port}`;process.env.INTERNAL_APP_ORIGIN=origin;
 const {signUserSession,USER_COOKIE}=await import("../src/lib/native-auth"),owner=`ratio-${randomUUID()}@example.test`;
 try{
  await db.getOrCreateUser(owner,"Isolated ratio fixture");
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");
  await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:500,source:"admin",reason:"isolated ratio fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const cookie=`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,headers={cookie,origin};
  const json=async(path:string,body?:unknown,extra:Record<string,string>={})=>{
   const response=await fetch(origin+path,{method:body===undefined?"GET":"POST",headers:{...headers,...extra,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const data=await response.json();assert.equal(response.ok,true,JSON.stringify(data));return data;
  };
  const ids=[0,1,2].map(i=>`reference-${randomUUID()}-${i}`);
  for(const id of ids)await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','','completed',$3,'','canvas')",[id,owner,`data:image/png;base64,${reference.toString("base64")}`]);
  const request={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"将标题与产品完整排版在画幅内",modelId:"image-a",inputs:ids.map(artworkId=>({artworkId,role:"reference"})),parameters:{quality:"medium",resolution:"4K",ratio:"9:16"},variants:1};
  const plan=await json("/api/imagegen/plan",request);assert.equal(calls,0,"Plan is read-only");
  const confirmation={billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true};
  const submitted=await json("/api/imagegen",{...request,confirmation});
  let result:any;
  for(let i=0;i<300;i++){result=await json(`/api/imagegen?operationId=${request.operationId}`);if(["succeeded","failed","needs_attention"].includes(result.status))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(result.status,"succeeded",JSON.stringify(result));assert.equal(calls,1);assert.equal(wire[0].referenceCount,3);
  const artifact=result.artifacts[0];
  const {readManagedObject}=await import("../src/lib/storage"),bytes=(await readManagedObject(artifact.url,64*1024*1024)).bytes;
  const metadata=await sharp(bytes).metadata(),expectedWidth=mode==="MODIFIED"?2731:2304;
  assert.deepEqual([metadata.width,metadata.height],[expectedWidth,4096]);
  assert.deepEqual([artifact.width,artifact.height],[expectedWidth,4096]);
  const art=(await db.getPool().query("SELECT ratio,image_width AS width,image_height AS height FROM app_artworks WHERE id=$1",[artifact.artworkId])).rows[0];
  assert.deepEqual([art.width,art.height],[expectedWidth,4096]);assert.equal(art.ratio,mode==="MODIFIED"?"2731:4096":"9:16");
  const compat=await json(`/api/generate-image?job=${submitted.jobId}`);assert.equal(compat.status,"done");assert.equal(compat.images[0].width,expectedWidth);
  await json("/api/imagegen",{...request,confirmation});await json(`/api/imagegen?operationId=${request.operationId}`);assert.equal(calls,1,"Duplicate and query never resubmit supplier work");
  const unauthorized=await fetch(`${origin}/api/imagegen?operationId=${request.operationId}`);assert.equal(unauthorized.status,401);
  const inspectEdges=async(b:Buffer)=>{
   const {data,info}=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const at=(x:number,y:number)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
   if(mode==="MODIFIED"){
    assert.deepEqual(at(Math.floor(info.width/2),10),[255,60,100]);assert.deepEqual(at(Math.floor(info.width/2),info.height-11),[20,255,100]);
    assert.equal(at(10,Math.floor(info.height/2))[2],255);assert.equal(at(info.width-11,Math.floor(info.height/2))[2],255);
   }
  };await inspectEdges(bytes);await writeFile(join(out,`${mode}_ROUTE_OUTPUT.png`),bytes);
  if(mode==="MODIFIED"){assert.match(String(wire[0].prompt),/9:16/);assert.match(String(wire[0].prompt),/安全边距/);}
  // Recover from a durable supplier-result checkpoint: no new POST to the supplier is permitted.
  const parent=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[submitted.jobId])).rows[0];
  const child=(await db.getPool().query("SELECT * FROM app_image_jobs WHERE id=$1",[parent.snapshot.children.generate.jobId])).rows[0];
  assert.ok(child,"Persisted child exists");
  const recoveryId=`job-${randomUUID()}`;
  // Terminal snapshots intentionally discard the transient attempt map. Seed an
  // independent, deterministic crash boundary using the same frozen payload and
  // the exact fixture supplier bytes, not an existing customer's operation.
  const attempt={model:"image-a",replayable:false,state:"done",result:[{id:"fixture-checkpoint",url:`data:image/png;base64,${original.toString("base64")}`,gradient:"",prompt:request.prompt,ratio:"9:16",createdAt:new Date().toISOString()}]};
  const recoverySnapshot={status:"pending",createdAt:Date.now(),paidOperationVersion:1,paidOperations:{[recoveryId]:attempt}};
  const payload={...child.payload,cost:0};delete payload.billingQuote;
  await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'generate',$3::jsonb,$4::jsonb,0,false)",[recoveryId,owner,JSON.stringify(recoverySnapshot),JSON.stringify(payload)]);
  const workerResponse=await fetch(origin+"/fixture/worker-image-recovery",{method:"POST",headers:{"x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!}});assert.equal(workerResponse.status,200);
  let recovered:any;
  for(let i=0;i<300;i++){recovered=await json(`/api/generate-image?job=${recoveryId}`);if(["done","error"].includes(recovered.status))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(recovered.status,"done",JSON.stringify(recovered));assert.equal(calls,1,"Worker recovers stored result, never supplier POST");assert.equal(recovered.images[0].width,expectedWidth);
  await inspectEdges((await readManagedObject(recovered.images[0].url,64*1024*1024)).bytes);
  const recoveredOperation=randomUUID(),recoveredParentId=`imagegen-${recoveredOperation}`;
  const parentSnapshot={status:"pending",paidOperationVersion:1,children:{generate:{state:"submitted",jobId:recoveryId}},fingerprint:"isolated-recovery-boundary",result:{operationId:recoveredOperation,jobId:recoveredParentId,status:"pending",stage:"generating",artifacts:[],chargedCredits:0}};
  const frozenParent=(await db.getPool().query("SELECT payload FROM app_image_jobs WHERE id=$1",[submitted.jobId])).rows[0].payload;
  const parentPayload={...frozenParent,plan:{...frozenParent.plan,request:{...frozenParent.plan.request,operationId:recoveredOperation}}};
  await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,0,false)",[recoveredParentId,owner,JSON.stringify(parentSnapshot),JSON.stringify(parentPayload)]);
  assert.equal((await fetch(origin+"/fixture/worker-image-recovery",{method:"POST",headers:{"x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!}})).status,200);
  let parentResult:any;
  for(let i=0;i<300;i++){parentResult=await json(`/api/imagegen?operationId=${recoveredOperation}`);if(["succeeded","failed","needs_attention"].includes(parentResult.status))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(parentResult.status,"succeeded",JSON.stringify(parentResult));assert.equal(parentResult.artifacts[0].width,expectedWidth);assert.equal(calls,1);
  const form=new FormData();for(const [key,value] of Object.entries({prompt:request.prompt,model:"image-a",origin:"canvas",count:"1",quality:"medium",resolution:"4K",ratio:"9:16",ratiogen:"1"}))form.set(key,value);
  form.set("image",new File([new Uint8Array(reference)],"fixture.png",{type:"image/png"}));
  const directResponse=await fetch(origin+"/api/generate-image",{method:"POST",headers:{...headers,"x-naumi-billing-operation-id":randomUUID(),"x-naumi-model-version":String(plan.modelVersion),"x-naumi-billing-version":String(plan.billingVersion),"x-naumi-billing-credits":String(plan.totalCredits)},body:form});
  const direct=await directResponse.json();assert.equal(directResponse.ok,true,JSON.stringify(direct));
  let ratioResult:any;
  for(let i=0;i<300;i++){ratioResult=await json(`/api/generate-image?job=${direct.jobId}`);if(["done","error"].includes(ratioResult.status))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(ratioResult.status,"done",JSON.stringify(ratioResult));assert.equal(calls,2);assert.equal(ratioResult.images[0].width,expectedWidth);
  await inspectEdges((await readManagedObject(ratioResult.images[0].url,64*1024*1024)).bytes);
  const report={mode,input:[W,H],request:{ratio:"9:16",resolution:"4K",quality:"medium",references:3},output:[metadata.width,metadata.height],storedRatio:art.ratio,storedOutputSha256:createHash("sha256").update(bytes).digest("hex"),planReadOnly:true,imagegenPost:true,imagegenGet:true,legacyGet:true,directRatiogen:true,workerResultCheckpoint:true,workerParentCheckpoint:true,duplicateResubmission:false,fixtureSupplierCalls:calls,realSupplierCalls:0,nextVersion:(await import("next/package.json")).version};
  await writeFile(join(out,`${mode}_ROUTES.json`),JSON.stringify(report,null,2));
  console.log(`${mode}_ROUTES=PASS INPUT=1024x1536 REQUEST=9:16/4K/medium/3refs OUTPUT=${expectedWidth}x4096 IMAGEGEN_POST_GET=PASS RATIOGEN=PASS LEGACY_GET=PASS WORKER_CHILD_PARENT_CHECKPOINTS=PASS DUPLICATE_POSTS=0 REAL_SUPPLIER_CALLS=0 EXIT=0`);
 }finally{
  await new Promise<void>(r=>app.close(()=>r()));await db.getPool().end();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
