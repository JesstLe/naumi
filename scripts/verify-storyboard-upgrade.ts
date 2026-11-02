import assert from "node:assert/strict";
import {fixtureModelConfig} from "./model-config-unit-fixture";
import v2 from "../src/lib/model-config/video-family-capabilities.json";
import v3 from "../src/lib/model-config/video-family-multimodal.json";
import {STORYBOARD_VIDEO_FAMILIES} from "../src/lib/model-config/video-family-storyboard";
import {makeVideoFamilyCapabilityUpgradePlan,rollbackVideoFamilyCapabilityUpgradePlan} from "../src/lib/model-config/video-family-capability-upgrade";
import {reviewVideoCapabilityUpgrade} from "../src/lib/model-config/video-capability-review";
import type {VideoModelDefinition,VideoWireProfile} from "../src/lib/video/capability-schema";

const config=fixtureModelConfig("https://fixture.invalid/v1","11111111-1111-4111-8111-111111111111");
config.providers.push({id:"apib-video",name:"Fixture",protocol:"apimart",baseUrl:"https://fixture.invalid",enabled:true,credentialRef:config.providers[0].credentialRef,timeoutMs:120000,maxConcurrent:2});
for(const [index,item] of STORYBOARD_VIDEO_FAMILIES.entries()){
 const prior=[...v3.items,...v2.items].find(row=>row.publicId===item.publicId)!;
 const id=`old-storyboard-${index}`;config.upstreamModels.push({...structuredClone(config.upstreamModels[0]),id,providerId:item.providerId,model:item.model,modality:"video",parameterMap:{videoProfile:prior.profile as VideoWireProfile},capabilities:{...structuredClone(config.upstreamModels[0].capabilities),maxReferenceImages:prior.definition.limits.images,video:structuredClone(prior.definition) as VideoModelDefinition}});
 config.publicModels.push({id:item.publicId,label:item.model,modality:"video",enabled:true,visible:true,target:{type:"upstream",id}});
}
const before=structuredClone(config),review=reviewVideoCapabilityUpgrade(config,12),plan=makeVideoFamilyCapabilityUpgradePlan(config,STORYBOARD_VIDEO_FAMILIES);
assert.deepEqual(review.publicIds,STORYBOARD_VIDEO_FAMILIES.map(row=>row.publicId));assert.ok(review.rows.every(row=>!row.beforeMultiShot&&row.afterMultiShot));
assert.deepEqual(config,before);assert.equal(plan.patches.length,4);assert.ok(plan.patches.every(patch=>['capabilities.video','parameterMap.videoProfile'].includes(patch.field)));
assert.deepEqual(rollbackVideoFamilyCapabilityUpgradePlan(plan.config,plan),before);assert.equal(makeVideoFamilyCapabilityUpgradePlan(plan.config,STORYBOARD_VIDEO_FAMILIES).patches.length,0);
const manual=structuredClone(config);manual.upstreamModels.find(row=>row.id==='old-storyboard-0')!.capabilities.video!.maxShots=2;
const preserved=reviewVideoCapabilityUpgrade(manual,12);assert.equal(preserved.rows.find(row=>row.publicId===STORYBOARD_VIDEO_FAMILIES[0].publicId)!.status,'conflict');assert.equal(preserved.publicIds.length,1);
const later=structuredClone(plan.config);later.upstreamModels.find(row=>row.id==='old-storyboard-1')!.capabilities.video!.supportsMultiShot=false;assert.throws(()=>rollbackVideoFamilyCapabilityUpgradePlan(later,plan));
console.log('STORYBOARD_UPGRADE=PASS MODELS=2 PATCHES=4 V2_V3_BASELINES=RECOGNIZED MANUAL=RETAINED ROLLBACK=EXACT PAID_CALLS=0');
