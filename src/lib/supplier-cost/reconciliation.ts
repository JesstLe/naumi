import "server-only";
import { randomUUID } from "node:crypto";
import { abs } from "./money";
import type { UsageItem } from "./adapters";
import type { createSupplierLedger } from "./repository";
import { costPolicy } from "./policy";
export async function reconcileUsage(ledger: ReturnType<typeof createSupplierLedger>, account: any, input: { start: string; end: string; items: UsageItem[]; total: unknown; evidence: unknown }) {
  const policy = costPolicy(account.policy), runId = randomUUID();
  return ledger.transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`supplier-usage:${account.id}`]);
    const local = (await tx.query(`SELECT lower(COALESCE(actual_model,model)) model,to_char(completed_at AT TIME ZONE $4,'YYYY-MM-DD') date,
      COALESCE(sum(amount_micros) FILTER(WHERE currency='USD' AND cost_status IN('reported','reconciled')),0)::text amount,
      COALESCE(sum(credits_micros) FILTER(WHERE cost_status IN('reported','reconciled')),0)::text credits,
      count(*) FILTER(WHERE cost_status IN('reported','reconciled') AND (amount_micros>0 OR credits_micros>0))::int requests,
      count(*) FILTER(WHERE cost_status NOT IN('reported','reconciled') OR credits_micros IS NULL OR NOT posting_time_known)::int pending
      FROM app_supplier_calls WHERE account_id=$1 AND completed_at >= $2 AND completed_at < $3 GROUP BY 1,2`, [account.id,input.start,input.end,policy.timezone])).rows;
    const unknownTime = (await tx.query("SELECT count(*)::int n FROM app_supplier_calls WHERE account_id=$1 AND (completed_at IS NULL OR NOT posting_time_known) AND started_at<$3 AND started_at>=$2", [account.id,input.start,input.end])).rows[0].n;
    await tx.query("INSERT INTO app_supplier_usage_runs(id,account_id,window_start,window_end,timezone,total,evidence) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)", [runId,account.id,input.start,input.end,policy.timezone,JSON.stringify(input.total),JSON.stringify(input.evidence)]);
    await tx.query("DELETE FROM app_supplier_usage_buckets WHERE account_id=$1 AND window_start=$2 AND window_end=$3", [account.id,input.start,input.end]);
    const byKey = new Map<string, UsageItem>(input.items.map(x=>[`${x.model.toLowerCase()}\0${x.date}`,x]));
    for (const row of local) if (!byKey.has(`${row.model}\0${row.date}`)) byKey.set(`${row.model}\0${row.date}`, { model: row.model, date: row.date, amountMicros: "0", creditsMicros: "0", requests: 0 });
    const output = [];
    for (const item of Array.from(byKey.values())) {
      const l = local.find(x=>x.model === item.model.toLowerCase() && x.date === item.date) || { amount:"0",credits:"0",requests:0,pending:0 };
      const delta = BigInt(item.amountMicros) - BigInt(l.amount), creditDelta = BigInt(item.creditsMicros) - BigInt(l.credits), pending = l.pending + unknownTime;
      const match = abs(delta)<=BigInt(policy.amountToleranceMicros) && abs(creditDelta)<=BigInt(policy.creditsToleranceMicros) && item.requests===l.requests;
      const status = pending ? "pending-local-costs" : match ? "matched" : delta>BigInt(0) || creditDelta>BigInt(0) ? "unattributed" : "mismatch";
      await tx.query(`INSERT INTO app_supplier_usage_buckets(account_id,window_start,window_end,model,date,run_id,remote_amount_micros,remote_credits_micros,remote_requests,local_amount_micros,local_credits_micros,local_requests,pending,status,amount_delta_micros,credits_delta_micros) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [account.id,input.start,input.end,item.model.toLowerCase(),item.date,runId,item.amountMicros,item.creditsMicros,item.requests,l.amount,l.credits,l.requests,pending,status,delta.toString(),creditDelta.toString()]);
      if (status === "matched") await tx.query(`UPDATE app_supplier_calls SET cost_status='reconciled',updated_at=now() WHERE account_id=$1 AND lower(COALESCE(actual_model,model))=$2 AND to_char(completed_at AT TIME ZONE $3,'YYYY-MM-DD')=$4 AND completed_at >= $5 AND completed_at < $6 AND cost_status='reported' AND posting_time_known`, [account.id,item.model.toLowerCase(),policy.timezone,item.date,input.start,input.end]);
      else await tx.query(`UPDATE app_supplier_calls SET cost_status='reported',updated_at=now() WHERE account_id=$1 AND lower(COALESCE(actual_model,model))=$2 AND to_char(completed_at AT TIME ZONE $3,'YYYY-MM-DD')=$4 AND completed_at >= $5 AND completed_at < $6 AND cost_status='reconciled'`,[account.id,item.model.toLowerCase(),policy.timezone,item.date,input.start,input.end]);
      output.push({ ...item, status, pending, amountDeltaMicros: delta.toString(), creditsDeltaMicros: creditDelta.toString() });
    }
    return { runId, buckets: output };
  });
}
