import assert from 'node:assert/strict';
import {BANANA_REFERENCE_IDS, bananaReferenceConfig} from './lib/banana-reference-limit.mjs';

const original = {providers:[{id:'apib-image',enabled:true,protocol:'apimart-images',baseUrl:'https://api.apib.ai/v1'}],upstreamModels:BANANA_REFERENCE_IDS.map(id=>({id,enabled:true,providerId:'apib-image',capabilities:{edit:true,maxReferenceImages:1,verified:false},parameterMap:{keep:true}})),publicModels:[{id:'untouched',price:6}]};
const before=structuredClone(original), candidate=bananaReferenceConfig(original);
assert.deepEqual(original,before);
assert(candidate.upstreamModels.every(u=>u.capabilities.maxReferenceImages===14));
assert.deepEqual(bananaReferenceConfig(candidate,'rollback'),original);
const later=structuredClone(candidate);later.publicModels[0].price=7;
assert.equal(bananaReferenceConfig(later,'rollback').publicModels[0].price,7);
for (const changed of [0,2,13,15]) {
  const conflict=structuredClone(original);conflict.upstreamModels[0].capabilities.maxReferenceImages=changed;
  assert.throws(()=>bananaReferenceConfig(conflict));
}
const missing=structuredClone(original);missing.upstreamModels.pop();assert.throws(()=>bananaReferenceConfig(missing));
console.log('BANANA_REFERENCE_PLAN=PASS exactTwoFields=true selectiveRollback=true conflictsRejected=true supplierCalls=0');
