import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {getModelAdministration} from '../src/lib/model-config/server';
import {readSupplierModel} from '../src/lib/supplier-models/repository';
import {supplierMetadataSchema,type SupplierMetadata} from '../src/lib/supplier-models/types';
import {addImagegenEditObservation,imagegenEditObservationSchema,recordImagegenEditObservation,removeImagegenEditObservation} from '../src/lib/supplier-models/imagegen-observations';
import {readImagegenDefaults} from '../src/lib/supplier-models/imagegen-access';
import {canonicalConfig} from '../src/lib/model-config/repository';
import {BANANA_EDIT_PROOFS} from './repair-banana-edit-evidence-policy';

async function main(){
 const [mode,dir,proofDir='/tmp/banana-edit-proof-20261015']=process.argv.slice(2);
 assert.ok(['BASELINE','APPLY','VERIFY','ROLLBACK_COPY'].includes(mode));
 assert.ok(dir?.startsWith('/tmp/banana-metadb-20261015/'));mkdirSync(dir,{recursive:true,mode:0o700});
 const save=(name:string,value:unknown)=>writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const read=(name:string)=>JSON.parse(readFileSync(path.join(dir,name),'utf8'));
 const hash=(value:unknown)=>createHash('sha256').update(canonicalConfig(value)).digest('hex');
 const admin=await getModelAdministration();
 try{
  const snapshot=await admin.repo.current(),billing=await admin.billing.current();
  const target=(await admin.pool.query("SELECT id FROM app_supplier_model_metadata WHERE provider_id='geeknow-images' AND model_id='gemini-3-pro-image-preview'")).rows[0];assert.ok(target);
  const current=await readSupplierModel(admin.pool,target.id);
  const metadata:SupplierMetadata={family:current.family,brand:current.brand,modality:current.modality,notes:current.notes,capabilityState:current.capabilityState,capabilities:current.capabilities,parameterMetadata:current.parameterMetadata,capabilitySource:current.capabilitySource,capabilityUrl:current.capabilityUrl,checkedAt:current.checkedAt,prices:current.prices};
  if(mode==='BASELINE'){
   assert.ok(!existsSync(path.join(dir,'ORIGINAL.json')),'保留已有基线，请用新目录');
   const proof=readFileSync(path.join(proofDir,'PROOF.json'),'utf8'),p=JSON.parse(proof),known=BANANA_EDIT_PROOFS[0];
   assert.equal(p.callId,known.call);assert.equal(p.operation,known.operation);assert.equal(p.referenceCount,1);assert.equal(p.httpStatus,200);assert.equal(p.outputDecoded,true);assert.equal(p.actualRequests,1);assert.equal(p.endpoint,'/images/edits');
   const output=readFileSync(path.join(proofDir,'OUTPUT.png')),reference=readFileSync(path.join(proofDir,'REFERENCE.png'));
   assert.equal(createHash('sha256').update(output).digest('hex'),known.outputSha256);assert.equal(createHash('sha256').update(reference).digest('hex'),p.referenceSha256);
   const pixels=await sharp(output).metadata();await sharp(output).raw().toBuffer();assert.equal(pixels.width,p.width);assert.equal(pixels.height,p.height);
   const calls=await admin.pool.query("SELECT id FROM app_supplier_calls WHERE id=$1 AND operation_id=$2 AND provider_id=$3 AND model=$4 AND delivered=1 AND evidence->>'httpStatus'='200' AND state='response-received'",[p.callId,p.operation,p.providerId,p.model]);assert.equal(calls.rows.length,1);
   const provider=snapshot.config.providers.find(x=>x.id===p.providerId)!;assert.equal(provider.baseUrl,p.baseUrl);assert.equal(provider.credentialRef,p.credentialRef);
   const observation=imagegenEditObservationSchema.parse({id:'c517dc1a-5895-43bf-a85e-715dd6ae1895',providerId:p.providerId,modelId:p.model,callId:p.callId,supplierOperation:p.operation,observedAt:p.createdAt,endpoint:p.endpoint,referenceCount:1,referenceSha256:p.referenceSha256,request:{ratio:'3:4',resolution:'1K',quantity:1},httpStatus:200,delivered:1,outputDecoded:true,output:{sha256:p.outputSha256,width:p.width,height:p.height,bytes:output.length}});
   const next=addImagegenEditObservation(metadata,observation);
   save('ORIGINAL.json',{id:current.id,revision:current.revision,metadata});save('MODIFIED_FILE',next);save('OBSERVATION.json',observation);save('BASELINE.json',{metadataHash:hash(metadata),modelDigest:snapshot.digest,billingHash:hash(billing),manualImagegenUnchanged:true,providerCalls:0});
   console.log(`BASELINE PASS metadata_revision=${current.revision} edit_observation_absent=${!metadata.parameterMetadata.supplierImagegenEvidence} provider_calls=0`);
  }else if(mode==='APPLY'){
   const before=read('ORIGINAL.json'),baseline=read('BASELINE.json'),observation=read('OBSERVATION.json');
   assert.equal(current.id,before.id);assert.equal(snapshot.digest,baseline.modelDigest);assert.equal(hash(billing),baseline.billingHash);
   const result=await recordImagegenEditObservation(admin.pool,{modelId:before.id,expectedRevision:before.revision,actor:'codex:banana-real-edit-metadata:20261015',observation});save('RESULT.json',result);
   const updated=await readSupplierModel(admin.pool,target.id);assert.equal(updated.revision,result.revision);
   console.log(`MODIFIED PASS metadata_revision=${result.revision} replayed=${result.replayed} independent_edit_evidence_saved=true provider_calls=0`);
  }else if(mode==='VERIFY'){
   const expected=supplierMetadataSchema.parse(read('MODIFIED_FILE'));assert.deepEqual(metadata,expected);
   const baseline=read('BASELINE.json');assert.equal(snapshot.digest,baseline.modelDigest);assert.equal(hash(billing),baseline.billingHash);
   const defaults=(await readImagegenDefaults(admin.pool,snapshot.config)).get('geeknow-nano-banana-pro');assert.equal(defaults?.capabilities.edit?.state,'supported');
   const versions=await admin.pool.query('SELECT revision,actor FROM app_supplier_model_metadata_versions WHERE model_id=$1 AND operation_id=$2',[current.id,read('OBSERVATION.json').id]);assert.equal(versions.rows.length,1);assert.equal(Number(versions.rows[0].revision),current.revision);
   save('VERIFIED.json',{revision:current.revision,effectiveEdit:'supported',historyRows:1,manualPricesAndOtherFieldsUnchanged:true,modelConfigUnchanged:true,billingUnchanged:true,providerCalls:0});
   console.log(`VERIFY PASS metadata_revision=${current.revision} effective_edit=supported history_rows=1 manual_and_prices_preserved=true live_config_unchanged=true provider_calls=0`);
  }else{
   const before=read('ORIGINAL.json'),modified=read('MODIFIED_FILE'),observation=read('OBSERVATION.json');
   const restored=removeImagegenEditObservation(modified,before.metadata,observation);assert.equal(hash(restored),hash(before.metadata));save('ROLLBACK_COPY.json',restored);
   console.log('ROLLBACK PASS independent_copy_original_hash_restored=true live_metadata_kept=true provider_calls=0');
  }
 }finally{await admin.pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
