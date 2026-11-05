import {reserveLegacyTaskTx,settleLegacyTaskTx,clearTaskReservationTx,taskBillingExistsTx,holdTaskBillingTx,releaseUndeliveredTaskTx} from "@/lib/billing/task-settlement";
import {currentCreationContext} from "@/lib/saas/creation-scope";
import {readTaskDiagnostic,type TaskFailureDiagnostic} from "./imagegen/task-diagnostics";
import {acceptCreationTx,recordImageStateTx,creationLinkTx} from "./saas/creation-writer";
import "server-only";
import { randomUUID } from "node:crypto";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {creditMeteringEnabled} from "@/lib/billing/runtime";
import {refreshBalance, expireDueBatches} from "@/lib/billing/wallet-balance";
import {createBillingService} from "@/lib/billing/service";
import type {BillingQuote,BillingResult,OperationInput} from "@/lib/billing/types";
import { IMAGE_JOB_RELEASED_MESSAGE, imageJobHasResults } from "./image-job-failure";
import { assertMutableStagingTask } from "./staging-history";
import type { PoolClient } from "pg";
import { IMAGE_JOB_LEASE_MS, ImageJobLeaseLostError } from "./image-job-lease";
import { imageJobCleanupClient, reportImageJobCleanupFailure } from "./image-job-cleanup";
const billingService=createBillingService();
function billingOperation(row:{id:string;email:string;payload:{billingQuote:BillingQuote}},reason:string):OperationInput{return {id:row.id,email:row.email,quote:row.payload.billingQuote,reason,ledgerId:`led-image-${row.id}`,fingerprint:row.id};}

import type {ImageJobKind,ImageJobRow} from './image-jobs/types';
export type {ImageJobKind,ImageJobRow} from './image-jobs/types';
// Existing scripts retain this API;these are the same scheduling functions,not
// another implementation or writer.
export {claimImageJob,releaseImageJob,dueImageJobs} from './image-jobs/scheduling';

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
      await reserveLegacyTaskTx(client,{id,email:email.toLowerCase(),cost,metered:true,principalPolicy:"unexpired-total",insufficientMessage:"积分不足，请充值后重试"});
      await client.query("UPDATE app_image_jobs SET reserved_cost=$2 WHERE id=$1",[id,cost]);
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
        const reserved=await taskBillingExistsTx(client,id);
        if(reserved){
          const settled=await billingService.settleTx(client,op,charged);
            if(charged.state==="unknown" || settled.state==="manual" || settled.state==="hold"){await assertLeaseTx(client,id,token);await client.query("COMMIT");return;}
        }else if(charged.state!=="failed")throw new Error("任务尚未完成计费预占");
      }else{
      if(typeof charged!=="number")throw new Error("旧任务须按已保存价格恢复结算");
      const actual=Math.min(row.cost,Math.max(0,Math.trunc(charged)));
      await settleLegacyTaskTx(client,{email,charge:row.metered?actual:0,reservedCredits:row.metered?row.reserved_cost:0,ledgerId:`led-image-${id}`,reason,idempotency:"task-lock"});
      }
      await client.query(`UPDATE app_image_jobs SET billing_settled=true WHERE id=$1`, [id]);
      await clearTaskReservationTx(client,id);
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
      await reserveLegacyTaskTx(client,{id,email:row.email,cost:row.cost,metered:true,principalPolicy:"unexpired-total",insufficientMessage:"积分不足，请充值后重试"});
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

/** Keep an uncertain paid domain job visible to billing reconciliation. */
export async function holdImageJobBilling(id:string, token:string|null) {
  if(!dbEnabled)return;
  await assertMutableStagingTask(getPool(), "app_image_jobs", id);
  const tx = await getPool().connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT id FROM app_image_jobs WHERE id=$1 FOR UPDATE", [id]);
    await assertLeaseTx(tx, id, token);
    await holdTaskBillingTx(tx,id,"uncertain");
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
    const released=await releaseUndeliveredTaskTx(tx,{id,email:row.email,operation:billingOperation(row,"图片未交付，释放预占积分"),reasonCode});
    if(released===null){await tx.query("COMMIT");return false;}
    await assertLeaseTx(tx, id, token);
    await tx.query(`UPDATE app_image_jobs SET snapshot=snapshot || $2::jsonb,billing_settled=true,reserved_cost=0,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1`,
      [id, JSON.stringify({ status: "error", error: IMAGE_JOB_RELEASED_MESSAGE, failureCode: reasonCode, ...(diagnostic?{failureDiagnostic:readTaskDiagnostic(diagnostic)}:{}), customerBilling: "released", supplierCostStatus: "pending", creditsReleased: released, stoppedAt: Date.now() })]);
    await tx.query("COMMIT"); return true;
  } catch (error) { await cleanup.rollback("failure-rollback"); throw error; }
  finally { cleanup.release(); }
}
