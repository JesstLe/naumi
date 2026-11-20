import 'server-only';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openSync,closeSync,writeFileSync,fsyncSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {prepareImageLaunch,rollbackImageLaunch,LAUNCH_MODELS} from '../lib/image26-seed55-launch.mjs';
import {validateModelConfig} from '../../src/lib/model-config/schema';
import {modelConfigDigest,canonicalConfig} from '../../src/lib/model-config/snapshot-value';
import {publicModelCatalog} from '../../src/lib/model-config/public-catalog';
import {ingestSupplierSources} from '../../src/lib/supplier-models/repository';

const [mode,root]=process.argv.slice(2);
assert(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode));assert(/^\/tmp\/image26-seed55-launch-[a-z0-9-]+$/.test(root));
const read=(name:string)=>JSON.parse(readFileSync(join(root,name),'utf8'));
function save(name:string,data:unknown){const fd=openSync(join(root,name),'wx',0o600);try{writeFileSync(fd,JSON.stringify(data));fsyncSync(fd)}finally{closeSync(fd)}}
async function main(){
 const proof=read('LOCK_PROOF.json');assert.equal(proof.target,'47.105.59.142');
 assert.deepEqual(proof.locks,['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']);
 assert(Date.now()-Date.parse(proof.at)>=0 && Date.now()-Date.parse(proof.at)<60000);
 assert.equal(proof.sourceCommit,process.env.SOURCE_COMMIT);assert.equal(proof.sourceCommit,read('SPEC.json').sourceCommit);
 const {getModelAdministration}=await import('../../src/lib/model-config/server');const a=await getModelAdministration();
 try{
  const current=await a.repo.current(),billing=await a.billing.current();
  if(mode==='PLAN'){
   assert(!existsSync(join(root,'PLAN.json')),'EXISTING_PLAN_REQUIRES_RECONCILIATION');
   const provider=current.config.providers.find(p=>p.id==='apib-image')!;assert.equal(provider.baseUrl,'https://api.apib.ai/v1');
   const key=await a.credentials.read(provider.credentialRef!,provider.id);
   const response=await fetch(provider.baseUrl+'/models',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(20000)});
   assert.equal(response.status,200);const catalog=await response.json();assert(Array.isArray(catalog.data));
   const config=prepareImageLaunch(current.config,read('CONTRACT.json'),catalog.data.map((m:any)=>m.id));
   validateModelConfig(config,{trustedOrigins:a.trustedOrigins});assert.deepEqual(rollbackImageLaunch(config,current.config,config),current.config);
   const sources=read('SOURCES.json');const wires=LAUNCH_MODELS.flatMap(m=>m.wires);
   assert(wires.every(w=>sources.results.some((s:any)=>s.http===200&&s.success&&s.data.model_name===w)));
   const checks=[];
   for(const feature of ['canvas.image','image.generate'] as const){
    const before=publicModelCatalog(current,'image',feature,true),after=publicModelCatalog({...current,config},'image',feature,true);
    assert.equal(after.defaultModelId,before.defaultModelId);
    for(const old of before.models)assert.deepEqual(after.models.find(m=>m.id===old.id),old);
    checks.push({feature,models:after.models.filter(m=>LAUNCH_MODELS.some(f=>f.id===m.id))});
   }
   save('PLAN.json',{operationId:randomUUID(),baseline:current,billing,config,candidateDigest:modelConfigDigest(config),catalog,sourceCommit:proof.sourceCommit,checks});
   console.log(JSON.stringify({mode,baselineVersion:current.version,checks,supplierPosts:0}));return;
  }
  const plan=read('PLAN.json');
  assert.equal(canonicalConfig(billing),canonicalConfig(plan.billing),'BILLING_CHANGED_REVIEW_REQUIRED');
  if(mode==='VERIFY'){
   const publication=await a.repo.publication(plan.operationId);assert.equal(publication.phase,'applied');assert.equal(publication.version,current.version);assert.equal(current.digest,plan.candidateDigest);
   const result={publication,models:LAUNCH_MODELS,checks:plan.checks,billingUnchanged:true,oldDefaultsAndModelsUnchanged:true};save('VERIFIED.json',result);console.log(JSON.stringify(result));return;
  }
  const rollback=mode==='ROLLBACK';let config=plan.config,id=plan.operationId;
  if(rollback){assert.equal((await a.repo.publication(plan.operationId)).phase,'applied');config=rollbackImageLaunch(current.config,plan.baseline.config,plan.config);id=read('SPEC.json').rollbackOperationId;}
  const filename=mode+'_REQUEST.json';
  if(existsSync(join(root,filename))){
   const request=read(filename),publication=await a.repo.publication(request.id);
   if(publication?.phase==='applied' && current.digest===modelConfigDigest(config)){console.log(JSON.stringify({mode,reconciled:true,publication}));return;}
   throw Error('PUBLICATION_OUTCOME_REQUIRES_ORIGINAL_ID_RECONCILIATION');
  }
  if(!rollback){assert.equal(current.version,plan.baseline.version);assert.equal(current.digest,plan.baseline.digest);}
  validateModelConfig(config,{trustedOrigins:a.trustedOrigins});
  if(!rollback && !existsSync(join(root,'METADATA.json'))){
   const provider=current.config.providers.find(p=>p.id==='apib-image')!,sources=read('SOURCES.json');
   const count=await ingestSupplierSources(a.pool,provider,{models:plan.catalog.data.map((m:any)=>({id:m.id,label:m.id,sourceMetadata:m})),fetchedAt:sources.observedAt,status:'ok'},
    {url:'https://api.apib.ai/api/pricing/model',fetchedAt:sources.observedAt,hash:modelConfigDigest(sources as any),body:{data:sources.results.map((s:any)=>s.data)}});
   save('METADATA.json',{added:count,sourceOnly:true,manualPricesPreserved:true});
  }
  const actor='ops:image26-seed55:'+id,draft=await a.repo.draft(actor);assert.equal(draft.basedOnVersion,current.version);
  const saved=await a.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor});
  const request={id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor,reason:rollback?'Remove only the image26/seedream55 launch additions':'User requested one GPT-Image-2.6 family with equal random Flare/Sunburst and separate 即梦 5.5; preserve names/defaults/billing/history'};
  save(filename,request);const publication=await a.runtime.publish(request);save(mode+'_PUBLICATION.json',publication);assert.equal(publication.phase,'applied');console.log(JSON.stringify({mode,publication}));
 }finally{await a.pool.end()}
}
main().catch(e=>{console.error('IMAGE_LAUNCH_FAILED',e.code||e.name,e.message);process.exitCode=1});
