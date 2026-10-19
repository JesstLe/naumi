import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createModelFixture } from './model-config-fixture';
import { fixtureConfig } from './billing-unit-fixture';
import { makeActivationPlan, rollbackActivation, activationMatrix, verifyActivation, digest } from './lib/apib-activation.mjs';
import { runActivation, verifyLocalPlan } from './ops/apib-activation';

const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const contract=read('docs/providers/apib-activation-20261019.json'),manifest=read('docs/providers/apib-onboarding-20261019.json'),source=readFileSync(contract.source.path);
const save=(root:string,name:string,value:unknown)=>writeFileSync(join(root,name),JSON.stringify(value,null,2));
async function main(){
  const root=resolve('output/apib-activation-fixtures',randomUUID());mkdirSync(root,{recursive:true});
  let attempts=0,activations=0,state='',loseActivationResponse=true;const publications=new Map<string,any>();
  const f=await createModelFixture((_req,res)=>{attempts++;res.statusCode=500;res.end('Generation forbidden');});
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  const db=await import('../src/lib/db'),{ensureSupplierSchema}=await import('../src/lib/supplier-cost/schema');
  const {createModelRuntime}=await import('../src/lib/model-config/runtime');
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{attempts++;throw Error('All real HTTP disabled in activation fixture');};
  try{
    const c=f.config;c.publicModels[0].id='gpt-image-2';c.publicModels[0].label='GPT-Image-2.5';c.publicModels[0].supplierRouting={mode:'balanced',channels:[{upstreamId:'u1',enabled:true,priority:2,weight:7}]};c.bindings={'image.generate':'gpt-image-2','image.edit':'gpt-image-2'};
    for(const modality of ['image','video'] as const){const id=`apib-${modality}`,key=await f.credentials.importPlain({providerId:id,plain:`fixture-${id}`,actor:'fixture'});c.providers.push({id,name:id,protocol:modality==='image'?'apimart-images':'apimart',baseUrl:'https://api.apib.ai/v1',credentialRef:key.id,enabled:false,timeoutMs:240000,maxConcurrent:1});}
    for(const m of manifest.models)c.upstreamModels.push({id:`apib:${m.id}`,providerId:`apib-${m.modality}`,model:m.id,label:m.id,modality:m.modality,enabled:false,capabilities:{verified:false,generate:false,edit:false,vision:false,transparent:false,preserveIdentity:false,textAccuracy:false,qualityRank:1,qualities:[],nativeResolutions:[],maxReferenceImages:0,expectedLatencyMs:0},parameterMap:{}});
    await db.ensureSchema();await ensureSupplierSchema(f.sql);const baseline=await f.repo.current();
    const billing={version:8,config:fixtureConfig()};let liveBilling=billing;
    const router:any={seal:()=>({}),prepare:async()=>{},state:async()=>state,status:async(id:string)=>publications.get(id)||null,activate:async(id:string,old:string,next:string)=>{assert.equal(old,state);activations++;state=next;const r={id,digest:next,phase:'applied'};publications.set(id,r);if(loseActivationResponse){loseActivationResponse=false;throw Error('fixture lost activation response');}return r;}};
    const runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,billing:async()=>liveBilling,billingByVersion:async(version)=>version===9?liveBilling:billing,trustedOrigins:[f.origin]});
    const a={repo:f.repo,runtime,credentials:f.credentials,billing:{current:async()=>liveBilling},trustedOrigins:[f.origin],pool:f.sql};
    const plan=makeActivationPlan(baseline,billing,contract,source,manifest);
    assert.equal(plan.delta.length,17);assert.equal(plan.matrix.filter((x:any)=>x.decision==='HOLD').length,73);assert.equal(activationMatrix(manifest).length,75);
    assert.deepEqual(rollbackActivation(plan.config,plan),baseline.config);assert.equal(verifyActivation(plan.config,plan).enabledIds.length,2);
    assert.equal(verifyLocalPlan(plan,baseline,billing,[f.origin]).combinations,75);
    assert.equal(plan.config.upstreamModels.filter((u:any)=>u.id.startsWith('apib:')&&u.enabled).length,2);
    assert.equal(plan.config.upstreamModels.some((u:any)=>u.id.startsWith('apib:')&&(u.capabilities.verified||u.procurement)),false);
    const changed=structuredClone(plan.config);changed.publicModels[0].supplierRouting.channels[0].weight=9;changed.upstreamModels[0].label='Later administrator label';
    const inverse=rollbackActivation(changed,plan);assert.equal(inverse.publicModels[0].supplierRouting.channels[0].weight,9);assert.equal(inverse.upstreamModels[0].label,'Later administrator label');
    const conflict=structuredClone(plan.config);conflict.publicModels[0].supplierRouting.channels.at(-1).weight=2;assert.throws(()=>rollbackActivation(conflict,plan),/ROLLBACK_CHANNEL_CONFLICT/);
    const dependent=structuredClone(plan.config);dependent.upstreamModels.find((u:any)=>u.id==='apib:gpt-image-2.5-ext').enabled=true;assert.throws(()=>rollbackActivation(dependent,plan),/ROLLBACK_PROVIDER_HAS_NEW_DEPENDENTS/);
    assert.throws(()=>makeActivationPlan(baseline,billing,contract,Buffer.from('changed'),manifest),/DOCUMENT_HASH_CHANGED/);
    const altered=structuredClone(contract);altered.parameters.resolutionPolicy.values['2K']='2k';assert.throws(()=>makeActivationPlan(baseline,billing,altered,source,manifest),/PARAMETER_CONTRACT_CHANGED/);
    const invalid=structuredClone(baseline);invalid.config.providers.at(-2)!.enabled=true;invalid.digest=digest(invalid.config);assert.throws(()=>makeActivationPlan(invalid,billing,contract,source,manifest),/PROVIDER_BASELINE_CHANGED/);
    save(root,'PLAN.json',plan);save(root,'ORIGINAL_MODEL.json',baseline);save(root,'ORIGINAL_BILLING.json',billing);
    await assert.rejects(()=>runActivation('APPLY',root,a,undefined,false));
    await runActivation('PLAN',root,a,undefined,true);assert.equal(activations,0);
    await assert.rejects(()=>runActivation('APPLY',root,a,undefined,true),/Same ID retained/);assert.equal(activations,1);assert.equal((await f.repo.current()).version,baseline.version);
    const first=await runActivation('APPLY',root,a,undefined,true);assert.equal((first as any).publication.phase,'applied');assert.equal(activations,1);
    await runActivation('APPLY',root,a,undefined,true);assert.equal(activations,1,'Repeated APPLY must reuse same publication');
    const result:any=await runActivation('VERIFY',root,a,undefined,true);assert.equal(result.wires.length,2);assert.equal(result.providerCalls,0);assert.equal(result.runtimeGenerationAcceptance,'NOT_PERFORMED');
    // Simulate another legitimate administrator revision after our publication.
    const current=await f.repo.current(),later=structuredClone(current.config);later.upstreamModels[0].label='Later administrator label';later.publicModels[0].supplierRouting!.channels[0].weight=9;
    const draft=await f.repo.draft('other-admin'),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:later,actor:'other-admin'});
    await runtime.publish({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:'other-admin',reason:'fixture unrelated administrator update'});
    liveBilling={version:9,config:structuredClone(billing.config)};
    const rolled:any=await runActivation('ROLLBACK',root,a,undefined,true);assert.equal(rolled.restoredOwnDelta,true);
    const after=await f.repo.current();assert.equal(after.config.upstreamModels[0].label,'Later administrator label');assert.equal(after.config.publicModels[0].supplierRouting!.channels[0].weight,9);assert.equal(liveBilling.version,9);
    assert.equal(after.config.providers.find(p=>p.id==='apib-image')!.enabled,false);assert.equal(after.config.upstreamModels.filter(u=>u.id.startsWith('apib:')&&u.enabled).length,0);
    const pubCount=activations;await runActivation('ROLLBACK',root,a,undefined,true);assert.equal(activations,pubCount);
    assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_supplier_calls')).rows[0].n,0);assert.equal(attempts,0);
    console.log('APIB_ACTIVATION=PASS; ENABLED=2; HELD=73; DELTA=17; PLAN_COMBINATIONS=75; UNKNOWN_SAME_ID_RECOVERY=PASS; SAME_ID_APPLY=PASS; SELECTIVE_ROLLBACK=PASS; LATER_WEIGHTS_LABELS_BILLING=PRESERVED; SUPPLIER_CALLS=0');
  }finally{globalThis.fetch=originalFetch;await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
