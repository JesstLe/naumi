import {reportAccountVisibleSql} from "../accounts/creation-policy";
import {ReportAccountHidden} from "../accounts/report-visibility";
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
import {readSupplierChainSlice} from "./chain-read";
import type {SupplierChainRead} from "./chain-contract";
import {reportCostJobSource,reportCostJobVisibleSql} from './report-visibility';

type CostTotals={calls:number;confirmed:number;pending:number;estimated:number;incomplete:number;cny_micros:string|null};
type CurrencyTotals={currency:string|null;reported_micros:string|null;estimated_micros:string|null;supplier_credits_micros:string|null};
const incomplete=(alias:string)=>`(${alias}.cny_micros IS NULL OR ${alias}.cost_status NOT IN('reported','reconciled') OR (${alias}.currency<>'CNY' AND ${alias}.fx->>'basis'='budget'))`;

export async function costsSummary(ledger: ReturnType<typeof createSupplierLedger>, f: CostFilter, tx?:PoolClient) {
  if(!tx)await ensureSupplierSchema(ledger.pool);
  const query=tx??ledger.pool;
  const { where, args } = costWhere(f,"c",true);
  // Filter calls once for counts and currencies. The qualifying operations are
  // ranked by their last call across the whole chain, even outside the filter.
  // Only the latest 500 chains need a full rollup; amounts stay decimal strings.
  const {stats,currencies,groups}=(await query.query<{stats:CostTotals;currencies:CurrencyTotals[];groups:any[]}>(`
    WITH matched AS MATERIALIZED (
      SELECT GROUPING(currency,operation_id) AS scope,currency,operation_id,count(*)::int AS calls,
        count(*) FILTER(WHERE cost_status IN('reported','reconciled'))::int AS confirmed,
        count(*) FILTER(WHERE cost_status='pending')::int AS pending,count(*) FILTER(WHERE cost_status='estimated')::int AS estimated,
        count(*) FILTER(WHERE ${incomplete("c")})::int AS incomplete,sum(cny_micros)::text AS cny_micros,
        sum(amount_micros) FILTER(WHERE cost_status IN('reported','reconciled'))::text AS reported_micros,
        sum(amount_micros) FILTER(WHERE cost_status='estimated')::text AS estimated_micros,
        sum(credits_micros)::text AS supplier_credits_micros
      FROM app_supplier_calls c ${where}
      GROUP BY GROUPING SETS ((),(currency),(operation_id))
    ), newest AS MATERIALIZED (
      SELECT m.operation_id,recent.started_at
      FROM matched m CROSS JOIN LATERAL (
        SELECT c.started_at FROM app_supplier_calls c WHERE c.operation_id=m.operation_id ORDER BY c.started_at DESC LIMIT 1
      ) recent
      WHERE m.scope=2 ORDER BY recent.started_at DESC,m.operation_id LIMIT 500
    ), chain_rollups AS (
      SELECT n.operation_id,n.started_at,full_chain.* FROM newest n CROSS JOIN LATERAL (
        SELECT min(c.user_email) AS user_email,min(c.feature) AS feature,count(*)::int AS calls,
          sum(c.cny_micros)::text AS cny_micros,count(*) FILTER(WHERE ${incomplete("c")})::int AS incomplete
        FROM app_supplier_calls c WHERE c.operation_id=n.operation_id AND ${reportAccountVisibleSql("c.user_email")}
      ) full_chain
    )
    SELECT
      (SELECT jsonb_build_object('calls',calls,'confirmed',confirmed,'pending',pending,'estimated',estimated,'incomplete',incomplete,'cny_micros',cny_micros)
       FROM matched WHERE scope=3) AS stats,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('currency',currency,'reported_micros',reported_micros,'estimated_micros',estimated_micros,
               'supplier_credits_micros',supplier_credits_micros) ORDER BY currency),'[]'::jsonb) FROM matched WHERE scope=1) AS currencies,
      (SELECT COALESCE(jsonb_agg(to_jsonb(g)-'started_at' ORDER BY started_at DESC,operation_id),'[]'::jsonb) FROM chain_rollups g) AS groups
  `,args)).rows[0];
  const ids = groups.map(g=>g.operation_id);
  const operations = ids.length ? (await query.query(`SELECT id,charged_credits,state,quote->'tariff'->'pricing'->'creditsPerCnyMicros' AS rate,
    CASE WHEN quote->'tariff'->>'unit'='image' AND jsonb_typeof(settlement_result->'items')='array' THEN
      (SELECT count(*)::int FROM jsonb_array_elements(settlement_result->'items') i WHERE i->>'state'='succeeded')
    ELSE 0 END AS delivered
    FROM app_billing_operations WHERE id=ANY($1::text[])`,[ids])).rows : [];
  const extra = ids.length ? (await query.query("SELECT operation_id,sum(amount_cny_micros)::text AS amount_cny_micros FROM app_supplier_variable_costs WHERE operation_id=ANY($1::text[]) GROUP BY operation_id",[ids])).rows : [];
  const operationsById=new Map(operations.map(op=>[op.id,op]));
  const extraByOperation=new Map<string,bigint>();
  for(const item of extra)extraByOperation.set(item.operation_id,(extraByOperation.get(item.operation_id)??BigInt(0))+BigInt(item.amount_cny_micros));
  let revenue = BigInt(0), charged = BigInt(0), unknownRevenue = 0, variable = BigInt(0),delivered=0;
  for (const g of groups) {
    const op = operationsById.get(g.operation_id), rate = op?.rate;
    const credits = BigInt(op?.charged_credits || 0); charged += credits;
    delivered+=op?.delivered??0;
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
  const jobs=(await tx.query(`SELECT j.key,j.kind,j.state,j.attempts,j.due_at,j.last_error,j.updated_at FROM ${reportCostJobSource} WHERE (j.last_error IS NOT NULL OR j.state='needs-attention') AND ${reportCostJobVisibleSql} ORDER BY j.updated_at DESC LIMIT 100`)).rows;
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
        case 'calls':return {...await ledger.list(f,tx,true,true),accounts:await accountLabels(tx)};
        case 'stats':return {stats:await costsSummary(ledger,f,tx),accounts:await accountLabels(tx)};
        case 'reconcile':return {...await reconciliation(tx),accounts:await accountLabels(tx)};
        case 'accounts':return {accounts:await accountSettings(tx)};
        default:return {...await ledger.list(f,tx,false,true),stats:await costsSummary(ledger,f,tx),accounts:await accountSettings(tx),...await reconciliation(tx)};
      }
  });
}

export function readSupplierAdminChain(ledger:ReturnType<typeof createSupplierLedger>,operation:string,signal:AbortSignal,input?:SupplierChainRead){
  return withSupplierCostRead(ledger.pool,signal,async tx=>{
    if(!input)return ledger.chain(operation,tx,true);
    const hidden=await tx.query(`SELECT 1 FROM app_supplier_calls c WHERE c.operation_id=$1 AND NOT (${reportAccountVisibleSql('c.user_email')}) UNION ALL SELECT 1 FROM app_billing_operations o WHERE o.id=$1 AND NOT (${reportAccountVisibleSql('o.email')}) LIMIT 1`,[operation]);
    if(hidden.rowCount)throw new ReportAccountHidden();
    return readSupplierChainSlice(tx,operation,input);
  });
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
