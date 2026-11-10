/** Real schema and parameter compiler, offline preparation only. No supplier requests. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {validateModelConfig} from '../src/lib/model-config/schema';
import {compileImageParameterPlan} from '../src/lib/model-config/image-parameter-plan';
import {apimartImageParameters} from '../src/lib/model-config/apimart-image-parameters';
import {supportsExactImageSize} from '../src/lib/imagegen/request-size';
import {modelConfigDigest} from '../src/lib/model-config/snapshot-value';
import type {ModelExecutionScope} from '../src/lib/model-config/context';
const {prepareAPIBImage26}=createRequire(process.cwd()+'/package.json')('./scripts/lib/apib-image26-preparation.mjs');
const root=process.argv[2]; assert.ok(root,'Supply read-only preparation evidence root');
const live=JSON.parse(readFileSync(root+'/live-snapshot.private.json','utf8'));
const manifest=JSON.parse(readFileSync('docs/providers/apib-image26-preparation-20261110.json','utf8'));
const input={snapshot:live.current,catalog:{source:live.source.url,httpStatus:live.source.httpStatus,models:live.matches},manifest,expectedVersion:Number(live.current.version),expectedDigest:live.current.digest};
const before=structuredClone(input);let checks=0;
const check=(name:string,run:()=>void)=>{run();checks++;console.log('PASS '+name);};
let bundle:ReturnType<typeof prepareAPIBImage26>;
check('five exact additions and no input mutation',()=>{bundle=prepareAPIBImage26(input);assert.equal(bundle.additions.length,5);assert.deepEqual(input,before);});
const trustedOrigins=[...new Set(live.current.config.providers.map((p:any)=>new URL(p.baseUrl).origin))] as string[];
check('baseline and candidate actual schema',()=>{validateModelConfig(live.current.config,{trustedOrigins});validateModelConfig(bundle.config,{trustedOrigins});});
check('all old provider routing billing and upstream fields unchanged',()=>{
 for(const [key,value]of Object.entries(live.current.config))if(key!=='upstreamModels')assert.deepEqual(bundle.config[key],value);
 assert.deepEqual(bundle.config.upstreamModels.slice(0,live.current.config.upstreamModels.length),live.current.config.upstreamModels);
});
check('new models remain disabled and unverified with no new procurement or public routes',()=>{for(const id of bundle.additions){const u=bundle.config.upstreamModels.find((x:any)=>x.id===id);assert.equal(u.enabled,false);assert.equal(u.capabilities.verified,false);assert.equal(u.procurement,undefined);}assert.equal(bundle.summary.newlyEnabledModels,0);});
check('repeat additive preparation is idempotent',()=>{const digest=modelConfigDigest(bundle.config);assert.deepEqual(prepareAPIBImage26({...input,snapshot:{...input.snapshot,digest,config:bundle.config},expectedDigest:digest}).additions,[]);});
for(const [name,change]of [
 ['stale version',(a:any)=>a.expectedVersion++],['stale digest',(a:any)=>a.expectedDigest='old'],
 ['tampered original snapshot',(a:any)=>a.snapshot.config.providers[0].name+=' changed'],
 ['foreign catalog',(a:any)=>a.catalog.source='https://other.invalid/v1/models'],
 ['catalog missing exact model',(a:any)=>a.catalog.models=a.catalog.models.filter((m:any)=>m.id!==manifest.models[0].id)],
 ['duplicate catalog',(a:any)=>a.catalog.models.push(a.catalog.models[0])],
 ['duplicate manifest',(a:any)=>a.manifest.models.push(a.manifest.models[0])],
 ['enabled new model',(a:any)=>a.manifest.models[0].upstream.enabled=true],
 ['unapproved price',(a:any)=>a.manifest.models[0].upstream.costRef='guessed'],
 ['existing upstream edited',(a:any)=>a.snapshot.config.upstreamModels.push({...a.manifest.models[0].upstream,label:'edited'})],
 ['provider protocol drift',(a:any)=>a.snapshot.config.providers.find((p:any)=>p.id==='apib-image').protocol='openai-images'],
] as const)check('reject '+name,()=>{const a=structuredClone(input);change(a);assert.throws(()=>prepareAPIBImage26(a));});
for(const m of manifest.models){
 const u=m.upstream,scope={parameterMap:u.parameterMap,capabilities:u.capabilities,frozen:{publicModelId:m.id}} as ModelExecutionScope;
 check(m.id+' actual adapter parameter serialization',()=>{
  const p=apimartImageParameters(scope,{quality:'medium',resolution:'2K',ratio:'3:4'});
  assert.equal(p.upstream.size,'3:4');assert.equal(p.upstream.resolution,m.id.startsWith('gpt-')?'2k':'2K');
  assert.equal(p.upstream.quality,m.id.startsWith('gpt-')?'medium':undefined);
 });
 check(m.id+' versioned compiler matches adapter mapping',()=>{
  const p=compileImageParameterPlan(u,{quality:'medium',resolution:'2K',ratio:'3:4'},{publicModelId:m.id,protocol:'apimart-images',modelVersion:154});
  assert.equal(p.wire.resolution,m.id.startsWith('gpt-')?'2k':'2K');assert.equal(p.wire.size,'3:4');
 });
 check(m.id+' unknown custom ratio stays rejected',()=>{assert.throws(()=>apimartImageParameters(scope,{quality:'medium',resolution:'1K',ratio:'19:23'}));assert.equal(supportsExactImageSize(m.id),false);});
 check(m.id+' every named tier has sourced output dimensions',()=>{
  for(const resolution of u.capabilities.nativeResolutions)for(const ratio of u.parameterMap.apimartImages.ratios){
   const params=apimartImageParameters({...scope,frozen:{...scope.frozen,facts:{nativeResolution:true}}} as ModelExecutionScope,{quality:'medium',resolution,ratio});
   assert.ok(params.expectedPixels?.width&&params.expectedPixels?.height,`${resolution}:${ratio}`);
  }
 });
 if(m.id.startsWith('mai-'))check(m.id+' 4K and reference editing are held',()=>{assert.equal(u.capabilities.edit,false);assert.throws(()=>apimartImageParameters(scope,{quality:'medium',resolution:'4K',ratio:'1:1'}));assert.equal(u.parameterMap.apimartImages.maxOutputs,1);});
 else check(m.id+' native dimensions and quantity',()=>{assert.deepEqual(u.parameterMap.apimartImages.outputDimensions['2K:3:4'],{width:1536,height:2048});assert.equal(u.parameterMap.apimartImages.maxOutputs,m.id.endsWith('ext')?1:4);});
}
check('Ext pins flare independently of the token models',()=>{const u=manifest.models.find((m:any)=>m.id==='gpt-image-2.6-ext').upstream;assert.equal(u.parameterMap.version,'flare');assert.equal(u.parameterMap.apimartImages.ratios.length,10);assert.equal(u.parameterMap.apimartImages.supportsMask,false);});
check('standard models have all 15 documented ratios without broadening old 2.5',()=>{for(const id of ['gpt-image-2.6-flare','gpt-image-2.6-sunburst'])assert.equal(manifest.models.find((m:any)=>m.id===id).upstream.parameterMap.apimartImages.ratios.length,15);});
console.log(`APIB_IMAGE26_PREPARATION=PASS CHECKS=${checks} WIRE_MODELS=5 SCHEMA=ACTUAL PARAMETER_COMPILER=ACTUAL SUPPLIER_POST=0 PRODUCTION_WRITES=0 EXIT=0`);
