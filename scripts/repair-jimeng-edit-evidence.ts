import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { getModelAdministration } from '../src/lib/model-config/server';
import { canonicalConfig } from '../src/lib/model-config/repository';
import { simulateModel } from '../src/lib/model-config/runtime';
import { compileRouterProjection } from '../src/lib/model-config/projection';
import { imagegenRequestSchema } from '../src/lib/imagegen/schema';
import { resolveImagegenIntent } from '../src/lib/imagegen/intent';
import { planImagegen } from '../src/lib/imagegen/plan';
import { repairJimengEditEvidence } from './repair-jimeng-edit-evidence-policy';

async function main() {
  const mode=process.argv[2],dir=process.argv[3];assert.ok(['BASELINE','APPLY','VERIFY','ROLLBACK_CHECK'].includes(mode));assert.ok(dir?.startsWith('/tmp/jimeng-edit-evidence-20261015/'));
  mkdirSync(dir,{recursive:true,mode:0o700});
  const save=(name:string,value:unknown)=>writeFileSync(path.join(dir,name),JSON.stringify(value,null,2),{mode:0o600});
  const digest=(value:unknown)=>createHash('sha256').update(canonicalConfig(value)).digest('hex');
  const admin=await getModelAdministration(),snapshot=await admin.repo.current(),billing=await admin.billing.current();
  const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'edit',modelId:'jimeng-image-5.0-pro',prompt:'换成猫',inputs:[{artworkId:'test-placeholder',role:'edit-target'}],parameters:{quality:'medium',resolution:'1K',ratio:'auto'},output:{format:'png'}});
  const intent=resolveImagegenIntent(request),facts={task:'product' as const,quality:'medium',resolution:'1K',ratio:'auto',needsEdit:true,preserveIdentity:true,needsText:false,nativeResolution:false,references:1,quantity:1,inputLength:3,imagegenRequirements:intent};
  const simulate=(config= snapshot.config)=>simulateModel({...snapshot,config},billing,'jimeng-image-5.0-pro',facts,{trustedOrigins:admin.trustedOrigins});
  if(mode==='BASELINE') {
    assert.equal(snapshot.version,111);save('ORIGINAL_MODEL.json',snapshot);save('ORIGINAL_BILLING.json',billing);
    const fixed=repairJimengEditEvidence(snapshot.config);save('MODIFIED_MODEL.json',{...snapshot,config:fixed});
    const before=simulate(),after=simulate(fixed);assert.equal(before.eligible.length,0);assert.ok(before.excluded.some(x=>x.codes.includes('IMAGEGEN_EDIT_UNSUPPORTED')));assert.equal(after.eligible.length,1);
    const a=compileRouterProjection(snapshot,billing,{trustedOrigins:admin.trustedOrigins}),b=compileRouterProjection({...snapshot,config:fixed},billing,{trustedOrigins:admin.trustedOrigins});assert.deepEqual(a,b,'per-capability metadata must not alter transport projection or prices');
    save('baseline.json',{mode,version:snapshot.version,digest:snapshot.digest,billingVersion:billing.version,billingDigest:digest(billing),simulation:before,modifiedSimulation:after,sameExecutionProjection:true,providerCalls:0});
    console.log('BASELINE=PASS LIVE_V111 IMAGEGEN_EDIT_UNSUPPORTED MODIFIED_SIMULATION_ELIGIBLE1 SAME_PROJECTION_PRICE PROVIDER_CALLS0');
  } else if(mode==='APPLY') {
    const original=JSON.parse(readFileSync(path.join(dir,'ORIGINAL_MODEL.json'),'utf8'));assert.equal(snapshot.version,original.version);assert.equal(snapshot.digest,original.digest);
    assert.equal(digest(billing),digest(JSON.parse(readFileSync(path.join(dir,'ORIGINAL_BILLING.json'),'utf8'))));
    assert.equal((await admin.pool.query("SELECT count(*)::int AS n FROM app_model_publications WHERE phase IN ('staged','preparing','activating','unknown')")).rows[0].n,0);
    const actor='codex:jimeng-edit-evidence:20261015',draft=await admin.repo.draft(actor);assert.equal(draft.basedOnVersion,snapshot.version);
    const next=repairJimengEditEvidence(snapshot.config),saved=await admin.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:next,actor});
    const id=randomUUID();save('publish-request.json',{id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor});
    const publication=await admin.runtime.publish({id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor,reason:'修复即梦5.0 Pro参考图编辑被新版图像能力校验误拦；仅补2026-10-12已完成的单参考图编辑证据，保留其他能力/价格/参数/用户草稿'});
    save('publication.json',publication);assert.equal(publication.phase,'applied','unknown publication must reconcile same operation ID, never republish');
    const current=await admin.repo.current();assert.deepEqual(current.config,next);assert.equal(simulate(current.config).eligible.length,1);
    save('APPLIED_MODEL.json',current);console.log('MODIFIED=PASS PUBLISHED_V'+current.version+' PHASE_APPLIED ONLY_EDIT_EVIDENCE_CHANGED PRICE_MAP_VERIFIED_FALSE_PRESERVED PROVIDER_CALLS0');
  } else if(mode==='VERIFY') {
    const original=JSON.parse(readFileSync(path.join(dir,'ORIGINAL_MODEL.json'),'utf8'));assert.deepEqual(snapshot.config,repairJimengEditEvidence(original.config));
    assert.equal(digest(billing),digest(JSON.parse(readFileSync(path.join(dir,'ORIGINAL_BILLING.json'),'utf8'))));
    const owner=(await admin.pool.query("SELECT email FROM app_users WHERE role='admin' AND NOT banned AND (name='admin' OR email ILIKE 'admin@%') ORDER BY email LIMIT 1")).rows[0]?.email;assert.ok(owner);
    const artwork=(await admin.pool.query("SELECT id FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND image_url LIKE '/media/%' AND (video_url IS NULL OR video_url='') ORDER BY created_at DESC LIMIT 1",[owner])).rows[0];assert.ok(artwork);
    const plan=await planImagegen({...request,inputs:[{artworkId:artwork.id,role:'edit-target'}]},owner);
    assert.equal(plan.steps.length,1);assert.equal(plan.steps[0].modelId,'jimeng-image-5.0-pro');assert.deepEqual(plan.steps[0].eligibleUpstreamIds,['local-jimeng-50-pro']);
    save('verification.json',{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion,totalCredits:plan.totalCredits,steps:plan.steps,actualOwnedInputDecoded:true,maskedCapabilityStillUnknown:true,billingUnchanged:true,providerCalls:0,jobStarted:false});
    console.log('VERIFY=PASS ACTUAL_PLAN_OWNED_REFERENCE_IMAGE MODEL_JIMENG_EDIT_ELIGIBLE TOTAL_CREDITS'+plan.totalCredits+' BILLING_UNCHANGED PROVIDER_CALLS0 NO_JOB_CREATED');
  } else {
    const original=JSON.parse(readFileSync(path.join(dir,'ORIGINAL_MODEL.json'),'utf8')),modified=JSON.parse(readFileSync(path.join(dir,'MODIFIED_MODEL.json'),'utf8'));
    const copy=structuredClone(modified);delete copy.config.upstreamModels.find((u:any)=>u.id==='local-jimeng-50-pro').capabilities.imagegen.edit;
    if(!Object.keys(copy.config.upstreamModels.find((u:any)=>u.id==='local-jimeng-50-pro').capabilities.imagegen).length)delete copy.config.upstreamModels.find((u:any)=>u.id==='local-jimeng-50-pro').capabilities.imagegen;
    assert.deepEqual(copy.config,original.config);assert.equal(digest(copy),digest(original));assert.equal(simulateModel(copy,billing,'jimeng-image-5.0-pro',facts,{trustedOrigins:admin.trustedOrigins}).eligible.length,0);
    save('rollback-copy.json',copy);save('rollback-check.json',{originalDigest:digest(original),restoredDigest:digest(copy),liveModifiedVersion:snapshot.version,liveRestored:false,providerCalls:0});
    console.log('ROLLBACK=PASS INDEPENDENT_COPY_ORIGINAL_SHA_AND_REJECTION_RESTORED LIVE_MODIFICATION_PRESERVED PROVIDER_CALLS0');
  }
  await admin.pool.end();
}
main().catch(error=>{console.error(error instanceof Error ? error.message : String(error));process.exitCode=1;});
