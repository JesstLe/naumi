/** Real isolated PG repository/HTTP-error contract. Authorization is a fixture;
 * real Go Router and complete browser publication are verified separately. */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {mkdir,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";
async function main(){
 const args=process.argv.slice(2),arg=(name:string)=>{const n=args.indexOf(name);return n<0?undefined:args[n+1];},baseline=args.includes("--baseline"),root=path.resolve(arg("--source-root")||".");
 const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href),f=await createModelFixture();let checks=0;const eq=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++;};
 try{
  const {createModelRepository}=await load("src/lib/model-config/repository.ts"),{createModelAdminHandler}=await load("src/lib/model-config/access.ts"),{publicationNotStaged}=await load("src/lib/model-config/publication-result.ts");
  const repo=createModelRepository({pool:f.sql,initialize:async()=>f.config,trustedOrigins:[f.origin]});
  const original=await repo.current(),actor="own-publisher",other="other-publisher",draft=await repo.draft(actor),foreign=await repo.draft(other);
  const config=structuredClone(draft.config);config.publicModels[0].label="First own publication";
  const saved=await repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor,config}),id=randomUUID();
  const staged=await repo.stage({id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:original.version,actor,reason:"First own publication"});
  const applied=await repo.markApplied(id,staged.digest,saved.id),continued=await repo.draft(actor);
  eq(continued.config,config,"publication keeps full draft content");eq(continued.basedOnVersion,baseline?original.version:applied.version,"only matching own draft advances base");eq(continued.revision,baseline?saved.revision:saved.revision+1,"base transition participates in draft CAS");
  if(!baseline){await assert.rejects(repo.saveDraft({id:continued.id,expectedRevision:saved.revision,actor,config}),{code:"DRAFT_CONFLICT"});checks++;}
  eq((await repo.draft(other)).basedOnVersion,foreign.basedOnVersion,"other administrator untouched");
  const nextConfig=structuredClone(continued.config);nextConfig.publicModels[0].label="Second own publication";
  const next=await repo.saveDraft({id:continued.id,expectedRevision:continued.revision,actor,config:nextConfig});
  let nextResult="ACCEPTED";
  try{const s=await repo.stage({id:randomUUID(),draftId:next.id,expectedRevision:next.revision,expectedVersion:applied.version,actor,reason:"Second own publication"});await repo.markApplied(s.id,s.digest,next.id);}catch(error){nextResult=(error as {code:string}).code;}
  eq(nextResult,baseline?"PUBLISH_STALE_DRAFT_BASE":"ACCEPTED","normal second publication");
  const current=await repo.current(),foreignId=randomUUID(),handler=createModelAdminHandler({authorize:async()=>({actor:other})as never,administration:async()=>({repo,runtime:{publish:(input:unknown)=>repo.stage(input)}})as never});
  const response=await handler(new Request("http://fixture.test/api/admin/bi/model-config",{method:"POST",headers:{origin:"http://fixture.test","content-type":"application/json"},body:JSON.stringify({id:foreignId,draftId:foreign.id,expectedRevision:foreign.revision,expectedVersion:current.version,reason:"Other administrator stale draft"})}),"publish");
  const rejected=await response.json();eq(response.status,409,"real foreign stale base still rejected");eq(rejected.code,"PUBLISH_STALE_DRAFT_BASE","specific stale error retained");eq(rejected.operationNotStaged===true,!baseline,"only proven pre-stage rejection is classified");eq(publicationNotStaged(rejected),!baseline,"client receives same proof");eq(publicationNotStaged({code:rejected.code,operationNotStaged:false}),false,"unknown without proof remains unknown");
  eq((await f.sql.query("SELECT count(*)::int AS n FROM app_model_publications WHERE id=$1",[foreignId])).rows[0].n,0,"rejected operation has no staged row");
  const editing="edited-while-activating",before=await repo.current(),editDraft=await repo.draft(editing),stageConfig=structuredClone(editDraft.config);stageConfig.publicModels[0].label="Staged value";
  const forStage=await repo.saveDraft({id:editDraft.id,expectedRevision:editDraft.revision,actor:editing,config:stageConfig}),editId=randomUUID(),editStage=await repo.stage({id:editId,draftId:forStage.id,expectedRevision:forStage.revision,expectedVersion:before.version,actor:editing,reason:"Concurrent edit remains private"});
  const laterConfig=structuredClone(stageConfig);laterConfig.publicModels[0].label="Unpublished later edit";const later=await repo.saveDraft({id:forStage.id,expectedRevision:forStage.revision,actor:editing,config:laterConfig});await repo.markApplied(editId,editStage.digest,forStage.id);
  const after=await repo.draft(editing);eq(after.config,laterConfig,"later edit never overwritten");eq(after.basedOnVersion,later.basedOnVersion,"changed draft is not silently rebased");eq(after.revision,later.revision,"changed draft revision preserved");
  const ownBeforeReplay=await repo.draft(actor);await repo.markApplied(id,staged.digest,saved.id);eq(await repo.draft(actor),ownBeforeReplay,"old receipt replay neither advances nor rewinds draft");eq((await repo.byVersion(applied.version)).config,config,"original published snapshot immutable");
  if(!baseline){
   // Actual runtime + repository + PG. Only the Router transport is a fixture;
   // the classic browser command separately covers the real Go Router.
   const {createModelRuntime}=await load("src/lib/model-config/runtime.ts"),{createRouterControl}=await load("src/lib/model-config/router-client.ts");
   let activeDigest="",activationCalls=0,loseActivation=false;
   const receipts=new Map<string,{id:string;digest:string;phase:"applied"}>();
   const control=createRouterControl({baseUrl:f.origin,token:"restore-context-fixture-control-independent-20261101",envelopeSecret:"restore-context-fixture-envelope-independent-20261101",trustedOrigins:[f.origin]});
   const router={...control,prepare:async()=>{},state:async()=>activeDigest,status:async(operation:string)=>receipts.get(operation)||null,
    activate:async(operation:string,expected:string,digest:string)=>{eq(activeDigest,expected,"Router fixture retains original digest CAS");activationCalls++;activeDigest=digest;const receipt={id:operation,digest,phase:"applied" as const};receipts.set(operation,receipt);if(loseActivation){loseActivation=false;throw Error("fixture activation ACK lost");}return receipt;}};
   const runtime=createModelRuntime({pool:f.sql,repo,credentials:f.credentials,router,trustedOrigins:[f.origin],billing:async()=>({version:1,config:fixtureConfig()})});
   const beforeRestore=await repo.current(),restoreActor="matching-historical-restore",restoreDraft=await repo.draft(restoreActor),publisher="intervening-runtime-publisher";
   const publishDraft=await repo.draft(publisher),publishConfig=structuredClone(publishDraft.config);publishConfig.publicModels[0].label="Intervening runtime publication";
   const publishSaved=await repo.saveDraft({id:publishDraft.id,expectedRevision:publishDraft.revision,actor:publisher,config:publishConfig});
   const published=await runtime.publish({id:randomUUID(),draftId:publishSaved.id,expectedRevision:publishSaved.revision,expectedVersion:beforeRestore.version,actor:publisher,reason:"Runtime publishes its exact staged draft"});
   eq(published.phase,"applied","actual runtime publication applies");eq((await repo.draft(publisher)).basedOnVersion,published.version,"runtime forwards the original publication draft identity");
   const restored=await runtime.restore({id:randomUUID(),targetVersion:beforeRestore.version,expectedVersion:published.version,actor:restoreActor,reason:"Restore historical configuration without editing draft"});
   eq(restored.phase,"applied","historical restore applies");
   const restoredDraft=await repo.draft(restoreActor);console.log(`RESTORE_DRAFT_CONTEXT=HISTORICAL BEFORE_BASE=${restoreDraft.basedOnVersion} AFTER_BASE=${restoredDraft.basedOnVersion} BEFORE_REVISION=${restoreDraft.revision} AFTER_REVISION=${restoredDraft.revision}`);
   eq(restoredDraft,restoreDraft,"historical restore preserves matching stale draft id/base/revision/content");
   eq((await repo.current()).config,beforeRestore.config,"restore activates the exact historical snapshot");
   const noOpActor="matching-current-restore",noOpDraft=await repo.draft(noOpActor);
   const noOpRestore=await runtime.restore({id:randomUUID(),targetVersion:restored.version,expectedVersion:restored.version,actor:noOpActor,reason:"Restore identical current content"});
   eq(noOpRestore.phase,"applied","same-content restore applies");eq(await repo.draft(noOpActor),noOpDraft,"same-content current restore also preserves full working draft");
   const pendingActor="runtime-unknown-publisher",pendingDraft=await repo.draft(pendingActor),pendingConfig=structuredClone(pendingDraft.config);pendingConfig.publicModels[0].label="Original identity after lost ACK";
   const pendingSaved=await repo.saveDraft({id:pendingDraft.id,expectedRevision:pendingDraft.revision,actor:pendingActor,config:pendingConfig});
   const pendingInput={id:randomUUID(),draftId:pendingSaved.id,expectedRevision:pendingSaved.revision,expectedVersion:noOpRestore.version,actor:pendingActor,reason:"Original publication reconciliation"},beforeActivations=activationCalls;
   loseActivation=true;eq((await runtime.publish(pendingInput)).phase,"unknown","lost activation ACK stays unknown");eq(await repo.draft(pendingActor),pendingSaved,"unknown publication does not advance a draft before confirmation");
   const reconciled=await runtime.publish(pendingInput);eq(reconciled.phase,"applied","original operation reconciliation applies");eq(activationCalls-beforeActivations,1,"reconciliation never repeats Router activation");
   const reconciledDraft=await repo.draft(pendingActor);eq(reconciledDraft.basedOnVersion,reconciled.version,"reconciliation retains source draft identity");eq(reconciledDraft.revision,pendingSaved.revision+1,"confirmed publication advances draft CAS once");
   eq(await runtime.publish(pendingInput),reconciled,"original applied receipt stays idempotent");eq(await repo.draft(pendingActor),reconciledDraft,"old applied receipt does not rewrite the continued draft");
  }
  const report={status:baseline?"BASELINE_REPRODUCED":"PASS",checks,nextPublication:nextResult,realPG:true,actualRepository:true,actualErrorHandler:true,authorization:"fixture",supplierCalls:0,sourceRoot:root};
  const out=arg("--out")||process.env.MODEL_DRAFT_CONTINUATION_EVIDENCE;if(out){await mkdir(out,{recursive:true});await writeFile(path.join(out,"RESULT.json"),JSON.stringify(report,null,2)+"\n");}
  console.log(`PUBLISHED_DRAFT_CONTINUATION=${report.status} CHECKS=${checks} NEXT_PUBLISH=${nextResult} FOREIGN_STALE=REJECTED LATER_EDIT=PRESERVED OLD_RECEIPT=IMMUTABLE RESTORE_DRAFT=PRESERVED REAL_PG=1 SUPPLIER=0`);
 }finally{await f.cleanup();console.log("PUBLISHED_DRAFT_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
