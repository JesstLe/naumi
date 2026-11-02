import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import presets from "../src/lib/model-config/video-family-presets.json";
import v2 from "../src/lib/model-config/video-family-capabilities.json";
import {DOCUMENTED_VIDEO_FAMILIES} from "../src/lib/model-config/video-family-capabilities";
import {reviewVideoCapabilityUpgrade,applyReviewedVideoCapabilityUpgrade} from "../src/lib/model-config/video-capability-review";
import {makeVideoFamilyCapabilityUpgradePlan,rollbackVideoFamilyCapabilityUpgradePlan} from "../src/lib/model-config/video-family-capability-upgrade";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";
import {createModelManagementHandler} from "../src/lib/model-config/management-access";
import {createModelRuntime} from "../src/lib/model-config/runtime";
import {createRouterControl,type RouterStatus} from "../src/lib/model-config/router-client";
import {videoProfileProtocol,type VideoModelDefinition,type VideoWireProfile} from "../src/lib/video/capability-schema";
import {freezeManagedVideoCapability} from "../src/lib/video/frozen-capability";
import {resolveVideoCapability} from "../src/lib/video/contract";
import {ModelConfigError} from "../src/lib/model-config/types";

async function main(){
  const f=await createModelFixture();let activeDigest="",activations=0,dropNext=false,checks=0;
  const applied=new Map<string,RouterStatus>();
  const router=createRouterControl({baseUrl:f.origin,token:"video-upgrade-fixture-router-independent-key",envelopeSecret:"video-upgrade-fixture-envelope-independent-key",trustedOrigins:[f.origin]});
  router.prepare=async()=>{};router.state=async()=>activeDigest;router.status=async id=>applied.get(id)||null;
  router.activate=async(id,expected,digest)=>{assert.equal(activeDigest,expected);activations++;activeDigest=digest;const result:RouterStatus={id,digest,phase:"applied"};applied.set(id,result);if(dropNext){dropNext=false;throw new ModelConfigError("ROUTER_UNAVAILABLE","fixture disconnect",503)}return result;};
  const billing={version:1,config:fixtureConfig()};
  const runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,trustedOrigins:[f.origin],billing:async()=>billing,billingByVersion:async()=>billing});
  const administration=async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,router,runtime,billing:{current:async()=>billing},trustedOrigins:[f.origin]}) as never;
  const actor="video-upgrade@example.test",handler=createModelManagementHandler({authorize:async()=>({actor}),administration,managed:async()=>true});
  const request=(body?:unknown,origin?:string)=>new Request("http://fixture/api/admin/model-management"+(body?"":"?view=video-capability-upgrade"),{method:body?"POST":"GET",headers:{...(body?{"content-type":"application/json"}:{}),...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
  try{
    for(const providerId of new Set(presets.items.map(item=>item.providerId))){const item=presets.items.find(item=>item.providerId===providerId)!;const key=await f.credentials.importPlain({providerId,plain:"fixture-"+randomUUID(),actor});f.config.providers.push({id:providerId,name:providerId,protocol:videoProfileProtocol(item.profile as VideoWireProfile),baseUrl:f.origin,credentialRef:key.id,enabled:true,timeoutMs:120000,maxConcurrent:2});}
    for(const [i,item] of presets.items.entries()){
      const id="old-video-"+i,enabled=item.model!=="wan2.7-videoedit";
      f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id,providerId:item.providerId,model:item.model,modality:"video",enabled,parameterMap:{videoProfile:item.profile as VideoWireProfile},costRef:"preserved-price-"+i,capabilities:{...structuredClone(f.config.upstreamModels[0].capabilities),generate:enabled,edit:false,maxReferenceImages:item.definition.limits.images,video:structuredClone(item.definition) as VideoModelDefinition}});
      f.config.publicModels.push({id:item.publicId,label:item.label,modality:"video",enabled,visible:enabled,target:{type:"upstream",id}});
    }
    f.config.bindings["video.generate"]=presets.defaultPublicModelId;
    const old=await f.repo.current();const frozenBefore=(await f.sql.query("SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id",[old.version])).rows;
    const initialDraft=await f.repo.draft(actor),unsaved=structuredClone(initialDraft.config);unsaved.publicModels[0].label="未发布的人工编辑";
    await f.repo.saveDraft({id:initialDraft.id,expectedRevision:initialDraft.revision,actor,config:unsaved});
    const draftHash=hash(await f.repo.draft(actor)),billingHash=hash(billing);
    const previewResponse=await handler(request());assert.equal(previewResponse.status,200);const review=await previewResponse.json();assert.equal(review.publicIds.length,32);assert.equal((await f.repo.current()).version,old.version);checks++;
    assert.equal(JSON.stringify(review).includes("credential"),false);assert.ok(review.rows.every((row:any)=>!('config'in row)));checks++;
    const conflictConfig=structuredClone(old.config),first=DOCUMENTED_VIDEO_FAMILIES[0],firstPublic=conflictConfig.publicModels.find(item=>item.id===first.publicId)!,manual=conflictConfig.upstreamModels.find(item=>item.id===firstPublic.target.id)!;
    manual.capabilities.video={...manual.capabilities.video,modes:[]};const conflict=reviewVideoCapabilityUpgrade(conflictConfig,old.version);assert.equal(conflict.rows.find(row=>row.publicId===first.publicId)?.status,'conflict');assert.ok(!conflict.publicIds.includes(first.publicId));assert.deepEqual(manual.capabilities.video.modes,[]);checks++;
    const wrongDigest={action:"video-capability-upgrade",id:randomUUID(),expectedVersion:old.version,reviewDigest:"0".repeat(64),publicIds:review.publicIds};assert.equal((await handler(request(wrongDigest))).status,409);assert.equal((await handler(request(wrongDigest,"https://foreign.invalid"))).status,403);checks++;
    const denied=createModelManagementHandler({authorize:async()=>Response.json({}, {status:403}) as never,administration:async()=>{throw Error('No administration for unauthorized request')},managed:async()=>true});assert.equal((await denied(request())).status,403);checks++;
    const input={...wrongDigest,id:randomUUID(),reviewDigest:review.reviewDigest};dropNext=true;
    const uncertain=await handler(request(input));assert.equal(uncertain.status,202,JSON.stringify(await uncertain.clone().json()));assert.equal((await uncertain.json()).publication.phase,"unknown");checks++;
    const resumed=await handler(request(input));assert.equal(resumed.status,200,JSON.stringify(await resumed.clone().json()));assert.equal(activations,1);assert.equal((await handler(request(input))).status,200);assert.equal(activations,1);checks++;
    const current=await f.repo.current();assert.ok(current.version>old.version);assert.equal(reviewVideoCapabilityUpgrade(current.config,current.version).publicIds.length,0);checks++;
    assert.deepEqual(current.config.providers,old.config.providers);assert.deepEqual(current.config.publicModels,old.config.publicModels);assert.deepEqual(current.config.bindings,old.config.bindings);assert.equal(hash(billing),billingHash);assert.equal(hash(await f.repo.draft(actor)),draftHash);checks++;
    assert.equal(hash((await f.sql.query("SELECT upstream_id,value FROM app_video_model_defaults WHERE model_version=$1 ORDER BY upstream_id",[old.version])).rows),hash(frozenBefore));assert.equal((await f.repo.byVersion(old.version)).digest,old.digest);checks++;
    for(const entry of DOCUMENTED_VIDEO_FAMILIES){const model=current.config.publicModels.find(m=>m.id===entry.publicId)!,upstream=current.config.upstreamModels.find(u=>u.id===model.target.id)!,provider=current.config.providers.find(p=>p.id===upstream.providerId)!;const frozen=await freezeManagedVideoCapability(current,upstream,provider,f.sql);assert.equal(frozen.profile,entry.profile);assert.deepEqual(frozen.definition.modes,entry.definition.modes);assert.deepEqual(frozen.definition.limits,resolveVideoCapability({manual:entry.definition}).limits);}checks++;
    const plan=applyReviewedVideoCapabilityUpgrade(old.config,old.version,review.reviewDigest,review.publicIds);assert.deepEqual(rollbackVideoFamilyCapabilityUpgradePlan(current.config,plan),old.config);checks++;
    const priorV2=makeVideoFamilyCapabilityUpgradePlan(old.config,v2.items as typeof DOCUMENTED_VIDEO_FAMILIES).config;
    const upgradedV3=makeVideoFamilyCapabilityUpgradePlan(priorV2,DOCUMENTED_VIDEO_FAMILIES);assert.ok(upgradedV3.patches.length);assert.deepEqual(rollbackVideoFamilyCapabilityUpgradePlan(upgradedV3.config,upgradedV3),priorV2);checks++;
    const later=structuredClone(upgradedV3.config);later.publicModels[0].label="later label";const restored=rollbackVideoFamilyCapabilityUpgradePlan(later,upgradedV3);assert.equal(restored.publicModels[0].label,"later label");checks++;
    assert.equal((await handler(request({...input,id:randomUUID()}))).status,409);checks++;
    console.log(`VIDEO_CAPABILITY_UPGRADE_ROUTE=PASS CHECKS=${checks} MODELS=32 ROUTER_ACTIVATIONS=1 OLD_VERSIONS=UNCHANGED BILLING=UNCHANGED CAS=PASS REPLAY=PASS V2_ROLLBACK=PASS REAL_SUPPLIER_CALLS=0`);
  }finally{await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
