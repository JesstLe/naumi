import { z } from "zod";
import { billingAuthorize,billingJson } from "@/lib/billing/access";
import { supplierLedger } from "@/lib/supplier-cost/runtime";
import { updateAccount } from "@/lib/supplier-cost/admin";
import { fxSchema,policySchema } from "@/lib/supplier-cost/policy";
export const runtime="nodejs",dynamic="force-dynamic";
const command=z.discriminatedUnion("action",[
  z.strictObject({action:z.literal("account"),id:z.string().regex(/^[a-f0-9]{64}$/),fx:fxSchema.nullable(),policy:policySchema,usageEnabled:z.boolean()}),
  z.strictObject({action:z.literal("retry"),key:z.string().min(1).max(300)}),
  z.strictObject({action:z.literal("usage"),account:z.string().regex(/^[a-f0-9]{64}$/),start:z.iso.datetime(),end:z.iso.datetime()}),
  z.strictObject({action:z.literal("variable"),id:z.uuid(),operation:z.string().min(1).max(200),amountCnyMicros:z.string().regex(/^(0|[1-9]\d{0,20})$/),label:z.string().trim().min(1).max(100),evidence:z.string().trim().min(3).max(500)}),
]);
export async function POST(request:Request){const auth=await billingAuthorize(request,true);if(auth instanceof Response)return auth;
  try{const input=command.parse(await request.json()),ledger=supplierLedger();
    if(input.action==='account')return billingJson(await updateAccount(ledger,input,auth.actor));
    if(input.action==='usage'){const diff=Date.parse(input.end)-Date.parse(input.start);if(diff<=0||diff>31*86400000)throw new Error('range');const account=(await ledger.pool.query("SELECT protocol,credential_ref FROM app_supplier_accounts WHERE id=$1",[input.account])).rows[0];if(!['apimart-images','apimart'].includes(account?.protocol)||!account.credential_ref)throw new Error('account');await ledger.enqueue(`usage:${input.account}:${input.start}:${input.end}`,'usage',{start:input.start,end:input.end},input.account);return billingJson({queued:true});}
    if(input.action==='retry'){await ledger.transaction(async tx=>{const r=await tx.query("UPDATE app_supplier_cost_jobs SET state='queued',attempts=0,due_at=now(),last_error=NULL WHERE key=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING key",[input.key]);if(!r.rowCount)throw new Error('busy');await tx.query("INSERT INTO app_supplier_admin_audit(id,actor,action,target,changes) VALUES(gen_random_uuid(),$1,'cost-retry',$2,'{}')",[auth.actor,input.key]);});return billingJson({queued:true});}
    await ledger.transaction(async tx=>{const exists=(await tx.query("SELECT 1 FROM app_supplier_calls WHERE operation_id=$1 LIMIT 1",[input.operation])).rowCount;if(!exists)throw new Error('operation');await tx.query("INSERT INTO app_supplier_variable_costs(id,operation_id,amount_cny_micros,label,evidence,actor) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",[input.id,input.operation,input.amountCnyMicros,input.label,input.evidence,auth.actor]);});return billingJson({saved:true});
  }catch{return billingJson({error:"参数无效、原账户未配置或任务正在处理"},400)}
}
