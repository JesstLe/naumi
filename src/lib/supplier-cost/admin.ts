import "server-only";
import { randomUUID } from "node:crypto";
import type { createSupplierLedger } from "./repository";
import type { CostFilter, FxSnapshot } from "./types";
import { ensureSupplierSchema } from "./schema";
import { fxSchema, policySchema } from "./policy";
import { MICRO } from "./money";
import type { Pool, PoolClient } from "pg";
import { costWhere } from "./call-filter";
import {checkReadClientSocket,withOwnedReportClient} from "@/platform/db/owned-read-client";

export async function costsSummary(ledger: ReturnType<typeof createSupplierLedger>, f: CostFilter, tx?:PoolClient) {
  if(!tx)await ensureSupplierSchema(ledger.pool);
  const query=tx??ledger.pool;
  const { where, args } = costWhere(f);
  const stats = (await query.query(`SELECT count(*)::int calls,count(*) FILTER(WHERE cost_status IN('reported','reconciled'))::int confirmed,
    count(*) FILTER(WHERE cost_status='pending')::int pending,count(*) FILTER(WHERE cost_status='estimated')::int estimated,
    count(*) FILTER(WHERE cny_micros IS NULL OR cost_status NOT IN('reported','reconciled') OR (currency<>'CNY' AND fx->>'basis'='budget'))::int incomplete,
    sum(cny_micros)::text cny_micros,COALESCE(sum(delivered),0)::text delivered
    FROM app_supplier_calls c ${where}`,args)).rows[0];
  const currencies = (await query.query(`SELECT currency,sum(amount_micros) FILTER(WHERE cost_status IN('reported','reconciled'))::text reported_micros,
    sum(amount_micros) FILTER(WHERE cost_status='estimated')::text estimated_micros,sum(credits_micros)::text supplier_credits_micros FROM app_supplier_calls c ${where} GROUP BY currency`,args)).rows;
  // Filters select operations; margins always include their WHOLE supplier chain, not just one cheap stage/model.
  const groups = (await query.query(`WITH selected AS (SELECT DISTINCT operation_id FROM app_supplier_calls c ${where}) SELECT operation_id,min(user_email) user_email,min(feature) feature,count(*)::int calls,
    sum(cny_micros)::text cny_micros,count(*) FILTER(WHERE cny_micros IS NULL OR cost_status NOT IN('reported','reconciled') OR (currency<>'CNY' AND fx->>'basis'='budget'))::int incomplete FROM app_supplier_calls c WHERE operation_id IN(SELECT operation_id FROM selected) GROUP BY operation_id ORDER BY max(started_at) DESC LIMIT 500`,args)).rows;
  const ids = groups.map(g=>g.operation_id);
  const operations = ids.length ? (await query.query("SELECT id,charged_credits,quote,state,settlement_result FROM app_billing_operations WHERE id=ANY($1::text[])",[ids])).rows : [];
  const extra = ids.length ? (await query.query("SELECT operation_id,amount_cny_micros FROM app_supplier_variable_costs WHERE operation_id=ANY($1::text[])",[ids])).rows : [];
  const operationsById=new Map(operations.map(op=>[op.id,op]));
  const extraByOperation=new Map<string,bigint>();
  for(const item of extra)extraByOperation.set(item.operation_id,(extraByOperation.get(item.operation_id)??BigInt(0))+BigInt(item.amount_cny_micros));
  let revenue = BigInt(0), charged = BigInt(0), unknownRevenue = 0, variable = BigInt(0),delivered=0;
  for (const g of groups) {
    const op = operationsById.get(g.operation_id), rate = op?.quote?.tariff?.pricing?.creditsPerCnyMicros;
    const credits = BigInt(op?.charged_credits || 0); charged += credits;
    if(op?.quote?.tariff?.unit==='image'&&Array.isArray(op?.settlement_result?.items))delivered+=op.settlement_result.items.filter((i:any)=>i.state==='succeeded').length;
    const known = op?.state === "settled" && typeof rate === "string" && /^\d+$/.test(rate) && BigInt(rate)>BigInt(0);
    g.chargedCredits = credits.toString(); g.revenueCnyMicros = known ? ((credits*MICRO*MICRO+BigInt(rate)/BigInt(2))/BigInt(rate)).toString() : null;
    if (known) revenue += BigInt(g.revenueCnyMicros); else unknownRevenue++;
    g.variableCnyMicros = (extraByOperation.get(g.operation_id)??BigInt(0)).toString(); variable+=BigInt(g.variableCnyMicros);
    g.marginStatus = g.incomplete || !known ? "暂估／数据未齐" : "已确认";
    g.apiSpreadCnyMicros = known&&g.cny_micros!=null ? (BigInt(g.revenueCnyMicros)-BigInt(g.cny_micros)).toString() : null;
    g.contributionCnyMicros = g.apiSpreadCnyMicros!=null ? (BigInt(g.apiSpreadCnyMicros)-BigInt(g.variableCnyMicros)).toString() : null;
  }
  const marginCost=groups.reduce((s,g)=>s+BigInt(g.cny_micros||0),BigInt(0)),hasCost=groups.some(g=>g.cny_micros!=null),hasIncome=groups.some(g=>g.revenueCnyMicros!=null);
  return { ...stats,delivered:String(delivered),currencies,groups,marginCostCnyMicros:hasCost?marginCost.toString():null,chargedCredits:charged.toString(),revenueCnyMicros:hasIncome?revenue.toString():null,unknownRevenue,variableCnyMicros:variable.toString(),marginStatus:groups.some(g=>g.incomplete)||unknownRevenue||groups.length>=500?"暂估／数据未齐":"已确认",apiSpreadCnyMicros:hasCost&&hasIncome?(revenue-marginCost).toString():null,contributionCnyMicros:hasCost&&hasIncome?(revenue-marginCost-variable).toString():null,incomeBasis:"冻结积分兑换规则的计价收入；赠送积分和充值现金收入不是同一口径",profitScope:"调用次数和原币汇总遵循筛选；交付、收入及利润使用所选操作的完整调用链。最多最近500个操作，达到上限时标为暂估" };
}
const accountLabels=async(tx:PoolClient)=>(await tx.query("SELECT id,label FROM app_supplier_accounts ORDER BY label,id")).rows;
const accountSettings=async(tx:PoolClient)=>(await tx.query("SELECT id,provider_id,protocol,label,fx,policy,usage_enabled,last_usage_at,updated_at,credential_ref IS NOT NULL AS query_configured FROM app_supplier_accounts ORDER BY label,id")).rows;
async function reconciliation(tx:PoolClient) {
  const anomalies=(await tx.query(`SELECT b.* FROM app_supplier_usage_buckets b JOIN (SELECT DISTINCT ON(account_id) id FROM app_supplier_usage_runs ORDER BY account_id,fetched_at DESC) r ON r.id=b.run_id WHERE b.status<>'matched' ORDER BY b.updated_at DESC LIMIT 200`)).rows;
  const jobs=(await tx.query("SELECT key,kind,state,attempts,due_at,last_error,updated_at FROM app_supplier_cost_jobs WHERE last_error IS NOT NULL OR state='needs-attention' ORDER BY updated_at DESC LIMIT 100")).rows;
  return {anomalies,jobs};
}

export type SupplierAdminView='calls'|'stats'|'reconcile'|'accounts';
function withSupplierCostRead<T>(pool:Pool,signal:AbortSignal,read:(tx:PoolClient)=>Promise<T>){
  // Startup prepares both ledgers; a dashboard GET must not run schema DDL.
  return withOwnedReportClient(pool,async tx=>{
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'"+checkReadClientSocket);
    const result=await read(tx);await tx.query("COMMIT");return result;
  },signal);
}

/** One read-only snapshot/client per request. Wait only for the selected view. */
export async function readSupplierAdmin(ledger:ReturnType<typeof createSupplierLedger>,f:CostFilter,view:SupplierAdminView|undefined,signal:AbortSignal) {
  return withSupplierCostRead(ledger.pool,signal,async tx=>{
      switch(view){
        case 'calls':return {...await ledger.list(f,tx,true),accounts:await accountLabels(tx)};
        case 'stats':return {stats:await costsSummary(ledger,f,tx),accounts:await accountLabels(tx)};
        case 'reconcile':return {...await reconciliation(tx),accounts:await accountLabels(tx)};
        case 'accounts':return {accounts:await accountSettings(tx)};
        default:return {...await ledger.list(f,tx),stats:await costsSummary(ledger,f,tx),accounts:await accountSettings(tx),...await reconciliation(tx)};
      }
  });
}

export function readSupplierAdminChain(ledger:ReturnType<typeof createSupplierLedger>,operation:string,signal:AbortSignal){
  return withSupplierCostRead(ledger.pool,signal,tx=>ledger.chain(operation,tx));
}
export async function updateAccount(ledger: ReturnType<typeof createSupplierLedger>, input: { id:string; fx:FxSnapshot|null; policy:unknown; usageEnabled:boolean }, actor:string) {
  const fx=input.fx==null?null:fxSchema.parse(input.fx),policy=policySchema.parse(input.policy);
  return ledger.transaction(async tx=>{
    const old=(await tx.query("SELECT fx,policy,usage_enabled FROM app_supplier_accounts WHERE id=$1 FOR UPDATE",[input.id])).rows[0];if(!old)throw new Error("供应商账户不存在");
    await tx.query("UPDATE app_supplier_accounts SET fx=$2::jsonb,policy=$3::jsonb,usage_enabled=$4,updated_by=$5,updated_at=now() WHERE id=$1",[input.id,JSON.stringify(fx),JSON.stringify(policy),input.usageEnabled,actor]);
    await tx.query("INSERT INTO app_supplier_admin_audit(id,actor,action,target,changes) VALUES($1,$2,'account-config',$3,$4::jsonb)",[randomUUID(),actor,input.id,JSON.stringify({before:old,after:{fx,policy,usageEnabled:input.usageEnabled}})]);
    return {updated:true,appliesTo:"新调用；历史成本保持其换算快照"};
  });
}
