import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareImageLaunch,rollbackImageLaunch,LAUNCH_MODELS,SEED55_RATIOS} from './lib/image26-seed55-launch.mjs';
import {channelRandomScore} from '../src/lib/model-config/channel-random-order';
import {channelPolicySchema} from '../src/lib/model-config/channel-policy';
import {validateModelConfig} from '../src/lib/model-config/schema';
import {publicModelCatalog} from '../src/lib/model-config/public-catalog';
import {apimartImageParameters} from '../src/lib/model-config/apimart-image-parameters';
import {quote} from '../src/lib/billing/quote';
import {seedreamPreflight} from '../src/lib/model-config/seedream-preflight';
import {simulateModel} from '../src/lib/model-config/runtime';
import {featureDefaultModel,FEATURE_BINDINGS} from '../src/lib/model-config/feature-model-policy';
import {businessBillingSnapshot} from '../src/lib/model-config/business-billing';

async function main(){
 const data=JSON.parse(readFileSync(process.argv[2],'utf8'));
 const manifest=JSON.parse(readFileSync('docs/providers/apib-image26-preparation-20261110.json','utf8'));
 const original=data.snapshot.config,ids=data.catalog.data.map((m:any)=>m.id),featureDefaults=Object.fromEntries(Object.entries(FEATURE_BINDINGS).map(([feature,binding])=>[feature,featureDefaultModel(original,feature,binding)])),featurePricing=Object.fromEntries(Object.entries(data.billing.config.features).map(([id,feature]:[string,any])=>[id,feature.pricing])),config=prepareImageLaunch(original,manifest,ids,{featureDefaults,featurePricing});
 const trustedOrigins=original.providers.map((p:any)=>new URL(p.baseUrl).origin);
 validateModelConfig(config,{trustedOrigins});assert.deepEqual(rollbackImageLaunch(config,original,config),original);
 assert.throws(()=>prepareImageLaunch(config,manifest,ids),/COLLISION/);
 assert.throws(()=>prepareImageLaunch(original,manifest,ids.filter((id:string)=>id!=='seedream-5-5')),/CATALOG_MISSING/);
 let combinations=0;
 for(const family of LAUNCH_MODELS){
  for(const wire of family.wires){
   const u=config.upstreamModels.find((u:any)=>u.model===wire),scope={parameterMap:u.parameterMap,capabilities:u.capabilities,frozen:{publicModelId:family.id,facts:{nativeResolution:false}}} as any;
   for(const ratio of u.parameterMap.apimartImages.ratios)for(const resolution of u.capabilities.nativeResolutions)for(const quality of u.capabilities.qualities){
    const params=apimartImageParameters(scope,{quality,resolution,ratio});assert.equal(params.upstream.size,ratio);assert.equal(params.upstream.resolution,wire.startsWith('gpt')?resolution.toLowerCase():resolution);assert.equal(params.upstream.quality,wire.startsWith('gpt')?quality:undefined);combinations++;
   }
   assert.throws(()=>apimartImageParameters(scope,{quality:'medium',resolution:'8K',ratio:'1:1'}));
  }
 }
 for(const feature of ['canvas.image','image.generate'] as const){
  const before=publicModelCatalog(data.snapshot,'image',feature,true),after=publicModelCatalog({...data.snapshot,config},'image',feature,true);
  assert.equal(after.defaultModelId,before.defaultModelId);
  for(const old of before.models)assert.deepEqual(after.models.find(m=>m.id===old.id),old);
  for(const family of LAUNCH_MODELS){
   const model=after.models.find(m=>m.id===family.id)!;assert.equal(model.label,family.label);assert.equal(model.supportsEdit,true);
   assert.equal(after.models.filter(m=>m.label===family.label).length,1);
   if(family.id==='jimeng-image-5.5'){assert.equal(model.maxReferenceImages,10);assert.deepEqual(model.generationParameters!.ratios,SEED55_RATIOS);assert.deepEqual(model.nativeResolutions,['1K','2K']);}
   for(const resolution of model.nativeResolutions)for(const quality of model.qualities){
    const facts={feature,modelId:family.id,providerId:'apib-image',quality,resolution,quantity:1,metered:true,byok:false,paidFen:0,userGroup:'user'} as any;
    const current=quote(businessBillingSnapshot(data.billing,{...data.snapshot,config},facts),facts),old=quote(data.billing,{...facts,modelId:family.id==='gpt-image-2.6'?'gpt-image-2':'jimeng-image-5.0-pro'});
    assert.equal(current.requestedCredits,old.requestedCredits);
   }
  }
 }
 channelPolicySchema.parse({mode:'random',channels:[{upstreamId:'u',enabled:true,priority:1,weight:1}]});
 let equal=0,weighted=0;const winners=new Set<string>();
 for(let i=0;i<20000;i++){
  const op='synthetic-operation-'+i,a=channelRandomScore(op,'flare',1),b=channelRandomScore(op,'sunburst',1);
  assert.equal(a,channelRandomScore(op,'flare',1));if(a<b)equal++;if(channelRandomScore(op,'flare',3)<b)weighted++;winners.add(a<b?'flare':'sunburst');
 }
 assert.equal(winners.size,2);assert(equal>9500&&equal<10500);assert(weighted>14500&&weighted<15500);
 await seedreamPreflight('seedream-5-5','test',[],1);
 await assert.rejects(seedreamPreflight('seedream-5-5','test',[],2));
 await assert.rejects(seedreamPreflight('seedream-5-5','test',Array(11).fill({}),1));
 console.log(JSON.stringify({status:'PASS',combinations,randomEqual:equal,randomWeighted:weighted,originalCatalogAndPricesUnchanged:true,newPublicModels:LAUNCH_MODELS,realSupplierPosts:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
