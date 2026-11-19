/** Administrative config publication only; never restarts Web/Worker or calls a supplier. */
import 'server-only';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {BANANA_REFERENCE_IDS,bananaReferenceConfig} from '../lib/banana-reference-limit.mjs';
import {modelConfigDigest} from '../../src/lib/model-config/snapshot-value';
import {validateModelConfig} from '../../src/lib/model-config/schema';
import {simulateModel} from '../../src/lib/model-config/simulation';
import {publicModelCatalog} from '../../src/lib/model-config/public-catalog';

const [mode,root]=process.argv.slice(2);
assert(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode)&&root?.startsWith('/tmp/banana-reference14-'));
const read=(name:string)=>JSON.parse(readFileSync(join(root,name),'utf8'));
const save=(name:string,value:unknown)=>{const file=join(root,name),tmp=file+'.tmp';assert(!existsSync(file));writeFileSync(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});renameSync(tmp,file)};
const management=new URL(process.env.NAUMI_ROUTER_MANAGEMENT_URL!);const native=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert(url.origin===management.origin&&/^\/internal\/(?:config|projections)/.test(url.pathname),'SUPPLIER_HTTP_FORBIDDEN');return native(req)};
async function main(){
  const {getModelAdministration}=await import('../../src/lib/model-config/server');const a=await getModelAdministration();
  try {
    const current=await a.repo.current(),billing=await a.billing.current();
    const check=(config:any)=>{
      validateModelConfig(config,{trustedOrigins:a.trustedOrigins});
      const snapshot={...current,config},catalog=publicModelCatalog(snapshot,'image','canvas.image');
      const models=catalog.models.filter(m=>/^gemini-3\.(?:0-pro|1-flash)-image-/.test(m.id));
      assert.equal(models.length,10,'TEN_BANANA_ALIASES_REQUIRED');
      for(const m of models){
        assert.equal(m.maxReferenceImages,14);assert(m.supportsEdit);
        for(const references of [1,2,14,15])for(const resolution of ['1K','2K','4K']){
          const result=simulateModel(snapshot,billing,m.id,{task:'product',quality:'medium',resolution,requestedResolution:resolution,ratio:'3:4',needsEdit:true,preserveIdentity:false,needsText:false,nativeResolution:false,references,quantity:1},{trustedOrigins:a.trustedOrigins});
          if(references<=14)assert(result.eligible.some(u=>BANANA_REFERENCE_IDS.includes(u.upstreamId)),JSON.stringify({id:m.id,references,resolution,result}));
          else {assert(!result.eligible.some(u=>BANANA_REFERENCE_IDS.includes(u.upstreamId)));assert(result.excluded.some(u=>BANANA_REFERENCE_IDS.includes(u.upstreamId)&&u.codes.includes('REFERENCE_LIMIT')))}
        }
      }
      return {aliases:models.length,referenceCases:[1,2,14,15],resolutions:['1K','2K','4K'],simulationCases:120,supplierCalls:0};
    };
    if(mode==='PLAN'){
      const config=bananaReferenceConfig(current.config),checks=check(config);
      assert.deepEqual(bananaReferenceConfig(config,'rollback'),current.config);
      save('PLAN.json',{operationId:randomUUID(),baseline:current,billing,candidateDigest:modelConfigDigest(config),config,checks});
      console.log(JSON.stringify({mode,version:current.version,changedFields:2,...checks}));return;
    }
    const plan=read('PLAN.json');
    if(mode==='VERIFY'){
      assert.equal(current.digest,plan.candidateDigest);const publication=await a.repo.publication(plan.operationId);assert.equal(publication.phase,'applied');assert.equal(publication.version,current.version);
      assert.deepEqual(billing,plan.billing);const checks=check(current.config);save('VERIFIED.json',{publication,checks});console.log(JSON.stringify({mode,publication,...checks}));return;
    }
    const rollback=mode==='ROLLBACK';
    if(rollback){const p=await a.repo.publication(plan.operationId);assert.equal(p.phase,'applied')}
    const requestName=mode+'_REQUEST.json';
    if(existsSync(join(root,requestName)))throw Error('EXISTING_REQUEST_QUERY_ORIGINAL_PUBLICATION_DO_NOT_REPLAY');
    if(!rollback){assert.equal(current.version,plan.baseline.version);assert.equal(current.digest,plan.baseline.digest);assert.deepEqual(billing,plan.billing)}
    const config=rollback?bananaReferenceConfig(current.config,'rollback'):plan.config;
    validateModelConfig(config,{trustedOrigins:a.trustedOrigins});
    const id=rollback?randomUUID():plan.operationId,actor='ops:banana-reference14:'+id;
    const draft=await a.repo.draft(actor),saved=await a.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor});
    const request={id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor,reason:rollback?'Selective rollback of two Banana reference limits only':'User requested Nano Banana Pro and Nano Banana 2 support 14 references; documented limit, no paid verification promotion'};
    save(requestName,request);
    const publication=await a.runtime.publish(request);save(mode+'_PUBLICATION.json',publication);
    console.log(JSON.stringify({mode,publication,supplierCalls:0}));assert.equal(publication.phase,'applied');
  }finally{await a.pool.end()}
}
main().catch(e=>{console.error('BANANA_REFERENCE_HOLD',e.code||e.name,e.message);process.exitCode=1});
