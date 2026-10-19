import 'server-only';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { makeActivationPlan, verifyActivation, rollbackActivation, digest, canonical, EXECUTABLE_RATIOS, EXCLUDED_RATIOS } from '../lib/apib-activation.mjs';
import { exactImageRequestSize, supportsExactImageSize } from '../../src/lib/imagegen/request-size';
import { apimartImageParameters } from '../../src/lib/model-config/apimart-image-parameters';
import { validateModelConfig } from '../../src/lib/model-config/schema';
import { compileRouterProjection } from '../../src/lib/model-config/projection';
import { simulateModel } from '../../src/lib/model-config/runtime';
import { configuredHealthTargets } from '../../src/lib/model-health/targets';
import { createModelExecutor } from '../../src/lib/model-config/execution';

const LOCKS=['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock'];
const V118='826f5228a6e67f89618c89d6ae9cdef568175e936f99634c6cda66209cc187ae';
const parse=(file:string)=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const save=(root:string,name:string,value:unknown)=>{const file=join(root,name),temp=file+'.tmp-'+randomUUID();writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});renameSync(temp,file);};

export function verifyLocalPlan(plan:any,baseline:any,billing:any,trustedOrigins:readonly string[]){
  assert.equal(plan.baseline.version,baseline.version);assert.equal(plan.baseline.digest,baseline.digest);
  assert.equal(plan.baseline.billingHash,digest(billing));assert.equal(plan.candidateDigest,digest(plan.config));
  validateModelConfig(plan.config,{trustedOrigins});verifyActivation(plan.config,plan);
  assert.deepEqual(compileRouterProjection(baseline,billing,{trustedOrigins}).payload.config,compileRouterProjection({...baseline,config:plan.config},billing,{trustedOrigins}).payload.config,'Existing Router projection must remain exact');
  assert.equal(configuredHealthTargets(plan.config).filter(t=>t.provider.id==='apib-image').some(t=>t.supported),false,'New opt-in sources must not become automatic paid probes');
  const baseFacts={task:'product' as const,quality:'medium',resolution:'1K',ratio:'1:1',needsEdit:false,needsText:false,preserveIdentity:false,nativeResolution:true,references:0,quantity:1};
  const plans=[],excludedSimulation=[];let combinations=0,excludedCombinations=0,guardPasses=0,guardRejects=0,adapterPasses=0,adapterRejects=0;
  const candidateIds=['apib:gpt-image-2.5-flare','apib:gpt-image-2.5-sunburst'];
  const adapterScope=(id:string)=>{const u=plan.config.upstreamModels.find((u:any)=>u.id===id);return {parameterMap:u.parameterMap,capabilities:u.capabilities,frozen:{facts:baseFacts}} as any;};
  // The actual pre-SDK helper, not simulateModel, decides route size admission.
  // Family routing carries public gpt-image-2 before child adapter selection.
  for(const model of ['gpt-image-2','gpt-image-2.5-flare','gpt-image-2.5-sunburst']){
    assert.equal(supportsExactImageSize(model),true);
    for(const ratio of EXECUTABLE_RATIOS){assert.match(exactImageRequestSize(ratio,model)!,/^\d+x\d+$/);guardPasses++;}
    for(const ratio of EXCLUDED_RATIOS){assert.throws(()=>exactImageRequestSize(ratio,model),/当前图片模型尚未配置该精确比例/);guardRejects++;}
  }
  for(const quality of ['low','medium','high','xhigh','max'])for(const ratio of plan.config.upstreamModels.find((u:any)=>u.id==='apib:gpt-image-2.5-flare').parameterMap.apimartImages.ratios){
    combinations++;
    const facts={...baseFacts,quality,ratio},result=simulateModel({...baseline,config:plan.config},billing,'gpt-image-2',facts,{trustedOrigins});
    for(const id of candidateIds){
      assert.ok(result.eligible.some(x=>x.upstreamId===id));
      const params=apimartImageParameters(adapterScope(id),{quality,resolution:'1K',ratio});
      assert.deepEqual(params.expectedPixels,plan.config.upstreamModels.find((u:any)=>u.id===id).parameterMap.apimartImages.outputDimensions[`1K:${ratio}`]);
      assert.equal(params.upstream.size,ratio);assert.equal(params.upstream.resolution,'1k');adapterPasses++;
    }
    if(quality==='medium'&&ratio==='3:4')plans.push({input:facts,result,simulationOnly:true,providerCalls:0,jobCreated:false});
  }
  for(const quality of ['low','medium','high','xhigh','max'])for(const ratio of EXCLUDED_RATIOS){
    const result=simulateModel({...baseline,config:plan.config},billing,'gpt-image-2',{...baseFacts,quality,ratio},{trustedOrigins});
    // simulateModel does not currently consume apimartImages.ratios. Preserve
    // its literal result; never relabel this coarse eligibility as admission.
    for(const id of candidateIds){assert.ok(result.eligible.some(x=>x.upstreamId===id));assert.throws(()=>apimartImageParameters(adapterScope(id),{quality,resolution:'1K',ratio}),/异步图片通道未开放/);adapterRejects++;}
    excludedSimulation.push({input:{quality,resolution:'1K',ratio},rawSimulationEligibleIds:result.eligible.filter(x=>x.upstreamId.startsWith('apib:')).map(x=>x.upstreamId),routeAdmissible:false,adapterAdmissible:false});excludedCombinations++;
  }
  for(const facts of [{...baseFacts,resolution:'2K'},{...baseFacts,needsEdit:true,references:1}]){
    const result=simulateModel({...baseline,config:plan.config},billing,'gpt-image-2',facts,{trustedOrigins});assert.equal(result.eligible.some(x=>x.upstreamId.startsWith('apib:')),false);
  }
  assert.equal(combinations,60);assert.equal(excludedCombinations,15);
  return {simulation:plans,combinations,excludedCombinations,excludedSimulation,simulationLimitation:'simulateModel is ratio-blind for apimartImages; even excluded ratios can remain eligible. Route and adapter checks, not raw simulation, establish local admission.',routeGuard:{scope:'actual request-size helper; public family plus two exact wire IDs; not full HTTP execution',models:3,allowedRatios:12,excludedRatios:3,passes:guardPasses,rejects:guardRejects},adapterParameterGuard:{passes:adapterPasses,rejects:adapterRejects,networkCalls:0},validationScope:'frozen simulate/resolve plus exact-size and adapter parameter helpers; no HTTP route or paid output acceptance',newPaidHealthTargets:0,providerCalls:0,jobCreated:false};
}

/** Separate administrative publication; never calls an image/video execution
 * function, supplier discovery, metadata refresh, or a billing write API. */
export async function runActivation(mode:string,root:string,a:any,proof:any,fixture=false){
  const plan=parse(join(root,'PLAN.json')),baseline=parse(join(root,'ORIGINAL_MODEL.json')),billing=parse(join(root,'ORIGINAL_BILLING.json'));
  assert.ok(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode));
  if(fixture){assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');}
  else{
    assert.equal(plan.baseline.version,118);assert.equal(plan.baseline.digest,V118);assert.equal(plan.baseline.billingVersion,8);
    assert.equal(proof?.operationId,plan.operationId);assert.equal(proof?.scope,'host-three-lock-apib-config');assert.equal(proof?.target,'47.105.59.142');assert.deepEqual(proof?.locks,LOCKS);
    assert.equal(proof?.lifecycle?.phase,'COMPLETE');assert.ok(proof.web?.id&&proof.web?.image&&proof.lifecycle?.revision);
    const age=Date.now()-Date.parse(proof.observedAt);assert.ok(age>=0&&age<60000,'Fresh held-lock proof required');
  }
  const current=await a.repo.current(),liveBilling=await a.billing.current();
  const local=verifyLocalPlan(plan,baseline,billing,a.trustedOrigins);
  const resolveWire=async(snapshot:any)=>{
    const simulated={...snapshot,digest:digest(snapshot.config)};
    const executor=createModelExecutor({runtime:{...a.runtime,byVersion:async(version:number)=>{assert.equal(version,simulated.version);return simulated;}},credentials:a.credentials,billingByVersion:async()=>billing,trustedOrigins:a.trustedOrigins,gateway:()=>({baseUrl:'',apiKey:''})});
    const frozen=await executor.resolve({snapshot:simulated,billing,binding:'image.generate',requestedModelId:'gpt-image-2',facts:local.simulation[0].input});
    const scope=await executor.describe(frozen);
    return scope.supplierRouting!.targets.filter(t=>t.upstreamId.startsWith('apib:')).map(t=>({upstreamId:t.upstreamId,wireModel:t.scope.connection.wireModel,protocol:t.scope.connection.protocol,modelVersion:t.scope.frozen.modelVersion}));
  };
  const publish=async(kind:string,config:any,expected:any,id:string)=>{
    const requestFile=join(root,`${kind}_REQUEST.json`),candidateFile=join(root,`${kind}_CONFIG.json`);
    if(existsSync(requestFile)){
      const stored=parse(requestFile),candidate=parse(candidateFile),now=await a.repo.current();assert.equal(stored.id,id);assert.equal(digest(candidate),digest(config));
      if(now.digest===digest(config)) {const p=await a.repo.publication(id);assert.equal(p.phase,'applied');assert.equal(p.version,now.version);return p;}
      assert.equal(now.version,stored.expectedVersion,'Live pointer moved; do not overwrite a newer publication');assert.equal(now.digest,expected.digest);
      const result=await a.runtime.publish(stored);save(root,`${kind}_PUBLICATION.json`,result);assert.equal(result.phase,'applied','Same ID retained for explicit reconciliation');return result;
    }
    const now=await a.repo.current();assert.equal(now.version,expected.version);assert.equal(now.digest,expected.digest);
    const actor=`apib-enable:${id}`,draft=await a.repo.draft(actor);assert.equal(draft.basedOnVersion,expected.version);
    const saved=await a.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor});
    const request={id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:expected.version,actor,reason:kind==='APPLY'?'APIB documented generate-only 1K standby subset; no paid probes, verified or procurement changes':'Selective inverse of APIB activation fields; retain later unrelated config and all task evidence'};
    save(root,`${kind}_CONFIG.json`,config);save(root,`${kind}_REQUEST.json`,request);
    const result=await a.runtime.publish(request);save(root,`${kind}_PUBLICATION.json`,result);assert.equal(result.phase,'applied','Same ID retained for explicit reconciliation');return result;
  };
  if(mode==='ROLLBACK'){
    assert.ok(existsSync(join(root,'APPLY_REQUEST.json')),'Only roll back this operation\'s applied publication');
    assert.equal(parse(join(root,'APPLY_REQUEST.json')).id,plan.operationId);
    const ownedPublication=await a.repo.publication(plan.operationId);assert.equal(ownedPublication.phase,'applied');assert.equal(ownedPublication.digest,plan.candidateDigest);
    const file=join(root,'ROLLBACK_STATE.json');
    const state=existsSync(file)?parse(file):{id:randomUUID(),expected:current,config:rollbackActivation(current.config,plan),billingHash:digest(liveBilling)};
    validateModelConfig(state.config,{trustedOrigins:a.trustedOrigins});if(!existsSync(file))save(root,'ROLLBACK_STATE.json',state);
    const pub=await publish('ROLLBACK',state.config,state.expected,state.id),after=await a.repo.current();assert.equal(after.digest,digest(state.config));assert.equal(digest(await a.billing.current()),state.billingHash);
    const result={publication:pub,restoredOwnDelta:true,preservedLaterUnrelatedFields:true,billingUnchanged:true,providerCalls:0,jobCreated:false};save(root,'ROLLBACK_VERIFIED.json',result);return result;
  }
  assert.equal(digest(liveBilling),plan.baseline.billingHash,'Billing changed; prepare a new reviewed plan');
  if(mode==='PLAN'){
    assert.equal(current.version,plan.baseline.version);assert.equal(current.digest,plan.baseline.digest);
    const wires=await resolveWire({...baseline,config:plan.config});assert.equal(wires.length,2);
    const result={...local,baseline:plan.baseline,candidateDigest:plan.candidateDigest,wires,productionPublicationCreated:false};save(root,'LIVE_PLAN.json',result);return result;
  }
  if(mode==='APPLY'){
    assert.ok(existsSync(join(root,'LIVE_PLAN.json')),'Run PLAN under the same reviewed inputs first');
    assert.equal(parse(join(root,'LIVE_PLAN.json')).candidateDigest,plan.candidateDigest);
    const pub=await publish('APPLY',plan.config,baseline,plan.operationId);return {publication:pub,providerCalls:0,jobCreated:false};
  }
  const publication=await a.repo.publication(plan.operationId);assert.equal(publication.phase,'applied');assert.equal(publication.version,current.version);
  const protectedFields=verifyActivation(current.config,plan),wires=await resolveWire(current);assert.equal(wires.length,2);
  const result={publication,modelVersion:current.version,billingVersion:liveBilling.version,...protectedFields,...local,wires,paidAcceptance:'PAUSED_BY_USER',runtimeGenerationAcceptance:'NOT_PERFORMED'};
  save(root,'VERIFIED.json',result);return result;
}

async function main(){
  const mode=process.argv[2],root=resolve(process.argv[3]||'output/apib-activation-20261019');
  if(mode==='LOADCHECK'){console.log('LOADCHECK=PASS; DB=0; PROVIDER_CALLS=0');return;}
  if(mode==='PREPARE'){
    mkdirSync(root,{recursive:true});assert.ok(!existsSync(join(root,'PLAN.json')),'Reuse the original plan; do not silently replace its operation ID');
    const contract=parse('docs/providers/apib-activation-20261019.json');
    const baseline=parse(join(root,'ORIGINAL_MODEL.json')),billing=parse(join(root,'ORIGINAL_BILLING.json'));
    const plan=makeActivationPlan(baseline,billing,contract,readFileSync(contract.source.path),parse('docs/providers/apib-onboarding-20261019.json'));
    const trusted=baseline.config.providers.map((p:any)=>new URL(p.baseUrl).origin),result=verifyLocalPlan(plan,baseline,billing,trusted);
    save(root,'PLAN.json',plan);save(root,'MODIFIED_FILE.json',plan.config);save(root,'MATRIX.json',plan.matrix);save(root,'DIFF_FILE.json',plan.delta);save(root,'LOCAL_PLAN.json',result);
    console.log(`PREPARE=PASS; CANDIDATES=2; HELD=73; DELTA=${plan.delta.length}; COMBINATIONS=${result.combinations}; EXCLUDED_COMBINATIONS=${result.excludedCombinations}; ROUTE_GUARD_PASSES=${result.routeGuard.passes}; ROUTE_GUARD_REJECTS=${result.routeGuard.rejects}; PROVIDER_CALLS=0`);return;
  }
  assert.ok(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode),'Explicit operation mode required');
  const proof=parse(join(root,'LOCK_PROOF.json'));
  // Only Router administrative endpoints may use fetch in this process.
  const base=new URL(process.env.NAUMI_ROUTER_MANAGEMENT_URL!),native=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert.equal(url.origin,base.origin);assert.match(url.pathname,/^\/internal\/config\//);return native(req);};
  const {getModelAdministration}=await import('../../src/lib/model-config/server');const a=await getModelAdministration();
  try{const result=await runActivation(mode,root,a,proof);console.log(JSON.stringify({mode,result}));}finally{await a.pool.end();}
}
// Tests import this module without starting an administrative operation.
if(process.argv[1]&&/(?:^|\/)apib-activation\.(ts|cjs)$/.test(process.argv[1].replaceAll('\\','/')))main().catch(error=>{console.error('APIB_ACTIVATION_HOLD',error?.code||error?.name||'Error',error?.message||'');process.exitCode=1;});
