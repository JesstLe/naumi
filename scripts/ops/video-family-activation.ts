import "server-only";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from "node:fs";
import {join,resolve} from "node:path";
import {dbEnabled,getPool} from "../../src/lib/db";
import {getModelAdministration} from "../../src/lib/model-config/server";
import {makeVideoFamilyPlan,rollbackVideoFamilyPlan,VERIFIED_VIDEO_FAMILIES,ACTIVE_VIDEO_FAMILY_ITEMS,videoFamilyActivationEnabled,type VideoFamilyPlan} from "../../src/lib/model-config/video-family-preset";
import {canonicalConfig,modelConfigDigest} from "../../src/lib/model-config/repository";
import {validateModelConfig} from "../../src/lib/model-config/schema";
import {compileRouterProjection} from "../../src/lib/model-config/projection";
import {publicModelCatalog} from "../../src/lib/model-config/runtime";
import {resolveVideoCapability,normalizeVideoInput} from "../../src/lib/video/contract";
import {reconcileVideoSettings} from "../../src/lib/video/client-settings";
import {buildVideoCreate} from "../../src/lib/video/providers/wire";
import type {ModelConfig,ModelSnapshot} from "../../src/lib/model-config/types";

const LOCKS=["/opt/naumi-staging/releases/deploy.lock","/opt/naumi-reverse-hub/releases/deploy.lock","/opt/reference-workbench/deploy.lock"];
function load(file:string){return JSON.parse(readFileSync(file,"utf8"));}
function save(root:string,name:string,value:unknown){const file=join(root,name),temp=file+".tmp-"+randomUUID();writeFileSync(temp,JSON.stringify(value,null,2)+"\n",{mode:0o600,flag:"wx"});renameSync(temp,file);}
function digest(value:unknown){return createHash("sha256").update(canonicalConfig(value)).digest("hex");}
function invariant(before:ModelConfig,after:ModelConfig){
  for(const key of ["pools","fixedMonthlyCosts","defaultImagePreset"] as const)assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.providers.filter(p=>!["apib-video","geeknow-video","geeknow-video-h3"].includes(p.id)),before.providers.filter(p=>!["apib-video","geeknow-video","geeknow-video-h3"].includes(p.id)));
  for(const entity of ["upstreamModels","publicModels"] as const)assert.deepEqual(after[entity].filter(m=>m.modality!=="video"),before[entity].filter(m=>m.modality!=="video"));
  assert.deepEqual(Object.fromEntries(Object.entries(after.bindings).filter(([k])=>k!=="video.generate")),Object.fromEntries(Object.entries(before.bindings).filter(([k])=>k!=="video.generate")));
  assert.deepEqual(Object.fromEntries(Object.entries(after.business||{}).filter(([k])=>k!=="video.generate")),Object.fromEntries(Object.entries(before.business||{}).filter(([k])=>k!=="video.generate")));
}
function compileAll(config:ModelConfig){
  const proofs=[];
  for(const item of VERIFIED_VIDEO_FAMILIES.items){
    const m=config.publicModels.find(m=>m.id===item.publicId)!,u=config.upstreamModels.find(u=>u.id===m.target.id)!,p=config.providers.find(p=>p.id===u.providerId)!;
    if(!videoFamilyActivationEnabled(item)){
      assert.equal(m.enabled,false,"Unavailable video-reference branch must remain disabled");assert.equal(m.visible,false);
      assert.equal(u.enabled,false);assert.equal(u.capabilities.generate,false);assert.equal(u.capabilities.edit,false);
      assert.deepEqual(m.toolScope,{features:[],defaultFor:[]});continue;
    }
    assert.equal(m.enabled,true);assert.equal(m.visible,true);assert.equal(u.enabled,true);assert.equal(u.capabilities.generate,true);
    const cap=resolveVideoCapability({manual:u.capabilities.video});
    const input={prompt:"A red wooden cube rotates on a white table. Static camera, no text.",providerId:p.id,modelId:m.id,mode:cap.modes![0],durationSeconds:cap.defaultDurationSeconds!,resolution:cap.defaultResolution!,aspectRatio:cap.defaultAspectRatio!,references:[],generateAudio:false};
    const initial=reconcileVideoSettings(input as never,cap).config;
    const refs=initial.mode==="text"?[]:cap.limits?.images?[{id:"synthetic-ref",kind:"image" as const,role:cap.modes?.includes("single_image")?"first_frame" as const:"reference" as const,url:"https://media.example.test/synthetic.png"}]:cap.limits?.videos?[{id:"synthetic-video",kind:"video" as const,role:"source_video" as const,url:"https://media.example.test/synthetic.mp4"}]:[];
    const normalized=normalizeVideoInput({...initial,references:refs},cap);
    const request={...normalized,providerId:p.id,modelId:u.model,idempotencyKey:randomUUID(),source:"workbench" as const};
    const provider={id:p.id,label:p.name,protocol:p.protocol,baseUrl:p.baseUrl,apiKey:"fixture-not-used",models:[u.model],defaultModel:u.model,idempotencyStrategy:"none",...p.options} as any;
    const wire=buildVideoCreate({provider,profile:u.parameterMap.videoProfile!,request});
    assert.equal(wire.method,"POST");assert.equal(wire.encoding,"json");
    proofs.push({modelId:m.id,upstreamId:u.id,wireModel:u.model,profile:u.parameterMap.videoProfile,path:wire.path,encoding:wire.encoding,mode:normalized.mode,duration:normalized.durationSeconds,resolution:normalized.resolution});
  }
  assert.equal(proofs.length,ACTIVE_VIDEO_FAMILY_ITEMS.length);return proofs;
}
async function verifyFrozenCapabilities(a:Awaited<ReturnType<typeof getModelAdministration>>,snapshot:ModelSnapshot,plan:VideoFamilyPlan){
  assert.equal(new Set(plan.upstreamIds).size,ACTIVE_VIDEO_FAMILY_ITEMS.length,"Active video upstreams must be distinct");
  const rows=(await a.pool.query("SELECT upstream_id,model_digest,value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=ANY($2::text[])",[snapshot.version,plan.upstreamIds])).rows;
  assert.equal(rows.length,plan.upstreamIds.length,"Every active video capability must be frozen");
  for(const id of plan.upstreamIds){
    const upstream=snapshot.config.upstreamModels.find(u=>u.id===id)!,provider=snapshot.config.providers.find(p=>p.id===upstream.providerId)!,row=rows.find(r=>r.upstream_id===id);
    assert.ok(row);assert.equal(row.model_digest,snapshot.digest);assert.equal(row.value.profile,upstream.parameterMap.videoProfile??provider.options?.videoProfile);
    const manual=upstream.capabilities.video!;
    for(const [key,value] of Object.entries(manual)){
      if(key==="limits"&&value&&typeof value==="object")for(const [limit,amount] of Object.entries(value))assert.deepEqual(row.value.definition.limits?.[limit],amount,"Frozen manual video limit changed");
      else assert.deepEqual(row.value.definition[key],value,"Frozen manual video setting changed");
    }
  }
}
async function main(){
  const mode=process.argv[2],root=resolve(process.argv[3]||"");assert.ok(["PLAN","APPLY","VERIFY","ROLLBACK"].includes(mode));
  mkdirSync(root,{recursive:true,mode:0o700});
  const spec=load(join(root,"SPEC.json")),proof=load(join(root,"LOCK_PROOF.json"));
  assert.equal(spec.target,"47.105.59.142");assert.match(spec.operationId,/^[0-9a-f-]{36}$/);
  assert.equal(proof.scope,"host-three-lock-video-family-config");assert.deepEqual(proof.locks,LOCKS);assert.equal(proof.operationId,spec.operationId);assert.equal(proof.lifecycle.phase,"COMPLETE");
  assert.equal(process.env.SOURCE_COMMIT,spec.sourceCommit);assert.equal(String(process.env.BUILD_VERSION),String(spec.buildVersion));
  const age=Date.now()-Date.parse(proof.observedAt);assert.ok(age>=0&&age<60000,"Fresh held-lock proof required");
  const a=await getModelAdministration(),actor=`video-families:${spec.operationId}`,current=await a.repo.current(),billing=await a.billing.current();
  const baselineFile=join(root,"BASELINE_MODEL.json");
  if(!existsSync(baselineFile)){assert.equal(mode,"PLAN");assert.equal(current.version,spec.expectedVersion);save(root,"BASELINE_MODEL.json",current);save(root,"BASELINE_BILLING.json",billing);}
  const baseline:ModelSnapshot=load(baselineFile),baselineBilling=load(join(root,"BASELINE_BILLING.json"));
  assert.equal(baseline.digest,modelConfigDigest(baseline.config),"Baseline model backup digest is invalid");
  assert.equal(digest(billing),digest(baselineBilling),"Do not change customer billing during activation");
  const temporaryRefs={"geeknow-video":"00000000-0000-4000-8000-000000000011","geeknow-video-h3":"00000000-0000-4000-8000-000000000012"};
  let plan:VideoFamilyPlan|undefined;
  if(mode==="PLAN"){
    assert.equal(current.version,baseline.version);assert.equal(current.digest,baseline.digest);
    const candidate=makeVideoFamilyPlan(current.config,temporaryRefs);validateModelConfig(candidate.config,{trustedOrigins:a.trustedOrigins});invariant(current.config,candidate.config);
    assert.deepEqual(compileRouterProjection(current,billing,{trustedOrigins:a.trustedOrigins}).payload.config,compileRouterProjection({...current,config:candidate.config},billing,{trustedOrigins:a.trustedOrigins}).payload.config);
    const wires=compileAll(candidate.config);save(root,"PLAN_REVIEW.json",{operationId:spec.operationId,baselineVersion:current.version,billingVersion:billing.version,skus:wires,declaredSkuCount:VERIFIED_VIDEO_FAMILIES.items.length,excludedModels:candidate.excludedModels,credentialPlaceholdersOnly:true,notPublishable:true});
    console.log(JSON.stringify({mode,passed:true,version:current.version,billingVersion:billing.version,skuCount:wires.length,declaredSkuCount:VERIFIED_VIDEO_FAMILIES.items.length,excludedModels:candidate.excludedModels,nonVideoUnchanged:true,supplierCalls:0}));return;
  }
  if(mode==="APPLY"){
    const requestFile=join(root,"APPLY_REQUEST.json");
    if(!existsSync(requestFile)){
      assert.equal(current.version,baseline.version);assert.equal(current.digest,baseline.digest);
      const source=baseline.config.providers.find((p:any)=>p.id==="geeknow-images");assert.ok(source?.credentialRef);
      let refs:Record<string,string>=existsSync(join(root,"CREDENTIAL_REFS.json"))?load(join(root,"CREDENTIAL_REFS.json")):{};
      for(const providerId of ["geeknow-video","geeknow-video-h3"]){
        if(!refs[providerId]){
          const prior=(await a.pool.query("SELECT id FROM app_model_credentials WHERE provider_id=$1 AND created_by=$2",[providerId,actor])).rows;
          assert.ok(prior.length<=1,"Ambiguous credential creation requires reconciliation");
          refs[providerId]=prior[0]?.id||(await a.credentials.importPlain({providerId,actor,plain:await a.credentials.read(source.credentialRef,source.id)})).id;
          save(root,"CREDENTIAL_REFS.json",refs);
        }
      }
      plan=makeVideoFamilyPlan(baseline.config,refs as any);validateModelConfig(plan.config,{trustedOrigins:a.trustedOrigins});invariant(baseline.config,plan.config);compileAll(plan.config);
      save(root,"APPLY_PLAN.json",plan);
      const draft=await a.repo.draft(actor);assert.equal(draft.basedOnVersion,baseline.version);
      const saved=await a.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:plan.config,actor});
      save(root,"APPLY_REQUEST.json",{id:spec.operationId,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:baseline.version,actor,reason:"启用实测通过的Seedance/Kling/Wan/H3视频节点；保留原计费与历史冻结任务"});
    }
    plan=load(join(root,"APPLY_PLAN.json")) as VideoFamilyPlan;
    const request=load(requestFile);assert.equal(request.id,spec.operationId);
    let publication;
    if(current.digest===modelConfigDigest(plan.config)){
      publication=await a.repo.publication(spec.operationId);assert.equal(publication.phase,"applied");
      assert.equal(publication.digest,modelConfigDigest(plan.config));
    }else{assert.equal(current.version,baseline.version);assert.equal(current.digest,baseline.digest);publication=await a.runtime.publish(request);}
    save(root,"APPLY_PUBLICATION.json",publication);assert.equal(publication.phase,"applied","Retain original UUID; reconcile instead of creating another operation");
  }else if(mode==="ROLLBACK"){
    plan=load(join(root,"APPLY_PLAN.json")) as VideoFamilyPlan;
    const file=join(root,"ROLLBACK_REQUEST.json");
    // The saved request owns retries, including an activation whose result was
    // unknown. Never inverse the current config again after that request exists.
    if(!existsSync(file)){
      const config=rollbackVideoFamilyPlan(current.config,plan);validateModelConfig(config,{trustedOrigins:a.trustedOrigins});invariant(current.config,config);
      save(root,"ROLLBACK_PLAN.json",{config,sourceVersion:current.version,sourceDigest:current.digest});
      const draft=await a.repo.draft(actor+":rollback"),saved=await a.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor:actor+":rollback"});
      save(root,"ROLLBACK_REQUEST.json",{id:spec.rollbackOperationId,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:actor+":rollback",reason:"选择性回退本轮视频启用配置，不改任务、媒体、凭据或其他配置"});
    }
    const request=load(file);assert.equal(request.id,spec.rollbackOperationId);assert.equal(request.actor,actor+":rollback");
    const publication=await a.runtime.publish(request);save(root,"ROLLBACK_PUBLICATION.json",publication);assert.equal(publication.phase,"applied","Retain original rollback UUID for reconciliation");
    const restored=await a.repo.byVersion(publication.version),active=await a.repo.current();
    if(existsSync(join(root,"ROLLBACK_PLAN.json")))assert.equal(restored.digest,modelConfigDigest(load(join(root,"ROLLBACK_PLAN.json")).config));
    assert.equal(active.digest,restored.digest,"Rollback was applied but the active configuration has since changed");
    assert.equal(digest(await a.billing.current()),digest(baselineBilling));
    assert.equal((await a.repo.byVersion(baseline.version)).digest,baseline.digest,"Original immutable model version changed");
    console.log(JSON.stringify({mode,passed:true,publication,version:active.version,digest:active.digest,supplierCalls:0}));return;
  }
  const after=await a.repo.current();plan=plan||load(join(root,"APPLY_PLAN.json")) as VideoFamilyPlan;
  assert.equal(after.digest,modelConfigDigest(plan.config));assert.equal(digest(await a.billing.current()),digest(baselineBilling));invariant(baseline.config,after.config);
  assert.equal((await a.repo.byVersion(baseline.version)).digest,baseline.digest,"Original immutable model version changed");
  await verifyFrozenCapabilities(a,after,plan);
  const catalog=publicModelCatalog(after,"video","video.generate");
  for(const id of plan.publicModelIds)assert.ok(catalog.models.some(m=>m.id===id),"Published video catalog missing "+id);
  for(const excluded of plan.excludedModels)assert.ok(!catalog.models.some(m=>m.id===excluded.publicModelId),"Unavailable video-reference branch must not enter the visible catalog");
  assert.equal(catalog.defaultModelId,plan.defaultPublicModelId);
  const origins=[...new Set(after.config.providers.filter(p=>["apib-video","geeknow-video","geeknow-video-h3"].includes(p.id)).map(p=>new URL(p.baseUrl).origin))];
  const receipt={mode,passed:true,version:after.version,digest:after.digest,billingVersion:billing.version,skuCount:plan.publicModelIds.length,declaredSkuCount:VERIFIED_VIDEO_FAMILIES.items.length,excludedModels:plan.excludedModels,defaultModelId:plan.defaultPublicModelId,profiles:plan.profiles,publicModelIds:plan.publicModelIds,upstreamIds:plan.upstreamIds,wireModels:plan.wireModels,origins,nonVideoUnchanged:true,supplierCalls:0};
  save(root,"VERIFY_RECEIPT.json",receipt);console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(JSON.stringify({error:e?.code||e?.name||"ERROR",message:String(e?.message||"Activation not completed").slice(0,500)}));process.exitCode=1;})
  .finally(async()=>{if(dbEnabled)await getPool().end();})
  .catch(e=>{console.error(JSON.stringify({error:"POOL_CLOSE_FAILED",message:String(e?.message||"Database shutdown failed").slice(0,500)}));process.exitCode=1;});
