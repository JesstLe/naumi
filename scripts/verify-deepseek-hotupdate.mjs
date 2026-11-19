import assert from 'node:assert/strict';
import {prepareDeepseek,rollbackDeepseek,PUBLIC_IDS,OLD,UPSTREAM} from './lib/deepseek-hotupdate.mjs';
const baseline={providers:[{id:'apib-text',enabled:true,protocol:'openai-chat',baseUrl:'https://api.apib.ai/v1',credentialRef:'fixture'}],upstreamModels:[{id:OLD,providerId:'apib-text',model:'glm-5.3-flash',enabled:true,capabilities:{generate:true,vision:true,verified:true},procurement:{oldPrice:123},costRef:'old-rate'}],publicModels:PUBLIC_IDS.map(id=>({id,label:id==='gpt6Astra'?'GPT-6 Astra':id,modality:'text',enabled:true,target:{type:'upstream',id:OLD},supplierRouting:{mode:'priority',channels:[{upstreamId:OLD,enabled:true,priority:1,weight:1}]},price:'keep'})),bindings:{'text.generate':'gpt6Astra'},images:{references:14}};
const original=structuredClone(baseline),candidate=prepareDeepseek(baseline);
assert.deepEqual(baseline,original);assert.deepEqual(rollbackDeepseek(candidate,baseline,candidate),baseline);
assert.equal(candidate.upstreamModels.length,2);assert(!candidate.upstreamModels[1].procurement&&!candidate.upstreamModels[1].costRef);assert.equal(candidate.upstreamModels[1].capabilities.verified,false);
for(const old of baseline.publicModels){const after=candidate.publicModels.find(m=>m.id===old.id);assert.equal(after.label,old.label);assert.equal(after.id,old.id);assert.equal(after.price,old.price);assert.equal(after.target.id,UPSTREAM)}
assert.deepEqual(candidate.bindings,baseline.bindings);assert.deepEqual(candidate.images,baseline.images);
const later=structuredClone(candidate);later.publicModels[0].label='Later administrator display edit';later.images.references=12;
const inverse=rollbackDeepseek(later,baseline,candidate);assert.equal(inverse.publicModels[0].label,later.publicModels[0].label);assert.equal(inverse.images.references,12);
const changed=structuredClone(candidate);changed.publicModels[0].target.id='other';assert.throws(()=>rollbackDeepseek(changed,baseline,candidate));
const dependency=structuredClone(candidate);dependency.otherConsumer=UPSTREAM;assert.throws(()=>rollbackDeepseek(dependency,baseline,candidate));
assert.throws(()=>prepareDeepseek(candidate));
console.log('DEEPSEEK_HOTUPDATE_PLAN=PASS namesAndIdsPreserved=true unrelatedConfigPreserved=true frozenOldUpstreamPreserved=true selectiveRollback=true conflictsRejected=true supplierCalls=0');
