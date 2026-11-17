import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { ensureSupplierSchema } from "./schema";
import { multiplyMicros } from "./money";
import { assertMutableStagingTask } from "../staging-history";
import type { AccountInput, CallInput, CostReceipt, CostFilter, FxSnapshot } from "./types";
import { costWhere } from "./call-filter";
import {readSupplierChainBilling} from "./chain-read";

export function createSupplierLedger(pool: Pool) {
  const transaction = async <T>(run: (tx: PoolClient) => Promise<T>) => { await ensureSupplierSchema(pool); const tx = await pool.connect(); try { await tx.query("BEGIN"); const v = await run(tx); await tx.query("COMMIT"); return v; } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); } };
  const snapshot = (r: any) => ({ amountMicros: r.amount_micros, creditsMicros: r.credits_micros, currency: r.currency, cnyMicros: r.cny_micros, status: r.cost_status, source: r.evidence });
  const api = {
    pool, transaction,
    async account(input: AccountInput) {
      await ensureSupplierSchema(pool);
      const row=(await pool.query(`INSERT INTO app_supplier_accounts(id,provider_id,protocol,base_url,credential_ref,label,usage_enabled) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET
        provider_id=CASE WHEN app_supplier_accounts.credential_ref IS NULL AND EXCLUDED.credential_ref IS NOT NULL THEN EXCLUDED.provider_id ELSE app_supplier_accounts.provider_id END,
        credential_ref=COALESCE(app_supplier_accounts.credential_ref,EXCLUDED.credential_ref),
        protocol=CASE WHEN EXCLUDED.protocol IN('apimart-images','apimart') THEN EXCLUDED.protocol ELSE app_supplier_accounts.protocol END
        WHERE app_supplier_accounts.base_url=EXCLUDED.base_url RETURNING *`, [input.id,input.providerId,input.protocol,input.baseUrl,input.credentialRef||null,input.label||input.providerId,["apimart-images","apimart"].includes(input.protocol)])).rows[0];
      if(!row)throw new Error("supplier account protocol conflict");return row;
    },
    async begin(input: CallInput) {
      return transaction(async tx => {
        await assertMutableStagingTask(tx, "app_billing_operations", input.operationId);
        await assertMutableStagingTask(tx, "app_image_jobs", input.operationId);
        await assertMutableStagingTask(tx, "app_canvas_image_tasks", input.operationId);
        await assertMutableStagingTask(tx, "app_video_tasks", input.operationId);
        const account = (await tx.query("SELECT fx FROM app_supplier_accounts WHERE id=$1", [input.accountId])).rows[0];
        if (!account) throw new Error("supplier account missing");
        if(input.taskId){
          await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`supplier-task:${input.accountId}:${input.taskId}`]);
          const existing=(await tx.query("SELECT * FROM app_supplier_calls WHERE account_id=$1 AND task_id=$2",[input.accountId,input.taskId])).rows[0];
          if(existing){if(existing.operation_id!==input.operationId||(existing.user_email||null)!==(input.userEmail||null))throw new Error("supplier task belongs to another operation");return existing;}
        }
        const row = (await tx.query(`INSERT INTO app_supplier_calls(id,operation_id,order_id,user_email,feature,public_model_id,attempt_id,account_id,provider_id,model,phase,parent_call_id,matched_rule_id,model_version,billing_version,procurement,fx,started_at,bi_call_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19) ON CONFLICT(account_id,attempt_id) DO NOTHING RETURNING *`, [input.id||randomUUID(),input.operationId,input.orderId||null,input.userEmail||null,input.feature,input.publicModelId||null,input.attemptId,input.accountId,input.providerId,input.model,input.phase,input.parentCallId||null,input.matchedRuleId||null,input.modelVersion||null,input.billingVersion||null,JSON.stringify(input.procurement||null),JSON.stringify(input.fx ?? account.fx),input.startedAt||new Date().toISOString(),input.biCallId||null])).rows[0] || (await tx.query("SELECT * FROM app_supplier_calls WHERE account_id=$1 AND attempt_id=$2", [input.accountId,input.attemptId])).rows[0];
        if (row.operation_id !== input.operationId || row.model !== input.model || row.phase !== input.phase || (row.user_email || null) !== (input.userEmail || null)) throw new Error("supplier attempt identity conflict");
        if(input.taskId)await tx.query("UPDATE app_supplier_calls SET task_id=$2 WHERE id=$1",[row.id,input.taskId]);return row;
      });
    },
    async apply(callId: string, receipt: CostReceipt, observedAt = new Date().toISOString()) {
      return transaction(async tx => {
        await assertMutableStagingTask(tx, "app_supplier_calls", callId);
        const row = (await tx.query("SELECT * FROM app_supplier_calls WHERE id=$1 FOR UPDATE", [callId])).rows[0];
        if (!row) throw new Error("supplier call missing");
        if(receipt.source==='router-durable-receipt' && row.evidence?.source==='apimart-task-query')return row;
        if (receipt.taskId && row.task_id && receipt.taskId !== row.task_id) throw new Error("supplier task identity conflict");
        if (row.last_observed_at && new Date(row.last_observed_at).getTime() > Date.parse(observedAt)) return row;
        const reported = receipt.status === "reported" && receipt.amountMicros != null;
        // A late response without amounts cannot erase a supplier-confirmed amount.
        const hasReported = ["reported","reconciled"].includes(row.cost_status);
        const replace = reported || !hasReported && receipt.amountMicros != null;
        const amount = replace ? receipt.amountMicros : row.amount_micros;
        const currency = replace ? receipt.currency : row.currency;
        const credits = receipt.creditsMicros ?? row.credits_micros;
        const fx = row.fx as FxSnapshot | null;
        const cny = amount == null ? null : amount === "0" ? "0" : currency === "CNY" ? amount : fx && fx.currency === currency ? multiplyMicros(amount, fx.rateMicros) : null;
        const sameReported=reported&&row.amount_micros===amount&&row.currency===currency&&row.credits_micros===credits;
        const status = reported ? sameReported&&row.cost_status==='reconciled'?'reconciled':"reported" : hasReported ? row.cost_status : receipt.amountMicros != null ? receipt.status : row.cost_status;
        const changed = hasReported && reported && (row.amount_micros !== amount || row.currency !== currency || row.credits_micros !== credits);
        if (changed || reported&&row.cost_status==='estimated') await tx.query("INSERT INTO app_supplier_cost_adjustments(id,call_id,kind,before_receipt,after_receipt,reason,actor) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,'supplier-query')", [randomUUID(),callId,row.cost_status==='estimated'?'estimate-replaced':BigInt(amount!) < BigInt(row.amount_micros) ? "refund-or-reduction" : "revision",JSON.stringify(snapshot(row)),JSON.stringify({ amountMicros: amount, currency, creditsMicros: credits, cnyMicros: cny, status, evidence: receipt.evidence }),receipt.source]);
        if(receipt.outputs){
          if(receipt.outputs.length>1000)throw new Error('supplier output mapping exceeds limit');
          for(const output of receipt.outputs)await tx.query(`INSERT INTO app_supplier_call_outputs(call_id,output_index,supplier_ref_hash,state) VALUES($1,$2,$3,$4) ON CONFLICT(call_id,output_index) DO UPDATE SET supplier_ref_hash=COALESCE(EXCLUDED.supplier_ref_hash,app_supplier_call_outputs.supplier_ref_hash),state=EXCLUDED.state,updated_at=now()`,[callId,output.index,output.supplierRefHash||null,output.state]);
        }
        return (await tx.query(`UPDATE app_supplier_calls SET state=$2,task_id=COALESCE($3,task_id),request_id=COALESCE($4,request_id),actual_model=COALESCE($5,actual_model),amount_micros=$6,currency=$7,credits_micros=$8,cny_micros=$9,cost_status=$10,usage=COALESCE($11::jsonb,usage),evidence=CASE WHEN $18 OR cost_status NOT IN('reported','reconciled') THEN $12::jsonb ELSE evidence END,completed_at=COALESCE($13,completed_at),posting_time_known=posting_time_known OR $14,delivered=COALESCE($15,delivered),cost_confirmed_at=CASE WHEN $16 THEN COALESCE(cost_confirmed_at,now()) ELSE cost_confirmed_at END,last_observed_at=$17,updated_at=now() WHERE id=$1 RETURNING *`, [callId,receipt.state,receipt.taskId||null,receipt.requestId||null,receipt.actualModel||null,amount,currency,credits,cny,status,JSON.stringify(receipt.usage||null),JSON.stringify({ ...receipt.evidence, source: receipt.source }),receipt.completedAt||null,!!receipt.postingTimeKnown,receipt.delivered??null,reported,observedAt,replace])).rows[0];
      });
    },
    async task(accountId: string, taskId: string) { await ensureSupplierSchema(pool); return (await pool.query("SELECT * FROM app_supplier_calls WHERE account_id=$1 AND task_id=$2", [accountId,taskId])).rows[0]; },
    async enqueue(key: string, kind: "task" | "router" | "usage", payload: unknown, accountId?: string, tx?: PoolClient) {
      await ensureSupplierSchema(pool);
      await assertMutableStagingTask(tx || pool, "app_supplier_cost_jobs", key);
      await (tx || pool).query(`INSERT INTO app_supplier_cost_jobs(key,kind,payload,account_id) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(key) DO UPDATE SET due_at=LEAST(app_supplier_cost_jobs.due_at,now()),state=CASE WHEN app_supplier_cost_jobs.lease_until>now() THEN app_supplier_cost_jobs.state ELSE 'queued' END,updated_at=now()`, [key,kind,JSON.stringify(payload),accountId||null]);
    },
    async list(f: CostFilter = {}, tx?:PoolClient, brief=false) {
      if(!tx)await ensureSupplierSchema(pool);
      const query=tx??pool,{where,args}=costWhere(f);
      const columns=brief?'id,operation_id,user_email,feature,phase,public_model_id,actual_model,model,account_id,provider_id,state,cost_status,amount_micros,credits_micros,currency,cny_micros,started_at,completed_at,fx->>\'basis\' AS fx_basis':'c.*';
      const total = (await query.query(`SELECT count(*)::int n FROM app_supplier_calls c ${where}`, args)).rows[0].n;
      const offset=(Math.max(1,f.page||1)-1)*50;
      // Late pages still support arbitrary page numbers. Sort only keys before
      // fetching the 50 visible rows, including the wide legacy projection.
      const rows = (await query.query(offset<500
        ? `SELECT ${columns} FROM app_supplier_calls c ${where} ORDER BY started_at DESC,id LIMIT 50 OFFSET $${args.length+1}`
        : `WITH page AS MATERIALIZED (
             SELECT id AS page_id,started_at AS page_at FROM app_supplier_calls c ${where}
             ORDER BY started_at DESC,id LIMIT 50 OFFSET $${args.length+1}
           ) SELECT ${columns} FROM page JOIN app_supplier_calls c ON c.id=page.page_id ORDER BY page.page_at DESC,page.page_id`,
        [...args,offset])).rows;
      return { rows, total };
    },
    async chain(operation: string,tx?:PoolClient) {
      if(!tx)await ensureSupplierSchema(pool);
      const sql=tx??pool;
      const rows = (await sql.query("SELECT * FROM app_supplier_calls WHERE operation_id=$1 ORDER BY started_at,id", [operation])).rows;
      const adjustments = (await sql.query("SELECT a.* FROM app_supplier_cost_adjustments a JOIN app_supplier_calls c ON c.id=a.call_id WHERE c.operation_id=$1 ORDER BY a.created_at", [operation])).rows;
      const outputs=(await sql.query("SELECT o.* FROM app_supplier_call_outputs o JOIN app_supplier_calls c ON c.id=o.call_id WHERE c.operation_id=$1 ORDER BY o.call_id,o.output_index",[operation])).rows;
      const billing=await readSupplierChainBilling(sql,operation);
      const feeReviews=(await sql.query("SELECT * FROM app_billing_api_cost_reviews WHERE operation_id=$1 ORDER BY created_at",[operation])).rows;
      return { rows, adjustments,outputs,billing,feeReviews };
    },
  };
  return api;
}
