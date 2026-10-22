import assert from "node:assert/strict";
import {fixtureModelConfig} from "./model-config-unit-fixture";
import {validateModelConfig} from "../src/lib/model-config/schema";
import {makeVideoFamilyPlan,rollbackVideoFamilyPlan,VERIFIED_VIDEO_FAMILIES,videoFamilyActivationEnabled,ACTIVE_VIDEO_FAMILY_ITEMS} from "../src/lib/model-config/video-family-preset";
import {publicModelCatalog} from "../src/lib/model-config/runtime";
import {ModelConfigError,type ModelConfig,type UpstreamModel} from "../src/lib/model-config/types";
import {normalizeVideoInput,resolveVideoCapability,VideoContractError} from "../src/lib/video/contract";
import {reconcileVideoSettings,type VideoNodeConfig} from "../src/lib/video/client-settings";
import {buildVideoCreate,type VideoWireContext} from "../src/lib/video/providers/wire";
import type {VideoGenerationRequest,VideoReference} from "../src/lib/video/types";
import type {VideoMode,VideoWireProfile} from "../src/lib/video/capability-schema";

// Entirely synthetic configuration. No snapshot, database, credentials or HTTP.
const refs={
  image:"11111111-1111-4111-8111-111111111111",
  apib:"22222222-2222-4222-8222-222222222222",
  geekImage:"33333333-3333-4333-8333-333333333333",
  legacy:"44444444-4444-4444-8444-444444444444",
  "geeknow-video":"55555555-5555-4555-8555-555555555555",
  "geeknow-video-h3":"66666666-6666-4666-8666-666666666666",
};
const image:VideoReference={id:"synthetic-image",kind:"image",role:"reference",url:"https://media.example.test/image.png"};
const sourceVideo:VideoReference={id:"synthetic-video",kind:"video",role:"source_video",url:"https://media.example.test/video.mp4",durationSeconds:5};
const price={mode:"cny-fixed" as const,amountMicros:"1234567",creditsPerCnyMicros:"10000000",rounding:"ceil" as const};
function upstream(id:string,providerId:string,model:string):UpstreamModel{
  return {id,providerId,model,label:model,modality:"video",enabled:true,parameterMap:{},capabilities:{verified:true,generate:true,edit:false,vision:false,preserveIdentity:false,textAccuracy:false,transparent:false,qualityRank:1,qualities:[],nativeResolutions:[],maxReferenceImages:0,expectedLatencyMs:0}};
}
function baseline():ModelConfig{
  const config=fixtureModelConfig("https://images.example.test/v1",refs.image);
  config.providers.push(
    {id:"apib-video",name:"APIB Video",protocol:"apimart",baseUrl:"https://api.apib.ai/v1",credentialRef:refs.apib,enabled:false,timeoutMs:90000,maxConcurrent:1},
    {id:"geeknow-images",name:"Geek Images",protocol:"openai-images",baseUrl:"https://www.geeknow.top/v1",credentialRef:refs.geekImage,enabled:true,timeoutMs:120000,maxConcurrent:4},
    {id:"legacy-video-provider",name:"Existing video supplier",protocol:"openai-videos",baseUrl:"https://legacy.example.test/v1",credentialRef:refs.legacy,enabled:true,timeoutMs:120000,maxConcurrent:1},
  );
  const reused=upstream("existing-seedance-fast","apib-video","seedance-1-0-pro-fast");
  reused.enabled=false;reused.capabilities.verified=false;reused.costRef="preserve-explicit-procurement";
  reused.procurement={currency:"CNY",source:"Synthetic administrator price",updatedAt:"2026-10-22T00:00:00.000Z",basis:"task",amountMicros:"120000"};
  config.upstreamModels.push(reused,upstream("old-video-upstream","legacy-video-provider","old-video-wire"));
  config.publicModels.push({id:"old-video",label:"Existing video",modality:"video",enabled:true,visible:true,target:{type:"upstream",id:"old-video-upstream"},toolScope:{features:["video.generate"],defaultFor:["video.generate"]}});
  config.bindings["video.generate"]="old-video";
  config.business={"image.generate":{enabled:true,defaultModelId:"image-a",options:[{modelId:"image-a",enabled:true,sort:0,unit:"image",pricing:structuredClone(price)}]}};
  config.fixedMonthlyCosts=[{id:"fixed-existing",name:"Existing hosting",amountCnyMicros:"33000000",enabled:true}];
  return config;
}
let assertions=0;
function equal(actual:unknown,expected:unknown,message:string){assert.deepEqual(actual,expected,message);assertions++;}
function conflict(run:()=>unknown,message:string){assert.throws(run,error=>error instanceof ModelConfigError&&error.code==="VIDEO_FAMILY_PLAN_CONFLICT",message);assertions++;}
function invalidInput(raw:Record<string,unknown>,cap:Parameters<typeof normalizeVideoInput>[1],message:string){
  assert.throws(()=>normalizeVideoInput(raw,cap),error=>error instanceof VideoContractError,message);assertions++;
}
const initial=baseline(),unchanged=structuredClone(initial);
validateModelConfig(initial);
const plan=makeVideoFamilyPlan(initial,refs),config=validateModelConfig(plan.config);
equal(initial,unchanged,"Planning does not mutate the existing registry");
equal(plan.publicModelIds.length,32,"Exactly 32 ordinary video-node SKUs are activated");
equal(new Set(plan.publicModelIds).size,32,"Active public IDs are unique");
equal(plan.upstreamIds.length,32,"Exactly 32 upstream targets are activated");
equal(new Set(plan.upstreamIds).size,32,"Active upstream IDs are unique");
equal(ACTIVE_VIDEO_FAMILY_ITEMS.length,32,"The video-reference editing branch is excluded from activation");
equal(VERIFIED_VIDEO_FAMILIES.items.length,33,"All 33 independent supplier receipts remain declared");
equal(VERIFIED_VIDEO_FAMILIES.items.filter(item=>item.providerId==="apib-video").length,22,"APIB uses 22 tested ordinary-node SKUs");
equal(VERIFIED_VIDEO_FAMILIES.items.filter(item=>item.sourceProviderId==="geeknow-images").length,11,"Geek uses 11 tested SKUs");
equal(VERIFIED_VIDEO_FAMILIES.items.some(item=>item.model==="MiniMax-H3-Regeneration"||item.model==="wan2.7"),false,"Regeneration and pending Wan2.7 text are excluded");
equal(new Set(VERIFIED_VIDEO_FAMILIES.items.map(item=>item.family)),new Set(["seedance","kling","wan","h3"]),"Only requested families are published");
equal(config.bindings["video.generate"],plan.defaultPublicModelId,"Video binding uses declared default");
equal(config.publicModels.filter(model=>model.toolScope?.defaultFor.includes("video.generate")).map(model=>model.id),[plan.defaultPublicModelId],"Exactly one video tool default");
equal(config.publicModels.find(model=>model.id==="old-video")!.toolScope!.defaultFor,[],"Existing default designation is removed without deleting the model");

// Preserve non-video control-plane data and the active customer pricing source.
for(const entity of ["providers","upstreamModels","publicModels"] as const){
  const nonVideo=entity==="providers"?initial.providers.filter(row=>!["apib-video","legacy-video-provider"].includes(row.id)):
    entity==="upstreamModels"?initial.upstreamModels.filter(row=>row.modality!=="video"):initial.publicModels.filter(row=>row.modality!=="video");
  for(const before of nonVideo)equal(config[entity].find(row=>row.id===before.id),before,`${entity}/${before.id}: unrelated row preserved`);
}
equal(config.bindings["image.generate"],initial.bindings["image.generate"],"Image generation binding preserved");
equal(config.bindings["image.edit"],initial.bindings["image.edit"],"Image editing binding preserved");
equal(config.pools,initial.pools,"Routing pools preserved");
equal(config.business,initial.business,"No video business entry means existing billing fallback remains unchanged");
equal(config.fixedMonthlyCosts,initial.fixedMonthlyCosts,"Fixed costs preserved");
equal(config.upstreamModels.find(row=>row.id==="existing-seedance-fast")!.costRef,"preserve-explicit-procurement","Reused APIB target retains existing procurement reference");
equal(config.upstreamModels.find(row=>row.id==="existing-seedance-fast")!.procurement,initial.upstreamModels.find(row=>row.id==="existing-seedance-fast")!.procurement,"Reused APIB target retains manual procurement data");
equal(config.upstreamModels.filter(row=>row.providerId==="apib-video"&&row.model==="seedance-1-0-pro-fast").map(row=>row.id),["existing-seedance-fast"],"Existing APIB upstream reused");
for(const providerId of ["geeknow-video","geeknow-video-h3"] as const){
  const provider=config.providers.find(row=>row.id===providerId)!;
  equal(provider.credentialRef,refs[providerId],`${providerId}: uses its own imported credential reference`);
  assert.notEqual(provider.credentialRef,refs.geekImage);assertions++;
  equal(provider.enabled,true,`${providerId}: enabled`);
}
equal(config.providers.find(row=>row.id==="geeknow-video")!.protocol,"openai-videos","Geek JSON video has its own compatible provider");
equal(config.providers.find(row=>row.id==="geeknow-video-h3")!.options,{videoProfile:"minimax",createPath:"/v1/videos",pollPath:"/v1/videos/{id}",idempotencyStrategy:"header"},"Geek H3 has explicit protocol/path overrides");

// Independent expectations from the verified request plans, not a live snapshot.
const expected=new Map<string,{duration:number;resolution:string;mode:VideoMode}>();
function expect(provider:string,model:string,duration:number,resolution:string,mode:VideoMode="text"){expected.set(`${provider}/${model}`,{duration,resolution,mode});}
for(const model of ["seedance-1-0-pro-fast","seedance-1-0-pro-quality"])expect("apib-video",model,2,"480p");
for(const model of ["seedance-1-5-pro","seedance-2.0","seedance-2.0-fast","seedance-2.0-mini","seedance-2.5"])expect("apib-video",model,4,"480p");
for(const model of ["kling-3.0-turbo","kling-v3","kling-v3-omni","kling-v4"])expect("apib-video",model,3,"720p");
for(const model of ["kling-v2-6","kling-video-o1"])expect("apib-video",model,5,"720p");
expect("apib-video","wan2.5-preview",5,"480p");expect("apib-video","wan2.6",5,"720p");
expect("apib-video","wan2.6-i2v-flash",2,"720p","single_image");expect("apib-video","wan2.7-r2v",2,"720P","reference");expect("apib-video","wan2.7-videoedit",2,"720P","video_edit");
for(const model of ["wan3.0-video","wan3.0-video-prime"])expect("apib-video",model,2,"480P");
expect("apib-video","MiniMax-H3",4,"768P");expect("apib-video","MiniMax-H3-Max",5,"480P");
for(const model of ["kling-1.6-720p","kling-2.0-720p","kling-2.1-720p","kling-2.5-720p","kling-2.6-mute-720p","kling-3.0-720p-mute","kling-3.0-omni-720p-noref-mute","kling-o1-720p"])expect("geeknow-video",model,5,"720P");
expect("geeknow-video","kling-3.0-omni-720p-ref-mute",5,"720P","reference");expect("geeknow-video","wan3.0-video",2,"480P");expect("geeknow-video-h3","MiniMax-H3",1,"768P");
equal(expected.size,33,"Independent successful-spec table retains every declared receipt");
let compiled=0,unknownAudioCleared=0,adaptiveBranches=0,disabled=0;
for(const item of VERIFIED_VIDEO_FAMILIES.items){
  const id=`${item.providerId}/${item.model}`,spec=expected.get(id);assert(spec,`${id}: no independent request receipt`);assertions++;
  const publicModel=config.publicModels.find(row=>row.id===item.publicId)!;
  assert(publicModel.target.type==="upstream");assertions++;
  const target=config.upstreamModels.find(row=>row.id===publicModel.target.id)!,provider=config.providers.find(row=>row.id===target.providerId)!;
  equal(target.capabilities.verified,true,`${id}: verified capability`);
  const enabled=videoFamilyActivationEnabled(item);
  equal(target.capabilities.generate,enabled,`${id}: generation follows activation availability`);
  equal(target.enabled,enabled,`${id}: upstream availability is explicit`);
  equal({enabled:publicModel.enabled,visible:publicModel.visible},{enabled,visible:enabled},`${id}: catalog availability follows activation`);
  equal(publicModel.toolScope,{features:enabled?["video.generate"]:[],defaultFor:enabled&&item.publicId===plan.defaultPublicModelId?["video.generate"]:[]},`${id}: only active models enter video tool scope`);
  equal(item.definition.durationResolutionMap,[{durations:[spec.duration],resolutions:[spec.resolution]}],`${id}: capability only advertises the tested duration/spec`);
  equal(item.definition.modes,[spec.mode],`${id}: capability only advertises the tested mode`);
  assert.match(item.evidence.sha256,/^[a-f0-9]{64}$/);assertions++;
  equal(item.evidence.decoded,true,`${id}: media decode receipt exists`);
  assert(item.evidence.width>0&&item.evidence.height>0&&item.evidence.durationSeconds>0);assertions++;
  assert(item.evidence.sourceURLs.length>0&&item.evidence.sourceURLs.every(url=>url.startsWith("https://")));assertions++;
  if(!enabled){
    equal(item.model,"wan2.7-videoedit",`${id}: only the known special video-input branch is excluded`);
    equal(target.capabilities.edit,false,`${id}: an alternative edit capability cannot bypass isolation`);
    equal(plan.publicModelIds.includes(item.publicId)||plan.upstreamIds.includes(target.id)||plan.wireModels.includes(item.model),false,`${id}: no activation receipt advertises the excluded model`);
    assert.notEqual(plan.defaultPublicModelId,item.publicId);assertions++;disabled++;continue;
  }
  const cap=resolveVideoCapability({manual:target.capabilities.video});
  const references:VideoReference[]=spec.mode==="video_edit"?[sourceVideo]:spec.mode==="single_image"||spec.mode==="reference"?[image]:[];
  const dirty:VideoNodeConfig={providerId:"managed-video",modelId:item.publicId,prompt:"Synthetic red cube",references,mode:"motion_control",durationSeconds:99,resolution:"invalid",aspectRatio:"9:99",generateAudio:true,watermark:false,negativePrompt:"Old option",width:512,height:512,providerOptions:{obsolete:false}};
  const reconciled=reconcileVideoSettings(dirty,cap).config;
  equal(reconciled.mode,spec.mode,`${id}: client selects supported mode`);
  equal(reconciled.durationSeconds,spec.duration,`${id}: client selects supported duration`);
  equal(reconciled.resolution,spec.resolution,`${id}: client selects supported resolution`);
  equal(reconciled.providerOptions,{},`${id}: client clears obsolete options`);
  if(cap.audio==null){equal("generateAudio" in reconciled,false,`${id}: unknown audio removes a prior boolean`);unknownAudioCleared++;}
  else equal(reconciled.generateAudio,cap.audio==="required",`${id}: client applies declared audio setting`);
  const normalized=normalizeVideoInput(reconciled as Record<string,unknown>,cap);
  const request:VideoGenerationRequest={...normalized,source:"canvas",providerId:provider.id,modelId:target.model,idempotencyKey:"synthetic-family-regression"};
  const profile=(target.parameterMap.videoProfile||provider.options?.videoProfile) as VideoWireProfile;
  const ctx:VideoWireContext={profile,provider:{id:provider.id,label:provider.name,protocol:provider.protocol as VideoWireContext["provider"]["protocol"],baseUrl:provider.baseUrl,apiKey:"synthetic-unused-key",models:[target.model],defaultModel:target.model,...provider.options,idempotencyStrategy:provider.options?.idempotencyStrategy||"none"},request};
  const wire=buildVideoCreate(ctx);
  equal(wire.method,"POST",`${id}: reconciled UI configuration compiles`);compiled++;
  invalidInput({...reconciled,durationSeconds:spec.duration+1},cap,`${id}: untested duration rejected by capability gate`);
  invalidInput({...reconciled,resolution:"2160p"},cap,`${id}: untested resolution rejected by capability gate`);
  invalidInput({...reconciled,mode:spec.mode==="text"?"reference":"text"},cap,`${id}: untested mode rejected by capability gate`);
  if(reconciled.aspectRatio==="adaptive"){
    equal(spec.mode==="single_image"||spec.mode==="video_edit",true,`${id}: adaptive belongs to frame-conditioned mode`);
    equal("aspect_ratio" in (wire.body as object),false,`${id}: adaptive inherits actual reference dimensions`);adaptiveBranches++;
  }
}
equal(compiled,32,"All 32 active selections pass client reconcile -> input normalization -> protocol construction");
equal(disabled,1,"One declared video-reference editing branch remains disabled");
equal(plan.excludedModels,[{publicModelId:"video-apib-wan2-7-videoedit",upstreamId:config.upstreamModels.find(row=>row.providerId==="apib-video"&&row.model==="wan2.7-videoedit")!.id,model:"wan2.7-videoedit",reason:"VIDEO_EDITING_REQUIRES_SEPARATE_ACCEPTANCE"}],"Exclusion carries its exact reason and preserved declaration");
const catalog=publicModelCatalog({version:1,digest:"synthetic-fixture",config},"video","video.generate");
equal(catalog.models.some(model=>model.id==="video-apib-wan2-7-videoedit"),false,"Disabled video editing cannot appear in the visible catalog");
for(const id of plan.publicModelIds)assert(catalog.models.some(model=>model.id===id),`${id}: active catalog option exists`);
equal(catalog.defaultModelId,plan.defaultPublicModelId,"Visible catalog uses the active default");
assert(unknownAudioCleared>0);assertions++;
equal(adaptiveBranches,1,"Only the active image-conditioned Wan branch reaches adaptive compilation");

const again=makeVideoFamilyPlan(plan.config,refs);
equal(again.config,plan.config,"Repeated plan is idempotent");
equal(again.patches,[],"Repeated plan does not create redundant row patches");
equal(rollbackVideoFamilyPlan(plan.config,plan),initial,"Selective rollback restores original rows, default and business source");

// Existing customer video pricing is copied, never replaced by an invented tariff.
const pricedSource=baseline();
pricedSource.business!["video.generate"]={enabled:true,defaultModelId:"old-video",options:[{modelId:"old-video",enabled:true,sort:7,unit:"task",pricing:structuredClone(price)}]};
const priced=makeVideoFamilyPlan(pricedSource,refs);validateModelConfig(priced.config);
const videoBusiness=priced.config.business!["video.generate"]!;
equal(videoBusiness.defaultModelId,priced.defaultPublicModelId,"Existing business feature selects new tested default");
for(const publicId of priced.publicModelIds){const option=videoBusiness.options.find(row=>row.modelId===publicId)!;equal({unit:option.unit,pricing:option.pricing},{unit:"task",pricing:price},`${publicId}: retains customer price and unit`);}
equal(priced.config.business!["image.generate"],pricedSource.business!["image.generate"],"Unrelated business pricing preserved");
equal(videoBusiness.options.some(row=>row.modelId==="video-apib-wan2-7-videoedit"),false,"No new customer pricing option is invented for the disabled video edit branch");
equal(rollbackVideoFamilyPlan(priced.config,priced),pricedSource,"Priced feature rollback restores its exact original options");
const previouslyEnabled=structuredClone(priced.config),special=previouslyEnabled.publicModels.find(row=>row.id==="video-apib-wan2-7-videoedit")!,specialUpstream=previouslyEnabled.upstreamModels.find(row=>row.id===special.target.id)!;
special.enabled=true;special.visible=true;special.toolScope={features:["video.generate"],defaultFor:[]};specialUpstream.enabled=true;specialUpstream.capabilities.generate=true;specialUpstream.capabilities.edit=true;
previouslyEnabled.business!["video.generate"]!.options.push({modelId:special.id,enabled:true,sort:99,unit:"task",pricing:structuredClone(price)});
const reIsolated=makeVideoFamilyPlan(previouslyEnabled,refs);validateModelConfig(reIsolated.config);
equal(reIsolated.config.business!["video.generate"]!.options.find(row=>row.modelId===special.id)!.enabled,false,"An existing enabled edit business option is explicitly isolated");
equal(reIsolated.config.business!["video.generate"]!.options.find(row=>row.modelId===special.id)!.pricing,price,"Isolating the edit option does not rewrite its stored price");
equal(reIsolated.config.publicModels.find(row=>row.id===special.id)!.visible,false,"Existing edit exposure is removed");
equal(reIsolated.config.upstreamModels.find(row=>row.id===specialUpstream.id)!.capabilities.generate,false,"Existing edit generation flag is removed");
equal(rollbackVideoFamilyPlan(reIsolated.config,reIsolated),previouslyEnabled,"Selective rollback restores the exact prior special-branch state");
const noPrice=baseline();noPrice.business!["video.generate"]={enabled:true,defaultModelId:"old-video",options:[{modelId:"old-video",enabled:true,sort:0,unit:"task"}]};
conflict(()=>makeVideoFamilyPlan(noPrice,refs),"Missing previous price cannot be guessed");

// Rollback owns only this plan's rows. Preserve unrelated work and reject conflicts.
const unrelated=structuredClone(plan.config);
unrelated.providers.find(row=>row.id==="p1")!.name="Colleague image change";
unrelated.upstreamModels.find(row=>row.id==="u1")!.label="Colleague upstream change";
unrelated.publicModels.find(row=>row.id==="image-a")!.label="Colleague public change";
unrelated.business!["image.generate"]!.options[0].sort=23;
const rolled=rollbackVideoFamilyPlan(unrelated,plan);
equal(rolled.providers.find(row=>row.id==="p1")!.name,"Colleague image change","Rollback preserves unrelated provider changes");
equal(rolled.upstreamModels.find(row=>row.id==="u1")!.label,"Colleague upstream change","Rollback preserves unrelated upstream changes");
equal(rolled.publicModels.find(row=>row.id==="image-a")!.label,"Colleague public change","Rollback preserves unrelated public changes");
equal(rolled.business!["image.generate"]!.options[0].sort,23,"Rollback preserves unrelated business changes");
for(const entity of ["providers","upstreamModels","publicModels"] as const){
  const changed=structuredClone(plan.config),patch=plan.patches.find(row=>row.entity===entity)!;
  const row=changed[entity].find(row=>row.id===patch.id)!;
  if("name" in row)row.name+=" later administrator change";else row.label+=" later administrator change";
  conflict(()=>rollbackVideoFamilyPlan(changed,plan),`${entity}: rollback refuses to overwrite later changes to its own rows`);
}
const changedBinding=structuredClone(plan.config);changedBinding.bindings["video.generate"]="old-video";
conflict(()=>rollbackVideoFamilyPlan(changedBinding,plan),"Rollback refuses a later video binding change");
const changedPrice=structuredClone(priced.config);changedPrice.business!["video.generate"]!.options[0].sort=99;
conflict(()=>rollbackVideoFamilyPlan(changedPrice,priced),"Rollback refuses a later video price/feature change");
const wrongOrigin=baseline();wrongOrigin.providers.find(row=>row.id==="apib-video")!.baseUrl="https://different.example.test/v1";
conflict(()=>makeVideoFamilyPlan(wrongOrigin,refs),"Unexpected supplier origin cannot inherit verification");
conflict(()=>makeVideoFamilyPlan(baseline(),{...refs,"geeknow-video":"not-a-credential-reference"}),"Missing dedicated Geek credential is rejected");
const collided=baseline();collided.providers.push({...collided.providers[1],id:"geeknow-video",name:"Existing different provider"});
conflict(()=>makeVideoFamilyPlan(collided,refs),"Existing provider ID with different settings is not overwritten");

process.stdout.write(`VIDEO_FAMILY_PRESET=PASS active_skus=${compiled} declared_skus=${expected.size} disabled_skus=${disabled} assertions=${assertions} http_calls=0 paid_calls=0 fixtures=synthetic-config\n`);
