import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 const baseline=process.argv.includes("--baseline");let posts=0,expectedMask=false;
 const original=await sharp({create:{width:64,height:64,channels:4,background:"#f0b74a"}}).png().toBuffer();
 const layout=await sharp({create:{width:64,height:192,channels:4,background:"#64748b"}}).png().toBuffer();
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",OPENAI_API_KEY:"fixture-local-only",OPENAI_BASE_URL:"http://127.0.0.1:1/v1",STORAGE_DRIVER:"local",MEDIA_DIR:"output/canvas-key-frame-long-image-20261021/media",MEDIA_PRIVATE:"0"});
 const calls:any[]=[];
 const f=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  if(req.url?.endsWith("/chat/completions")){
   posts++;const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(body.model,"wire-flow");assert.equal(body.quality,"high");
   const image=body.messages[0].content.find((part:any)=>part.type==="image_url");const meta=await sharp(Buffer.from(image.image_url.url.split(",")[1],"base64")).metadata();assert.equal(meta.width,64);assert.equal(meta.height,192);
   const output=await sharp({create:{width:64,height:192,channels:4,background:"#3b82f6"}}).png().toBuffer();
   res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:"data:image/png;base64,"+output.toString("base64")}}]}));return;
  }
  if(!req.url?.endsWith("/images/edits")){res.statusCode=500;res.end("Unexpected fixture request");return;}
  posts++;
  try{
   const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":String(req.headers["content-type"])},body:Buffer.concat(chunks)}).formData();
   assert.equal(form.has("mask"),expectedMask);assert.equal(form.get("quality"),"high");
   const file=form.get("image")||form.get("image[]");assert(file instanceof File);
   const bytes=Buffer.from(await file.arrayBuffer()),meta=await sharp(bytes).metadata();assert.equal(meta.width,64);assert.equal(meta.height,192);
   if(expectedMask){const mask=form.get("mask");assert(mask instanceof File);const m=await sharp(Buffer.from(await mask.arrayBuffer())).metadata();assert.equal(m.width,64);assert.equal(m.height,192);}
   const output=await sharp({create:{width:64,height:192,channels:4,background:"#3b82f6"}}).png().toBuffer();
   calls.push({mask:form.has("mask"),model:form.get("model"),quality:form.get("quality"),inputWidth:meta.width,inputHeight:meta.height});
   res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{b64_json:output.toString("base64")}]}));
  }catch(error){res.statusCode=400;res.end(JSON.stringify({error:{message:String(error)}}));}
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,INTERNAL_APP_ORIGIN:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-local-adaptive-router-20261021",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-local-adaptive-envelope-20261021",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 const db=await import("../src/lib/db");
 try{
  const u=f.config.upstreamModels[0];u.capabilities.preserveIdentity=true;
  u.parameterMap.qualityPolicy={mode:"map",choices:[{id:"medium",label:"默认",value:"high"}]};
  f.config.upstreamModels.push({...structuredClone(u),id:"u-mask",model:"wire-mask",capabilities:{...structuredClone(u.capabilities),imagegen:{mask:{state:"supported",source:"isolated fixture",checkedAt:"2026-10-21"}}}});
  f.config.publicModels.push({...structuredClone(f.config.publicModels[0]),id:"image-mask",label:"mask fixture",target:{type:"upstream",id:"u-mask"}});
  const flowCredential=await f.credentials.importPlain({providerId:"p-flow",plain:"fixture-flow-secret-local-only",actor:"fixture"});
  f.config.providers.push({...structuredClone(f.config.providers[0]),id:"p-flow",protocol:"new-api-flow",credentialRef:flowCredential.id});
  f.config.upstreamModels.push({...structuredClone(u),id:"u-flow",providerId:"p-flow",model:"wire-flow"});
  f.config.publicModels.push({...structuredClone(f.config.publicModels[0]),id:"image-flow",target:{type:"upstream",id:"u-flow"}});
  await f.repo.current();await db.ensureSchema();const email=`adaptive-${randomUUID()}@fixture.test`;await db.getOrCreateUser(email,"Adaptive fixture");
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email,amount:100,source:"admin",reason:"isolated fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  const billing=await(await import("../src/lib/billing/server")).getBillingRuntime(),old=await billing.config.current(),config=structuredClone(old.config);
  config.switches.metering="on";config.features["canvas.expand"].pricing={mode:"fixed",credits:1};config.features["canvas.image"].pricing={mode:"fixed",credits:2};
  const price=await billing.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:"fixture",reason:"Adaptive regression"});
  const productUrl="data:image/png;base64,"+original.toString("base64"),layoutUrl="data:image/png;base64,"+layout.toString("base64");
  await db.addArtworks(email,[{id:"adaptive-product",title:"产品",category:"main",prompt:"",status:"completed",image:productUrl,gradient:"",origin:"canvas",ratio:null,resolution:"1K",width:64,height:64},{id:"adaptive-layout",title:"布局",category:"main",prompt:"",status:"completed",image:layoutUrl,gradient:"",origin:"canvas",ratio:null,resolution:"1K",width:64,height:192}],"fixture");
  const cookie="nv_user="+(await import("../src/lib/native-auth")).signUserSession(email,Date.now());
  const {POST}=await import("../src/app/api/canvas/expand/route");
  const request=(ratio="1:3",model="image-a",id=randomUUID())=>new Request(f.origin+"/api/canvas/expand",{method:"POST",headers:{cookie,"content-type":"application/json","x-naumi-canvas":"1","x-naumi-client-entry":"canvas","x-naumi-billing-operation-id":id,"x-naumi-feature-model":model,"x-naumi-billing-version":String(price.version),"x-naumi-billing-credits":"1"},body:JSON.stringify({artworkId:"adaptive-product",ratio,anchor:"center",quality:"medium"})});
  const id=randomUUID(),response=await POST(request("1:3","image-a",id)),body=await response.json();
  if(baseline){assert.equal(response.status,400,JSON.stringify(body));assert.equal(body.code,"CANVAS_PARAMETER_UNSUPPORTED");assert.equal(posts,0);console.log("BASELINE_HANDLER=REPRODUCED HTTP=400 CODE=CANVAS_PARAMETER_UNSUPPORTED RATIO=1:3 FIXTURE_POSTS=0");return;}
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(posts,1);assert.equal(body.width,64);assert.equal(body.height,192);
  const replay=await POST(request("1:3","image-a",id));assert.equal(replay.status,200);assert.equal((await replay.json()).id,body.id);assert.equal(posts,1,"receipt replay no provider POST");
  expectedMask=true;const masked=await POST(request("1:3","image-mask")),maskedBody=await masked.json();assert.equal(masked.status,200,JSON.stringify(maskedBody));assert.equal(posts,2);
  const flow=await POST(request("1:3","image-flow")),flowBody=await flow.json();assert.equal(flow.status,200,JSON.stringify(flowBody));assert.equal(posts,3);
  for(const result of [body,maskedBody,flowBody]){
   const art=(await db.listArtworksByIds(email,[result.id]))[0];assert.equal(art.ratio,"1:3");assert.equal(art.parentId,"adaptive-product");
   const bytes=art.image.startsWith("data:")?Buffer.from(art.image.split(",")[1],"base64"):(await(await import("../src/lib/storage")).readManagedObject(art.image)).bytes;
   const raw=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const retained=await sharp(bytes).extract({left:0,top:64,width:64,height:64}).ensureAlpha().raw().toBuffer();
   assert(retained.equals(await sharp(original).ensureAlpha().raw().toBuffer()),"source region pixel-exact");assert.equal(raw.info.width,64);assert.equal(raw.info.height,192);assert.equal(raw.data[3],255,"outside fully visible");
  }
  const noOp=await POST(request("1:1"));assert.equal(noOp.status,400);assert.equal(posts,3);assert.equal((await noOp.json()).code,"EXPAND_INPUT_INVALID");
  const {agentImagegenRequest}=await import("../src/lib/imagegen/agent-request"),{planImagegen}=await import("../src/lib/imagegen/plan");
  const canvas={anchorId:"adaptive-product",imageUrls:[productUrl,layoutUrl],imageModelId:"image-a",ratio:"auto",resolution:"1K",quality:"medium"};
  let plans=0;
  for(const urls of [[productUrl,layoutUrl],[layoutUrl,productUrl]]){
   const request=await agentImagegenRequest("generate_image",{image_urls:urls,frame_image_url:layoutUrl,prompt:"将产品替换到布局，保留布局比例"},email,canvas);
   assert.equal(request.parameters.ratio,"auto");assert.equal(request.frameSourceId,"adaptive-layout");
   const frozen=await planImagegen(request,email);assert.equal(frozen.request.parameters.ratio,"1:3");assert.equal(frozen.request.parameters.resolution,"1K");assert.equal(frozen.totalCredits,2);plans++;
   const explicit=await planImagegen({...request,parameters:{...request.parameters,ratio:"3:4"}},email);assert.equal(explicit.request.parameters.ratio,"3:4");assert.equal(explicit.totalCredits,2);plans++;
  }
  const single=await agentImagegenRequest("generate_image",{image_urls:[layoutUrl],prompt:"去掉图中文字"},email,{...canvas,imageUrls:[layoutUrl]});assert.equal((await planImagegen(single,email)).request.parameters.ratio,"1:3");plans++;
  const ambiguous=await agentImagegenRequest("generate_image",{prompt:"合成"},email,canvas);await assert.rejects(()=>planImagegen(ambiguous,email),/参考图比例不同/);
  await assert.rejects(()=>agentImagegenRequest("generate_image",{frame_image_url:"/media/foreign.png",prompt:"生成"},email,canvas),/画幅来源必须/);
  const badMask=new FormData();badMask.append("image",new File([new Uint8Array(original)],"original.png",{type:"image/png"}));badMask.append("mask",new File([new Uint8Array(original)],"mask.png",{type:"image/png"}));badMask.set("model","image-flow");badMask.set("quality","medium");
  const {withModelRequest}=await import("../src/lib/model-config/requests");await assert.rejects(()=>withModelRequest(new Request(f.origin+"/api/canvas/annotate",{method:"POST",headers:{cookie},body:badMask}),async()=>null),(error:any)=>error.code==="MODEL_INCOMPATIBLE");
  const debits=await db.getPool().query("SELECT count(*)::int AS n,sum(-delta)::int AS credits FROM app_ledger WHERE email=$1 AND delta<0",[email]);assert.equal(debits.rows[0].n,3);assert.equal(debits.rows[0].credits,3);assert.equal(posts,3);
  console.log(`ADAPTIVE_HANDLER=PASS EXPAND_NO_MASK=200 FLOW_EDIT_ONLY=200 EXPAND_MASK=200 ORIGINAL_PIXELS=EXACT SAME_ASPECT=400 REPLAY_POSTS=0 AGENT_REAL_PLANS=${plans} ACTUAL_RATIO=1:3 EXPLICIT=3:4 SOURCE_HINT=VALIDATED ADMIN_QUALITY=high QUOTE=UNCHANGED CHARGES=3 FIXTURE_POSTS=3 EXTERNAL_SUPPLIER_CALLS=0`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
