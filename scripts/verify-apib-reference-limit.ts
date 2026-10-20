import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createModelFixture} from './model-config-fixture';
import {makeReferenceLimitPlan as makeEditPlan,rollbackReferenceLimit as rollbackEdit,digest,EDIT_IDS} from './lib/apib-reference-limit.mjs';
import {runReferenceLimit as runEdit,localReferenceLimitPlan as localEditPlan} from './ops/apib-reference-limit';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
async function main(){
 const f=await createModelFixture();let attempts=0,activations=0,state='',lose=true;const pubs=new Map<string,any>();const native=globalThis.fetch;
 globalThis.fetch=async()=>{attempts++;throw Error('HTTP forbidden in isolated fixture')};
 try{
  const config=read('output/apib-reference-limit16-20261019/ORIGINAL_MODEL.json').config;
  for(const p of config.providers)if(p.credentialRef)p.credentialRef=(await f.credentials.importPlain({providerId:p.id,plain:'fixture-'+p.id,actor:'fixture'})).id;
  Object.assign(f.config,config);await f.sql.query("SELECT setval(pg_get_serial_sequence('app_model_config_versions','version'),122,false)");
  const trusted=[f.origin,...config.providers.map((p:any)=>new URL(p.baseUrl).origin)];const {createModelRepository}=await import('../src/lib/model-config/repository');const repo=createModelRepository({pool:f.sql,initialize:async()=>config,trustedOrigins:trusted});
  const baseline=await repo.current(),billing=read('output/apib-reference-limit16-20261019/ORIGINAL_BILLING.json');let liveBilling=billing;
  const {createModelRuntime}=await import('../src/lib/model-config/runtime');
  const router:any={seal:()=>({}),prepare:async()=>{},state:async()=>state,status:async(id:string)=>pubs.get(id)||null,activate:async(id:string,old:string,next:string)=>{assert.equal(old,state);activations++;state=next;const p={id,digest:next,phase:'applied'};pubs.set(id,p);if(lose){lose=false;throw Error('lost activation response')};return p}};
  const runtime=createModelRuntime({pool:f.sql,repo:repo,credentials:f.credentials,router,billing:async()=>liveBilling,billingByVersion:async(v)=>v===9?liveBilling:billing,trustedOrigins:trusted});
  const a={repo:repo,runtime,credentials:f.credentials,billing:{current:async()=>liveBilling},trustedOrigins:trusted,pool:f.sql};
  const plan=makeEditPlan(baseline,billing,readFileSync('docs/providers/evidence/apimart-gpt-image25-20261019.md'),randomUUID());assert.equal(plan.delta.length,2);
  assert.deepEqual(rollbackEdit(plan.config,plan),baseline.config);localEditPlan(plan,baseline,billing,trusted);
  const {simulateModel}=await import('../src/lib/model-config/runtime');const facts={task:'product' as const,quality:'medium',resolution:'1K',ratio:'3:4',needsEdit:true,needsMask:true,needsText:false,preserveIdentity:true,nativeResolution:false,references:1,quantity:1};const mask=simulateModel({...baseline,config:plan.config},billing,'gpt-image-2',facts,{trustedOrigins:trusted});for(const id of EDIT_IDS)assert(mask.eligible.some(u=>u.upstreamId===id));const noMask=structuredClone(plan.config);for(const id of EDIT_IDS)noMask.upstreamModels.find((u:any)=>u.id===id).parameterMap.apimartImages.supportsMask=false;for(const id of EDIT_IDS)assert(!simulateModel({...baseline,config:noMask},billing,'gpt-image-2',facts,{trustedOrigins:trusted}).eligible.some(u=>u.upstreamId===id));
  const later=structuredClone(plan.config);later.publicModels.find((m:any)=>m.id==='gpt-image-2').supplierRouting.channels[0].weight+=1;later.upstreamModels[0].label+=' later';const inverse=rollbackEdit(later,plan);assert.equal(inverse.upstreamModels[0].label,later.upstreamModels[0].label);assert.deepEqual(inverse.publicModels,later.publicModels);
  const conflict=structuredClone(plan.config);conflict.upstreamModels.find((u:any)=>u.id===EDIT_IDS[0]).capabilities.maxReferenceImages=5;assert.throws(()=>rollbackEdit(conflict,plan),/OWN_EDIT_FIELD_CONFLICT/);
  const root=resolve('output/apib-reference-limit16-20261019/fixture',randomUUID());mkdirSync(root,{recursive:true});for(const [name,value]of Object.entries({'PLAN.json':plan,'ORIGINAL_MODEL.json':baseline,'ORIGINAL_BILLING.json':billing}))writeFileSync(join(root,name),JSON.stringify(value));
  await runEdit('PLAN',root,a,null,true);await assert.rejects(()=>runEdit('APPLY',root,a,null,true));assert.equal(activations,1);await runEdit('APPLY',root,a,null,true);await runEdit('APPLY',root,a,null,true);assert.equal(activations,1);await runEdit('VERIFY',root,a,null,true);
  const now=await repo.current(),admin=structuredClone(now.config);admin.upstreamModels[0].label+=' later';admin.publicModels.find((m:any)=>m.id==='gpt-image-2')!.supplierRouting!.channels[0].weight+=1;const d=await repo.draft('later'),saved=await repo.saveDraft({id:d.id,expectedRevision:d.revision,config:admin,actor:'later'});await runtime.publish({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:now.version,actor:'later',reason:'later unrelated change'});
  liveBilling={version:9,config:structuredClone(billing.config)};await runEdit('ROLLBACK',root,a,null,true);const after=await repo.current();assert.deepEqual(after.config,rollbackEdit(admin,plan));const n=activations;await runEdit('ROLLBACK',root,a,null,true);assert.equal(activations,n);assert.equal(liveBilling.version,9);assert.equal(attempts,0);
  console.log('APIB_REFERENCE_LIMIT=PASS DELTA=2 LIMIT=16 REJECT17=PASS UNKNOWN_SAME_UUID=PASS REPEATED_APPLY=PASS SELECTIVE_ROLLBACK=PASS LATER_WEIGHT_LABEL_BILLING=PRESERVED SUPPLIER_CALLS=0');
 }finally{globalThis.fetch=native;await f.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
