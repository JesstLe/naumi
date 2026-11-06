/** Run inside the 47 Web container (same code, env and credentials).
 * PLAN classifies every stale billing hold and non-terminal creation record by
 * its evidence; APPLY re-derives the identical plan (digest CAS) and closes each
 * item through the billing and creation modules. No supplier call, no media
 * change, no replay. Output is one JSON line without emails or credentials. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {getPool} from "../../src/platform/db/pool";
import {withTransaction} from "../../src/platform/db/transaction";
import {closeChargelessUnknownTx,createBillingService} from "../../src/lib/billing/service";
import {isChargelessQuote} from "../../src/lib/billing/quote";
import type {BillingQuote} from "../../src/lib/billing/types";
import {completeCreationTx} from "../../src/lib/saas/creation-writer";
import {excludeImportedHistory} from "../../src/lib/staging-history";

const ACTOR="codex:maint47-terminal-20261106",EVENT="maint47:terminal:20261106";
// Paid holds adjudicated from read-only evidence (2026-11-06): no result was ever
// delivered, so each settles as failed (failureBps 0: no charge, reservation released).
const PAID:Record<string,{feature:string;reserved:number;proof:string}>={
  "tool-dc76a53d-0a1a-49c6-bca6-29b5abe1a98e":{feature:"tool.replicate",reserved:10,proof:"供应商调用停在 submitting，无任务号、无回执；无结果、无作品（10-28）"},
  "tool-60b1ab82-692e-4860-a609-d8403c1f3760":{feature:"tool.ipcheck",reserved:1,proof:"识别调用结束但请求未返回结果；无结果、无作品（10-30）"},
  "tool-7e3469f1-a7eb-5abd-a5c6-ceb856fe691e":{feature:"tool.cutout",reserved:1,proof:"抠图透明参数修复前的请求：供应商出图但本站拒绝交付；无结果、无作品（11-06）"},
};
const STALE="interval '1 hour'";
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Pool=ReturnType<typeof getPool>;

async function billingPlan(pool:Pool){
  const rows=(await pool.query(`SELECT id,feature,state,quote,reserved_credits,result_response IS NULL AS no_result,updated_at::text AS updated
    FROM app_billing_operations WHERE state IN ('hold','manual') AND updated_at<now()-${STALE} ${excludeImportedHistory("app_billing_operations")} ORDER BY id`)).rows;
  const chargeless=rows.filter(r=>isChargelessQuote(r.quote as BillingQuote)).map(r=>({id:r.id as string,feature:r.feature as string,state:r.state as string,updated:r.updated as string}));
  const paid=rows.filter(r=>!isChargelessQuote(r.quote as BillingQuote));
  for(const r of paid){
    const expected=PAID[r.id];assert(expected,`UNREVIEWED_PAID_HOLD:${r.id}`);
    assert.equal(r.feature,expected.feature,`PAID_FEATURE_CHANGED:${r.id}`);assert.equal(Number(r.reserved_credits),expected.reserved,`PAID_RESERVATION_CHANGED:${r.id}`);
    assert.equal(r.no_result,true,`PAID_RESULT_PRESENT:${r.id}`);assert.equal(Number((r.quote as BillingQuote).tariff.settlement.failureBps),0,`PAID_FAILURE_CHARGES:${r.id}`);
    const outputs=(await pool.query("SELECT count(*)::int n FROM app_creation_links o JOIN app_creation_links b ON b.creation_id=o.creation_id WHERE b.target_type='billing' AND b.target_id=$1 AND o.target_type='artwork' AND o.relation='output'",[r.id])).rows[0].n;
    assert.equal(outputs,0,`PAID_OUTPUT_PRESENT:${r.id}`);
  }
  assert.equal(paid.length,Object.keys(PAID).length,"PAID_HOLD_SET_CHANGED");
  return {chargeless,paid:paid.map(r=>({id:r.id as string,feature:r.feature as string,reserved:Number(r.reserved_credits),updated:r.updated as string}))};
}

/** closedIds: billing operations this run closes at zero (PLAN predicts them).
 * onlyIds re-reads exactly the planned records after billing touched them. */
async function creationPlan(pool:Pool,closedIds:Set<string>,onlyIds?:string[]){
  const rows=(await pool.query(`SELECT c.id,c.actor_email,c.source_kind,c.source_id,c.status,c.updated_at::text AS updated,
     (SELECT coalesce(json_agg(json_build_object('id',l.target_id,'state',o.state,'charged',o.charged_credits,'result',o.settlement_result->>'state')),'[]') FROM app_creation_links l LEFT JOIN app_billing_operations o ON o.id=l.target_id WHERE l.creation_id=c.id AND l.target_type='billing') AS billing,
     (SELECT coalesce(json_agg(json_build_object('top',x.snapshot->>'status','result',x.snapshot->'result'->>'status')),'[]') FROM app_image_jobs x WHERE x.id=c.source_id OR x.id IN (SELECT l.target_id FROM app_creation_links l WHERE l.creation_id=c.id AND l.target_type LIKE 'image%')) AS jobs,
     (SELECT count(*)::int FROM app_creation_links l WHERE l.creation_id=c.id AND l.target_type='artwork' AND l.relation='output') AS outputs,
     (SELECT count(*)::int FROM app_artworks a WHERE a.email=c.actor_email AND a.deleted_at IS NULL AND a.creation_provenance->>'ref'=c.source_id) AS provenance,
     (SELECT count(*)::int FROM app_ledger g WHERE g.email=c.actor_email AND position(c.source_id in g.id)>0) AS ledger,
     EXISTS(SELECT 1 FROM app_creation_records s WHERE s.source_id=c.source_id AND s.actor_email=c.actor_email AND s.id<>c.id AND s.status='succeeded') AS sibling_succeeded
   FROM app_creation_records c WHERE c.status IN ('queued','running','needs_review') AND ${onlyIds?"c.id=ANY($1::text[])":`c.updated_at<now()-${STALE}`} ORDER BY c.id`,onlyIds?[onlyIds]:[])).rows;
  const items:{id:string;email:string;kind:string;updated:string;action:"succeeded"|"failed"|"retain";reason:string}[]=[];
  for(const r of rows){
    const billing=(r.billing as {id:string;state:string|null;charged:number|null;result:string|null}[]),jobs=(r.jobs as {top:string|null;result:string|null}[]);
    const closed=(b:typeof billing[number])=>closedIds.has(b.id)||b.state==="released"||(b.state==="settled"&&Number(b.charged)===0);
    const paidSuccess=billing.length>0&&billing.every(b=>b.state==="settled"&&Number(b.charged)>0&&b.result==="succeeded");
    const jobDone=jobs.some(j=>["done","completed","succeeded"].includes(String(j.result??j.top)));
    const jobActive=jobs.some(j=>!["error","failed","cancelled","canceled","done","completed","succeeded"].includes(String(j.top)));
    let action:"succeeded"|"failed"|"retain"="retain",reason="";
    if(r.source_kind==="agent-turn")reason="agent turn review flag (visual check unavailable) kept by design";
    else if(jobs.some(j=>j.top==="awaiting_review"||j.result==="awaiting_review"))reason="waiting for the user's own review";
    else if(paidSuccess&&(Number(r.outputs)>0||jobDone||r.sibling_succeeded)){action="succeeded";reason="charged and delivered";}
    else if(!Number(r.outputs)&&!Number(r.provenance)&&!Number(r.ledger)&&!jobActive&&!jobDone&&billing.every(b=>b.state===null||closed(b))){
      action="failed";reason=billing.some(b=>b.state!==null)?"closed at zero, nothing delivered":jobs.length?"task failed, nothing delivered or charged":"not completed, nothing delivered or charged";
    } else reason="evidence incomplete";
    items.push({id:r.id,email:r.actor_email,kind:r.source_kind,updated:r.updated,action,reason});
  }
  return items;
}
const summaries:Record<string,string>={"closed at zero, nothing delivered":"执行中断，未交付结果，未扣费","task failed, nothing delivered or charged":"任务已失败，未交付结果，未扣费",
  "not completed, nothing delivered or charged":"执行未完成，无交付结果，未扣费","charged and delivered":"已交付并结算"};
type Item=Awaited<ReturnType<typeof creationPlan>>[number];
const stable=(c:Item[])=>c.map(i=>({id:i.id,kind:i.kind,action:i.action,reason:i.reason}));
const publicPlan=(b:Awaited<ReturnType<typeof billingPlan>>,c:Item[])=>({chargeless:b.chargeless,paid:b.paid,creations:stable(c)});
const counts=(c:Awaited<ReturnType<typeof creationPlan>>)=>c.reduce<Record<string,number>>((m,i)=>{const k=`${i.action}:${i.kind}`;m[k]=(m[k]||0)+1;return m;},{});

async function main(){
  const [mode,expected]=process.argv.slice(2);assert(mode==="PLAN"||mode==="APPLY","MODE_REQUIRED");
  const pool=getPool();
  try{
    const billing=await billingPlan(pool),predicted=new Set([...billing.chargeless.map(r=>r.id),...billing.paid.map(r=>r.id)]);
    const creations=await creationPlan(pool,predicted),plan=publicPlan(billing,creations),planDigest=digest(plan);
    const summary={chargeless:billing.chargeless.length,paid:billing.paid.map(p=>[p.id,p.feature,p.reserved]),creations:counts(creations),
      retained:creations.filter(i=>i.action==="retain").map(i=>[i.id,i.kind,i.reason])};
    if(mode==="PLAN"){console.log(JSON.stringify({mode,planDigest,...summary,plan}));return;}
    assert.equal(planDigest,expected,"PLAN_CHANGED");
    const service=createBillingService();let closed=0,released=0,finished=0;
    for(const op of billing.chargeless){
      const r=await withTransaction(pool,tx=>closeChargelessUnknownTx(tx,op.id,"历史零积分操作结果未知：无可扣费用，按零结清"));
      assert(r&&r.state==="settled"&&r.charge===0,`CHARGELESS_CLOSE_FAILED:${op.id}`);closed++;
    }
    for(const op of billing.paid){
      const r=await withTransaction(pool,tx=>service.reconcileTx(tx,{id:`maint47-terminal-${op.id}`,operationId:op.id,actor:ACTOR,reason:"未交付结果，按失败结算：不扣费，释放预留",proof:PAID[op.id].proof,result:{state:"failed",items:[]}}));
      assert.equal(r.charge,0,`PAID_RECONCILE_CHARGED:${op.id}`);released++;
    }
    // Re-derive with the real billing states: the creation plan must be unchanged.
    const after=await creationPlan(pool,new Set(),creations.map(i=>i.id));
    assert.equal(digest(stable(after)),digest(plan.creations),"CREATION_PLAN_CHANGED_AFTER_BILLING");
    for(const item of after.filter(i=>i.action!=="retain")){
      await withTransaction(pool,async tx=>{
        const row=(await tx.query("SELECT status,updated_at::text AS updated FROM app_creation_records WHERE id=$1 AND actor_email=$2 FOR UPDATE",[item.id,item.email])).rows[0];
        assert(row&&row.updated===item.updated&&["queued","running","needs_review"].includes(row.status),`CREATION_CHANGED:${item.id}`);
        // item.updated comes from the post-billing re-read, so this is a CAS against concurrent writers only.
        await completeCreationTx(tx,item.id,item.email,item.action as "succeeded"|"failed",{eventKey:EVENT,summary:summaries[item.reason]});
      });finished++;
    }
    const remaining=(await pool.query(`SELECT (SELECT count(*)::int FROM app_billing_operations WHERE state IN ('hold','manual') ${excludeImportedHistory("app_billing_operations")}) AS holds,
      (SELECT count(*)::int FROM app_creation_records WHERE status IN ('queued','running','needs_review') AND updated_at<now()-${STALE}) AS creations`)).rows[0];
    console.log(JSON.stringify({mode,planDigest,closed,released,finished,remaining,...summary}));
  }finally{await pool.end();}
}
main().catch(e=>{console.error(JSON.stringify({error:e instanceof Error?e.message:String(e)}));process.exitCode=1;});
