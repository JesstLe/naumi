import assert from 'node:assert/strict';
export const WIRE='deepseek-v4.1-flash',UPSTREAM='apib:'+WIRE,OLD='apib:glm-5.3-flash';
export const PUBLIC_IDS=['gpt6Astra','hy4-preview','agent-vision-7c1e5ed7132de672','platform-reference-e33230db3dd7d2f0'];
export function prepareDeepseek(original){
 const config=structuredClone(original),p=config.providers.find(p=>p.id==='apib-text'),old=config.upstreamModels.find(u=>u.id===OLD);
 assert(p?.enabled&&p.protocol==='openai-chat'&&p.baseUrl==='https://api.apib.ai/v1'&&p.credentialRef);
 assert(old?.enabled&&old.providerId===p.id&&old.model==='glm-5.3-flash'&&old.capabilities.generate&&old.capabilities.vision);
 assert(!config.upstreamModels.some(u=>u.id===UPSTREAM),'DEEPSEEK_UPSTREAM_EXISTS_REVIEW_FIRST');
 const added={...structuredClone(old),id:UPSTREAM,model:WIRE,label:'DeepSeek V4.1 Flash',capabilities:{...old.capabilities,verified:false}};
 delete added.procurement;delete added.costRef;
 config.upstreamModels.push(added);
 for(const id of PUBLIC_IDS){
  const m=config.publicModels.find(m=>m.id===id);assert(m?.enabled&&m.modality==='text'&&m.target.type==='upstream'&&m.target.id===OLD);
  assert(m.supplierRouting?.channels.filter(c=>c.enabled).length===1&&m.supplierRouting.channels.some(c=>c.enabled&&c.upstreamId===OLD));
  m.target.id=UPSTREAM;for(const c of m.supplierRouting.channels)if(c.enabled&&c.upstreamId===OLD)c.upstreamId=UPSTREAM;
 }
 return config;
}
export function rollbackDeepseek(current,baseline,candidate){
 const result=structuredClone(current);
 for(const id of PUBLIC_IDS){
  const m=result.publicModels.find(m=>m.id===id),before=baseline.publicModels.find(m=>m.id===id),after=candidate.publicModels.find(m=>m.id===id);
  assert.deepEqual(m.target,after.target,'OWN_TARGET_CONFLICT');assert.deepEqual(m.supplierRouting,after.supplierRouting,'OWN_CHANNEL_CONFLICT');
  m.target=structuredClone(before.target);m.supplierRouting=structuredClone(before.supplierRouting);
 }
 assert.deepEqual(result.upstreamModels.find(u=>u.id===UPSTREAM),candidate.upstreamModels.find(u=>u.id===UPSTREAM),'OWN_UPSTREAM_CONFLICT');
 result.upstreamModels=result.upstreamModels.filter(u=>u.id!==UPSTREAM);
 const references=v=>v===UPSTREAM||Array.isArray(v)&&v.some(references)||v&&typeof v==='object'&&Object.values(v).some(references);
 assert(!references(result),'LATER_DEPENDENCY_PRESERVE');return result;
}
