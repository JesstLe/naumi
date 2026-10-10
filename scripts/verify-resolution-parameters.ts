import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {toFile} from "openai";
import {createModelFixture} from "./model-config-fixture";
import {metadataResolutionDefaults} from "../src/lib/supplier-models/resolution-defaults";
import {unknownSupplierMetadata} from "../src/lib/supplier-models/types";

async function main(){
  const wire:any[]=[];let digest="",failFirst=false;
  const png=await sharp({create:{width:16,height:16,channels:3,background:"white"}}).png().toBuffer();
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
    const request=new Request("http://mock"+req.url,{method:"POST",headers:{"content-type":String(req.headers["content-type"]||"application/json")},body:Buffer.concat(chunks)});
    let body:any={};if(chunks.length){body=request.headers.get("content-type")!.includes("multipart")?Object.fromEntries(await request.formData()):await request.json();}
    res.setHeader("content-type","application/json");
    if(req.url==="/internal/config/state")return res.end(JSON.stringify({digest}));
    if(req.url==="/internal/config/prepare")return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
    if(req.url==="/internal/config/activate"){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
    if(req.url?.startsWith("/internal/config/publications/")){res.statusCode=404;return res.end("{}");}
    wire.push(body);
    if(failFirst&&body.model==="wire-image-one"){res.statusCode=503;return res.end(JSON.stringify({error:{message:"fixture unavailable"}}));}
    if(req.url==="/v1/chat/completions"){res.setHeader("content-type","text/event-stream");return res.end('data: '+JSON.stringify({choices:[{delta:{content:'![image](data:image/png;base64,'+png.toString("base64")+')'}}]})+'\n\ndata: [DONE]\n\n');}
    res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"resolution-fixture-router-token-long",MODEL_CONFIG_ENVELOPE_SECRET:"resolution-fixture-envelope-secret-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only"});
  const db=await import("../src/lib/db");
  try{
    const unknown={...unknownSupplierMetadata(),id:randomUUID(),providerId:"p1",providerName:"Fixture",modelId:"wire-image-one",label:"Fixture",catalogOwner:"",revision:1,lastSeenAt:"",updatedAt:""};
    const nativeOnly=metadataResolutionDefaults({...unknown,capabilities:{...unknown.capabilities,resolutions:["1K","2K"]}});
    assert.equal(nativeOnly.available,false,"Native list alone cannot guess field/dimensions");
    const credential=await f.credentials.importPlain({providerId:"p2",plain:"fixture-flow-key",actor:"fixture"});
    f.config.providers.push({...f.config.providers[0],id:"p2",name:"Backup",protocol:"new-api-flow",credentialRef:credential.id});
    f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u2",providerId:"p2",model:"nano-banana-pro"});
    f.config.publicModels[0].supplierRouting={mode:"priority",channels:[{upstreamId:"u1",enabled:true,priority:1,weight:1},{upstreamId:"u2",enabled:true,priority:2,weight:1}]};
    const original=await f.repo.current();await db.ensureSchema();
    const admin=await(await import("../src/lib/model-config/server")).getModelAdministration();
    const billing=await admin.billing.current(),draft=await admin.repo.draft("fixture-admin");
    const {ingestSupplierDirectory}=await import("../src/lib/supplier-models/repository");
    await ingestSupplierDirectory(admin.pool,f.config.providers[0],[{id:"wire-image-one",label:"Fixture",ownedBy:""}]);
    const record=(await admin.pool.query("SELECT * FROM app_supplier_model_metadata WHERE provider_id='p1'")).rows[0];
    const metadata={...record.metadata,parameterMetadata:{resolutionDefaults:{mode:"map",field:"size",values:{"1K":"1024x1024","2K":"1536x1024","4K":"2048x2048"}}}};
    await admin.pool.query("UPDATE app_supplier_model_metadata SET metadata=$1::jsonb WHERE id=$2",[JSON.stringify(metadata),record.id]);
    const handler=(await import("../src/lib/model-config/management-access")).createModelManagementHandler({authorize:async()=>({actor:"fixture-admin"}),managed:async()=>true,administration:async()=>admin});
    const request=(body?:unknown)=>new Request(f.origin+"/api/admin/model-management",{method:body?"POST":"GET",headers:{"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    const state=await(await handler(request())).json(),row=state.rows[0];
    assert.equal(row.resolutionConfig.routes[0].mode,"map");assert.equal(row.resolutionConfig.routes[1].mode,"legacy");
    const parameters={routes:[{upstreamId:"u1",mode:"map",field:"size",values:metadata.parameterMetadata.resolutionDefaults.values,metadataRef:{id:record.id,revision:1}},{upstreamId:"u2",mode:"map",field:"resolution",ratioField:"size",values:{"1K":"1k","2K":"2k","4K":"2k"}}]};
    const body={action:"resolutions",id:randomUUID(),expectedVersion:original.version,rowId:row.id,resolutions:["1K","2K","4K"],parameters};
    assert.equal((await handler(request({...body,parameters:{routes:parameters.routes.slice(0,1)}}))).status,400);
    assert.equal((await handler(request({...body,parameters:{routes:[{...parameters.routes[0],values:{"1K":"1024x1024"}},parameters.routes[1]]}}))).status,400);
    assert.equal((await handler(request({...body,parameters:{routes:[{...parameters.routes[0],metadataRef:{id:record.id,revision:2}},parameters.routes[1]]}}))).status,409);
    const response=await handler(request(body));assert.equal(response.status,200,await response.clone().text());
    const mapped=await admin.repo.current();assert.equal((await handler(request(body))).status,200);assert.equal((await admin.repo.current()).version,mapped.version);
    assert.deepEqual(mapped.config.upstreamModels.map(u=>u.capabilities),original.config.upstreamModels.map(u=>u.capabilities));assert.deepEqual(await admin.billing.current(),billing);assert.deepEqual(await admin.repo.draft("fixture-admin"),draft);
    const executor=(await import("../src/lib/model-config/execution")).createModelExecutor({runtime:admin.runtime,credentials:admin.credentials,billingByVersion:admin.billing.byVersion,trustedOrigins:[f.origin],gateway:()=>{throw Error("Must use direct supplier");}});
    const frozen=await executor.resolve({binding:"image.generate",snapshot:mapped,billing,facts:{task:"product",quality:"medium",resolution:"1K",requestedResolution:"4K",ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0}});
    const {client}=await executor.clientFor(frozen);
    await executor.run(frozen,()=>client.images.generate({model:"stale",prompt:"fixture",size:"1024x1024"}));assert.equal(wire.at(-1).size,"2048x2048","Map original 4K display even when generation fact is 1K");
    const image=await toFile(png,"reference.png",{type:"image/png"});
    await executor.run(frozen,()=>client.images.edit({model:"stale",prompt:"fixture",image,size:"1024x1024"}));assert.equal(wire.at(-1).size,"2048x2048");assert.ok(wire.at(-1).image,"Multipart references survive");
    const {withModelRequest}=await import("../src/lib/model-config/requests");const {currentModelExecution}=await import("../src/lib/model-config/context");
    await withModelRequest(new Request(f.origin+"/api/generate-image",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:"fixture",model:"image-a",quality:"medium",resolution:"4K",ratio:"1:1"})}),async()=>{assert.equal(currentModelExecution("image")!.frozen.facts!.requestedResolution,"4K");assert.equal(currentModelExecution("image")!.frozen.facts!.nativeResolution,false);});
    const legacyFrozen=await executor.resolve({binding:"image.generate",snapshot:original,billing,facts:{task:"product",quality:"medium",resolution:"1K",requestedResolution:"2K",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0}});
    const legacyScope=(await executor.describe(legacyFrozen)).supplierRouting!.targets[0].scope;
    const transport=(await import("../src/lib/model-config/clients")).executionFetch(legacyScope,{trustedOrigins:[f.origin]});
    const legacyResponse=await transport(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:"stale",prompt:"legacy mixed route",size:"1024x1024"})});await legacyResponse.text();assert.equal(wire.at(-1).size,"2048x2048","A legacy channel retains its recorded native mapping alongside custom channels");
    failFirst=true;await executor.run(frozen,()=>client.images.generate({model:"stale",prompt:"fallback",size:"1024x1024"}));assert.equal(wire.at(-1).model,"nano-banana-pro");assert.equal(wire.at(-1).resolution,"2k");assert.equal(wire.at(-1).size,"1:1","Resolution and aspect ratio are distinct fields");
    const restore={action:"resolutions",id:randomUUID(),expectedVersion:mapped.version,rowId:row.id,resolutions:["1K"],parameters:null};assert.equal((await handler(request(restore))).status,200);
    const restored=await admin.repo.current();assert.equal(restored.config.upstreamModels[0].parameterMap.resolutionPolicy,undefined);assert.deepEqual(restored.config.upstreamModels[0].parameterMap.resolution,original.config.upstreamModels[0].parameterMap.resolution);
    const scope=await executor.describe(frozen);assert.equal(scope.supplierRouting!.targets[0].scope.parameterMap.resolutionPolicy!.values["4K"],"2048x2048","Accepted job preserves mapping after later publication");
    const {mapResolution}=await import("../src/lib/model-config/resolution-policy");assert.deepEqual(mapResolution({size:"old",resolution:"old",image_config:{image_size:"old",ratio:"1:1"}},{mode:"omit",field:"size",values:{}},"4K"),{image_config:{ratio:"1:1"}});
    const {ingestSupplierSources,readSupplierModel}=await import("../src/lib/supplier-models/repository");
    const docsModel={id:"nano-banana-pro",modality:"image",parameters:[{path:"resolution",options:["1k","2k","4k"],documentation:{values_confirmed:true}},{path:"size",options:["auto","1:1","3:4"],documentation:{values_confirmed:true}}]};
    const {discoverPublicSupplierDirectory}=await import("../src/lib/supplier-models/discovery");
    const independentDocs=await discoverPublicSupplierDirectory({...f.config.providers[1],baseUrl:"https://newapi.prompt-hubs.com/v1"},[],async(url,init)=>{assert.equal(new Headers(init?.headers).has("authorization"),false);return String(url).endsWith("/api/pricing")?new Response("",{status:404}):Response.json({success:true,version:"fixture",models:[docsModel]});});
    assert.ok(independentDocs?.specifications,"Docs remain available when public pricing is unavailable");assert.equal(independentDocs!.body.success,false);
    const source={url:f.origin+"/api/pricing",fetchedAt:new Date().toISOString(),hash:"fixture",body:{success:true,data:[{model_name:"nano-banana-pro",tags:"image"}]},specifications:{url:"https://console.prompt-hubs.com/docs/catalog.json",fetchedAt:new Date().toISOString(),hash:"fixture",body:{version:"fixture",capability_version:"fixture",models:[docsModel,{...docsModel,id:"public-only-model"}]}}};
    const directory={models:[],status:"ok",fetchedAt:source.fetchedAt};await ingestSupplierSources(f.sql,f.config.providers[1],directory,source);
    const docRow=(await f.sql.query("SELECT id,revision FROM app_supplier_model_metadata WHERE provider_id='p2' AND model_id='nano-banana-pro'")).rows[0];
    const defaults=metadataResolutionDefaults(await readSupplierModel(f.sql,docRow.id));assert.equal(defaults.field,"resolution");assert.equal(defaults.ratioField,"size");assert.equal(defaults.values["4K"],"4k");assert.equal(defaults.state,"documented");
    await ingestSupplierSources(f.sql,f.config.providers[1],directory,{...source,fetchedAt:new Date().toISOString()});assert.equal((await readSupplierModel(f.sql,docRow.id)).revision,Number(docRow.revision),"Same public spec does not spam revisions");
    assert.equal((await f.sql.query("SELECT count(*) FROM app_supplier_model_metadata WHERE model_id='public-only-model'")).rows[0].count,"1","Archive public model parameters even without key access");
    const manualDoc=await readSupplierModel(f.sql,record.id);assert.equal(metadataResolutionDefaults(manualDoc).field,"size","Explicit manual library defaults retain priority");
    assert.deepEqual(await admin.repo.current(),restored,"Spec intake never opens execution models or alters customer settings");
    assert.deepEqual(mapResolution({}, {mode:"map",field:"image_config.image_size",values:{"4K":"2K"}},"4K"),{image_config:{image_size:"2K"}});
    console.log("PASS resolution metadata defaults/revision, native API persistence/replay, display vs wire parameters, JSON+multipart, Flow fallback own mapping, frozen task and restore; paid calls=0");
  }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
