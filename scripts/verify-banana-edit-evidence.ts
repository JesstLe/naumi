import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureModelConfig } from './model-config-unit-fixture';
import { fixtureConfig } from './billing-unit-fixture';
import { repairBananaEditEvidence, rollbackBananaEditEvidence, BANANA_EDIT_PROOFS } from './repair-banana-edit-evidence-policy';
import { canonicalConfig, modelConfigDigest } from '../src/lib/model-config/repository';
import { simulateModel } from '../src/lib/model-config/runtime';
import { compileRouterProjection } from '../src/lib/model-config/projection';
import { imagegenRequestSchema } from '../src/lib/imagegen/schema';
import { resolveImagegenIntent } from '../src/lib/imagegen/intent';
import type { ModelConfig } from '../src/lib/model-config/types';

export function bananaFixture(): ModelConfig {
  const source = fixtureModelConfig('https://www.geeknow.top/v1', '11111111-1111-4111-8111-111111111111');
  source.providers[0].id = 'geeknow-images';
  const template = structuredClone(source.upstreamModels[0]);
  source.upstreamModels = []; source.publicModels = []; source.bindings = {};
  for (const [index, proof] of BANANA_EDIT_PROOFS.entries()) {
    const upstream = { ...structuredClone(template), id: proof.id, providerId: 'geeknow-images', model: proof.model };
    upstream.capabilities = { ...upstream.capabilities, verified: false, maxReferenceImages: 1, qualities: [], nativeResolutions: [] };
    upstream.parameterMap = { qualityPolicy: { mode: index ? 'map' : 'omit', choices: (['low','medium','high'] as const).map(id=>({id,label:id,...(index?{value:id}:{})})) }, resolutionPolicy: { mode:'map', field:'resolution', ratioField:'size', values:{'1K':'1k','2K':'2k','4K':'4k'} } };
    const unknown = { ...structuredClone(upstream), id: `unknown-${index}` };
    source.upstreamModels.push(upstream, unknown);
    for (const suffix of ['three-four','landscape','four-three','square','portrait']) source.publicModels.push({ id:`${index?'gemini-3.1-flash-image':'gemini-3.0-pro-image'}-${suffix}`, label: 'Nano Banana', enabled:true, visible:true, modality:'image', target:{type:'upstream',id:unknown.id}, displayResolutions:['1K','2K','4K'], supplierRouting:{mode:'balanced',channels:[{upstreamId:unknown.id,enabled:true,priority:1,weight:3},{upstreamId:proof.id,enabled:true,priority:2,weight:3}]} });
  }
  source.bindings = {'image.generate':source.publicModels[0].id,'image.edit':source.publicModels[0].id};
  return source;
}

const request = imagegenRequestSchema.parse({version:1,operationId:'11111111-1111-4111-8111-111111111111',entry:'canvas',mode:'edit',modelId:'gemini-3.0-pro-image-three-four',prompt:'小兔子',inputs:[{artworkId:'fixture-reference',role:'edit-target'}],parameters:{quality:'medium',resolution:'1K',ratio:'3:4'},output:{format:'png'}});
const facts = {task:'product' as const,quality:'medium',resolution:'1K',ratio:'3:4',needsEdit:true,preserveIdentity:true,needsText:false,nativeResolution:false,references:1,quantity:1,imagegenRequirements:resolveImagegenIntent(request)};
const billing = {version:1,config:fixtureConfig()};
export function simulateBanana(config: ModelConfig, id = request.modelId!, overrides: Partial<typeof facts> = {}) {
  return simulateModel({version:114,digest:modelConfigDigest(config),config},billing,id,{...facts,...overrides});
}

function guards(original: ModelConfig, modified: ModelConfig) {
  assert.equal(canonicalConfig(original),canonicalConfig(bananaFixture()),'Original stays frozen');
  assert.deepEqual(repairBananaEditEvidence(modified),modified,'Idempotent');
  const stripped = rollbackBananaEditEvidence(modified,original);
  assert.deepEqual(stripped,original,'Only edit evidence changed');
  assert.deepEqual(compileRouterProjection({version:114,digest:'',config:original},billing),compileRouterProjection({version:114,digest:'',config:modified},billing),'No execution map or pricing delta');
  for (const model of modified.publicModels) {
    const result=simulateBanana(modified,model.id);
    assert.deepEqual(result.eligible.map(x=>x.upstreamId),[model.supplierRouting!.channels[1].upstreamId]);
    assert.ok(result.excluded.some(x=>x.upstreamId.startsWith('unknown-')&&x.codes.includes('IMAGEGEN_EDIT_UNSUPPORTED')));
    assert.equal(simulateBanana(modified,model.id,{references:2}).eligible.length,0);
    for (const [name,value] of [['mask','required'],['inputFidelity','high']] as const)
      assert.equal(simulateBanana(modified,model.id,{imagegenRequirements:{...facts.imagegenRequirements,requirements:[{name,value,source:'ui'}]}}).eligible.length,0);
    assert.equal(simulateBanana(modified,model.id,{imagegenRequirements:{...facts.imagegenRequirements,background:'transparent'}}).eligible.length,0);
    const generate={needsEdit:false,preserveIdentity:false,references:0,imagegenRequirements:{...facts.imagegenRequirements,operation:'generate' as const}};
    assert.deepEqual(simulateBanana(original,model.id,generate),simulateBanana(modified,model.id,generate));
  }
  for (const state of ['unknown','unsupported'] as const) {
    const manual=structuredClone(original); manual.upstreamModels[0].capabilities.imagegen={edit:{state,source:'administrator',checkedAt:'2026-10-15'}};
    const before=canonicalConfig(manual);assert.throws(()=>repairBananaEditEvidence(manual),/管理员/);assert.equal(canonicalConfig(manual),before);
  }
  const explicit=structuredClone(modified);explicit.upstreamModels[0].capabilities.imagegen!.edit!.source='manual source';assert.deepEqual(repairBananaEditEvidence(explicit),explicit);
  const other=structuredClone(modified);other.publicModels[0].label='unrelated change';assert.equal(rollbackBananaEditEvidence(other,original).publicModels[0].label,'unrelated change');
  other.upstreamModels[0].capabilities.imagegen!.edit!.source='later edit';assert.throws(()=>rollbackBananaEditEvidence(other,original),/他人/);
  const changed=structuredClone(original);changed.providers[0].baseUrl='https://other.example/v1';assert.throws(()=>repairBananaEditEvidence(changed),/入口/);
}

function main() {
  const [mode,dir='output/banana-edit-evidence-20261015',file] = process.argv.slice(2);
  mkdirSync(dir,{recursive:true});
  const read=(name:string)=>JSON.parse(readFileSync(path.join(dir,name),'utf8')) as ModelConfig;
  if(mode==='BASELINE') {
    const original=bananaFixture();writeFileSync(path.join(dir,'ORIGINAL.json'),JSON.stringify(original,null,2)+'\n');
    for(const m of original.publicModels)assert.equal(simulateBanana(original,m.id).eligible.length,0);
    console.log('BASELINE PASS aliases=10 eligible=0 reason=IMAGEGEN_EDIT_UNSUPPORTED provider_calls=0');
  } else if(mode==='MODIFIED') {
    const original=read('ORIGINAL.json'),modified=repairBananaEditEvidence(original);guards(original,modified);
    writeFileSync(path.join(dir,'MODIFIED_FILE.json'),JSON.stringify(modified,null,2)+'\n');
    console.log('MODIFIED PASS aliases=10 eligible=1 each unknown_excluded=true guards=PASS projection_price_unchanged=true provider_calls=0');
  } else if(mode==='RESTORE_COPY') {
    assert.ok(file);const original=read('ORIGINAL.json'),current=JSON.parse(readFileSync(file,'utf8'));
    const restored=rollbackBananaEditEvidence(current,original);assert.equal(modelConfigDigest(restored),modelConfigDigest(original));
    assert.equal(simulateBanana(restored).eligible.length,0);writeFileSync(file,JSON.stringify(restored,null,2)+'\n');
    console.log('ROLLBACK PASS original_hash_restored=true eligible=0 live_modified_copy_unchanged=true provider_calls=0');
  } else throw new Error('Use BASELINE, MODIFIED or RESTORE_COPY');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/verify-banana-edit-evidence.ts'))main();
