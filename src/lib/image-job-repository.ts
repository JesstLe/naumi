import {currentCreationContext} from "@/lib/saas/creation-scope";
import {readTaskDiagnostic,type TaskFailureDiagnostic} from "./imagegen/task-diagnostics";
import {acceptCreationTx,recordImageStateTx,creationLinkTx} from "./saas/creation-writer";
import "server-only";
import { randomUUID } from "node:crypto";
import {IMAGE_JOB_KINDS,imageJobConcurrency} from "./image-job-queue";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {deductPrincipalFIFO} from "@/lib/billing/wallet-balance";
import {creditMeteringEnabled} from "@/lib/billing/runtime";
import {refreshBalance, expireDueBatches} from "@/lib/billing/wallet-balance";
import {createBillingService} from "@/lib/billing/service";
import type {BillingQuote,BillingResult,OperationInput} from "@/lib/billing/types";
import { IMAGE_JOB_RELEASED_MESSAGE, imageJobHasResults } from "./image-job-failure";
import { lockWallet, syncBalanceTx } from "./billing/repository";
import { assertMutableStagingTask, excludeImportedHistory, isImportedHistory } from "./staging-history";
import type { PoolClient } from "pg";
import { IMAGE_JOB_LEASE_MS, ImageJobLeaseLostError } from "./image-job-lease";
import { imageJobCleanupClient, reportImageJobCleanupFailure } from "./image-job-cleanup";
const billingService=createBillingService();
function billingOperation(row:{id:string;email:string;payload:{billingQuote:BillingQuote}},reason:string):OperationInput{return {id:row.id,email:row.email,quote:row.payload.billingQuote,reason,ledgerId:`led-image-${row.id}`,fingerprint:row.id};}

export type ImageJobKind = "generate" | "suite" | "aplus" | "imagegen";
export type ImageJobRow = { id: string; email: string; kind: ImageJobKind; snapshot: Record<string, unknown>; payload: Record<string, unknown>; lease_token: string | null; billing_settled: boolean };

export async function createImageJob(id: string, email: string, kind: ImageJobKind, snapshot: unknown, payload: unknown, cost: number, reserve: boolean, billingQuote?:BillingQuote) {
  await ensureSchema();
  const metered = billingQuote?.facts.metered ?? await creditMeteringEnabled();
  if (!billingQuote && metered && reserve) await expireDueBatches(email);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const frozenPayload={...(payload as object),...(billingQuote?{billingQuote}:{})};
    const context=currentCreationContext();
    if(context){const creation=await acceptCreationTx(client,`image:${kind}`,id,email,frozenPayload);Object.assign(frozenPayload,{creationScope:{...context,creationId:creation}});if(billingQuote&&creation)await creationLinkTx(client,creation,email.toLowerCase(),"billing",id);}
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
    WHERE email=$1 AND kind=$2 AND snapshot->>'status' NOT IN ('done','error','needs_attention') ORDER BY created_at DESC LIMIT 30`, [email.toLowerCase(), kind]);
  return rows;
}

export async function claimImageJob(id: string, kind: ImageJobKind): Promise<ImageJobRow | null> {
  await ensureSchema();
  if (await isImportedHistory(getPool(), "app_image_jobs", id)) return null;
  const tx=await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["naumi-image-job-queue:"+kind]);
    const {rows}=await tx.query(`UPDATE app_image_jobs SET lease_token=$3,lease_until=clock_timestamp()+$5*interval '1 millisecond'
      WHERE id=$1 AND kind=$2 AND (lease_until IS NULL OR lease_until<clock_timestamp())
      AND snapshot->>'status' NOT IN ('done','error','needs_attention')
      AND (SELECT count(*) FROM app_image_jobs active WHERE active.kind=$2 AND active.lease_token IS NOT NULL
        AND active.lease_until>now())<$4 RETURNING *`,[id,kind,randomUUID(),imageJobConcurrency(kind),IMAGE_JOB_LEASE_MS]);
    await tx.query("COMMIT");return rows[0]||null;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}

export async function heartbeatImageJob(id: string, token: string) {
  const tx = await getPool().connect();
  let disconnected: Error | undefined;
  let discard = false;
  const onError = (error: Error) => { disconnected = error; discard = true; };
  // pg-pool removes its idle listener while a client is checked out. Contain
  // socket errors here so the lease scheduler can retry instead of Node exiting.
  tx.on("error", onError);
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL lock_timeout='2s'");
    await tx.query("SET LOCAL statement_timeout='5s'");
    await tx.query("SELECT id FROM app_image_jobs WHERE id=$1 FOR UPDATE", [id]);
    await assertLeaseTx(tx, id, token);
    await tx.query(`UPDATE app_image_jobs SET lease_until=clock_timestamp()+$3*interval '1 millisecond' WHERE id=$1 AND lease_token=$2`, [id, token, IMAGE_JOB_LEASE_MS]);
    if (disconnected) throw disconnected;
    await tx.query("COMMIT");
  } catch (error) {
    if (!disconnected) await tx.query("ROLLBACK").catch(() => { discard = true; });
    throw error;
  } finally {
    try { tx.release(discard); } finally { tx.removeListener("error", onError); }
  }
}

/** Call AFTER acquiring the row lock. now() is transaction-start time, and an
 * UPDATE's predicate may run before a lock wait; neither fences a late writer.
 * Null is reserved for truly idle edits, not takeover of an expired owner. */
async function assertLeaseTx(tx: PoolClient, id: string, token: string | null) {
  const result = await tx.query(`SELECT 1 FROM app_image_jobs WHERE id=$1 AND
    (($2::text IS NOT NULL AND lease_token=$2 AND lease_until>clock_timestamp()) OR
     ($2::text IS NULL AND lease_token IS NULL AND (lease_until IS NULL OR lease_until<clock_timestamp())))`, [id, token]);
  if (!result.rowCount) throw new ImageJobLeaseLostError();
}

/** Last local preflight before paid work. Never holds a connection across I/O.
 * External acceptance still uses the frozen operation ID/checkpoint protocol. */
export async function assertImageJobLease(id: string, token: string) {
  const result = await getPool().query("SELECT 1 FROM app_image_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()", [id, token]);
  if (!result.rowCount) throw new ImageJobLeaseLostError();
}

export async function saveImageJob(id: string, snapshot: unknown, token: string | null) {
  const creation = currentCreationContext();
  // Persist the fallback before optional checkout, not after the connection has
  // already failed. Earlier admission/source evidence debt is not ours to clear.
  const earlierPending = creation?.evidencePending || (snapshot as Record<string, unknown> | null)?.creationEvidencePending === true;
  if (creation) snapshot = { ...(snapshot as Record<string, unknown>), creationEvidencePending: true };
  const savedSnapshot = JSON.stringify(snapshot);
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
  const tx=await getPool().connect();
  const cleanup = imageJobCleanupClient(tx);
  try {await tx.query("BEGIN");
  await tx.query("SELECT id FROM app_image_jobs WHERE id=$1 FOR UPDATE", [id]);
  await assertLeaseTx(tx, id, token);
  await tx.query(`UPDATE app_image_jobs SET snapshot=$2::jsonb,updated_at=now() WHERE id=$1`, [id, savedSnapshot]);
  await assertLeaseTx(tx, id, token);
  await tx.query("COMMIT");}catch(e){await cleanup.rollback("checkpoint-rollback");throw e;}finally{cleanup.release();}
  // Supplier acceptance and the execution checkpoint survive an evidence outage.
  // Recovery reads this same source snapshot; this flag never schedules paid work.
  if(creation){
    let evidenceCleanup: ReturnType<typeof imageJobCleanupClient> | undefined;
    try {
      // Checkout is optional too: the authoritative checkpoint already committed.
      const evidence=await getPool().connect();
      evidenceCleanup = imageJobCleanupClient(evidence);
      await evidence.query("BEGIN");
      const current = await evidence.query("SELECT id FROM app_image_jobs WHERE id=$1 AND snapshot=$2::jsonb FOR UPDATE", [id, savedSnapshot]);
      // Another checkpoint owns its own evidence. Do not downgrade it with this
      // older projection, even when both saves have the same valid lease token.
      if (!current.rowCount) { await evidence.query("COMMIT"); return; }
      await assertLeaseTx(evidence, id, token);
      await evidence.query("SAVEPOINT image_state_evidence");
      try {
        const recorded = await recordImageStateTx(evidence,id,snapshot);
        if (recorded && !earlierPending) {
          await evidence.query("UPDATE app_image_jobs SET snapshot=snapshot-'creationEvidencePending' WHERE id=$1 AND snapshot=$2::jsonb", [id, savedSnapshot]);
        }
      }
      catch (error) {
        reportImageJobCleanupFailure("checkpoint-evidence", error);
        await evidence.query("ROLLBACK TO SAVEPOINT image_state_evidence");
        // The main checkpoint already carries the durable fallback marker.
      }
      await assertLeaseTx(evidence, id, token);
      await evidence.query("COMMIT");
    } catch (error) {
      reportImageJobCleanupFailure("checkpoint-evidence", error);
      await evidenceCleanup?.rollback("evidence-rollback");
    } finally { evidenceCleanup?.release(); }
  }
}

/** Exact charge and full reservation release occur once in the same transaction. */
export async function settleImageJob(id: string, charged: number|BillingResult, reason: string, token: string | null) {
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
  const client = await getPool().connect();
  let email = "";
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE`, [id]);
    const row = rows[0];
    if (!row) throw new Error("任务不存在");
    email = row.email;
    if (!row.billing_settled) {
      await assertLeaseTx(client, id, token);
      if(row.payload.billingQuote){
        if(typeof charged==="number")throw new Error("新任务结算必须包含实际结果");
        const op=billingOperation(row,reason);
        const reserved=await client.query("SELECT 1 FROM app_billing_operations WHERE id=$1",[id]);
        if(reserved.rowCount){
          const settled=await billingService.settleTx(client,op,charged);
            if(charged.state==="unknown" || settled.state==="manual" || settled.state==="hold"){await assertLeaseTx(client,id,token);await client.query("COMMIT");return;}
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
      // Wallet/operation locks may outlast the lease after the first check.
      // Roll back the whole debit and reservation change, never just the flag.
      await assertLeaseTx(client, id, token);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await refreshBalance(email);
}

export async function reserveReviewedImageJob(id: string) {
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
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
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
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
  const { rows } = await getPool().query(`WITH waiting AS (SELECT id,kind,updated_at,
    row_number() OVER(PARTITION BY kind ORDER BY updated_at,id) AS lane_rank FROM app_image_jobs WHERE (lease_until IS NULL OR lease_until<now())
    AND (snapshot->>'status'='pending' OR (kind='imagegen' AND snapshot->>'status'='running') OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb)
    ${excludeImportedHistory("app_image_jobs")}), budgets AS (SELECT * FROM unnest($1::text[],$2::int[]) v(kind,capacity)),
    active AS (SELECT kind,count(*)::int n FROM app_image_jobs WHERE lease_token IS NOT NULL AND lease_until>now() GROUP BY kind)
    SELECT w.id,w.kind FROM waiting w JOIN budgets b ON b.kind=w.kind LEFT JOIN active a ON a.kind=w.kind
    WHERE w.lane_rank<=LEAST(32,GREATEST(0,b.capacity-COALESCE(a.n,0))) ORDER BY w.lane_rank,w.updated_at,w.id`,
    [IMAGE_JOB_KINDS,IMAGE_JOB_KINDS.map(imageJobConcurrency)]);
  return rows as {id:string;kind:ImageJobKind}[];
}

/** Keep an uncertain paid domain job visible to billing reconciliation. */
export async function holdImageJobBilling(id:string, token:string|null) {
  if(!dbEnabled)return;
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT id FROM app_image_jobs WHERE id=$1 FOR UPDATE", [id]);
    await assertLeaseTx(tx, id, token);
    await tx.query("UPDATE app_billing_operations SET state=CASE WHEN quote->'tariff'->'settlement'->>'unknown'='manual' THEN 'manual' ELSE 'hold' END,updated_at=now() WHERE id=$1 AND state='reserved'",[id]);
    await assertLeaseTx(tx, id, token);
    await tx.query("COMMIT");
  } catch(error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
}

/** Stop an undelivered operation without pretending its supplier cost is zero.
 * Serializes against settlement and other workers; only this job's remaining
 * reservation is released. Supplier calls and paid intent remain untouched. */
export async function failUndeliveredImageJob(id: string, token: string | null, reasonCode: string, diagnostic?:TaskFailureDiagnostic) {
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
  const tx = await getPool().connect();
  const cleanup = imageJobCleanupClient(tx);
  try {
    await tx.query("BEGIN");
    const row = (await tx.query("SELECT * FROM app_image_jobs WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row || row.billing_settled || ["done", "error"].includes(row.snapshot.status)) {
      await tx.query("COMMIT"); return false;
    }
    await assertLeaseTx(tx, id, token);
    if (imageJobHasResults(row.snapshot)) { await tx.query("COMMIT"); return false; }
    const hasSupplierLedger = (await tx.query("SELECT to_regclass('app_supplier_calls') IS NOT NULL AS present")).rows[0].present;
    if (hasSupplierLedger && (await tx.query("SELECT 1 FROM app_supplier_calls WHERE operation_id=$1 AND delivered>0 LIMIT 1", [id])).rowCount) {
      await tx.query("COMMIT"); return false;
    }
    let released = 0;
    const billing = (await tx.query("SELECT * FROM app_billing_operations WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (billing && ["settled", "released"].includes(billing.state)) { await tx.query("COMMIT"); return false; }
    if (billing) {
      released = Number((await tx.query("SELECT cost FROM app_gen_reservations WHERE job_id=$1 AND email=$2", [id, row.email])).rows[0]?.cost || 0);
      await billingService.releaseTx(tx, billingOperation(row, "图片未交付，释放预占积分"));
    } else {
      await lockWallet(tx, row.email);
      const reservation = (await tx.query("DELETE FROM app_gen_reservations WHERE job_id=$1 AND email=$2 RETURNING cost", [id, row.email])).rows[0];
      released = Number(reservation?.cost || 0);
      if (released) await tx.query("UPDATE app_users SET credits_used=GREATEST(credits_used-$2,0) WHERE email=$1", [row.email, released]);
      await syncBalanceTx(tx, row.email);
    }
    const proof = { reasonCode, customerOutcome: "failed", supplierOutcome: "unknown", supplierCost: "pending", releasedCredits: released };
    await tx.query("INSERT INTO app_billing_reconciliations(id,operation_id,email,actor,request_fingerprint,reason,proof,result,charge) VALUES($1,$2,$3,'system:image-job', $4,'图片未交付，释放预占积分',$5,$6::jsonb,0)",
      [`image-release-${id}`, id, row.email, `image-release-${id}`, JSON.stringify(proof), JSON.stringify({ state: "unknown", ...proof })]);
    await assertLeaseTx(tx, id, token);
    await tx.query(`UPDATE app_image_jobs SET snapshot=snapshot || $2::jsonb,billing_settled=true,reserved_cost=0,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1`,
      [id, JSON.stringify({ status: "error", error: IMAGE_JOB_RELEASED_MESSAGE, failureCode: reasonCode, ...(diagnostic?{failureDiagnostic:readTaskDiagnostic(diagnostic)}:{}), customerBilling: "released", supplierCostStatus: "pending", creditsReleased: released, stoppedAt: Date.now() })]);
    await tx.query("COMMIT"); return true;
  } catch (error) { await cleanup.rollback("failure-rollback"); throw error; }
  finally { cleanup.release(); }
}
