/** Synchronous tool operations must always reach an honest terminal state.
 * 47 (2026-11-06) held 60 zero-credit operations as UNKNOWN 'hold' for weeks and
 * left creation records 'queued' on early error exits and async tool jobs.
 * Real PG billing + creation writer; the supplier is a fixture action. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const f=await createModelFixture();let db:typeof import("../src/lib/db")|undefined,checks=0;
  const eq=(a:unknown,b:unknown,m:string)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);checks++;};
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"sync-terminal-fixture",MODEL_CONFIG_ENVELOPE_SECRET:"sync-terminal-fixture"});
  try{
    db=await import("../src/lib/db");await db.ensureSchema();await f.repo.current();
    const actor="sync-terminal@fixture.test",poor="poor-sync-terminal@fixture.test";for(const email of [actor,poor])await db.getOrCreateUser(email);
    const {withBillingTransaction,createBillingService}=await import("../src/lib/billing/service"),service=createBillingService();
    for(const email of [actor,poor])await withBillingTransaction(db.getPool(),async tx=>{await tx.query("DELETE FROM app_ledger WHERE email=$1",[email]);await tx.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[email]);
      if(email===actor)await service.grantTx(tx,{id:randomUUID(),email,amount:30,source:"admin",reason:"sync terminal fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"});});
    const {getBillingRuntime}=await import("../src/lib/billing/server"),runtime=await getBillingRuntime(),original=await runtime.config.current();
    const pricing=await import("../src/lib/billing/quote"),facts={feature:"canvas.text-generate" as const,quantity:1,quality:"medium",resolution:"1K",byok:false,metered:true,paidFen:0,userGroup:"default"};
    const freeConfig=structuredClone(original.config);freeConfig.features["canvas.text-generate"].enabled=false;freeConfig.features["canvas.text-generate"].pricing={mode:"fixed",credits:0};freeConfig.features["canvas.text-generate"].rules=[];
    const paidConfig=structuredClone(original.config);paidConfig.features["canvas.text-generate"].enabled=true;paidConfig.features["canvas.text-generate"].pricing={mode:"fixed",credits:3};paidConfig.features["canvas.text-generate"].rules=[];
    paidConfig.features["canvas.text-generate"].settlement={...paidConfig.features["canvas.text-generate"].settlement,unknown:"hold",failureBps:0};
    freeConfig.features["canvas.text-generate"].settlement={...freeConfig.features["canvas.text-generate"].settlement,unknown:"hold",failureBps:0};
    const free={...original,config:freeConfig},paid={...original,config:paidConfig};
    const freeQuote=pricing.quote(free,facts),paidQuote=pricing.quote(paid,facts);

    // Pure rule: only a quote that can never charge closes an UNKNOWN at zero.
    eq([freeQuote.authorizedCredits,freeQuote.reserveCredits,pricing.isChargelessQuote(freeQuote)],[0,0,true],"disabled zero tariff is chargeless");
    eq(pricing.settlementFor(freeQuote,{state:"unknown",items:[]}),{state:"settle",charge:0,release:0},"chargeless unknown settles at zero");
    eq([pricing.isChargelessQuote(paidQuote),pricing.settlementFor(paidQuote,{state:"unknown",items:[]}).state],[false,"hold"],"paid unknown keeps its configured review");
    const usage=structuredClone(freeQuote);usage.tariff.enabled=true;(usage.tariff as any).pricing={mode:"usage",authorizationCnyMicros:0};
    const apiCost=structuredClone(freeQuote);apiCost.tariff.enabled=true;(apiCost.tariff as any).pricing={mode:"api-cost-plus"};
    eq([pricing.isChargelessQuote(usage),pricing.isChargelessQuote(apiCost)],[false,false],"cost-derived pricing never counts as chargeless");

    const sync=await import("../src/lib/billing/synchronous-operation"),scope=await import("../src/lib/saas/creation-scope");
    const run=(email:string,quote:typeof freeQuote,action:()=>Promise<import("../src/lib/billing/synchronous-operation").SynchronousResult>)=>{
      const operationId=randomUUID(),snapshot=quote===freeQuote?free:paid;
      return scope.withFrozenCreation({actorEmail:email,scopeKind:"personal",tenantId:null},async()=>({operationId,response:await sync.withSynchronousOperation({operationId,email,feature:"canvas.text-generate",path:"/api/canvas/text-generate",
        identity:async()=>({hash:createHash("sha256").update(operationId).digest("hex")}),snapshot:async()=>snapshot,quote:async()=>quote},action)}));
    };
    const facts_=async(operationId:string)=>{
      const id=`tool-${operationId}`,pool=db!.getPool();
      const op=(await pool.query("SELECT state,charged_credits,reserved_credits,settlement_result->>'state' AS result FROM app_billing_operations WHERE id=$1",[id])).rows[0];
      const creation=(await pool.query("SELECT status FROM app_creation_records WHERE source_kind='canvas.text-generate' AND source_id=$1",[id])).rows[0];
      return {billing:op?[op.state,Number(op.charged_credits),Number(op.reserved_credits),op.result]:null,creation:creation?.status??null};
    };
    const wallet=async(email:string)=>Number((await db!.getPool().query("SELECT credits_used FROM app_users WHERE email=$1",[email])).rows[0].credits_used);

    // A: free reply the handler rejected after the supplier answered (the 47 shape).
    const a=await run(actor,freeQuote,async()=>{await sync.configuredToolCost();sync.markBillingUpstream("succeeded");return {status:502,body:{error:"fixture unusable reply"}};});
    eq([a.response.status,await facts_(a.operationId)],[502,{billing:["settled",0,0,"unknown"],creation:"failed"}],"free unknown closes at zero and the creation is failed");
    // B: the same outcome on a paid quote stays reviewable and keeps its reservation.
    const b=await run(actor,paidQuote,async()=>{await sync.configuredToolCost();sync.markBillingUpstream("succeeded");return {status:502,body:{error:"fixture unusable reply"}};});
    eq(await facts_(b.operationId),{billing:["hold",0,3,"unknown"],creation:"needs_review"},"paid unknown is held for review");
    eq(await wallet(actor),3,"only the paid hold keeps reserved credits");
    // C: rejected before any reservation must not leave a queued creation.
    const c=await run(poor,paidQuote,async()=>{await sync.configuredToolCost();throw new Error("unreachable");});
    eq([c.response.status,(await facts_(c.operationId)).creation],[402,"failed"],"insufficient credits finishes the creation as failed");
    // D: an async job that finished before the wrapper returned is not regressed to queued.
    const d=await run(actor,paidQuote,async()=>{await sync.configuredToolCost();sync.markBillingUpstream("succeeded");await sync.settleSynchronous("fixture async done");await sync.finishSynchronousCreation([]);return {status:200,body:{jobId:"fixture-job"}};});
    eq(await facts_(d.operationId),{billing:["settled",3,0,"succeeded"],creation:"succeeded"},"async completion stays succeeded");
    // E: a still-running async job keeps queued until its own continuation finishes.
    // Like `void runJob(...)`, the continuation starts inside the request context.
    let release!:()=>void,background!:Promise<void>;const gate=new Promise<void>(resolve=>{release=resolve;});
    const e=await run(actor,paidQuote,async()=>{await sync.configuredToolCost();sync.markBillingUpstream("rejected");background=(async()=>{await gate;await sync.failSynchronousBackground("fixture async rejected");})();return {status:200,body:{jobId:"fixture-job-2"}};});
    eq((await facts_(e.operationId)).creation,"queued","accepted async job is queued");
    release();await background;
    eq(await facts_(e.operationId),{billing:["settled",0,0,"failed"],creation:"failed"},"rejected async job releases and fails");
    // F/G: a broken stream closes a free reply but keeps a paid one reviewable.
    const f1=await run(actor,freeQuote,async()=>{await sync.configuredToolCost();sync.markBillingUpstream("unknown");await sync.failSynchronousStream();return {status:200,body:null,stream:true};});
    eq(await facts_(f1.operationId),{billing:["settled",0,0,"unknown"],creation:"failed"},"free broken stream closes");
    const g=await run(actor,paidQuote,async()=>{await sync.configuredToolCost();sync.markBillingUpstream("unknown");await sync.failSynchronousStream();return {status:200,body:null,stream:true};});
    eq(await facts_(g.operationId),{billing:["hold",0,3,"unknown"],creation:"needs_review"},"paid broken stream is held");
    // H: holds left by older code close through the billing module, never a paid one.
    const billing=await import("../src/lib/billing/service");
    await db.getPool().query("UPDATE app_billing_operations SET state='hold' WHERE id=$1",[`tool-${a.operationId}`]);
    await db.getPool().query("UPDATE app_billing_operations SET state='manual',settlement_result=NULL WHERE id=$1",[`tool-${f1.operationId}`]);
    const closed=await withBillingTransaction(db.getPool(),tx=>billing.closeChargelessUnknownTx(tx,`tool-${a.operationId}`,"fixture close"));
    const abandoned=await withBillingTransaction(db.getPool(),tx=>billing.closeChargelessUnknownTx(tx,`tool-${f1.operationId}`,"fixture close"));
    const refused=await withBillingTransaction(db.getPool(),tx=>billing.closeChargelessUnknownTx(tx,`tool-${b.operationId}`,"fixture close"));
    eq([closed?.state,closed?.charge,abandoned?.state,refused],["settled",0,"settled",null],"older free hold/manual close at zero; a paid hold is refused");
    eq([(await facts_(a.operationId)).billing,(await facts_(f1.operationId)).billing,(await facts_(b.operationId)).billing],[["settled",0,0,"unknown"],["settled",0,0,"unknown"],["hold",0,3,"unknown"]],"closing changes only chargeless rows");
    // I: history shows a job that failed at its top level as failed, even with a stale 'running' result.
    const jobId=`imagegen-${randomUUID()}`,writer=await import("../src/lib/saas/creation-writer"),creations=await import("../src/lib/saas/creations"),contracts=await import("../src/lib/saas/creation-contracts");
    await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'imagegen',$3::jsonb,'{}'::jsonb,true)",[jobId,actor,JSON.stringify({status:"error",result:{status:"running",stage:"editing"}})]);
    const creationId=await writer.startCreation("image:imagegen",jobId,actor,{},{actorEmail:actor,scopeKind:"personal",tenantId:null});
    const page=await creations.listCreations({platform:true},contracts.creationFiltersSchema.parse({user:actor,size:100}));
    eq(page.items.find(item=>item.id===creationId)?.status,"failed","top-level job failure wins over a stale result snapshot");
    console.log(`SYNC_TERMINAL_CONSISTENCY=PASS CHECKS=${checks}`);
  }finally{if(db)await db.getPool().end();await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
