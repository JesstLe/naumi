import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {currentCreationContext} from "@/lib/saas/creation-context";
import {acceptCreationTx,creationLinkTx} from "@/lib/saas/creation-writer";
import {ensureCreationSchema} from "@/lib/saas/creation-schema";
import {durableCreationOutcomeTx} from "@/lib/saas/creation-writer";
import {creditMeteringEnabled} from "@/lib/billing/runtime";
import {deductPrincipalFIFO,expireDueBatches,refreshBalance} from "@/lib/billing/wallet-balance";
import {reserveTaskBillingTx,settleTaskBillingTx,canvasRequestFingerprint} from "@/lib/billing/task-operation";
import {BillingError} from "@/lib/billing/types";
import {mapCanvasImageTask,type CanvasImageTaskRow} from "./image-task-records";

/**
 * Idempotently creates an image task and its credit reservation in one DB
 * transaction. The advisory lock serializes concurrent requests carrying the
 * same operation id, so only the creator can reserve credits or own cleanup.
 */
export async function createCanvasImageTaskWithReservation(input: {
  billingQuote?:import("@/lib/billing/types").BillingQuote;
  id: string;
  email: string;
  sourceArtworkId: string;
  parameters: unknown;
  cost: number;
  metered: boolean;
}): Promise<{ task: CanvasImageTaskRow; created: boolean }> {
  await ensureSchema();
  if(currentCreationContext())await ensureCreationSchema();
  const email = input.email.toLowerCase();
  const requestHash=canvasRequestFingerprint(input);
  if (!input.billingQuote && input.metered && input.cost > 0) await expireDueBatches(email);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`canvas-image-task:${input.id}`]);
    const existing = await client.query(
      `SELECT * FROM app_canvas_image_tasks WHERE email = $1 AND id = $2`,
      [email, input.id]
    );
    if (existing.rows[0]) {
      if(input.billingQuote&&existing.rows[0].billing_request_fingerprint&&existing.rows[0].billing_request_fingerprint!==requestHash)throw new BillingError("OPERATION_CONFLICT","操作编号已用于不同任务",409);
      await client.query("COMMIT");
      return { task: mapCanvasImageTask(existing.rows[0] as Record<string, unknown>), created: false };
    }
    const scope=currentCreationContext(),parameters={...(input.parameters as Record<string,unknown>||{})};
    if(scope){const creation=await acceptCreationTx(client,'canvas-image',input.id,email,{sourceArtworkId:input.sourceArtworkId,prompt:String(parameters.newText||''),parameters});Object.assign(parameters,{creationScope:{...scope,creationId:creation}});if(creation&&input.billingQuote)await creationLinkTx(client,creation,email,'billing',input.id);if(creation&&!input.billingQuote&&input.cost===0)await creationLinkTx(client,creation,email,'no-charge',input.id,'explicit-no-charge');}
    if(input.billingQuote){await reserveTaskBillingTx(client,input.id,email,input.billingQuote,`led-canvas-image-${input.id}`);}else if (input.metered && input.cost > 0) {
      const reserved = await client.query(
        `UPDATE app_users u
            SET credits_used = credits_used + $2
          WHERE u.email = $1
            AND (SELECT COALESCE(SUM(remaining),0) FROM app_credit_batches b
                  WHERE b.email = u.email AND b.expires_at > now() AND b.remaining > 0)
                - u.credits_used >= $2`,
        [email, input.cost]
      );
      if ((reserved.rowCount ?? 0) === 0) throw new Error("积分不足，请升级方案后重试");
    }
    if(!input.billingQuote)await client.query(
      `INSERT INTO app_gen_reservations (job_id, email, cost) VALUES ($1, $2, $3)`,
      [input.id, email, input.cost]
    );
    const created = await client.query(
      `INSERT INTO app_canvas_image_tasks
         (id, email, kind, source_artwork_id, parameters, cost,billing_quote,billing_request_fingerprint)
       VALUES ($1,$2,'text-edit',$3,$4::jsonb,$5,$6::jsonb,$7)
       RETURNING *`,
      [input.id, email, input.sourceArtworkId, JSON.stringify(parameters), input.cost,input.billingQuote?JSON.stringify(input.billingQuote):null,requestHash]
    );
    await client.query("COMMIT");
    return { task: mapCanvasImageTask(created.rows[0] as Record<string, unknown>), created: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Complete + exact charge + deterministic ledger in one transaction. */
export async function completeCanvasImageTask(input: {
  id: string;
  email: string;
  resultArtworkId: string;
}): Promise<void> {
  await ensureSchema();
  const email = input.email.toLowerCase();
  let meterOn = false;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ status: string; cost: number;billing_quote?:import("@/lib/billing/types").BillingQuote;parameters?:any }>(
      `SELECT status, cost,billing_quote,parameters FROM app_canvas_image_tasks WHERE email = $1 AND id = $2 FOR UPDATE`,
      [email, input.id]
    );
    const task = locked.rows[0];
    meterOn=task?.billing_quote?.facts.metered??await creditMeteringEnabled(client);
    if (!task) throw new Error("图片编辑任务不存在");
    let billingPending=false;
    if(task.billing_quote&&task.status!=="completed"){const settled=await settleTaskBillingTx(client,input.id,email,task.billing_quote,`led-canvas-image-${input.id}`,{state:"succeeded",items:[{id:input.id,state:"succeeded",executedQuality:task.parameters?.qualityAudit?.executed||task.billing_quote.facts.quality}]});billingPending=settled.state==="manual"||settled.state==="hold";}else if (!task.billing_quote&&task.status !== "completed" && meterOn && Number(task.cost) > 0) {
      const ledgerId = `led-canvas-image-${input.id}`;
      const seen = await client.query(`SELECT 1 FROM app_ledger WHERE id = $1`, [ledgerId]);
      if (!(seen.rowCount ?? 0)) {
        await deductPrincipalFIFO(client, email, Number(task.cost));
        await client.query(
          `UPDATE app_users SET credits_used = GREATEST(credits_used - $2, 0) WHERE email = $1`,
          [email, Number(task.cost)]
        );
        await client.query(
          `INSERT INTO app_ledger (id, email, delta, reason, kind)
           VALUES ($1,$2,$3,'画布在线改字','consume')`,
          [ledgerId, email, -Number(task.cost)]
        );
      }
    }
    await client.query(
      `UPDATE app_canvas_image_tasks SET status = 'completed', progress = 100,
          result_artwork_id = $3, error = '', lease_until = NULL,
          completed_at = now(), updated_at = now()
        WHERE email = $1 AND id = $2`,
      [email, input.id, input.resultArtworkId]
    );
    if(!billingPending) await client.query(`DELETE FROM app_gen_reservations WHERE job_id = $1`, [input.id]);
    await durableCreationOutcomeTx(client,'canvas-image',input.id,email,'succeeded',[input.resultArtworkId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (meterOn) await refreshBalance(email).catch(() => {});
}

export async function failCanvasImageTask(input: { id: string; email: string; error: string }): Promise<void> {
  await ensureSchema();
  const email = input.email.toLowerCase();
  let meterOn = false;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ status: string; cost: number; credits_refunded: boolean;billing_quote?:import("@/lib/billing/types").BillingQuote }>(
      `SELECT status, cost, credits_refunded,billing_quote FROM app_canvas_image_tasks
        WHERE email = $1 AND id = $2 FOR UPDATE`,
      [email, input.id]
    );
    const task = locked.rows[0];
    meterOn=task?.billing_quote?.facts.metered??await creditMeteringEnabled(client);
    if (!task) throw new Error("图片编辑任务不存在");
    if(task.billing_quote&&task.status!=="completed"){await settleTaskBillingTx(client,input.id,email,task.billing_quote,`led-canvas-image-${input.id}`,{state:"failed",items:[]});}else if (!task.billing_quote&&task.status !== "completed" && !task.credits_refunded && meterOn && Number(task.cost) > 0) {
      await client.query(
        `UPDATE app_users SET credits_used = GREATEST(credits_used - $2, 0) WHERE email = $1`,
        [email, Number(task.cost)]
      );
    }
    if (task.status !== "completed") {
      await client.query(
        `UPDATE app_canvas_image_tasks SET status = 'failed', error = $3,
            credits_refunded = true, lease_until = NULL, updated_at = now()
          WHERE email = $1 AND id = $2`,
        [email, input.id, input.error.slice(0, 1000)]
      );
    }
    await client.query(`DELETE FROM app_gen_reservations WHERE job_id = $1`, [input.id]);
    await durableCreationOutcomeTx(client,'canvas-image',input.id,email,'failed');
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
