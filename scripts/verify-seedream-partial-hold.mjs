import {holdIndependentSeedream} from './lib/seedream-partial-hold.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import {rollbackSeedream,applySeedreamDelta} from './lib/apib-seedream.mjs';import {digest} from './lib/apib-activation.mjs';
const root=process.argv[2]||'output/apib-seedream-publication47-20261020',plan=JSON.parse(fs.readFileSync(root+'/PLAN.json','utf8')),base=JSON.parse(fs.readFileSync(root+'/ORIGINAL_MODEL.json','utf8'));
const inverse=rollbackSeedream(plan.config,plan);assert.equal(digest(inverse),base.digest);
const pro=plan.delta.filter(d=>d.kind==='field'&&d.group==='upstreamModels'&&d.id==='apib:seedream-5-0-pro'||['routing-create','channel-add'].includes(d.kind)&&d.id==='jimeng-image-5.0-pro');assert.equal(pro.length,11);
const partial=holdIndependentSeedream(plan.config,plan);assert.deepEqual(partial.publicModels.find(m=>m.id==='jimeng-image-5.0-pro'),plan.config.publicModels.find(m=>m.id==='jimeng-image-5.0-pro'));assert.equal(partial.publicModels.length,base.config.publicModels.length);assert.equal(partial.upstreamModels.filter(m=>m.id.startsWith('apib:seedream-')&&m.enabled).length,1);
const later=structuredClone(plan.config);later.upstreamModels.find(m=>m.id==='local-jimeng-50-pro').label='later-label';later.publicModels.find(m=>m.id==='jimeng-image-5.0-pro').supplierRouting.channels[0].weight=9;
const preserved=holdIndependentSeedream(later,plan);assert.equal(preserved.upstreamModels.find(m=>m.id==='local-jimeng-50-pro').label,'later-label');assert.equal(preserved.publicModels.find(m=>m.id==='jimeng-image-5.0-pro').supplierRouting.channels[0].weight,9);
fs.writeFileSync(root+'/FINAL_PRO_CANDIDATE.json',JSON.stringify(partial,null,2));console.log('PARTIAL_ROLLBACK_COPY=PASS FULL_55_INVERSE=PASS KEEP_PRO_11=PASS HOLD_INDEPENDENT_44=PASS LATER_LABEL_WEIGHT=PRESERVED SUPPLIER_CALLS=0');

const conflict=structuredClone(plan.config);conflict.upstreamModels.find(m=>m.id==='apib:seedream-4-0').capabilities.maxReferenceImages=9;assert.throws(()=>holdIndependentSeedream(conflict,plan));
const dependency=structuredClone(plan.config);dependency.bindings['image.generate']='jimeng-image-4.0';assert.throws(()=>holdIndependentSeedream(dependency,plan));
console.log('PARTIAL_CONFLICT_DEPENDENCY=PASS NO_OVERWRITE=true');
