import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 const baseline=process.argv.includes("--baseline");let supplierPosts=0,wireQuality="high";
 const calls:{model:string;quality:string;background:string;imageBytes:number}[]=[];
 const input=await sharp({create:{width:48,height:64,channels:4,background:"white"}}).png().toBuffer();
 const visible=await sharp({create:{width:24,height:32,channels:4,background:{r:55,g:95,b:125,alpha:1}}}).png().toBuffer();
 const output=await sharp({create:{width:48,height:64,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:visible,left:12,top:16}]).png().toBuffer();
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",OPENAI_API_KEY:"fixture-local-only",OPENAI_BASE_URL:"http://127.0.0.1:1/v1",REPLICATE_API_TOKEN:"",STORAGE_DRIVER:"local",MEDIA_DIR:"output/canvas-cutout-parameters-20261021/media",MEDIA_PRIVATE:"0"});
 let supplierOutput=output;
 const f=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  if(!req.url?.endsWith("/images/edits")){res.statusCode=500;res.end("No unexpected provider traffic permitted");return;}
  supplierPosts++;
  const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":String(req.headers["content-type"])},body:Buffer.concat(chunks)}).formData();
  const image=form.get("image")||form.get("image[]");assert(image instanceof File);const imageBytes=Buffer.from(await image.arrayBuffer());
  assert.equal((await sharp(imageBytes).metadata()).width,48);
  assert.equal(form.get("model"),"wire-image-one");assert.equal(form.get("quality"),wireQuality);assert.equal(form.get("background"),"transparent");
  calls.push({model:String(form.get("model")),quality:String(form.get("quality")),background:String(form.get("background")),imageBytes:imageBytes.length});
  res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{b64_json:supplierOutput.toString("base64")}]}));
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,INTERNAL_APP_ORIGIN:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-local-cutout-router-secret-20261021",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-local-cutout-envelope-secret-20261021",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 const db=await import("../src/lib/db");
 try{
  f.config.upstreamModels[0].capabilities.transparent=true;f.config.upstreamModels[0].capabilities.preserveIdentity=true;
  f.config.upstreamModels[0].parameterMap.qualityPolicy={mode:"map",choices:[{id:"medium",label:"默认",value:"high"}]};
  f.config.publicModels[0].visible=false;f.config.publicModels[0].toolScope={features:["tool.cutout"],systems:["canvas"],defaultFor:[]};f.config.bindings["image.cutout"]="image-a";
  (await import("../src/lib/model-config/schema")).validateModelConfig(f.config,{trustedOrigins:[f.origin]});
  await f.repo.current();await db.ensureSchema();const email=`cutout-${randomUUID()}@fixture.test`;await db.getOrCreateUser(email,"Cutout fixture");
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email,amount:100,source:"admin",reason:"isolated fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const {getBillingRuntime}=await import("../src/lib/billing/server"),billing=await getBillingRuntime(),old=await billing.config.current(),config=structuredClone(old.config);
  config.switches.metering="on";config.features["tool.cutout"].pricing={mode:"fixed",credits:1};
  const price=await billing.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:"fixture",reason:"Cutout parameter regression"});
  await db.addArtworks(email,[{id:"cutout-source",title:"商品原图",category:"main",prompt:"",status:"completed",image:"data:image/png;base64,"+input.toString("base64"),gradient:"",origin:"canvas",groupId:"cutout-source",ratio:"3:4",resolution:"1K",width:48,height:64}],"fixture");
  const cookie="nv_user="+(await import("../src/lib/native-auth")).signUserSession(email,Date.now());
  const {POST}=await import("../src/app/api/cutout/route"),quoteApi=await import("../src/app/api/billing/quote/route");
  const quote=async(quality:string)=>{const r=await quoteApi.POST(new Request(f.origin+"/api/billing/quote",{method:"POST",headers:{cookie,"content-type":"application/json","x-naumi-canvas":"1"},body:JSON.stringify({feature:"tool.cutout",quantity:1,quality,resolution:"1K",ratio:"3:4"})}));assert.equal(r.status,200,await r.clone().text());return r.json();};
  const request=(quality:string,operationId:string=randomUUID(),headerQuality=quality)=>{
   const form=new FormData();form.append("image",new File([new Uint8Array(input)],"original.png",{type:"image/png"}));form.set("email","forged-owner@fixture.test");form.set("parentId","cutout-source");form.set("quality",quality);form.set("resolution","1K");form.set("ratio","3:4");form.set("title","去背景结果");
   return new Request(f.origin+"/api/cutout",{method:"POST",headers:{cookie,"x-naumi-image-quality":headerQuality,"x-naumi-canvas":"1","x-naumi-client-entry":"canvas","x-naumi-billing-operation-id":operationId,"x-naumi-billing-version":String(price.version),"x-naumi-billing-credits":"1"},body:form});
  };
  if(process.argv.includes('--transparency')){
   const q=await quote('medium');assert(q.quote?.id,'real owner-bound quote is issued');
   const quotedRequest=(id:string,explicit=false)=>{const r=request('medium',id);r.headers.set('x-naumi-image-quote',q.quote.id);if(explicit)r.headers.set('x-naumi-feature-model','image-a');return r;};
   const operation=randomUUID(),r=await POST(quotedRequest(operation)),body=await r.json();
   if(process.argv.includes('--baseline-transparency')){assert.equal(r.status,409);assert.equal(body.code,'MODEL_UNAVAILABLE');assert.equal(supplierPosts,0);console.log('QUOTED_CUTOUT_BASELINE=REPRODUCED HTTP=409 CODE=MODEL_UNAVAILABLE SUPPLIER_POSTS=0');return;}
   assert.equal(r.status,200,JSON.stringify(body));assert(body.id);assert.equal(supplierPosts,1);
   const replay=await POST(quotedRequest(operation));assert.equal(replay.status,200);assert.equal((await replay.json()).id,body.id);assert.equal(supplierPosts,1);
   const explicit=await POST(quotedRequest(randomUUID(),true));assert.equal(explicit.status,409);assert.equal(supplierPosts,1,'explicit hidden selection still rejected');
   const saved=await db.listArtworksByIds(email,[body.id]);assert.equal(saved.length,1);assert.equal(saved[0].parentId,'cutout-source');assert.equal((await db.listArtworksByIds('forged-owner@fixture.test',[body.id])).length,0);
   const initialCount=(await db.getPool().query('SELECT count(*)::int n FROM app_artworks WHERE email=$1',[email])).rows[0].n;
   supplierOutput=await sharp({create:{width:48,height:64,channels:4,background:{r:220,g:220,b:220,alpha:254/255}}}).png().toBuffer();
   const invalidId=randomUUID(),bad=await POST(quotedRequest(invalidId)),badBody=await bad.json();assert.equal(bad.status,502,JSON.stringify(badBody));assert.equal(badBody.code,'CUTOUT_OUTPUT_INVALID');assert.equal(supplierPosts,2);
   assert.equal((await db.getPool().query('SELECT count(*)::int n FROM app_artworks WHERE email=$1',[email])).rows[0].n,initialCount,'no invalid artwork persisted');
   const state=(await db.getPool().query('SELECT state,charged_credits FROM app_billing_operations WHERE id=$1',['tool-'+invalidId])).rows[0];assert.ok(['hold','manual'].includes(state.state));assert.equal(Number(state.charged_credits),0);
   const again=await POST(quotedRequest(invalidId));assert.equal(again.status,409);assert.equal(supplierPosts,2,'accepted invalid output never replays supplier');
   const charged=(await db.getPool().query('SELECT count(*)::int n,sum(-delta)::int credits FROM app_ledger WHERE email=$1 AND delta<0',[email])).rows[0];assert.equal(charged.n,1);assert.equal(charged.credits,1);
   console.log('QUOTED_CUTOUT_PG=PASS HIDDEN_DEFAULT=200 EXPLICIT_HIDDEN=409 OWNER=AUTHENTICATED SUCCESS_CHARGE=1 REPLAY_POSTS=0 INVALID_OUTPUT=502 INVALID_ARTWORKS=0 INVALID_STATE='+state.state+' EXTERNAL_SUPPLIER_CALLS=0');return;
  }
  const legacy=await POST(request("fine")),legacyBody=await legacy.json();
  if(baseline){assert.equal(legacy.status,400);assert.equal(legacyBody.code,"MODEL_INCOMPATIBLE");assert.match(legacyBody.error,/质量参数无效/);assert.equal(supplierPosts,0);console.log('BASELINE=REPRODUCED QUALITY=fine HTTP=400 CODE=MODEL_INCOMPATIBLE MESSAGE=质量参数无效，请选择已开放的质量档位 SUPPLIER_POSTS=0');return;}
  assert.equal(legacy.status,200,JSON.stringify(legacyBody));assert(legacyBody.ok&&legacyBody.id&&legacyBody.url);
  const {billingRequestIdentity}=await import("../src/lib/billing/synchronous");
  const original=request("fast"),originalCopy=original.clone(),beforeIdentity=await billingRequestIdentity(original);const fast=await POST(original);assert.equal(fast.status,200,await fast.clone().text());assert.equal((await billingRequestIdentity(originalCopy)).hash,beforeIdentity.hash);
  for(const quality of ["fine","fast","medium"]){const q=await quote(quality);assert.equal(q.credits,1);assert.equal(q.version,price.version);}
  const operationId=randomUUID(),modern=request("medium",operationId),modernCopy=modern.clone(),before=await billingRequestIdentity(modern),modernResponse=await POST(modern),modernBody=await modernResponse.json();assert.equal(modernResponse.status,200,JSON.stringify(modernBody));
  const count=supplierPosts,replayed=await POST(request("medium",operationId)),replay=await replayed.json();assert.equal(replayed.status,200);assert.equal(replay.id,modernBody.id);assert.equal(supplierPosts,count);
  const saved=(await db.listArtworksByIds(email,[legacyBody.id,modernBody.id]));assert.equal(saved.length,2);for(const art of saved){assert.equal(art.parentId,"cutout-source");assert.equal(art.ratio,"3:4");const match=/^data:image\/png;base64,(.*)$/.exec(art.image);const bytes=match?Buffer.from(match[1],"base64"):await import("../src/lib/storage").then(m=>m.readManagedObject(art.image)).then(x=>x.bytes);const px=await(await import("../src/lib/imagegen/postprocess")).inspectImagegenPixels(bytes);assert.equal(px.width,48);assert.equal(px.height,64);assert(px.transparentPixels>0&&px.visiblePixels>0);}
  assert.equal((await db.listArtworksByIds("forged-owner@fixture.test",[modernBody.id])).length,0);
  const after=await db.getPool().query("SELECT quote,state,request_fingerprint FROM app_billing_operations WHERE id=$1",['tool-'+operationId]);assert.equal(after.rows[0].state,"settled");assert.equal(after.rows[0].quote.facts.quality,"medium");
  const {fingerprint}=await import("../src/lib/billing/fingerprint");assert.equal(after.rows[0].request_fingerprint,fingerprint({email:email.toLowerCase(),quote:after.rows[0].quote,ledgerId:"led-tool-"+operationId,fingerprint:before.hash}));
  assert.equal((await billingRequestIdentity(modernCopy)).hash,before.hash);
  const invalid=await POST(request("garbage"));assert.equal(invalid.status,400);assert.equal(supplierPosts,count);
  const headerOnly=request("",randomUUID(),"fine"),header=await POST(headerOnly);assert.equal(header.status,200,await header.clone().text());
  const {withModelRequest}=await import("../src/lib/model-config/requests");
  const wrong=new Request(f.origin+'/api/generate-image',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({quality:'fine',prompt:'test',model:'image-a'})});
  await assert.rejects(()=>withModelRequest(wrong,async()=>null),(e:any)=>e.code==='MODEL_INCOMPATIBLE');
  const {cutoutImageQuality}=await import("../src/lib/model-config/cutout-quality");assert.equal(cutoutImageQuality('fine'),'medium');assert.equal(cutoutImageQuality('FAST'),'medium');assert.equal(cutoutImageQuality('high'),'high');assert.equal(cutoutImageQuality('invalid'),'invalid');
  const debits=await db.getPool().query('SELECT count(*)::int AS n,sum(-delta)::int AS credits FROM app_ledger WHERE email=$1 AND delta<0',[email]);assert.equal(debits.rows[0].n,supplierPosts);assert.equal(debits.rows[0].credits,supplierPosts);
  console.log(`MODIFIED=PASS LEGACY_FINE_FAST_HEADER=200 MODERN_MEDIUM=200 QUOTES=CONSISTENT ADMIN_WIRE_QUALITY=high PNG=TRANSPARENT_VISIBLE PARENT=cutout-source RATIO=3:4 OWNER=AUTHENTICATED REPLAY_POSTS=0 RAW_FINGERPRINT=UNCHANGED OTHER_ROUTE_FINE=REJECTED INVALID=REJECTED CHARGES=${supplierPosts} MODEL_FIXTURE_POSTS=${supplierPosts} EXTERNAL_SUPPLIER_CALLS=0`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
