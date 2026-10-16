import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { supplierMetadataSchema, unknownSupplierMetadata } from '../src/lib/supplier-models/types';
import { addImagegenEditObservation, imagegenEditObservationSchema, removeImagegenEditObservation } from '../src/lib/supplier-models/imagegen-observations';
import { collectedImagegenDefaults } from '../src/lib/supplier-models/specifications';
import { imagegenMetadataSchema } from '../src/lib/imagegen/capabilities';

const source = unknownSupplierMetadata();
const reference = Buffer.from('fixture-reference-image'), output = Buffer.from('fixture-output-image');
const observation = imagegenEditObservationSchema.parse({
  id: randomUUID(), providerId:'geeknow-images', modelId:'gemini-3-pro-image-preview', callId:randomUUID(), supplierOperation:'banana-edit-proof-pro-20261015-r1', observedAt:'2026-10-15T10:41:47.529Z', endpoint:'/images/edits', referenceCount:1, referenceSha256:createHash('sha256').update(reference).digest('hex'), request:{ratio:'3:4',resolution:'1K',quantity:1}, httpStatus:200, delivered:1, outputDecoded:true, output:{sha256:createHash('sha256').update(output).digest('hex'),width:896,height:1200,bytes:output.length},
});
const changed=addImagegenEditObservation(source,observation);
for(const invalid of [{...observation,referenceCount:0},{...observation,outputDecoded:false},{...observation,delivered:0},{...observation,httpStatus:429},{...observation,endpoint:'/images/generations'},{...observation,output:{...observation.output,width:0}}])assert.equal(imagegenEditObservationSchema.safeParse(invalid).success,false);
assert.equal(imagegenEditObservationSchema.safeParse({phase:'edit',httpStatus:200}).success,false,'Ledger phase alone is not proof');
assert.equal(supplierMetadataSchema.safeParse({...source,parameterMetadata:{supplierImagegenEvidence:{capabilities:{edit:{state:'supported',source:'',checkedAt:''}},wireMap:{}}}}).success,false);
assert.equal(imagegenMetadataSchema.parse(changed.parameterMetadata.supplierImagegenEvidence).capabilities.edit?.state,'supported');
assert.equal((changed.parameterMetadata.supplierImagegenObservations as unknown[]).length,1);
assert.equal(collectedImagegenDefaults(changed.parameterMetadata).capabilities.edit?.state,'supported');
assert.deepEqual(addImagegenEditObservation(changed,observation),changed,'same observation is idempotent');
const different={...observation,output:{...observation.output,width:897}};
assert.throws(()=>addImagegenEditObservation(changed,different),/不同证据/);
const manual=structuredClone(source);manual.parameterMetadata.imagegen={capabilities:{edit:{state:'unsupported',source:'管理员明确排除',checkedAt:'2026-10-15'}},wireMap:{}};
const withManual=addImagegenEditObservation(manual,observation);
assert.equal(imagegenMetadataSchema.parse(withManual.parameterMetadata.imagegen).capabilities.edit?.state,'unsupported','manual config remains untouched');
const restored=removeImagegenEditObservation(changed,source,observation);
assert.deepEqual(restored,source,'rollback restores metadata baseline');
const later=structuredClone(changed);later.notes='later manual note';assert.equal(removeImagegenEditObservation(later,source,observation).notes,'later manual note');
later.parameterMetadata.supplierImagegenEvidence={capabilities:{edit:{state:'unsupported',source:'later upstream failure',checkedAt:'2026-10-15'}},wireMap:{}};assert.throws(()=>removeImagegenEditObservation(later,source,observation),/后续更新/);
assert.ok(supplierMetadataSchema.safeParse(changed).success);
console.log('PASS supplier imagegen observation: concrete reference/output proof, metadata fallback, idempotency, manual precedence, rollback');

async function databaseChecks(){
  const {createModelFixture}=await import('./model-config-fixture');
  const {ingestSupplierDirectory,ingestSupplierSources,readSupplierModel,saveSupplierModel}=await import('../src/lib/supplier-models/repository');
  const {recordImagegenEditObservation}=await import('../src/lib/supplier-models/imagegen-observations');
  const {readImagegenDefaults}=await import('../src/lib/supplier-models/imagegen-access');
  const f=await createModelFixture();
  try{
    const provider=f.config.providers[0],model=f.config.upstreamModels[0].model;
    await ingestSupplierDirectory(f.sql,provider,[{id:model,label:'fixture'}]);
    const id=(await f.sql.query('SELECT id FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2',[provider.id,model])).rows[0].id;
    let row=await readSupplierModel(f.sql,id);
    const base=supplierMetadataSchema.parse(Object.fromEntries(Object.keys(unknownSupplierMetadata()).map(k=>[k,(row as unknown as Record<string,unknown>)[k]])));base.notes='manual note';base.capabilities.edit=false;
    base.prices=[{id:randomUUID(),quality:'medium',resolution:'1K',basis:'image',currency:'CNY',amountMicros:'123',inputMicrosPerMillion:null,outputMicrosPerMillion:null,cachedInputMicrosPerMillion:null,imageInputMicrosPerMillion:null,source:'manual',sourceUrl:'',checkedAt:'2026-10-15',status:'verified'}];
    await saveSupplierModel(f.sql,{id:randomUUID(),modelId:id,expectedRevision:row.revision,metadata:base,actor:'fixture-admin'});
    row=await readSupplierModel(f.sql,id);
    const current={...observation,providerId:provider.id,modelId:model};
    const saved=await recordImagegenEditObservation(f.sql,{modelId:id,expectedRevision:row.revision,actor:'fixture-test',observation:current});
    assert.equal(saved.revision,row.revision+1);
    assert.equal((await readImagegenDefaults(f.sql,f.config)).get('u1')?.capabilities.edit?.state,'supported');
    const again=await recordImagegenEditObservation(f.sql,{modelId:id,expectedRevision:row.revision,actor:'fixture-test',observation:current});assert.equal(again.replayed,true);assert.equal(again.revision,saved.revision);
    await assert.rejects(recordImagegenEditObservation(f.sql,{modelId:id,expectedRevision:row.revision,actor:'fixture-test',observation:{...current,id:randomUUID(),callId:randomUUID()}}),/刷新/);
    const after=await readSupplierModel(f.sql,id);assert.deepEqual(after.prices,row.prices);assert.equal(after.notes,'manual note');assert.equal(after.capabilities.edit,false);
    for(const state of ['unsupported','unknown'] as const){
      const value=supplierMetadataSchema.parse({...base,parameterMetadata:{...after.parameterMetadata,imagegen:{capabilities:{edit:{state,source:'manual',checkedAt:'2026-10-15'}},wireMap:{}}}});
      const before=await readSupplierModel(f.sql,id);await saveSupplierModel(f.sql,{id:randomUUID(),modelId:id,expectedRevision:before.revision,actor:'fixture-admin',metadata:value});
      assert.equal((await readImagegenDefaults(f.sql,f.config)).get('u1')?.capabilities.edit?.state,state);
    }
    await ingestSupplierSources(f.sql,provider,{models:[{id:model,label:'changed directory'}],fetchedAt:'2026-10-15T12:00:00Z',status:'ok'},null);
    const refreshed=await readSupplierModel(f.sql,id);assert.deepEqual(refreshed.parameterMetadata.supplierImagegenEvidence,after.parameterMetadata.supplierImagegenEvidence);assert.deepEqual(refreshed.prices,row.prices);
    assert.equal(imagegenMetadataSchema.parse(refreshed.parameterMetadata.imagegen).capabilities.edit?.state,'unknown');
    console.log('PASS PostgreSQL metadata revisions, stale-write rejection, replay, refreshed-source retention, effective fallback and manual false/unknown priority; supplier_calls=0');
  }finally{await f.cleanup();}
}
if(process.env.NAUMI_VERIFY_ISOLATED_DB==='1')databaseChecks().catch(error=>{console.error(error);process.exitCode=1;});
