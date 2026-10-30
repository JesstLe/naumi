/** Run with the same code as the candidate Web/Worker. PLAN does not publish;
 * APPLY publishes through the existing draft/CAS/router lifecycle. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {getModelAdministration} from '../../src/lib/model-config/server';
import {canonicalConfig} from '../../src/lib/model-config/repository';
import {validateModelConfig} from '../../src/lib/model-config/schema';
import {repairX6AutomaticParameters} from '../repair-x6-automatic-parameters-policy';

async function main(){
 const [mode,dir,expectedVersion,expectedDigest]=process.argv.slice(2);
 assert(['PLAN','APPLY'].includes(mode)&&dir&&path.isAbsolute(dir),'MODE_AND_ABSOLUTE_EVIDENCE_DIR_REQUIRED');
 const admin=await getModelAdministration();
 const hash=(v:unknown)=>createHash('sha256').update(canonicalConfig(v)).digest('hex');
 mkdirSync(dir,{recursive:true,mode:0o700});
 const save=(name:string,value:unknown)=>writeFileSync(path.join(dir,name),JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
 try{
  const baseline=await admin.repo.current(),billing=await admin.billing.current();
  const candidate=repairX6AutomaticParameters(baseline.config);
  validateModelConfig(candidate,{trustedOrigins:admin.trustedOrigins});
  if(mode==='PLAN'){
   // Full config remains in a protected server-side evidence directory, not stdout.
   save('BASELINE.json',baseline);save('CANDIDATE.json',candidate);
   save('PLAN.json',{expectedVersion:baseline.version,expectedDigest:baseline.digest,candidateDigest:hash(candidate),billingDigest:hash(billing)});
   console.log(`X6_CONFIG=PREPARED version=${baseline.version} digest=${baseline.digest} changed=${hash(candidate)!==hash(baseline.config)} published=0`);return;
  }
  const planned=JSON.parse(readFileSync(path.join(dir,'PLAN.json'),'utf8'));
  assert.equal(baseline.version,Number(expectedVersion),'ACTIVE_VERSION_CHANGED');assert.equal(baseline.digest,expectedDigest,'ACTIVE_DIGEST_CHANGED');
  assert.equal(planned.expectedVersion,baseline.version);assert.equal(planned.expectedDigest,baseline.digest);
  assert.equal(planned.candidateDigest,hash(candidate));assert.equal(planned.billingDigest,hash(billing));
  assert.deepEqual(candidate,JSON.parse(readFileSync(path.join(dir,'CANDIDATE.json'),'utf8')));
  assert.notEqual(hash(candidate),hash(baseline.config),'ALREADY_APPLIED');
  assert.equal((await admin.pool.query("SELECT count(*)::int n FROM app_model_publications WHERE phase IN ('staged','preparing','activating','unknown')")).rows[0].n,0,'PUBLICATION_PENDING');
  // Existence prevents a second publication after an interrupted/unknown APPLY.
  const actor='codex:x6-auto-frame:20261030',id=randomUUID();
  save('APPLY_STARTED.json',{id,expectedVersion:baseline.version,expectedDigest:baseline.digest});
  const draft=await admin.repo.draft(actor);assert.equal(draft.basedOnVersion,baseline.version);
  const saved=await admin.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:candidate,actor});
  const publication=await admin.runtime.publish({id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:baseline.version,actor,reason:'发布有来源的原生自适应合同、Flash编辑声明及Seedream旧比例HOLD修复；不改变报价/已受理任务'});
  save('PUBLICATION.json',publication);
  assert.equal(publication.phase,'applied','RECONCILE_SAME_PUBLICATION_ID');
  const current=await admin.repo.current();assert.deepEqual(current.config,candidate);assert.equal(hash(await admin.billing.current()),planned.billingDigest);
  save('APPLIED.json',{version:current.version,digest:current.digest,publicationId:id,billingUnchanged:true});
  console.log(`X6_CONFIG=APPLIED version=${current.version} publication=${id} billingUnchanged=true supplierCalls=0`);
 }finally{await admin.pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1});
