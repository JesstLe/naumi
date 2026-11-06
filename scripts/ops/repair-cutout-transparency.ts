/** Run inside the candidate Web container (same code, env and credentials).
 * PLAN prints the narrow delta; APPLY publishes it through the existing
 * draft / revision CAS / router publication lifecycle. No supplier calls.
 * Output is one JSON line; the caller records intent/receipts (no files here). */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {getModelAdministration} from '../../src/lib/model-config/server';
import {canonicalConfig} from '../../src/lib/model-config/repository';
import {validateModelConfig} from '../../src/lib/model-config/schema';
import {mapCutoutTransparency} from '../repair-cutout-transparency-policy';

async function main(){
 const [mode,expectedVersion,expectedDigest,publicationId]=process.argv.slice(2);
 assert(mode==='PLAN'||mode==='APPLY','MODE_REQUIRED');
 const admin=await getModelAdministration();
 const hash=(v:unknown)=>createHash('sha256').update(canonicalConfig(v)).digest('hex');
 try{
  const baseline=await admin.repo.current(),billing=await admin.billing.current();
  const {config:candidate,changed}=mapCutoutTransparency(baseline.config);
  validateModelConfig(candidate,{trustedOrigins:admin.trustedOrigins});
  const plan={version:baseline.version,digest:baseline.digest,candidateDigest:hash(candidate),billingDigest:hash(billing),billingVersion:billing.version,changed,
   upstreams:changed.map(id=>{const u=candidate.upstreamModels.find(x=>x.id===id)!;return {id,providerId:u.providerId,model:u.model,imagegen:(u.parameterMap as {imagegen?:unknown}).imagegen};})};
  if(mode==='PLAN'){console.log(JSON.stringify({mode,...plan,published:false}));return;}
  assert(/^[0-9a-f-]{36}$/.test(publicationId||''),'PUBLICATION_ID_REQUIRED');
  assert.equal(baseline.version,Number(expectedVersion),'ACTIVE_VERSION_CHANGED');assert.equal(baseline.digest,expectedDigest,'ACTIVE_DIGEST_CHANGED');
  assert(changed.length>0,'ALREADY_APPLIED');
  assert.equal((await admin.pool.query("SELECT count(*)::int n FROM app_model_publications WHERE phase IN ('staged','preparing','activating','unknown')")).rows[0].n,0,'PUBLICATION_PENDING');
  const actor='codex:cutout-transparency:20261106';
  const draft=await admin.repo.draft(actor);assert.equal(draft.basedOnVersion,baseline.version,'DRAFT_BASE_CHANGED');
  const saved=await admin.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:candidate,actor});
  const publication=await admin.runtime.publish({id:publicationId!,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:baseline.version,actor,reason:'抠图通道映射透明背景参数（imagegen.transparent=background）；不改报价、路由与已受理任务'});
  assert.equal(publication.phase,'applied','RECONCILE_SAME_PUBLICATION_ID');
  const current=await admin.repo.current();assert.equal(hash(current.config),hash(candidate),'APPLIED_CONFIG_MISMATCH');
  const after=await admin.billing.current();assert.equal(hash(after),plan.billingDigest,'BILLING_CHANGED');
  console.log(JSON.stringify({mode,...plan,published:true,publicationId,appliedVersion:current.version,appliedDigest:current.digest,billingUnchanged:true}));
 }finally{await admin.pool.end();}
}
main().catch(e=>{console.error(JSON.stringify({error:e instanceof Error?e.message:String(e)}));process.exitCode=1;});
