import "server-only";
import { randomUUID } from "node:crypto";
import { dbEnabled, getPool, ensureSchema, deductPrincipalFIFO, refreshBalance, creditMeteringEnabled, expireDueBatches } from "@/lib/db";
import {createBillingService} from "@/lib/billing/service";
import type {BillingQuote,BillingResult,OperationInput} from "@/lib/billing/types";
const billingService=createBillingService();
function billingOperation(row:{id:string;email:string;payload:{billingQuote:BillingQuote}},reason:string):OperationInput{return {id:row.id,email:row.email,quote:row.payload.billingQuote,reason,ledgerId:`led-image-${row.id}`,fingerprint:row.id};}

export type ImageJobKind = "generate" | "suite" | "aplus";
export type ImageJobRow = { id: string; email: string; kind: ImageJobKind; snapshot: Record<string, unknown>; payload: Record<string, unknown>; lease_token: string | null; billing_settled: boolean };

export async function createImageJob(id: string, email: string, kind: ImageJobKind, snapshot: unknown, payload: unknown, cost: number, reserve: boolean, billingQuote?:BillingQuote) {
  await ensureSchema();
  const metered = billingQuote?.facts.metered ?? await creditMeteringEnabled();
  if (!billingQuote && metered && reserve) await expireDueBatches(email);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const frozenPayload={...(payload as object),...(billingQuote?{billingQuote}:{})};
    await client.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`, [id, email.toLowerCase(), kind, JSON.stringify(snapshot), JSON.stringify(frozenPayload), cost, metered]);
    if (billingQuote && reserve) {
      await billingService.reserveTx(client,billingOperation({id,email,payload:{billingQuote}},"图片任务预占"));
      await client.query("UPDATE app_image_jobs SET reserved_cost=$2 WHERE id=$1",[id,billingQuote.reserveCredits]);
    } else if (!billingQuote && reserve && cost > 0 && metered) {
      const result = await client.query(`UPDATE app_users u SET credits_used=credits_used+$2 WHERE email=$1 AND
        (SELECT COALESCE(sum(remaining),0) FROM app_credit_batches WHERE email=$1 AND expires_at>now())-credits_used >= $2`, [email.toLowerCase(), cost]);
      if (!result.rowCount) throw new Error("积分不足，请充值后重试");
      await client.query(`UPDATE app_image_jobs SET reserved_cost=$2 WHERE id=$1`, [id, cost]);
      await client.query(`INSERT INTO app_gen_reservations(job_id,email,cost) VALUES($1,$2,$3)`, [id, email.toLowerCase(), cost]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function getImageJob(id: string, kind: ImageJobKind): Promise<ImageJobRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT * FROM app_image_jobs WHERE id=$1 AND kind=$2`, [id, kind]);
  return rows[0] || null;
}

export async function listActiveImageJobs(email: string, kind: ImageJobKind) {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT id,snapshot->>'status' AS status FROM app_image_jobs
    WHERE email=$1 AND kind=$2 AND snapshot->>'status' NOT IN ('done','error') ORDER BY created_at DESC LIMIT 30`, [email.toLowerCase(), kind]);
  return rows;
}

export async function claimImageJob(id: string, kind: ImageJobKind): Promise<ImageJobRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(`UPDATE app_image_jobs SET lease_token=$3,lease_until=now()+interval '120 seconds'
    WHERE id=$1 AND kind=$2 AND (lease_until IS NULL OR lease_until<now()) AND snapshot->>'status' NOT IN ('done','error','needs_attention') RETURNING *`, [id, kind, randomUUID()]);
  return rows[0] || null;
}

export async function heartbeatImageJob(id: string, token: string) {
  const result = await getPool().query(`UPDATE app_image_jobs SET lease_until=now()+interval '120 seconds' WHERE id=$1 AND lease_token=$2 AND lease_until>now()`, [id, token]);
  if (!result.rowCount) throw new Error("任务执行权已过期");
}

export async function saveImageJob(id: string, snapshot: unknown, token: string | null) {
  const result = await getPool().query(`UPDATE app_image_jobs SET snapshot=$2::jsonb,updated_at=now()
    WHERE id=$1 AND (($3::text IS NOT NULL AND lease_token=$3 AND lease_until>now()) OR
      ($3::text IS NULL AND (lease_until IS NULL OR lease_until<now())))`, [id, JSON.stringify(snapshot), token]);
  if (!result.rowCount) throw new Error("任务正在处理，请稍后重试");
}

/** Exact charge and full reservation release occur once in the same transaction. */
export async function settleImageJob(id: string, charged: number|BillingResult, reason: string, token: string | null) {
  const client = await getPool().connect();
  let email = "";
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE`, [id]);
    const row = rows[0];
    if (!row) throw new Error("任务不存在");
    email = row.email;
    if (!row.billing_settled) {
      if (row.lease_token !== token || (token && new Date(row.lease_until).getTime() <= Date.now())) throw new Error("任务执行权已过期");
      if(row.payload.billingQuote){
        if(typeof charged==="number")throw new Error("新任务结算必须包含实际结果");
        const op=billingOperation(row,reason);
        const reserved=await client.query("SELECT 1 FROM app_billing_operations WHERE id=$1",[id]);
        if(reserved.rowCount){
          const settled=await billingService.settleTx(client,op,charged);
            if(charged.state==="unknown" || settled.state==="manual" || settled.state==="hold"){await client.query("COMMIT");return;}
        }else if(charged.state!=="failed")throw new Error("任务尚未完成计费预占");
      }else{
      if(typeof charged!=="number")throw new Error("旧任务须按已保存价格恢复结算");
      const actual = Math.min(row.cost, Math.max(0, Math.trunc(charged)));
      if (row.metered && actual > 0) {
        await deductPrincipalFIFO(client, email, actual);
        await client.query(`INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,$3,$4,'consume')`, [`led-image-${id}`, email, -actual, reason]);
      }
      if (row.metered) await client.query(`UPDATE app_users SET credits_used=GREATEST(credits_used-$2,0) WHERE email=$1`, [email, row.reserved_cost]);
      }
      await client.query(`UPDATE app_image_jobs SET billing_settled=true WHERE id=$1`, [id]);
      await client.query(`DELETE FROM app_gen_reservations WHERE job_id=$1`, [id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await refreshBalance(email);
}

export async function reserveReviewedImageJob(id: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE`, [id]);
    const row = rows[0];
    if (!row || row.snapshot.stage !== "reviewing" || row.snapshot.generationStarted ||
      row.snapshot.sources.some((source: {status:string}) => source.status !== "approved") ||
      (row.lease_until && new Date(row.lease_until).getTime()>Date.now())) throw new Error("任务尚未完成审核或已进入生成阶段");
    if(row.payload.billingQuote){
      await billingService.reserveTx(client,billingOperation(row,"A+ 审核后预占"));
    }else if (row.metered && row.cost>0) {
      const result = await client.query(`UPDATE app_users SET credits_used=credits_used+$2 WHERE email=$1 AND
        (SELECT COALESCE(sum(remaining),0) FROM app_credit_batches WHERE email=$1 AND expires_at>now())-credits_used >= $2`, [row.email,row.cost]);
      if (!result.rowCount) throw new Error("积分不足，请充值后重试");
      await client.query(`INSERT INTO app_gen_reservations(job_id,email,cost) VALUES($1,$2,$3)`, [id,row.email,row.cost]);
    }
    await client.query(`UPDATE app_image_jobs SET reserved_cost=$2,
      snapshot=snapshot || '{"generationStarted":true,"reserved":true,"status":"pending","stage":"generating"}'::jsonb WHERE id=$1`, [id,row.payload.billingQuote?.reserveCredits??(row.metered?row.cost:0)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/** Edit one source under a row lock so concurrent approvals cannot overwrite each other. */
export async function reviewImageSource(id: string, index: number, redo: boolean, feedback = "") {
  const client=await getPool().connect();
  try {
    await client.query("BEGIN");
    const {rows}=await client.query("SELECT * FROM app_image_jobs WHERE id=$1 AND kind='aplus' FOR UPDATE",[id]);
    const row=rows[0];
    const source=row?.snapshot.sources?.[index];
    if (!Number.isInteger(index) || index<0 || !row || row.snapshot.stage!=="reviewing" || row.snapshot.generationStarted ||
      (row.lease_until && new Date(row.lease_until).getTime()>Date.now()) || !source || source.status==="redoing" ||
      (!redo && (!source.url || !row.snapshot.sourceBuffers[index]))) throw new Error("这张母图正在处理或无法审核，请稍后重试");
    const updated={...source,status:redo ? "redoing" : "approved",error:undefined,...(redo ? {feedback,redoOperationId:`${id}:redo:${randomUUID()}`} : {})};
    await client.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,ARRAY['sources',$2],$3::jsonb),updated_at=now() WHERE id=$1",[id,String(index),JSON.stringify(updated)]);
    await client.query("COMMIT");
    return updated;
  } catch(error) {await client.query("ROLLBACK");throw error;}
  finally {client.release();}
}

export async function releaseImageJob(id: string, token: string) {
  await getPool().query(`UPDATE app_image_jobs SET lease_token=NULL,updated_at=now(),
    lease_until=CASE WHEN snapshot->>'status'='pending' THEN now()+interval '10 seconds' ELSE NULL END
    WHERE id=$1 AND lease_token=$2`, [id,token]);
}

export async function dueImageJobs() {
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT id,kind FROM app_image_jobs WHERE (lease_until IS NULL OR lease_until<now())
    AND (snapshot->>'status'='pending' OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb)
    ORDER BY updated_at LIMIT 3`);
  return rows as {id:string;kind:ImageJobKind}[];
}

/** Keep an uncertain paid domain job visible to billing reconciliation. */
export async function holdImageJobBilling(id:string) {
  if(!dbEnabled)return;
  await getPool().query("UPDATE app_billing_operations SET state=CASE WHEN quote->'tariff'->'settlement'->>'unknown'='manual' THEN 'manual' ELSE 'hold' END,updated_at=now() WHERE id=$1 AND state='reserved'",[id]);
}
