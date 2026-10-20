import 'server-only';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest} from '../lib/apib-activation.mjs';
import {holdIndependentSeedream} from '../lib/seedream-partial-hold.mjs';
import {getModelAdministration} from '../../src/lib/model-config/server';
import {validateModelConfig} from '../../src/lib/model-config/schema';
const root=process.argv[2];const load=(n:string)=>JSON.parse(readFileSync(join(root,n),'utf8'));
const save=(n:string,v:any)=>{assert.equal(existsSync(join(root,n)),false);writeFileSync(join(root,n),JSON.stringify(v,null,2)+'\n',{mode:0o600,flag:'wx'});};
async function main(){
 const proof=load('PARTIAL_LOCK_PROOF.json'),plan=load('PLAN.json');assert.equal(proof.scope,'host-three-lock-apib-config');assert.equal(proof.operationId,plan.operationId);assert.equal(proof.target,'47.105.59.142');assert.equal(proof.lifecycle.phase,'COMPLETE');assert.equal(proof.locks.length,3);assert.ok(Date.now()-Date.parse(proof.observedAt)<60000);
 const management=new URL(process.env.NAUMI_ROUTER_MANAGEMENT_URL!),native=globalThis.fetch;globalThis.fetch=async(input,init)=>{const req=new Request(input,init),u=new URL(req.url);assert.equal(u.origin,management.origin);assert.match(u.pathname,/^\/internal\/(?:config|projections)/);return native(req);};
 const a=await getModelAdministration();try{
  const owned=await a.repo.publication(plan.operationId);assert.equal(owned.phase,'applied');assert.equal(owned.digest,plan.candidateDigest);
  const current=await a.repo.current(),billing=await a.billing.current();const config=holdIndependentSeedream(current.config,plan);validateModelConfig(config,{trustedOrigins:a.trustedOrigins});
  assert.deepEqual(config.publicModels.find((m:any)=>m.id==='jimeng-image-5.0-pro'),current.config.publicModels.find((m:any)=>m.id==='jimeng-image-5.0-pro'));
  assert.deepEqual(config.upstreamModels.find((m:any)=>m.id==='apib:seedream-5-0-pro'),current.config.upstreamModels.find((m:any)=>m.id==='apib:seedream-5-0-pro'));
  for(const wire of ['seedream-4-0','seedream-4-5','seedream-5-0-flash','seedream-5-0-lite'])assert.equal(config.upstreamModels.find((m:any)=>m.id==='apib:'+wire)!.enabled,false);
  const id=load('PARTIAL_OPERATION.json').id,actor='seedream-negative-hold:'+id;
  save('PARTIAL_BEFORE.json',current);save('PARTIAL_CONFIG.json',config);save('PARTIAL_BILLING_BEFORE.json',billing);
  const d=await a.repo.draft(actor),s=await a.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor});
  const request={id,draftId:d.id,expectedRevision:s.revision,expectedVersion:current.version,actor,reason:'Selective rollback of four independent Seedream models after actual public plan accepted 11 references; preserve verified Pro standby and all previous prices/defaults; no paid tests'};
  save('PARTIAL_REQUEST.json',request);const p=await a.runtime.publish(request);save('PARTIAL_PUBLICATION.json',p);assert.equal(p.phase,'applied');const after=await a.repo.current();assert.equal(after.digest,digest(config));assert.equal(digest(await a.billing.current()),digest(billing));
  save('PARTIAL_VERIFIED.json',{publication:p,originalPublication:owned,beforeVersion:current.version,afterVersion:after.version,billingVersion:billing.version,billingUnchanged:true,keptProStandby:true,independentModelsHold:4,supplierCalls:0,selectiveInverseFields:44});console.log(JSON.stringify(load('PARTIAL_VERIFIED.json')));
 }finally{await a.pool.end();}
}
main().catch(e=>{console.error('PARTIAL_ROLLBACK_RECONCILE_ORIGINAL_UUID',e.name,e.message);process.exitCode=1;});
