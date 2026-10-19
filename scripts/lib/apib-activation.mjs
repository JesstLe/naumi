import { createHash, randomUUID } from 'node:crypto';

export const ACTIVATION_IDS=['gpt-image-2.5-flare','gpt-image-2.5-sunburst'];
export const SOURCE_SHA='be8e52e7a6e1409b1f6d5a0c84f85898f9ad07e7a0a832ecea798a5205e5231d';
export const EXECUTABLE_RATIOS=['1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','2:1','1:2','21:9'];
export const EXCLUDED_RATIOS=['9:21','3:1','1:3'];
export const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
export const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b);
const requireThat=(v,code)=>{if(!v)throw new Error(code);};
const row=(c,g,id)=>{const matches=c[g].filter(x=>x.id===id);requireThat(matches.length===1,`ROW_IDENTITY:${g}:${id}`);return matches[0];};
function locate(c,change){let parent=row(c,change.group,change.id);for(const k of change.path.slice(0,-1)){requireThat(parent[k]&&typeof parent[k]==='object',`PARENT_MISSING:${k}`);parent=parent[k];}return {parent,key:change.path.at(-1)};}
function valueAt(c,change){const {parent,key}=locate(c,change);return Object.hasOwn(parent,key)?{present:true,value:structuredClone(parent[key])}:{present:false};}

/** No discovery, network, DB, credentials, price inference or source refresh. */
export function activationMatrix(manifest){return manifest.models.map(m=>({upstreamId:`apib:${m.id}`,model:m.id,modality:m.modality,family:m.family,
  decision:ACTIVATION_IDS.includes(m.id)?'DOCUMENTED_GENERATE_SUBSET':'HOLD',
  reason:ACTIVATION_IDS.includes(m.id)?'Exact wire IDs; 12 route-admissible ratios from 15 documented 1K observations; 3 excluded by pre-SDK exact-size guard; runtime unpaid/unverified; standby only':
    m.modality==='video'?'Video wire/profile, outputs and sale-price mapping not accepted for this minimal batch':
    m.destination==='new'?'No approved public ID/customer tariff for new family; no price invention':
    'Current shared adapter always emits output_format=png; this model document does not establish that field/output matrix contract',
  source:m.documentation,paidRuntimeVerified:false,procurementPriceConfirmed:false}));}

export function makeActivationPlan(snapshot,billing,contract,sourceBytes,manifest,operationId=randomUUID()){
  requireThat(/^[0-9a-f-]{36}$/.test(operationId),'OPERATION_ID_INVALID');
  requireThat(snapshot.digest===digest(snapshot.config),'BASELINE_DIGEST_INVALID');
  requireThat(createHash('sha256').update(sourceBytes).digest('hex')===SOURCE_SHA&&contract.source.sha256===SOURCE_SHA,'DOCUMENT_HASH_CHANGED');
  requireThat(same(contract.modelIds,ACTIVATION_IDS)&&contract.providerId==='apib-image'&&contract.protocol==='apimart-images'&&contract.baseUrl==='https://api.apib.ai/v1'&&contract.targetPublicId==='gpt-image-2','CONTRACT_IDENTITY_CHANGED');
  const text=Buffer.from(sourceBytes).toString('utf8');
  for(const literal of ['gpt-image-2.5-flare','gpt-image-2.5-sunburst','/v1/images/generations','POST /v1/uploads/images','`low`, `medium`, `high`, `xhigh`, `max`, or `auto`','`1k`, `2k`, or `4k`','<ParamField body="output_format"','data[0].task_id'])requireThat(text.includes(literal),`SOURCE_ASSERTION:${literal}`);
  const {apimartImages:a,resolutionPolicy:r,qualityPolicy:q}=contract.parameters;
  requireThat(a.schemaVersion===1&&a.maxOutputs===1&&a.supportsMask===false&&r.mode==='map'&&r.field==='resolution'&&r.ratioField==='size'&&same(r.values,{'1K':'1k'})&&q.mode==='map'&&same(q.choices.map(x=>[x.id,x.value]),['low','medium','high','xhigh','max'].map(x=>[x,x])),'PARAMETER_CONTRACT_CHANGED');
  const table=text.split('\n').filter(line=>/^\| `\d+:\d+` \|/.test(line)).slice(0,15);
  const dimensions=Object.fromEntries(table.map(line=>{const cells=line.split('|').map(x=>x.trim()),nums=cells[2].match(/\d+/g);requireThat(nums?.length===2,'PIXEL_TABLE_INVALID');return [`1K:${cells[1].replaceAll('`','')}`,{width:Number(nums[0]),height:Number(nums[1])}];}));
  const observed=contract.sourceObservations;
  requireThat(Object.keys(dimensions).length===15&&same(dimensions,observed?.outputDimensions)&&same(Object.keys(dimensions).map(k=>k.slice(3)),observed?.ratios),'DOCUMENTED_PIXEL_MATRIX_CHANGED');
  const allowedDimensions=Object.fromEntries(EXECUTABLE_RATIOS.map(ratio=>[`1K:${ratio}`,dimensions[`1K:${ratio}`]]));
  requireThat(same(a.ratios,EXECUTABLE_RATIOS)&&same(a.outputDimensions,allowedDimensions)&&same(contract.routeConstraint?.excludedRatios,EXCLUDED_RATIOS),'ROUTE_EXECUTABLE_SUBSET_CHANGED');
  const config=structuredClone(snapshot.config),delta=[];
  const set=(group,id,path,value)=>{const change={kind:'field',group,id,path,before:null,after:{present:true,value:structuredClone(value)}};change.before=valueAt(config,change);requireThat(!same(change.before,change.after),'BASELINE_ALREADY_CHANGED');const {parent,key}=locate(config,change);parent[key]=structuredClone(value);delta.push(change);};
  const p=row(config,'providers','apib-image');
  requireThat(!p.enabled&&p.protocol===contract.protocol&&p.baseUrl===contract.baseUrl&&!!p.credentialRef,'PROVIDER_BASELINE_CHANGED');
  const m=row(config,'publicModels','gpt-image-2');
  requireThat(m.enabled&&m.modality==='image'&&m.label==='GPT-Image-2.5'&&m.supplierRouting?.channels.length&&!(config.defaultImagePreset?.enabled&&config.defaultImagePreset.aliases.some(x=>x.id===m.id)),'FAMILY_BASELINE_CHANGED');
  const priority=1+Math.max(...m.supplierRouting.channels.map(x=>x.priority));requireThat(priority<=100,'NO_STANDBY_PRIORITY');
  set('providers',p.id,['enabled'],true);
  for(const model of ACTIVATION_IDS){
    const id=`apib:${model}`,u=row(config,'upstreamModels',id);
    requireThat(manifest.models.some(x=>x.id===model&&x.modality==='image')&&u.model===model&&u.providerId===p.id&&!u.enabled&&!u.capabilities.verified&&!u.capabilities.generate&&!u.capabilities.edit&&same(u.parameterMap,{})&&!u.procurement,'UPSTREAM_BASELINE_CHANGED');
    set('upstreamModels',id,['enabled'],true);
    set('upstreamModels',id,['capabilities','generate'],true);
    set('upstreamModels',id,['capabilities','qualities'],q.choices.map(x=>x.id));
    set('upstreamModels',id,['capabilities','nativeResolutions'],['1K']);
    for(const field of ['qualityPolicy','resolutionPolicy','apimartImages'])set('upstreamModels',id,['parameterMap',field],contract.parameters[field]);
    requireThat(!m.supplierRouting.channels.some(x=>x.upstreamId===id),'CHANNEL_ALREADY_EXISTS');
    const channel={upstreamId:id,enabled:true,priority,weight:1};m.supplierRouting.channels.push(channel);
    delta.push({kind:'channel',publicId:m.id,upstreamId:id,after:channel});
  }
  const result={schemaVersion:1,operationId,baseline:{version:snapshot.version,digest:snapshot.digest,billingVersion:billing.version,billingHash:digest(billing)},candidateDigest:digest(config),contractHash:digest(contract),sourceSha256:SOURCE_SHA,routeConstraint:structuredClone(contract.routeConstraint),sourceObservationRatios:observed.ratios,delta,config,matrix:activationMatrix(manifest),policy:{paidAcceptance:'PAUSED_BY_USER',paidHealthProbes:false,procurementWrites:0,verifiedPromotions:0,existingWeightsChanged:0,metadataWrites:0,expectedGenerationCalls:0}};
  requireThat(same(rollbackActivation(config,result),snapshot.config),'INVERSE_NOT_EXACT');return result;
}

/** Field-scoped inverse, never a whole-config restore. Preserve later unrelated
 * additions/weights/prices. Conflicting edits to our fields require review. */
export function rollbackActivation(current,plan){
  const config=structuredClone(current);
  for(const change of [...plan.delta].reverse()){
    if(change.kind==='channel'){
      const m=row(config,'publicModels',change.publicId),channels=m.supplierRouting?.channels;
      requireThat(Array.isArray(channels),'ROLLBACK_ROUTING_CHANGED');
      const matches=channels.filter(x=>x.upstreamId===change.upstreamId);
      requireThat(matches.length===1&&same(matches[0],change.after),'ROLLBACK_CHANNEL_CONFLICT');
      m.supplierRouting.channels=channels.filter(x=>x.upstreamId!==change.upstreamId);
    }else{
      requireThat(same(valueAt(config,change),change.after),'ROLLBACK_FIELD_CONFLICT');
      const {parent,key}=locate(config,change);if(change.before.present)parent[key]=structuredClone(change.before.value);else delete parent[key];
    }
  }
  requireThat(!config.upstreamModels.some(u=>u.providerId==='apib-image'&&u.enabled),'ROLLBACK_PROVIDER_HAS_NEW_DEPENDENTS');
  return config;
}

export function verifyActivation(current,plan){
  requireThat(digest(current)===plan.candidateDigest,'ACTIVE_CONFIG_MISMATCH');
  const original=rollbackActivation(current,plan);requireThat(digest(original)===plan.baseline.digest,'PROTECTED_CONFIG_CHANGED');
  return {enabledIds:ACTIVATION_IDS.map(x=>`apib:${x}`),deltaCount:plan.delta.length,verifiedPromotions:0,procurementWrites:0,metadataWrites:0,existingWeightsChanged:0};
}
