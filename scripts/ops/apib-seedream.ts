import 'server-only';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeSeedreamPlan, rollbackSeedream, verifySeedream, verifySeedreamContract, applySeedreamDelta } from '../lib/apib-seedream.mjs';
import { digest } from '../lib/apib-activation.mjs';
import { validateModelConfig } from '../../src/lib/model-config/schema';
import { compileRouterProjection } from '../../src/lib/model-config/projection';
import { publicModelCatalog, simulateModel } from '../../src/lib/model-config/runtime';
import { imageRequestAdmission } from '../../src/lib/imagegen/request-admission';
import { imageRatioMismatch } from '../../src/lib/imagegen/request-size';
import { apimartImageParameters } from '../../src/lib/model-config/apimart-image-parameters';
import { configuredHealthTargets } from '../../src/lib/model-health/targets';
import { quote } from '../../src/lib/billing/quote';
import { validateBillingConfig } from '../../src/lib/billing/rules/schema';

const parse=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const save=(root:string,n:string,v:unknown)=>{const p=join(root,n),t=p+'.tmp-'+randomUUID();writeFileSync(t,JSON.stringify(v,null,2)+'\n',{mode:0o600,flag:'wx'});renameSync(t,p);};
const billingHash=(b:any)=>digest({version:b.version,config:validateBillingConfig(b.config)});
const sources=(c:any)=>Object.fromEntries(c.models.map((m:any)=>[m.id,readFileSync(m.source.path)]));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export const seedreamRuntimeFiles=['src/lib/model-config/seedream-preflight.ts','src/lib/model-config/apimart-preset.ts','src/lib/model-config/runtime.ts'];

export function verifyLocalSeedream(plan:any,baseline:any,billing:any,contract:any,trustedOrigins:string[]){
 assert.equal(digest(plan.config),plan.candidateDigest);assert.equal(plan.baseline.digest,digest(baseline.config));assert.equal(plan.baseline.billingHash,digest({version:billing.version,config:billing.config}));assert.equal(plan.contractHash,digest(contract));
 validateModelConfig(plan.config,{trustedOrigins});verifySeedream(plan.config,plan);
 assert.deepEqual(compileRouterProjection(baseline,billing,{trustedOrigins}).payload.config,compileRouterProjection({...baseline,config:plan.config},billing,{trustedOrigins}).payload.config);
 const before=publicModelCatalog(baseline,'image',undefined,true),after=publicModelCatalog({...baseline,config:plan.config},'image',undefined,true);
 assert.equal(before.defaultModelId,after.defaultModelId);
 for(const old of before.models){const now=after.models.find(m=>m.id===old.id)!;if(old.id===contract.existingPublicId){assert.deepEqual({...old,nativeResolutions:undefined},{...now,nativeResolutions:undefined});assert.ok(old.nativeResolutions.every(r=>now.nativeResolutions.includes(r)));}else assert.deepEqual(now,old,'Unrelated public catalogs change');}
 assert.equal(configuredHealthTargets(plan.config).some(t=>contract.models.some((m:any)=>m.upstreamId===t.upstream.id)&&t.supported),false);
 let combinations=0,negative=0,priceChecks=0;const conflicts=[];
 for(const m of contract.models){
  const u=plan.config.upstreamModels.find((u:any)=>u.id===m.upstreamId),shown=after.models.find(x=>x.id===m.publicId)!;
  assert.deepEqual(shown.qualities,['medium']);assert.deepEqual(shown.generationParameters?.resolutions,m.id==='seedream-5-0-pro'?['1K','2K','4K']:m.resolutions);
  assert.deepEqual(shown.generationParameters?.ratios,m.id==='seedream-5-0-pro'?contract.existingRatioUi:m.parameters.apimartImages.ratios);
  const scope={parameterMap:u.parameterMap,capabilities:u.capabilities,frozen:{facts:{nativeResolution:false}}} as any;
  for(const resolution of m.resolutions)for(const ratio of m.parameters.apimartImages.ratios)for(const references of [0,1,10]){
   const facts={task:'product' as const,quality:'medium',resolution,requestedResolution:resolution,ratio,needsEdit:references>0,needsMask:false,preserveIdentity:references>0,needsText:false,nativeResolution:false,references,quantity:1};
   const result=simulateModel({...baseline,config:plan.config},billing,m.publicId,facts,{trustedOrigins});assert.ok(result.eligible.some(x=>x.upstreamId===u.id));
   assert.deepEqual(imageRequestAdmission(ratio,m.publicId,m.id==='seedream-5-0-pro',u),[]);
   const params=apimartImageParameters(scope,{quality:'medium',resolution,ratio});assert.equal(params.upstream.size,ratio);assert.equal(params.upstream.resolution,resolution);assert.equal(params.upstream.quality,undefined);
   assert.equal(imageRatioMismatch(ratio,params.expectedPixels!),undefined,'Documented output conflicts with exact canvas contract');combinations++;
  }
  for(const f of [{quality:'high',resolution:m.resolutions[0],ratio:'1:1'},{quality:'medium',resolution:m.resolutions[0],ratio:'9:21'},...['1K','2K','4K'].filter(r=>!m.resolutions.includes(r)).map(resolution=>({quality:'medium',resolution,ratio:'1:1'}))]){assert.throws(()=>apimartImageParameters(scope,f));negative++;}
  for(const resolution of m.resolutions){const result=simulateModel({...baseline,config:plan.config},billing,m.publicId,{task:'product',quality:'medium',resolution,ratio:'1:1',needsEdit:true,needsText:false,preserveIdentity:true,nativeResolution:false,references:11,quantity:1},{trustedOrigins});assert.equal(result.eligible.some(x=>x.upstreamId===u.id),m.id!=='seedream-5-0-pro','Current direct/unverified simulation omits reference-count admission; real adapter rejects >10');negative++;}
  for(const conflict of m.limitations.documentedPixelConflicts){assert.ok(imageRatioMismatch(conflict.ratio,conflict.pixels));assert.ok(imageRequestAdmission(conflict.ratio,m.publicId,m.id==='seedream-5-0-pro',u).includes('ADAPTER_RATIO_UNSUPPORTED'));conflicts.push({modelId:m.id,...conflict,actualGuard:'ADAPTER_RATIO_UNSUPPORTED; imageRatioMismatch returns error'});}
  for(const feature of baseline.config.publicModels.find((p:any)=>p.id===contract.existingPublicId).toolScope.features)for(const resolution of m.resolutions){
   const facts={feature,quantity:1,quality:'medium',resolution,metered:true,byok:false,paidFen:0,userGroup:'user',modelId:m.publicId,providerId:'apib-image'} as any;
   const q=quote(billing,facts),old=quote(billing,{...facts,modelId:contract.existingPublicId,providerId:baseline.config.upstreamModels.find((u:any)=>u.id===contract.existingUpstreamId).providerId});
   for(const k of ['requestedCredits','authorizedCredits','reserveCredits','tariff'] as const)assert.deepEqual(q[k],old[k]);priceChecks++;
  }
 }
 return {combinations,negative,priceChecks,conflicts,catalog:after.models.filter(m=>contract.models.some((x:any)=>x.publicId===m.id)),simulationLimitation:'Direct unverified upstream reference limit and APIMart ratio are not fully represented in coarse simulate; actual helper/adapter checks remain authoritative.',simulationOnly:true,httpPlanExecuted:false,paidOutputAccepted:false,providerCalls:0,billingWrites:0,newPaidHealthTargets:0};
}

/** Requires the unique owner's fresh whole-transaction lock proof AND deployed
 * code-contract checks. Bundling new helpers here is NOT an App deployment. */
export async function runSeedream(mode:string,root:string,a:any,proof:any,fixture=false){
 const inputPlan=parse(join(root,'PLAN.json')),contract=parse(join(root,'PARAMETER_CONTRACT.json'));
 let plan=inputPlan;
 assert.ok(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode));
 if(fixture){assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');}
 else{
  assert.equal(proof?.operationId,plan.operationId);assert.equal(proof?.scope,'host-three-lock-apib-config');assert.equal(proof?.target,'47.105.59.142');assert.deepEqual(proof?.locks,['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']);
  assert.equal(proof?.lifecycle?.phase,'COMPLETE');assert.ok(proof.web?.id&&proof.web?.image);assert.ok(Date.now()>=Date.parse(proof.observedAt)&&Date.now()-Date.parse(proof.observedAt)<60000);
  if(mode!=='ROLLBACK'){assert.ok(plan.requiredRuntimeHashes,'Runtime hashes required');assert.equal(proof.applicationSupport?.verifiedInRunningWebAndWorker,true,'Do not enable on old 5d application');assert.deepEqual(proof.applicationSupport?.sourceHashes,plan.requiredRuntimeHashes);assert.match(proof.applicationSupport?.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(proof.applicationSupport?.image,proof.web.image);}
 }
 const current=await a.repo.current(),liveBilling=await a.billing.current();
 if(inputPlan.recipeOnly){
  const materialized=join(root,'MATERIALIZED_PLAN.json');
  if(existsSync(materialized)){plan=parse(materialized);assert.equal(plan.operationId,inputPlan.operationId);assert.equal(plan.candidateDigest,inputPlan.candidateDigest);assert.equal(digest(plan.delta),digest(inputPlan.delta));assert.equal(plan.contractHash,inputPlan.contractHash);}
  else{
   assert.equal(mode,'PLAN','Materialize the reviewed delta under the same held-lock PLAN first');assert.equal(current.version,inputPlan.baseline.version);assert.equal(current.digest,inputPlan.baseline.digest);assert.equal(billingHash(liveBilling),inputPlan.expectedNormalizedBillingHash,'Live billing no longer matches reviewed pricing');
   assert.equal(existsSync(join(root,'ORIGINAL_MODEL.json')),false);assert.equal(existsSync(join(root,'ORIGINAL_BILLING.json')),false);
   const config=applySeedreamDelta(current.config,inputPlan.delta);assert.equal(digest(config),inputPlan.candidateDigest,'Reviewed candidate digest changed');plan={...inputPlan,recipeOnly:false,config,baseline:{...inputPlan.baseline,billingHash:digest({version:liveBilling.version,config:liveBilling.config})}};
   save(root,'ORIGINAL_MODEL.json',current);save(root,'ORIGINAL_BILLING.json',liveBilling);save(root,'MATERIALIZED_PLAN.json',plan);
  }
 }
 const baseline=parse(join(root,'ORIGINAL_MODEL.json')),billing=parse(join(root,'ORIGINAL_BILLING.json'));
 const local=verifyLocalSeedream(plan,baseline,billing,contract,a.trustedOrigins);
 if(mode!=='ROLLBACK')assert.equal(billingHash(liveBilling),billingHash(billing),'Billing changed; reviewed plan must be regenerated');
 const publish=async(kind:string,config:any,expected:any,id:string)=>{
  const requestFile=join(root,kind+'_REQUEST.json');
  if(existsSync(requestFile)){const stored=parse(requestFile);assert.equal(stored.id,id);assert.equal(digest(parse(join(root,kind+'_CONFIG.json'))),digest(config));const now=await a.repo.current();if(now.digest===digest(config)){const p=await a.repo.publication(id);assert.equal(p.phase,'applied');assert.equal(p.version,now.version);return p;}assert.equal(now.version,stored.expectedVersion);assert.equal(now.digest,expected.digest);const p=await a.runtime.publish(stored);save(root,kind+'_PUBLICATION.json',p);assert.equal(p.phase,'applied','Retain original UUID/REQUEST for reconciliation');return p;}
  const now=await a.repo.current();assert.equal(now.version,expected.version);assert.equal(now.digest,expected.digest);const actor='apib-seedream:'+id,d=await a.repo.draft(actor);assert.equal(d.basedOnVersion,expected.version);const saved=await a.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor});const request={id,draftId:d.id,expectedRevision:saved.revision,expectedVersion:expected.version,actor,reason:kind==='APPLY'?'Add exact Seedream 5 Pro standby and four independent Jimeng versions after deployed input/catalog support; no paid probes, price or verified changes':'Selective inverse of Seedream delta; preserve later unrelated changes'};
  save(root,kind+'_CONFIG.json',config);save(root,kind+'_REQUEST.json',request);const p=await a.runtime.publish(request);save(root,kind+'_PUBLICATION.json',p);assert.equal(p.phase,'applied','Retain original UUID/REQUEST for reconciliation');return p;
 };
 if(mode==='PLAN'){assert.equal(current.version,baseline.version);assert.equal(current.digest,baseline.digest);const result={...local,candidateDigest:plan.candidateDigest,productionPublicationCreated:false};save(root,'LIVE_PLAN.json',result);return result;}
 if(mode==='APPLY'){assert.equal(parse(join(root,'LIVE_PLAN.json')).candidateDigest,plan.candidateDigest);return {publication:await publish('APPLY',plan.config,baseline,plan.operationId),providerCalls:0};}
 if(mode==='ROLLBACK'){
  const owned=await a.repo.publication(plan.operationId);assert.equal(owned.phase,'applied');assert.equal(owned.digest,plan.candidateDigest);const file=join(root,'ROLLBACK_STATE.json'),state=existsSync(file)?parse(file):{id:randomUUID(),expected:current,config:rollbackSeedream(current.config,plan),billingHash:billingHash(liveBilling)};
  validateModelConfig(state.config,{trustedOrigins:a.trustedOrigins});if(!existsSync(file))save(root,'ROLLBACK_STATE.json',state);const publication=await publish('ROLLBACK',state.config,state.expected,state.id);assert.equal((await a.repo.current()).digest,digest(state.config));assert.equal(billingHash(await a.billing.current()),state.billingHash);const result={publication,selectiveInverse:true,billingPreserved:true,providerCalls:0};save(root,'ROLLBACK_VERIFIED.json',result);return result;
 }
 const publication=await a.repo.publication(plan.operationId);assert.equal(publication.phase,'applied');assert.equal(publication.version,current.version);const result={publication,...verifySeedream(current.config,plan),...local,runtimeGenerationAcceptance:'NOT_PERFORMED',paidAcceptance:'PAUSED_BY_USER'};save(root,'VERIFIED.json',result);return result;
}

async function main(){
 const mode=process.argv[2],root=resolve(process.argv[3]||'output/apib-seedream-20261020');
 if(mode==='LOADCHECK'){console.log('SEEDREAM_LOADCHECK=PASS; DB=0; PROVIDER_CALLS=0');return;}
 if(mode==='PREPARE'){
  mkdirSync(root,{recursive:true});assert.ok(!existsSync(join(root,'PLAN.json')));const contract=parse('docs/providers/apib-seedream-20261020.json'),baseline=parse(join(root,'ORIGINAL_MODEL.json')),billing=parse(join(root,'ORIGINAL_BILLING.json'));
  verifySeedreamContract(contract,sources(contract));const operationId=existsSync(join(root,'OPERATION.json'))?parse(join(root,'OPERATION.json')).id:randomUUID();const plan:any=makeSeedreamPlan(baseline,billing,contract,sources(contract),operationId);plan.requiredRuntimeHashes=Object.fromEntries(seedreamRuntimeFiles.map(p=>[p,sha(Buffer.from(readFileSync(p,'utf8').replaceAll('\r\n','\n')))]));
  const local=verifyLocalSeedream(plan,baseline,billing,contract,baseline.config.providers.map((p:any)=>new URL(p.baseUrl).origin));
  for(const [n,v] of Object.entries({'PLAN.json':plan,'MODIFIED_FILE.json':plan.config,'DIFF_FILE.json':plan.delta,'PARAMETER_CONTRACT.json':contract,'LOCAL_PLAN.json':local}))save(root,n,v);
  console.log(`SEEDREAM_PREPARE=PASS; SOURCES=5; NEW_PUBLIC_MODELS=4; STANDBY=1; DELTA=${plan.delta.length}; COMBINATIONS=${local.combinations}; BILLING_COMPARISONS=${local.priceChecks}; PROVIDER_CALLS=0; PRODUCTION=NOT_EXECUTED`);return;
 }
 assert.ok(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode));const management=new URL(process.env.NAUMI_ROUTER_MANAGEMENT_URL!),native=globalThis.fetch;globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert.ok(url.origin===management.origin&&/^\/internal\/(?:config|projections)/.test(url.pathname),'No generation/discovery HTTP');return native(req);};
 const {getModelAdministration}=await import('../../src/lib/model-config/server');const a=await getModelAdministration();try{console.log(JSON.stringify({mode,result:await runSeedream(mode,root,a,parse(join(root,'LOCK_PROOF.json')))}));}finally{await a.pool.end();}
}
if(/(?:^|[\\/])(?:apib-seedream|apib-activation)\.(?:ts|cjs)$/.test(process.argv[1]||''))main().catch(e=>{console.error('APIB_SEEDREAM_HOLD',e.name,e.message);process.exitCode=1;});
