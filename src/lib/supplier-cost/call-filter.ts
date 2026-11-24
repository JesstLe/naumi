import {reportAccountVisibleSql} from "../accounts/creation-policy";
import type { CostFilter } from "./types";

export function costWhere(f: CostFilter, alias = "c", ordinaryReport=false) {
  const where: string[] = [], args: unknown[] = [];
  for (const [key,column] of [["email","user_email"],["feature","feature"],["publicModel","public_model_id"],["model","model"],["operation","operation_id"],["order","order_id"],["account","account_id"],["status","cost_status"]] as const) if (f[key]) {
    args.push(f[key]); where.push(`${key==='model'?`COALESCE(${alias}.actual_model,${alias}.model)`:`${alias}.${column}`}=$${args.length}`);
  }
  for (const [key,operator] of [["from",">="],["to","<"]] as const) if (f[key]) { args.push(f[key]); where.push(`${alias}.started_at ${operator} $${args.length}`); }
  if(ordinaryReport)where.push(reportAccountVisibleSql(`${alias}.user_email`));
  return { where: where.length ? "WHERE " + where.join(" AND ") : "", args };
}
