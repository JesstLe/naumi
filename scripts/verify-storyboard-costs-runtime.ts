import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getPool,closeDatabasePools} from "../src/platform/db/pool";
import {internalCookie} from "../src/lib/agent-gateway/tool-session";
import {inspectStoryboardCosts} from "../src/lib/storyboard/cost-service";
import {readTaskCostEvidence} from "../src/lib/billing/task-cost-evidence";
import {readVideoCostHistory} from "../src/lib/video/cost-history";
import {withFrozenCreation} from "../src/lib/saas/creation-scope";

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/naumi_video_fixture_/);assert.match(url.searchParams.get("options")||"",/video_run_[a-f0-9]+/);
 const actor=process.env.VIDEO_FIXTURE_ACTION_ACTOR!,other=process.env.VIDEO_FIXTURE_ACTION_OTHER!,project=process.env.VIDEO_FIXTURE_ACTION_PROJECT!,planId=process.env.VIDEO_FIXTURE_ACTION_PLAN!,origin=process.env.INTERNAL_APP_ORIGIN!,db=getPool(),checks:string[]=[];
 const pass=(name:string)=>checks.push(name);
 const api=async(method:string,path:string,body?:unknown,who=actor)=>{const response=await fetch(origin+path,{method,headers:{cookie:internalCookie(who),"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const state=async()=>({tasks:(await db.query("SELECT id,status FROM app_video_tasks WHERE email=$1 ORDER BY id",[actor])).rows,ledger:(await db.query("SELECT * FROM app_ledger WHERE email=$1 ORDER BY id",[actor])).rows,holds:(await db.query("SELECT * FROM app_gen_reservations WHERE email=$1 ORDER BY job_id",[actor])).rows,media:(await db.query("SELECT id,status FROM app_video_media_jobs WHERE email=$1 ORDER BY id",[actor])).rows});
 try{
 const plan=(await api("GET",`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}`)).body.plans.find((p:any)=>p.id===planId),input={projectKey:project,planId,revision:plan.revision,nodes:plan.document.shots.map((s:any)=>({id:s.nodeId,reuseCompleted:true}))},before=await state();
 const response=await api("POST","/api/canvas/storyboards/costs",input);assert.equal(response.status,200,JSON.stringify(response.body));const report=response.body;assert.equal(report.planId,planId);assert.ok(report.items.length>0);assert.equal(report.quote.generationCredits,0);assert.equal(report.executionCeiling.implicitBudgetAdded,false);assert.deepEqual(await state(),before);pass("real_http_report_projects_existing_tasks_quotes_without_charge_or_adoption");
 const history=await readVideoCostHistory(actor,project,planId,plan.document.shots.map((s:any)=>s.nodeId),[]),exact=new Set(history.workflows.filter(w=>w.storyboard?.id===planId||w.reviewPlanId===planId).map(w=>w.id));
 assert.ok(exact.size>0);for(const task of report.items.filter((i:any)=>i.kind==="video"&&i.attribution==="plan"))assert.ok(task.runIds.every((id:string)=>exact.has(id)));assert.ok(report.totals.sharedHistory.taskCount>0);pass("exact_server_plan_context_not_shared_node_history_attribution");
 const charged=Number((await db.query("SELECT COALESCE(sum(charged_credits),0) AS n FROM app_billing_operations WHERE email=$1 AND id=ANY($2::text[]) AND state IN ('settled','released')",[actor,report.items.filter((i:any)=>i.attribution==="plan"&&i.billing.consistent).map((i:any)=>i.id)])).rows[0].n);assert.equal(report.totals.plan.chargedCredits,charged);pass("actual_plan_total_matches_authoritative_billing_operations");
 const text=JSON.stringify(report);for(const privateField of ['providerSnapshot','tariff','procurement','auxiliaryFiles','apiKey','frozen_nodes_enc'])assert.ok(!text.includes(privateField),privateField);pass("public_report_has_no_supplier_prices_secrets_or_private_recipe");
 assert.equal((await api("POST","/api/canvas/storyboards/costs",{...input,revision:input.revision+1})).status,409);assert.equal((await api("POST","/api/canvas/storyboards/costs",input,other)).status===200,false);assert.equal((await api("POST","/api/canvas/storyboards/costs",{...input,compareRevision:999999})).status,404);pass("http_cross_actor_stale_plan_and_missing_compare_rejected");
 const compare=await api("POST","/api/canvas/storyboards/costs",{...input,compareRevision:1});assert.equal(compare.status,200,JSON.stringify(compare.body));assert.equal(compare.body.baselineRevision,1);pass("exact_persisted_old_revision_comparison");
 await withFrozenCreation({actorEmail:actor,scopeKind:"tenant",tenantId:randomUUID(),workspaceExplicit:true},async()=>{await assert.rejects(()=>inspectStoryboardCosts(actor,input));});pass("same_actor_foreign_workspace_rejected");
 const forged=await api("POST","/api/video/workflows",{id:randomUUID(),projectKey:project,storyboard:{id:planId,revision:plan.revision},nodes:[{id:"spoof",request:{prompt:"spoof"},dependsOn:[]}]});assert.equal(forged.status,422);assert.deepEqual(await state(),before);pass("generic_workflow_cannot_spoof_storyboard_cost_attribution");
 // Projection fault matrix uses transaction-local fixture rows and always rolls back.
 const tx=await db.connect();await tx.query("BEGIN");try{
 const id=`cost-fixture-${randomUUID()}`,ledger=`led-video-${id}`,quote={configVersion:1,requestedCredits:10,authorizedCredits:15,reserveCredits:15,tariff:{pricing:{mode:"api-cost-plus"}}};
 await tx.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,reserved_credits,charged_credits,ledger_id) VALUES($1,$2,'video',$3::jsonb,$1,'reserved',999,0,$4)",[id,actor,JSON.stringify(quote),ledger]);
 await tx.query("INSERT INTO app_gen_reservations(job_id,email,cost) VALUES($1,$2,7)",[id,actor]);
 let b=(await readTaskCostEvidence(actor,[{id,ledgerId:ledger}],tx))[0];assert.equal(b.reservedCredits,7);assert.equal(b.chargedCredits,null);assert.equal(b.upperBound,true);pass("held_amount_reads_actual_reservation_not_stale_operation_column");
 await tx.query("UPDATE app_billing_operations SET state='hold' WHERE id=$1",[id]);b=(await readTaskCostEvidence(actor,[{id,ledgerId:ledger}],tx))[0];assert.equal(b.state,"hold");assert.equal(b.chargedCredits,null);pass("unknown_acceptance_keeps_hold_not_free_or_refunded");
 await tx.query("DELETE FROM app_gen_reservations WHERE job_id=$1",[id]);await tx.query("UPDATE app_billing_operations SET state='released',charged_credits=0 WHERE id=$1",[id]);b=(await readTaskCostEvidence(actor,[{id,ledgerId:ledger}],tx))[0];assert.equal(b.chargedCredits,0);assert.equal(b.releasedCredits,15);pass("confirmed_failure_release_zero_charge_not_unknown");
 await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,-10,'cost projection fixture','consume')",[ledger,actor]);await tx.query("UPDATE app_billing_operations SET state='settled',charged_credits=7 WHERE id=$1",[id]);const review=`cost-review-${randomUUID()}`;
 await tx.query("INSERT INTO app_billing_api_cost_reviews(id,operation_id,after_result,status,refund_credits) VALUES($1,$2,'{}','refunded',3)",[review,id]);await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,3,'refund fixture','grant')",[`led-api-refund-${review}`,actor]);
 b=(await readTaskCostEvidence(actor,[{id,ledgerId:ledger}],tx))[0];assert.equal(b.chargedCredits,7);assert.equal(b.debitedCredits,10);assert.equal(b.refundedCredits,3);assert.equal(b.releasedCredits,5);assert.equal(b.consistent,true);pass("actual_refund_grant_ledger_reconciles_net_charge_without_double_release");
 await tx.query("DELETE FROM app_ledger WHERE id=$1",[`led-api-refund-${review}`]);b=(await readTaskCostEvidence(actor,[{id,ledgerId:ledger}],tx))[0];assert.equal(b.chargedCredits,null);assert.equal(b.consistent,false);pass("missing_refund_receipt_is_unknown_not_false_settlement");
 const legacyId=`cost-legacy-${randomUUID()}`,legacyLedger=`led-video-${legacyId}`;await tx.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,-4,'legacy fixture','consume')",[legacyLedger,actor]);
 b=(await readTaskCostEvidence(actor,[{id:legacyId,ledgerId:legacyLedger}],tx))[0];assert.equal(b.basis,"legacy-ledger");assert.equal(b.chargedCredits,4);assert.equal(b.consistent,true);pass("legacy_exact_owned_consume_ledger_is_known_charge_not_guessed_quote");
 b=(await readTaskCostEvidence(other,[{id:legacyId,ledgerId:legacyLedger}],tx))[0];assert.equal(b.chargedCredits,null);assert.equal(b.basis,"missing");pass("billing_evidence_never_reads_other_actor_ledger");
 b=(await readTaskCostEvidence(actor,[{id:randomUUID(),ledgerId:randomUUID()}],tx))[0];assert.equal(b.chargedCredits,null);assert.equal(b.basis,"missing");pass("missing_operation_and_ledger_stay_unknown_not_zero");
 }finally{await tx.query("ROLLBACK");tx.release();}
 assert.deepEqual(await state(),before);pass("cost_queries_and_fixture_rollback_leave_real_tasks_billing_unchanged");
 // All history beyond UI list limits; receipt-less reused stages are not accepted purchases.
 const ids:string[]=[];try{
 const template=(await db.query("SELECT * FROM app_video_workflow_runs WHERE email=$1 AND plan->'storyboard'->>'id'=$2 LIMIT 1",[actor,planId])).rows[0];assert.ok(template);
 for(let i=0;i<55;i++){const id=randomUUID();ids.push(id);await db.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,creation_scope) VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb)",[id,actor,project,JSON.stringify({...template.plan,id}),template.plan_digest,JSON.stringify(template.creation_scope)]);}
 const all=await readVideoCostHistory(actor,project,planId,plan.document.shots.map((s:any)=>s.nodeId),[]);assert.ok(all.workflows.length>=55);assert.ok(ids.every(id=>all.workflows.some(run=>run.id===id)));pass("all_related_workflows_count_beyond_default_fifty_page");
 }finally{await db.query("DELETE FROM app_video_workflow_runs WHERE email=$1 AND id=ANY($2::uuid[])",[actor,ids]);}

 const synthetic=`cost-details-${randomUUID()}`;try{
 const run=[...exact][0];assert.ok(run);
 await db.query(`INSERT INTO app_video_tasks(id,email,upstream_id,status,source,source_id,parameters)
  SELECT $1||'-'||n::text,$2,'fixture-'||n::text,'completed','workflow',$3,jsonb_build_object('projectKey',$4::text,'nodeId',$5::text)
  FROM generate_series(1,505) n`,[synthetic,actor,run,project,plan.document.shots[0].nodeId]);
 const many=await inspectStoryboardCosts(actor,input);assert.equal(many.totals.plan.taskCount,report.totals.plan.taskCount+505);assert.equal(many.items.length,500);assert.equal(many.detailsTruncated,true);assert.equal(many.totals.plan.unknownCount,report.totals.plan.unknownCount+505);assert.equal(many.totals.plan.chargedCredits,report.totals.plan.chargedCredits);pass("all_505_missing_billing_tasks_counted_even_when_detail_display_truncated");
 const id=synthetic+'-1';await db.query("UPDATE app_video_tasks SET parameters=parameters||'{\"byocSnapshot\":{},\"billingException\":\"comfyui-byoc-zero\"}'::jsonb WHERE email=$1 AND id=$2",[actor,id]);
 const byoc=await inspectStoryboardCosts(actor,input);assert.equal(byoc.totals.plan.externalUnknownCount,many.totals.plan.externalUnknownCount+1);assert.equal(byoc.totals.plan.unknownCount,many.totals.plan.unknownCount-1);assert.equal(byoc.totals.plan.chargedCredits,many.totals.plan.chargedCredits);pass("server_byoc_zero_platform_policy_does_not_make_external_compute_free");
 }finally{await db.query("DELETE FROM app_video_tasks WHERE email=$1 AND id LIKE $2",[actor,synthetic+'-%']);}
 assert.deepEqual(await state(),before);
 console.log(JSON.stringify({checks}));
 }finally{await closeDatabasePools();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
