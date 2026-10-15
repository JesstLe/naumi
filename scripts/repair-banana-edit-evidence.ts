import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getModelAdministration } from '../src/lib/model-config/server';
import { canonicalConfig, modelConfigDigest } from '../src/lib/model-config/repository';
import { compileRouterProjection } from '../src/lib/model-config/projection';
import { simulateModel } from '../src/lib/model-config/runtime';
import { imagegenRequestSchema } from '../src/lib/imagegen/schema';
import { resolveImagegenIntent } from '../src/lib/imagegen/intent';
import { planImagegen } from '../src/lib/imagegen/plan';
import type { ModelSnapshot, StageInput } from '../src/lib/model-config/types';
import { BANANA_EDIT_PROOFS, repairBananaEditEvidence, rollbackBananaEditEvidence } from './repair-banana-edit-evidence-policy';

/** Run in the coordinated 47 release window, under all three deployment locks.
 * PLAN and VERIFY never generate images; APPLY/ROLLBACK publish immutable versions.
 * Re-running APPLY/ROLLBACK reuses its durable operation, including unknown results.
 */
async function main() {
  const [mode,dir] = process.argv.slice(2);
  assert.ok(['PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode));
  assert.ok(dir?.startsWith('/tmp/banana-edit-evidence-20261015/'),'Use a new private evidence directory under /tmp/banana-edit-evidence-20261015/');
  mkdirSync(dir,{recursive:true,mode:0o700});
  const save=(name:string,value:unknown)=>writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  const read=<T,>(name:string):T=>JSON.parse(readFileSync(path.join(dir,name),'utf8'));
  const admin=await getModelAdministration();
  try {
    const snapshot=await admin.repo.current(),billing=await admin.billing.current();
    const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:'canvas',mode:'edit',modelId:'gemini-3.0-pro-image-three-four',prompt:'小兔子',inputs:[{artworkId:'placeholder',role:'edit-target'}],parameters:{quality:'medium',resolution:'1K',ratio:'3:4'},output:{format:'png'}});
    const facts={task:'product' as const,quality:'medium',resolution:'1K',ratio:'3:4',needsEdit:true,preserveIdentity:true,needsText:false,nativeResolution:false,references:1,quantity:1,inputLength:3,imagegenRequirements:resolveImagegenIntent(request)};
    const simulate=(s:ModelSnapshot,id=request.modelId!)=>simulateModel(s,billing,id,facts,{trustedOrigins:admin.trustedOrigins});
    async function checkProofs() {
      for(const proof of BANANA_EDIT_PROOFS) {
        const {rows}=await admin.pool.query(`SELECT c.model_version FROM app_supplier_calls c
          JOIN app_supplier_call_outputs o ON o.call_id=c.id AND o.output_index=0 AND o.state='delivered'
          JOIN app_artworks a ON a.id=$4 AND a.status='completed' AND a.deleted_at IS NULL AND a.image_url LIKE '/media/%' AND a.image_width>0 AND a.image_height>0
          JOIN app_image_jobs j ON j.id=c.operation_id AND j.email=a.email AND j.snapshot->>'status'='done'
          WHERE c.id=$1 AND c.provider_id='geeknow-images' AND c.model=$2 AND c.operation_id=$3
            AND c.phase='edit' AND c.state='response-received' AND c.delivered=1 AND c.evidence->>'httpStatus'='200'`,[proof.call,proof.model,proof.job,`art-${proof.job}-0`]);
        assert.equal(rows.length,1,'历史真实编辑交付证据已变化');
        const historical=await admin.repo.byVersion(Number(rows[0].model_version));
        const before=historical.config.providers.find(p=>p.id==='geeknow-images')!,now=snapshot.config.providers.find(p=>p.id==='geeknow-images')!;
        for(const key of ['baseUrl','protocol','credentialRef','options'] as const)assert.deepEqual(now[key],before[key],`供应商 ${key} 与验收时不符`);
      }
    }
    if(mode==='PLAN') {
      assert.ok(!existsSync(path.join(dir,'ORIGINAL_MODEL.json')),'保留已有基线；新预检请使用新目录');
      await checkProofs();
      const modified={...snapshot,config:repairBananaEditEvidence(snapshot.config)};
      assert.equal(simulate(snapshot).eligible.length,0,'基线已变化，请重新诊断而非重复补证');
      const affected=snapshot.config.publicModels.filter(m=>m.enabled&&m.supplierRouting?.channels.some(c=>c.enabled&&BANANA_EDIT_PROOFS.some(p=>p.id===c.upstreamId)));
      assert.equal(affected.length,10,'公开模型家族已变化');
      const simulations=affected.map(m=>{const before=simulate(snapshot,m.id),after=simulate(modified,m.id);assert.equal(before.eligible.length,0);assert.equal(after.eligible.length,1);assert.ok(BANANA_EDIT_PROOFS.some(p=>p.id===after.eligible[0].upstreamId));return {id:m.id,before,after};});
      assert.deepEqual(compileRouterProjection(snapshot,billing,{trustedOrigins:admin.trustedOrigins}),compileRouterProjection(modified,billing,{trustedOrigins:admin.trustedOrigins}));
      save('ORIGINAL_MODEL.json',snapshot);save('ORIGINAL_BILLING.json',billing);save('MODIFIED_MODEL.json',modified);save('plan.json',{simulations,onlyEditEvidence:true,providerCalls:0});
      console.log(`PLAN PASS version=${snapshot.version} aliases=10 before_eligible=0 after_eligible=1 price_projection_unchanged=true provider_calls=0`);
    } else if(mode==='APPLY'||mode==='ROLLBACK') {
      const original=read<ModelSnapshot>('ORIGINAL_MODEL.json');
      const requestFile=mode==='APPLY'?'publish-request.json':'rollback-request.json';
      let input:StageInput;
      if(existsSync(path.join(dir,requestFile))) input=read<StageInput>(requestFile);
      else {
        let next;
        if(mode==='APPLY') {
          assert.equal(snapshot.version,original.version);assert.equal(snapshot.digest,original.digest);
          assert.equal(canonicalConfig(billing),canonicalConfig(read('ORIGINAL_BILLING.json')));
          await checkProofs();next=repairBananaEditEvidence(snapshot.config);
        } else next=rollbackBananaEditEvidence(snapshot.config,original.config);
        assert.notEqual(modelConfigDigest(next),snapshot.digest,'没有待发布改动');
        assert.deepEqual(compileRouterProjection(snapshot,billing,{trustedOrigins:admin.trustedOrigins}),compileRouterProjection({...snapshot,config:next},billing,{trustedOrigins:admin.trustedOrigins}));
        const actor=`codex:banana-edit-evidence:20261015:${mode.toLowerCase()}`;
        const draft=await admin.repo.draft(actor);assert.equal(draft.basedOnVersion,snapshot.version);
        const saved=await admin.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:next,actor});
        input={id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor,reason:mode==='APPLY'?'香蕉参考图编辑：仅补Geeknow两条已真实交付通道的独立edit证据；不改全局verified、价格、路由、其他能力或参数':'选择性撤销本次香蕉编辑补证；保留后续配置、数据库与媒体'};
        save(requestFile,input);save(`${mode}-EXPECTED_MODEL.json`,next);
      }
      const publication=await admin.runtime.publish(input);save(`${mode}-publication.json`,publication);
      assert.equal(publication.phase,'applied','使用同一目录、同一模式重试以核对原操作；不创建第二笔发布');
      const current=await admin.repo.current();
      assert.equal(current.digest,publication.digest,'发布后已有其他更新，请核对当前配置');
      assert.deepEqual(current.config,read(`${mode}-EXPECTED_MODEL.json`));save(`${mode}-CURRENT_MODEL.json`,current);
      console.log(`${mode} PASS version=${current.version} phase=applied provider_calls=0`);
    } else {
      const original=read<ModelSnapshot>('ORIGINAL_MODEL.json');
      assert.deepEqual(snapshot.config,repairBananaEditEvidence(original.config));
      assert.equal(canonicalConfig(billing),canonicalConfig(read('ORIGINAL_BILLING.json')));
      const artwork=(await admin.pool.query('SELECT id,email FROM app_artworks WHERE id=$1 AND deleted_at IS NULL',[`art-${BANANA_EDIT_PROOFS[0].job}-0`])).rows[0];assert.ok(artwork);
      const plan=await planImagegen({...request,inputs:[{artworkId:artwork.id,role:'edit-target'}]},artwork.email);
      assert.equal(plan.steps.length,1);assert.deepEqual(plan.steps[0].eligibleUpstreamIds,['geeknow-nano-banana-pro']);
      save('verified-plan.json',{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion,totalCredits:plan.totalCredits,steps:plan.steps,ownedInputDecoded:true,providerCalls:0,jobCreated:false});
      console.log(`VERIFY PASS owned_reference_decoded=true model=Nano_Banana_Pro ratio=3:4 resolution=1K eligible=geeknow-nano-banana-pro credits=${plan.totalCredits} provider_calls=0 job_created=false`);
    }
  } finally { await admin.pool.end(); }
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
