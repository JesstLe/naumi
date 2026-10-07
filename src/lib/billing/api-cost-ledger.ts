import "server-only";
import type { BillingQuote, BillingResult, Tx } from "./types";
import { procurementCost } from "./api-cost";

/** Trusted receipts only. Client-provided apiCost is always replaced. A task total
 * already contains its inputs and outputs; usage is used only without that total. */
export async function operationApiCost(tx: Tx, operationId: string, email: string, q: BillingQuote, result: BillingResult): Promise<BillingResult["apiCost"]> {
  const pending = (ids: string[] = []): BillingResult["apiCost"] => ({status:"pending",source:"task-cost-pending",callIds:ids});
  if (!q.imagePreset) return pending();
  const rows = (await tx.query(`SELECT * FROM app_supplier_calls WHERE operation_id=$1 AND user_email=$2
    AND parameters->>'modelVersion'=$3 AND parameters->>'factorBps'=$4 ORDER BY started_at,id`,
    [operationId,email,String(q.modelVersion),String(q.imagePreset.factorBps)])).rows;
  // Failed/undelivered attempts remain platform costs. No retry surcharge is
  // silently passed on; one stable supplier task per delivered billing unit.
  const failedIds=result.items.filter(i=>i.state==="failed").map(i=>i.id);
  const completed = rows.filter(r => ["completed","success","succeeded"].includes(r.state) && !failedIds.some(id=>r.billing_unit_id===id||r.billing_unit_id?.startsWith(id+":")));
  const ids=completed.map(r=>r.id), successes=result.items.filter(i=>i.state==="succeeded").length;
  if (!successes) return {status:"reported",numerator:"0",denominator:"1",source:"no-chargeable-delivery",callIds:ids};
  if (!completed.length || completed.some(r=>!r.billing_unit_id || !Number.isInteger(r.parameters?.acceptedOutputs) || r.parameters.acceptedOutputs!==Number(r.delivered)) || new Set(completed.map(r=>r.billing_unit_id)).size!==completed.length || completed.filter(r=>!r.parameters.preparation).reduce((n,r)=>n+Number(r.parameters.acceptedOutputs),0)!==successes) return pending(ids);
  let numerator=BigInt(0), denominator=BigInt(1), estimated=false;
  for (const r of completed) {
    let cost: {numerator:bigint;denominator:bigint}|null=null;
    if (["reported","reconciled"].includes(r.cost_status) && r.amount_micros!=null) {
      if (r.currency==="CNY" || r.amount_micros==="0") cost={numerator:BigInt(r.amount_micros),denominator:BigInt(1)};
      else if (r.currency==="USD" && q.imagePreset.fx) cost={numerator:BigInt(r.amount_micros)*BigInt(q.imagePreset.fx.rateMicros),denominator:BigInt(1000000)};
      else return pending(ids);
    } else {
      const price=r.procurement;
      // Never substitute guessed output count or template usage for actual usage.
      if (price && (price.basis!=="tokens" || r.usage)) {
        const u=r.usage, details=u?.prompt_tokens_details||u?.input_tokens_details;
        const usage=u?{inputTokens:u.prompt_tokens??u.input_tokens,outputTokens:u.completion_tokens??u.output_tokens,cachedInputTokens:details?.cached_tokens,imageInputTokens:details?.image_tokens}:undefined;
        // A priced token dimension must be present, not silently assumed zero.
        const complete=price.basis!=="tokens" || (price.cachedInputMicrosPerMillion===undefined||details?.cached_tokens!==undefined) && (price.imageInputMicrosPerMillion===undefined||details?.image_tokens!==undefined);
        if(complete)cost=procurementCost(price,usage,Number(r.delivered),q.imagePreset.fx?.rateMicros);
      }
      estimated=true;
    }
    if (!cost) return pending(ids);
    numerator=numerator*cost.denominator+cost.numerator*denominator;
    denominator*=cost.denominator;
    const gcd=(a:bigint,b:bigint):bigint=>b?gcd(b,a%b):a, g=gcd(numerator,denominator);
    if(g){numerator/=g;denominator/=g;}
  }
  estimated ||= q.imagePreset.fx?.basis==="budget";
  return {status:estimated?"estimated":"reported",numerator:numerator.toString(),denominator:denominator.toString(),source:estimated?"usage-price-snapshot-or-budget-fx":"supplier-task-total",callIds:ids};
}
