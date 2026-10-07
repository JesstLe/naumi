import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { dbEnabled } from "../db";
import { supplierLedger } from "./runtime";
import { accountIdentity } from "./runtime";
import type { createSupplierLedger } from "./repository";
import { ensureSupplierSchema } from "./schema";
import { createCredentialStore } from "../model-config/credentials";
import { getAPIMartTask, queryAPIMartUsage } from "./apimart";
import { importRouterOperation } from "./router";
import { reconcileUsage } from "./reconciliation";
import { costPolicy } from "./policy";

export async function runSupplierCostWorker(ledger: ReturnType<typeof createSupplierLedger> = supplierLedger(), options: { fetcher?: typeof fetch; batch?: number } = {}) {
  await ensureSupplierSchema(ledger.pool);
  // Recover a process crash after task_id was durably stored but before the outbox enqueue.
  await ledger.pool.query(`INSERT INTO app_supplier_cost_jobs(key,kind,account_id,payload)
    SELECT 'task:'||c.id,'task',c.account_id,jsonb_build_object('callId',c.id)
    FROM app_supplier_calls c JOIN app_supplier_accounts a ON a.id=c.account_id
    WHERE c.task_id IS NOT NULL AND a.protocol IN('apimart-images','apimart') AND a.credential_ref IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM app_supplier_cost_jobs j WHERE j.key='task:'||c.id)
    ON CONFLICT(key) DO NOTHING`);
  const accounts = (await ledger.pool.query("SELECT * FROM app_supplier_accounts WHERE protocol IN('apimart-images','apimart') AND credential_ref IS NOT NULL AND usage_enabled")).rows;
  for (const account of accounts) {
    const p = costPolicy(account.policy);
    if (!account.last_usage_at || Date.now() - new Date(account.last_usage_at).getTime() >= p.intervalSeconds * 1000) await ledger.pool.query("INSERT INTO app_supplier_cost_jobs(key,kind,account_id,payload) VALUES($1,'usage',$2,'{}') ON CONFLICT(key) DO UPDATE SET state=CASE WHEN app_supplier_cost_jobs.state='done' THEN 'queued' ELSE app_supplier_cost_jobs.state END", [`usage:${account.id}`,account.id]);
  }
  const jobs = (await ledger.pool.query(`WITH due AS (SELECT key FROM app_supplier_cost_jobs WHERE state='queued' AND due_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY due_at LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE app_supplier_cost_jobs j SET lease_id=$2,lease_until=now()+interval '120 seconds',attempts=attempts+1,updated_at=now() FROM due WHERE j.key=due.key RETURNING j.*`, [Math.min(10,Math.max(1,options.batch||3)),randomUUID()])).rows;
  let processed = 0;
  for (const job of jobs) {
    let next: number | null = null, error: string | null = null;
    try {
      if (job.kind === "router") { const r = await importRouterOperation(ledger,job.payload,options.fetcher); if (!r.terminal) next = 60; }
      else {
        const account = (await ledger.pool.query("SELECT * FROM app_supplier_accounts WHERE id=$1", [job.account_id])).rows[0];
        if (!account?.credential_ref) throw new Error("original supplier credential unavailable");
        const key = await createCredentialStore(ledger.pool).read(account.credential_ref,account.provider_id), p = costPolicy(account.policy);
        if(accountIdentity(account.base_url,key)!==account.id)throw new Error("supplier account identity mismatch");
        if (job.kind === "task") {
          const call = (await ledger.pool.query("SELECT * FROM app_supplier_calls WHERE id=$1 AND account_id=$2", [job.payload.callId,account.id])).rows[0];
          if (!call?.task_id) throw new Error("original supplier task ID unavailable");
          const observed = new Date().toISOString();
          const receipt = await getAPIMartTask({ baseUrl:account.base_url,apiKey:key,taskId:call.task_id,fetcher:options.fetcher });
          await ledger.apply(call.id,receipt,observed);
          if (receipt.status === "pending" || !["completed","failed","cancelled","canceled"].includes(receipt.state)) next = p.taskRetrySeconds;
          else if (Date.now() - new Date(call.started_at).getTime() < p.taskRecheckDays * 86400000) next = Math.max(3600,p.taskRetrySeconds);
        } else if (job.kind === "usage") {
          // Reserve a per-Key query slot in PostgreSQL, honoring 60s cache and configured rate across workers/restarts.
          const queryKey=createHash('sha256').update(key).digest('hex');
          const reserved = (await ledger.pool.query(`INSERT INTO app_supplier_query_limits(key_hash,last_usage_at) VALUES($1,now()) ON CONFLICT(key_hash) DO UPDATE SET last_usage_at=now() WHERE app_supplier_query_limits.last_usage_at<now()-make_interval(secs=>$2) RETURNING key_hash`,[queryKey,Math.max(60,Math.ceil(60/p.keyQueriesPerMinute))])).rowCount;
          if (!reserved) next = 60;
          else {
            await ledger.pool.query("UPDATE app_supplier_accounts SET last_usage_at=now() WHERE id=$1",[account.id]);
            // Stable daily window, overlap on every run. Exclude current day until delay/cache window passes.
            const end = job.payload.end ? new Date(job.payload.end) : new Date(Math.floor((Date.now()-p.delaySeconds*1000)/3600000)*3600000);
            const start = job.payload.start ? new Date(job.payload.start) : new Date(end.getTime()-p.lookbackDays*86400000);
            const usage = await queryAPIMartUsage({ baseUrl:account.base_url,apiKey:key,start,end,timezone:p.timezone,fetcher:options.fetcher });
            await reconcileUsage(ledger,account,{start:start.toISOString(),end:end.toISOString(),...usage});
            next = p.intervalSeconds;
          }
        }
      }
      processed++;
    } catch (e) {
      // Only sanitized local messages/status categories; never persist supplier response bodies/keys.
      error = e instanceof Error && /^supplier-query-http-\d+$/.test(e.message) ? e.message : "费用补查未完成；请核对原凭据、接口与任务记录";
      next = Math.min(3600,60 * 2 ** Math.min(job.attempts,6));
    }
    await ledger.pool.query("UPDATE app_supplier_cost_jobs SET state=$3,due_at=now()+make_interval(secs=>$4),lease_id=NULL,lease_until=NULL,last_error=$5,attempts=CASE WHEN $5 IS NULL THEN 0 ELSE attempts END,updated_at=now() WHERE key=$1 AND lease_id=$2", [job.key,job.lease_id,error && job.attempts>=20 ? "needs-attention" : next==null ? "done" : "queued",next||0,error]);
  }
  return { processed, claimed:jobs.length };
}
export async function scanSupplierCostsOnce() { if (!dbEnabled) return 0; try { return (await runSupplierCostWorker()).processed; } catch { return 0; } }
