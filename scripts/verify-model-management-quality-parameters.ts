import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";
import {DISPLAY_QUALITY_IDS,DEFAULT_QUALITY_LABELS} from "../src/lib/model-config/quality-policy";

async function main(){
 const wire:any[]=[];let digest="";
 const png=await sharp({create:{width:1024,height:1024,channels:4,background:"white"}}).png().toBuffer();
 const f=await createModelFixture(async(req,res)=>{
  if(req.url==="/mock.png"){res.setHeader("content-type","image/png");return res.end(png);}
  const parts:Buffer[]=[];for await(const part of req)parts.push(Buffer.from(part));
  const request=new Request("http://mock"+req.url,{method:"POST",headers:{"content-type":String(req.headers["content-type"]||"application/json")},body:Buffer.concat(parts)});
  let body:any={};if(parts.length){if(request.headers.get("content-type")!.includes("multipart")){const form=await request.formData();body=Object.fromEntries(form);body.imageFiles=Array.from(form.values()).filter(v=>typeof v!=="string").length;}else body=await request.json();}
  res.setHeader("content-type","application/json");
  if(req.url==="/internal/config/state")return res.end(JSON.stringify({digest}));
  if(req.url==="/internal/config/prepare")return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
  if(req.url==="/internal/config/activate"){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
  if(req.url==="/v1/chat/completions"){wire.push(body);res.setHeader("content-type","text/event-stream");return res.end('data: '+JSON.stringify({choices:[{delta:{content:"![image]("+f.origin+"/mock.png)"}}]})+'\n\ndata: [DONE]\n\n');}
  if(req.url==="/v1/images/generations"||req.url==="/v1/images/edits"){wire.push(body);return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}
  res.statusCode=404;res.end('{}');
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"quality-policy-router-fixture-long",MODEL_CONFIG_ENVELOPE_SECRET:"quality-policy-envelope-fixture-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_IMAGE_MODEL:"gpt-image-2",STORAGE_DRIVER:"local",MEDIA_DIR:"output/managed-model-parameters-20261009/media"});
 const db=await import("../src/lib/db");
 try{
  f.config.upstreamModels[0].capabilities.preserveIdentity=true;
  const original=await f.repo.current();await db.ensureSchema();await db.setSetting("multi_user_enabled","1");const email="quality-policy@example.test";await db.getOrCreateUser(email);await db.addCreditBatch(email,10000,{source:"admin",reason:"isolated fixture"});
  const admin=await(await import("../src/lib/model-config/server")).getModelAdministration(),b0=await admin.billing.current(),billing=fixtureConfig();billing.switches.metering="on";await admin.billing.publish({id:randomUUID(),expectedVersion:b0.version,config:billing,actor:"fixture",reason:"fixture"});
  const priceBefore=await admin.billing.current(),draft=await admin.repo.draft("fixture-admin");
  const handler=(await import("../src/lib/model-config/management-access")).createModelManagementHandler({authorize:async()=>({actor:"fixture-admin"}),managed:async()=>true,administration:async()=>admin});
  const request=(body?:unknown)=>new Request(f.origin+"/api/admin/model-management",{method:body?"POST":"GET",headers:{"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const initial=await(await handler(request())).json(),row=initial.rows[0],choices=DISPLAY_QUALITY_IDS.map(id=>({id,label:id==="max"?"旗舰":DEFAULT_QUALITY_LABELS[id]}));
  const parameters={choices,routes:[{upstreamId:"u1",mode:"map",values:{low:"medium",medium:"medium",high:"low",xhigh:"high",max:"high"},evidence:{status:"accepted",source:"isolated HTTP mock only",checkedAt:"2026-10-09"}}]};
  const body={action:"parameters",id:randomUUID(),expectedVersion:original.version,rowId:row.id,parameters};
  assert.equal((await handler(request({...body,parameters:{...parameters,routes:[]}}))).status,400);
  assert.equal((await handler(request({...body,parameters:{...parameters,choices:[choices[0],choices[0]]}}))).status,400);
  assert.equal((await handler(request(body))).status,200);const mapped=await admin.repo.current();assert.equal((await handler(request(body))).status,200);assert.equal((await admin.repo.current()).version,mapped.version);
  assert.deepEqual(mapped.config.upstreamModels[0].capabilities,original.config.upstreamModels[0].capabilities);assert.deepEqual(mapped.config.publicModels,original.config.publicModels);assert.deepEqual(await admin.repo.draft("fixture-admin"),draft);assert.deepEqual(await admin.billing.current(),priceBefore);
  const catalog=(await import("../src/lib/model-config/runtime")).publicModelCatalog(mapped,"image","image.generate");assert.deepEqual(catalog.models[0].qualities,DISPLAY_QUALITY_IDS);assert.ok("qualityLabels" in catalog.models[0]);assert.equal(catalog.models[0].qualityLabels!.max,"旗舰");
  const {signUserSession}=await import("../src/lib/native-auth"),cookie=`nv_user=${signUserSession(email,Date.now())}`;
  const req=(path:string,data?:unknown,headers:Record<string,string>={})=>new Request(f.origin+path,{method:data?"POST":"GET",headers:{cookie,"content-type":"application/json",...headers},...(data?{body:JSON.stringify(data)}:{})});
  const quoteApi=await import("../src/app/api/billing/quote/route"),gen=await import("../src/app/api/generate-image/route");
  const q=await(await quoteApi.POST(req("/api/billing/quote",{feature:"image.generate",modelId:"image-a",quality:"max",resolution:"1K",quantity:1}))).json();assert.ok(q.credits>0);assert.equal(q.requestedParameters.quality,"max");assert.equal(q.effectiveParameters.quality,"high");
  const created=await gen.POST(req("/api/generate-image",{prompt:"isolated parameter mapping",model:"image-a",quality:"max",resolution:"1K",ratio:"1:1",count:1},{"x-naumi-model-version":String(q.modelVersion),"x-naumi-billing-version":String(q.version),"x-naumi-billing-credits":String(q.credits),"x-naumi-billing-operation-id":randomUUID()}));assert.equal(created.status,200,await created.clone().text());const id=(await created.json()).jobId;
  let done:any;for(let i=0;i<100;i++){done=await(await gen.GET(req("/api/generate-image?job="+id))).json();if(["done","error"].includes(done.status))break;await new Promise(r=>setTimeout(r,50));}assert.equal(done.status,"done",JSON.stringify(done));assert.equal(wire.at(-1).quality,"high","map original max once, not max→high→low");assert.equal(await db.getImageJobChargedCredits(id),q.credits);
  const audits=(await db.getPool().query("SELECT requested_quality,executed_quality FROM app_image_cost_audit WHERE job_id=$1",[id])).rows;assert.equal(audits[0].requested_quality,"max");assert.equal(audits[0].executed_quality,"high");
  const executor=(await import("../src/lib/model-config/execution")).createModelExecutor({runtime:admin.runtime,credentials:admin.credentials,trustedOrigins:[f.origin],gateway:()=>({baseUrl:f.origin,apiKey:"fixture"})});
  const frozen=await executor.resolve({feature:"image.generate",binding:"image.generate",requestedModelId:"image-a",snapshot:mapped,billing:priceBefore,facts:{task:"product",quality:"max",resolution:"1K",ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0}});
  const {executionFetch}=await import("../src/lib/model-config/clients"),scope=await executor.describe(frozen);
  const form=new FormData();form.set("model","image-a");form.set("quality","high");form.set("prompt","multipart mapping");form.set("image",new Blob([new Uint8Array(png)],{type:"image/png"}),"mock.png");assert.equal((await executionFetch(scope,{trustedOrigins:[f.origin]})(f.origin+"/v1/images/edits",{method:"POST",body:form})).status,200);assert.equal(wire.at(-1).quality,"high");assert.equal(wire.at(-1).imageFiles,1);
  const update=async(mode:string,values=parameters.routes[0].values)=>{const current=await admin.repo.current();const r=await handler(request({...body,id:randomUUID(),expectedVersion:current.version,parameters:{choices,routes:[{...parameters.routes[0],mode,values}]}}));assert.equal(r.status,200,await r.clone().text());return admin.repo.current();};
  await update("map",{...parameters.routes[0].values,max:"low"});const old=await executor.clientFor(frozen);await old.client.images.generate({model:"image-a",prompt:"frozen mapping",quality:"high",n:1});assert.equal(wire.at(-1).quality,"high","accepted execution retains old mapping after new publication");
  const omitted=await update("omit"),omittedFrozen=await executor.resolve({...frozen,binding:"image.generate",requestedModelId:"image-a",snapshot:omitted,billing:priceBefore,facts:frozen.facts} as any),omitScope=await executor.describe(omittedFrozen);
  const omitForm=new FormData();omitForm.set("model","image-a");omitForm.set("quality","max");omitForm.set("prompt","omit multipart");omitForm.set("image",new Blob([new Uint8Array(png)],{type:"image/png"}),"mock.png");await executionFetch(omitScope,{trustedOrigins:[f.origin]})(f.origin+"/v1/images/edits",{method:"POST",body:omitForm});assert.ok(!("quality" in wire.at(-1)));assert.equal(wire.at(-1).imageFiles,1);
  const oq=await(await quoteApi.POST(req("/api/billing/quote",{feature:"image.generate",modelId:"image-a",quality:"max",resolution:"1K",quantity:1}))).json();assert.equal(oq.credits,q.credits);assert.equal(oq.effectiveParameters.quality,"auto");
  const publishConfig=async(config:typeof mapped.config)=>{const current=await admin.repo.current(),d=await admin.repo.draft("flow-fixture"),saved=await admin.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor:"flow-fixture"});assert.equal((await admin.runtime.publish({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:"flow-fixture",reason:"isolated Flow adapter"})).phase,"applied");return admin.repo.current();};
  const flowConfig=structuredClone((await admin.repo.current()).config);flowConfig.providers[0].protocol="new-api-flow";flowConfig.upstreamModels[0].model="gemini-3.0-pro-image-square";flowConfig.upstreamModels[0].parameterMap.qualityPolicy!.mode="map";flowConfig.upstreamModels[0].parameterMap.qualityPolicy!.choices=choices.map(c=>({...c,value:"vendor-high"}));const flow=await publishConfig(flowConfig);
  const ff=await executor.resolve({feature:"image.generate",binding:"image.generate",snapshot:flow,billing:priceBefore,requestedModelId:"image-a",facts:frozen.facts});await(await executor.clientFor(ff)).client.images.generate({model:"image-a",prompt:"flow map",quality:"max" as never,n:1});assert.equal(wire.at(-1).quality,"vendor-high");
  flowConfig.upstreamModels[0].parameterMap.qualityPolicy!.mode="omit";const noFlow=await publishConfig(flowConfig);const nf=await executor.resolve({feature:"image.generate",binding:"image.generate",snapshot:noFlow,billing:priceBefore,requestedModelId:"image-a",facts:frozen.facts});await(await executor.clientFor(nf)).client.images.generate({model:"image-a",prompt:"flow omit",quality:"max" as never,n:1});assert.ok(!("quality" in wire.at(-1)));
  assert.deepEqual(await admin.billing.current(),priceBefore);console.log("MODEL_MANAGEMENT_PARAMETERS=PASS FIVE_CUSTOM_LABELS=PASS JSON_MULTIPART_MAP_OMIT=PASS FLOW_MAP_OMIT=PASS NO_DOUBLE_MAPPING=PASS REQUESTED_PRICE_NATIVE_AUDIT=PASS FROZEN_POLICY=PASS CAPABILITIES_PRICE_DRAFT_PRESERVED=PASS REAL_PAID_CALLS=0");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
