import assert from 'node:assert/strict';

export const LAUNCH_MODELS = [
  {id:'gpt-image-2.6',label:'GPT-Image-2.6',wires:['gpt-image-2.6-flare','gpt-image-2.6-sunburst']},
  {id:'jimeng-image-5.5',label:'即梦 5.5',wires:['seedream-5-5']},
];
export const SEED55_SOURCE='https://docs.apimart.ai/en/api-reference/images/seedream-5-5/generation.md';
export const SEED55_RATIOS=['1:1','4:3','3:4','16:9','9:16','3:2','2:3','21:9','2:1','1:2'];
function explicitFeaturePricing(pricing){
  if(pricing.mode!=='quality-resolution')return structuredClone(pricing);
  const prices=Object.fromEntries(['low','medium','high','xhigh','max','auto'].map(quality=>[quality,Object.fromEntries(['1K','2K','4K','5K'].map(resolution=>{
    const amount=pricing.quality[quality]+pricing.resolutionExtra[resolution];assert(Number.isSafeInteger(amount)&&amount>=0,'EXISTING_PRICE_INCOMPLETE');return [resolution,amount];
  }))]));
  return {mode:'matrix',prices};
}

/** Additive registry recipe. Existing identity, defaults, prices and accepted
 * task versions stay owned by their current modules. No network or writes. */
export function prepareImageLaunch(original, manifest, catalogIds, {mode='balanced',featureDefaults={},featurePricing={}}={}) {
  assert(['balanced','random'].includes(mode));
  const config=structuredClone(original), provider=config.providers.find(p=>p.id==='apib-image');
  assert(provider?.enabled && provider.protocol==='apimart-images' && provider.baseUrl==='https://api.apib.ai/v1' && provider.credentialRef);
  const oldGpt=config.publicModels.find(m=>m.id==='gpt-image-2');
  const oldSeed=config.publicModels.find(m=>m.id==='jimeng-image-5.0-pro');
  assert.equal(oldGpt?.label,'GPT-Image-2.5');assert(oldSeed?.enabled);
  const caps=config.upstreamModels.find(u=>u.id==='apib:seedream-5-0-pro')?.capabilities;assert(caps);
  for(const family of LAUNCH_MODELS) {
    assert(!config.publicModels.some(m=>m.id===family.id || m.label===family.label),'PUBLIC_COLLISION');
    for(const wire of family.wires) {
      assert(catalogIds.includes(wire),'AUTHENTICATED_CATALOG_MISSING:'+wire);
      const id='apib:'+wire;assert(!config.upstreamModels.some(u=>u.id===id),'UPSTREAM_COLLISION:'+id);
      let upstream;
      if(wire.startsWith('gpt-')) {
        upstream=structuredClone(manifest.models.find(m=>m.id===wire)?.upstream);assert(upstream?.parameterMap?.apimartImages);
        // Use documented named frames which the current strict ratio delivery
        // contract can represent; do not claim arbitrary pixels or GIF/SVG.
        const ratios=original.upstreamModels.find(u=>u.id==='apib:gpt-image-2.5-sunburst').parameterMap.apimartImages.ratios;
        upstream.parameterMap.apimartImages.ratios=upstream.parameterMap.apimartImages.ratios.filter(r=>ratios.includes(r));
        const allowed=new Set(upstream.parameterMap.apimartImages.ratios);
        upstream.parameterMap.apimartImages.outputDimensions=Object.fromEntries(Object.entries(upstream.parameterMap.apimartImages.outputDimensions).filter(([key])=>allowed.has(key.slice(key.indexOf(':')+1))));
        upstream.parameterMap.qualityPolicy.choices=structuredClone(original.upstreamModels.find(u=>u.id==='apib:gpt-image-2.5-sunburst').parameterMap.qualityPolicy.choices);
      } else {
        const proof={state:'supported',source:SEED55_SOURCE,checkedAt:'2026-11-20'};
        upstream={id,providerId:provider.id,model:wire,label:wire,modality:'image',enabled:true,
          capabilities:{...structuredClone(caps),verified:false,maxReferenceImages:10,nativeResolutions:['1K','2K'],transparent:true,
            imagegen:{edit:proof,transparent:{...proof,values:['transparent','opaque']},outputFormat:{...proof,values:['png','jpeg']}}},
          parameterMap:{apimartImages:{schemaVersion:1,maxOutputs:1,supportsMask:false,ratios:SEED55_RATIOS},
            qualityPolicy:{mode:'omit',choices:[{id:'medium',label:'标准'}],evidence:{status:'documented',source:SEED55_SOURCE,checkedAt:'2026-11-20'}},
            resolutionPolicy:{mode:'map',field:'resolution',ratioField:'size',values:{'1K':'1K','2K':'2K'}},
            imagegen:{transparent:'background',outputFormat:'output_format'}}};
      }
      upstream.enabled=true;upstream.capabilities.verified=false;
      delete upstream.procurement;delete upstream.costRef;
      config.upstreamModels.push(upstream);
    }
    const template=family.id==='gpt-image-2.6'?oldGpt:oldSeed;
    const {supplierRouting,previousIds,...publicTemplate}=structuredClone(template);
    const model={...publicTemplate,id:family.id,label:family.label,target:{type:'upstream',id:'apib:'+family.wires[0]},
      toolScope:{...structuredClone(template.toolScope),defaultFor:[]},displayResolutions:family.id==='gpt-image-2.6'?['1K','2K','4K']:['1K','2K']};
    if(family.wires.length>1)model.supplierRouting={mode,channels:family.wires.map(wire=>({upstreamId:'apib:'+wire,enabled:true,priority:1,weight:1}))};
    config.publicModels.push(model);
    // Explicit options carry parameter choices on the existing deployed
    // catalog too. inheritExisting preserves every prior selectable model.
    for(const featureId of template.toolScope.features){
      const defaultModelId=featureDefaults[featureId];if(!defaultModelId)continue;
      assert(featurePricing[featureId],'EXISTING_FEATURE_PRICE_REQUIRED:'+featureId);
      config.business||={};
      config.business[featureId]||={enabled:true,inheritExisting:true,defaultModelId,options:[]};
      const feature=config.business[featureId];if(!feature.enabled||!feature.inheritExisting)continue;
      const upstream=config.upstreamModels.find(u=>u.id===model.target.id);
      assert(!feature.options.some(o=>o.modelId===model.id));
      feature.options.push({modelId:model.id,enabled:true,sort:config.publicModels.length,unit:'image',pricing:explicitFeaturePricing(featurePricing[featureId]),parameters:{qualities:upstream.capabilities.qualities,resolutions:model.displayResolutions,ratios:upstream.parameterMap.apimartImages.ratios}});
    }
    for(const feature of Object.values(config.business||{})) {
      if(!feature?.options || feature.inheritExisting || !feature.enabled)continue;
      const option=feature.options.find(o=>o.modelId===template.id&&o.enabled);if(!option)continue;
      assert(!feature.options.some(o=>o.modelId===family.id));
      const upstream=config.upstreamModels.find(u=>u.id===model.target.id);
      feature.options.push({...structuredClone(option),modelId:family.id,
        ...(option.parameters?{parameters:{...option.parameters,qualities:upstream.capabilities.qualities,resolutions:model.displayResolutions,ratios:upstream.parameterMap.apimartImages.ratios}}:{})});
    }
  }
  assert.deepEqual(config.bindings,original.bindings);
  for(const row of original.publicModels)assert.deepEqual(config.publicModels.find(m=>m.id===row.id),row);
  for(const row of original.upstreamModels)assert.deepEqual(config.upstreamModels.find(u=>u.id===row.id),row);
  assert.deepEqual(config.providers,original.providers);
  return config;
}

/** Selective inverse rejects edits or new dependencies on our additions. */
export function rollbackImageLaunch(current,baseline,candidate) {
  const config=structuredClone(current),ids=new Set(LAUNCH_MODELS.map(m=>m.id)),upstreams=new Set(LAUNCH_MODELS.flatMap(m=>m.wires.map(w=>'apib:'+w)));
  for(const key of ['publicModels','upstreamModels'])for(const row of candidate[key].filter(m=>(key==='publicModels'?ids:upstreams).has(m.id)))assert.deepEqual(config[key].find(m=>m.id===row.id),row,'OWN_ADDITION_EDITED');
  for(const value of Object.values(config.bindings))assert(!ids.has(value),'NEW_BINDING_DEPENDENCY');
  assert(!config.publicModels.filter(m=>!ids.has(m.id)).some(m=>upstreams.has(m.target.id)||m.supplierRouting?.channels.some(c=>upstreams.has(c.upstreamId))),'NEW_PUBLIC_DEPENDENCY');
  assert(!config.pools.some(p=>p.candidates.some(id=>upstreams.has(id))),'NEW_POOL_DEPENDENCY');
  for(const [id,feature]of Object.entries(config.business||{})) {
    assert(!ids.has(feature.defaultModelId),'NEW_DEFAULT_DEPENDENCY');
    for(const option of feature.options.filter(o=>ids.has(o.modelId)))assert.deepEqual(option,candidate.business[id]?.options.find(o=>o.modelId===option.modelId),'OWN_OPTION_EDITED');
    feature.options=feature.options.filter(o=>!ids.has(o.modelId));
    if(!baseline.business?.[id] && feature.options.length===0){
      const {options,...rest}=feature,{options:ownedOptions,...ownedRest}=candidate.business[id];
      if(JSON.stringify(rest)===JSON.stringify(ownedRest))delete config.business[id];
    }
  }
  if(!baseline.business && config.business && Object.keys(config.business).length===0)delete config.business;
  config.publicModels=config.publicModels.filter(m=>!ids.has(m.id));config.upstreamModels=config.upstreamModels.filter(m=>!upstreams.has(m.id));
  return config;
}
