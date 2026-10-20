import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { canonical, digest } from './apib-activation.mjs';

export const SEEDREAM_IDS=['seedream-4-0','seedream-4-5','seedream-5-0-flash','seedream-5-0-lite','seedream-5-0-pro'];
const SOURCE_PINS=['90a3f708a38b488fcb3ee2e1430aadfba942d0faccf08caeb8590750f0846d19','4c82d6b392ad0272665d344f2909cd6dbd34846dadbb9342650cc38a288a5ea5','8d6d2c702ae17dc233ba7dd0152bae5fe59d697ce835d63468672c3c32c2c69e','f91b8c93b9882a22bafcdb2617c3b32ff3b861a826d01373231e195271a1dc95','cd2583da9be392d4e85107bd62031475a2bdcec2f86c1c7f95333dc9c8fae17f'];
const same=(a,b)=>canonical(a)===canonical(b);
const row=(config,group,id)=>{const values=config[group].filter(x=>x.id===id);assert.equal(values.length,1,`Identity conflict ${group}/${id}`);return values[0];};
const field=(config,change)=>{let parent=row(config,change.group,change.id);for(const key of change.path.slice(0,-1)){assert.ok(parent[key]&&typeof parent[key]==='object');parent=parent[key];}const key=change.path.at(-1);return {parent,key,value:Object.hasOwn(parent,key)?{present:true,value:structuredClone(parent[key])}:{present:false}};};

/** Exact source and per-model wire matrix. Never infer identity from a label. */
export function verifySeedreamContract(contract,sourceBytes){
 assert.deepEqual(contract.models.map(m=>m.id),SEEDREAM_IDS);assert.equal(contract.providerId,'apib-image');assert.equal(contract.protocol,'apimart-images');assert.equal(contract.baseUrl,'https://api.apib.ai/v1');
 for(const m of contract.models){
  assert.equal(m.source.sha256,SOURCE_PINS[SEEDREAM_IDS.indexOf(m.id)]);
  const bytes=sourceBytes[m.id];assert.equal(createHash('sha256').update(bytes).digest('hex'),m.source.sha256,'Source bytes changed');
  const text=Buffer.from(bytes).toString('utf8');assert.ok(text.includes(m.id));
  for(const literal of ['body="image_urls"','body="resolution"','body="n"'])assert.ok(text.includes(literal));
  assert.deepEqual(m.qualities,['medium']);assert.equal(m.maxReferences,10);assert.equal(m.maxOutputsPerSupplierCall,1);
  assert.equal(m.parameters.qualityPolicy.mode,'omit');assert.deepEqual(m.parameters.qualityPolicy.choices,[{id:'medium',label:'标准'}]);
  const observed={};let active='',columns=[];
  for(const line of text.split('\n')){
   if(line.trim().startsWith('| Resolution |'))columns=line.split('|').slice(2,-1).map(x=>x.trim());
   const tier=line.match(/\*\*(1K|1\.5K|2K|3K|4K)(?: Resolution)?\*\*/);
   if(tier&&line.trim().startsWith('| **')){for(const [i,cell] of line.split('|').slice(2,-1).entries()){const pixels=cell.match(/\d+/g);assert.equal(pixels?.length,2);observed[`${tier[1]}:${columns[i]}`]={width:Number(pixels[0]),height:Number(pixels[1])};}}
   else if(tier)active=tier[1];
   const pixels=line.match(/^\s*\|\s*(\d+:\d+)\s*\|\s*(\d+)\s*[x×]\s*(\d+)\s*\|/);
   if(pixels&&active)observed[`${active}:${pixels[1]}`]={width:Number(pixels[2]),height:Number(pixels[3])};
  }
  assert.deepEqual(m.sourceObservations.outputDimensions,observed,'Original pixel observations changed');
  const policy=m.parameters.apimartImages;assert.equal(policy.schemaVersion,1);assert.equal(policy.maxOutputs,1);assert.equal(policy.supportsMask,false);
  assert.ok(policy.ratios.every(r=>contract.existingRatioUi.includes(r)));
  assert.deepEqual(m.parameters.resolutionPolicy,{mode:'map',field:'resolution',ratioField:'size',values:Object.fromEntries(m.resolutions.map(r=>[r,r]))});
  for(const r of m.resolutions)for(const ratio of policy.ratios){assert.deepEqual(policy.outputDimensions[`${r}:${ratio}`],m.sourceObservations.outputDimensions[`${r}:${ratio}`]);}
 }
 assert.deepEqual(contract.models.map(m=>m.resolutions),[['1K','2K','4K'],['2K','4K'],['1K','2K'],['2K','4K'],['1K','2K']]);
 assert.deepEqual(contract.models.map(m=>m.parameters.apimartImages.ratios.length),[8,8,6,3,6]);
}

/** Offline pure delta builder. The owner must rerun against the fresh real
 * snapshot under all three locks; never publish the redacted review config. */
export function makeSeedreamPlan(snapshot,billing,contract,sourceBytes,operationId=randomUUID()){
 assert.equal(snapshot.digest,digest(snapshot.config),'Real config digest required; redacted snapshots are not executable');
 assert.notEqual(snapshot.audit?.redacted,true,'Redacted snapshot is review-only');
 verifySeedreamContract(contract,sourceBytes);
 assert.match(operationId,/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
 const config=structuredClone(snapshot.config),delta=[];
 const p=row(config,'providers',contract.providerId);assert.equal(p.enabled,true);assert.equal(p.protocol,contract.protocol);assert.equal(p.baseUrl,contract.baseUrl);assert.ok(p.credentialRef);
 const pro=row(config,'publicModels',contract.existingPublicId),primary=row(config,'upstreamModels',contract.existingUpstreamId);
 assert.equal(pro.target.type,'upstream');assert.equal(pro.target.id,primary.id);assert.equal(primary.model,'jimeng/jimeng-image-5.0-pro');
 assert.deepEqual(pro.displayResolutions,['1K','2K','4K']);assert.equal(primary.capabilities.maxReferenceImages,10);
 assert.deepEqual(primary.parameterMap.qualityPolicy.choices.map(q=>q.id),['medium']);
 const originalPrimary=structuredClone(primary),originalPublic=structuredClone(pro);
 const set=(group,id,path,value)=>{const change={kind:'field',group,id,path};const loc=field(config,change);assert.ok(!same(loc.value,{present:true,value}),'No-op field');delta.push({...change,before:loc.value,after:{present:true,value:structuredClone(value)}});loc.parent[loc.key]=structuredClone(value);};
 for(const m of contract.models){
  const u=row(config,'upstreamModels',m.upstreamId);assert.equal(u.model,m.id);assert.equal(u.providerId,p.id);assert.equal(u.enabled,false);assert.equal(u.capabilities.verified,false);assert.equal(u.capabilities.generate,false);assert.equal(u.capabilities.edit,false);assert.deepEqual(u.parameterMap,{});assert.equal(u.procurement,undefined);
  const source=`${m.source.path}; documented parameter contract only; no paid runtime acceptance`;
  set('upstreamModels',u.id,['enabled'],true);
  for(const [key,value] of Object.entries({generate:true,edit:true,qualities:['medium'],nativeResolutions:m.nativeResolutions,maxReferenceImages:10,imagegen:{edit:{state:'supported',source,checkedAt:'2026-10-20'}}}))set('upstreamModels',u.id,['capabilities',key],value);
  for(const [key,value] of Object.entries(m.parameters))set('upstreamModels',u.id,['parameterMap',key],value);
  if(m.id!=='seedream-5-0-pro'){
   assert.ok(!config.publicModels.some(x=>x.id===m.publicId),'New public ID exists');
   assert.ok(!Object.values(config.business||{}).some(f=>f.options.some(o=>o.modelId===pro.id)),'Business model-specific price/options require separate review');
   const added={id:m.publicId,label:m.label,modality:'image',enabled:true,visible:true,target:{type:'upstream',id:u.id},displayResolutions:m.resolutions,toolScope:{...structuredClone(pro.toolScope),defaultFor:[]}};
   config.publicModels.push(added);delta.push({kind:'public-add',id:added.id,after:structuredClone(added)});
  }
 }
 const standby={upstreamId:'apib:seedream-5-0-pro',enabled:true,priority:2,weight:1};
 if(pro.supplierRouting){assert.ok(!pro.supplierRouting.channels.some(c=>c.upstreamId===standby.upstreamId));standby.priority=1+Math.max(...pro.supplierRouting.channels.map(c=>c.priority));assert.ok(standby.priority<=100);pro.supplierRouting.channels.push(standby);delta.push({kind:'channel-add',id:pro.id,after:structuredClone(standby)});}
 else{const primaryChannel={upstreamId:primary.id,enabled:true,priority:1,weight:1};pro.supplierRouting={mode:'priority',channels:[primaryChannel,standby]};delta.push({kind:'routing-create',id:pro.id,primary:primaryChannel,standby,mode:'priority'});}
 assert.deepEqual(primary,originalPrimary);assert.deepEqual({...pro,supplierRouting:undefined},{...originalPublic,supplierRouting:undefined});
 const plan={schemaVersion:1,kind:'apib-seedream-20261020',operationId,baseline:{version:snapshot.version,digest:snapshot.digest,billingVersion:billing.version,billingHash:digest({version:billing.version,config:billing.config})},candidateDigest:digest(config),contractHash:digest(contract),sourceHashes:Object.fromEntries(contract.models.map(m=>[m.id,m.source.sha256])),delta,config,policy:contract.policy,productionGate:'DO_NOT_ENABLE_ON_5D; requires deployed exact-wire seedreamPreflight and catalog module before independent config publication'};
 assert.deepEqual(rollbackSeedream(config,plan),snapshot.config);return plan;
}

export function rollbackSeedream(current,plan){
 const config=structuredClone(current);
 for(const change of [...plan.delta].reverse()){
  if(change.kind==='public-add'){
   assert.deepEqual(row(config,'publicModels',change.id),change.after,'New public was edited');
   assert.ok(!Object.values(config.bindings).includes(change.id)&&!Object.values(config.business||{}).some(f=>f.options.some(o=>o.modelId===change.id)),'New public acquired dependencies');
   config.publicModels=config.publicModels.filter(m=>m.id!==change.id);
  }else if(change.kind==='routing-create'){
   const m=row(config,'publicModels',change.id),routing=m.supplierRouting;assert.ok(routing);
   const ours=routing.channels.filter(c=>c.upstreamId===change.standby.upstreamId);assert.deepEqual(ours,[change.standby],'Owned standby changed');
   routing.channels=routing.channels.filter(c=>c.upstreamId!==change.standby.upstreamId);
   if(routing.mode===change.mode&&same(routing.channels,[change.primary]))delete m.supplierRouting;
   // Later administrator mode/primary weight/priority/new channels survive.
  }else if(change.kind==='channel-add'){
   const m=row(config,'publicModels',change.id);assert.deepEqual(m.supplierRouting.channels.filter(c=>c.upstreamId===change.after.upstreamId),[change.after]);m.supplierRouting.channels=m.supplierRouting.channels.filter(c=>c.upstreamId!==change.after.upstreamId);
  }else{const loc=field(config,change);assert.deepEqual(loc.value,change.after,'Owned field changed');if(change.before.present)loc.parent[loc.key]=structuredClone(change.before.value);else delete loc.parent[loc.key];}
 }
 for(const id of SEEDREAM_IDS.map(x=>'apib:'+x))assert.ok(!config.publicModels.some(m=>m.target.type==='upstream'&&m.target.id===id||m.supplierRouting?.channels.some(c=>c.upstreamId===id))&&!config.pools.some(p=>p.candidates.includes(id)),'New dependencies need review');
 return config;
}

/** Reconstruct only reviewed fields on the actual live snapshot. No provider
 * endpoint, credentials, billing or administrator draft is copied from a
 * redacted/offline full configuration into production. */
export function applySeedreamDelta(current,delta){
 const config=structuredClone(current);
 for(const change of delta){
  if(change.kind==='field'){const loc=field(config,change);assert.deepEqual(loc.value,change.before,'Reviewed field baseline changed');assert.equal(change.after.present,true);loc.parent[loc.key]=structuredClone(change.after.value);}
  else if(change.kind==='public-add'){assert.ok(!config.publicModels.some(m=>m.id===change.id),'Public ID already exists');config.publicModels.push(structuredClone(change.after));}
  else if(change.kind==='routing-create'){const m=row(config,'publicModels',change.id);assert.equal(m.supplierRouting,undefined,'Routing baseline changed');m.supplierRouting={mode:change.mode,channels:structuredClone([change.primary,change.standby])};}
  else if(change.kind==='channel-add'){const m=row(config,'publicModels',change.id);assert.ok(m.supplierRouting&&!m.supplierRouting.channels.some(c=>c.upstreamId===change.after.upstreamId));m.supplierRouting.channels.push(structuredClone(change.after));}
  else assert.fail('Unsupported reviewed delta');
 }
 return config;
}

export function verifySeedream(current,plan){assert.equal(digest(current),plan.candidateDigest);assert.equal(digest(rollbackSeedream(current,plan)),plan.baseline.digest);return {sources:5,newPublicModels:4,standbySources:1,deltaCount:plan.delta.length,verifiedPromotions:0,billingWrites:0,procurementWrites:0,providerCalls:0};}
